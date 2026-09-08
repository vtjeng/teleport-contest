// Source-pinned tests for the mkmaze.c fixup-special span.  Expected values
// come from the named C functions, not from recorded sessions.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    CORR,
    DOOR,
    IRONBARS,
    LAVAWALL,
    POOL,
    ROOM,
    ROWNO,
    SDOOR,
    STONE,
    VWALL,
    WATER,
    W_NONDIGGABLE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import {
    baalz_fixup,
    check_ransacked,
    fixup_special,
    is_solid,
    iswall,
    iswall_or_stone,
    maze_inbounds,
    maze_remove_deadends,
    mazexy,
    okay,
} from '../js/mkmaze.js';

function mazeState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { uz: { dnum: 1, dlevel: 3 } };
    state.lregions = [];
    return state;
}

test('mkmaze.c fixup_special() marks Mine Town before monster setup uses it', () => {
    const state = mazeState();
    state.specialLevels = [{
        dlevel: { ...state.u.uz },
        flags: { town: true },
    }];

    fixup_special(state);

    assert.equal(state.level.flags.has_town, true);
    assert.deepEqual(state.lregions, []);
});

test('mkmaze.c iswall() accepts exactly the source wall-join terrain set', () => {
    const state = mazeState();
    const accepted = [VWALL, DOOR, LAVAWALL, WATER, SDOOR, IRONBARS];
    for (const typ of accepted) {
        state.level.at(10, 10).typ = typ;
        assert.equal(iswall(10, 10, state), 1, `terrain ${typ}`);
    }
    for (const typ of [STONE, ROOM]) {
        state.level.at(10, 10).typ = typ;
        assert.equal(iswall(10, 10, state), 0, `terrain ${typ}`);
    }
    assert.equal(iswall(-1, 10, state), 0);
});

test('mkmaze.c iswall_or_stone() treats out-of-bounds as stone', () => {
    const state = mazeState();
    assert.equal(iswall_or_stone(-1, 10, state), 1);
    assert.equal(iswall_or_stone(10, 10, state), 1);
    state.level.at(10, 10).typ = VWALL;
    assert.equal(iswall_or_stone(10, 10, state), 1);
    state.level.at(10, 10).typ = ROOM;
    assert.equal(iswall_or_stone(10, 10, state), 0);
});

test('mkmaze.c is_solid() accepts only stone walls and out-of-bounds', () => {
    const state = mazeState();
    assert.equal(is_solid(-1, 10, state), true);
    assert.equal(is_solid(10, 10, state), true);
    state.level.at(10, 10).typ = VWALL;
    assert.equal(is_solid(10, 10, state), true);
    state.level.at(10, 10).typ = DOOR;
    assert.equal(is_solid(10, 10, state), false);
});

test('mkmaze.c okay() checks the square two cardinal steps away', () => {
    const state = mazeState();
    const bounds = { xMax: 10, yMax: 10 };
    for (const dir of [0, 1, 2, 3])
        assert.equal(okay(5, 5, dir, state, bounds), true);

    state.level.at(7, 5).typ = ROOM;
    assert.equal(okay(5, 5, 1, state, bounds), false);
    assert.equal(okay(3, 3, 0, state, bounds), false);
    assert.equal(okay(9, 9, 2, state, bounds), false);
});

test('mkmaze.c baalz_fixup() consumes markers and resets its protected area', () => {
    const state = mazeState();
    for (let x = 20; x <= 60; ++x)
        state.level.at(x, Math.trunc(ROWNO / 2)).wall_info = W_NONDIGGABLE;
    for (let y = 3; y <= 17; ++y)
        state.level.at(21, y).wall_info = W_NONDIGGABLE;

    state.level.at(30, 5).typ = POOL;
    state.level.at(30, 15).typ = POOL;
    state.level.at(40, 10).typ = IRONBARS;
    state.level.at(39, 10).wall_info = W_NONDIGGABLE;
    state.level.at(38, 10).wall_info = W_NONDIGGABLE;
    state.level.at(25, 8).typ = VWALL;
    state.level.at(20, 3).typ = VWALL;

    baalz_fixup(state);

    assert.notEqual(state.level.at(30, 5).typ, POOL);
    assert.notEqual(state.level.at(30, 15).typ, POOL);
    assert.equal(state.level.at(39, 10).wall_info & W_NONDIGGABLE, 0);
    assert.equal(state.level.at(38, 10).wall_info & W_NONDIGGABLE, 0);
    assert.equal(state.level.at(25, 8).typ, VWALL);
    assert.equal(state.level.at(20, 3).typ, STONE);
    assert.deepEqual(state.bughack, {
        inarea: { x1: COLNO, y1: ROWNO, x2: 0, y2: 0 },
        delarea: { x1: COLNO, y1: ROWNO, x2: 0, y2: 0 },
    });
});

test('mkmaze.c check_ransacked() recognizes only minetn-1 in the Mines', () => {
    const state = mazeState();
    state.mines_dnum = 1;
    check_ransacked('minetn-1', state);
    assert.equal(state.ransacked, true);
    check_ransacked('minetn-2', state);
    assert.equal(state.ransacked, false);
    state.u.uz.dnum = 0;
    check_ransacked('minetn-1', state);
    assert.equal(state.ransacked, false);
});

test('mkmaze.c maze_inbounds() uses the source lower and exclusive upper bounds', () => {
    const frame = { xMazeMax: 78, yMazeMax: 20 };
    assert.equal(maze_inbounds(2, 2, frame), true);
    assert.equal(maze_inbounds(1, 2, frame), false);
    assert.equal(maze_inbounds(2, 1, frame), false);
    assert.equal(maze_inbounds(77, 19, frame), true);
    assert.equal(maze_inbounds(78, 19, frame), false);
    assert.equal(maze_inbounds(77, 20, frame), false);
});

test('mkmaze.c maze_remove_deadends() opens one eligible wall toward a corridor', () => {
    const state = mazeState();
    const frame = { xMazeMax: 10, yMazeMax: 10 };
    state.level.at(5, 5).typ = ROOM;
    for (const [x, y] of [[5, 3], [7, 5], [5, 7], [3, 5]])
        state.level.at(x, y).typ = ROOM;

    maze_remove_deadends(ROOM, frame, state, () => 0);

    assert.equal(state.level.at(5, 4).typ, ROOM);
    assert.equal(state.level.at(4, 5).typ, STONE);
});

test('mkmaze.c mazexy() falls back in x-major, then y-major order', () => {
    const state = mazeState();
    state.level.flags.corrmaze = true;
    state.level.at(4, 5).typ = CORR;
    const draws = [];
    const point = mazexy(null, { xMazeMax: 10, yMazeMax: 10 }, state,
        (limit) => {
            draws.push(limit);
            return 1;
        });

    assert.deepEqual(point, { x: 4, y: 5 });
    assert.equal(draws.length, 200);
    assert.ok(draws.every((limit) => limit === 10));
});
