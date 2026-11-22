// Enforces when the map code reads the options that decide a cell's colour
// and attribute. C reads them at three different times, and a read moved to
// another time shows only inside the options menu, between the toggle and the
// redraw that ends the command:
//
// - when the cell is printed: win/tty/wintty.c tty_print_glyph() gates colour
//   on iflags.use_color (3892) and picks the attribute from hilite_pet,
//   petattr, hilite_pile, wizmgender and use_inverse (3923-3937);
// - when the glyph map is rebuilt: display.c reset_glyphmap() bakes
//   iflags.use_color into every glyph's colour and black-and-white flags
//   (2683-2694, 2890, 3081);
// - when a glyph is chosen or shown: the dark_room tests in display.c and
//   map_glyphinfo()'s hero colour (2621).
//
// The port once ran the attribute chain while mapping a glyph and read
// 'color' live where C reads the rebuilt table, so a pet stayed plain and the
// map kept or gained its colours at the wrong screen.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { assertExceptionCount } from './exception-count.mjs';

const JS_DIR = path.join(
    path.dirname(fileURLToPath(import.meta.url)), '..', 'js',
);
const FUNCTION = /^(?:export )?(?:async )?function\*? (\w+)/u;

// Every code line of js/*.js with the top-level function it sits in.
function codeLines() {
    const lines = [];
    for (const name of fs.readdirSync(JS_DIR).sort()) {
        if (!name.endsWith('.js')) continue;
        let fn = null;
        const source = fs.readFileSync(path.join(JS_DIR, name), 'utf8');
        for (const [index, line] of source.split('\n').entries()) {
            const declared = FUNCTION.exec(line);
            if (declared) fn = declared[1];
            const code = line.replace(/\/\/.*$/u, '')
                .replace(/^\s*\/?\*.*$/u, '');
            if (code.trim()) lines.push({ file: name, line: index + 1, fn, code });
        }
    }
    return lines;
}

const LINES = codeLines();

function sites(pattern, files = null) {
    return LINES.filter((entry) => pattern.test(entry.code)
        && (!files || files.includes(entry.file)));
}

function tally(found) {
    const counts = {};
    for (const { file, fn } of found) {
        const key = `${file} ${fn}`;
        counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
}

// The files that map a glyph or print a map cell.
const MAP_FILES = ['display.js', 'display_glyphmap.js'];

test('the attribute options are read only by the print-time chain', () => {
    // The five fields tty_print_glyph()'s chain reads: iflags.hilite_pet
    // (wc_hilite_pet), iflags.wc2_petattr, iflags.hilite_pile,
    // iflags.wizmgender and iflags.use_inverse (wc_inverse). One read each,
    // all in print_glyph_attr().
    assert.deepEqual(
        tally(sites(
            /\b(?:wc_hilite_pet|wc2_petattr|hilite_pile|wizmgender|wc_inverse)\b/u,
            MAP_FILES,
        )),
        { 'display.js print_glyph_attr': 5 },
    );
});

test('only a printed cell runs the attribute chain', () => {
    // print_glyph_attr() is called by print_glyph_cell() alone, and
    // print_glyph_cell() by the three places a map cell is printed:
    // show_glyph_cell() (the buffered cell flush_screen() will print),
    // _buildScreenOutput() (flush_screen()'s gnew loop) and docorner()
    // (row_refresh()).
    assert.deepEqual(
        tally(sites(/\bprint_glyph_attr\(/u)
            .filter((entry) => !FUNCTION.test(entry.code))),
        { 'display.js print_glyph_cell': 1 },
    );
    assert.deepEqual(
        tally(sites(/\bprint_glyph_cell\(/u)
            .filter((entry) => !FUNCTION.test(entry.code))),
        {
            'display.js _buildScreenOutput': 1,
            'display.js docorner': 1,
            'display.js show_glyph_cell': 1,
        },
    );
});

// Every read of iflags.use_color (wc_color) in the map code, by the time C
// makes it. A new read belongs to one of the three; add it to the table with
// the C line it ports.
const COLOR_READS = {
    // reset_glyphmap() itself and the fallback for a state it has not reached.
    'display_glyphmap.js reset_glyphmap': 1,
    'display_glyphmap.js glyphmap_use_color': 1,
    // wintty.c tty_print_glyph() 3892 and 3923.
    'display.js print_glyph_cell': 1,
    'display.js framed_print_attr': 1,
    // display.c map_glyphinfo() 2621, the hero's colour, in its two ports.
    'display.js hero_glyph_info': 1,
    'display.js map_glyphinfo': 1,
    // display.c's `flags.dark_room && iflags.use_color` glyph choices:
    // feel_location() 840, 855 and 895, magic_map_background() 245, newsym() 1087
    // and reglyph_darkroom() 1836 and 1850.
    'display.js feel_location_steps': 3,
    'display.js magic_map_background_steps': 1,
    'display.js newsym_steps': 1,
    'display.js reglyph_darkroom': 2,
};
// The sum of COLOR_READS.
const PINNED_COLOR_READS = 13;

test('the color option is read at the times C reads it', () => {
    const found = sites(/\bwc_color\b/u, MAP_FILES);
    assert.deepEqual(tally(found), COLOR_READS);
    assertExceptionCount(found.length, PINNED_COLOR_READS, {
        what: 'reads of iflags.wc_color in the map code',
        pin: 'PINNED_COLOR_READS',
    });
});

test('the glyph map keeps its own answer for color', () => {
    // The rebuilt table's colour is read through glyphmap_use_color(), and
    // only by the code that stands for reset_glyphmap()'s arms.
    const readers = tally(sites(/\bglyphmap_use_color\(/u)
        .filter((entry) => !FUNCTION.test(entry.code)));
    assert.deepEqual(Object.keys(readers).sort(), [
        'display.js cmapBlackAndWhiteFlags',
        'display.js mapColorEnabled',
        'display.js map_glyphinfo',
    ]);
});

test('reset_glyphmap() is called where C calls it', () => {
    // allmain.c:797, do.c:1838, options.c:7348 and 8983, restore.c:907 and
    // symbols.c:249. glyphmap_use_color() falls back to the option for a
    // state none of them reached, so a call lost here would go unnoticed
    // until 'color' changed in play.
    assert.deepEqual(
        tally(sites(/\breset_glyphmap\(/u)
            .filter((entry) => !FUNCTION.test(entry.code))),
        {
            'allmain.js newgame_pre_mklev': 1,
            'do.js goto_level': 1,
            'options.js initoptions_finish': 1,
            'options.js reset_needed_visuals': 1,
            'restore.js dorestore': 1,
            'symbols.js assign_graphics': 1,
        },
    );
});
