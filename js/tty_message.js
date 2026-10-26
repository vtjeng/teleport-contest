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
    decodeUtf8ByteString,
    encodeUtf8ByteString,
} from './hacklib.js';
import { nhgetch } from './input.js';
import { emitGlyphUpdateNotices } from './startup_a11y.js';
import { ATR_NONE, NO_COLOR } from './terminal.js';
import { vision_recalc } from './vision.js';
import { msgtype_type } from './options.js';
import { sound_speak } from './sounds.js';
import {
    fitsOnTtyTopline,
    remember_topl,
    show_topl,
    update_topl,
    wrapTtyTopline,
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
    // Recorder patch 006 ignores signed high-bit bytes only when putchar()
    // projects them into the shadow grid. NUL is an internal skipped-byte
    // marker: it occupies one logical byte cell but is not a wrapping space.
    return encodeUtf8ByteString(value).map((byte) => (
        byte < 0x80 ? String.fromCharCode(byte) : '\0'
    )).join('');
}

// C ref: pline.c vpline()'s modest-overflow arm. The formatted byte string is
// reduced to BUFSZ - 1 bytes once, before MSGTYPE lookup, TTY rendering, and
// gp.prevmsg storage. Bytes 249 through 251 become an ellipsis and bytes 252
// through 254 preserve the original final three bytes.
function normalizeVplineMessage(value) {
    const bytes = encodeUtf8ByteString(value);
    if (bytes.length <= 255) return decodeUtf8ByteString(bytes);
    return decodeUtf8ByteString([
        ...bytes.slice(0, 249),
        0x2E, 0x2E, 0x2E,
        ...bytes.slice(-3),
    ]);
}

