// topl.js -- TTY message history and previous-message display.
// C refs: win/tty/topl.c and the tty message window fields in wintty.c.

import {
    MAX_MSG_HISTORY,
    TOPLINE_SPECIAL_PROMPT,
    WIN_LOCKHISTORY,
    WIN_NOSTOP,
    WIN_STOP,
} from './const.js';
import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { NO_COLOR } from './terminal.js';
import {
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    TOPLINE_NON_EMPTY,
} from './tty_message.js';

const CTRL_P = 0x10;
const ESC = 0x1B;

function messageWindow(state) {
    const wt = state.wintty;
    return wt?.wins?.[wt.messageWindow] ?? null;
}

function topline(state) {
    return String(state._ttyToplines ?? state.nhDisplay?.toplines ?? '');
}

function historyRows(state) {
    const cw = messageWindow(state);
    if (!cw) return MAX_MSG_HISTORY;
    return Math.max(1, cw.rows ?? MAX_MSG_HISTORY);
}

// C ref: win/tty/topl.c remember_topl().  WinDesc.data is the single owner of
// the circular history; maxrow is both the next write slot and the oldest
// entry, while maxcol is the position Ctrl-P currently displays.
export function remember_topl(state = game) {
    const cw = messageWindow(state);
    const text = topline(state);
    if (!cw || (cw.flags & WIN_LOCKHISTORY) || !text) return;
    const rows = historyRows(state);
    cw.data ??= Array(rows).fill(null);
    cw.datlen ??= Array(rows).fill(0);
    const idx = cw.maxrow ?? 0;
    cw.data[idx] = text;
    // C pads the allocation size to a multiple of eight, including a full
    // eight bytes when the terminator already lands on a multiple of eight.
    const byteLength = new TextEncoder().encode(`${text}\0`).length;
    cw.datlen[idx] = byteLength + (8 - (byteLength & 7));
    if (!state.program_state?.in_checkpoint) {
        cw.maxcol = cw.maxrow = (idx + 1) % rows;
        state._ttyToplines = '';
        if (state.nhDisplay) {
            state.nhDisplay.toplines = '';
            state.nhDisplay.topMessage = '';
        }
    }
}

// C ref: topl.c addtopl() is the nonblocking top-line write used by the TTY
// message and prompt owners.  The grid is already source-positioned by those
// callers, so this only writes the newly supplied bytes and clears the tail.
export function addtopl(text, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    const start = display.cursorCol ?? 0;
    let column = start;
    for (const ch of String(text)) {
        if (column >= display.cols - 1) {
            display.clearToEol();
            display.setCursor(0, (display.cursorRow ?? 0) + 1);
            column = 0;
        }
        display.setCell(column++, display.cursorRow ?? 0, ch, NO_COLOR, 0);
    }
    display.setCursor(column, display.cursorRow ?? 0);
    display.clearToEol();
}

function wrapTopline(text, columns) {
    const lines = [];
    let rest = String(text);
    while (rest.length >= columns) {
        let split = columns - 1;
        while (split > 0 && rest[split] !== ' ') --split;
        if (!split) {
            split = rest.indexOf(' ');
            if (split < 0) break;
        }
        lines.push(rest.slice(0, split));
        rest = rest.slice(split + 1);
    }
    lines.push(rest);
    return lines;
}

// C ref: topl.c redotoplin().  Wrapped text invokes more() after painting.
export async function redotoplin(text, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    const oldToplin = display.toplin;
    // The TTY grid is the display cache; bot()/flush_screen() repaint from
    // this pending line after the command returns, while C has already left
    // the same bytes on its terminal.
    state._pending_message = text;
    display.topMessage = text;
    const lines = wrapTopline(text, display.cols);
    for (let row = 0; row < lines.length && row < display.rows; ++row) {
        display.setCursor(0, row);
        for (let col = 0; col < lines[row].length && col < display.cols; ++col)
            display.setCell(col, row, lines[row][col], NO_COLOR, 0);
        display.setCursor(Math.min(lines[row].length, display.cols - 1), row);
        display.clearToEol();
    }
    display.toplin = TOPLINE_NEED_MORE;
    if (lines.length > 1 && oldToplin !== TOPLINE_SPECIAL_PROMPT)
        await more(state);
}

