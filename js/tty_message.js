// tty_message.js -- Source-shaped TTY top-line message boundaries.
// C refs: win/tty/topl.c update_topl(), more(), and xwaitforspace().

import { game } from './gstate.js';
import { flush_screen } from './display.js';
import { encodeUtf8ByteString } from './hacklib.js';
import { nhgetch } from './input.js';
import { emitGlyphUpdateNotices } from './startup_a11y.js';
import { NO_COLOR } from './terminal.js';
import { vision_recalc } from './vision.js';

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

function writeRecorderTtyLine(display, row, value) {
    const line = String(value);
    let column = 0;
    for (const ch of line) {
        if (column >= display.cols) break;
        // Recorder patch 006 receives signed high-bit bytes after topl_putsym()
        // advances curx. nomux_putch() ignores those bytes, preserving the
        // prior shadow cell at that column.
        if (ch !== '\0')
            display.setCell(column, row, ch, NO_COLOR, 0);
        ++column;
    }
    display.setCursor(column, row);
    display.clearToEol();
    return column;
}

function snapshotRows(display, rowCount) {
    return display.grid.slice(0, rowCount).map(
        (row) => row.map((cell) => ({ ...cell })),
    );
}

function restoreRows(display, snapshot) {
    for (let row = 0; row < snapshot.length; ++row) {
        for (let column = 0; column < snapshot[row].length; ++column) {
            const cell = snapshot[row][column];
            display.setCell(column, row, cell.ch, cell.color, cell.attr);
        }
    }
}

// C ref: decl.c quitchars[] (" \r\n\033"), the set more() and dmore() pass to
// xwaitforspace().  The Escape it ends with is matched by the arm above the
// membership test, exactly as in C.
const QUITCHARS = ' \r\n\u001B';

// C ref: win/tty/getline.c xwaitforspace().  Returns morc, the key that ended
// the wait.  ttyDisplay->dismiss_more starts at 0, which matches no key a
// session can send, so only `s` and the unconditional CR and LF dismiss the
// prompt.
export async function xwaitforspace(state = game, s = QUITCHARS) {
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
        if (code === 27 || s.includes(String.fromCharCode(code)))
            return code;
    }
}

// C ref: win/tty/topl.c update_topl().  It replaces the last space before
// column 80 with a newline whenever the remaining message is at least one
// terminal row long.
export function wrapTtyTopline(message, columns) {
    const logicalLines = [];
    let remaining = String(message);
    while (remaining.length >= columns) {
        let split = columns - 1;
        while (split > 0 && remaining[split] !== ' ') --split;
        if (split === 0) {
            split = remaining.indexOf(' ');
            if (split < 0) break;
        }
        logicalLines.push(remaining.slice(0, split));
        remaining = remaining.slice(split + 1);
    }
    logicalLines.push(remaining);

    // topl_putsym() moves to the next row before writing a byte at CO - 1.
    // That physical wrap still happens when update_topl() could not insert a
    // newline into a long token, but it does not alter gt.toplines history.
    const physicalWidth = Math.max(1, columns - 1);
    return logicalLines.flatMap((line) => {
        if (!line.length) return [''];
        const rows = [];
        for (let start = 0; start < line.length; start += physicalWidth) {
            rows.push(line.slice(start, start + physicalWidth));
        }
        return rows;
    });
}