function pendingTtyMessageLayout(state) {
    const display = state.nhDisplay;
    const lines = wrapTtyTopline(state._pending_message, display.cols);
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
// retaining gt.toplines for message history.
export function clearTtyMessageWindow(state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    if (display.toplin !== TOPLINE_EMPTY || state._pending_message) {
        display.clearRow(0);
        display.setCursor(0, 0);
    }
    state._pending_message = '';
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
    state._ttyToplines ??= lines.join('\n');
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
    if (how !== PICK_ONE)
        throw new Error(`unsupported tty_message_menu mode ${how}`);

    await ttyPline(mesg, state);
    const response = await dismissPendingTtyMessage(state, {
        dismissMore: typeof invletter === 'number'
            ? invletter
            : String(invletter ?? '').charCodeAt(0),
        returnResponse: true,
    });
    if (state.nhDisplay) {
        // wintty.c restores NEED_MORE before tty_clear_nhwindow(), because
        // more() has already reset the top-line state to EMPTY.
        state.nhDisplay.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    }
    const selected = typeof invletter === 'number'
        ? invletter
        : String(invletter ?? '').charCodeAt(0);
    return response && (response === selected || response === 27)
        ? response
        : 0;
}

// C ref: wintty.c tty_display_nhwindow(WIN_MESSAGE, TRUE/FALSE). Only a
// TOPLINE_NEED_MORE message enters more(); an already acknowledged physical
// line is retired logically by the nonblocking call and remains on screen.
// The blocking-looking TTY implementation therefore must not inspect merely
// _pending_message: callers such as invent.c look_here() can have a stale
// physical line with TOPLINE_NON_EMPTY and no input boundary to consume.
export async function displayPendingTtyMessageWindow(state) {
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

// Whether an ordinary pline() will reach xwaitforspace() before it returns.
// Monster-action planning uses this to distinguish a message which itself is
// the next supported input boundary from one which would run straight into an
// unported source operation. Keep the predicates in the same order as
// ttyPlineCore() below so the dry run does not guess from rendered output.
export function ttyPlineWillWait(message, state = game) {
    const normalizedMessage = normalizeVplineMessage(message);
    const next = ttyByteText(normalizedMessage);
    const msgtype = msgtype_type(normalizedMessage, false, state);
    if (msgtype === MSGTYP_NOSHOW) return false;

    const columns = state.nhDisplay?.cols ?? 80;
    const stoppedAtEntry = Boolean(state._ttyMessageStopped);
    const occupied = state._pending_message ?? '';
    const current = state.nhDisplay?.toplin === TOPLINE_NON_EMPTY
        ? '' : occupied;
    const priorTopline = state._ttyToplines ?? current;
    const deathMessage = next.startsWith('You die');
    const deathComparisonReached = deathMessage
        && (Boolean(current) || stoppedAtEntry)
        && fitsOnTtyTopline(priorTopline, next, columns);

    if (stoppedAtEntry && !deathComparisonReached) return false;
    if (current
        && !deathMessage
        && fitsOnTtyTopline(current, next, columns)) {
        return msgtype === MSGTYP_STOP;
    }
    if (current) return true;
    return wrapTtyTopline(next, columns).length > 1
        || msgtype === MSGTYP_STOP;
}

// C refs: pline.c vpline(), Norep(); win/tty/topl.c update_topl(). Messages
// share the top line only when both fit with two separating spaces and room
// for a future --More--. PLINE_NOREPEAT compares the new individual message
// against gp.prevmsg before the window port sees it.
async function ttyPlineCore(
    message, state, pflags, mixedFirstCell = null, resetLastMessage = true,
) {
    // pline.c:vpline returns before putmesg for an empty format.
    if (!message) return;
    // display.c show_glyph() calls pline_xy() synchronously. JS defers the
    // awaitable TTY work, so a later ordinary message must first drain every
    // source-earlier glyph notice. emitGlyphUpdateNotices marks its recursive
    // ttyPline() calls to avoid re-entering this boundary.
    if (!state._emittingGlyphUpdateNotices) {
        await emitGlyphUpdateNotices(state, { pline: ttyPline });
    }
    const normalizedMessage = normalizeVplineMessage(message);
    const next = ttyByteText(normalizedMessage);
    const noRepeat = Boolean(pflags & PLINE_NOREPEAT);
    const urgentMessage = Boolean(pflags & URGENT_MESSAGE);
    let msgtype = MSGTYP_NORMAL;
    if (!(pflags & OVERRIDE_MSGTYPE)) {
        msgtype = msgtype_type(normalizedMessage, noRepeat, state);
        if (!(pflags & URGENT_MESSAGE)
            && (msgtype === MSGTYP_NOSHOW
                || (msgtype === MSGTYP_NOREP
                    && normalizedMessage === state._ttyPreviousMessage))) {
            return;
        }
    }
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
    // C ref: pline.c vpline() (266-271). A recalculation another routine
    // deferred -- options.c:5372's lit_corridor toggle sets the flag right
    // after shutting vision down -- is spent by the next message rather than
    // waiting for the move loop, so the map flushed below is the one the
    // player is being told about. C brackets the call with in_pline = 0 so a
    // message raised inside it counts as top level; this port keeps no
    // in_pline counter to save and restore.
    if (state === game && state.vision_full_recalc) vision_recalc(0);
    // C ref: pline.c vpline(). Once the hero is on the map, every message
    // flushes pending map and bottom-line changes before update_topl() can
    // wrap into a blocking More prompt.
    if (state === game && state.u?.ux)
        await flush_screen(pflags & NO_CURS_ON_U ? 0 : 1);
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
                }
            }
        }
        state._ttyToplines = '';
        if (state.nhDisplay) state.nhDisplay.toplines = '';
        state._ttyPreviousMessage = normalizedMessage;
        if (resetLastMessage) {
            state.iflags ??= {};
            state.iflags.last_msg = PLNMSG_UNKNOWN;
        }
        if (urgentMessage && messageWin)
            messageWin.flags &= ~WIN_NOSTOP;
        return;
    }
    if (pflags & (PLINE_VERBALIZE | PLINE_SPEECH))
        sound_speak(normalizedMessage, state);
    // pline.c has prepared the message and wintty.c has handled urgent output.
    // topl.c:update_topl() now owns the complete history, same-line, wait,
    // redraw, and replacement transition. These callbacks are its terminal
    // primitives, not alternate branch implementations.
    await update_topl(next, state, {
        msgtype,
        urgentMessage,
        mixedFirstCell,
        stoppedAtEntry,
        deathMessage,
        deathComparisonReached,
        columns,
        normalizedMessage,
        resetLastMessage: () => {
            if (resetLastMessage) {
                state.iflags ??= {};
                state.iflags.last_msg = PLNMSG_UNKNOWN;
            }
        },
        callbacks: {
            displayPendingTtyMessageWindow,
            dismissPendingTtyMessage,
        },
    });
    // wintty.c clears the one-shot after the source-selected write path.
    if (urgentMessage && messageWin)
        messageWin.flags &= ~WIN_NOSTOP;
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

// C ref: pline.c custompline().
export async function ttyCustomPline(message, pflags, state = game) {
    const supportedFlags = SUPPRESS_HISTORY | OVERRIDE_MSGTYPE | NO_CURS_ON_U;
    if (!pflags || (pflags & ~supportedFlags))
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
