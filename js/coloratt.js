// coloratt.js — Color, attribute, and menu-color parsing from coloratt.c.
// C refs: coloratt.c match_str2clr(), match_str2attr(),
// add_menu_coloring_parsed(), add_menu_coloring(), count_menucolors(),
// check_enhanced_colors(), wc_color_name(), and the complete colornames[]
// table those functions reach.

import { BUFSZ, CLR_MAX, NH_BASIC_COLOR, PICK_ONE, PICK_ANY, HL_NONE, HL_BOLD, HL_DIM, HL_ITALIC, HL_ULINE, HL_BLINK, HL_INVERSE } from './const.js';
import { COLOR_NAMES, COLOR_TABLE } from './color_data.js';
import {
    fuzzymatch,
    mungspaces,
    strstri,
    truncateByteString,
} from './hacklib.js';
import {
    regex_compile,
    regex_error_desc,
    regex_init,
} from './posixregex.js';
import { NO_COLOR } from './terminal.js';
import { select_menu, ttyMenuColorAttribute } from './windows.js';

// C ref: coloratt.c attrnames[]. These are the source ATR_* enum values,
// rather than the recorder attribute bits js/terminal.js exposes. The
// JavaScript windows.c seam maps a matched source value before TTY drawing.
export const MENU_COLOR_ATTRIBUTES = Object.freeze([
    Object.freeze({ name: 'none', attr: 0 }),
    Object.freeze({ name: 'bold', attr: 1 }),
    Object.freeze({ name: 'dim', attr: 2 }),
    Object.freeze({ name: 'italic', attr: 3 }),
    Object.freeze({ name: 'underline', attr: 4 }),
    Object.freeze({ name: 'blink', attr: 5 }),
    Object.freeze({ name: 'inverse', attr: 7 }),
    Object.freeze({ name: null, attr: 0 }),
    Object.freeze({ name: 'normal', attr: 0 }),
    Object.freeze({ name: 'uline', attr: 4 }),
    Object.freeze({ name: 'reverse', attr: 7 }),
]);

function colorAtoi(value) {
    const digits = String(value).match(/^[+-]?\d+/u);
    let wide = digits ? BigInt(digits[0].replace(/^\+/u, '')) : 0n;
    const longMax = (1n << 63n) - 1n;
    const longMin = -(1n << 63n);
    if (wide > longMax) wide = longMax;
    else if (wide < longMin) wide = longMin;
    return Number(BigInt.asIntN(32, wide));
}

function basicColor(value) {
    for (const { name, color } of COLOR_NAMES) {
        if (name === null) continue;
        if (fuzzymatch(value, name, ' -_', true)) return color;
    }
    if (/^\d/u.test(value)) {
        const color = colorAtoi(value);
        if (color >= 0 && color < CLR_MAX) return color;
    }
    return null;
}

// C ref: coloratt.c clr2colorname(). Returns the canonical name for a basic
// color number (0-15), or null if no name matches. The table uses only the
// entries before the null separator; COLOR_NAMES already carries them.
export function clr2colorname(clr) {
    for (const entry of COLOR_NAMES) {
        if (entry.name === null) break; // separator
        if (entry.name && entry.color === clr) return entry.name;
    }
    return null;
}

// C ref: coloratt.c match_str2clr(). Null is C's CLR_MAX sentinel. The
// caller supplies config_error_add() because coloratt.c reports through the
// active configuration frame without owning that frame.
export function match_str2clr(value, suppressMessage = false, report = null) {
    const color = basicColor(String(value));
    if (color !== null) return color;
    if (!suppressMessage && report) {
        report(`Unknown color '${truncateByteString(value, 60)}'`);
    }
    return null;
}

// C ref: coloratt.c match_str2attr(). Null is C's -1 sentinel.
export function match_str2attr(value, complain = false, report = null) {
    const text = String(value);
    const row = MENU_COLOR_ATTRIBUTES.find(({ name }) => (
        name !== null && fuzzymatch(text, name, ' -_', true)
    ));
    if (row) return row.attr;
    if (complain && report) {
        report(
            `Unknown text attribute '${truncateByteString(text, 50)}'`,
        );
    }
    return null;
}

