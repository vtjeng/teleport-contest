// topl.js -- TTY message history and previous-message display.
// C refs: win/tty/topl.c and the tty message window fields in wintty.c.

import {
    MAX_MSG_HISTORY,
    OVERRIDE_MSGTYPE,
    SUPPRESS_HISTORY,
    TOPLINE_SPECIAL_PROMPT,
    WIN_LOCKHISTORY,
    WIN_NOSTOP,
    WIN_STOP,
    quitchars,
} from './const.js';
import { game } from './gstate.js';
import { appendLongDigit, textBytes } from './hacklib.js';
import { ATR_NONE } from './terminal.js';
import {
    emitQueuedNotices,
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    TOPLINE_NON_EMPTY,
    dismissPendingTtyMessage,
    messageWindow,
    vplineRawPrint,
    vplineVisionRecalc,
} from './tty_message.js';

const CTRL_P = 0x10;
const ERASE_CHAR = 0x7F;
const BACKSPACE = 0x08;
const ESC = 0x1B;

function topline(state) {
    return String(state._ttyToplines ?? '');
}

// C's gt.toplines (decl.h:930) is the current top-line message.  update_topl()
// copies a message into it and replaces a space with a newline wherever the
// message must break (topl.c:266-267, 281-297).  Other code writes it itself,
// leaving no newlines: hooked_tty_getlin()'s strcpy() (getline.c:81),
// tty_yn_function()'s Sprintf() (topl.c:539), tty_putmsghistory()'s
// Strcpy() (topl.c:706, 717), and the `*gt.toplines = '\0'` of
// remember_topl() (topl.c:188) and getline.c:220.  redotoplin()'s putsyms()
// then wraps such a line at the terminal edge, splitting words.
//
// The port keeps gt.toplines without newlines in state._ttyToplines and lays
// it out with wrapTtyTopline(); state._ttyUnsplitToplines holds the same
// text when the line was written directly, and null otherwise (see
// toplineRows()).  The port keeps no other copy of the line.  Every writer
// calls one of the two functions below, naming the C path it ports;
// scripts/toplines-writer.test.mjs rejects any other assignment to these
// fields and any `toplines` property that could hold a second copy.
function writeToplines(text, state, unsplit) {
    const line = String(text);
    state._ttyToplines = line;
    state._ttyUnsplitToplines = unsplit ? line : null;
}

// A write of gt.toplines inside update_topl() (topl.c:266-267, 281).
export function setToplinesViaUpdateTopl(text, state) {
    writeToplines(text, state, false);
}

// A write of gt.toplines that bypasses update_topl(): strcpy(), Sprintf(),
// Strcpy() or a NUL store.
export function setToplinesDirectly(text, state) {
    writeToplines(text, state, true);
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
    // An entry copied from hooked_tty_getlin()'s gt.toplines holds no
    // update_topl() newlines, so redotoplin() later wraps it at the
    // terminal edge; see toplineRows().
    cw.unsplit ??= Array(rows).fill(false);
    cw.unsplit[idx] = text === state._ttyUnsplitToplines;
    // C pads the allocation size to a multiple of eight, including a full
    // eight bytes when the terminator already lands on a multiple of eight.
    const byteLength = textBytes(`${text}\0`).length;
    cw.datlen[idx] = byteLength + (8 - (byteLength & 7));
    if (!state.program_state?.in_checkpoint) {
        cw.maxcol = cw.maxrow = (idx + 1) % rows;
        setToplinesDirectly('', state);
        if (state.nhDisplay) state.nhDisplay.topMessage = '';
    }
}

// C ref: `cw->maxcol = cw->maxrow;`, the statement that follows
// tty_clear_nhwindow(WIN_MESSAGE) wherever a prompt redraws itself after a
// Ctrl-P recall (topl.c:441, 456; getline.c:92, 127, 135). The next recall
// then starts again from gt.toplines instead of continuing from the entry the
// prompt's recall stopped at. tty_clear_nhwindow() itself leaves the index
// alone. scripts/prevmsg-recall-index.test.mjs counts these sites.
export function recallFromNewest(state = game) {
    const cw = messageWindow(state);
    if (cw) cw.maxcol = cw.maxrow;
}

