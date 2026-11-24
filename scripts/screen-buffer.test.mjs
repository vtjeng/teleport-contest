// C keeps a square's display apart from levl[][] (rm.h struct rm): display.c's
// gg.gbuf entry, the terminal cell wintty.c tty_print_glyph() prints from it,
// and recorder patch 006's nomux_buf shadow cell. None belongs to a level, so
// a level change or a flip_level() swap of struct rm leaves all three as they
// were until a newsym() or docrt() rewrites them. The port keeps them in three
// grids on the game state, which js/gstate.js creates and js/display.js
// glyph_buffer_at(), tty_map_cell_at() and nomux_cell_at() read.

import assert from 'node:assert/strict';
import test from 'node:test';

import { COLNO, ROWNO } from '../js/const.js';
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