// C ref: coloratt.c add_menu_coloring_parsed(). Each successful rule is
// prepended, so later configuration lines win and the first match wins.
export function add_menu_coloring_parsed(
    state, pattern, color, attr, report = null,
) {
    if (pattern == null) return false;
    const regex = regex_init();
    if (!regex_compile(String(pattern), regex)) {
        if (report) {
            report(`Menucolor regex error: ${regex_error_desc(regex)}`);
        }
        return false;
    }
    state.gm ??= {};
    state.gm.menu_colorings = {
        regex,
        origstr: String(pattern),
        color,
        attr,
        next: state.gm.menu_colorings ?? null,
    };
    state.iflags ??= {};
    state.iflags.use_menu_color = true;
    return true;
}

// C ref: coloratt.c add_menu_coloring(). The input has already passed
// parse_config_line()'s mungspaces() pass. This function copies it through a
// BUFSZ buffer, parses the first '=' and '&', then removes matching quotes
// around the pattern without condensing the pattern again.
export function add_menu_coloring(state, tmpstr, report = null) {
    const str = truncateByteString(String(tmpstr ?? ''), BUFSZ - 1);
    const equals = str.indexOf('=');
    if (equals < 0) {
        if (report) report('Malformed MENUCOLOR');
        return false;
    }

    const colorAndAttr = mungspaces(str.slice(equals + 1));
    const amp = colorAndAttr.indexOf('&');
    const colorText = amp < 0
        ? colorAndAttr : colorAndAttr.slice(0, amp);
    const color = match_str2clr(colorText, false, report);
    if (color === null) return false;

    let attr = 0;
    if (amp >= 0) {
        const attrText = colorAndAttr.slice(amp + 1);
        attr = match_str2attr(attrText, true, report);
        if (attr === null) return false;
    }

    let pattern = str.slice(0, equals);
    if (pattern[0] === '"' || pattern[0] === "'") {
        let close = pattern.length - 1;
        while (close >= 0 && /[\t\n\v\f\r ]/u.test(pattern[close])) --close;
        if (pattern[close] === pattern[0]) {
            pattern = pattern.slice(1, close);
        }
    }
    return add_menu_coloring_parsed(state, pattern, color, attr, report);
}

// C ref: coloratt.c count_menucolors().
export function count_menucolors(state) {
    let count = 0;
    for (let rule = state.gm?.menu_colorings; rule; rule = rule.next) ++count;
    return count;
}

function colortable_to_int32(entry) {
    if (entry.type === 'rgb_color') {
        return (entry.r * 0x10000) + (entry.g * 0x100) + entry.b;
    }
    if (entry.type === 'nh_color') return entry.tableIndex | NH_BASIC_COLOR;
    return NO_COLOR | NH_BASIC_COLOR;
}

function scanWidthTwoHex(value, start) {
    // scanf skips leading C whitespace before each %x conversion; skipped
    // bytes do not consume the conversion's field width.
    while (start < value.length && /[\t\n\v\f\r ]/u.test(value[start]))
        ++start;
    const field = value.slice(start, start + 2);
    if (!field) return null;
    // The recorder's glibc accepts a width-exhausted 0x prefix as zero.
    if (/^0x/iu.test(field)) return { value: 0n, next: start + 2 };
    let index = 0;
    let negative = false;
    if (field[index] === '+' || field[index] === '-') {
        negative = field[index] === '-';
        ++index;
    }
    const begin = index;
    while (index < field.length && /[0-9a-f]/iu.test(field[index])) ++index;
    if (index === begin) return null;
    let parsed = BigInt(`0x${field.slice(begin, index)}`);
    if (negative) parsed = -parsed;
    return {
        value: BigInt.asUintN(32, parsed),
        next: start + index,
    };
}

// C ref: coloratt.c check_enhanced_colors().  The sscanf() format has three
// width-two hexadecimal conversions followed by one junk byte.  Ordinary hex
// therefore needs five or six digits; scanWidthTwoHex() also keeps glibc's
// width-exhausted 0x prefix and signed-conversion behavior.
export function check_enhanced_colors(buf) {
    const value = String(buf);
    const basic = basicColor(value);
    if (basic !== null) return basic | NH_BASIC_COLOR;

    if (value[0] === '#') {
        const r = scanWidthTwoHex(value, 1);
        const g = r && scanWidthTwoHex(value, r.next);
        const b = g && scanWidthTwoHex(value, g.next);
        if (b && b.next === value.length) {
            const packed = (r.value << 16n) | (g.value << 8n) | b.value;
            return Number(BigInt.asIntN(32, packed));
        }
    }

    let altvalue = null;
    const grey = strstri(value, 'grey');
    if (grey >= 0) {
        altvalue = value.slice(0, grey) + 'gray' + value.slice(grey + 4);
    }
    for (const entry of COLOR_TABLE) {
        if (fuzzymatch(value, entry.name, ' -_', true)
            || (altvalue !== null
                && fuzzymatch(altvalue, entry.name, ' -_', true))) {
            return colortable_to_int32(entry);
        }
    }
    return -1;
}

