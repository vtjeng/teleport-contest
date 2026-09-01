// getline.js -- Source-shaped TTY line input and extended-command completion.
// C refs: win/tty/getline.c tty_getlin(), hooked_tty_getlin(),
// ext_cmd_getlin_hook(), and tty_get_ext_cmd(), together with the
// win/tty/topl.c putsyms(), addtopl(), show_topl(), and
// tty_clear_nhwindow(WIN_MESSAGE) painting they drive.
//
// win/tty/topl.c tty_yn_function() lives here as well. It is the port's other
// top-line prompt reader, and it shares every painting helper below with
// hooked_tty_getlin(): the same WIN_STOP handling, the same
// remember_topl()/show_topl() pair for a SUPPRESS_HISTORY prompt, and the same
// topl_putsym() cursor model. Splitting the two would put one of them behind
// an import cycle for no gain.
//
// getline.c defines NEWAUTOCOMP for every build except MACOS9, so the
// autocompletion arms below are the ones that write the expansion ahead of an
// unmoved cursor and erase a stale expansion in place.

import { BUFSZ, COLNO, quitchars } from './const.js';
import {
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NOFLAGS,
    extcmdlist,
} from './extcmdlist_data.js';
import {
    extcmd_initiator,
    extcmds_match,
    key2txt,
    readchar,
} from './cmd.js';
import { flush_screen } from './display.js';
import { game } from './gstate.js';
import { mungspaces, visctrl } from './hacklib.js';
import { nhgetch } from './input.js';
import { NO_COLOR } from './terminal.js';
import {
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    TOPLINE_NON_EMPTY,
    dismissPendingTtyMessage,
    ttyPline,
} from './tty_message.js';

// A getlin path this port has not reached yet.
export class UnsupportedGetlinBoundaryError extends Error {
    constructor(reason) {
        super(`unsupported getlin input: ${reason}`);
        this.name = 'UnsupportedGetlinBoundaryError';
        this.reason = reason;
    }
}

// sys/share/unixtty.c gettty() copies these from the terminal.  Recorder
// patch 006 synthesizes the conventional pair when there is no controlling
// tty, so a recording always sees DEL for erase and ^U for kill.
const ERASE_CHAR = 0x7F;
const KILL_CHAR = 0x15;
const BACKSPACE = 0x08;
const ESC = 0x1B;
// cmd.c:452 `return (char) ch;` makes a 0xFF byte read back as -1, which
// getline.c:85 tests as EOF. tty_nhgetch() never delivers EOF itself, so this
// signed cast is the only route to that arm.
const EOF_BYTE = 0xFF;
const CTRL_P = 0x10;

// C ref: win/tty/getline.c's file-static suppress_history, which the two
// public entry points set before calling hooked_tty_getlin().
let suppress_history = false;

// C ref: win/tty/topl.c topl_putsym() at 305.  Backspace steps the cursor
// back, wrapping onto the previous row's last written column; an ordinary byte
// is written where the cursor stands after wrapping at the terminal's final
// column, which topl_putsym() keeps unused.
//
// The newline arm below is incomplete on purpose.  C runs cl_end() twice: once
// at topl.c:322 on the row it leaves, and once at topl.c:340, where
// `if (cw->curx == 0) cl_end()` wipes the whole row it moved onto.  Only the
// first is ported, so the port leaves the old map row visible to the right of a
// wrapped prompt.  Nothing reaches the arm yet, because the only caller that
// wraps is the default arm below and no ported prompt runs past column 79.
// Porting the second cl_end() belongs with tty_clear_nhwindow(WIN_MESSAGE)'s
// docorner() repair, which ROADMAP.md records: both are wrapped-prompt
// rendering and neither can be validated against a C recording without the
// other.
function topl_putsym(display, ch) {
    if (ch === '\b') {
        if (display.cursorCol === 0 && display.cursorRow > 0) {
            display.setCursor(display.cols - 1, display.cursorRow - 1);
        }
        if (display.cursorCol > 0) {
            display.setCursor(display.cursorCol - 1, display.cursorRow);
        }
        return;
    }
    if (ch === '\n') {
        display.clearToEol();
        display.setCursor(0, display.cursorRow + 1);
        return;
    }
    if (display.cursorCol === display.cols - 1) topl_putsym(display, '\n');
    display.setCell(display.cursorCol, display.cursorRow, ch, NO_COLOR, 0);
    display.setCursor(display.cursorCol + 1, display.cursorRow);
}

