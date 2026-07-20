// tty_message.js -- Source-shaped TTY top-line message boundaries.
// C refs: win/tty/topl.c update_topl(), more(), and xwaitforspace().

import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { NO_COLOR } from './terminal.js';

const MORE_PROMPT = '--More--';
const TOPLINE_EMPTY = 0;
const TOPLINE_NEED_MORE = 1;

function snapshotRows(display, rowCount) {
    return {
        rows: display.grid.slice(0, rowCount).map(
            (row) => row.map((cell) => ({ ...cell })),
        ),
        cursor: [display.cursorCol, display.cursorRow],
    };
}

function restoreRows(display, snapshot) {
    for (let row = 0; row < snapshot.rows.length; ++row) {
        for (let column = 0; column < snapshot.rows[row].length; ++column) {
            const cell = snapshot.rows[row][column];
            display.setCell(column, row, cell.ch, cell.color, cell.attr);
        }
    }
    display.setCursor(...snapshot.cursor);
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

// C ref: win/tty/topl.c more().  Startup messages are held as pending state
// until an input boundary, so the snapshot is the unobscured map/status frame
// that docorner() restores after --More-- is dismissed.
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
    const snapshot = snapshotRows(display, promptRow + 1);
    for (let row = 0; row <= promptRow; ++row)
        display.clearRow(row);
    for (let row = 0; row < lines.length; ++row)
        display.putstr(0, row, lines[row], NO_COLOR, 0);
    display.putstr(promptColumn, promptRow, MORE_PROMPT, NO_COLOR, 0);
    display.setCursor(promptColumn + MORE_PROMPT.length, promptRow);

    let response;
    for (;;) {
        const code = await nhgetch();
        // tty_nhgetch() maps NUL to Escape.  xwaitforspace("\033 ") also
        // accepts CR and LF; all other keys leave this boundary unchanged.
        if (code === 0 || code === 10 || code === 13
            || code === 27 || code === 32) {
            response = code;
            break;
        }
    }

    restoreRows(display, snapshot);
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

function rememberSuppressedMessage(state, message, columns) {
    const next = String(message);
    const current = state._ttyToplines ?? '';
    const sharesTopline = current
        && wrapTtyTopline(current, columns).length === 1
        && next.length + current.length + 3
            < columns - MORE_PROMPT.length;
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
    const next = String(message);
    const columns = state.nhDisplay?.cols ?? 80;
    // "You die" is update_topl()'s exception to WIN_STOP.  Other messages
    // continue updating gt.toplines for history but remain invisible.
    if (state._ttyMessageStopped && !next.startsWith('You die')) {
        rememberSuppressedMessage(state, next, columns);
        return;
    }
    if (state._ttyMessageStopped) state._ttyMessageStopped = false;

    const current = state._pending_message ?? '';
    const currentLines = wrapTtyTopline(current, columns);
    if (current
        && currentLines.length === 1
        && next.length + current.length + 3 < columns - MORE_PROMPT.length) {
        rememberPendingMessage(state, `${current}  ${next}`);
        return;
    }
    if (current) await dismissPendingTtyMessage(state);
    rememberPendingMessage(state, next);
    // redotoplin() immediately invokes more() when update_topl() wrapped the
    // new message onto a second terminal row.
    if (wrapTtyTopline(next, columns).length > 1)
        await dismissPendingTtyMessage(state);
}
