// tty_menu.js — Source-shaped TTY menu and text window rendering and input.
// C ref: win/tty/wintty.c tty_end_menu(), tty_display_nhwindow(),
// process_menu_window(), process_text_window(), dmore(), and
// tty_select_menu().

import {
    SCORER_DEC_MAP,
    bot,
    docorner,
    docrt,
    flush_screen,
    status_window_rows,
} from './display.js';
import { game } from './gstate.js';
import { tty_getlin } from './getline.js';
import {
    bytesText,
    textBytes,
    appendLongDigit, ucase, lcase,
} from './hacklib.js';
import { nhgetch } from './input.js';
import {
    emitQueuedNotices,
    clearTtyMessageWindow,
    dismissPendingTtyMessage,
    messageWindow,
    MORE_PROMPT,
    TOPLINE_EMPTY,
    TOPLINE_NEED_MORE,
    xwaitforspace,
} from './tty_message.js';
import {
    BUFSZ, H_UNK, H_UTF8, PICK_ANY, PICK_NONE, PICK_ONE, PRIMARYSET,
    WIN_CANCELLED,
} from './const.js';
import {
    ok_align,
    ok_gend,
    ok_race,
    ok_role,
} from './role_init.js';
import {
    ROLE_ALIGNS,
    ROLE_GENDERS,
    ROLE_NONE,
    ROLE_RANDOM,
    aligns,
    genders,
    races,
    roles,
    str2align,
    str2gend,
    str2race,
    str2role,
} from './roles.js';
import {
    ATR_INVERSE,
    NO_COLOR,
} from './terminal.js';
import {
    decode_mixed,
    menuitem_invert_test,
    select_menu,
    ttyMenuColorAttribute,
} from './windows.js';
import { pmatchi } from './strutil.js';
import { mixed_to_utf8 } from './utf8map.js';
import { impossible } from './pline.js';
import { g_putch_graphics, nomux_g_putch_byte } from './termcap.js';
import {
    baseWindow,
    term_clear_screen,
    tty_status_cl_end_screen_row,
} from './wintty.js';

// C ref: win/tty/wintty.c process_menu_window()'s MENU_SEARCH arm, which
// calls tty_getlin("Search for:") and skips an empty or Escaped answer.
const SEARCH_PROMPT = 'Search for:';
const END_PROMPT = '(end)';
const MENU_FIRST_PAGE = '^';
const MENU_LAST_PAGE = '|';
const MENU_NEXT_PAGE = '>';
const MENU_PREVIOUS_PAGE = '<';
const MENU_SELECT_ALL = '.';
const MENU_UNSELECT_ALL = '-';
const MENU_INVERT_ALL = '@';
const MENU_SELECT_PAGE = ',';
const MENU_UNSELECT_PAGE = '\\';
const MENU_INVERT_PAGE = '~';
const MENU_SEARCH = ':';
// C defsym.h: GOLD_SYM is the exceptional selector which can also act as a
// group accelerator for gold that is not on the current page.
const GOLD_SYM = '$';

// C's iflags.menu_overlay, which wintty.c tty_display_nhwindow() reads for
// every NHW_MENU and NHW_TEXT window it shows: when the option is off, the
// window clears the screen and starts at column 0 instead of overlaying the
// map. The option belongs to the game, not to the window, so every tty
// layout reads it here from the state it draws for; no caller passes it.
// scripts/menu-overlay-source.test.mjs fails when other code reads it.
export function menuOverlay(state) {
    return state.iflags?.menu_overlay !== false;
}

export function menuTitleStyle(state = game) {
    const style = state.iflags?.menu_headings;
    return {
        titleAttr: Number.isInteger(style?.attr)
            ? ttyMenuColorAttribute(style.attr) : ATR_INVERSE,
        titleColor: Number.isInteger(style?.color)
            ? style.color : NO_COLOR,
    };
}

// record-session.mjs compresses every maximal run of at least five literal
// spaces into cursor-forward movement. A compressed run was never written into
// the recorder shadow grid, so it retains terminal defaults even when the
// bytes around it were highlighted. js/display.js writes the status line under
// the same rule.
//
// The draw loops this stands for -- process_menu_window():1456-1490 and
// process_text_window():1808-1833 -- walk curr->str one byte at a time and
// advance ttyDisplay->curx once per byte, so a multibyte character covers as
// many cells as it has bytes. Recorder patch 006 hands each of those bytes to
// nomux_putch() as a signed char, which ignores everything below 32 and so
// leaves the shadow cell of a high-bit byte holding whatever the preceding
// clear left there.
//
// process_text_window() alone sends the first byte of a line through
// g_putch() when SYMHANDLING(H_UTF8) holds or the byte's high bit is set.
// Its callers pass `gPutch` (see textWindowGPutch()); menu callers
// leave it undefined, since process_menu_window() has no g_putch() arm.
// Both of patch 006's putchar hooks decrement curx around nomux_putch(), but
// its g_putch() hook does not, and the loop has already pre-incremented curx.
// The recorder therefore stores that first byte, high bit stripped, one
// column to the right of where the terminal shows it, and the line's second
// printable byte overwrites it there; a second byte the char hook ignores,
// as in a multibyte UTF-8 character, leaves it showing. The first byte's own
// column keeps what the preceding clear left. Outside a UTF8 or IBM symset
// g_putch() prints a high byte after graph_on(), so the capture marks that
// cell as DEC graphics (termcap.js g_putch_graphics()).
function writeStyledText(
    display, column, row, text, color, attr, maxColumn = display.cols,
    gPutch = undefined,
) {
    const bytes = textBytes(text);
    for (let index = 0;
        index < bytes.length && column + index < maxColumn;) {
        const spaces = bytes[index] === 0x20;
        let end = index + 1;
        while (end < bytes.length && (bytes[end] === 0x20) === spaces) ++end;
        const compressed = spaces && end - index >= 5;
        for (; index < end && column + index < maxColumn; ++index) {
            const byte = bytes[index];
            const cellColumn = column + index;
            const cellColor = compressed ? NO_COLOR : color;
            const cellAttr = compressed ? 0 : attr;
            if (index === 0 && gPutch !== undefined
                && (gPutch.handling === H_UTF8 || byte >= 0x80)) {
                // g_putch()'s hook, at the pre-incremented curx.
                const stored = nomux_g_putch_byte(byte);
                if (stored !== null) {
                    const ch = String.fromCharCode(stored);
                    const graphics = g_putch_graphics(
                        byte, gPutch.handling, gPutch.eightBit);
                    display.putCaptured(cellColumn + 1, row,
                        graphics ? SCORER_DEC_MAP[ch] ?? ch : ch,
                        cellColor, cellAttr);
                }
            } else {
                display.putch(cellColumn, row, String.fromCharCode(byte),
                    cellColor, cellAttr);
            }
        }
    }
}

// C ref: wintty.c process_text_window() 1801-1833, one line of a window whose
// text begins at `column`. For a text window drawn outside this file.
export function writeTextWindowLine(state, column, row, text, color, attr) {
    const display = state.nhDisplay;
    writeStyledText(
        display, column, row, text, color, attr,
        // process_text_window() pre-increments curx and tests curx < cols
        // before each byte.
        display.cols - 1,
        textWindowGPutch(state),
    );
}

// C ref: wintty.c process_text_window() 1819-1824, g_putch() and sym.h
// SYMHANDLING(). What decides how a text-window line's first byte is printed:
// the active symbol set's handling (under H_UTF8 every first byte goes
// through g_putch()) and iflags.eight_bit_tty, read as symbols.js symbol_at()
// reads it for a map glyph.
function textWindowGPutch(state) {
    return {
        handling: state.gs?.symset?.[
            state.gc?.currentgraphics ?? PRIMARYSET
        ]?.handling ?? H_UNK,
        eightBit: Boolean(state.iflags?.wc_eight_bit_input),
    };
}

function copyRegion(display, firstColumn, rowCount) {
    return display.grid.slice(0, rowCount).map((row) => (
        row.slice(firstColumn).map((cell) => ({
            ch: cell.ch,
            color: cell.color,
            attr: cell.attr,
        }))
    ));
}

function clearRegion(display, firstColumn, rowCount) {
    for (let row = 0; row < rowCount; row++) {
        for (let column = firstColumn; column < display.cols; column++)
            display.clearCell(column, row);
    }
}

function clearRowFrom(display, firstColumn, row) {
    for (let column = firstColumn; column < display.cols; ++column)
        display.clearCell(column, row);
}

// C ref: wintty.c erase_menu_or_text() repairs a window with a nonzero offx
// through docorner(offx, maxrow + 1, 0), which clears each covered row and
// redraws the map from gg.gbuf. That differs from the covered cells when a
// UTF-8 glyph left a stale ASCII character in recorder patch 006's shadow
// cell: the repair blanks it. Without a level there is no map to redraw, so
// the covered startup text is restored instead. `snapshot` holds the rows
// 0..maxrow the window covered, so its length is docorner()'s ymax.
export async function restoreCorner(state, display, repairColumn, snapshot) {
    if (state.level && state.u?.ux) {
        docorner(repairColumn + 1, snapshot.length, 0, state);
    } else {
        restoreRegion(display, repairColumn, snapshot);
    }

    // C docorner() ends by calling bot() when ymax reaches WIN_STATUS, even
    // when the half-open clear range ends exactly at its first row and
    // therefore clears no status cells. It does not restore the status
    // suffix the window covered: keep the cells left of the repair column
    // and let bot() redraw the status only when its caller has not disabled
    // bot updates.
    // docorner() already cleared those rows and then reprinted any map row
    // that lies over the status window (three status lines on 24 rows).
    const firstStatusRow = display.rows - status_window_rows();
    if (snapshot.length < firstStatusRow) return;
    if (!(state.level && state.u?.ux)) {
        for (let row = Math.max(0, firstStatusRow); row < snapshot.length;
            ++row) {
            clearRowFrom(display, repairColumn, row);
            tty_status_cl_end_screen_row(row, repairColumn, state);
        }
    }
    state.disp ??= {};
    state.disp.botlx = true;
    await bot();
}

