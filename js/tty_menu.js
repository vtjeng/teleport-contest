// tty_menu.js — Source-shaped TTY menu and text window rendering and input.
// C ref: win/tty/wintty.c tty_end_menu(), tty_display_nhwindow(),
// process_menu_window(), process_text_window(), dmore(), and
// tty_select_menu().

import { bot, status_window_rows } from './display.js';
import { game } from './gstate.js';
import { tty_getlin } from './getline.js';
import {
    decodeUtf8ByteString,
    encodeUtf8ByteString,
} from './hacklib.js';
import { nhgetch } from './input.js';
import {
    clearTtyMessageWindow,
    dismissPendingTtyMessage,
    MORE_PROMPT,
    TOPLINE_NEED_MORE,
    xwaitforspace,
} from './tty_message.js';
import { BUFSZ, PICK_ANY, PICK_NONE, PICK_ONE } from './const.js';
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
    CLR_GRAY,
    NO_COLOR,
} from './terminal.js';
import { menuitem_invert_test, select_menu } from './windows.js';

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

export function menuTitleStyle(state = game) {
    const style = state.iflags?.menu_headings;
    return {
        titleAttr: Number.isInteger(style?.attr)
            ? style.attr : ATR_INVERSE,
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
function writeStyledText(display, column, row, text, color, attr) {
    const bytes = encodeUtf8ByteString(text);
    for (let index = 0; index < bytes.length;) {
        const spaces = bytes[index] === 0x20;
        let end = index + 1;
        while (end < bytes.length && (bytes[end] === 0x20) === spaces) ++end;
        const compressed = spaces && end - index >= 5;
        for (; index < end; ++index) {
            // writeRecorderTtyWindowLine() below keeps both bytes this drops,
            // and it is wrong to. It ports the same loop for a window that
            // process_text_window() draws, where g_putch() takes a high-bit
            // first byte, and it writes every byte below 0x80 rather than
            // stopping at 0x20. Neither loop matches C: the deferral
            // text-window-line-drops-its-g-putch-first-byte states what C
            // records, and closes when the two become one.
            if (bytes[index] < 0x20 || bytes[index] >= 0x80) continue;
            display.setCell(
                column + index,
                row,
                String.fromCharCode(bytes[index]),
                compressed ? NO_COLOR : color,
                compressed ? 0 : attr,
            );
        }
    }
}

// Recorder patch 006 receives each process_text_window() byte after C has
// advanced ttyDisplay->curx. Printable ASCII replaces its shadow-grid cell.
// A later high-bit byte promotes from signed char to a negative int, so
// nomux_putch() ignores it and the prior cell survives at that byte column.
// g_putch() treats the first byte specially and strips its high bit before
// calling nomux_putch().
function writeRecorderTtyWindowLine(
    display,
    column,
    row,
    byteString,
) {
    const bytes = encodeUtf8ByteString(byteString);
    for (let index = 0; index !== bytes.length; ++index) {
        const byte = bytes[index];
        let cell = null;
        if (byte < 0x80) cell = String.fromCharCode(byte);
        else if (index === 0) cell = String.fromCharCode(byte ^ 0x80);
        if (cell !== null) {
            display.setCell(
                column + index,
                row,
                cell,
                NO_COLOR,
                0,
            );
        }
    }
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
        for (let column = firstColumn; column < display.cols; column++) {
            display.setCell(column, row, ' ', CLR_GRAY, 0);
        }
    }
}

function clearRowFrom(display, firstColumn, row) {
    for (let column = firstColumn; column < display.cols; ++column)
        display.setCell(column, row, ' ', CLR_GRAY, 0);
}

function restoreRegion(display, firstColumn, snapshot) {
    for (let row = 0; row < snapshot.length; row++) {
        for (let offset = 0; offset < snapshot[row].length; offset++) {
            const cell = snapshot[row][offset];
            display.setCell(
                firstColumn + offset,
                row,
                cell.ch,
                cell.color,
                cell.attr,
            );
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
// `snapshot` and `baseCursor` are the port's stand-in for docrt(): C's cls()
// blanks the physical screen and clears the glyph buffer, docrt_flags() then
// replays every remembered glyph through show_glyph(), and flush_screen(1)
// prints them and homes the cursor on the hero.  Restoring the frame the
// window covered reaches the same screen without the whole-screen rebuild
// js/display.js flush_screen() would perform, which would paint over a menu
// that has already been drawn.
//
// Two things the restore alone cannot reproduce follow it, and they are what
// makes the status rows behave:
//
//   - cls() blanks the status rows along with everything else and nothing in
//     docrt_flags() paints them again, so they are blank on leaving docrt().
//   - docrt_flags()'s post_map block (display.c:466) sets disp.botlx, and
//     flush_screen()'s first act (display.c:2235-2239) is to spend it on
//     bot().  While js/windows.js select_menu() or getlin() holds
//     gb.bot_disabled, that bot() returns without writing and without
//     clearing disp.botlx, so the rows stay blank until the menu is gone.
//
// js/display.js bot() and timebot() paint the module-level game rather than a
// supplied state, the same constraint js/options.js:3911 records for docrt(),
// so this branch refuses any other state instead of repairing the wrong
// screen.  Every production caller passes the module-level game; a focused
// test that supplies its own state keeps its window off column zero and takes
// the docorner() branch, which needs neither.
async function erase_menu_or_text(state, display, snapshot, baseCursor) {
    if (state !== game) {
        throw new Error(
            'erase_menu_or_text requires the module-level game',
        );
    }
    restoreRegion(display, 0, snapshot);
    display.setCursor(...baseCursor);

    // wintty.c pins wins[WIN_STATUS] to the bottom of the terminal and sizes
    // it at status_window_rows() rows, so counting up from the last row is
    // what names the rows term_clear_screen() blanks and nothing repaints.
    for (let row = 0; row < status_window_rows(); ++row)
        clearRow(display, display.rows - 1 - row);
    state.disp ??= {};
    state.disp.botlx = true;

    // display.c:2235-2239 dispatches three ways, but docrt_flags()'s post_map
    // block has just set disp.botlx on the line above, exactly as display.c:466
    // does, so the first arm always wins here and timebot() is unreachable.
    await bot();
}

// C ref: win/tty/wintty.c compress_str(). tty_putstr() applies this to menu
// and text data before it measures or stores a line. CO is the live terminal
// width and BUFSZ bounds the function's static buffer.
function compressTtyWindowLine(value, columns) {
    const source = encodeUtf8ByteString(value ?? '');
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
// narrowing the eventual window.
export function ttyMenuTextData(lines, columns) {
    const stored = [];
    let maxcol = 0;

    const putstr = (line) => {
        const compressed = compressTtyWindowLine(line, columns);
        const n0 = compressed.length + 1;
        maxcol = Math.max(maxcol, n0);
        if (n0 > columns) {
            let split = columns - 1;
            while (split && compressed[split] !== 0x20
                && compressed[split] !== 0x0A) {
                --split;
            }
            if (split) {
                const next = split + 1;
                stored.push(decodeUtf8ByteString(compressed.slice(0, next)));
                putstr(decodeUtf8ByteString(compressed.slice(next)));
                return;
            }
        }
        stored.push(decodeUtf8ByteString(compressed));
    };

    for (const line of lines) putstr(line?.text ?? line);
    return { lines: stored, maxcol };
}

// C refs: tty_display_nhwindow(NHW_MENU) and process_text_window(). A menu
// with cw->data follows the text-window line loop but retains menu geometry.
export function ttyMenuTextLayout(display, rawLines, overlay = true) {
    const data = ttyMenuTextData(rawLines, display.cols);
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
    const clearsScreen = maxrow >= display.rows || !overlay;
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
    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty menu text window requires an initialized display');

    // look_here() displays WIN_MESSAGE before it creates the menu. Its only
    // input-bearing arm dismisses a pending topline before the menu appears.
    await dismissPendingTtyMessage(state);
    clearTtyMessageWindow(state);
    display.clearRow(0);

    const layout = ttyMenuTextLayout(
        display,
        rawLines,
        state.iflags?.menu_overlay !== false,
    );
    if (layout.maxrow >= display.rows) {
        // process_text_window() pagination remains a named unsupported
        // boundary. BUFSZ bounds each source line, but repeated wrapping can
        // still make even a four-object window taller than the terminal.
        throw new RangeError('paged tty menu text window is not supported');
    }

    const restoredRows = Math.min(display.rows, layout.maxrow + 1);
    const snapshot = layout.fullRepair
        ? copyRegion(display, 0, display.rows)
        : copyRegion(display, layout.repairColumn, restoredRows);
    const baseCursor = [display.cursorCol, display.cursorRow];

    if (layout.clearsScreen) display.clearScreen();
    for (let row = 0; row < layout.lines.length; ++row) {
        clearRowFrom(display, layout.firstColumn, row);
        writeRecorderTtyWindowLine(
            display,
            layout.lineColumn,
            row,
            layout.lines[row],
        );
    }
    clearRowFrom(display, layout.firstColumn, layout.promptRow);
    writeStyledText(
        display,
        layout.promptColumn,
        layout.promptRow,
        MORE_PROMPT,
        NO_COLOR,
        0,
    );
    display.setCursor(
        layout.promptColumn + MORE_PROMPT.length,
        layout.promptRow,
    );

    const response = await xwaitforspace(state);

    if (layout.fullRepair) {
        await erase_menu_or_text(state, display, snapshot, baseCursor);
    } else {
        restoreRegion(display, layout.repairColumn, snapshot);
    }
    return response;
}

function itemLine(item) {
    if (typeof item === 'string')
        return { text: item, attr: 0, styleStart: 0, item: null };
    if (!Object.hasOwn(item, 'value')) {
        return {
            text: item.text ?? item.label ?? '',
            attr: item.attr ?? 0,
            color: item.color,
            styleStart: 0,
            item: null,
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
        styleStart: 4,
        item,
    };
}

function menuLines(spec) {
    const body = spec.items
        ? spec.items.map(itemLine)
        : (spec.lines ?? []).map((line) => (
            typeof line === 'string'
                ? { text: line, attr: 0, item: null }
                : { ...line, item: null }
        ));
    // tty_end_menu() writes a prompt line and its blank separator only when
    // the caller supplied one; invent.c display_pickinv() passes none for a
    // plain inventory display.
    if (spec.title == null) return body;
    return [
        {
            text: spec.title,
            attr: spec.titleAttr ?? ATR_INVERSE,
            color: spec.titleColor ?? NO_COLOR,
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

export function ttyMenuLayout(display, spec, pageIndex = 0) {
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
        const bytes = encodeUtf8ByteString(String(line.text ?? ''));
        if (bytes.length + 2 > display.cols) {
            line.text = decodeUtf8ByteString(
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
            encodeUtf8ByteString(String(line.text ?? '')).length + 2
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
    const fullScreen = spec.overlay === false || maxrow >= display.rows
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
    const layout = ttyMenuLayout(display, spec, pageIndex);
    const restoredRows = Math.min(display.rows, layout.maxrow + 1);
    const visibleRows = Math.min(display.rows, layout.maxrow);
    if (!layout.fullScreen) {
        // tty_display_nhwindow() clears the message window before a corner
        // menu.  The remaining base-window content is repaired by docorner()
        // when the menu is dismissed.
        display.clearRow(0);
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

    if (layout.fullScreen) display.clearScreen();
    else clearRegion(display, layout.firstColumn, visibleRows);

    // process_menu_window() decides once from the complete linked menu, before
    // it selects a page.  A zero identifier is any display-only line or
    // heading in this representation.
    let showObjectSymbols = state.iflags?.use_menu_glyphs === true;
    if ((state.iflags?.menuobjsyms & 4) !== 0) {
        const hasHeader = (spec.items ?? []).some((item) => (
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
            display.setCell(
                layout.startColumn + 2,
                row,
                !printable ? ' '
                    : ttychar < 0x80 ? String.fromCharCode(ttychar) : '\uFFFD',
                printable ? glyphInfo.color ?? NO_COLOR : NO_COLOR,
                0,
            );
        }
    }
    for (let index = 0; index < layout.footerText.length; index++) {
        display.setCell(
            layout.startColumn + index,
            layout.footerRow,
            layout.footerText[index],
            NO_COLOR,
            0,
        );
    }
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
            display.clearScreen();
            state._ttyBaseCursorRow = 0;
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
        state._ttyBaseCursorRow = rendered.base.maxrow;
    } else {
        restoreRegion(
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
        display.setCell(column, row, ' ', NO_COLOR, 0);
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
        display.setCell(index, row, MORE_PROMPT[index], NO_COLOR, 0);
    display.setCursor(MORE_PROMPT.length, row);
    return xwaitforspace(state);
}

// C ref: win/tty/wintty.c tty_display_nhwindow(NHW_TEXT) followed by
// process_text_window(). With H2344_BROKEN a text window's offx is 0, so its
// lines begin in column 0 rather than after the one-cell margin an offset
// window writes. Returns morc, the key that dismissed the last --More--.
export async function displayTtyTextWindow(state = game, lines) {
    const display = state.nhDisplay;
    if (!display)
        throw new Error('tty text window requires an initialized display');
    const maxrow = lines.length;
    const lastRow = display.rows - 1;

    // C ref: wintty.c tty_display_nhwindow() NHW_TEXT arm (1921-1922).
    // Flush an unacknowledged top-line message before the text window
    // covers it, the same guard selectTtyMenu() applies for menus.
    if (display.toplin === TOPLINE_NEED_MORE
        && await dismissPendingTtyMessage(state)) {
        if (state.nhDisplay) state.nhDisplay.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    }

    // tty_dismiss_nhwindow() repairs a column-zero text window with
    // docrt()+flush_screen(), the same repair dismissTtyMenu() models for a
    // full-screen menu.
    const snapshot = copyRegion(display, 0, display.rows);
    const baseCursor = [display.cursorCol, display.cursorRow];

    if (maxrow >= display.rows || state.iflags?.menu_overlay === false) {
        display.clearScreen();
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
            display.clearScreen();
            n = 0;
        }
        const line = lines[i];
        const text = String(line.text ?? '');
        clearRow(display, n);
        writeStyledText(
            display, 0, n, text, line.color ?? NO_COLOR, line.attr ?? 0,
        );
        // wintty.c process_text_window() sends putmixed() lines through
        // decode_mixed(). A decoded glyph can use a rendered DEC character
        // that writeStyledText() deliberately drops as a non-ASCII byte, so
        // callers identify those physical cells for direct substitution.
        for (const cell of line.glyphCells ?? []) {
            display.setCell(
                cell.column,
                n,
                cell.ch,
                line.color ?? NO_COLOR,
                line.attr ?? 0,
            );
        }
        n++;
    }

    if (!cancelled) {
        // A text window clears from the row after its last line before
        // homing to the bottom row for the closing prompt.
        for (let row = n; row < display.rows; row++)
            clearRow(display, row);
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

function isDefaultMenuResponse(ch) {
    return ch === '\0' || ch === '\x1b' || ch === '\n' || ch === '\r'
        || ch === ' ' || (ch >= '0' && ch <= '9')
        || '^|><.-@,\\~:'.includes(ch);
}

function lowercaseAscii(ch) {
    const code = ch.charCodeAt(0);
    return code >= 65 && code <= 90
        ? String.fromCharCode(code + 32)
        : ch;
}

// C ref: src/strutil.c pmatchi(). '*' matches zero or more characters and
// '?' matches exactly one; all other comparisons are case-insensitive.
function pmatchi(pattern, text) {
    let previous = new Array(text.length + 1).fill(false);
    previous[0] = true;
    for (const patternCharacter of pattern) {
        const current = new Array(text.length + 1).fill(false);
        if (patternCharacter === '*') current[0] = previous[0];
        for (let index = 1; index <= text.length; ++index) {
            if (patternCharacter === '*') {
                current[index] = previous[index] || current[index - 1];
            } else if (patternCharacter === '?'
                || lowercaseAscii(patternCharacter)
                    === lowercaseAscii(text[index - 1])) {
                current[index] = previous[index - 1];
            }
        }
        previous = current;
    }
    return previous[text.length];
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

function pickOneGroupChoices(spec) {
    if (spec.items) {
        const grouped = new Map();
        const counts = new Map();
        for (const item of selectableItems(spec)) {
            if (!item.groupSelector) continue;
            counts.set(
                item.groupSelector,
                (counts.get(item.groupSelector) ?? 0) + 1,
            );
            grouped.set(item.groupSelector, item.value);
        }
        return new Map([...grouped].filter(([selector]) => (
            counts.get(selector) === 1
        )));
    }

    const choices = spec.choices ?? new Map();
    const lineSelectors = new Set(
        (spec.lines ?? []).map(sourceChoiceSelector).filter(Boolean),
    );
    return new Map([...choices].filter(([selector]) => (
        !lineSelectors.has(selector)
    )));
}

function visiblePickOneChoice(rendered, spec, groupChoices, ch) {
    const explicitItem = visibleItems(rendered).find(
        (item) => item.selector === ch,
    );
    if (explicitItem) return { found: true, value: explicitItem.value };

    if (!spec.items) {
        const choices = spec.choices ?? new Map();
        const explicitLine = rendered.layout.lines.find(
            (line) => sourceChoiceSelector(line) === ch,
        );
        if (explicitLine && choices.has(ch)) {
            return { found: true, value: choices.get(ch) };
        }
    }
    if (groupChoices.has(ch)) {
        return { found: true, value: groupChoices.get(ch) };
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
            state.nhDisplay.setCell(
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
    let pageIndex = 0;
    let rendered = renderTtyMenu(state, workingSpec, pageIndex);
    let pendingCount = null;
    for (;;) {
        const code = await nhgetch(state);
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
            return explicit.value;
        }

        const mapping = menuCommandMapping(state, incoming);
        const ch = mapping.command;

        // A mapped key can resolve to a unique group accelerator.  The C
        // dispatcher maps it before its fallback group-accelerator branch.
        if (groupChoices.has(ch)) {
            await dismissTtyMenu(state, rendered);
            return groupChoices.get(ch);
        }

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
            const previous = pendingCount ?? 0;
            const next = previous * 10 + digit;
            pendingCount = Number.isSafeInteger(next) && next > 0
                ? next : null;
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
            pendingCount = null;
            if (searchText && searchText[0] !== '\x1B') {
                const pattern = `*${searchText}*`;
                const match = pickOneSearchEntries(state, spec)
                    .find((entry) => pmatchi(pattern, entry.text));
                if (match) {
                    await dismissTtyMenu(state, rendered);
                    return match.value;
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
            return hasEmptyCompletion
                ? emptyCompletion : (spec.cancelValue ?? null);
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
                return hasEmptyCompletion
                    ? emptyCompletion : (spec.cancelValue ?? null);
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

        // xwaitforspace() rejects an unknown byte internally, without
        // returning to process_menu_window() and resetting its count.  A
        // recognized default or mapped command still consumes the count
        // even when that command is a no-op for PICK_ONE or this page.
        if (mapping.mapped || isDefaultMenuResponse(incoming))
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
        state.nhDisplay.setCell(
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

async function selectAnyTtyMenu(state, spec) {
    const workingSpec = {
        ...spec,
        items: (spec.items ?? []).map(copyMenuItem),
    };
    const allItems = selectableItems(workingSpec);
    let pageIndex = 0;
    let rendered = renderTtyMenu(state, workingSpec, pageIndex);
    let pendingCount = null;

    for (;;) {
        const code = await nhgetch(state);
        const incoming = keyCharacter(code);
        const currentItems = visibleItems(rendered);
        // Current-page selectors are the only PICK_ANY choices protected
        // from a mapped menu command.
        const explicit = currentItems.find(
            (item) => item.selector === incoming,
        );
        if (explicit) {
            const changed = toggleItem(explicit, pendingCount)
                ? new Set([explicit]) : new Set();
            pendingCount = null;
            refreshVisibleSelections(state, rendered, changed);
            continue;
        }

        const mapping = menuCommandMapping(state, incoming);
        const ch = mapping.command;
        const incomingGrouped = allItems.some((item) => (
            item.groupSelector === incoming
            && (item.groupSelector !== item.selector
                || item.groupSelector === GOLD_SYM)
        ));
        const acceptedIncoming = mapping.mapped || incomingGrouped
            || isDefaultMenuResponse(incoming);
        const grouped = allItems.filter((item) => (
            item.groupSelector === ch
            && (item.groupSelector !== item.selector
                || item.groupSelector === GOLD_SYM)
        ));

        if (ch >= '0' && ch <= '9') {
            // process_menu_window() gives a digit group accelerator its
            // one special chance before starting a count.
            if (pendingCount === null && grouped.length) {
                const changed = invertItems(state, grouped, null, true);
                refreshVisibleSelections(state, rendered, changed);
                continue;
            }
            const digit = ch.charCodeAt(0) - '0'.charCodeAt(0);
            const previous = pendingCount ?? 0;
            const next = previous * 10 + digit;
            pendingCount = Number.isSafeInteger(next) && next > 0
                ? next
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
        } else if (grouped.length) {
            changed = invertItems(state, grouped, commandCount, true);
        } else {
            if (acceptedIncoming) pendingCount = null;
            continue;
        }
        pendingCount = null;
        refreshVisibleSelections(state, rendered, changed);
    }
}

// PICK_ONE retains the established scalar return value. Its preselected and
// optional emptyValue fields let source callers interpret select_menu()'s
// unusual zero-selection result. PICK_ANY mirrors tty_select_menu() with an
// ordered array of { value, count } entries, an empty array for an empty
// commit, and cancelValue (null by default) for Esc. PICK_NONE shares the
// PICK_ONE loop, which refuses every selection and so always answers
// cancelValue.
export async function selectTtyMenu(state = game, spec) {
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
    if (state.nhDisplay?.toplin === TOPLINE_NEED_MORE
        && await dismissPendingTtyMessage(state)) {
        if (state.nhDisplay) state.nhDisplay.toplin = TOPLINE_NEED_MORE;
        clearTtyMessageWindow(state);
    } else if (state._pending_message) {
        // The message was already acknowledged (toplin is NON_EMPTY or
        // EMPTY), but _pending_message is still set. The overlay menu's
        // renderTtyMenu clears row 0 physically; clear the message state
        // here so it does not resurface after the menu is dismissed.
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
    return /^[aeiou]/iu.test(text) ? `an ${text}` : `a ${text}`;
}

function roleFilterItems(filter) {
    const items = [{ text: 'Unacceptable roles' }];
    let lastSelector = '';
    for (let index = 0; index < roles.length; ++index) {
        const role = roles[index];
        let selector = role.name.m[0].toLowerCase();
        if (selector === lastSelector) selector = selector.toUpperCase();
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
            selector: race.noun[0].toUpperCase(),
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
            selector: gender.adj[0].toUpperCase(),
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
            selector: alignment.adj[0].toUpperCase(),
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
        overlay: state.iflags?.menu_overlay !== false,
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