// C refs: coloratt.c onlyhexdigits(), rgbstr_to_int32().  The name of the
// first helper is misleading in the source: it accepts '-' too.  The decimal
// parser below then rejects hexadecimal letters and deliberately retains the
// source's last-component-wins behavior when more than two dashes occur.
export function onlyhexdigits(buf) {
    return /^[0-9a-f-]*$/iu.test(String(buf));
}

export function rgbstr_to_int32(rgbstr) {
    const value = String(rgbstr ?? '');
    if (value && onlyhexdigits(value)) {
        if (!/^[0-9-]+$/u.test(value)) return -1;
        const components = value.split('-');
        const r = components[0];
        const g = components[1];
        const b = components.at(-1);
        if (components.length >= 3
            && [r, g, b].every((part) => part.length > 0 && part.length < 4)) {
            return (Number.parseInt(r, 10) << 16)
                | (Number.parseInt(g, 10) << 8)
                | Number.parseInt(b, 10);
        }
    } else if (value) {
        return check_enhanced_colors(value);
    }
    return -1;
}

// C ref: coloratt.c wc_color_name().  RGB aliases keep the first source row;
// the source table's order is therefore part of the result.
export function wc_color_name(colorindx) {
    if (colorindx < 0) return 'no-color';
    if ((colorindx & NH_BASIC_COLOR) !== 0) {
        const basicIndex = colorindx & ~NH_BASIC_COLOR;
        return COLOR_TABLE[basicIndex].name;
    }

    const r = Math.floor(colorindx / 0x10000) & 0xFF;
    const g = Math.floor(colorindx / 0x100) & 0xFF;
    const b = colorindx & 0xFF;
    const named = COLOR_TABLE.slice(16).find((entry) => (
        entry.r === r && entry.g === g && entry.b === b
    ));
    if (named) return named.name;
    return `#${r.toString(16).padStart(2, '0')}`
        + `${g.toString(16).padStart(2, '0')}`
        + `${b.toString(16).padStart(2, '0')}`;
}

// C ref: coloratt.c attr2attrname(). The null separator participates in
// lookup, so ATR_NONE still resolves to the earlier canonical name.
export function attr2attrname(attr) {
    return MENU_COLOR_ATTRIBUTES.find(row => row.attr === attr)?.name ?? null;
}

// C ref: coloratt.c color_attr_to_str().
export function color_attr_to_str(ca) {
    return `${clr2colorname(ca.color)}&${attr2attrname(ca.attr)}`;
}

// C ref: coloratt.c color_attr_parse_str(). Null is FALSE; the caller owns
// configuration feedback, while the returned pair holds C's ATR enum.
export function color_attr_parse_str(str, report = null) {
    const buf = truncateByteString(str, BUFSZ - 1);
    const amp = buf.indexOf('&');
    let color = NO_COLOR, attr = 0;
    if (amp >= 0) {
        const head = buf.slice(0, amp), tail = buf.slice(amp + 1);
        color = match_str2clr(head, false, report);
        attr = match_str2attr(tail, true, report);
        if (color === null && attr === null) {
            color = match_str2clr(tail, false, report);
            attr = match_str2attr(head, true, report);
        }
        if (color === null || attr === null) return null;
    } else {
        const found = match_str2attr(buf);
        if (found === null) {
            color = match_str2clr(buf, false, report);
            if (color === null) return null;
        } else attr = found;
    }
    return { color, attr };
}

// C ref: coloratt.c basic_menu_colors(). Cached alternate coloring nodes
// are distinct from the user's list; gs holds the source's saved pointers.
export function basic_menu_colors(state, load) {
    state.gs ??= {};
    state.gc ??= {};
    state.gm ??= {};
    if (load) {
        state.gs.save_menucolors = state.iflags.use_menu_color;
        state.gs.save_colorings = state.gm.menu_colorings;
        state.iflags.use_menu_color = true;
        if (state.gc.color_colorings) {
            state.gm.menu_colorings = state.gc.color_colorings;
        } else {
            state.gm.menu_colorings = null;
            for (const { name, color } of COLOR_NAMES) {
                if (name === null) break;
                if (color === 0 || color === 15 || color === NO_COLOR) continue;
                add_menu_coloring_parsed(state, name, color, 0);
            }
            state.gc.color_colorings = state.gm.menu_colorings;
        }
    } else {
        state.iflags.use_menu_color = state.gs.save_menucolors;
        state.gm.menu_colorings = state.gs.save_colorings;
    }
}