function restoreRegion(display, firstColumn, snapshot) {
    for (let row = 0; row < snapshot.length; row++) {
        for (let offset = 0; offset < snapshot[row].length; offset++) {
            display.restoreCell(firstColumn + offset, row,
                snapshot[row][offset]);
        }
    }
}

// C ref: win/tty/wintty.c erase_menu_or_text() (966-984).  Covers the
// `cw->offx == 0 && !cw->offy && !clear` branch alone, which is
// `docrt(); flush_screen(1)` and which every full-screen menu and text window
// this port dismisses takes.  The other three branches stay at their call
// sites: `clear` is role selection's term_clear_screen() and a nonzero offx is
// docorner(), which each caller already spells as a clear or a rectangle
// restore.
//
// docrt() and flush_screen(1) are observable beyond their final pixels:
// docrt_flags() redraws hallucinated glyphs through the display RNG before
// the core caller resumes. A saved terminal snapshot cannot substitute for
// that map traversal even when it would restore the same visible frame.
export async function erase_menu_or_text(
    state, display, snapshot, baseCursor,
) {
    if (state !== game) {
        throw new Error(
            'erase_menu_or_text requires the module-level game',
        );
    }
    // Role-selection and focused window tests can dismiss a window before
    // the dungeon map exists. C's docrt_flags() returns immediately in that
    // state, while the JS startup screen still needs its covered frame. This
    // is the old window repair, restricted to the non-gameplay case; once a
    // hero and level exist, the observable docrt() traversal below owns it.
    if (!state.level || !state.u?.ux) {
        restoreRegion(display, 0, snapshot);
        display.setCursor(...baseCursor);
        for (let row = 0; row < status_window_rows(); ++row) {
            clearRow(display, display.rows - 1 - row);
            tty_status_cl_end_screen_row(display.rows - 1 - row, 0, state);
        }
        state.disp ??= {};
        state.disp.botlx = true;
        // wintty.c erase_menu_or_text() calls docrt() here; docrt_flags()
        // returns while the player has no map position. With no JS player
        // state there is no status to paint; mirror bot()'s no-output arm by
        // clearing pending flags unless select_menu() disabled bot().
        if (state.u) {
            await bot();
        } else if (state.gb?.bot_disabled !== true) {
            state.disp.botl = false;
            state.disp.botlx = false;
            state.disp.time_botl = false;
        }
        return;
    }
    await docrt();
    // _buildScreenOutput() reconstructs its canonical grid at every JS
    // flush, keeping the physical status cells while bot() is disabled. C's
    // tty has no equivalent reconstruction: when select_menu() keeps
    // bot_disabled raised, cls()'s blank status rows remain physical blanks
    // and botlx stays pending for the first enabled flush. Blank them before
    // the flush, so the map glyphs flush_screen() then prints over a status
    // row (a map taller than the rows above a three-line status) stay.
    if (state.gb?.bot_disabled) {
        for (let row = 0; row < status_window_rows(); ++row)
            clearRow(display, display.rows - 1 - row);
    }
    await flush_screen(1);
}

// C ref: win/tty/wintty.c compress_str(). tty_putstr() applies this to menu
// and text data before it measures or stores a line. CO is the live terminal
// width and BUFSZ bounds the function's static buffer. Returns the bytes.
function compressTtyWindowLine(value, columns) {
    const source = textBytes(value ?? '');
    if (source.length < columns && !source.includes(0x0A)) return source;

    const result = [];
    let wasSpace = true;
    for (const sourceByte of source) {
        const byte = sourceByte === 0x0A ? 0x20 : sourceByte;
        if (wasSpace && byte === 0x20) continue;
        if (result.length >= BUFSZ - 1) break;
        result.push(byte);
        wasSpace = byte === 0x20;
    }
    if ((wasSpace && result.length) || result.length === BUFSZ - 1)
        result.pop();
    return result;
}

// C ref: win/tty/wintty.c tty_putstr()'s NHW_MENU/NHW_TEXT arm. The width
// is measured before an over-CO line is split, so a split adds a row without
// narrowing the eventual window. `preserveLines` keeps the source line's
// presentation metadata for NHW_TEXT; menus only need decoded strings.
function ttyWindowTextData(lines, columns, preserveLines) {
    const stored = [];
    let maxcol = 0;

    const storedLine = (sourceLine, text) => (preserveLines
        ? {
            ...(sourceLine && typeof sourceLine === 'object'
                ? sourceLine : {}),
            text,
        }
        : text);

    // `compressed` is the line after compress_str(). C's recursive
    // tty_putstr() call compresses the suffix again, which leaves bytes
    // that compress_str() has already normalized as they are.
    const putstr = (compressed, sourceLine) => {
        const n0 = compressed.length + 1;
        maxcol = Math.max(maxcol, n0);
        if (n0 > columns) {
            let split = columns - 1;
            while (split && compressed[split] !== 0x20
                && compressed[split] !== 0x0A) {
                --split;
            }
            if (split) {
                // tty_putstr() nulls cw->data[cury - 1][++i] at the
                // break-space itself. The first row therefore excludes the
                // split byte and the recursive suffix starts after it.
                stored.push(storedLine(
                    sourceLine, bytesText(compressed.slice(0, split)),
                ));
                putstr(compressed.slice(split + 1), sourceLine);
                return;
            }
        }
        stored.push(storedLine(sourceLine, bytesText(compressed)));
    };

    for (const line of lines) {
        putstr(compressTtyWindowLine(line?.text ?? line, columns), line);
    }
    return { lines: stored, maxcol };
}

export function ttyMenuTextData(lines, columns) {
    return ttyWindowTextData(lines, columns, false);
}

export function ttyTextWindowData(lines, columns) {
    return ttyWindowTextData(lines, columns, true);
}

// C refs: tty_display_nhwindow(NHW_MENU) and process_text_window(). A menu
// with cw->data follows the text-window line loop but retains menu geometry.
export function ttyMenuTextLayout(state, rawLines) {
    const display = state.nhDisplay;
    // C tty_putstr() stores each NHW_MENU row's attribute and color alongside
    // its compressed text; keep that metadata until process_text_window draws.
    const data = ttyTextWindowData(rawLines, display.cols);
    const maxrow = data.lines.length;
    let offx = Math.min(
        82,
        Math.floor(display.cols / 2),
        display.cols - data.maxcol - 1,
    );
    offx = Math.max(0, offx);
    // Under H2344_BROKEN, tty_display_nhwindow() clears only for a terminal-
    // height window or disabled overlays. An over-wide line can still make
    // offx zero; erase_menu_or_text() then requests docrt() at dismissal.
    const clearsScreen = maxrow >= display.rows || !menuOverlay(state);
    if (clearsScreen) offx = 0;
    return {
        firstColumn: offx,
        repairColumn: Math.max(0, offx - 1),
        lineColumn: offx ? offx + 1 : 0,
        // process_text_window() homes BASE_WINDOW at offx + 1, then dmore()
        // applies its NHW_MENU offset of two in tty's one-based coordinates.
        promptColumn: offx + 1,
        promptRow: maxrow,
        maxcol: data.maxcol,
        maxrow,
        clearsScreen,
        fullRepair: offx === 0,
        lines: data.lines,
    };
}

// C refs: invent.c look_here()'s NHW_MENU window; wintty.c
// tty_display_nhwindow(), process_text_window(), dmore(),
// tty_destroy_nhwindow(), tty_dismiss_nhwindow(), and
// erase_menu_or_text(). This window never passes through tty_end_menu(), so
// cw->morestr remains null and dmore() uses defmorestr ("--More--") rather
// than the "(end)" prompt a completed selection menu installs. Returns the
// key accepted by dmore().
export async function displayTtyMenuTextWindow(
    state = game,
    rawLines,
) {
    await emitQueuedNotices(state);
    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty menu text window requires an initialized display');

    // C tty_display_nhwindow() clears ttyDisplay->rawprint before entering
    // the NHW_MENU arm.  Keep this reset separate from the recorder's sticky
    // nomuxRaw.active cursor mode.
    if (display.nomuxRaw)
        display.nomuxRaw.rawprint = 0;

    // wintty.c tty_display_nhwindow(NHW_MENU) first flushes an
    // unacknowledged message, then calls tty_clear_nhwindow(WIN_MESSAGE) for
    // a corner menu. The latter clears an already acknowledged top line too;
    // only the full-screen branch's term_clear_screen() can provide that
    // clearing without this message-window operation.
    // A set WIN_STOP makes that flush return at once (WIN_CANCELLED bit).
    if (display.toplin === TOPLINE_NEED_MORE
        && !(messageWindow(state)?.flags & WIN_CANCELLED)) {
        await dismissPendingTtyMessage(state);
        // dismissPendingTtyMessage() leaves TOPLINE_EMPTY after its More
        // response. Restore NEED_MORE so clearTtyMessageWindow() follows the
        // source's `more(); toplin = NEED_MORE; tty_clear_nhwindow()` order
        // and clears the physical top line the message still occupies.
        display.toplin = TOPLINE_NEED_MORE;
    }
    if (display.toplin !== TOPLINE_EMPTY) clearTtyMessageWindow(state);

    const layout = ttyMenuTextLayout(state, rawLines);
    const pageSize = Math.max(1, display.rows - 1);
    const pageCount = Math.max(1, Math.ceil(layout.lines.length / pageSize));

    const restoredRows = Math.min(display.rows, layout.maxrow + 1);
    const snapshot = layout.fullRepair
        ? copyRegion(display, 0, display.rows)
        : copyRegion(display, layout.repairColumn, restoredRows);
    const baseCursor = [display.cursorCol, display.cursorRow];

    // process_text_window() paginates only when offx is zero. Its page holds
    // every row except the footer occupied by dmore(), and it clears the
    // terminal between pages. Keep the page loop here rather than teaching
    // individual callers about terminal height: enlightenment(), inventory,
    // and every other NHW_MENU text consumer share this boundary.
    let response = null;
    for (let pageIndex = 0; pageIndex < pageCount; ++pageIndex) {
        const firstLine = pageIndex * pageSize;
        const pageLines = layout.lines.slice(firstLine, firstLine + pageSize);
        const promptRow = pageLines.length;

        if (layout.clearsScreen || pageIndex > 0)
            term_clear_screen(state);
        for (let row = 0; row < pageLines.length; ++row) {
            clearRowFrom(display, layout.firstColumn, row);
            const line = pageLines[row];
            writeStyledText(
                display,
                layout.lineColumn,
                row,
                typeof line === 'string' ? line : String(line?.text ?? ''),
                line?.color ?? NO_COLOR,
                line?.attr ?? 0,
                // process_text_window() pre-increments curx and tests
                // curx < cols before each byte.
                display.cols - 1,
                textWindowGPutch(state),
            );
        }
        clearRowFrom(display, layout.firstColumn, promptRow);
        writeStyledText(
            display,
            layout.promptColumn,
            promptRow,
            MORE_PROMPT,
            NO_COLOR,
            0,
        );
        display.setCursor(
            layout.promptColumn + MORE_PROMPT.length,
            promptRow,
        );

        response = await xwaitforspace(state);
        if (isEscapeResponse(response)) {
            break;
        }
    }

    if (layout.fullRepair) {
        await erase_menu_or_text(state, display, snapshot, baseCursor);
    } else {
        await restoreCorner(state, display, layout.repairColumn, snapshot);
    }
    return response;
}

