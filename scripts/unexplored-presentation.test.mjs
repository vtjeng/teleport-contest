// GLYPH_UNEXPLORED is drawn with the active S_unexplored symbol and any
// G_unexplored customization (display.c map_glyphinfo() 2778-2782), not
// always as a blank. Game code gets its presentation from map_glyphinfo() or
// js/display.js unexploredGlyphInfo(). A literal that pairs the glyph number
// with a blank `ch` hard-codes the default symbol, which is how docrt(),
// docorner() and #terrain stopped drawing SYMBOLS=S_unexplored:x.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const JS_DIR = fileURLToPath(new URL('../js/', import.meta.url));

// An object literal without nested braces that names GLYPH_UNEXPLORED_OFF
// and a blank `ch`.
function blankUnexploredLiterals(source) {
    const found = [];
    for (const match of source.matchAll(/\{[^{}]*\bGLYPH_UNEXPLORED_OFF\b[^{}]*\}/gu)) {
        if (/\bch:\s*' '/u.test(match[0]))
            found.push(source.slice(0, match.index).split('\n').length);
    }
    return found;
}

function scanJs() {
    const found = [];
    for (const name of readdirSync(JS_DIR).filter((n) => n.endsWith('.js')).sort()) {
        for (const line of blankUnexploredLiterals(readFileSync(join(JS_DIR, name), 'utf8')))
            found.push(`${name}:${line}`);
    }
    return found;
}

test('only the counted exceptions hard-code a blank unexplored glyph', () => {
    // Two exceptions. js/display.js NUL_GBUF_PRESENTATION is display.c
    // nul_gbuf itself, which is a blank whatever S_unexplored is. js/display.js
    // swallowed()'s old-position erase still draws a blank where display.c
    // swallowed() (1343-1347) shows GLYPH_UNEXPLORED: the cells it leaves
    // uncovered show only after the engulfer moves (monmove.c:1649-1654),
    // and no recording reaches that yet. Lower the count when it is fixed.
    const found = scanJs();
    assert.equal(found.length, 2, found.join('\n'));
    assert.ok(found.every((site) => site.startsWith('display.js:')), found.join('\n'));
});

test('the scan finds a blank unexplored literal and ignores a mapped one', () => {
    assert.deepEqual(blankUnexploredLiterals([
        'const a = { glyph: GLYPH_UNEXPLORED_OFF, ch: \' \', color: NO_COLOR };', // 1: found
        'const b = map_glyphinfo(GLYPH_UNEXPLORED_OFF, state);',
        'const c = {',
        "    ch: ' ',",
        '    glyph: GLYPH_UNEXPLORED_OFF,', // the literal starts on line 3
        '};',
        'const d = { glyph: GLYPH_UNEXPLORED_OFF };', // no `ch`: not found
    ].join('\n')), [1, 3]);
});
