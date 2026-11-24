// C keeps a square's display apart from levl[][] (rm.h struct rm): display.c's
// gg.gbuf entry, the terminal cell wintty.c tty_print_glyph() prints from it,
// and recorder patch 006's nomux_buf shadow cell. None belongs to a level, so
// a level change or a flip_level() swap of struct rm leaves all three as they
// were until a newsym() or docrt() rewrites them. The port keeps them in three
// grids on the game state, which js/gstate.js creates and js/display.js
// glyph_buffer_at(), tty_map_cell_at() and nomux_cell_at() read.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, CORR, ROOM, ROWNO } from '../js/const.js';
import {
    glyph_buffer_at, installLevel, nomux_cell_at, swap_levl_entries,
    tty_map_cell_at,
} from '../js/display.js';
import { GameMap, makeLocation } from '../js/game.js';
import { initialGbuf, initialNomuxMap, initialTtyMapCells, resetGame } from '../js/gstate.js';
import { NO_COLOR } from '../js/terminal.js';

test('each display grid is ROWNO rows of COLNO cells', () => {
    // js/gstate.js cannot import js/const.js, which imports it, so it spells
    // the two dimensions out.
    for (const grid of [initialGbuf(), initialTtyMapCells(), initialNomuxMap()]) {
        assert.equal(grid.length, ROWNO);
        for (const row of grid) assert.equal(row.length, COLNO);
    }
    const state = resetGame();
    assert.equal(state.gg.gbuf.length, ROWNO);
    assert.equal(state.tty_map_cells.length, ROWNO);
    assert.equal(state.nomux_map.length, ROWNO);
});

test('a new game starts with nul_gbuf, a blank terminal and an unset shadow', () => {
    // The values a fresh location record held before the grids moved off it:
    // no glyphinfo (nul_gbuf), a clean entry, a blank printed cell and a
    // shadow cell patch 006 has not yet printed.
    const state = resetGame();
    for (let y = 0; y < ROWNO; ++y) {
        for (let x = 0; x < COLNO; ++x) {
            assert.deepEqual(state.gg.gbuf[y][x], { gnew: 0, glyphinfo: null });
            assert.deepEqual(state.tty_map_cells[y][x], {
                ch: ' ', color: NO_COLOR, decgfx: false, attr: 0,
                browser_ch: null, browser_color: null, browser_attr: null,
            });
            assert.equal(state.nomux_map[y][x].ch, undefined);
        }
    }
    // Every cell is its own record.
    assert.notEqual(state.gg.gbuf[0][0], state.gg.gbuf[0][1]);
    assert.notEqual(state.tty_map_cells[0][0], state.tty_map_cells[1][0]);
});

// rm.h struct rm by C name, with the JS name where it differs: the port keeps
// C's `glyph` as `remembered_glyph` (scripts/location-glyph.test.mjs).
const STRUCT_RM = Object.freeze({
    glyph: 'remembered_glyph', typ: 'typ', seenv: 'seenv', flags: 'flags',
    horizontal: 'horizontal', lit: 'lit', waslit: 'waslit', roomno: 'roomno',
    edge: 'edge', candig: 'candig',
});

test('a new location holds only struct rm fields', () => {
    const jsNames = new Set(Object.values(STRUCT_RM));
    const other = Object.keys(makeLocation()).filter((key) => !jsNames.has(key));
    assert.deepEqual(other, []);
});

// Names the port gives a location record, and the display fields a location
// must not carry: the gbuf entry's, the terminal cell's, the shadow cell's,
// and the per-location spellings they replaced.
const LOCATION_NAMES = ['loc', 'location', 'lev', 'levl', 'crm', 'here', 'there'];
const SCREEN_FIELD = String.raw`(?:glyphinfo|gnew|ch|color|decgfx|attr|browser_ch|browser_color|browser_attr|disp_\w+|tty_(?:ch|color|decgfx|attr)|_gbuf|_tty|_nomux)\b`;
const AT_CALL = String.raw`\.at\??\.?\((?:[^()]|\([^()]*\))*\)`;
const GRID_INDEX = String.raw`\blocations\??\.?\[[^\]]*\]\??\.?\[[^\]]*\]`;