// C ref: wintty.c process_menu_window() (1436-1445). The attribute and color
// start at curr->str[attr_n]: after "x - " when the stored menu string has
// that shape ("[0]=letter, [1]=space, [2]=[-+#], [3]=space"), otherwise at
// the first character.  tty_add_menu() stores every selectable item as
// "%c - %s", so its marker is '-' however the item is drawn.
export function menuAttrStart(str) {
    return str.length >= 4 && str[1] === ' ' && '-+#'.includes(str[2])
        && str[3] === ' ' ? 4 : 0;
}

// C ref: wintty.c tty_add_menu() (2650-2662), its length check only; the
// rest of the function is the layout below.  An entry with a nonzero
// identifier is stored as "%c - %s" in a 4+BUFSZ buffer, so a description of
// BUFSZ bytes or more is reported with impossible() when add_menu() is
// called, before the menu is shown, and cut to BUFSZ-1 bytes.  An entry with
// a zero identifier is stored as passed.  Returns the description stored.
export async function tty_add_menu(state, str) {
    let len = str.length;
    if (len >= BUFSZ) {
        // We *think* everything's coming in off at most BUFSZ bufs...
        await impossible(`Menu item too long (${len}).`, state);
        len = BUFSZ - 1;
    }
    return str.slice(0, len);
}

// A `lines` row is the selectable item tty_add_menu() stored as
// "%c - %s" when sourceChoiceSelector() reads its selector and the spec's
// choices map that selector.  Returns the `str` its add_menu() call passed,
// or null for a display-only row.
export function menuLineChoiceDescription(line, choices) {
    const selector = sourceChoiceSelector(line);
    if (!selector || !choices?.has(selector)) return null;
    const text = typeof line === 'string'
        ? line : String(line?.text ?? line?.label ?? '');
    return text.slice(4);
}

function itemLine(item) {
    if (typeof item === 'string')
        return { text: item, attr: 0, styleStart: menuAttrStart(item), item: null };
    if (!Object.hasOwn(item, 'value')) {
        // C ref: wintty.c tty_add_menu() (2594-2614). An entry added with a
        // zero identifier is drawn without the "x - " prefix, but its
        // selector is stored all the same; visiblePickOneChoice() reads it.
        const text = item.text ?? item.label ?? '';
        return {
            text,
            attr: item.attr ?? 0,
            color: item.color,
            styleStart: menuAttrStart(String(text)),
            item: null,
            ...(item.selector ? { zeroIdentifierSelector: item.selector } : {}),
        };
    }

    const selector = item.selector || '?';
    const marker = item.selected
        ? (item.count >= 0 ? '#' : '*')
        : '-';
    return {
        text: `${selector} ${marker} ${item.label ?? item.text ?? ''}`,
        attr: item.attr ?? 0,
        color: item.color,
        // menuAttrStart() of the stored "%c - %s".
        styleStart: 4,
        item,
    };
}

// A `lines` row's styleStart is menuAttrStart() of the string C stored: a
// selectable row's drawn marker stands in for the '-' tty_add_menu() wrote.
function lineMenuLine(line, choices) {
    const row = typeof line === 'string'
        ? { text: line, attr: 0 } : { ...line };
    const text = String(row.text ?? row.label ?? '');
    const description = menuLineChoiceDescription(line, choices);
    return {
        ...row,
        styleStart: menuAttrStart(description === null
            ? text : `${text[0]} - ${description}`),
        item: null,
    };
}

function menuLines(spec) {
    const body = spec.items
        ? spec.items.map(itemLine)
        : (spec.lines ?? []).map((line) => lineMenuLine(line, spec.choices));
    // tty_end_menu() writes a prompt line and its blank separator only when
    // the caller supplied one; invent.c display_pickinv() passes none for a
    // plain inventory display.
    if (spec.title == null) return body;
    return [
        {
            text: spec.title,
            attr: spec.titleAttr ?? ATR_INVERSE,
            color: spec.titleColor ?? NO_COLOR,
            // tty_end_menu() (2682-2689) adds the prompt with tty_add_menu(),
            // so process_menu_window()'s attr_n test applies to it as well.
            styleStart: menuAttrStart(String(spec.title)),
            item: null,
        },
        { text: '', attr: 0, item: null },
        ...body,
    ];
}

// C ref: wintty.c tty_end_menu()'s accelerator pass. Every page restarts at
// 'a' and runs 'a'..'z' then 'A'..'Z', so an item's letter depends on where
// its page boundary falls. add_menu() callers that pass their own selector
// keep it and consume no letter, which is how the options menu's '?' entry
// leaves 'a' for the first option below it.
function assignMenuAccelerators(spec, pageSize) {
    if (!spec.items) return;
    // menuLines() puts the prompt and its blank separator ahead of the items,
    // exactly as tty_end_menu() does before it counts pages.
    const lead = spec.title == null ? 0 : 2;
    let menu_ch = 'a';
    for (let n = 0; n < lead + spec.items.length; ++n) {
        if (n % pageSize === 0) menu_ch = 'a';
        if (n < lead) continue;
        // menuLines() accepts a bare string as a display-only line, which has
        // no selector to assign. ttyMenuLayout() runs this pass before
        // menuLines(), so this is the first read of an item and `typeof null
        // === 'object'` lets a null one reach Object.hasOwn() below, which is
        // the trip-wire that reports it.
        const item = spec.items[n - lead];
        if (typeof item !== 'object') continue;
        if (!Object.hasOwn(item, 'value') || item.selector) continue;
        item.selector = menu_ch;
        menu_ch = menu_ch === 'z'
            ? 'A' : String.fromCharCode(menu_ch.charCodeAt(0) + 1);
    }
}

export function ttyMenuLayout(state, spec, pageIndex = 0) {
    const display = state.nhDisplay;
    // tty_end_menu() limits each page to the smaller of 52 accelerators or
    // all terminal rows except the dmore() footer.
    const pageSize = Math.min(52, Math.max(1, display.rows - 1));
    assignMenuAccelerators(spec, pageSize);
    const allLines = menuLines(spec);
    // wintty.c:2728-2733 cuts off any line too long to fit, in the same pass
    // that assigns accelerators. The cut is destructive: it shortens the
    // stored string that is later drawn, not merely the width the menu window
    // reserves. It also lands two cells short of the terminal, at
    // `curr->str[ttyDisplay->cols - 2] = 0`, because `len` counts one padding
    // cell on each side. `len` comes from strlen(), so both the measurement
    // and the cut count bytes: a line of exactly cols - 2 bytes survives whole
    // and one of cols - 1 loses its last byte.
    for (const line of allLines) {
        const bytes = textBytes(String(line.text ?? ''));
        if (bytes.length + 2 > display.cols) {
            line.text = bytesText(
                bytes.slice(0, display.cols - 2),
            );
        }
    }
    const pageCount = Math.max(1, Math.ceil(allLines.length / pageSize));
    if (pageIndex < 0 || pageIndex >= pageCount)
        throw new RangeError(`invalid tty menu page ${pageIndex}`);
    const lines = allLines.slice(
        pageIndex * pageSize,
        (pageIndex + 1) * pageSize,
    );
    const footerText = pageCount > 1
        ? `(${pageIndex + 1} of ${pageCount})`
        : END_PROMPT;

    // tty_end_menu() reserves one cell on each side of every stored line, and
    // measures it with the same byte-counting strlen() that drove the cut
    // above. The footer it compares against is generated here from ASCII.
    const maxcol = Math.max(
        footerText.length + 1,
        ...allLines.map((line) => (
            textBytes(String(line.text ?? '')).length + 2
        )),
    );
    const maxrow = pageCount > 1
        ? pageSize + 1
        : allLines.length + 1;

    // H2344_BROKEN is deliberately enabled at the top of wintty.c in the
    // pinned source. Narrow menus occupy at most the right half of the tty.
    let offx = Math.min(82, Math.floor(display.cols / 2),
        display.cols - maxcol - 1);
    if (offx < 0) offx = 0;
    const fullScreen = !menuOverlay(state) || maxrow >= display.rows
        || offx === 0;
    if (fullScreen) offx = 0;

    return {
        firstColumn: offx,
        // docorner() addresses BASE_WINDOW coordinates and begins one
        // terminal cell left of the menu window's own x=1 margin.
        repairColumn: Math.max(0, offx - 1),
        startColumn: offx + 1,
        fullScreen,
        lines,
        pageCount,
        pageIndex,
        pageSize,
        footerText,
        footerRow: lines.length,
        maxrow,
    };
}