// C ref: topl.c addtopl() is the nonblocking top-line write used by the TTY
// message and prompt owners.  The grid is already source-positioned by those
// callers, so this only writes the newly supplied bytes and clears the tail.
export function addtopl(text, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    const start = display.cursorCol ?? 0;
    let column = start;
    // putsyms(s) prints the string's bytes. One the capture ignores still
    // advances the cursor.
    for (const byte of textBytes(text)) {
        if (column >= display.cols - 1) {
            // topl_putsym() advances the terminal cursor as it prints. Our
            // grid writes use setCell(), so move the cursor to the same
            // logical byte before cl_end() clears the wrapped row tail.
            display.setCursor(column, display.cursorRow ?? 0);
            display.clearToEol();
            display.setCursor(0, (display.cursorRow ?? 0) + 1);
            // topl_putsym()'s newline arm, topl.c:325.
            const cw = messageWindow(state);
            if (cw) cw.cury = display.cursorRow;
            column = 0;
        }
        display.putch(column, display.cursorRow ?? 0, String.fromCharCode(byte));
        ++column;
    }
    display.setCursor(column, display.cursorRow ?? 0);
    display.clearToEol();
}

// The physical rows addtopl() above leaves when it writes `text` from column
// 0: topl_putsym() moves to a new row before column CO-1, so each row holds
// CO-1 characters.
export function addtoplRows(text, columns) {
    const chars = [...String(text)];
    const width = Math.max(1, columns - 1);
    const rows = [];
    for (let start = 0; start < chars.length || !rows.length; start += width)
        rows.push(chars.slice(start, start + width).join(''));
    return rows;
}

// C ref: topl.c update_topl() 284-297.  The lines it splits gt.toplines
// into, each newline taking the place of a space.
function updateToplLines(message, columns) {
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
    return logicalLines;
}

// C ref: topl.c update_topl()'s line splitting and byte cursor rules.
// topl_putsym() starts a new row at a newline the text itself holds (a Lua
// error's traceback, nhl_pcall_handle()), as at one update_topl() put in;
// update_topl() counts those bytes as it splits.
export function wrapTtyTopline(message, columns) {
    const physicalWidth = Math.max(1, columns - 1);
    return updateToplLines(message, columns).flatMap((line) => line
        .split('\n').flatMap((part) => {
            if (!part.length) return [''];
            const rows = [];
            for (let start = 0; start < part.length; start += physicalWidth)
                rows.push(part.slice(start, start + physicalWidth));
            return rows;
        }));
}

// topl_putsym() passes each byte to putchar(), and recorder patch 006's
// nomux_putch() leaves the cell of a control or high byte as it was
// (GameDisplay.putch()) while the cursor moves past it.
export function writeRecorderTtyLine(display, row, value) {
    const line = String(value);
    let column = 0;
    for (const ch of line) {
        if (column >= display.cols) break;
        display.putch(column, row, ch);
        ++column;
    }
    display.setCursor(column, row);
    display.clearToEol();
}

export function appendRecorderTtyLine(display, startColumn, row, value) {
    let column = startColumn;
    for (const ch of String(value)) {
        if (column >= display.cols) break;
        display.putch(column, row, ch);
        ++column;
    }
    display.setCursor(column, row);
    display.clearToEol();
}

function rememberPendingMessage(state, message) {
    state._pending_message = message;
    setToplinesViaUpdateTopl(message, state);
    if (state.nhDisplay) {
        state.nhDisplay.topMessage = message;
        state.nhDisplay.toplin = TOPLINE_NEED_MORE;
    }
}

// `mixedFirstCell` is the cell recorder patch 006 captures for redotoplin()'s
// g_putch() of a tty_putmixed() line's first byte (topl.c:127-133): only
// while ttyDisplay->mixed is set and only for a high byte, so only on this
// first paint. The terminal grid is the only place that cell lives
// afterwards. A later putsyms() of the same byte is ignored by the capture
// (GameDisplay.putch()), so a repaint keeps whatever the cell then shows,
// and any other write over column 0 replaces the glyph, as on the terminal.
function redrawTtyTopline(state, message, mixedFirstCell = null) {
    const display = state.nhDisplay;
    if (!display) return;
    const lines = wrapTtyTopline(message, display.cols);
    for (let row = 0; row < lines.length; ++row) {
        // topl_putsym('\n') clears the row it moves onto before writing.
        if (row > 0) {
            display.setCursor(0, row);
            display.clearToEol();
        }
        writeRecorderTtyLine(display, row, lines[row]);
    }
    // redotoplin()'s g_putch() of a mixed line's first byte.
    if (mixedFirstCell && (String(message).charCodeAt(0) & 0x80))
        display.putCaptured(0, 0, mixedFirstCell);
    display.setCursor(lines.at(-1)?.length ?? 0, lines.length - 1);
}

export function fitsOnTtyTopline(prior, next, columns) {
    return wrapTtyTopline(prior, columns).length === 1
        && next.length + prior.length + 3
            < columns - '--More--'.length;
}

