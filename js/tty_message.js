// tty_message.js -- Source-shaped message normalization and TTY display.
// C refs: pline.c vpline(), custompline(), urgent_pline(), and Norep();
// win/tty/topl.c update_topl(), more(), and xwaitforspace(); and
// win/tty/wintty.c tty_display_nhwindow() and tty_clear_nhwindow().

import { game } from './gstate.js';
import {
    MSGTYP_NOREP,
    MSGTYP_NORMAL,
    MSGTYP_NOSHOW,
    MSGTYP_STOP,
    NO_CURS_ON_U,
    OVERRIDE_MSGTYPE,
    PICK_NONE,
    PICK_ONE,
    PLINE_NOREPEAT,
    PLINE_SPEECH,
    PLINE_VERBALIZE,
    PLNMSG_UNKNOWN,
    SUPPRESS_HISTORY,
    URGENT_MESSAGE,
    WIN_NOSTOP,
} from './const.js';
import { docorner, flush_screen } from './display.js';
import {
    bytesText,
    textBytes,
} from './hacklib.js';
import { nhgetch } from './input.js';
import { emitGlyphUpdateNotices } from './startup_a11y.js';
import { YOU_BUF_FORMATS } from './you_buf_messages_data.js';
import { impossible_printer, youFeel, youHear, youSee } from './pline.js';
import { ATR_NONE, NO_COLOR } from './terminal.js';
import { vision_recalc } from './vision.js';
import { nomux_putch_byte } from './termcap.js';
import { msgtype_type } from './options.js';
import { sound_speak } from './sounds.js';
import {
    addtoplRows,
    fitsOnTtyTopline,
    more,
    remember_topl,
    setToplinesDirectly,
    show_topl,
    toplineRows,
    update_topl,
    writeRecorderTtyLine,
} from './topl.js';

// C ref: win/tty/wintty.c defmorestr[], the prompt both more() and dmore()
// print when no window supplies its own.
export const MORE_PROMPT = '--More--';
// C ref: include/wintty.h:85-88, which names four ttyDisplay->toplin states.
// Three are ported. C assigns TOPLINE_SPECIAL_PROMPT in hooked_tty_getlin() at
// getline.c:56, in tty_yn_function() at topl.c:392, and on tty_wait_synch()'s
// interrupted-read arm at wintty.c:3639; the port assigns it nowhere. The only
// reads of that constant are topl.c:139, 155 and 163, and every one is gated
// on a nonzero ttyDisplay->cury, so it becomes distinguishable from
// TOPLINE_NON_EMPTY only once the top line has wrapped onto a second row. No
// ported prompt wraps; js/getline.js hooked_tty_getlin() records what the
// wrapped case would need.
export const TOPLINE_EMPTY = 0;
export const TOPLINE_NEED_MORE = 1;
// tty_yn_function()'s clean_up leaves this one behind (topl.c:543). What reads
// it is clearTtyMessageWindow() below, whose C original repaints only when the
// state is not TOPLINE_EMPTY -- which is how getdir()'s clear_nhwindow() takes
// an answered prompt off the top line.
export const TOPLINE_NON_EMPTY = 2;

function ttyByteText(value) {
    // topl.c keeps the raw byte string for wrapping and message history.
    // topl_putsym() moves the cursor for '\b' and '\n' and, for any other
    // byte, advances it and putchar()s the byte, which recorder patch 006's
    // nomux_putch() leaves out of the shadow grid when it is a control byte
    // or, as a signed char, a high byte (nomux_putch_byte()). NUL is an
    // internal skipped-byte marker: it occupies one logical byte cell but is
    // not a wrapping space.
    return textBytes(value).map((byte) => (
        byte === 0x08 || byte === 0x0A || nomux_putch_byte(byte) !== null
            ? String.fromCharCode(byte) : '\0'
    )).join('');
}