// C ref: win/tty/topl.c putsyms().
function putsyms(display, text) {
    for (const ch of text) topl_putsym(display, ch);
}

// C ref: win/tty/wintty.c tty_clear_nhwindow(WIN_MESSAGE).  home() and
// cl_end() clear the top row; docorner() repairs the map rows a wrapped
// prompt overwrote, which only a prompt longer than one terminal row reaches.
function clearMessageWindow(display) {
    const lastRow = Math.max(0, display.cursorRow);
    for (let row = 0; row <= lastRow && row < display.rows; ++row)
        display.clearRow(row);
    display.setCursor(0, 0);
}

// C ref: win/tty/topl.c show_topl(), which pline.c putmesg() reaches because
// custompline()'s SUPPRESS_HISTORY becomes ATR_NOHISTORY and win/tty/wintty.c
// advertises WC2_SUPPRESS_HIST: home(); cl_end(); addtopl(str).
function show_topl(display, text) {
    display.clearRow(0);
    display.setCursor(0, 0);
    putsyms(display, text);
}

// C ref: win/tty/getline.c hooked_tty_getlin().  Returns the buffer as C
// leaves it: the typed text, or "\x1b" when Escape cancels an empty line.
//
// `text` holds obufp's contents up to its terminator and `pos` holds
// bufp - obufp.  NEWAUTOCOMP's painting needs both, because the hook rewrites
// the whole buffer while leaving the insertion point where it was.  `hook`
// returns the expansion, or null when nothing matched, in place of the boolean
// the C hook returns after rewriting the buffer in place.
async function hooked_tty_getlin(query, hook, state) {
    const display = state.nhDisplay;
    if (!display) throw new Error('getlin requires an initialized display');

    if (display.toplin === TOPLINE_NEED_MORE && !state._ttyMessageStopped)
        await dismissPendingTtyMessage(state);
    // getline.c:55 clears cw->flags' WIN_STOP bit, which this line ports.
    state._ttyMessageStopped = false;
    // getline.c:56 then assigns ttyDisplay->toplin = TOPLINE_SPECIAL_PROMPT,
    // which this port does not model: js/tty_message.js carries only
    // TOPLINE_EMPTY and TOPLINE_NEED_MORE, and the field keeps whatever the
    // previous message left until show_topl() below repaints.  Both readers of
    // that state, topl.c:139 and topl.c:163, are gated on ttyDisplay->cury,
    // so they act only once the top line has wrapped onto a second row.  No
    // ported prompt wraps, so the omission is unobservable today; a wrapped
    // prompt has to bring the state with it.

    // custompline(OVERRIDE_MSGTYPE | SUPPRESS_HISTORY, "%s ", query).  vpline()
    // flushes the map first; remember_topl() then moves whatever the top line
    // held into history and empties gt.toplines before show_topl() repaints.
    if (state.u?.ux) await flush_screen(1);
    state._ttyToplines = '';
    show_topl(display, `${query} `);
    state._pending_message = '';
    // addtopl() leaves ttyDisplay->toplin at TOPLINE_NEED_MORE.
    display.toplin = TOPLINE_NEED_MORE;
    state._ttyPreviousMessage = `${query} `;

    let text = '';
    let pos = 0;
    for (;;) {
        // Strcat(strcat(strcpy(gt.toplines, query), " "), obufp) refreshes the
        // recall copy of the prompt before every keystroke.
        state._ttyToplines = `${query} ${text}`;
        display.toplines = state._ttyToplines;
        const c = (await nhgetch(state)) & 0xFF;

        // pgetchar() reaches tty_nhgetch(), which maps NUL to Escape.
        //
        // 0xFF joins them by accident, which cmd.c:452 preserves: pgetchar()
        // ends `return (char) ch;`, and char is signed here, so the 255 that
        // getchar() returns becomes -1. getline.c:85 tests `c == EOF`, so the
        // line is cancelled. tty_nhgetch() cannot deliver EOF itself, mapping
        // both NUL and EOF to Escape, so the signed cast is the only route to
        // this arm.
        if (c === 0 || c === ESC || c === EOF_BYTE) {
            if (c === EOF_BYTE) state.iflags.term_gone = 1;
            // getline.c:88 gates the restart on `c == '\033'` alone, so EOF
            // never restarts: it always takes the cancel arm below, even over
            // existing text, where Escape would clear and redraw the prompt.
            // NUL still restarts, because tty_nhgetch() has already turned it
            // into Escape by the time this test runs.
            if (c !== EOF_BYTE && text) {
                // Escape over existing text restarts the prompt and then falls
                // through the remaining tests, every one of which declines it.
                text = '';
                pos = 0;
                clearMessageWindow(display);
                putsyms(display, `${query} `);
                continue;
            }
            text = '\x1B';
            break;
        }
        if (c === CTRL_P) {
            // ctrl-P replays message history through tty_doprev_message(),
            // which nothing in this port owns yet.
            throw new UnsupportedGetlinBoundaryError(
                'ctrl-P recalls message history at a getlin prompt',
            );
        }
        if (c === ERASE_CHAR || c === BACKSPACE) {
            if (pos) {
                --pos;
                topl_putsym(display, '\b');
                // Blank whatever the hook painted past the new insertion
                // point, then step the cursor back over those blanks.
                const painted = text.length - pos;
                for (let i = 0; i < painted; ++i) topl_putsym(display, ' ');
                for (let i = 0; i < painted; ++i) topl_putsym(display, '\b');
                text = text.slice(0, pos);
            }
            // tty_nhbell() otherwise, which writes no cell.
            continue;
        }
        if (c === 10 || c === 13) break;
        if (c >= 0x20 && c !== 0x7F && pos < BUFSZ - 1 && pos < COLNO) {
            // char *i = eos(bufp) records how far the previous guess reached,
            // before *bufp = c truncates the buffer at the insertion point.
            const priorEnd = text.length;
            text = text.slice(0, pos) + String.fromCharCode(c);
            putsyms(display, text.slice(pos));
            ++pos;
            const expansion = hook ? hook(text) : null;
            if (expansion !== null) {
                text = expansion;
                putsyms(display, text.slice(pos));
                // Pointer and cursor left where they were.
                for (let i = pos; i < text.length; ++i)
                    topl_putsym(display, '\b');
            } else if (priorEnd > pos) {
                // Erase the rest of the prior guess.
                for (let i = pos; i < priorEnd; ++i)
                    topl_putsym(display, ' ');
                for (let i = pos; i < priorEnd; ++i)
                    topl_putsym(display, '\b');
            }
            continue;
        }
        if (c === KILL_CHAR || c === 0x7F) {
            // This test comes last because '@' can be the kill character.
            for (let i = pos; i < text.length; ++i) topl_putsym(display, ' ');
            for (pos = text.length; pos > 0; --pos)
                putsyms(display, '\b \b');
            text = '';
        }
        // tty_nhbell() for anything else.
    }

    // ttyDisplay->toplin = TOPLINE_NON_EMPTY, then
    // clear_nhwindow(WIN_MESSAGE) takes the prompt off the screen.
    clearMessageWindow(display);
    display.toplin = TOPLINE_EMPTY;
    state._pending_message = '';
    if (suppress_history) {
        // Keep the query and answer out of message recall.
        state._ttyToplines = '';
        display.toplines = '';
    }
    display.topMessage = state._ttyToplines;
    return text;
}