// `previous` is the result of the render this one replaces, which
// process_menu_window() produces when it turns a page. C turns a page inside
// the window it already opened, so the base window it will repair on dismissal
// is the one the first page covered; only the first render may measure it.
export function renderTtyMenu(state = game, spec, pageIndex = 0,
    previous = null) {
    const display = state.nhDisplay;
    if (!display) throw new Error('tty menu requires an initialized display');
    const layout = ttyMenuLayout(state, spec, pageIndex);
    const restoredRows = Math.min(display.rows, layout.maxrow + 1);
    const visibleRows = Math.min(display.rows, layout.maxrow);
    if (!layout.fullScreen) {
        // tty_display_nhwindow() clears the message window before a corner
        // menu.  tty_clear_nhwindow(WIN_MESSAGE) erases the top line only
        // while toplin is not TOPLINE_EMPTY, so a prompt that an earlier
        // display_nhwindow(WIN_MESSAGE, FALSE) retired stays beside the
        // menu.  The remaining base-window content is repaired by docorner()
        // when the menu is dismissed.
        clearTtyMessageWindow(state);
    }
    // A full-screen gameplay menu is repaired by docrt()+flush_screen() in
    // tty_dismiss_nhwindow().  Retain the equivalent physical base frame so
    // state-parameterized and focused displays can perform that repair
    // without reaching through the global display singleton.
    const snapshot = previous ? previous.snapshot : (layout.fullScreen
        ? copyRegion(display, 0, display.rows)
        : copyRegion(display, layout.repairColumn, restoredRows));
    const baseCursor = previous
        ? previous.baseCursor
        : [display.cursorCol, display.cursorRow];
    // The repair belongs to the window, not to the page on screen: C sizes
    // cw->offx and cw->maxrow once in tty_end_menu() and docorner() reads
    // those when the menu is dismissed.  This port recomputes the layout for
    // every page, and `maxcol` folds in the footer, which is "(1 of 10)" on
    // one page and "(10 of 10)" on another -- so `offx`, and with it
    // repairColumn, is page-dependent in principle.  Measure the repair
    // alongside the frame it restores, so dismissTtyMenu() reads one
    // self-consistent record.
    const base = previous ? previous.base : {
        repairColumn: layout.repairColumn,
        fullScreen: layout.fullScreen,
        maxrow: layout.maxrow,
    };

    if (layout.fullScreen) term_clear_screen(state);
    else clearRegion(display, layout.firstColumn, visibleRows);

    // process_menu_window() decides once from the complete linked menu, before
    // it selects a page.  A zero identifier is any display-only line or
    // heading in this representation.  tty_end_menu() adds a prompt and its
    // blank separator to that list as two zero-identifier lines, so a menu
    // with a title never shows object symbols in conditional mode.
    let showObjectSymbols = state.iflags?.use_menu_glyphs === true;
    if ((state.iflags?.menuobjsyms & 4) !== 0) {
        const hasHeader = spec.title != null || (spec.items ?? []).some((item) => (
            typeof item !== 'object' || item === null
                || !Object.hasOwn(item, 'value')
        ));
        if (hasHeader) showObjectSymbols = false;
    }

    for (let row = 0; row < layout.lines.length; row++) {
        const line = layout.lines[row];
        const text = String(line.text ?? '');
        const styleStart = line.styleStart ?? 0;
        writeStyledText(
            display,
            layout.startColumn,
            row,
            text.slice(0, styleStart),
            NO_COLOR,
            0,
        );
        writeStyledText(
            display,
            layout.startColumn + styleStart,
            row,
            text.slice(styleStart),
            line.color ?? NO_COLOR,
            line.attr ?? 0,
        );
        // C substitutes the glyph at curr->str byte offset two.  A selection
        // marker wins at that same offset, and a missing glyph leaves '-'.
        const glyphInfo = line.item?.glyphInfo;
        if (showObjectSymbols && !line.item?.selected && glyphInfo
            && Number.isInteger(glyphInfo.ttychar)) {
            // wintty.c passes glyph_info.ttychar as an unsigned byte to the
            // recorder hook. The ordinary line writer treats high bytes as
            // signed chars and drops them, so this substitution must bypass
            // writeStyledText() just as C bypasses its `*cp` arm. A lone high
            // byte reaches the session screen through its UTF-8 decoder as
            // U+FFFD; the raw byte itself remains on glyphInfo.ttychar.
            const ttychar = glyphInfo.ttychar & 0xFF;
            const printable = ttychar >= 32;
            display.putCaptured(
                layout.startColumn + 2,
                row,
                !printable ? ' '
                    : ttychar < 0x80 ? String.fromCharCode(ttychar) : '\uFFFD',
                printable ? glyphInfo.color ?? NO_COLOR : NO_COLOR,
                0,
            );
        }
    }
    // dmore()'s prompt, a char at a time.
    display.putstr(layout.startColumn, layout.footerRow, layout.footerText);
    // tty_end_menu() retains the trailing space in the single-page
    // "(end) " prompt.  For pagination, process_menu_window() replaces the
    // sizing template with "(x of y)" without that trailing space.
    display.setCursor(
        layout.startColumn + layout.footerText.length
            + (layout.pageCount === 1 ? 1 : 0),
        layout.footerRow,
    );

    return { layout, snapshot, baseCursor, base };
}

// `rendered.base`, `rendered.snapshot` and `rendered.baseCursor` all describe
// the frame the menu covered when it opened; `rendered.layout` describes the
// page on screen and has no part in the repair.
export async function dismissTtyMenu(state = game, rendered) {
    const display = state.nhDisplay;
    if (!display || !rendered) return;
    if (rendered.base.fullScreen) {
        if (state.program_state?.in_role_selection) {
            // erase_menu_or_text()'s `clear` branch (wintty.c:975-976).
            term_clear_screen(state);
        } else {
            await erase_menu_or_text(
                state, display, rendered.snapshot, rendered.baseCursor,
            );
        }
    } else if (state.program_state?.in_role_selection) {
        // Role selection overlays the base window's startup text, which tty
        // does not retain as redrawable window data. docorner() therefore
        // clears this slice rather than reconstructing the banner.
        clearRegion(
            display,
            rendered.base.repairColumn,
            rendered.snapshot.length,
        );
        // docorner(offx, maxrow + 1, 0) leaves BASE_WINDOW on maxrow.  A
        // subsequent rename's empty tty_putstr() advances from this row.
        const base = baseWindow(state);
        base.curx = rendered.base.repairColumn;
        base.cury = rendered.base.maxrow;
    } else {
        await restoreCorner(
            state,
            display,
            rendered.base.repairColumn,
            rendered.snapshot,
        );
    }
}

// C ref: win/tty/termcap.c cl_end(), reached before process_text_window()
// writes each line and again before each --More--.
function clearRow(display, row) {
    for (let column = 0; column < display.cols; column++)
        display.clearCell(column, row);
}

// C ref: win/tty/getline.c xwaitforspace(), which sets morc to Escape for
// both the Escape key and the NUL that tty_nhgetch() maps to it.
function isEscapeResponse(morc) {
    return morc === 0 || morc === 0x1B;
}

// C ref: win/tty/wintty.c dmore(). Writes the prompt at the cursor and waits
// for a key that dismisses it, returning morc. flags.standout, which would
// draw the prompt in reverse video, defaults off and no option sets it.
async function dmore(state, display, row) {
    clearRow(display, row);
    // A text window offsets the prompt by one column where a menu offsets it
    // by two; both start from a curx that tty_curs() has just homed to 0.
    for (let index = 0; index < MORE_PROMPT.length; index++)
        display.putch(index, row, MORE_PROMPT[index]);
    display.setCursor(MORE_PROMPT.length, row);
    return xwaitforspace(state);
}

// C ref: win/tty/wintty.c tty_putmixed() (4169-4196) for an NHW_TEXT window:
// the line tty_putstr() stores after utf8map.c mixed_to_utf8(), under a
// UTF-8 symbol set, or windows.c decode_mixed() has decoded `str`. It returns
// one displayTtyTextWindow() line. The stored line is bytes: a glyph is its
// gs.showsyms[] byte or its UTF-8 sequence, and process_text_window() prints
// each byte through the hooks writeStyledText() models, which leave the
// cell of a control or high byte as cl_end() cleared it.
export function ttyPutmixedLine(str, state = game) {
    const handling = state.gs?.symset?.[
        state.gc?.currentgraphics ?? PRIMARYSET
    ]?.handling;
    return {
        text: handling === H_UTF8
            ? mixed_to_utf8(str, state) : decode_mixed(str, state),
    };
}