// C ref: pline.c vpline()'s modest-overflow arm. The formatted byte string is
// reduced to BUFSZ - 1 bytes once, before MSGTYPE lookup, TTY rendering, and
// gp.prevmsg storage. Bytes 249 through 251 become an ellipsis and bytes 252
// through 254 preserve the original final three bytes.
function normalizeVplineMessage(value) {
    const bytes = textBytes(value);
    if (bytes.length <= 255) return bytesText(bytes);
    return bytesText([
        ...bytes.slice(0, 249),
        0x2E, 0x2E, 0x2E,
        ...bytes.slice(-3),
    ]);
}

function pendingTtyMessageLayout(state) {
    const display = state.nhDisplay;
    const lines = toplineRows(state._pending_message, display.cols, state);
    let promptRow = lines.length - 1;
    let promptColumn = lines.at(-1).length;
    if (promptColumn >= display.cols - MORE_PROMPT.length) {
        ++promptRow;
        promptColumn = 0;
    }
    return { display, lines, promptRow, promptColumn };
}

// Write the pending message and its source-owned More marker without waiting.
// C's tty_wait_synch() map-window arm refreshes the map and leaves this marker
// for the next tty_yn_function() read; it does not call getret().
function writePendingTtyMessagePrompt(state, layout, promptAttr = ATR_NONE) {
    const { display, lines, promptRow, promptColumn } = layout;
    for (let row = 0; row < lines.length; ++row)
        writeRecorderTtyLine(display, row, lines[row]);
    if (promptRow > lines.length - 1) {
        // topl_putsym('\n') clears the new physical row at cursor column 0
        // after cl_end() clears the preceding row's tail. The wrapped More
        // marker must replace that row before it can cover a stale map cell.
        display.setCursor(0, promptRow);
        display.clearToEol();
    }
    if (state._ttyMixedFirstCell)
        display.setCell(0, 0, state._ttyMixedFirstCell, NO_COLOR, 0);
    display.putstr(promptColumn, promptRow, MORE_PROMPT, NO_COLOR, promptAttr);
    display.setCursor(promptColumn + MORE_PROMPT.length, promptRow);
}

function writeMorePromptAtCursor(display, promptAttr) {
    let row = Math.min(display.cursorRow ?? 0, display.rows - 1);
    let column = Math.min(display.cursorCol ?? 0, display.cols - 1);
    if (display.toplin && column >= display.cols - MORE_PROMPT.length) {
        row = Math.min(row + 1, display.rows - 1);
        column = 0;
    }
    for (const ch of MORE_PROMPT) {
        if (column >= display.cols) break;
        display.setCell(column++, row, ch, NO_COLOR, promptAttr);
    }
    display.setCursor(column, row);
}

// C ref: wintty.c tty_display_nhwindow(WIN_MAP, FALSE) leaves an existing
// message's --More-- marker visible after repainting the map. This is the
// nonblocking half of displayPendingTtyMessageWindow(), used by
// tty_wait_synch()'s map-window branch.
export function showPendingTtyMessage(state = game) {
    if (!state._pending_message || !state.nhDisplay) return false;
    writePendingTtyMessagePrompt(state, pendingTtyMessageLayout(state));
    return true;
}

// C ref: decl.c quitchars[] (" \r\n\033"), the set more() and dmore() pass to
// xwaitforspace().  The Escape it ends with is matched by the arm above the
// membership test, exactly as in C.
const QUITCHARS = ' \r\n\u001B';

// C ref: win/tty/getline.c xwaitforspace().  Returns morc, the key that ended
// the wait.  ttyDisplay->dismiss_more starts at 0, which matches no key a
// session can send, so only `s` and the unconditional CR and LF dismiss the
// prompt.
export async function xwaitforspace(
    state = game,
    s = QUITCHARS,
    dismissMore = 0,
) {
    for (;;) {
        const code = await nhgetch(state);
        if (code === 10 || code === 13) return code;
        // sys/share/unixtty.c setftty():258 raises iflags.cbreak inside
        // tty_init_nhwindows(); a caller reached before that -- getret() on
        // the startup configuration errors -- reads every other key and keeps
        // waiting, where a caller reached after it accepts `s` as well.
        if (!state.iflags?.cbreak) continue;
        // Escape has its own arm above the membership test, so it dismisses
        // the prompt whatever `s` holds.  tty_nhgetch() already substituted it
        // for NUL.  All other keys ring the bell and leave this boundary
        // unchanged.
        if (code === 27 || s.includes(String.fromCharCode(code))
            || (dismissMore !== 0 && code === dismissMore))
            return code;
    }
}

