// display.c tmp_at(), the transient glyph a thrown missile leaves behind it.
// zap.c bhit() opens it with DISP_FLASH, walks the flight one square at a
// time and closes it, so what matters for the boundary screen is that every
// square it drew on is put back the way newsym() would draw it.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    DISP_BEAM,
    DISP_CHANGE,
    DISP_END,
    DISP_FLASH,
    DISP_FREEMEM,
    ROOM,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { tmp_at } from '../js/display.js';

// A three-square corridor of floor at row 4, with the hero at its left end.
// `sighted` lists the columns cansee() answers TRUE for; every other square
// is dark, which is the state that makes a corridor flight draw one glyph and
// then stop drawing.
function litRow(sighted) {
    const state = resetGame();
    state.level = new GameMap();
    for (let x = 1; x <= 6; x++) state.level.at(x, 4).typ = ROOM;
    state.u = { ux: 1, uy: 4, umonnum: 0, uz: { dnum: 0, dlevel: 1 } };
    state.flags = {};
    state.iflags = {};
    monst_globals_init(state);
    objects_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    state.viz_array[4] = [];
    for (const x of sighted) state.viz_array[4][x] = 0x2; /* IN_SIGHT */
    return state;
}

// A stand-in for the missile's own glyph. show_glyph_cell() only requires a
// presentation record, and `ch` is what reaches the terminal.
const MISSILE = { ch: '*', color: 0, dec: false, attr: 0 };

function shown(state, x) {
    return state.level.at(x, 4).disp_ch;
}

test('DISP_FLASH erases the previous square before drawing the next', async () => {
    // display.c:1272-1288. The flash style keeps one saved position: each
    // call newsym()s it back before saving the new one, so at most one
    // transient glyph is on the map at a time.
    const state = litRow([2, 3, 4]);
    await tmp_at(DISP_FLASH, MISSILE, state);
    await tmp_at(2, 4, state);
    assert.equal(shown(state, 2), '*');
    await tmp_at(3, 4, state);
    assert.notEqual(shown(state, 2), '*');
    assert.equal(shown(state, 3), '*');
    // display.c:1240-1243. Closing puts the last square back too, which is
    // what leaves the boundary screen free of the missile.
    await tmp_at(DISP_END, 0, state);
    assert.notEqual(shown(state, 3), '*');
});

test('DISP_FLASH draws nothing on a square the hero cannot see', async () => {
    // display.c:1285-1286. The out-of-sight square still erases the previous
    // one -- the erase is above the cansee() test -- and then breaks before
    // show_glyph(). That is why seed1150-caveman-explore-move records six
    // identical animation frames: the flint stone is drawn on the one square
    // beside the hero and on none of the dark corridor squares past it.
    const state = litRow([2]);
    await tmp_at(DISP_FLASH, MISSILE, state);
    await tmp_at(2, 4, state);
    assert.equal(shown(state, 2), '*');
    await tmp_at(3, 4, state);
    assert.notEqual(shown(state, 2), '*');
    assert.notEqual(shown(state, 3), '*');
    // With nothing saved, closing has nothing to put back and must not throw.
    await tmp_at(DISP_END, 0, state);
    assert.notEqual(shown(state, 3), '*');
});

test('DISP_BEAM keeps every square until it is closed', async () => {
    // display.c:1234-1239 against 1264-1271. The beam style saves each
    // position instead of replacing the one before it, and erases them all at
    // the close.
    const state = litRow([2, 3, 4]);
    await tmp_at(DISP_BEAM, MISSILE, state);
    await tmp_at(2, 4, state);
    await tmp_at(3, 4, state);
    assert.equal(shown(state, 2), '*');
    assert.equal(shown(state, 3), '*');
    await tmp_at(DISP_END, 0, state);
    assert.notEqual(shown(state, 2), '*');
    assert.notEqual(shown(state, 3), '*');
});

test('DISP_BEAM stops saving positions at TMP_AT_MAX_GLYPHS', async () => {
    // display.c:1163 caps the saved list at COLNO * 2, and :1237-1238 breaks
    // out once it is full rather than growing it. Two full map rows is
    // exactly that many squares, so the 161st call is the first refused.
    const state = resetGame();
    state.level = new GameMap();
    state.u = { ux: 1, uy: 4, umonnum: 0, uz: { dnum: 0, dlevel: 1 } };
    state.flags = {};
    state.iflags = {};
    monst_globals_init(state);
    objects_globals_init(state);
    initialize_symbols_from_options({ flags: {} }, state);
    state.viz_array = [];
    const squares = [];
    for (let y = 0; y < 3; y++) {
        state.viz_array[y] = [];
        for (let x = 1; x < COLNO; x++) {
            state.level.at(x, y).typ = ROOM;
            state.viz_array[y][x] = 0x2; /* IN_SIGHT */
            squares.push([x, y]);
        }
    }
    await tmp_at(DISP_BEAM, MISSILE, state);
    for (const [x, y] of squares.slice(0, COLNO * 2 + 1)) {
        await tmp_at(x, y, state);
    }
    assert.equal(state.tmp_at_stack[0].saved.length, COLNO * 2);
    await tmp_at(DISP_END, 0, state);
});

test('DISP_CHANGE swaps the glyph without moving the saved square', async () => {
    // display.c:1216-1218.
    const state = litRow([2, 3]);
    await tmp_at(DISP_FLASH, MISSILE, state);
    await tmp_at(2, 4, state);
    await tmp_at(DISP_CHANGE, { ch: '/', color: 0, dec: false, attr: 0 },
        state);
    await tmp_at(3, 4, state);
    assert.equal(shown(state, 3), '/');
    await tmp_at(DISP_END, 0, state);
});

test('a position call with no open effect is display.c panic()', async () => {
    // display.c:1210-1211. C panics; the port throws, which is the same
    // "this cannot happen" and keeps a caller that forgot to open one from
    // silently drawing nothing.
    const state = litRow([2]);
    await assert.rejects(() => tmp_at(2, 4, state), /tglyph not initialized/u);
    // DISP_FREEMEM (display.c:1197-1204) abandons whatever is open, so the
    // next position call panics again rather than drawing into a stale frame.
    await tmp_at(DISP_FLASH, MISSILE, state);
    await tmp_at(DISP_FREEMEM, 0, state);
    await assert.rejects(() => tmp_at(2, 4, state), /tglyph not initialized/u);
});

test('the frame stack lives on game state, not on the module', async () => {
    // display.c keeps `tglyph` in a function-static. A module variable would
    // carry one segment's unfinished flight into the next runSegment(); the
    // stack is on game state so js/gstate.js resetGame() drops it.
    const state = litRow([2]);
    await tmp_at(DISP_FLASH, MISSILE, state);
    assert.equal(state.tmp_at_stack.length, 1);
    resetGame();
    assert.equal(game.tmp_at_stack, undefined);
});
