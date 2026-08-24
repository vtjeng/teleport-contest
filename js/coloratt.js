// coloratt.js — Color, attribute, and menu-color parsing from coloratt.c.
// C refs: coloratt.c match_str2clr(), match_str2attr(),
// add_menu_coloring_parsed(), add_menu_coloring(), count_menucolors(),
// check_enhanced_colors(), wc_color_name(), and the complete colornames[]
// table those functions reach.

import { BUFSZ, CLR_MAX, NH_BASIC_COLOR } from './const.js';
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