function rememberSuppressedMessage(state, message, columns) {
    const next = String(message);
    const current = state._ttyToplines ?? '';
    const sharesTopline = current
        && fitsOnTtyTopline(current, next, columns);
    if (current && !sharesTopline) remember_topl(state);
    const toplines = sharesTopline ? `${current}  ${next}` : next;
    setToplinesViaUpdateTopl(toplines, state);
}

// The layout of a top line, as redotoplin() paints it.  A line that
// setToplinesDirectly() wrote, which state._ttyUnsplitToplines holds, has no
// update_topl() newlines, so it wraps at the terminal edge; see the comment
// on writeToplines().  remember_topl() marks a history entry copied from such
// a line; redotoplin() takes that mark as `unsplit` and keeps the text it
// painted that way in _ttyUnsplitRedo, so a later repaint of the pending line
// keeps the same layout.
export function toplineRows(text, columns, state = game, unsplit = undefined) {
    const line = String(text ?? '');
    if (!line || !(unsplit ?? (line === state._ttyUnsplitToplines
        || line === state._ttyUnsplitRedo)))
        return wrapTtyTopline(line, columns);
    // topl_putsym() wraps when curx reaches CO - 1.
    const width = Math.max(1, columns - 1);
    const rows = [];
    for (let start = 0; start < line.length; start += width)
        rows.push(line.slice(start, start + width));
    return rows;
}

// C ref: topl.c redotoplin().  Wrapped text invokes more() after painting.
export async function redotoplin(text, state = game, unsplit = undefined) {
    const display = state.nhDisplay;
    if (!display) return;
    const oldToplin = display.toplin;
    // The TTY grid is the display cache; bot()/flush_screen() repaint from
    // this pending line after the command returns, while C has already left
    // the same bytes on its terminal.
    state._pending_message = text;
    display.topMessage = text;
    state._ttyUnsplitRedo = unsplit ? text : null;
    const lines = toplineRows(text, display.cols, state, unsplit);
    for (let row = 0; row < lines.length && row < display.rows; ++row) {
        display.setCursor(0, row);
        // home() leaves row 0 as it was; topl_putsym('\n') clears each row
        // it moves onto (topl.c:339-340) before putsyms() writes it.
        if (row > 0) display.clearToEol();
        // putsyms() prints each byte with topl_putsym(), whose capture
        // leaves the cell of a high or control byte as it was.
        for (let col = 0; col < lines[row].length && col < display.cols; ++col)
            display.putch(col, row, lines[row][col]);
        display.setCursor(Math.min(lines[row].length, display.cols - 1), row);
        display.clearToEol();
    }
    display.toplin = TOPLINE_NEED_MORE;
    if (lines.length > 1 && oldToplin !== TOPLINE_SPECIAL_PROMPT)
        await more(state);
}

// C ref: topl.c more(). tty_message.js owns the shared More prompt rendering,
// wait, wrapped-row repair, and Escape cleanup used by the TTY message window.
export async function more(state = game) {
    const display = state.nhDisplay;
    if (!display || state.iflags?.debug_fuzzer || display.inmore) return;
    display.inmore = (display.inmore ?? 0) + 1;
    try {
        await dismissPendingTtyMessage(state, {
            alwaysPrompt: true,
            // more() brackets the marker with standoutbeg()/standoutend()
            // when flags.standout is set. Those write the terminal's SO/SE
            // strings through xputs(), which recorder patch 006 does not copy
            // into its capture buffer, so the judged marker has no attribute.
            promptAttr: ATR_NONE,
            returnResponse: true,
        });
    } finally {
        display.inmore = 0;
    }
}

// C ref: pline.c vpline() copies each message it shows into gp.prevmsg, for
// a later Norep() or MSGTYPE=norep comparison. tty_putmixed() bypasses
// vpline() and leaves it alone.
function rememberPreviousMessage(state, context, message) {
    if (context.viaVpline === false) return;
    state._ttyPreviousMessage = context.normalizedMessage ?? message;
}