// C ref: win/tty/wintty.c tty_clear_nhwindow(WIN_MESSAGE).  Command parsing
// clears the physical top line after the final key has been read while
// retaining gt.toplines for message history. With TOPLINE_EMPTY it does
// nothing, so a line that tty_display_nhwindow(WIN_MESSAGE, FALSE) retired
// without erasing (as monmove.c vamp_shift() does) stays on the screen.
// A top line that show_topl()'s addtopl() wrapped leaves cw->cury on the
// last row it reached, and the clear repairs those rows with docorner()
// (wintty.c:1052-1055).
export function clearTtyMessageWindow(state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    if (display.toplin === TOPLINE_EMPTY) return;
    display.clearRow(0);
    display.setCursor(0, 0);
    const cw = state.wintty?.wins?.[state.wintty.messageWindow];
    if (cw?.cury) docorner(1, cw.cury + 1, 0, state);
    if (cw) cw.curx = cw.cury = 0;
    state._pending_message = '';
    delete state._pendingMessageLayout;
    delete state._ttyMixedFirstCell;
    display.toplin = TOPLINE_EMPTY;
    display.topMessage = state._ttyToplines ?? display.toplines ?? '';
}

// C ref: win/tty/topl.c more().  A multi-line top message is repaired through
// docorner() and homes the cursor.  A one-line message remains on screen after
// ordinary dismissal; Escape alone clears that physical top line.
export async function dismissPendingTtyMessage(
    state = game,
    {
        dismissMore = 0,
        preventEscapeStop = false,
        returnResponse = false,
        alwaysPrompt = false,
        promptAttr = ATR_NONE,
    } = {},
) {
    const hasPendingMessage = Boolean(state._pending_message);
    if (!hasPendingMessage && !alwaysPrompt) return false;
    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty message dismissal requires an initialized display');

    const layout = hasPendingMessage
        ? pendingTtyMessageLayout(state)
        : {
            display,
            lines: [],
            promptRow: Math.min(display.cursorRow ?? 0, display.rows - 1),
            promptColumn: Math.min(display.cursorCol ?? 0, display.cols - 1),
        };
    const { lines, promptRow, promptColumn } = layout;
    const multiline = Boolean(display.toplin && promptRow > 0);
    // redotoplin() overwrites ordinary bytes in place, skips recorder-ignored
    // high-bit bytes, and calls cl_end() after every logical/physical line.
    // Do not clear the prefix first: skipped byte cells retain their prior
    // character, color, and attributes in the recorder shadow grid.
    if (hasPendingMessage)
        writePendingTtyMessagePrompt(state, layout, promptAttr);
    else
        writeMorePromptAtCursor(display, promptAttr);

    // wintty.c tty_nhgetch() clears WIN_STOP before every key. more() restores
    // it only when this prompt's final response is Escape without WIN_NOSTOP.
    const response = await xwaitforspace(state, QUITCHARS, dismissMore);
    display.morc = response;

    if (multiline) {
        // more() calls docorner(1, cw->cury + 1, 0) after the key boundary.
        // Reconstruct those rows from C's current glyph buffer rather than
        // restoring the overdrawn screen snapshot.
        docorner(1, promptRow + 1, 0, state);
        display.setCursor(0, 0);
    } else if (response === 0 || response === 27) {
        display.clearRow(0);
        display.setCursor(0, 0);
    }
    state._pending_message = '';
    delete state._ttyMixedFirstCell;
    // more() leaves gt.toplines intact for message history. Escape also
    // sets WIN_STOP after tty_nhgetch() returns; subsequent plines update
    // that logical buffer without drawing until the next key wait.
    const messageWin = state.wintty?.wins?.[state.wintty.messageWindow];
    if ((response === 0 || response === 27)
        && !preventEscapeStop
        && !(messageWin?.flags & WIN_NOSTOP)) {
        // _ttyMessageStopped is the single JS owner of C's WIN_STOP bit.
        state._ttyMessageStopped = true;
    }
    display.topMessage = state._ttyToplines;
    display.toplines = state._ttyToplines;
    display.toplin = TOPLINE_EMPTY;
    return returnResponse ? response : true;
}