// C ref: win/tty/wintty.c tty_display_nhwindow(NHW_TEXT) followed by
// process_text_window(). With H2344_BROKEN a text window's offx is 0, so its
// lines begin in column 0 rather than after the one-cell margin an offset
// window writes. Returns morc, the key that dismissed the last --More--.
export async function displayTtyTextWindow(state = game, lines) {
    await emitQueuedNotices(state);
    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty text window requires an initialized display');

    // C tty_display_nhwindow() clears ttyDisplay->rawprint before entering
    // the NHW_TEXT arm.  `nomuxRaw.active` remains sticky for recorder
    // cursor capture and must not control this window selection.
    if (display.nomuxRaw)
        display.nomuxRaw.rawprint = 0;
    const textData = ttyTextWindowData(lines, display.cols);
    lines = textData.lines;
    const maxrow = lines.length;
    const lastRow = display.rows - 1;

    // C ref: wintty.c tty_display_nhwindow() NHW_TEXT arm (1921-1922).
    // Flush an unacknowledged top-line message before the text window
    // covers it, the same guard selectTtyMenu() applies for menus.
    if (display.toplin === TOPLINE_NEED_MORE
        && !(messageWindow(state)?.flags & WIN_CANCELLED)
        && await dismissPendingTtyMessage(state)) {
        if (state.nhDisplay) state.nhDisplay.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    }

    // tty_dismiss_nhwindow() repairs a column-zero text window with
    // docrt()+flush_screen(), the same repair dismissTtyMenu() models for a
    // full-screen menu.
    const snapshot = copyRegion(display, 0, display.rows);
    const baseCursor = [display.cursorCol, display.cursorRow];

    if (maxrow >= display.rows || !menuOverlay(state)) {
        term_clear_screen(state);
    } else {
        // A window short enough to overlay clears only the message window
        // here, the same clear renderTtyMenu() performs for a corner menu.
        // The per-line cl_end() below and the cl_eos() after the last line
        // still cover every row, so the two branches agree on screen.
        display.clearRow(0);
    }

    let n = 0;
    let cancelled = false;
    let response = null;
    for (let i = 0; i < maxrow; i++) {
        if (n === lastRow) {
            response = await dmore(state, display, n);
            if (isEscapeResponse(response)) {
                // morc == ESC marks the window cancelled and abandons the
                // remaining lines without a closing prompt.
                cancelled = true;
                break;
            }
            term_clear_screen(state);
            n = 0;
        }
        const line = lines[i];
        const text = String(line.text ?? '');
        clearRow(display, n);
        tty_status_cl_end_screen_row(n, 0, state);
        const gPutch = textWindowGPutch(state);
        writeStyledText(
            display, 0, n, text, line.color ?? NO_COLOR, line.attr ?? 0,
            // wintty.c process_text_window() increments curx before each
            // byte and tests curx < cols, so a column-zero NHW_TEXT row
            // writes at most cols - 1 bytes.
            display.cols - 1,
            gPutch,
        );
        n++;
    }

    if (!cancelled) {
        // A text window clears from the row after its last line before
        // homing to the bottom row for the closing prompt.
        for (let row = n; row < display.rows; row++) {
            clearRow(display, row);
            tty_status_cl_end_screen_row(row, 0, state);
        }
        response = await dmore(state, display, lastRow);
    }

    await erase_menu_or_text(state, display, snapshot, baseCursor);
    return response;
}

function keyCharacter(code) {
    return String.fromCharCode(code & 0xFF);
}

// C ref: options.c map_menu_cmd(). Aliases are never replacements: the
// incoming-key strings retain insertion order and their first match wins.
function menuCommandMapping(state, ch) {
    const mappedKeys = state.iflags?.mapped_menu_cmds
        ?? state.mapped_menu_cmds ?? '';
    const mappedCommands = state.iflags?.mapped_menu_op
        ?? state.mapped_menu_op ?? '';
    const index = mappedKeys.indexOf(ch);
    const mapped = index >= 0 && index < mappedCommands.length;
    return {
        command: mapped ? mappedCommands[index] : ch,
        mapped,
    };
}

// C ref: win/tty/getline.c xwaitforspace() as wintty.c process_menu_window()
// reaches it (1547, 1551) for every key of a selection menu. The two key
// loops below test the response set themselves, so this reads the key and
// applies the part of xwaitforspace() that does not depend on that set:
// Escape stores 1 in ttyDisplay->dismiss_more and leaves morc at Escape
// (getline.c:244-248). tty_nhgetch() has already mapped NUL to Escape.
async function menuKey(state) {
    const code = await nhgetch(state);
    const display = state.nhDisplay;
    if (display && (code === 0 || code === 27)) {
        display.dismiss_more = 1;
        display.morc = 27;
    }
    return code;
}

// xwaitforspace() also returns the ttyDisplay->dismiss_more key
// (getline.c:250) where it would otherwise ring the bell and keep waiting.
// process_menu_window() then finds it in no arm, but having returned, it
// resets the pending count on the next pass.
function isDismissMoreKey(state, code) {
    const x = state.nhDisplay?.dismiss_more ?? 0;
    return x !== 0 && code === x;
}

// C ref: win/tty/wintty.c process_menu_window(): the menu commands its
// switch gives an arm of their own (1621-1735). map_menu_cmd() can turn a key
// into any of them, and each arm ends in a break, so none of them reaches the
// default arm's group-accelerator test.
const MENU_SWITCH_COMMANDS = new Set([
    MENU_NEXT_PAGE, MENU_PREVIOUS_PAGE, MENU_FIRST_PAGE, MENU_LAST_PAGE,
    MENU_SELECT_PAGE, MENU_UNSELECT_PAGE, MENU_INVERT_PAGE,
    MENU_SELECT_ALL, MENU_UNSELECT_ALL, MENU_INVERT_ALL, MENU_SEARCH,
]);

function isDefaultMenuResponse(ch) {
    return ch === '\0' || ch === '\x1b' || ch === '\n' || ch === '\r'
        || ch === ' ' || (ch >= '0' && ch <= '9')
        || '^|><.-@,\\~:'.includes(ch);
}


function searchItemText(item, columns) {
    // tty_add_menu() stores the original '-' marker in curr->str; selection
    // markers are substituted only while rendering. tty_end_menu() truncates
    // that stored string to two fewer characters than the terminal width.
    const selector = item.selector || '?';
    const label = item.label ?? item.text ?? '';
    return `${selector} - ${label}`.slice(0, Math.max(0, columns - 2));
}

function restoreMenuInputCursor(state, rendered) {
    state.nhDisplay.setCursor(
        rendered.layout.startColumn + rendered.layout.footerText.length
            + (rendered.layout.pageCount === 1 ? 1 : 0),
        rendered.layout.footerRow,
    );
}

function sourceMenuLineText(line, columns) {
    let text = typeof line === 'string'
        ? line : String(line?.text ?? line?.label ?? '');
    if (text.length >= 4 && text[1] === ' '
        && '-+*#'.includes(text[2]) && text[3] === ' ') {
        text = `${text.slice(0, 2)}-${text.slice(3)}`;
    }
    return text.slice(0, Math.max(0, columns - 2));
}

function pickOneSearchEntries(state, spec) {
    if (spec.items) {
        return selectableItems(spec).map((item) => ({
            value: item.value,
            text: searchItemText(item, state.nhDisplay.cols),
        }));
    }

    const choices = spec.choices ?? new Map();
    const entries = [];
    for (const line of spec.lines ?? []) {
        const text = typeof line === 'string'
            ? line : String(line?.text ?? line?.label ?? '');
        if (text.length < 4 || text[1] !== ' '
            || !'-+*#'.includes(text[2]) || text[3] !== ' '
            || !choices.has(text[0])) continue;
        entries.push({
            value: choices.get(text[0]),
            text: sourceMenuLineText(text, state.nhDisplay.cols),
        });
    }
    return entries;
}

function sourceChoiceSelector(line) {
    const text = typeof line === 'string'
        ? line : String(line?.text ?? line?.label ?? '');
    return text.length >= 4 && text[1] === ' '
        && '-+*#'.includes(text[2]) && text[3] === ' '
        ? text[0] : '';
}

// C ref: wintty.c process_menu_window()'s gacc[] for PICK_ONE (1349-1379)
// and its group_accel arm (1742-1749).  gcnt[] counts an accelerator only on
// an entry whose selector differs from it, and PICK_ONE accepts an
// accelerator only when that count is exactly one.  Gold's '$', which is its
// own selector under USE_INVLET, is therefore counted zero times and is not a
// group accelerator: '$' picks gold only as a selector, on gold's own page.
//
// Each accelerator maps to `items`, every entry invert_all() toggles: the
// counted entry and any entry that carries the accelerator as its own
// selector.  `value` is that of the first, which is the first selection
// tty_select_menu() returns.  One part of the C is not represented: gcnt[]
// also counts an entry with a zero identifier, which selectableItems()
// leaves out here as it does for PICK_ANY.
function pickOneGroupChoices(spec) {
    if (spec.items) {
        const items = selectableItems(spec);
        const grouped = new Map();
        for (const ch of menuGroupAccelerators(items, PICK_ONE)) {
            const group = items.filter((item) => item.groupSelector === ch);
            grouped.set(ch, { value: group[0].value, items: group });
        }
        return grouped;
    }

    const choices = spec.choices ?? new Map();
    const lineSelectors = new Set(
        (spec.lines ?? []).map(sourceChoiceSelector).filter(Boolean),
    );
    return new Map([...choices]
        .filter(([selector]) => !lineSelectors.has(selector))
        .map(([selector, value]) => [selector, { value, items: [] }]));
}