// C ref: win/tty/topl.c update_topl(). ttyPlineCore() handles vpline() and
// tty_putstr() setup, then calls here for the complete topline transition.
// The callbacks are the TTY rendering operations shared with tty_message.js;
// branch order, history changes, and wait decisions stay with this source unit.
export async function update_topl(message, state = game, context = {}) {
    const {
        mixedFirstCell = null,
        resetLastMessage = () => {},
        stoppedAtEntry = Boolean(messageWindow(state)?.flags & WIN_STOP),
        deathMessage = String(message).startsWith('You die'),
        deathComparisonReached = false,
        columns = state.nhDisplay?.cols ?? 80,
        callbacks = {},
    } = context;
    // topl.c appends only while TOPLINE_NEED_MORE is active. An answered
    // query can leave stale message text in the JS bookkeeping after C has
    // cleared the visible prompt and set TOPLINE_EMPTY.
    const current = state.nhDisplay?.toplin === TOPLINE_NEED_MORE
        || (stoppedAtEntry && deathComparisonReached)
        ? (state._pending_message ?? '') : '';
    const next = String(message);

    // topl.c's same-line condition evaluates the death comparison only after
    // the room and cursor terms pass; its caller supplies that comparison
    // result because the pline layer also uses it when handling WIN_STOP.
    if (stoppedAtEntry && !deathComparisonReached) {
        rememberSuppressedMessage(state, next, columns);
        rememberPreviousMessage(state, context, message);
        resetLastMessage();
        return;
    }

    if (current
        && !deathMessage
        && fitsOnTtyTopline(current, next, columns)) {
        rememberPendingMessage(state, `${current}  ${next}`);
        if (!stoppedAtEntry && state.nhDisplay) {
            appendRecorderTtyLine(
                state.nhDisplay,
                current.length + 2,
                0,
                next,
            );
        }
        rememberPreviousMessage(state, context, message);
        resetLastMessage();
        return;
    }

    // Both waits below are topl.c more(), which returns at once while
    // iflags.debug_fuzzer is set (yn_function()'s TEMP impossible() report).
    const moreSuppressed = Boolean(state.iflags?.debug_fuzzer);
    if (current && !stoppedAtEntry && !moreSuppressed) {
        await callbacks.dismissPendingTtyMessage?.(state);
    }
    // topl.c:298-299: a "You die" line that reached the same-line test
    // clears WIN_STOP and is shown. With WIN_STOP set at entry, neither the
    // same-line append nor more() above ran, so clearing it here, after
    // them, is the source order. With WIN_STOP clear at entry, this clears
    // the bit an Escape at that more() may just have set, as C does.
    if (deathComparisonReached) {
        const cw = messageWindow(state);
        if (cw) cw.flags &= ~WIN_STOP;
    }
    if (state._ttyToplines) remember_topl(state);
    rememberPendingMessage(state, next);
    rememberPreviousMessage(state, context, message);
    // C update_topl() ends every unsuppressed replacement with redotoplin(),
    // including after the more() above. Remembering it until the next map
    // flush would leave the old physical line visible to missile animation.
    redrawTtyTopline(state, next, mixedFirstCell);
    if (wrapTtyTopline(next, columns).length > 1 && !moreSuppressed) {
        await callbacks.dismissPendingTtyMessage?.(state);
    }
    resetLastMessage();
}

// C refs: topl.c topl_putsym(), putsyms() and removetopl().
// `ch` is one byte, as a one-character string whose code is below 256.
export function topl_putsym(ch, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    if (ch === '\b') {
        if (display.cursorCol === 0 && display.cursorRow > 0)
            display.setCursor(display.cols - 1, display.cursorRow - 1);
        if (display.cursorCol > 0)
            display.setCursor(display.cursorCol - 1, display.cursorRow);
    } else if (ch === '\n') {
        // topl.c:322 clears the rest of the row the cursor leaves; then
        // topl.c:339-340, `if (cw->curx == 0) cl_end()`, clears the whole
        // row it moves onto, so a wrapped prompt hides the map row under it.
        display.clearToEol();
        display.setCursor(0, display.cursorRow + 1);
        // topl.c:325, cw->cury = ttyDisplay->cury.
        const cw = messageWindow(state);
        if (cw) cw.cury = display.cursorRow;
        display.clearToEol();
    } else {
        if (display.cursorCol === display.cols - 1)
            topl_putsym('\n', state);
        // putchar(c) passes a signed char: recorder patch 006's
        // nomux_putch() leaves the cell as it was for a high or control
        // byte, while ttyDisplay->curx has already advanced past it.
        display.putch(display.cursorCol, display.cursorRow, ch);
        display.setCursor(display.cursorCol + 1, display.cursorRow);
    }
}

export function putsyms(text, state = game) {
    // C's putsyms(const char *) prints each byte up to the first NUL.
    for (const byte of textBytes(String(text).split('\0', 1)[0]))
        topl_putsym(String.fromCharCode(byte), state);
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
    const items = reversed
        ? [topline(state), ...reversedHistory(state)]
        : [...chronologicalHistory(state), topline(state)];
    const { displayTtyMenuTextWindow } = await import('./tty_menu.js');
    await displayTtyMenuTextWindow(state, ['Message History', '', ...items]);
}