// C ref: win/tty/wintty.c tty_message_menu(). The one-item inventory
// shortcut uses the selected inventory letter as ttyDisplay->dismiss_more,
// so the message line itself is the menu and the matching key is the result.
// The caller has just answered a prompt, which is why the normal pline path
// is safe here; tty_message_menu() then forces its own More boundary and
// clears WIN_MESSAGE before returning to invent.c.
export async function tty_message_menu(
    invletter,
    how,
    mesg,
    state = game,
) {
    if (how === PICK_NONE) {
        await ttyPline(mesg, state);
        return 0;
    }
    // C has no other arm: invent.c display_pickinv()'s two calls pass
    // PICK_ONE or PICK_NONE, and any other value would take the PICK_ONE path.

    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty_message_menu requires an initialized display');
    const selected = typeof invletter === 'number'
        ? invletter
        : String(invletter ?? '').charCodeAt(0);
    // wintty.c 2828-2832. The letter also dismisses a --More-- that a
    // message too long for one line raises inside tty_putstr(); that more()
    // records its key in morc and leaves the top line TOPLINE_EMPTY.
    display.dismiss_more = selected;
    display.morc = 0;
    await ttyPline(mesg, state);
    // wintty.c 2834-2839: a message that fit on one line gets its --More--
    // here; more() resets the state to EMPTY, so NEED_MORE is restored
    // before tty_clear_nhwindow().
    if (display.toplin === TOPLINE_NEED_MORE) {
        await more(state);
        display.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    }
    // wintty.c 2840-2844: Escape at this --More-- cancels the prompt rather
    // than suppressing later messages, so C clears WIN_CANCELLED (the same
    // bit as WIN_STOP) and the caller's "Never mind." is still shown.
    state._ttyMessageStopped = false;
    display.dismiss_more = 0;
    const morc = display.morc;
    return (how === PICK_ONE && morc === selected) || morc === 27 ? morc : 0;
}

// C ref: wintty.c tty_display_nhwindow(WIN_MESSAGE, TRUE/FALSE). Only a
// TOPLINE_NEED_MORE message enters more(); an already acknowledged physical
// line is retired logically by the nonblocking call and remains on screen.
// The blocking-looking TTY implementation therefore must not inspect merely
// _pending_message: callers such as invent.c look_here() can have a stale
// physical line with TOPLINE_NON_EMPTY and no input boundary to consume.
export async function displayPendingTtyMessageWindow(state) {
    await emitQueuedNotices(state);
    // wintty.c tty_display_nhwindow() returns first when cw->flags has
    // WIN_CANCELLED. wintty.h gives WIN_CANCELLED and WIN_STOP the same bit,
    // so after an Escape at --More-- the message window is neither waited on
    // nor marked empty until tty_nhgetch() clears WIN_STOP.
    if (state._ttyMessageStopped) return;
    // C tty_display_nhwindow() clears ttyDisplay->rawprint before selecting
    // the WIN_MESSAGE arm.  This is separate from nomuxRaw.active, which the
    // recorder keeps sticky for cursor capture.
    if (state.nhDisplay?.nomuxRaw)
        state.nhDisplay.nomuxRaw.rawprint = 0;
    const waitingForMore = state.nhDisplay?.toplin === TOPLINE_NEED_MORE;
    const waited = waitingForMore
        ? await dismissPendingTtyMessage(state) : false;
    if (waited) {
        state.nhDisplay.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    } else if (state.nhDisplay) {
        state.nhDisplay.toplin = TOPLINE_EMPTY;
    }
}

