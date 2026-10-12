// topl.js -- TTY message history and previous-message display.
// C refs: win/tty/topl.c and the tty message window fields in wintty.c.

import {
    MAX_MSG_HISTORY,
    MSGTYP_STOP,
    TOPLINE_SPECIAL_PROMPT,
    WIN_LOCKHISTORY,
    WIN_NOSTOP,
    quitchars,
} from './const.js';
import { game } from './gstate.js';
import { ATR_INVERSE, ATR_NONE, NO_COLOR } from './terminal.js';
import {
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    TOPLINE_NON_EMPTY,
    dismissPendingTtyMessage,
} from './tty_message.js';

const CTRL_P = 0x10;
const ERASE_CHAR = 0x7F;
const BACKSPACE = 0x08;
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
            // topl_putsym() advances the terminal cursor as it prints. Our
            // grid writes use setCell(), so move the cursor to the same
            // logical byte before cl_end() clears the wrapped row tail.
            display.setCursor(column, display.cursorRow ?? 0);
            display.clearToEol();
            display.setCursor(0, (display.cursorRow ?? 0) + 1);
            column = 0;
        }
        display.setCell(column++, display.cursorRow ?? 0, ch, NO_COLOR, 0);
    }
    display.setCursor(column, display.cursorRow ?? 0);
    display.clearToEol();
}

// C ref: topl.c update_topl()'s line splitting and byte cursor rules.
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
    const physicalWidth = Math.max(1, columns - 1);
    return logicalLines.flatMap((line) => {
        if (!line.length) return [''];
        const rows = [];
        for (let start = 0; start < line.length; start += physicalWidth)
            rows.push(line.slice(start, start + physicalWidth));
        return rows;
    });
}

export function writeRecorderTtyLine(display, row, value) {
    const line = String(value);
    let column = 0;
    for (const ch of line) {
        if (column >= display.cols) break;
        if (ch !== '\0') display.setCell(column, row, ch, NO_COLOR, 0);
        ++column;
    }
    display.setCursor(column, row);
    display.clearToEol();
}

export function appendRecorderTtyLine(display, startColumn, row, value) {
    let column = startColumn;
    for (const ch of String(value)) {
        if (column >= display.cols) break;
        if (ch !== '\0') display.setCell(column, row, ch, NO_COLOR, 0);
        ++column;
    }
    display.setCursor(column, row);
    display.clearToEol();
}

function rememberPendingMessage(state, message, mixedFirstCell = null) {
    state._pending_message = message;
    if (mixedFirstCell) state._ttyMixedFirstCell = mixedFirstCell;
    else delete state._ttyMixedFirstCell;
    state._ttyToplines = message;
    if (state.nhDisplay) {
        state.nhDisplay.topMessage = message;
        state.nhDisplay.toplines = message;
        state.nhDisplay.toplin = TOPLINE_NEED_MORE;
    }
}