// C ref: topl.c more(), with xwaitforspace()'s TTY key acceptance.
export async function more(state = game) {
    const display = state.nhDisplay;
    if (!display || state.iflags?.debug_fuzzer || display.inmore) return;
    display.inmore = (display.inmore ?? 0) + 1;
    const row = Math.min(display.cursorRow ?? 0, display.rows - 1);
    let column = Math.min(display.cursorCol ?? 0, display.cols - 1);
    if (display.toplin) {
        if (column >= display.cols - 8) {
            display.setCursor(0, Math.min(row + 1, display.rows - 1));
            column = 0;
        }
        const marker = '--More--';
        for (const ch of marker) {
            if (column >= display.cols) break;
            display.setCell(column++, display.cursorRow, ch, NO_COLOR, 0);
        }
    }
    const dismissMore = display.dismiss_more ?? 0;
    let key;
    for (;;) {
        key = await nhgetch(state);
        if (key === 10 || key === 13) break;
        if (state.iflags?.cbreak
            && (key === ESC || key === 32
                || (dismissMore && key === dismissMore))) break;
        if (state.iflags?.cbreak) continue;
    }
    display.morc = key;
    if (key === ESC && !(messageWindow(state)?.flags & WIN_NOSTOP))
        messageWindow(state).flags |= WIN_STOP;
    display.toplin = TOPLINE_EMPTY;
    display.inmore = 0;
}

// C ref: topl.c update_topl() history boundary. ttyPlineCore() performs the
// terminal and --More-- work; this named function supplies its ring write.
export function update_topl(_message, state = game) {
    remember_topl(state);
}

// C refs: topl.c topl_putsym(), putsyms() and removetopl().
export function topl_putsym(ch, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    if (ch === '\b') {
        if (display.cursorCol === 0 && display.cursorRow > 0)
            display.setCursor(display.cols - 1, display.cursorRow - 1);
        if (display.cursorCol > 0)
            display.setCursor(display.cursorCol - 1, display.cursorRow);
    } else if (ch === '\n') {
        display.clearToEol();
        display.setCursor(0, display.cursorRow + 1);
    } else {
        if (display.cursorCol === display.cols - 1)
            topl_putsym('\n', state);
        display.setCell(display.cursorCol, display.cursorRow, ch, NO_COLOR, 0);
        display.setCursor(display.cursorCol + 1, display.cursorRow);
    }
}

export function putsyms(text, state = game) {
    for (const ch of String(text)) topl_putsym(ch, state);
}

export function removetopl(count, state = game) {
    while (count-- > 0) putsyms('\b \b', state);
}

function chronologicalHistory(state) {
    const cw = messageWindow(state);
    if (!cw?.data) return [];
    const rows = historyRows(state);
    const result = [];
    for (let i = 0, idx = cw.maxrow ?? 0; i < rows; ++i, idx = (idx + 1) % rows) {
        const item = cw.data[idx];
        if (item) result.push(item);
    }
    return result;
}

async function showHistoryMenu(state, reversed = false) {
    const items = chronologicalHistory(state);
    if (reversed) items.reverse();
    items.push(topline(state));
    const { displayTtyMenuTextWindow } = await import('./tty_menu.js');
    await displayTtyMenuTextWindow(state, ['Message History', '', ...items]);
}

// C ref: topl.c tty_doprev_message(), including single, full, combination,
// and reversed history modes.  This return is discarded by cmd.c.
export async function tty_doprev_message(state = game) {
    const cw = messageWindow(state);
    if (!cw) return 0;
    const mode = state.iflags?.prevmsg_window ?? 's';
    const display = state.nhDisplay;
    if (mode !== 's' && !display?.inread) {
        if (mode === 'f') {
            cw.maxcol = cw.maxrow;
            await showHistoryMenu(state);
        } else if (mode === 'c') {
            if (cw.maxcol === cw.maxrow || cw.maxcol === cw.maxrow - 1) {
                display.dismiss_more = CTRL_P;
                const index = cw.maxcol === cw.maxrow
                    ? cw.maxrow : (cw.maxcol + historyRows(state) - 1) % historyRows(state);
                await redotoplin(index === cw.maxrow ? topline(state) : cw.data[index] ?? '', state);
                cw.maxcol = (index + historyRows(state) - 1) % historyRows(state);
                if (!cw.data[cw.maxcol]) cw.maxcol = cw.maxrow;
            } else {
                cw.maxcol = cw.maxrow;
                await showHistoryMenu(state);
            }
        } else {
            await showHistoryMenu(state, true);
            cw.maxcol = cw.maxrow;
            display.dismiss_more = 0;
        }
    } else {
        display.dismiss_more = CTRL_P;
        do {
            display.morc = 0;
            const index = cw.maxcol === cw.maxrow ? null : cw.maxcol;
            if (index == null)
                await redotoplin(topline(state), state);
            else if (cw.data[index])
                await redotoplin(cw.data[index], state);
            cw.maxcol = (cw.maxcol + historyRows(state) - 1) % historyRows(state);
            if (!cw.data[cw.maxcol]) cw.maxcol = cw.maxrow;
        } while (display.morc === CTRL_P);
        display.dismiss_more = 0;
    }
    return 0;
}

