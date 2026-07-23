// tty_message.js -- Source-shaped TTY top-line message boundaries.
// C refs: win/tty/topl.c update_topl(), more(), and xwaitforspace().

import { game } from './gstate.js';
import { flush_screen } from './display.js';
import { encodeUtf8ByteString } from './hacklib.js';
import { nhgetch } from './input.js';
import { NO_COLOR } from './terminal.js';

const MORE_PROMPT = '--More--';
const TOPLINE_EMPTY = 0;
const TOPLINE_NEED_MORE = 1;

function recorderRawTtyText(value) {
    // topl.c emits raw bytes and advances once per byte. Recorder patch 006
    // ignores signed high-bit bytes in nomux_putch(), so each remains a blank
    // captured cell rather than becoming a Unicode glyph.
    return encodeUtf8ByteString(value).map((byte) => (
        byte < 0x80 ? String.fromCharCode(byte) : ' '
    )).join('');
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

// C ref: win/tty/topl.c update_topl().  It replaces the last space before
// column 80 with a newline whenever the remaining message is at least one
// terminal row long.
export function wrapTtyTopline(message, columns) {
    const lines = [];
    let remaining = String(message);
    while (remaining.length >= columns) {
        let split = columns - 1;
        while (split > 0 && remaining[split] !== ' ') --split;
        if (split === 0) {
            split = remaining.indexOf(' ');
            if (split < 0) break;
        }
        lines.push(remaining.slice(0, split));
        remaining = remaining.slice(split + 1);
    }
    lines.push(remaining);
    return lines;
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
    for (let row = 0; row <= promptRow; ++row)
        display.clearRow(row);
    for (let row = 0; row < lines.length; ++row)
        display.putstr(0, row, lines[row], NO_COLOR, 0);
    display.putstr(promptColumn, promptRow, MORE_PROMPT, NO_COLOR, 0);
    display.setCursor(promptColumn + MORE_PROMPT.length, promptRow);

    let response;
    for (;;) {
        const code = await nhgetch(state);
        // tty_nhgetch() maps NUL to Escape.  xwaitforspace("\033 ") also
        // accepts CR and LF; all other keys leave this boundary unchanged.
        if (code === 0 || code === 10 || code === 13
            || code === 27 || code === 32) {
            response = code;
            break;
        }
    }

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

// C ref: win/tty/topl.c update_topl().  Messages share the top line only
// when both fit with two separating spaces and room for a future --More--.
export async function ttyPline(message, state = game) {
    const next = recorderRawTtyText(message);
    const deathMessage = next.startsWith('You die');
    const columns = state.nhDisplay?.cols ?? 80;
    const stoppedAtEntry = Boolean(state._ttyMessageStopped);
    const current = state._pending_message ?? '';
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
    if (state === game && state.u?.ux) await flush_screen(1);
    // "You die" is update_topl()'s exception to WIN_STOP.  Other messages
    // continue updating gt.toplines for history but remain invisible.
    if (stoppedAtEntry && !deathComparisonReached) {
        rememberSuppressedMessage(state, next, columns);
        return;
    }
    if (stoppedAtEntry) state._ttyMessageStopped = false;

    if (current
        && !deathMessage
        && fitsOnTtyTopline(current, next, columns)) {
        rememberPendingMessage(state, `${current}  ${next}`);
        return;
    }
    if (current) await dismissPendingTtyMessage(state);
    // When the comparison above was reached, update_topl() clears WIN_STOP
    // after more() has had the opportunity to set it from an Escape response.
    if (deathComparisonReached) state._ttyMessageStopped = false;
    rememberPendingMessage(state, next);
    // redotoplin() immediately invokes more() when update_topl() wrapped the
    // new message onto a second terminal row.
    if (wrapTtyTopline(next, columns).length > 1)
        await dismissPendingTtyMessage(state);
}