function redrawTtyTopline(state, message, mixedFirstCell = null) {
    const display = state.nhDisplay;
    if (!display) return;
    const lines = wrapTtyTopline(message, display.cols);
    for (let row = 0; row < lines.length; ++row)
        writeRecorderTtyLine(display, row, lines[row]);
    if (mixedFirstCell) display.setCell(0, 0, mixedFirstCell, NO_COLOR, 0);
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
    state._ttyToplines = toplines;
    if (state.nhDisplay) state.nhDisplay.toplines = toplines;
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
    const lines = wrapTtyTopline(text, display.cols);
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

// C ref: topl.c more(). tty_message.js owns the shared More prompt rendering,
// wait, wrapped-row repair, and Escape cleanup used by the TTY message window.
export async function more(state = game) {
    const display = state.nhDisplay;
    if (!display || state.iflags?.debug_fuzzer || display.inmore) return;
    display.inmore = (display.inmore ?? 0) + 1;
    try {
        await dismissPendingTtyMessage(state, {
            alwaysPrompt: true,
            dismissMore: display.dismiss_more ?? 0,
            promptAttr: state.flags?.standout ? ATR_INVERSE : ATR_NONE,
            returnResponse: true,
        });
    } finally {
        display.inmore = 0;
    }
}

// C ref: win/tty/topl.c update_topl(). ttyPlineCore() handles vpline() and
// tty_putstr() setup, then calls here for the complete topline transition.
// The callbacks are the TTY rendering operations shared with tty_message.js;
// branch order, history changes, and wait decisions stay with this source unit.
export async function update_topl(message, state = game, context = {}) {
    const {
        msgtype,
        urgentMessage = false,
        mixedFirstCell = null,
        resetLastMessage = () => {},
        stoppedAtEntry = Boolean(state._ttyMessageStopped),
        deathMessage = String(message).startsWith('You die'),
        deathComparisonReached = false,
        acknowledgedTopline = false,
        columns = state.nhDisplay?.cols ?? 80,
        callbacks = {},
    } = context;
    const current = state.nhDisplay?.toplin === TOPLINE_NON_EMPTY
        ? '' : (state._pending_message ?? '');
    const next = String(message);

    // topl.c's same-line condition evaluates the death comparison only after
    // the room and cursor terms pass; its caller supplies that comparison
    // result because the pline layer also uses it when handling WIN_STOP.
    if (stoppedAtEntry && !deathComparisonReached) {
        rememberSuppressedMessage(state, next, columns);
        state._ttyPreviousMessage = context.normalizedMessage ?? message;
        resetLastMessage();
        return;
    }
    if (stoppedAtEntry) state._ttyMessageStopped = false;

    if (current
        && !deathMessage
        && fitsOnTtyTopline(current, next, columns)) {
        rememberPendingMessage(
            state,
            `${current}  ${next}`,
            state._ttyMixedFirstCell ?? null,
        );
        if (!stoppedAtEntry && state.nhDisplay) {
            appendRecorderTtyLine(
                state.nhDisplay,
                current.length + 2,
                0,
                next,
            );
        }
        state._ttyPreviousMessage = context.normalizedMessage ?? message;
        resetLastMessage();
        if (msgtype === MSGTYP_STOP)
            await callbacks.displayPendingTtyMessageWindow?.(state);
        return;
    }

    if (current && !stoppedAtEntry) {
        await callbacks.dismissPendingTtyMessage?.(state, {
            preventEscapeStop: urgentMessage,
        });
    }
    if (deathComparisonReached) state._ttyMessageStopped = false;
    if (acknowledgedTopline) {
        redrawTtyTopline(state, next, mixedFirstCell);
    }
    if (state._ttyToplines) remember_topl(state);
    rememberPendingMessage(state, next, mixedFirstCell);
    state._ttyPreviousMessage = context.normalizedMessage ?? message;
    if (wrapTtyTopline(next, columns).length > 1) {
        await callbacks.dismissPendingTtyMessage?.(state, {
            preventEscapeStop: urgentMessage,
        });
    }
    resetLastMessage();
    if (msgtype === MSGTYP_STOP)
        await callbacks.displayPendingTtyMessageWindow?.(state);
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
    // C's putsyms(const char *) stops at the first NUL byte.
    for (const ch of String(text).split('\0', 1)[0]) topl_putsym(ch, state);
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
    if (reversed) {
        items.reverse();
        items.unshift(topline(state));
    } else {
        items.push(topline(state));
    }
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
            do {
                display.morc = 0;
                if (cw.maxcol === cw.maxrow) {
                    display.dismiss_more = CTRL_P;
                    await redotoplin(topline(state), state);
                    cw.maxcol = (cw.maxcol + historyRows(state) - 1) % historyRows(state);
                    if (!cw.data[cw.maxcol]) cw.maxcol = cw.maxrow;
                } else if (cw.maxcol === cw.maxrow - 1) {
                    display.dismiss_more = CTRL_P;
                    await redotoplin(cw.data[cw.maxcol], state);
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

// C ref: wintty.c tty_clear_nhwindow(WIN_MESSAGE), used by
// topl.c tty_yn_function() after message-history navigation and wrapped prompts.
function clearMessageWindow(display) {
    const lastRow = Math.max(0, display.cursorRow);
    for (let row = 0; row <= lastRow && row < display.rows; ++row)
        display.clearRow(row);
    display.setCursor(0, 0);
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
    const { readchar, key2txt } = await import('./cmd.js');
    const display = state.nhDisplay;
    if (!display) throw new Error('a yn prompt requires an initialized display');

    // C's file-global yn_number is scoped to one tty_yn_function() call. Keep
    // the equivalent on the game state so askchain() can consume a counted
    // response after yn_function() returns '#'.
    state.yn_number = 0;
    if (display.toplin === TOPLINE_NEED_MORE && !state._ttyMessageStopped)
        await dismissPendingTtyMessage(state);
    // topl.c:391 clears WIN_STOP and WIN_NOSTOP whether or not more() ran.
    state._ttyMessageStopped = false;
    const win = messageWindow(state);
    if (win) win.flags &= ~WIN_NOSTOP;
    // topl.c:392-393 marks a special prompt and raises inread.
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
    if (state.u?.ux && !state._bonesRestorePrompt) {
        const { flush_screen } = await import('./display.js');
        await flush_screen(1);
    }
    // custompline(SUPPRESS_HISTORY) remembers the old line, then draws this
    // prompt without adding it to history yet.
    remember_topl(state);
    show_topl(prompt, state);
    state._ttyToplines = prompt;
    state._pending_message = '';
    // addtopl() leaves ttyDisplay->toplin at TOPLINE_NEED_MORE.
    display.toplin = TOPLINE_NEED_MORE;
    state._ttyPreviousMessage = prompt;

    // Every key below is the byte readchar() returns, as on the unrestricted
    // arm; `def` arrives as the one-character string its callers spell.
    const defByte = def ? def.charCodeAt(0) : 0;
    let q;
    let doprev = false;
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
                    clearMessageWindow(display);
                    show_topl(prompt, state);
                    state._ttyToplines = prompt;
                    display.toplines = prompt;
                    display.toplin = TOPLINE_NEED_MORE;
                } else {
                    if (!doprev) await tty_doprev_message(state);
                    await tty_doprev_message(state);
                    doprev = true;
                }
                q = 0;
                continue;
            } else if (doprev) {
                clearMessageWindow(display);
                show_topl(prompt, state);
                state._ttyToplines = prompt;
                display.toplines = prompt;
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
                let value = q === 0x23 ? 0 : q - 0x30;
                let digitLength = q === 0x23 ? 0 : 1;
                let invalid = false;
                for (;;) {
                    const z = await readchar(state);
                    const lower = !preserveCase && z >= 0x41 && z <= 0x5A
                        ? z | 0x20 : z;
                    if (lower >= 0x30 && lower <= 0x39) {
                        value = value * 10 + lower - 0x30;
                        digitLength++;
                        if (!Number.isSafeInteger(value)) {
                            invalid = true;
                            break;
                        }
                    } else if (lower === 0x79
                        || quitchars.includes(String.fromCharCode(lower))) {
                        if (lower === ESC) invalid = true;
                        break;
                    } else if (lower === ERASE_CHAR || lower === BACKSPACE) {
                        if (digitLength <= 0) {
                            invalid = true;
                            break;
                        }
                        value = Math.trunc(value / 10);
                        digitLength--;
                    } else {
                        invalid = true;
                        break;
                    }
                }
                if (invalid || value < 0) {
                    q = 0;
                } else if (value === 0) {
                    q = 0x6e; // 'n'
                } else {
                    state.yn_number = value;
                    q = 0x23; // '#'
                }
            }
        } while (!q);
    }

    // clean_up: gt.toplines is rewritten as the prompt followed by the key,
    // so message recall shows the answered prompt rather than the bare query.
    const answerText = state.yn_number
        ? `#${state.yn_number}` : key2txt(q);
    state._ttyToplines = `${prompt}${answerText}`;
    display.toplines = state._ttyToplines;
    display.topMessage = state._ttyToplines;
    // The answer itself is not drawn: C's `addtopl(rtmp)` at topl.c:541 is
    // commented out in favour of rewriting gt.toplines. A one-line prompt
    // stays on the physical line, and js/display.js _buildScreenOutput()
    // repaints row 0 from _pending_message. TOPLINE_NON_EMPTY is what stops
    // the next message treating that line as one awaiting --More--, exactly
    // as topl.c update_topl():262 does.
    //
    // topl.c:547 clears WIN_MESSAGE when cury is nonzero. display.cursorRow
    // tracks that same wrapped-prompt state, so retain the source cleanup for
    // long prompts before deciding whether the answered line remains pending.
    if (display.cursorRow > 0) {
        clearMessageWindow(display);
        state._pending_message = '';
        display.toplin = TOPLINE_EMPTY;
    } else {
        state._pending_message = prompt;
        display.toplin = TOPLINE_NON_EMPTY;
    }
    display.inread = Math.max(0, display.inread - 1);
    if (display.intr) --display.intr;
    return q;
}

export function show_topl(text, state = game) {
    const display = state.nhDisplay;
    if (!display) return;
    const win = messageWindow(state);
    // _ttyMessageStopped is the single JS owner of C's WIN_STOP bit. Keep
    // WIN_NOSTOP in the message window descriptor, where C stores that bit.
    if (state._ttyMessageStopped && !(win?.flags & WIN_NOSTOP)) return false;
    state._ttyMessageStopped = false;
    if (win) win.flags &= ~WIN_NOSTOP;
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