// pline.c You(), Your(), You_cant(), pline_The() and There() prefixes; the
// You_feel(), You_hear() and You_see() ones depend on the hero, and
// js/pline.js owns them.
const YOU_BUF_PLAIN_PREFIXES = Object.freeze([
    ['You', 'You '], ['Your', 'Your '], ['You_cant', "You can't "],
    ['pline_The', 'The '], ['There', 'There '],
]);

// Whether `message` is the text of a You()-family call whose format has no
// '%', which vpline() prints from gy.you_buf rather than from a copy.
function printedFromYouBuf(message, state) {
    const prefixes = [
        ...YOU_BUF_PLAIN_PREFIXES,
        ['You_feel', youFeel('', state)],
        ['You_hear', youHear('', state)],
        ['You_see', youSee('', state)],
    ];
    return prefixes.some(([fn, prefix]) => prefix
        && message.startsWith(prefix)
        && YOU_BUF_FORMATS[fn].has(message.slice(prefix.length)));
}

// display.c show_glyph() calls pline_xy(), and vision.c vision_recalc()'s
// notice_all_mons() calls You(), synchronously. JS defers the awaitable TTY
// work by queueing those lines (js/startup_a11y.js), so anything that later
// reaches the screen -- a message, a menu or text window, or a prompt --
// must first print every source-earlier queued line. Each such window-port
// entry point calls this first; scripts/queued-notice-drain.test.mjs checks
// that they do. emitGlyphUpdateNotices() marks its own recursive ttyPline()
// calls so they do not re-enter.
export async function emitQueuedNotices(state = game) {
    if (!state._emittingGlyphUpdateNotices)
        await emitGlyphUpdateNotices(state, { pline: ttyPline });
}