// C ref: wintty.c process_menu_window(). resp[] collects the selector of
// every entry on the current page, selectable or not, and the default arm
// toggles the first entry whose selector matches; for PICK_ONE that ends the
// menu. An entry with a zero identifier comes back from tty_select_menu()
// as one selected item whose identifier is zero, which this port returns as
// 0, the zeroany a_int its only caller (dungeon.c tport_menu()) reads.
//
// The default arm tests gacc[] before it looks for a selector (1741-1749),
// so a key that is both a unique group accelerator and a selector on this
// page toggles the group.  `group` is that group's entry in groupChoices.
function visiblePickOneChoice(rendered, spec, groupChoices, ch) {
    if (groupChoices.has(ch)) {
        const group = groupChoices.get(ch);
        return { found: true, value: group.value, group };
    }
    const explicitLine = rendered.layout.lines.find((line) => (
        line.item
            ? line.item.selector === ch
            : line.zeroIdentifierSelector === ch
    ));
    if (explicitLine) {
        return {
            found: true,
            value: explicitLine.item ? explicitLine.item.value : 0,
        };
    }

    if (!spec.items) {
        const choices = spec.choices ?? new Map();
        const explicitLine = rendered.layout.lines.find(
            (line) => sourceChoiceSelector(line) === ch,
        );
        if (explicitLine && choices.has(ch)) {
            return { found: true, value: choices.get(ch) };
        }
    }
    return { found: false, value: undefined };
}

function unsetPickOneLines(state, spec, rendered, allPages) {
    if (spec.items) {
        const candidates = allPages
            ? selectableItems(spec) : visibleItems(rendered);
        const changed = setItems(state, candidates, false);
        refreshVisibleSelections(state, rendered, changed);
        return;
    }

    const firstGlobalLine = allPages
        ? 0 : rendered.layout.pageIndex * rendered.layout.pageSize;
    const lastGlobalLine = allPages
        ? 2 + (spec.lines?.length ?? 0)
        : firstGlobalLine + rendered.layout.lines.length;
    for (let globalLine = firstGlobalLine;
        globalLine < lastGlobalLine; ++globalLine) {
        const bodyIndex = globalLine - 2;
        if (bodyIndex < 0 || bodyIndex >= (spec.lines?.length ?? 0)) continue;
        const line = spec.lines[bodyIndex];
        const text = typeof line === 'string'
            ? line : String(line?.text ?? line?.label ?? '');
        if (text.length < 4 || text[1] !== ' '
            || !'+*#'.includes(text[2]) || text[3] !== ' ') continue;
        const replacement = `${text.slice(0, 2)}-${text.slice(3)}`;
        if (typeof line === 'string') spec.lines[bodyIndex] = replacement;
        else if (Object.hasOwn(line, 'text')) line.text = replacement;
        else line.label = replacement;

        if (globalLine >= rendered.layout.pageIndex * rendered.layout.pageSize
            && globalLine < (rendered.layout.pageIndex + 1)
                * rendered.layout.pageSize) {
            const localRow = globalLine
                - rendered.layout.pageIndex * rendered.layout.pageSize;
            state.nhDisplay.putch(
                rendered.layout.startColumn + 2,
                localRow,
                '-',
                line?.color ?? NO_COLOR,
                line?.attr ?? 0,
            );
        }
    }
}

function copyMenuItem(item) {
    if (typeof item !== 'object' || item === null) return item;
    if (!Object.hasOwn(item, 'value')) return { ...item };
    return {
        ...item,
        selected: Boolean(item.selected),
        count: Number.isInteger(item.count) ? item.count : -1,
    };
}

async function selectOneTtyMenu(state, spec) {
    const workingSpec = {
        ...spec,
        lines: spec.lines?.map((line) => (
            typeof line === 'object' && line !== null ? { ...line } : line
        )),
        items: spec.items?.map(copyMenuItem),
    };
    // process_menu_window() collects no group accelerators for PICK_NONE and
    // bells for every explicit selector, so a display-only menu can end only
    // by cancelling or committing with nothing selected.
    const pickNone = (spec.how ?? PICK_ONE) === PICK_NONE;
    const groupChoices = pickNone
        ? new Map() : pickOneGroupChoices(workingSpec);
    const hasEmptyCompletion = Object.hasOwn(spec, 'preselected')
        || Object.hasOwn(spec, 'emptyValue');
    const emptyCompletion = Object.hasOwn(spec, 'preselected')
        ? spec.preselected : spec.emptyValue;
    const selectedRows = () => selectableItems(workingSpec)
        .filter(item => item.selected)
        .map(item => ({ value: item.value, count: item.count }));
    const hasSelection = () => workingSpec.items
        ? selectedRows().length > 0
        : (workingSpec.lines ?? []).some(line => {
            const text = typeof line === 'string'
                ? line : String(line?.text ?? line?.label ?? '');
            return sourceChoiceSelector(line) && '+*#'.includes(text[2]);
        });
    const initiallySelected = hasSelection();
    const committedValue = () => {
        // C tty_select_menu recounts the current rows after process_menu_window;
        // an Enter after bulk deselection cannot restore the initial payload.
        // That is C's n == 0, which each caller interprets for itself, so
        // scripts/menu-preselected-empty.test.mjs makes every spec with a
        // preselected row name its emptyValue.
        if (spec.returnSelections) return selectedRows();
        if (initiallySelected && !hasSelection())
            return spec.emptyValue ?? spec.cancelValue ?? null;
        return hasEmptyCompletion ? emptyCompletion : (spec.cancelValue ?? null);
    };
    let pageIndex = 0;
    let rendered = renderTtyMenu(state, workingSpec, pageIndex);
    let pendingCount = null;
    const selectedValue = (value, count = pendingCount) => {
        if (spec.returnSelections) {
            const item = selectableItems(workingSpec)
                .find(row => row.value === value);
            if (item) toggleItem(item, count);
            return selectedRows();
        }
        return spec.returnCount ? { value, count: count ?? -1 } : value;
    };
    // invert_all() with the group accelerator (wintty.c:1745-1746): every
    // entry of the group is toggled, with the pending count if there is one.
    const selectedGroup = (group, count = pendingCount) => {
        if (!spec.returnSelections) return selectedValue(group.value, count);
        invertItems(state, group.items, count, true);
        return selectedRows();
    };
    for (;;) {
        const code = await menuKey(state);
        const incoming = keyCharacter(code);
        // process_menu_window() protects current-page selectors and unique
        // PICK_ONE group accelerators before applying a menu-key alias.
        const explicit = visiblePickOneChoice(
            rendered, workingSpec, groupChoices, incoming,
        );
        if (explicit.found) {
            if (pickNone) {
                // tty_nhbell() and break; the byte was in resp[], so
                // xwaitforspace() returned it and the pending count resets on
                // the next pass.
                pendingCount = null;
                continue;
            }
            await dismissTtyMenu(state, rendered);
            return explicit.group
                ? selectedGroup(explicit.group)
                : selectedValue(explicit.value);
        }

        const mapping = menuCommandMapping(state, incoming);
        const ch = mapping.command;

        if (ch === '\0' || ch === '\x1b') {
            if (pendingCount !== null) {
                pendingCount = null;
                continue;
            }
            await dismissTtyMenu(state, rendered);
            return spec.cancelValue ?? null;
        }
        if (ch >= '0' && ch <= '9') {
            const digit = ch.charCodeAt(0) - '0'.charCodeAt(0);
            // The same long count as the PICK_ANY loop below: a Number while
            // it is a safe integer, then an exact BigInt up to LONG_MAX, and
            // reset by AppendLongDigit()'s overflow.
            const next = appendLongDigit(BigInt(pendingCount ?? 0), digit);
            pendingCount = next > 0n
                ? (next <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(next) : next)
                : null;
            continue;
        }
        if (ch === MENU_SEARCH) {
            if (pickNone) {
                // process_menu_window()'s MENU_SEARCH arm bells for PICK_NONE
                // instead of opening the tty_getlin() prompt.
                pendingCount = null;
                continue;
            }
            const searchText = await tty_getlin(SEARCH_PROMPT, state);
            const searchCount = pendingCount;
            pendingCount = null;
            if (searchText && searchText[0] !== '\x1B') {
                const pattern = `*${searchText}*`;
                // The working copy carries the accelerators tty_end_menu()
                // assigned, which are part of the curr->str the search reads.
                const match = pickOneSearchEntries(state, workingSpec)
                    .find((entry) => pmatchi(pattern, entry.text));
                if (match) {
                    await dismissTtyMenu(state, rendered);
                    return selectedValue(match.value, searchCount);
                }
            }
            restoreMenuInputCursor(state, rendered);
            continue;
        }

        if (ch === '\n' || ch === '\r') {
            pendingCount = null;
            // process_menu_window()'s '\0', '\n', and '\r' cases set
            // finished = TRUE unconditionally, the same commit Space takes.
            await dismissTtyMenu(state, rendered);
            return committedValue();
        }
        if (ch === ' ' || ch === MENU_NEXT_PAGE) {
            pendingCount = null;
            if (pageIndex + 1 < rendered.layout.pageCount) {
                ++pageIndex;
                rendered = renderTtyMenu(
                    state, workingSpec, pageIndex, rendered,
                );
            } else if (ch === ' ') {
                // process_menu_window()'s MENU_NEXT_PAGE arm: on the last
                // page a space finishes the menu, while '>' does not.
                await dismissTtyMenu(state, rendered);
                return committedValue();
            }
            continue;
        }
        if (ch === MENU_PREVIOUS_PAGE && pageIndex > 0) {
            pendingCount = null;
            --pageIndex;
            rendered = renderTtyMenu(state, workingSpec, pageIndex, rendered);
            continue;
        }
        if (ch === MENU_FIRST_PAGE && pageIndex !== 0) {
            pendingCount = null;
            pageIndex = 0;
            rendered = renderTtyMenu(state, workingSpec, pageIndex, rendered);
            continue;
        }
        if (ch === MENU_LAST_PAGE
            && pageIndex + 1 !== rendered.layout.pageCount) {
            pendingCount = null;
            pageIndex = rendered.layout.pageCount - 1;
            rendered = renderTtyMenu(state, workingSpec, pageIndex, rendered);
            continue;
        }
        if (ch === MENU_UNSELECT_PAGE || ch === MENU_UNSELECT_ALL) {
            pendingCount = null;
            unsetPickOneLines(
                state,
                workingSpec,
                rendered,
                ch === MENU_UNSELECT_ALL,
            );
            continue;
        }

        // The switch's default arm (1737-1761) is the only place a mapped
        // key reaches a group accelerator. A key mapped to a command with an
        // arm of its own runs that arm, even where the arm does nothing on
        // this page, and never falls through to here.
        if (!MENU_SWITCH_COMMANDS.has(ch) && groupChoices.has(ch)) {
            await dismissTtyMenu(state, rendered);
            return selectedGroup(groupChoices.get(ch));
        }

        // xwaitforspace() rejects an unknown byte internally, without
        // returning to process_menu_window() and resetting its count.  A
        // recognized default or mapped command still consumes the count
        // even when that command is a no-op for PICK_ONE or this page.
        if (mapping.mapped || isDefaultMenuResponse(incoming)
            || isDismissMoreKey(state, code))
            pendingCount = null;
    }
}