function snapshot(state, purge) {
    const cw = messageWindow(state);
    if (!cw) return null;
    remember_topl(state);
    if (!purge) cw.flags |= WIN_LOCKHISTORY;
    const entries = chronologicalHistory(state);
    if (purge) {
        cw.data = Array(historyRows(state)).fill(null);
        cw.datlen = Array(historyRows(state)).fill(0);
        cw.maxcol = cw.maxrow = 0;
    }
    return entries;
}

// C refs: topl.c msghistory_snapshot(), free_msghistory_snapshot(),
// tty_getmsghistory(), and tty_putmsghistory().  Save/restore uses copied
// strings in JavaScript rather than C-owned pointer arrays.
export function msghistory_snapshot(purge = false, state = game) {
    return snapshot(state, purge);
}
export function free_msghistory_snapshot(_purged = false, state = game) {
    const cw = messageWindow(state);
    if (cw) cw.flags &= ~WIN_LOCKHISTORY;
}
export function tty_getmsghistory(init = true, state = game) {
    if (init) state._ttyHistorySnapshot = snapshot(state, false);
    const entries = state._ttyHistorySnapshot ?? [];
    const next = entries.shift() ?? null;
    if (next === null) {
        state._ttyHistorySnapshot = null;
        free_msghistory_snapshot(false, state);
    }
    return next;
}
export function tty_putmsghistory(message, restoring = false, state = game) {
    const cw = messageWindow(state);
    if (!cw) return;
    if (restoring && !state._ttyRestoreInitialized) {
        state._ttyRestoreSnapshot = snapshot(state, true);
        state._ttyRestoreInitialized = true;
    }
    if (message == null) {
        const prior = state._ttyRestoreHistory ?? [];
        const current = state._ttyRestoreSnapshot ?? [];
        state._ttyRestoreHistory = null;
        for (const entry of prior) {
            remember_topl(state);
            setTopline(entry, state);
        }
        for (const entry of current) {
            remember_topl(state);
            setTopline(entry, state);
        }
        state._ttyRestoreSnapshot = null;
        state._ttyRestoreInitialized = false;
        return;
    }
    if (!restoring) {
        if (state.nhDisplay?.toplin === TOPLINE_NEED_MORE)
            state.nhDisplay.toplin = TOPLINE_NON_EMPTY;
        remember_topl(state);
        setTopline(String(message), state);
        return;
    }
    (state._ttyRestoreHistory ??= []).push(String(message));
}

function setTopline(text, state) {
    state._ttyToplines = text;
    if (state.nhDisplay) {
        state.nhDisplay.toplines = text;
        state.nhDisplay.topMessage = text;
    }
}

// C refs: topl.c show_topl(); tty_yn_function() itself is in getline.js,
// where prompt input and history dispatch share the original caller.
export function show_topl(text, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    const win = messageWindow(state);
    const flags = win?.flags ?? 0;
    if ((flags & (WIN_STOP | WIN_NOSTOP)) === WIN_STOP) return false;
    if (win) win.flags &= ~(WIN_STOP | WIN_NOSTOP);
    const oldToplin = display.toplin;
    if (display.cursorRow && oldToplin === TOPLINE_NON_EMPTY) {
        display.clearRow(0);
        display.setCursor(0, 0);
    }
    display.setCursor(0, 0);
    for (let col = 0; col < display.cols; ++col) display.setCell(col, 0, ' ', NO_COLOR, 0);
    addtopl(text, state);
    display.toplin = TOPLINE_NEED_MORE;
    if (display.cursorRow) display.toplin = TOPLINE_NON_EMPTY;
    return true;
}

export { chronologicalHistory };