// C ref: win/tty/topl.c tty_yn_function() (363-550).  Two arms.  With
// `resp == (char *) 0` any single keystroke is accepted and returned: the
// prompt is written, one key is read, and the function jumps straight to
// clean_up.  With a response set, the prompt names the allowed keys and their
// default and a loop rejects everything else.
//
// Three parts of the restricted arm have no ported reader and stop instead,
// each where C reads them out of `resp` and so before the prompt paints:
//   a set holding '#', which turns digits into a count in yn_number;
//   a set holding an uppercase letter, which suppresses lowc() on the answer;
//   a set holding <esc>, whose tail names responses the prompt hides.
// The ctrl-P reprompt inside the loop stops as well, for the same reason
// hooked_tty_getlin()'s does: tty_doprev_message() has no port.
//
// `def` is unread on the unrestricted arm; C names it because clean_up is
// shared, and on the restricted arm quitchars and Escape resolve to it.
export async function tty_yn_function(query, resp, def, state = game) {
    const display = state.nhDisplay;
    if (!display) throw new Error('a yn prompt requires an initialized display');

    // yn_number is only read back by the restricted arm's '#' count handling,
    // which is refused below, so the port keeps no field for it.
    if (display.toplin === TOPLINE_NEED_MORE && !state._ttyMessageStopped)
        await dismissPendingTtyMessage(state);
    // topl.c:391 clears WIN_STOP and WIN_NOSTOP whether or not more() ran.
    state._ttyMessageStopped = false;
    // topl.c:392 then assigns ttyDisplay->toplin = TOPLINE_SPECIAL_PROMPT and
    // topl.c:393 raises ttyDisplay->inread.  Neither is modeled, for the same
    // reason hooked_tty_getlin() gives above: the state is read only once the
    // top line has wrapped, and inread only gates tty_doprev_message().

    // Both arms end in the same
    // custompline(OVERRIDE_MSGTYPE | SUPPRESS_HISTORY, "%s", prompt); they
    // differ only in the prompt they build for it.  The restricted arm's
    // trailing space is already in the string, "in case of reprompt".
    let prompt;
    if (resp !== null) {
        if (resp.includes('#')) {
            throw new UnsupportedGetlinBoundaryError(
                'tty_yn_function() counting digits into yn_number',
            );
        }
        /* normally we force lowercase, but if any uppercase letters
           are present in the allowed response, preserve case */
        if (/[A-Z]/u.test(resp)) {
            throw new UnsupportedGetlinBoundaryError(
                'tty_yn_function() preserving case in the answer',
            );
        }
        // C ref: topl.c:412-413. Characters after the first ESC in resp are
        // accepted but not shown in the prompt bracket. The displayed portion
        // is everything before the ESC; the full resp (without the ESC itself)
        // is used for key matching.
        let displayResp = resp;
        if (resp.includes('\x1B')) {
            const escIdx = resp.indexOf('\x1B');
            displayResp = resp.slice(0, escIdx);
            // Replace resp with visible + hidden (without the ESC separator)
            // so the matching loop below accepts hidden characters too.
            resp = resp.slice(0, escIdx) + resp.slice(escIdx + 1);
        }
        // C ref: topl.c:415 `if (def)` tests a char, so '\0' (0) is falsy
        // and suppresses the default display.  In JS the parameter arrives
        // as a one-character string, so '\0' is truthy; test the code point.
        const showDef = def && def.charCodeAt(0) !== 0;
        prompt = `${query} [${displayResp}]${showDef ? ` (${def})` : ''} `;
    } else {
        prompt = `${query} `;
    }
    if (state.u?.ux && !state._bonesRestorePrompt) await flush_screen(1);
    // remember_topl() moves whatever the top line held into history and
    // empties gt.toplines; show_topl() then repaints from column zero.
    state._ttyToplines = '';
    show_topl(display, prompt);
    state._pending_message = '';
    // addtopl() leaves ttyDisplay->toplin at TOPLINE_NEED_MORE.
    display.toplin = TOPLINE_NEED_MORE;
    state._ttyPreviousMessage = prompt;

    // Every key below is the byte readchar() returns, as on the unrestricted
    // arm; `def` arrives as the one-character string its callers spell.
    const defByte = def ? def.charCodeAt(0) : 0;
    let q;
    if (resp === null) {
        q = await readchar(state);
    } else {
        do { /* loop until we get valid input */
            q = await readchar(state);
            /* !preserve_case */
            if (q >= 0x41 && q <= 0x5A) q |= 0x20; /* lowc() */
            if (q === CTRL_P) {
                // Both ctrl-P arms replay message history through
                // tty_doprev_message() and then repaint the prompt; neither is
                // ported.  `doprev` is only ever set inside them, so the
                // `else if (doprev)` reprompt below cannot be reached either.
                throw new UnsupportedGetlinBoundaryError(
                    'ctrl-P recalls message history at a yn prompt',
                );
            }
            if (q === ESC) {
                if (resp.includes('q')) q = 'q'.charCodeAt(0);
                else if (resp.includes('n')) q = 'n'.charCodeAt(0);
                else q = defByte;
                break;
            } else if (quitchars.includes(String.fromCharCode(q))) {
                // decl.c:96 quitchars[] is " \r\n\033". Escape is tested by
                // the arm above, so only space, carriage return and line feed
                // reach this one.
                q = defByte;
                break;
            }
            // digit_ok is `allow_num && digit(q)`, and allow_num is false on
            // every set that reaches here, so it and the '#' count arm below
            // it are both constantly false: a '#' answered to a set without
            // '#' fails this test and rings instead.
            if (!resp.includes(String.fromCharCode(q))) {
                // tty_nhbell(), which writes no cell and moves no cursor.
                q = 0;
            }
        } while (!q);
    }

    // clean_up: gt.toplines is rewritten as the prompt followed by the key,
    // so message recall shows the answered prompt rather than the bare query.
    state._ttyToplines = `${prompt}${key2txt(q)}`;
    display.toplines = state._ttyToplines;
    display.topMessage = state._ttyToplines;
    // The answer itself is not drawn: C's `addtopl(rtmp)` at topl.c:541 is
    // commented out in favour of rewriting gt.toplines.  The prompt stays on
    // the physical line, and js/display.js _buildScreenOutput() repaints row 0
    // from _pending_message, so the restricted arm has to leave it there or
    // the next flush erases an answered prompt C keeps.  TOPLINE_NON_EMPTY is
    // what stops the next message treating that line as one awaiting
    // --More--, exactly as topl.c update_topl():262 does.
    //
    // C keeps the unrestricted arm's prompt on the line in the same way, and
    // the port does not: getdir() clears it immediately, and the eat prompt's
    // recorded sessions and its two focused tests are pinned to the '' this
    // arm has always written.  Correcting that belongs with whichever slice
    // next owns invent.c getobj().  A fresh differential now measures the
    // difference rather than only predicting it: the QUALITY.json deferral
    // getobj-prompt-leaves-the-top-line-in-c-only carries the case, a take-off
    // answered at the prompt whose delay lets runmode_delay_output() flush an
    // animation frame while C is still showing the query.
    if (resp !== null) state._pending_message = prompt;
    display.toplin = TOPLINE_NON_EMPTY;
    // `if (wins[WIN_MESSAGE]->cury) tty_clear_nhwindow(WIN_MESSAGE)` closes
    // clean_up.  cury is nonzero only for a prompt that wrapped onto a second
    // row, and no ported query is long enough, so that arm has no owner here.
    return q;
}