// C ref: topl.c tty_doprev_message() reversed arm (85-95). It starts one slot
// before maxrow and walks backwards until it comes round to maxrow, so the
// oldest slot, data[maxrow], is never shown; a null slot also ends the walk.
// tty_putstr() ignores a null string (wintty.c:2245).
function reversedHistory(state) {
    const cw = messageWindow(state);
    if (!cw?.data) return [];
    const rows = historyRows(state);
    const maxrow = cw.maxrow ?? 0;
    const result = [];
    let maxcol = maxrow - 1;
    if (maxcol < 0) maxcol = rows - 1;
    do {
        const item = cw.data[maxcol];
        if (item != null) result.push(item);
        maxcol--;
        if (maxcol < 0) maxcol = rows - 1;
        if (cw.data[maxcol] == null) maxcol = maxrow;
    } while (maxcol !== maxrow);
    return result;
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
            do {
                display.morc = 0;
                if (cw.maxcol === cw.maxrow) {
                    display.dismiss_more = CTRL_P;
                    await redotoplin(topline(state), state);
                    cw.maxcol = (cw.maxcol + historyRows(state) - 1) % historyRows(state);
                    if (!cw.data[cw.maxcol]) cw.maxcol = cw.maxrow;
                } else if (cw.maxcol === cw.maxrow - 1) {
                    display.dismiss_more = CTRL_P;
                    await redotoplin(cw.data[cw.maxcol], state,
                        cw.unsplit?.[cw.maxcol]);
                    cw.maxcol = (cw.maxcol + historyRows(state) - 1) % historyRows(state);
                    if (!cw.data[cw.maxcol]) cw.maxcol = cw.maxrow;
                } else {
                    cw.maxcol = cw.maxrow;
                    await showHistoryMenu(state);
                }
            } while (display.morc === CTRL_P);
            display.dismiss_more = 0;
        } else {
            await showHistoryMenu(state, true);
            cw.maxcol = cw.maxrow;
            display.dismiss_more = 0;
        }
    } else if (mode === 's') {
        display.dismiss_more = CTRL_P;
        do {
            display.morc = 0;
            const index = cw.maxcol === cw.maxrow ? null : cw.maxcol;
            if (index == null)
                await redotoplin(topline(state), state);
            else if (cw.data[index])
                await redotoplin(cw.data[index], state, cw.unsplit?.[index]);
            cw.maxcol = (cw.maxcol + historyRows(state) - 1) % historyRows(state);
            if (!cw.data[cw.maxcol]) cw.maxcol = cw.maxrow;
        } while (display.morc === CTRL_P);
        display.dismiss_more = 0;
    }
    return 0;
}

// C's cw->data[] strings, oldest first.  An entry remember_topl() copied
// from an update_topl() line holds that function's newlines; one copied
// from a line written directly holds none.  The port's entries hold no
// newlines and carry that difference in cw.unsplit, so this puts them back.
function savedHistory(state) {
    const cw = messageWindow(state);
    if (!cw?.data) return [];
    const rows = historyRows(state);
    const columns = state.nhDisplay?.cols ?? 80;
    const result = [];
    for (let i = 0, idx = cw.maxrow ?? 0; i < rows; ++i, idx = (idx + 1) % rows) {
        const item = cw.data[idx];
        if (!item) continue;
        result.push(cw.unsplit?.[idx]
            ? item : updateToplLines(item, columns).join('\n'));
    }
    return result;
}

// C ref: topl.c msghistory_snapshot().  The entries are C's strings; see
// savedHistory().
function snapshot(state, purge) {
    const cw = messageWindow(state);
    if (!cw) return null;
    remember_topl(state);
    if (!purge) cw.flags |= WIN_LOCKHISTORY;
    const entries = savedHistory(state);
    if (purge) {
        cw.data = Array(historyRows(state)).fill(null);
        cw.datlen = Array(historyRows(state)).fill(0);
        cw.unsplit = Array(historyRows(state)).fill(false);
        cw.maxcol = cw.maxrow = 0;
    }
    return entries;
}