// C refs: pline.c vpline(), Norep(); win/tty/topl.c update_topl(). Messages
// share the top line only when both fit with two separating spaces and room
// for a future --More--. PLINE_NOREPEAT compares the new individual message
// against gp.prevmsg before the window port sees it.
//
// `viaVpline` is false for tty_putmixed(), which reaches tty_putstr() and
// update_topl() without vpline(): no MSGTYPE lookup, no vision or map flush,
// no gp.prevmsg or iflags.last_msg update.
//
// Answers whether the message reached the window port: false when vpline()
// returned before putmesg() (an empty format, or MSGTYPE hide or norep).
async function ttyPlineCore(
    message, state, pflags, mixedFirstCell = null, viaVpline = true,
) {
    // pline.c:vpline returns before putmesg for an empty format.
    if (!message) return false;
    await emitQueuedNotices(state);
    // pline.c You() and its siblings write "prefix + format" into
    // gy.you_buf; vpline() prints a format without '%' from that buffer.
    // state.gy.you_buf is that buffer's text, written only here and by
    // startup_a11y.js emitGlyphUpdateNotices() for notice_mon(); C keeps it
    // for the whole process, but no reader looks past the current message.
    const fromYouBuf = printedFromYouBuf(message, state);
    if (fromYouBuf) (state.gy ??= {}).you_buf = message;
    let normalizedMessage = normalizeVplineMessage(message);
    let next = ttyByteText(normalizedMessage);
    const noRepeat = Boolean(pflags & PLINE_NOREPEAT);
    const urgentMessage = Boolean(pflags & URGENT_MESSAGE);
    let msgtype = MSGTYP_NORMAL;
    if (viaVpline && !(pflags & OVERRIDE_MSGTYPE)) {
        msgtype = msgtype_type(normalizedMessage, noRepeat, state);
        if (!(pflags & URGENT_MESSAGE)
            && (msgtype === MSGTYP_NOSHOW
                || (msgtype === MSGTYP_NOREP
                    && normalizedMessage === state._ttyPreviousMessage))) {
            return false;
        }
    }
    // C ref: pline.c vpline() (266-271). C brackets the call with
    // in_pline = 0 so a message raised inside it counts as top level; this
    // port keeps no in_pline counter to save and restore. The notices it
    // raises precede this message, so they are drained before the top-line
    // state below is read.
    if (viaVpline && await vplineVisionRecalc(pflags, state)) {
        // A notice_mon() line among them was You("%s %s.", ...), which
        // rewrote gy.you_buf under a line that still points at it; C then
        // prints that format unexpanded.
        if (fromYouBuf && state.gy.you_buf !== message) {
            normalizedMessage = normalizeVplineMessage(state.gy.you_buf);
            next = ttyByteText(normalizedMessage);
        }
    }
    // A shown message replaces any show_topl() layout; the SUPPRESS_HISTORY
    // arm below records a fresh one.
    delete state._pendingMessageLayout;
    const deathMessage = next.startsWith('You die');
    const columns = state.nhDisplay?.cols ?? 80;
    let stoppedAtEntry = Boolean(state._ttyMessageStopped);
    // C ref: topl.c update_topl():262-279. Both the share-the-line arm and the
    // more() below it are gated on `ttyDisplay->toplin == TOPLINE_NEED_MORE`
    // (or WIN_STOP), not on the line merely being occupied. Every message the
    // port writes leaves NEED_MORE behind, so this reads as before for them;
    // tty_yn_function()'s clean_up is the one writer that leaves
    // TOPLINE_NON_EMPTY, and a message after an answered prompt replaces the
    // line rather than sharing it or stopping for --More--.
    const occupied = state._pending_message ?? '';
    let current = state.nhDisplay?.toplin === TOPLINE_NON_EMPTY
        ? '' : occupied;
    const priorTopline = state._ttyToplines ?? current;
    // update_topl() assigns `notdied` inside the last operand of its same-line
    // condition.  A long prior/death combination short-circuits before that
    // comparison, preserving WIN_STOP as an upstream quirk.
    const deathComparisonReached = deathMessage
        && (Boolean(current) || stoppedAtEntry)
        && fitsOnTtyTopline(priorTopline, next, columns);
    // C ref: pline.c vpline(). Once the hero is on the map, every message
    // flushes pending map and bottom-line changes before update_topl() can
    // wrap into a blocking More prompt.
    if (viaVpline && state === game && state.u?.ux)
        await flush_screen((pflags & NO_CURS_ON_U) ? 0 : 1);
    // C wintty.c handles ATR_URGENT after vpline() has flushed the map but
    // before tty_putstr() invokes update_topl(): its clear_nhwindow(WIN_MESSAGE)
    // removes the stale physical line and clears WIN_STOP. Do the same at
    // this stage, then let the urgent line take the ordinary replacement path.
    const messageWin = state.wintty?.wins?.[state.wintty.messageWindow];
    if (urgentMessage && stoppedAtEntry) {
        clearTtyMessageWindow(state);
        state._ttyMessageStopped = false;
        stoppedAtEntry = false;
        current = '';
    }
    // wintty.c:2277-2300 sets the one-shot WIN_NOSTOP for every urgent
    // message, after clearing persistent WIN_STOP and before update_topl().
    if (urgentMessage && messageWin) messageWin.flags |= WIN_NOSTOP;
    if (pflags & SUPPRESS_HISTORY) {
        // C win/tty/wintty.c: tty_putstr(WIN_MESSAGE, ATR_NOHISTORY, ...)
        // remembers the old gt.toplines, then show_topl() paints this message
        // without making it the new history line. In particular, Ctrl-P
        // recalls the message before this one, not this transient feedback.
        if (state._ttyToplines) remember_topl(state);
        if (!stoppedAtEntry) {
            const display = state.nhDisplay;
            if (display) {
                if (show_topl(next, state)) {
                    display.topMessage = next;
                    state._pending_message = next;
                    // show_topl() writes through addtopl(), which wraps at
                    // column CO-1 rather than at a word, and nothing waits
                    // for --More--. display.js redraws the top line from
                    // _pending_message; this layout, valid while the text
                    // is unchanged, gives it the physical rows.
                    state._pendingMessageLayout = {
                        text: next,
                        rows: addtoplRows(next, display.cols),
                    };
                }
            }
        }
        // remember_topl() emptied gt.toplines, and show_topl() does not
        // write it.
        setToplinesDirectly('', state);
        if (viaVpline) state._ttyPreviousMessage = normalizedMessage;
        if (viaVpline) {
            state.iflags ??= {};
            state.iflags.last_msg = PLNMSG_UNKNOWN;
        }
        if (urgentMessage && messageWin)
            messageWin.flags &= ~WIN_NOSTOP;
        // vpline():283-284 waits for a MSGTYPE=stop line whichever way
        // putmesg() showed it; show_topl()'s addtopl() left NEED_MORE.
        if (msgtype === MSGTYP_STOP)
            await displayPendingTtyMessageWindow(state);
        return true;
    }
    if (pflags & (PLINE_VERBALIZE | PLINE_SPEECH))
        sound_speak(normalizedMessage, state);
    // pline.c has prepared the message and wintty.c has handled urgent output.
    // topl.c:update_topl() now owns the complete history, same-line, wait,
    // redraw, and replacement transition. These callbacks are its terminal
    // primitives, not alternate branch implementations.
    await update_topl(next, state, {
        urgentMessage,
        mixedFirstCell,
        stoppedAtEntry,
        deathMessage,
        deathComparisonReached,
        columns,
        normalizedMessage,
        viaVpline,
        resetLastMessage: () => {
            if (viaVpline) {
                state.iflags ??= {};
                state.iflags.last_msg = PLNMSG_UNKNOWN;
            }
        },
        callbacks: {
            dismissPendingTtyMessage,
        },
    });
    // wintty.c clears the one-shot after the source-selected write path.
    if (urgentMessage && messageWin)
        messageWin.flags &= ~WIN_NOSTOP;
    // pline.c vpline() (283-284) waits for a MSGTYPE=stop line after
    // putmesg() returns, so an urgent line's WIN_NOSTOP is already clear and
    // Escape at this --More-- sets WIN_STOP. A line update_topl() suppressed
    // under WIN_STOP reaches tty_display_nhwindow()'s WIN_CANCELLED return.
    if (msgtype === MSGTYP_STOP)
        await displayPendingTtyMessageWindow(state);
    return true;
}