function rememberPendingMessage(state, message) {
    state._pending_message = message;
    state._ttyToplines = message;
    const display = state.nhDisplay;
    if (display) {
        display.topMessage = message;
        display.toplines = message;
        display.toplin = TOPLINE_NEED_MORE;
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
    display.toplin = TOPLINE_EMPTY;
    display.topMessage = state._ttyToplines ?? display.toplines ?? '';
}

// C ref: win/tty/topl.c more().  A multi-line top message is repaired through
// docorner() and homes the cursor.  A one-line message remains on screen after
// ordinary dismissal; Escape alone clears that physical top line.
export async function dismissPendingTtyMessage(state = game) {
    if (!state._pending_message) return false;
    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty message dismissal requires an initialized display');

    const lines = wrapTtyTopline(state._pending_message, display.cols);
    let promptRow = lines.length - 1;
    let promptColumn = lines.at(-1).length;
    if (promptColumn >= display.cols - MORE_PROMPT.length) {
        ++promptRow;
        promptColumn = 0;
    }
    const multiline = promptRow > 0;
    const snapshot = multiline
        ? snapshotRows(display, promptRow + 1)
        : null;
    if (snapshot) {
        // The message row is not backed by map-window data. docorner() clears
        // it while reconstructing any obscured map rows below it.
        snapshot[0] = snapshot[0].map(() => ({
            ch: ' ', color: NO_COLOR, attr: 0,
        }));
    }
    // redotoplin() overwrites ordinary bytes in place, skips recorder-ignored
    // high-bit bytes, and calls cl_end() after every logical/physical line.
    // Do not clear the prefix first: skipped byte cells retain their prior
    // character, color, and attributes in the recorder shadow grid.
    for (let row = 0; row < lines.length; ++row)
        writeRecorderTtyLine(display, row, lines[row]);
    display.putstr(promptColumn, promptRow, MORE_PROMPT, NO_COLOR, 0);
    display.setCursor(promptColumn + MORE_PROMPT.length, promptRow);

    const response = await xwaitforspace(state);

    if (snapshot) {
        restoreRows(display, snapshot);
        display.setCursor(0, 0);
    } else if (response === 0 || response === 27) {
        display.clearRow(0);
        display.setCursor(0, 0);
    }
    state._pending_message = '';
    // more() leaves gt.toplines intact for message history. Escape also
    // sets WIN_STOP after tty_nhgetch() returns; subsequent plines update
    // that logical buffer without drawing until the next key wait.
    state._ttyToplines ??= lines.join('\n');
    state._ttyMessageStopped = response === 0 || response === 27;
    display.topMessage = state._ttyToplines;
    display.toplines = state._ttyToplines;
    display.toplin = TOPLINE_EMPTY;
    return true;
}

function fitsOnTtyTopline(prior, next, columns) {
    return wrapTtyTopline(prior, columns).length === 1
        && next.length + prior.length + 3
            < columns - MORE_PROMPT.length;
}

function rememberSuppressedMessage(state, message, columns) {
    const next = String(message);
    const current = state._ttyToplines ?? '';
    const sharesTopline = current
        && fitsOnTtyTopline(current, next, columns);
    const toplines = sharesTopline ? `${current}  ${next}` : next;
    state._ttyToplines = toplines;
    const display = state.nhDisplay;
    if (display) {
        // WIN_STOP prevents this logical update from reaching the terminal.
        // A message rendered by the update_topl() call which received Escape
        // remains visible, with its existing TOPLINE_NEED_MORE state.
        display.toplines = toplines;
    }
}

// C refs: pline.c vpline(), Norep(); win/tty/topl.c update_topl(). Messages
// share the top line only when both fit with two separating spaces and room
// for a future --More--. PLINE_NOREPEAT compares the new individual message
// against gp.prevmsg before the window port sees it.
async function ttyPlineCore(message, state, noRepeat) {
    // display.c show_glyph() calls pline_xy() synchronously. JS defers the
    // awaitable TTY work, so a later ordinary message must first drain every
    // source-earlier glyph notice. emitGlyphUpdateNotices marks its recursive
    // ttyPline() calls to avoid re-entering this boundary.
    if (!state._emittingGlyphUpdateNotices) {
        await emitGlyphUpdateNotices(state, { pline: ttyPline });
    }
    const next = ttyByteText(message);
    if (noRepeat && next === state._ttyPreviousMessage) return;
    const deathMessage = next.startsWith('You die');
    const columns = state.nhDisplay?.cols ?? 80;
    const stoppedAtEntry = Boolean(state._ttyMessageStopped);
    // C ref: topl.c update_topl():262-279. Both the share-the-line arm and the
    // more() below it are gated on `ttyDisplay->toplin == TOPLINE_NEED_MORE`
    // (or WIN_STOP), not on the line merely being occupied. Every message the
    // port writes leaves NEED_MORE behind, so this reads as before for them;
    // tty_yn_function()'s clean_up is the one writer that leaves
    // TOPLINE_NON_EMPTY, and a message after an answered prompt replaces the
    // line rather than sharing it or stopping for --More--.
    const occupied = state._pending_message ?? '';
    const current = state.nhDisplay?.toplin === TOPLINE_NON_EMPTY
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
    if (state === game && state.u?.ux) await flush_screen(1);
    // "You die" is update_topl()'s exception to WIN_STOP.  Other messages
    // continue updating gt.toplines for history but remain invisible.
    if (stoppedAtEntry && !deathComparisonReached) {
        rememberSuppressedMessage(state, next, columns);
        state._ttyPreviousMessage = next;
        return;
    }
    if (stoppedAtEntry) state._ttyMessageStopped = false;

    if (current
        && !deathMessage
        && fitsOnTtyTopline(current, next, columns)) {
        rememberPendingMessage(state, `${current}  ${next}`);
        state._ttyPreviousMessage = next;
        return;
    }
    if (current) await dismissPendingTtyMessage(state);
    // When the comparison above was reached, update_topl() clears WIN_STOP
    // after more() has had the opportunity to set it from an Escape response.
    if (deathComparisonReached) state._ttyMessageStopped = false;
    rememberPendingMessage(state, next);
    state._ttyPreviousMessage = next;
    // redotoplin() immediately invokes more() when update_topl() wrapped the
    // new message onto a second terminal row.
    if (wrapTtyTopline(next, columns).length > 1)
        await dismissPendingTtyMessage(state);
}

export async function ttyPline(message, state = game) {
    return ttyPlineCore(message, state, false);
}

export async function ttyNorep(message, state = game) {
    return ttyPlineCore(message, state, true);
}
