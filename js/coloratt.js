// coloratt.js — Pure enhanced-color parsing from coloratt.c.
// C refs: coloratt.c check_enhanced_colors(), wc_color_name(), and the
// colornames[] subset the first function reaches through match_str2clr().

import { CLR_MAX, NH_BASIC_COLOR } from './const.js';
import { COLOR_TABLE } from './color_data.js';
import { fuzzymatch, strstri } from './hacklib.js';

const NO_COLOR = 8;

// coloratt.c colornames[], including the aliases after its null sentinel.
// check_enhanced_colors() asks match_str2clr() to use this table before it
// treats the same spelling as an enhanced RGB name.
const BASIC_COLOR_NAMES = Object.freeze([
    ['black', 0],
    ['red', 1],
    ['green', 2],
    ['brown', 3],
    ['blue', 4],
    ['magenta', 5],
    ['cyan', 6],
    ['gray', 7],
    ['orange', 9],
    ['light green', 10],
    ['yellow', 11],
    ['light blue', 12],
    ['light magenta', 13],
    ['light cyan', 14],
    ['white', 15],
    ['no color', NO_COLOR],
    ['transparent', NO_COLOR],
    ['purple', 5],
    ['light purple', 13],
    ['bright purple', 13],
    ['grey', 7],
    ['bright red', 9],
    ['bright green', 10],
    ['bright blue', 12],
    ['bright magenta', 13],
    ['bright cyan', 14],
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
    for (const [name, color] of BASIC_COLOR_NAMES) {
        if (fuzzymatch(value, name, ' -_', true)) return color;
    }
    if (/^\d/u.test(value)) {
        const color = colorAtoi(value);
        if (color >= 0 && color < CLR_MAX) return color;
    }
    return null;
}

function colortable_to_int32(entry) {
    if (entry.type === 'rgb_color') {
        return (entry.r * 0x10000) + (entry.g * 0x100) + entry.b;
    }
    if (entry.type === 'nh_color') return entry.tableIndex | NH_BASIC_COLOR;
    return NO_COLOR | NH_BASIC_COLOR;
}

function scanWidthTwoHex(value, start) {
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