// C ref: pline.c vpline() (266-272). A recalculation another routine
// deferred -- a new light source, options.c:5372's lit_corridor toggle --
// is spent by the next message, before its map flush. The notices that
// recalculation raises (display.c show_glyph()'s mention_map line, vision.c
// notice_all_mons()) are plines nested inside this one, and C sets no
// pline flags of their own: they read gp.pline_flags, which the outer
// custompline(), Norep() or urgent_pline() set for its own line. A prompt's
// OVERRIDE_MSGTYPE | SUPPRESS_HISTORY therefore sends each notice through
// show_topl(), where the prompt then paints over it. `pflags` is the outer
// message's flags. Every vpline() entry -- ttyPlineCore() and the prompts in
// js/getline.js and js/topl.js -- recalculates through this function;
// scripts/vpline-vision-recalc.test.mjs checks that they do. Answers whether
// a recalculation ran.
export async function vplineVisionRecalc(pflags, state = game) {
    if (state !== game || !state.vision_full_recalc) return false;
    // newsym() inside it prints display.c wall_angle()'s impossible() as a
    // message nested in this one, as C's does once in_pline is cleared.
    await vision_recalc(0, { state, onImpossible: impossible_printer(state) });
    if (!state._emittingGlyphUpdateNotices) {
        await emitGlyphUpdateNotices(state, {
            pline: (line, noticeState) => ttyPlineCore(line, noticeState, pflags),
        });
    }
    return true;
}

