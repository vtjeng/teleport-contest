// tty_menu.js — Source-shaped TTY menu rendering and input.
// C ref: win/tty/wintty.c tty_end_menu(), tty_display_nhwindow(),
// process_menu_window(), and tty_select_menu().

import { game } from './gstate.js';
import { nhgetch } from './input.js';
import { PICK_ANY, PICK_ONE } from './const.js';
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
const SEARCH_PROMPT = 'Search for: ';

export function menuTitleStyle(state = game) {
    const style = state.iflags?.menu_headings;
    return {
        titleAttr: Number.isInteger(style?.attr)
            ? style.attr : ATR_INVERSE,
        titleColor: Number.isInteger(style?.color)
            ? style.color : NO_COLOR,
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
        for (let column = firstColumn; column < display.cols; column++) {
            display.setCell(column, row, ' ', CLR_GRAY, 0);
        }
    }
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

function itemLine(item) {
    if (typeof item === 'string')
        return { text: item, attr: 0, item: null };
    if (!Object.hasOwn(item, 'value')) {
        return {
            text: item.text ?? item.label ?? '',
            attr: item.attr ?? 0,
            color: item.color,
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

export function ttyMenuLayout(display, spec, pageIndex = 0) {
    const allLines = menuLines(spec);
    // tty_end_menu() limits each page to the smaller of 52 accelerators or
    // all terminal rows except the dmore() footer.
    const pageSize = Math.min(52, Math.max(1, display.rows - 1));
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

    // tty_end_menu() reserves one cell on each side of every stored line.
    const maxcol = Math.max(
        footerText.length + 1,
        ...allLines.map((line) => String(line.text ?? '').length + 2),
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

export function renderTtyMenu(state = game, spec, pageIndex = 0) {
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
    const snapshot = layout.fullScreen
        ? copyRegion(display, 0, display.rows)
        : copyRegion(display, layout.repairColumn, restoredRows);
    const baseCursor = [display.cursorCol, display.cursorRow];

    if (layout.fullScreen) display.clearScreen();
    else clearRegion(display, layout.firstColumn, visibleRows);

    for (let row = 0; row < layout.lines.length; row++) {
        const line = layout.lines[row];
        const text = String(line.text ?? '');
        const attr = line.attr ?? 0;
        for (let index = 0; index < text.length; index++) {
            display.setCell(
                layout.startColumn + index,
                row,
                text[index],
                line.color ?? NO_COLOR,
                attr,
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

    return { layout, snapshot, baseCursor };
}

export function dismissTtyMenu(state = game, rendered) {
    const display = state.nhDisplay;
    if (!display || !rendered) return;
    if (rendered.layout.fullScreen) {
        if (state.program_state?.in_role_selection) {
            display.clearScreen();
            state._ttyBaseCursorRow = 0;
        } else {
            restoreRegion(display, 0, rendered.snapshot);
            display.setCursor(...rendered.baseCursor);
        }
    } else if (state.program_state?.in_role_selection) {
        // Role selection overlays the base window's startup text, which tty
        // does not retain as redrawable window data. docorner() therefore
        // clears this slice rather than reconstructing the banner.
        clearRegion(
            display,
            rendered.layout.repairColumn,
            rendered.snapshot.length,
        );
        // docorner(offx, maxrow + 1, 0) leaves BASE_WINDOW on maxrow.  A
        // subsequent rename's empty tty_putstr() advances from this row.
        state._ttyBaseCursorRow = rendered.layout.maxrow;
    } else {
        restoreRegion(
            display,
            rendered.layout.repairColumn,
            rendered.snapshot,
        );
    }
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

function writeToplineCharacter(display, ch) {
    // topl_putsym() wraps before the terminal's final column, leaving that
    // column unused.  tty_getlin() limits input to COLNO characters.
    if (display.cursorCol === display.cols - 1) {
        display.clearToEol();
        display.setCursor(0, display.cursorRow + 1);
    }
    display.setCell(
        display.cursorCol,
        display.cursorRow,
        ch,
        NO_COLOR,
        0,
    );
    display.setCursor(display.cursorCol + 1, display.cursorRow);
}

function eraseToplineCharacter(display) {
    let column = display.cursorCol;
    let row = display.cursorRow;
    if (column === 0 && row > 0) {
        --row;
        column = display.cols - 1;
    }
    if (column > 0) --column;
    display.setCell(column, row, ' ', NO_COLOR, 0);
    display.setCursor(column, row);
}

function clearTtyGetlinPrompt(display) {
    // tty_clear_nhwindow(WIN_MESSAGE) clears the top line after getlin.
    // When input wrapped, docorner() repairs the additional message rows;
    // menu windows do not redraw their overwritten lines until a new page.
    const lastRow = Math.max(0, display.cursorRow);
    for (let row = 0; row <= lastRow && row < display.rows; ++row)
        display.clearRow(row);
    display.setCursor(0, 0);
}

function startTtyGetlinPrompt(display) {
    display.clearRow(0);
    display.setCursor(0, 0);
    for (const ch of SEARCH_PROMPT) writeToplineCharacter(display, ch);
}

// C ref: win/tty/getline.c tty_getlin().  EDIT_GETLIN is disabled in the
// pinned configuration; the recorder supplies DEL for erase and ^U for kill.
async function ttyGetlinSearch(state) {
    const display = state.nhDisplay;
    const input = [];
    startTtyGetlinPrompt(display);

    for (;;) {
        const code = await nhgetch(state);
        if (code === 10 || code === 13) {
            const result = input.join('');
            clearTtyGetlinPrompt(display);
            return result;
        }
        // pgetchar() reaches tty_nhgetch(), which maps NUL to Escape.
        if (code === 0 || code === 27) {
            if (input.length === 0) {
                clearTtyGetlinPrompt(display);
                return null;
            }
            input.length = 0;
            clearTtyGetlinPrompt(display);
            startTtyGetlinPrompt(display);
            continue;
        }
        if (code === 8 || code === 127) {
            if (input.length > 0) {
                input.pop();
                eraseToplineCharacter(display);
            }
            continue;
        }
        if (code === 21) {
            while (input.length > 0) {
                input.pop();
                eraseToplineCharacter(display);
            }
            continue;
        }

        const byte = code & 0xFF;
        if (byte >= 32 && byte !== 127 && input.length < display.cols) {
            const ch = String.fromCharCode(byte);
            input.push(ch);
            writeToplineCharacter(display, ch);
        }
    }
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
        const changed = setItems(candidates, false);
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
    const groupChoices = pickOneGroupChoices(workingSpec);
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
            dismissTtyMenu(state, rendered);
            return explicit.value;
        }

        const mapping = menuCommandMapping(state, incoming);
        const ch = mapping.command;

        // A mapped key can resolve to a unique group accelerator.  The C
        // dispatcher maps it before its fallback group-accelerator branch.
        if (groupChoices.has(ch)) {
            dismissTtyMenu(state, rendered);
            return groupChoices.get(ch);
        }

        if (ch === '\0' || ch === '\x1b') {
            if (pendingCount !== null) {
                pendingCount = null;
                continue;
            }
            dismissTtyMenu(state, rendered);
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
            const searchText = await ttyGetlinSearch(state);
            pendingCount = null;
            if (searchText !== null && searchText.length > 0) {
                const pattern = `*${searchText}*`;
                const match = pickOneSearchEntries(state, spec)
                    .find((entry) => pmatchi(pattern, entry.text));
                if (match) {
                    dismissTtyMenu(state, rendered);
                    return match.value;
                }
            }
            restoreMenuInputCursor(state, rendered);
            continue;
        }

        if (ch === '\n' || ch === '\r') {
            pendingCount = null;
            if (!hasEmptyCompletion) continue;
            dismissTtyMenu(state, rendered);
            return emptyCompletion;
        }
        if (ch === ' ' || ch === MENU_NEXT_PAGE) {
            pendingCount = null;
            if (pageIndex + 1 < rendered.layout.pageCount) {
                ++pageIndex;
                rendered = renderTtyMenu(
                    state, workingSpec, pageIndex,
                );
            } else if (ch === ' ' && hasEmptyCompletion) {
                dismissTtyMenu(state, rendered);
                return emptyCompletion;
            }
            continue;
        }
        if (ch === MENU_PREVIOUS_PAGE && pageIndex > 0) {
            pendingCount = null;
            --pageIndex;
            rendered = renderTtyMenu(state, workingSpec, pageIndex);
            continue;
        }
        if (ch === MENU_FIRST_PAGE && pageIndex !== 0) {
            pendingCount = null;
            pageIndex = 0;
            rendered = renderTtyMenu(state, workingSpec, pageIndex);
            continue;
        }
        if (ch === MENU_LAST_PAGE
            && pageIndex + 1 !== rendered.layout.pageCount) {
            pendingCount = null;
            pageIndex = rendered.layout.pageCount - 1;
            rendered = renderTtyMenu(state, workingSpec, pageIndex);
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

function setItems(items, selected) {
    const changed = new Set();
    for (const item of items) {
        if (item.bulkSelectable === false || item.selected === selected)
            continue;
        item.selected = selected;
        if (!selected) item.count = -1;
        changed.add(item);
    }
    return changed;
}

function invertItems(items, pendingCount = null) {
    const changed = new Set();
    for (const item of items) {
        if (item.bulkSelectable === false) continue;
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
                const changed = invertItems(grouped);
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
            dismissTtyMenu(state, rendered);
            return spec.cancelValue ?? null;
        }

        if (ch === MENU_SEARCH) {
            const searchText = await ttyGetlinSearch(state);
            const searchCount = pendingCount;
            pendingCount = null;
            if (searchText !== null && searchText.length > 0) {
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
            dismissTtyMenu(state, rendered);
            return allItems
                .filter((item) => item.selected)
                .map((item) => ({ value: item.value, count: item.count }));
        }
        if (ch === ' ' || ch === MENU_NEXT_PAGE) {
            pendingCount = null;
            if (pageIndex + 1 < rendered.layout.pageCount) {
                ++pageIndex;
                rendered = renderTtyMenu(state, workingSpec, pageIndex);
            } else if (ch === ' ') {
                dismissTtyMenu(state, rendered);
                return allItems
                    .filter((item) => item.selected)
                    .map((item) => ({ value: item.value, count: item.count }));
            }
            continue;
        }
        if (ch === MENU_PREVIOUS_PAGE && pageIndex > 0) {
            pendingCount = null;
            --pageIndex;
            rendered = renderTtyMenu(state, workingSpec, pageIndex);
            continue;
        }
        if (ch === MENU_FIRST_PAGE && pageIndex !== 0) {
            pendingCount = null;
            pageIndex = 0;
            rendered = renderTtyMenu(state, workingSpec, pageIndex);
            continue;
        }
        if (ch === MENU_LAST_PAGE
            && pageIndex + 1 !== rendered.layout.pageCount) {
            pendingCount = null;
            pageIndex = rendered.layout.pageCount - 1;
            rendered = renderTtyMenu(state, workingSpec, pageIndex);
            continue;
        }

        let changed;
        if (ch === MENU_SELECT_PAGE) {
            changed = setItems(currentItems, true);
        } else if (ch === MENU_UNSELECT_PAGE) {
            changed = setItems(currentItems, false);
        } else if (ch === MENU_INVERT_PAGE) {
            changed = invertItems(currentItems);
        } else if (ch === MENU_SELECT_ALL) {
            changed = setItems(allItems, true);
        } else if (ch === MENU_UNSELECT_ALL) {
            changed = setItems(allItems, false);
        } else if (ch === MENU_INVERT_ALL) {
            changed = invertItems(allItems);
        } else if (grouped.length) {
            changed = invertItems(grouped, commandCount);
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
// commit, and cancelValue (null by default) for Esc.
export async function selectTtyMenu(state = game, spec) {
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
    const selected = await selectTtyMenu(
        state,
        buildRoleFilterMenuSpec(state),
    );
    return applyRoleFilterSelection(state, selected);
}