function queryMenu(state, spec, helpers) {
    return helpers?.selectMenu ? helpers.selectMenu(spec) : select_menu(state, {
        ...spec, overlay: state.iflags?.menu_overlay !== false,
    });
}
function pickedValues(picks) {
    if (picks === null || picks === undefined) return null;
    return (Array.isArray(picks) ? picks : [picks]).map(p => typeof p === 'object' ? p.value : p);
}

// C ref: coloratt.c query_attr(). Values are row identifiers, never drawing
// masks; PICK_ANY returns the separate source HL bit vocabulary.
export async function query_attr(state, prompt, dflt, helpers) {
    const allowMany = Boolean(prompt && prompt.slice(0, 6).toLowerCase() === 'choose');
    const rows = MENU_COLOR_ATTRIBUTES.slice(0, MENU_COLOR_ATTRIBUTES.findIndex(row => row.name === null));
    const picks = pickedValues(await queryMenu(state, {
        items: rows.map(({ name, attr }, i) => ({ text: name, value: i + 1,
            attr: ttyMenuColorAttribute(attr), color: NO_COLOR, selected: attr === dflt })),
        title: prompt || 'Pick an attribute', how: allowMany ? PICK_ANY : PICK_ONE,
        preselected: rows.findIndex(row => row.attr === dflt) + 1, cancelValue: null,
    }, helpers));
    if (picks?.length) {
        if (!allowMany) {
            let index = picks[0] - 1;
            if (picks.length === 2 && rows[index].attr === dflt) index = picks[1] - 1;
            return rows[index].attr;
        }
        let bits = 0;
        for (const id of picks) {
            const attr = rows[id - 1].attr;
            if (attr !== 0 || picks.length === 1) {
                if (attr === 0) bits = HL_NONE;
                else bits |= attr === 1 ? HL_BOLD : attr === 2 ? HL_DIM
                    : attr === 3 ? HL_ITALIC : attr === 4 ? HL_ULINE
                        : attr === 5 ? HL_BLINK : attr === 7 ? HL_INVERSE : 0;
            }
        }
        return bits;
    }
    return picks !== null && !allowMany ? dflt : -1;
}

// C ref: coloratt.c query_color(). Temporarily changes the real coloring
// list rather than drawing an invented preview style.
export async function query_color(state, prompt, dflt, helpers) {
    basic_menu_colors(state, true);
    const rows = COLOR_NAMES.slice(0, COLOR_NAMES.findIndex(row => row.name === null));
    const picks = pickedValues(await queryMenu(state, {
        items: rows.map(({ name, color }, i) => ({ text: name, value: i + 1,
            color: NO_COLOR, attr: 0, selected: color === dflt })),
        title: prompt || 'Pick a color', how: PICK_ONE,
        preselected: rows.findIndex(row => row.color === dflt) + 1, cancelValue: null,
    }, helpers));
    basic_menu_colors(state, false);
    if (picks?.length) {
        let color = rows[picks[0] - 1].color;
        if (picks.length === 2 && color === NO_COLOR) color = rows[picks[1] - 1].color;
        return color;
    }
    return picks !== null ? dflt : -1;
}

// C ref: coloratt.c query_color_attr(). The pair changes only after both
// queries succeed, including cancellation at the second prompt.
export async function query_color_attr(state, ca, prompt, helpers) {
    const color = await query_color(state, prompt, ca.color, helpers);
    if (color === -1) return false;
    const attr = await query_attr(state, prompt, ca.attr, helpers);
    if (attr === -1) return false;
    ca.color = color;
    ca.attr = attr;
    return true;
}

// C ref: coloratt.c free_one_menu_coloring(). The regex/node allocations
// have JavaScript lifetime; unlink precisely the selected source list node.
export function free_one_menu_coloring(state, idx) {
    let prev = null;
    for (let node = state.gm?.menu_colorings; node; node = node.next, --idx) {
        if (idx === 0) {
            if (prev) prev.next = node.next;
            else state.gm.menu_colorings = node.next;
            return;
        }
        prev = node;
    }
}