export async function ttyPline(message, state = game) {
    const pflags = state.gp?.pline_flags ?? 0;
    try {
        return await ttyPlineCore(message, state, pflags);
    } finally {
        if (state.gp)
            state.gp.pline_flags &= ~PLINE_SPEECH;
    }
}

// C ref: win/tty/wintty.c tty_putmixed(), for pager.c do_look()'s encoded
// leading glyph. The raw one-byte symbol preserves TTY wrapping, while the
// rendered cell gives the scorer the same visual DEC glyph as C's SO/SI span.
export async function ttyPutmixed(
    message, renderedFirstCell, state = game,
) {
    // pager.c's putmixed bypasses pline.c:vpline and its last_msg reset.
    return ttyPlineCore(message, state, 0, renderedFirstCell, false);
}

export async function ttyNorep(message, state = game) {
    const pflags = (state.gp?.pline_flags ?? 0) | PLINE_NOREPEAT;
    try {
        return await ttyPlineCore(message, state, pflags);
    } finally {
        if (state.gp)
            state.gp.pline_flags &= ~PLINE_SPEECH;
    }
}

export class UnsupportedCustomPlineFlagsError extends Error {
    constructor(pflags) {
        super(`custompline() flags ${pflags} are not ported`);
        this.name = 'UnsupportedCustomPlineFlagsError';
    }
}

// C ref: pline.c custompline(). Its callers pass SUPPRESS_HISTORY
// (cmd.c), OVERRIDE_MSGTYPE, or getpos.c auto_describe()'s
// SUPPRESS_HISTORY | OVERRIDE_MSGTYPE | NO_CURS_ON_U.
const CUSTOMPLINE_FLAGS = SUPPRESS_HISTORY | OVERRIDE_MSGTYPE | NO_CURS_ON_U;
export async function ttyCustomPline(message, pflags, state = game) {
    if (!pflags || (pflags & ~CUSTOMPLINE_FLAGS))
        throw new UnsupportedCustomPlineFlagsError(pflags);
    return ttyPlineCore(message, state, pflags);
}

// C ref: pline.c urgent_pline() (313-323). It is custompline(URGENT_MESSAGE),
// and that flag reaches the top line twice: vpline():253 stops MSGTYPE=hide
// and MSGTYPE=norep from swallowing the message, and putmesg():72-74 turns it
// into tty_putstr()'s ATR_URGENT, whose arm at wintty.c:2277-2283 clears a
// WIN_STOP the player set with Escape at an earlier --More-- and marks this
// one message WIN_NOSTOP.
//
// vpline() applies the first two rules above. ttyUrgentPline() below also
// models the third rule when an earlier Escape left WIN_STOP set. With
// WIN_STOP clear, the arm sets only WIN_NOSTOP, which has two readers.
// update_topl():257 reads it as
// `skip = FALSE`, exactly what a clear WIN_STOP already gives; and more():233
// reads it when the player answers this message's own --More-- with Escape,
// where it is what stops that Escape setting WIN_STOP for whatever comes
// next.
//
// dismissPendingTtyMessage() models the second reader by receiving the urgent
// call's prompt origin. It prevents Escape from setting the persistent stop
// only for a prior-line or wrapped-line More inside tty_putstr(); vpline()'s
// later explicit MSGTYP_STOP display receives no such exemption.
//
// With WIN_STOP set at entry, tty_clear_nhwindow(WIN_MESSAGE) wipes the top
// line before the message is written, where an ordinary message would have
// been held back invisibly; ttyPlineCore() performs that reset for its urgent
// flag after the source-ordered map flush.
export async function ttyUrgentPline(message, state = game) {
    return ttyPlineCore(message, state, URGENT_MESSAGE);
}