function selectableItems(spec) {
    return (spec.items ?? []).filter((item) => (
        typeof item === 'object'
        && item !== null
        && Object.hasOwn(item, 'value')
        && item.selectable !== false
    ));
}

function visibleItems(rendered) {
    return rendered.layout.lines
        .map((line) => line.item)
        .filter(Boolean);
}

function selectionMarker(item) {
    // process_menu_window() initially renders preselected entries with '*',
    // while set_item_state() uses '+' for an interactively selected entry.
    return item.selected ? (item.count >= 0 ? '#' : '+') : '-';
}

function refreshVisibleSelections(state, rendered, changedItems = null) {
    for (let row = 0; row < rendered.layout.lines.length; ++row) {
        const item = rendered.layout.lines[row].item;
        if (!item || (changedItems && !changedItems.has(item))) continue;
        // set_item_state()'s char.
        state.nhDisplay.putch(
            rendered.layout.startColumn + 2,
            row,
            selectionMarker(item),
            item.color ?? NO_COLOR,
            item.attr ?? 0,
        );
    }
}

function toggleItem(item, pendingCount = null) {
    if (item.selected) {
        if (pendingCount !== null && pendingCount > 0) {
            item.count = pendingCount;
        } else {
            item.selected = false;
            item.count = -1;
        }
        return true;
    } else if (pendingCount !== 0) {
        item.selected = true;
        item.count = pendingCount !== null ? pendingCount : -1;
        return true;
    }
    return false;
}

// C ref: wintty.c set_all_on_page() (1198-1214) and unset_all_on_page()
// (1217-1235).  Each skips an item that already holds the value it is setting,
// so by the time the bulk-restriction test runs the item's selection state is
// always the negation of the target: set_all_on_page() asks
// menuitem_invert_test(1, ..., FALSE) and unset_all_on_page() asks
// menuitem_invert_test(2, ..., TRUE).
function setItems(state, items, selected) {
    const changed = new Set();
    for (const item of items) {
        if (item.selected === selected) continue;
        if (!menuitem_invert_test(item.skipinvert, !selected, state))
            continue;
        item.selected = selected;
        if (!selected) item.count = -1;
        changed.add(item);
    }
    return changed;
}

// C ref: wintty.c invert_all_on_page() (1238-1266) and invert_all()
// (1269-1311), which share one item test:
// `acc ? curr->gselector != acc : !menuitem_invert_test(0, itemflags,
// curr->selected)`.  Group toggling has already picked its items by group
// accelerator and takes the first arm, so it bypasses the restriction
// entirely; `groupToggle` is that non-zero `acc`.
function invertItems(state, items, pendingCount = null, groupToggle = false) {
    const changed = new Set();
    for (const item of items) {
        if (!groupToggle
            && !menuitem_invert_test(item.skipinvert, item.selected, state))
            continue;
        if (item.selected) {
            item.selected = false;
            item.count = -1;
        } else {
            item.selected = true;
            item.count = pendingCount !== null && pendingCount > 0
                ? pendingCount : -1;
        }
        changed.add(item);
    }
    return changed;
}

// C ref: wintty.c process_menu_window()'s gacc[] (1349-1379).
// A group accelerator counts once some entry's differs from its selector;
// then every accelerator that differs from its entry's selector, or is the
// gold symbol, is accepted: for PICK_ANY whatever its count, for PICK_ONE
// only when gcnt[] holds exactly one entry whose selector differs from it.
// invert_all() later toggles every entry that carries the accelerator,
// whatever its selector.
export function menuGroupAccelerators(items, how) {
    const gacc = new Set();
    const gcnt = new Map();
    for (const item of items) {
        if (item.groupSelector && item.groupSelector !== item.selector) {
            gcnt.set(
                item.groupSelector, (gcnt.get(item.groupSelector) ?? 0) + 1,
            );
        }
    }
    if (!gcnt.size) return gacc;
    for (const item of items) {
        if (item.groupSelector
            && (item.groupSelector !== item.selector
                || item.groupSelector === GOLD_SYM)
            && (how === PICK_ANY || gcnt.get(item.groupSelector) === 1))
            gacc.add(item.groupSelector);
    }
    return gacc;
}

async function selectAnyTtyMenu(state, spec) {
    const workingSpec = {
        ...spec,
        items: (spec.items ?? []).map(copyMenuItem),
    };
    const allItems = selectableItems(workingSpec);
    const gacc = menuGroupAccelerators(allItems, PICK_ANY);
    const groupItems = (ch) => (gacc.has(ch)
        ? allItems.filter((item) => item.groupSelector === ch) : []);
    let pageIndex = 0;
    let rendered = renderTtyMenu(state, workingSpec, pageIndex);
    let pendingCount = null;

    for (;;) {
        const code = await menuKey(state);
        const incoming = keyCharacter(code);
        const currentItems = visibleItems(rendered);
        // Current-page selectors are the only PICK_ANY choices protected
        // from a mapped menu command.
        const explicit = currentItems.find(
            (item) => item.selector === incoming,
        );
        if (explicit) {
            // The default arm tests gacc[] before it looks for the selector
            // (1741-1749), so a selector that is also a group accelerator,
            // as gold's '$' is, inverts its group: a count cannot change a
            // selected entry's count there, it only deselects.
            const changed = gacc.has(incoming)
                ? invertItems(state, groupItems(incoming), pendingCount, true)
                : toggleItem(explicit, pendingCount)
                    ? new Set([explicit]) : new Set();
            pendingCount = null;
            refreshVisibleSelections(state, rendered, changed);
            continue;
        }

        const mapping = menuCommandMapping(state, incoming);
        const ch = mapping.command;
        const acceptedIncoming = mapping.mapped || gacc.has(incoming)
            || isDefaultMenuResponse(incoming)
            || isDismissMoreKey(state, code);
        const grouped = groupItems(ch);

        if (ch >= '0' && ch <= '9') {
            // process_menu_window() gives a digit group accelerator its
            // one special chance before starting a count.
            if (pendingCount === null && grouped.length) {
                const changed = invertItems(state, grouped, null, true);
                refreshVisibleSelections(state, rendered, changed);
                continue;
            }
            const digit = ch.charCodeAt(0) - '0'.charCodeAt(0);
            const next = appendLongDigit(BigInt(pendingCount ?? 0), digit);
            pendingCount = next > 0n
                ? (next <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(next) : next)
                : null;
            continue;
        }

        // tty_nhgetch() maps NUL to Escape before process_menu_window().
        if (code === 0 || code === 27) {
            if (pendingCount !== null) {
                pendingCount = null;
                continue;
            }
            await dismissTtyMenu(state, rendered);
            return spec.cancelValue ?? null;
        }

        if (ch === MENU_SEARCH) {
            const searchText = await tty_getlin(SEARCH_PROMPT, state);
            const searchCount = pendingCount;
            pendingCount = null;
            if (searchText && searchText[0] !== '\x1B') {
                const pattern = `*${searchText}*`;
                const matches = new Set();
                for (const item of allItems) {
                    if (pmatchi(
                        pattern,
                        searchItemText(item, state.nhDisplay.cols),
                    )) {
                        if (toggleItem(item, searchCount)) matches.add(item);
                    }
                }
                refreshVisibleSelections(state, rendered, matches);
            }
            restoreMenuInputCursor(state, rendered);
            continue;
        }
        const commandCount = pendingCount;

        if (code === 10 || code === 13) {
            await dismissTtyMenu(state, rendered);
            return allItems
                .filter((item) => item.selected)
                .map((item) => ({ value: item.value, count: item.count }));
        }
        if (ch === ' ' || ch === MENU_NEXT_PAGE) {
            pendingCount = null;
            if (pageIndex + 1 < rendered.layout.pageCount) {
                ++pageIndex;
                rendered = renderTtyMenu(
                    state, workingSpec, pageIndex, rendered,
                );
            } else if (ch === ' ') {
                await dismissTtyMenu(state, rendered);
                return allItems
                    .filter((item) => item.selected)
                    .map((item) => ({ value: item.value, count: item.count }));
            }
            continue;
        }
        if (ch === MENU_PREVIOUS_PAGE && pageIndex > 0) {
            pendingCount = null;
            --pageIndex;
            rendered = renderTtyMenu(state, workingSpec, pageIndex, rendered);
            continue;
        }
        if (ch === MENU_FIRST_PAGE && pageIndex !== 0) {
            pendingCount = null;
            pageIndex = 0;
            rendered = renderTtyMenu(state, workingSpec, pageIndex, rendered);
            continue;
        }
        if (ch === MENU_LAST_PAGE
            && pageIndex + 1 !== rendered.layout.pageCount) {
            pendingCount = null;
            pageIndex = rendered.layout.pageCount - 1;
            rendered = renderTtyMenu(state, workingSpec, pageIndex, rendered);
            continue;
        }

        let changed;
        if (ch === MENU_SELECT_PAGE) {
            changed = setItems(state, currentItems, true);
        } else if (ch === MENU_UNSELECT_PAGE) {
            changed = setItems(state, currentItems, false);
        } else if (ch === MENU_INVERT_PAGE) {
            changed = invertItems(state, currentItems);
        } else if (ch === MENU_SELECT_ALL) {
            changed = setItems(state, allItems, true);
        } else if (ch === MENU_UNSELECT_ALL) {
            changed = setItems(state, allItems, false);
        } else if (ch === MENU_INVERT_ALL) {
            changed = invertItems(state, allItems);
        } else if (!MENU_SWITCH_COMMANDS.has(ch) && grouped.length) {
            // The default arm; a page command that did nothing above has
            // its own arm in C and stops there.
            changed = invertItems(state, grouped, commandCount, true);
        } else {
            if (acceptedIncoming) pendingCount = null;
            continue;
        }
        pendingCount = null;
        refreshVisibleSelections(state, rendered, changed);
    }
}

