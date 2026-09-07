// Tests for clr2colorname from coloratt.c (ported in coloratt.js).
// C ref: coloratt.c clr2colorname() (338-346). Returns the canonical color
// name for a basic color number, iterating the colornames[] table only up
// to the null separator. Returns null for unknown color numbers.

import assert from 'node:assert/strict';
import test from 'node:test';

import { clr2colorname } from '../js/coloratt.js';
import {
    CLR_BLACK,
    CLR_RED,
    CLR_GREEN,
    CLR_BROWN,
    CLR_BLUE,
    CLR_MAGENTA,
    CLR_CYAN,
    CLR_GRAY,
    CLR_ORANGE,
    CLR_BRIGHT_GREEN,
    CLR_YELLOW,
    CLR_BRIGHT_BLUE,
    CLR_BRIGHT_MAGENTA,
    CLR_BRIGHT_CYAN,
    CLR_WHITE,
    NO_COLOR,
} from '../js/terminal.js';

// The first 16 entries of colornames[] before the null separator map each
// CLR_* value to its canonical name from coloratt.c:12-27.
test('clr2colorname returns the canonical name for each basic color', () => {
    // CLR_BLACK = 0 -> "black" (coloratt.c:13)
    assert.equal(clr2colorname(CLR_BLACK), 'black');
    // CLR_RED = 1 -> "red" (coloratt.c:14)
    assert.equal(clr2colorname(CLR_RED), 'red');
    // CLR_GREEN = 2 -> "green" (coloratt.c:15)
    assert.equal(clr2colorname(CLR_GREEN), 'green');
    // CLR_BROWN = 3 -> "brown" (coloratt.c:16)
    assert.equal(clr2colorname(CLR_BROWN), 'brown');
    // CLR_BLUE = 4 -> "blue" (coloratt.c:17)
    assert.equal(clr2colorname(CLR_BLUE), 'blue');
    // CLR_MAGENTA = 5 -> "magenta" (coloratt.c:18)
    assert.equal(clr2colorname(CLR_MAGENTA), 'magenta');
    // CLR_CYAN = 6 -> "cyan" (coloratt.c:19)
    assert.equal(clr2colorname(CLR_CYAN), 'cyan');
    // CLR_GRAY = 7 -> "gray" (coloratt.c:20)
    assert.equal(clr2colorname(CLR_GRAY), 'gray');
    // CLR_ORANGE = 9 -> "orange" (coloratt.c:21)
    assert.equal(clr2colorname(CLR_ORANGE), 'orange');
    // CLR_BRIGHT_GREEN = 10 -> "light green" (coloratt.c:22)
    assert.equal(clr2colorname(CLR_BRIGHT_GREEN), 'light green');
    // CLR_YELLOW = 11 -> "yellow" (coloratt.c:23)
    assert.equal(clr2colorname(CLR_YELLOW), 'yellow');
    // CLR_BRIGHT_BLUE = 12 -> "light blue" (coloratt.c:24)
    assert.equal(clr2colorname(CLR_BRIGHT_BLUE), 'light blue');
    // CLR_BRIGHT_MAGENTA = 13 -> "light magenta" (coloratt.c:25)
    assert.equal(clr2colorname(CLR_BRIGHT_MAGENTA), 'light magenta');
    // CLR_BRIGHT_CYAN = 14 -> "light cyan" (coloratt.c:26)
    assert.equal(clr2colorname(CLR_BRIGHT_CYAN), 'light cyan');
    // CLR_WHITE = 15 -> "white" (coloratt.c:27)
    assert.equal(clr2colorname(CLR_WHITE), 'white');
    // NO_COLOR = 8 -> "no color" (coloratt.c:28; C defines NO_COLOR as 8)
    assert.equal(clr2colorname(NO_COLOR), 'no color');
});

test('clr2colorname does not return alias names past the null separator', () => {
    // After the null separator, colornames[] has aliases like "grey" for CLR_GRAY,
    // "purple" for CLR_MAGENTA, etc. The function stops at the null entry, so
    // it never reaches those. The canonical name for CLR_MAGENTA is "magenta",
    // not "purple".
    assert.equal(clr2colorname(CLR_MAGENTA), 'magenta');
    assert.equal(clr2colorname(CLR_GRAY), 'gray'); // not "grey"
});

test('clr2colorname returns null for values absent from the canonical table', () => {
    // Negative values are not valid color numbers
    assert.equal(clr2colorname(-1), null);
    // 16 (CLR_MAX) is the terminal sentinel, not a named color
    assert.equal(clr2colorname(16), null);
    // 17 and above are beyond any table entry
    assert.equal(clr2colorname(17), null);
});