// The 1-based line of every screen-field access on a location in `source`:
// straight off an at() call or a locations[x][y] index, or off a name bound
// to one or conventionally given to a location.
export function screenFieldFindings(source) {
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, (c) => c.replace(/[^\n]/gu, ''))
        .replace(/\/\/[^\n]*/gu, '');
    const names = new Set(LOCATION_NAMES);
    const binding = new RegExp(
        String.raw`\b(?:const|let|var)\s+(\w+)\s*=\s*[\w$.?\[\]]*(?:${AT_CALL}|${GRID_INDEX})\s*(?:;|\?\?|\|\||$)`,
        'gmu',
    );
    for (const match of code.matchAll(binding)) names.add(match[1]);
    const access = new RegExp(
        String.raw`(?:${AT_CALL}|${GRID_INDEX}|\b(?:${[...names].join('|')}))\s*\??\.${SCREEN_FIELD}`,
        'gu',
    );
    const lines = new Set();
    for (const match of code.matchAll(access))
        lines.add(code.slice(0, match.index).split('\n').length);
    return [...lines].sort((a, b) => a - b);
}

test('no js/ file reads or writes a display field on a location', () => {
    const dir = new URL('../js/', import.meta.url);
    const findings = [];
    for (const name of readdirSync(dir).filter((entry) => entry.endsWith('.js')).sort()) {
        const source = readFileSync(new URL(name, dir), 'utf8');
        const lines = source.split('\n');
        for (const line of screenFieldFindings(source))
            findings.push(`js/${name}:${line}: ${lines[line - 1].trim()}`);
    }
    assert.deepEqual(findings, []);
});

test('the display-field scan finds each spelling', () => {
    // Each line whose comment gives a number holds one access the scan must
    // report; the others are accesses it must accept.
    const source = [
        'const d = state.level.at(x, y).disp_ch;', // 1: an old field off at()
        'state.level?.at(x, y)?.gnew = 1;', // 2: optional chaining
        'const g = state.level.locations[x][y].glyphinfo;', // 3: grid index
        'const crm = state.level.at(x, y);',
        'crm.ch = ".";', // 5: a name bound to at()
        'loc.tty_ch = null;', // 6: a conventional name
        'glyph_buffer_at(x, y, state).glyphinfo = null;',
        'tty_map_cell_at(x, y).ch = ".";',
        'const typ = state.level.at(x, y).typ;',
        '// loc.disp_glyph in a comment',
    ].join('\n');
    assert.deepEqual(screenFieldFindings(source), [1, 2, 3, 5, 6]);
});

test('swap_levl_entries() moves struct rm and leaves the display', () => {
    const state = resetGame();
    installLevel(new GameMap(), state);
    // Two squares of one column, as flip_level()'s vertical pass swaps them;
    // the coordinates are arbitrary interior squares.
    const top = state.level.at(10, 3);
    const bottom = state.level.at(10, 17);
    top.typ = ROOM;
    bottom.typ = CORR;
    // The screen shows '.' at the top square and '#' at the bottom one.
    tty_map_cell_at(10, 3).ch = '.';
    tty_map_cell_at(10, 17).ch = '#';
    swap_levl_entries(state.level, 10, 3, 10, 17);
    assert.equal(state.level.at(10, 3), bottom);
    assert.equal(state.level.at(10, 17), top);
    assert.equal(tty_map_cell_at(10, 3).ch, '.');
    assert.equal(tty_map_cell_at(10, 17).ch, '#');
});

test('a level change leaves the glyph buffer and the screen', () => {
    const state = resetGame();
    installLevel(new GameMap(), state);
    // Arbitrary values on one interior square of each grid.
    const glyphinfo = { ch: '@', color: NO_COLOR, dec: false };
    glyph_buffer_at(5, 5).glyphinfo = glyphinfo;
    glyph_buffer_at(5, 5).gnew = 1;
    tty_map_cell_at(5, 5).ch = '@';
    nomux_cell_at(5, 5).ch = '.';
    installLevel(new GameMap(), state);
    assert.equal(glyph_buffer_at(5, 5).glyphinfo, glyphinfo);
    assert.equal(glyph_buffer_at(5, 5).gnew, 1);
    assert.equal(tty_map_cell_at(5, 5).ch, '@');
    assert.equal(nomux_cell_at(5, 5).ch, '.');
});
