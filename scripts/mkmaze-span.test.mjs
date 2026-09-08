// Source-pinned tests for the mkmaze.c fixup-special span.  Expected values
// come from the named C functions, not from recorded sessions.

import assert from 'node:assert/strict';
import test from 'node:test';

import { CORR, ROOM, STONE } from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import {
    check_ransacked,
    fixup_special,
    maze_inbounds,
    maze_remove_deadends,
    mazexy,
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