// C refs: topl.c msghistory_snapshot(), free_msghistory_snapshot(),
// tty_getmsghistory(), and tty_putmsghistory().  Save/restore uses copied
// strings in JavaScript rather than C-owned pointer arrays.
// The port's callers read the text, so this returns it without
// update_topl()'s newlines.
export function msghistory_snapshot(purge = false, state = game) {
    return snapshot(state, purge)?.map((entry) => entry.replaceAll('\n', ' '))
        ?? null;
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
// topl.c:676-726.  _ttyRestoreInitialized is the function's static `initd`
// and _ttyRestoreSnapshot the snapshot_mesgs it fills.  The first restored
// message moves the messages issued this session, such as unixmain.c's
// "Restoring save file...", out of the history, and the null call puts them
// back after the restored ones.  Each message also lowers a top line still
// awaiting --More-- to TOPLINE_NON_EMPTY, so cls() in dorecover() does not
// stop for "Restoring save file...".
export function tty_putmsghistory(message, restoring = false, state = game) {
    const cw = messageWindow(state);
    if (!cw) return;
    if (restoring && !state._ttyRestoreInitialized) {
        state._ttyRestoreSnapshot = snapshot(state, true);
        state._ttyRestoreInitialized = true;
    }
    if (message != null) {
        if (state.nhDisplay?.toplin === TOPLINE_NEED_MORE)
            state.nhDisplay.toplin = TOPLINE_NON_EMPTY;
        remember_topl(state);
        setTopline(String(message), state);
    } else if (state._ttyRestoreSnapshot) {
        for (const entry of state._ttyRestoreSnapshot) {
            remember_topl(state);
            setTopline(entry, state);
        }
        state._ttyRestoreSnapshot = null;
        state._ttyRestoreInitialized = false;
    }
}

// topl.c:706 and :717 Strcpy() the message into gt.toplines.  A caller's
// message holds no update_topl() newlines, so ^P wraps it at the terminal
// edge.  A message restored from a save file or from the snapshot is one of
// C's history strings (see savedHistory()): one that update_topl() split
// still holds its newlines, so it keeps that layout.  One without a newline
// is taken as a direct write: had update_topl() written it, it fitted on one
// row or had no space to split at, and wraps the same either way.
function setTopline(message, state) {
    const text = String(message);
    if (text.includes('\n'))
        setToplinesViaUpdateTopl(text.replaceAll('\n', ' '), state);
    else setToplinesDirectly(text, state);
    if (state.nhDisplay) state.nhDisplay.topMessage = state._ttyToplines;
}

// C ref: wintty.c tty_clear_nhwindow() NHW_MESSAGE arm (1047-1058), as
// topl.c tty_yn_function() calls it after a Ctrl-P recall (topl.c:441, 455)
// and in clean_up after a wrapped prompt (topl.c:547).
// It does nothing once the message window is empty: a full or combination
// history window has already cleared it before drawing, so the map under the
// dismissed window stays as that window's repair left it. Otherwise it clears
// the top line and repairs any wrapped rows below it with docorner().
async function clearMessageWindow(state) {
    const display = state.nhDisplay;
    if (display.toplin === TOPLINE_EMPTY) return;
    const cw = messageWindow(state);
    display.setCursor(0, 0);
    display.clearToEol();
    if (cw?.cury) {
        const { docorner } = await import('./display.js');
        docorner(1, cw.cury + 1, 0, state);
    }
    if (cw) cw.curx = cw.cury = 0;
    display.toplin = TOPLINE_EMPTY;
}

// C ref: win/tty/topl.c tty_yn_function() (363-550).  Two arms.  With
// `resp == (char *) 0` any single keystroke is accepted and returned: the
// prompt is written, one key is read, and the function jumps straight to
// clean_up.  With a response set, the prompt names the allowed keys and their
// default and a loop rejects everything else.
//
// Three parts of the restricted arm retain source-specific handling here:
//   a set holding '#', which turns digits into a count in yn_number;
//   a set holding an uppercase letter, which suppresses lowc() on the answer;
//   a set holding <esc>, whose tail names responses the prompt hides.
// The Ctrl-P reprompt inside the loop stops as well, for the same reason
// hooked_tty_getlin() also routes Ctrl-P through tty_doprev_message().
//
// `def` is unread on the unrestricted arm; C names it because clean_up is
// shared, and on the restricted arm quitchars and Escape resolve to it.
export async function tty_yn_function(query, resp, def, state = game) {
    await emitQueuedNotices(state);
    const { readchar, key2txt } = await import('./cmd.js');
    const display = state.nhDisplay;
    if (!display) throw new Error('a yn prompt requires an initialized display');

    // C's file-global yn_number is scoped to one tty_yn_function() call. Keep
    // the equivalent on the game state so askchain() can consume a counted
    // response after yn_function() returns '#'.
    state.yn_number = 0;
    // topl.c:390-393: more() runs unless WIN_STOP is set without
    // WIN_NOSTOP; both bits are then cleared whether or not it ran.
    const cw = messageWindow(state);
    if (display.toplin === TOPLINE_NEED_MORE
        && (cw?.flags & (WIN_STOP | WIN_NOSTOP)) !== WIN_STOP)
        await dismissPendingTtyMessage(state);
    if (cw) cw.flags &= ~(WIN_STOP | WIN_NOSTOP);
    // topl.c:394-395 marks a special prompt and raises inread.
    display.toplin = TOPLINE_SPECIAL_PROMPT;
    display.inread = (display.inread ?? 0) + 1;

    // Both arms end in the same
    // custompline(OVERRIDE_MSGTYPE | SUPPRESS_HISTORY, "%s", prompt); they
    // differ only in the prompt they build for it.  The restricted arm's
    // trailing space is already in the string, "in case of reprompt".
    const preserveCase = resp !== null && /[A-Z]/u.test(resp);
    let prompt;
    if (resp !== null) {
        /* normally we force lowercase, but if any uppercase letters
           are present in the allowed response, preserve case */
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
    // vpline() raw_print()s the prompt instead when the windows are not
    // initialized (vplineRawPrint()); the rest of the custompline() follows.
    if (!vplineRawPrint(prompt, state)) {
        if (state.u?.ux && !state._bonesRestorePrompt) {
            // C custompline() enters vpline(): deferred vision precedes the
            // map flush even for a restricted or unrestricted input prompt.
            // Keep the same live owner as ttyPlineCore and the existing
            // restore safeguard.
            await vplineVisionRecalc(
                OVERRIDE_MSGTYPE | SUPPRESS_HISTORY, state,
            );
            const { flush_screen } = await import('./display.js');
            await flush_screen(1);
        }
        // custompline(SUPPRESS_HISTORY) remembers the old line, then draws
        // this prompt without adding it to history yet.
        remember_topl(state);
        show_topl(prompt, state);
        // remember_topl() emptied gt.toplines and addtopl() does not write
        // it, so until clean_up rewrites it the prompt is on screen but not
        // in gt.toplines; tty_doprev_message() reads the empty string.
        setToplinesDirectly('', state);
        state._pending_message = '';
        // addtopl() leaves ttyDisplay->toplin at TOPLINE_NEED_MORE.
        display.toplin = TOPLINE_NEED_MORE;
        state._ttyPreviousMessage = prompt;
    }

    // Every key below is the byte readchar() returns, as on the unrestricted
    // arm; `def` arrives as the one-character string its callers spell, and
    // clean_up converts the answer to the same form.
    const defByte = def ? def.charCodeAt(0) : 0;
    let q;
    let doprev = false;
    // The count that addtopl() echoed after the prompt.  Only the abort path
    // at topl.c:526-527 removes it with removetopl(); otherwise it stays on
    // the physical line after clean_up, as typed ("#05" for a count of 5,
    // "#0" for the 'n' answer a zero count gives).
    let echoedCount = '';
    let ynNumberText = ''; /* "%ld" of yn_number at clean_up */
    if (resp === null) {
        q = await readchar(state);
    } else {
        do { /* loop until we get valid input */
            q = await readchar(state);
            /* !preserve_case */
            if (!preserveCase && q >= 0x41 && q <= 0x5A) q |= 0x20;
            if (q === CTRL_P) {
                const mode = state.iflags?.prevmsg_window ?? 's';
                if (mode !== 's') {
                    const savedInread = display.inread;
                    display.inread = 0;
                    await tty_doprev_message(state);
                    display.inread = savedInread;
                    await clearMessageWindow(state);
                    recallFromNewest(state);
                    // topl.c:442 redraws the prompt with addtopl(), which
                    // leaves gt.toplines empty.
                    show_topl(prompt, state);
                    setToplinesDirectly('', state);
                    display.toplin = TOPLINE_NEED_MORE;
                } else {
                    if (!doprev) await tty_doprev_message(state);
                    await tty_doprev_message(state);
                    doprev = true;
                }
                q = 0;
                continue;
            } else if (doprev) {
                await clearMessageWindow(state);
                recallFromNewest(state);
                show_topl(prompt, state);
                setToplinesDirectly('', state);
                display.toplin = TOPLINE_NEED_MORE;
                doprev = false;
                q = 0;
                continue;
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
            const allowNum = resp.includes('#');
            const digitOk = allowNum && q >= 0x30 && q <= 0x39;
            if (!resp.includes(String.fromCharCode(q)) && !digitOk) {
                // tty_nhbell(), which writes no cell and moves no cursor.
                q = 0;
            } else if (q === 0x23 || digitOk) {
                // topl.c:478-529. A digit or '#' starts a count. The first
                // digit is part of the count, then digits continue until a
                // terminator. A positive count returns '#' and is exposed as
                // state.yn_number; zero and malformed counts follow C's no or
                // reprompt paths respectively.
                // C's long `value`, which a Number cannot hold exactly.
                let value = BigInt(q === 0x23 ? 0 : q - 0x30);
                let digitLength = q === 0x23 ? 0 : 1;
                let invalid = false;
                addtopl('#', state);
                echoedCount = '#';
                if (digitLength) {
                    addtopl(String.fromCharCode(q), state);
                    echoedCount += String.fromCharCode(q);
                }
                for (;;) {
                    const z = await readchar(state);
                    const lower = !preserveCase && z >= 0x41 && z <= 0x5A
                        ? z | 0x20 : z;
                    if (lower >= 0x30 && lower <= 0x39) {
                        value = appendLongDigit(value, lower - 0x30);
                        if (value < 0n) {
                            invalid = true; /* overflow: try again */
                            break;
                        }
                        addtopl(String.fromCharCode(lower), state);
                        echoedCount += String.fromCharCode(lower);
                        digitLength++;
                    } else if (lower === 0x79
                        || quitchars.includes(String.fromCharCode(lower))) {
                        if (lower === ESC) invalid = true;
                        break;
                    } else if (lower === ERASE_CHAR || lower === BACKSPACE) {
                        if (digitLength <= 0) {
                            invalid = true;
                            break;
                        }
                        value /= 10n;
                        digitLength--;
                        removetopl(1, state);
                        echoedCount = echoedCount.slice(0, -1);
                    } else {
                        invalid = true;
                        break;
                    }
                }
                if (invalid || value < 0n) {
                    removetopl(digitLength + 1, state); // include the leading '#'
                    echoedCount = '';
                    q = 0;
                } else if (value === 0n) {
                    q = 0x6e; // 'n'
                } else {
                    // Its readers only compare it with an object's quan.
                    state.yn_number = Number(value);
                    ynNumberText = String(value);
                    q = 0x23; // '#'
                }
            }
        } while (!q);
    }

    // clean_up: gt.toplines is rewritten as the prompt followed by the key,
    // so message recall shows the answered prompt rather than the bare query.
    const answerText = state.yn_number
        ? `#${ynNumberText}` : key2txt(q);
    // topl.c:539 writes gt.toplines with Sprintf(), not update_topl(), so a
    // recalled answer wider than the screen wraps at the terminal edge; see
    // toplineRows().
    setToplinesDirectly(`${prompt}${answerText}`, state);
    display.topMessage = state._ttyToplines;
    // The answer itself is not drawn: C's `addtopl(rtmp)` at topl.c:541 is
    // commented out in favour of rewriting gt.toplines. A one-line prompt
    // stays on the physical line with any count still echoed after it, and
    // js/display.js _buildScreenOutput() repaints row 0 from
    // _pending_message. TOPLINE_NON_EMPTY is what stops
    // the next message treating that line as one awaiting --More--, exactly
    // as topl.c update_topl():262 does.
    //
    // topl.c:544-548 sets TOPLINE_NON_EMPTY, then clears WIN_MESSAGE when
    // the prompt wrapped (cw->cury nonzero). That clear is
    // tty_clear_nhwindow(WIN_MESSAGE), whose docorner() repaints the map
    // rows the prompt covered.
    display.toplin = TOPLINE_NON_EMPTY;
    if (messageWindow(state)?.cury) {
        await clearMessageWindow(state);
        state._pending_message = '';
    } else {
        state._pending_message = `${prompt}${echoedCount}`;
    }
    display.inread = Math.max(0, display.inread - 1);
    if (display.intr) --display.intr;
    // C returns `char q`; see js/cmd.js yn_function() for the rule on
    // answer types.
    return String.fromCharCode(q & 0xFF);
}

export function show_topl(text, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    const win = messageWindow(state);
    // topl.c:150-153: show if either WIN_STOP is clear or this message is
    // WIN_NOSTOP, then clear both bits.
    if ((win?.flags & (WIN_STOP | WIN_NOSTOP)) === WIN_STOP) return false;
    if (win) win.flags &= ~(WIN_STOP | WIN_NOSTOP);
    const oldToplin = display.toplin;
    if (display.cursorRow && oldToplin === TOPLINE_NON_EMPTY) {
        display.clearRow(0);
        display.setCursor(0, 0);
    }
    // topl.c:157, cw->curx = cw->cury = 0.
    if (win) win.curx = win.cury = 0;
    display.setCursor(0, 0);
    for (let col = 0; col < display.cols; ++col) display.clearCell(col, 0);
    addtopl(text, state);
    display.toplin = TOPLINE_NEED_MORE;
    if (display.cursorRow) display.toplin = TOPLINE_NON_EMPTY;
    return true;
}

export { chronologicalHistory };
