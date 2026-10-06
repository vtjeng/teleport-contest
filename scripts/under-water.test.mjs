import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { BLINDED, ICE, LAVAPOOL, POOL, ROOM } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { GameDisplay } from '../js/game_display.js';
import { game, resetGame } from '../js/gstate.js';
import { cls, docrt, show_glyph_cell, under_water } from '../js/display.js';
import { initialize_symbols_from_options } from '../js/symbols.js';
import { GLYPH_UNEXPLORED_OFF } from '../js/glyph_offsets.js';
import { runSegment } from '../js/jsmain.js';
import { rhack } from '../js/cmd.js';

function setup() {
    resetGame();
    game.level = new GameMap();
    game.nhDisplay = new GameDisplay(null);
    game.disp = {};
    game.program_state = {};
    // display.c:1428: blind neighboring water/ice/lava cells use unexplored.
    // The constructed hero square is dry so this test isolates those writes.
    game.u = { ux: 10, uy: 10, uz: { dnum: 0, dlevel: 1 }, uinwater: true,
        uprops: [] };
    game.u.uprops[BLINDED] = { intrinsic: 1 };
    initialize_symbols_from_options({ flags: {} }, game);
    game.level.at(10, 10).typ = ROOM;
    game.level.at(9, 9).typ = POOL;
    game.level.at(9, 10).typ = LAVAPOOL;
    game.level.at(11, 11).typ = ICE;
    return game;
}

function mark(x, y) {
    show_glyph_cell(x, y, { ch: '.', dec: false });
    // The source clears only gbuf, not levl[x][y].glyph.
    game.level.at(x, y).remembered_glyph = { glyph: 123 };
}

test('under_water full update clears distant transient cells and preserves memory', async () => {
    setup();
    mark(20, 10); // Outside source's fixed radius one around (10,10).
    await under_water(1); // Source mode 1 calls cls before drawing.
    assert.equal(game.level.at(20, 10).disp_glyph, null);
    assert.deepEqual(game.level.at(20, 10).remembered_glyph, { glyph: 123 });
    for (const [x, y] of [[9, 9], [9, 10], [11, 11]])
        assert.equal(game.level.at(x, y).disp_glyph.glyph, GLYPH_UNEXPLORED_OFF);
    assert.deepEqual(game._underWater, { x: 10, y: 10, dela: false });
});

test('under_water delayed full update takes precedence over a second mode 2', async () => {
    setup();
    mark(20, 10);
    await under_water(2); // First mode 2 sets dela and returns without drawing.
    assert.equal(game.level.at(20, 10).disp_ch, '.');
    assert.deepEqual(game._underWater, { x: 0, y: 0, dela: true });
    await under_water(2); // The pending dela arm precedes the mode 2 arm in C.
    assert.equal(game.level.at(20, 10).disp_glyph, null);
    assert.deepEqual(game._underWater, { x: 10, y: 10, dela: false });
});

test('limited update erases old square in y/x order then draws in x/y order', async () => {
    setup();
    game._underWater = { x: 5, y: 5, dela: false };
    const writes = [];
    const at = game.level.at.bind(game.level);
    game.level.at = (x, y) => {
        const loc = at(x, y);
        if (!Object.hasOwn(loc, '_tracked')) {
            Object.defineProperty(loc, '_tracked', { value: true });
            let glyph = loc.disp_glyph;
            Object.defineProperty(loc, 'disp_glyph', {
                configurable: true,
                get: () => glyph,
                set: (value) => { glyph = value; writes.push([x, y]); },
            });
        }
        return loc;
    };
    await under_water(0);
    // display.c:1414-1418 erase is y outer/x inner; draw is x outer/y inner.
    assert.deepEqual(writes, [[4, 4], [5, 4], [6, 4], [4, 5], [5, 5], [6, 5],
        [4, 6], [5, 6], [6, 6], [9, 9], [9, 10], [11, 11]]);
});

test('swallowed, Water Plane and planning paths leave live display untouched', async () => {
    setup();
    mark(20, 10);
    game.u.uswallow = true; // Source swallowing precedence.
    await under_water(1);
    assert.equal(game._underWater, undefined);
    game.u.uswallow = false;
    game.water_level = { ...game.u.uz }; // Source Is_waterlevel exclusion.
    await under_water(1);
    assert.equal(game._underWater, undefined);
    game.water_level = null;
    await under_water(1, { ...game, u: { ...game.u } });
    assert.equal(game._underWater, undefined, 'clone never touches live display');
    assert.equal(game.level.at(20, 10).disp_ch, '.');
    await under_water(2);
    setup(); // New game resets source static position and pending flag.
    assert.equal(game._underWater, undefined);
});

test('docrt chooses underwater redraw before ordinary remembered-map redraw', async () => {
    setup();
    mark(20, 10);
    await docrt();
    assert.equal(game.level.at(20, 10).disp_glyph, null);
    assert.equal(game.program_state.in_docrt, false);
    assert.equal(game.disp.botlx, true);
});

test('cls guards reentry and dirties status before physical map clear', async () => {
    setup();
    let clears = 0;
    let recursive;
    game.nhDisplay.clearScreen = () => {
        ++clears;
        assert.equal(game.disp.botlx, true);
        assert.equal(game._inCls, true);
        recursive = cls(); // Reentrant callback must return before clearing again.
    };
    await cls();
    await recursive;
    assert.equal(clears, 1);
    assert.equal(game._inCls, false);
});

test('source redraw key dispatches underwater docrt without taking time', async () => {
    // Quiet seed from the bounded setup scan; no monster action is involved.
    await runSegment({ seed: 78122127, datetime: '20961006113500',
        nethackrc: 'OPTIONS=name:RedrawTest,role:Wizard,race:human,gender:female,'
            + 'align:neutral,!legacy,!tutorial,!splash_screen,pettype:none',
        moves: ' ' });
    game.u.uinwater = true;
    game.level.at(game.u.ux, game.u.uy).typ = POOL;
    mark(1, 0); // Distant source glyph buffer entry cleared by under_water(1).
    const moves = game.moves;
    // The direct caller follows startup's pending greeting; cls must consume
    // its source display_nhwindow message acknowledgment before the redraw.
    game.nhDisplay.pushKey(' '.charCodeAt(0));
    await rhack(0x12, game); // cmd.c extcmdlist C('r') -> doredraw.
    assert.equal(game.level.at(1, 0).disp_glyph, null);
    assert.equal(game.context.move, 0, 'doredraw returns ECMD_OK');
    assert.equal(game.moves, moves);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
});

test('whole C source pins source ordering and all four callers', () => {
    const c = readFileSync(new URL('../nethack-c/upstream/src/display.c', import.meta.url), 'utf8');
    const body = c.slice(c.indexOf('under_water(int mode)'), c.indexOf('under_ground(int mode)'));
    assert.ok(body.indexOf('mode == 1 || dela') < body.indexOf('mode == 2'));
    assert.match(body, /for \(y = lasty - 1;[\s\S]*for \(x = lastx - 1;/u);
    assert.match(body, /for \(x = u\.ux - 1;[\s\S]*for \(y = u\.uy - 1;/u);
    for (const [path, marker] of [['display.js', 'await under_water(1)'],
        ['trap.js', 'await under_water(1, state)'], ['detect.js', 'await under_water(2, state)'],
        ['allmain.js', 'await under_water(0, state)']])
        assert.ok(readFileSync(new URL(`../js/${path}`, import.meta.url), 'utf8').includes(marker));
});
