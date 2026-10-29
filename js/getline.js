// getline.js -- Source-shaped TTY line input and extended-command completion.
// C refs: win/tty/getline.c tty_getlin(), hooked_tty_getlin(),
// ext_cmd_getlin_hook(), and tty_get_ext_cmd(), together with the
// win/tty/topl.c putsyms(), addtopl(), show_topl(), and
// tty_clear_nhwindow(WIN_MESSAGE) painting they drive.
//
// getline.c defines NEWAUTOCOMP for every build except MACOS9, so the
// autocompletion arms below are the ones that write the expansion ahead of an
// unmoved cursor and erase a stale expansion in place.

import { BUFSZ, COLNO } from './const.js';
import {
    ECM_EXACTMATCH,
    ECM_IGNOREAC,
    ECM_NOFLAGS,
    extcmdlist,
} from './extcmdlist_data.js';
import {
    extcmd_initiator,
    extcmds_match,
} from './cmd.js';
import { flush_screen } from './display.js';
import { game } from './gstate.js';
import { mungspaces, visctrl } from './hacklib.js';
import { nhgetch } from './input.js';
import {
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    dismissPendingTtyMessage,
    ttyPline,
} from './tty_message.js';
import {
    putsyms,
    remember_topl,
    show_topl,
    topl_putsym,
    tty_doprev_message,
} from './topl.js';

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
// wrapped prompt.  Production callers do not run past column 79.
// Porting the second cl_end() belongs with tty_clear_nhwindow(WIN_MESSAGE)'s
// docorner() repair: both are wrapped-prompt
// rendering and neither can be validated against a C recording without the
// other.
// C ref: win/tty/wintty.c tty_clear_nhwindow(WIN_MESSAGE).  home() and
// cl_end() clear the top row; docorner() repairs the map rows a wrapped
// prompt overwrote, which only a prompt longer than one terminal row reaches.
function clearMessageWindow(display) {
    const lastRow = Math.max(0, display.cursorRow);
    for (let row = 0; row <= lastRow && row < display.rows; ++row)
        display.clearRow(row);
    display.setCursor(0, 0);
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

    // C ttyDisplay->inread counts prompt readers, not menus. The tty owner
    // initializes it to zero; retain any surrounding reader's depth.
    display.inread = (display.inread ?? 0) + 1;
    let text = '';
    let pos = 0;
    let doprev = false;
    try {
        // custompline(OVERRIDE_MSGTYPE | SUPPRESS_HISTORY, "%s ", query).  vpline()
        // flushes the map first; remember_topl() moves the old line into
        // history before show_topl() repaints.
        if (state.u?.ux) await flush_screen(1);
        remember_topl(state);
        show_topl(`${query} `, state);
        state._ttyToplines = `${query} `;
        state._pending_message = '';
        // addtopl() leaves ttyDisplay->toplin at TOPLINE_NEED_MORE.
        display.toplin = TOPLINE_NEED_MORE;
        state._ttyPreviousMessage = `${query} `;

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
                    putsyms(`${query} `, state);
                    continue;
                }
                text = '\x1B';
                break;
            }
            if (c === CTRL_P) {
                const mode = state.iflags?.prevmsg_window ?? 's';
                if (mode === 's' || (mode === 'c' && !doprev)) {
                    const savedInread = display.inread;
                    display.inread = 0;
                    if (!doprev) await tty_doprev_message(state);
                    await tty_doprev_message(state);
                    display.inread = savedInread;
                    doprev = true;
                    continue;
                }
                const savedInread = display.inread;
                display.inread = 0;
                await tty_doprev_message(state);
                display.inread = savedInread;
                clearMessageWindow(display);
                state._ttyToplines = `${query} ${text}`;
                display.toplines = state._ttyToplines;
                show_topl(state._ttyToplines, state);
                pos = Math.min(pos, text.length);
                display.setCursor(
                    Math.min(display.cols - 1, query.length + 1 + pos), 0,
                );
                text = text.slice(0, pos);
                doprev = false;
                continue;
            }
            if (doprev) {
                clearMessageWindow(display);
                state._ttyToplines = `${query} ${text}`;
                display.toplines = state._ttyToplines;
                show_topl(state._ttyToplines, state);
                display.setCursor(
                    Math.min(display.cols - 1, query.length + 1 + pos), 0,
                );
                text = text.slice(0, pos);
                doprev = false;
                continue;
            }
            if (c === ERASE_CHAR || c === BACKSPACE) {
                if (pos) {
                    --pos;
                    topl_putsym('\b', state);
                    // Blank whatever the hook painted past the new insertion
                    // point, then step the cursor back over those blanks.
                    const painted = text.length - pos;
                    for (let i = 0; i < painted; ++i) topl_putsym(' ', state);
                    for (let i = 0; i < painted; ++i) topl_putsym('\b', state);
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
                putsyms(text.slice(pos), state);
                ++pos;
                const expansion = hook ? hook(text) : null;
                if (expansion !== null) {
                    text = expansion;
                    putsyms(text.slice(pos), state);
                    // Pointer and cursor left where they were.
                    for (let i = pos; i < text.length; ++i)
                        topl_putsym('\b', state);
                } else if (priorEnd > pos) {
                    // Erase the rest of the prior guess.
                    for (let i = pos; i < priorEnd; ++i)
                        topl_putsym(' ', state);
                    for (let i = pos; i < priorEnd; ++i)
                        topl_putsym('\b', state);
                }
                continue;
            }
            if (c === KILL_CHAR || c === 0x7F) {
                // This test comes last because '@' can be the kill character.
                for (let i = pos; i < text.length; ++i) topl_putsym(' ', state);
                for (pos = text.length; pos > 0; --pos)
                    putsyms('\b \b', state);
                text = '';
            }
            // tty_nhbell() for anything else.
        }

    } finally {
        // getline.c214 decrements before clearing WIN_MESSAGE. Also release
        // the counter on a port-side refusal so later segments cannot inherit it.
        --display.inread;
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
    // Importing cmd.js statically would close the existing cmd.js -> getline.js
    // cycle, so resolve the already-initialized command module at this call.
    if (state.iflags?.extmenu) {
        const { extcmd_via_menu } = await import('./cmd.js');
        return extcmd_via_menu(state);
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