// PICK_ONE retains the established scalar return value unless returnSelections
// requests C's selected row/count array (including an empty committed array).
// Its preselected payload is retained only while its row remains selected.
// PICK_ANY mirrors tty_select_menu() with an
// ordered array of { value, count } entries, an empty array for an empty
// commit, and cancelValue (null by default) for Esc. PICK_NONE shares the
// PICK_ONE loop, which refuses every selection and so always answers
// cancelValue (or an empty array when returnSelections is requested).
export async function selectTtyMenu(state = game, spec) {
    await emitQueuedNotices(state);
    // wintty.c tty_display_nhwindow() clears rawprint before the menu arm.
    if (state.nhDisplay?.nomuxRaw)
        state.nhDisplay.nomuxRaw.rawprint = 0;
    // wintty.c tty_display_nhwindow()'s NHW_MENU arm (1921-1922) flushes an
    // unacknowledged top line before the menu covers it, guarded by
    // `ttyDisplay->toplin == TOPLINE_NEED_MORE`. A message already
    // acknowledged (TOPLINE_NON_EMPTY, set by yn_function after the player
    // answers a prompt) is not flushed; the menu overlay clears row 0 itself.
    // Its NHW_MESSAGE arm (1874-1877) is `more(); ttyDisplay->toplin =
    // TOPLINE_NEED_MORE; tty_clear_nhwindow(window);`, and that restore is
    // what makes the clear take its home()/cl_end() branch: without it this
    // port's dismissal has already zeroed both fields clearTtyMessageWindow()
    // tests, so row 0 would keep the acknowledged message for the full-screen
    // menus that do not clear it again below.
    // After Escape at --More--, WIN_STOP shares WIN_CANCELLED's bit, so the
    // NHW_MESSAGE call returns at once and only the clear below runs.
    if (state.nhDisplay?.toplin === TOPLINE_NEED_MORE
        && !(messageWindow(state)?.flags & WIN_CANCELLED)
        && await dismissPendingTtyMessage(state)) {
        if (state.nhDisplay) state.nhDisplay.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    } else if (state._pending_message) {
        // The message was already acknowledged (toplin is NON_EMPTY or
        // EMPTY), but _pending_message is still set. A NON_EMPTY line is
        // cleared here, as tty_clear_nhwindow(WIN_MESSAGE) does, so it does
        // not resurface after the menu is dismissed; an EMPTY one stays on
        // screen beside the menu.
        clearTtyMessageWindow(state);
    }
    const how = spec.how ?? PICK_ONE;
    return how === PICK_ANY
        ? selectAnyTtyMenu(state, spec)
        : selectOneTtyMenu(state, spec);
}

function normalizedRoleFilter(state) {
    const current = state.roleFilter ?? state.rfilter ?? {};
    return {
        roles: Array.from(
            { length: roles.length },
            (_, index) => Boolean(current.roles?.[index]),
        ),
        mask: Number.isInteger(current.mask) ? current.mask : 0,
    };
}

function installRoleFilter(state) {
    const normalized = normalizedRoleFilter(state);
    state.roleFilter = normalized;
    state.rfilter = normalized;
    return normalized;
}

export function gotRoleFilter(state = game) {
    const filter = normalizedRoleFilter(state);
    return filter.mask !== 0 || filter.roles.some(Boolean);
}

function indefiniteArticle(text) {
    return /^[aeiouAEIOU]/u.test(text) ? `an ${text}` : `a ${text}`;
}

function roleFilterItems(filter) {
    const items = [{ text: 'Unacceptable roles' }];
    let lastSelector = '';
    for (let index = 0; index < roles.length; ++index) {
        const role = roles[index];
        let selector = lcase(role.name.m[0]);
        if (selector === lastSelector) selector = ucase(selector);
        lastSelector = selector;

        let name = role.name.m;
        if (role.name.f) name += `/${role.name.f}`;
        const roleOk = ok_role(
            index, ROLE_NONE, ROLE_NONE, ROLE_NONE, filter,
        ) && ok_race(
            index, ROLE_NONE, ROLE_NONE, ROLE_NONE, filter,
        ) && ok_gend(
            index, ROLE_NONE, ROLE_NONE, ROLE_NONE, filter,
        ) && ok_align(
            index, ROLE_NONE, ROLE_NONE, ROLE_NONE, filter,
        );
        items.push({
            selector,
            label: indefiniteArticle(name),
            value: role.name.m,
            selected: !roleOk,
        });
    }
    return items;
}

function raceFilterItems(filter) {
    const items = [{ text: '' }, { text: 'Unacceptable races' }];
    for (let index = 0; index < races.length; ++index) {
        const race = races[index];
        const raceOk = ok_race(
            ROLE_NONE, index, ROLE_NONE, ROLE_NONE, filter,
        ) && ok_role(
            ROLE_NONE, index, ROLE_NONE, ROLE_NONE, filter,
        ) && ok_align(
            ROLE_NONE, index, ROLE_NONE, ROLE_NONE, filter,
        );
        items.push({
            selector: ucase(race.noun[0]),
            label: race.noun,
            value: race.noun,
            selected: !raceOk,
        });
    }
    return items;
}

function genderFilterItems(filter) {
    const items = [{ text: '' }, { text: 'Unacceptable genders' }];
    for (let index = 0; index < ROLE_GENDERS; ++index) {
        const gender = genders[index];
        const genderOk = ok_gend(
            ROLE_NONE, ROLE_NONE, index, ROLE_NONE, filter,
        ) && ok_role(
            ROLE_NONE, ROLE_NONE, index, ROLE_NONE, filter,
        ) && ok_race(
            ROLE_NONE, ROLE_NONE, index, ROLE_NONE, filter,
        );
        items.push({
            selector: ucase(gender.adj[0]),
            label: gender.adj,
            value: gender.adj,
            selected: !genderOk,
        });
    }
    return items;
}

function alignmentFilterItems(filter) {
    const items = [{ text: '' }, { text: 'Unacceptable alignments' }];
    for (let index = 0; index < ROLE_ALIGNS; ++index) {
        const alignment = aligns[index];
        const alignmentOk = ok_align(
            ROLE_NONE, ROLE_NONE, ROLE_NONE, index, filter,
        ) && ok_role(
            ROLE_NONE, ROLE_NONE, ROLE_NONE, index, filter,
        ) && ok_race(
            ROLE_NONE, ROLE_NONE, ROLE_NONE, index, filter,
        );
        items.push({
            selector: ucase(alignment.adj[0]),
            label: alignment.adj,
            value: alignment.adj,
            selected: !alignmentOk,
        });
    }
    return items;
}

// C ref: role.c reset_role_filtering() and setup_*menu(..., FALSE, ...).
export function buildRoleFilterMenuSpec(state = game) {
    const filter = normalizedRoleFilter(state);
    return {
        title: `Pick all that apply${gotRoleFilter(state)
            ? ' and/or unpick any that no longer apply' : ''}`,
        ...menuTitleStyle(state),
        items: [
            ...roleFilterItems(filter),
            ...raceFilterItems(filter),
            ...genderFilterItems(filter),
            ...alignmentFilterItems(filter),
        ],
        how: PICK_ANY,
        cancelValue: null,
    };
}

function setRoleFilterValue(filter, value) {
    let index = str2role(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.roles[index] = true;
        return;
    }
    index = str2race(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.mask |= races[index].selfmask;
        return;
    }
    index = str2gend(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.mask |= genders[index].allow;
        return;
    }
    index = str2align(value);
    if (index !== ROLE_NONE && index !== ROLE_RANDOM) {
        filter.mask |= aligns[index].allow;
        return;
    }
}

// Apply a PICK_ANY result. null denotes cancellation; [] is an intentional
// empty commit which clears the filter and resets all pending facets.
export function applyRoleFilterSelection(state = game, selected) {
    if (!Array.isArray(selected)) return false;
    const filter = installRoleFilter(state);
    filter.roles.fill(false);
    filter.mask = 0;
    for (const entry of selected)
        setRoleFilterValue(filter, entry.value);

    state.flags ??= {};
    state.flags.initrole = ROLE_NONE;
    state.flags.initrace = ROLE_NONE;
    state.flags.initgend = ROLE_NONE;
    state.flags.initalign = ROLE_NONE;
    return selected.length > 0;
}

export async function resetRoleFilteringTty(state = game) {
    // role.c reset_role_filtering() (2757) reaches this menu through
    // select_menu() like every other core caller, even though this port keeps
    // the builder beside the other role menus rather than in js/role.js.
    const selected = await select_menu(
        state,
        buildRoleFilterMenuSpec(state),
    );
    return applyRoleFilterSelection(state, selected);
}