// C ref: win/tty/getline.c tty_getlin().  Returns the answer, or "\x1b" when
// Escape cancelled an empty line, exactly as C leaves bufp.
export async function tty_getlin(query, state = game) {
    suppress_history = false;
    return hooked_tty_getlin(query, null, state);
}

// C ref: win/tty/getline.c ext_cmd_getlin_hook().  A prefix that identifies
// exactly one autocompleting command expands to that command's whole name.
function ext_cmd_getlin_hook(base, state) {
    const matches = extcmds_match(base, ECM_NOFLAGS, state);
    return matches.length === 1 ? extcmdlist[matches[0]].ef_txt : null;
}

// C ref: win/tty/getline.c tty_get_ext_cmd().  Returns the extcmdlist[] index
// of the command the player named, or -1 for a cancelled or unknown one.
export async function tty_get_ext_cmd(state = game) {
    // C's first statement is `if (iflags.extmenu) return extcmd_via_menu();`.
    // That function is not ported, so the option has to stop here rather than
    // fall through to the typed prompt, which is a different command entirely.
    // The test keeps C's position, before anything paints.
    if (state.iflags?.extmenu) {
        throw new UnsupportedGetlinBoundaryError('extcmd_via_menu()');
    }
    const extcmdChar = extcmd_initiator(state);

    suppress_history = true;
    // The prompt is the raw initiator byte; only the unknown-command message
    // below renders it through visctrl(). gi.in_doagain is always false --
    // cmd.c do_repeat() is its only writer and #repeat is unported -- so the
    // completion hook is always supplied.
    const buf = mungspaces(await hooked_tty_getlin(
        String.fromCharCode(extcmdChar),
        (base) => ext_cmd_getlin_hook(base, state),
        state,
    ));

    if (!buf || buf[0] === '\x1B') return -1;
    // ECM_IGNOREAC | ECM_EXACTMATCH: the typed text has to name one command
    // exactly, whether or not that command autocompletes.
    const matches = extcmds_match(buf, ECM_IGNOREAC | ECM_EXACTMATCH, state);
    if (matches.length !== 1) {
        await ttyPline(
            `${visctrl(extcmdChar)}${buf.slice(0, 60)}`
            + ': unknown extended command.',
            state,
        );
        return -1;
    }
    return matches[0];
}
