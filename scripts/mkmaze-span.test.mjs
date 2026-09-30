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
    MON_BUBBLEMOVE,
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
import { MONSTER_TEMPLATES, PM_LONG_WORM } from '../js/monsters.js';
import { newMonster, place_monster } from '../js/monst.js';
import { initRng } from '../js/rng.js';
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
    movebubbles,
    okay,
} from '../js/mkmaze.js';
import { initworm } from '../js/worm.js';

function mazeState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { uz: { dnum: 1, dlevel: 3 } };
    state.lregions = [];
    return state;
}

test('mkmaze.c movebubbles clears worm wx values before bubble relocation', () => {
    const state = resetGame();
    // This independent seed only initializes relocation's un-injected
    // tail-position helper; it is not a reference-game seed, and the three
    // movebubbles draws are asserted separately below.
    initRng(610205);
    state.level = new GameMap();
    state.level.monlist = null;
    state.level.traps = [];
    state.mons = MONSTER_TEMPLATES;
    // Water-level identity and the interior bounds make (9,4) and (10,5)
    // valid bubble cells; the hero at (30,10) stays outside the mask.
    state.u = {
        ux: 30,
        uy: 10,
        uz: { dnum: 0, dlevel: 1 },
        uswallow: 0,
        ustuck: null,
    };
    state.water_level = { ...state.u.uz };
    state.waterlevel_bounds = { xmin: 4, ymin: 2, xmax: 77, ymax: 19 };
    // Three stored nodes are two visible tails plus the terminal/head node.
    // The ID 801 and HP 20 only distinguish this independently built worm;
    // neither value selects a special movebubbles branch.
    const worm = newMonster({
        data: state.mons[PM_LONG_WORM],
        mnum: PM_LONG_WORM,
        m_id: 801,
        mhp: 20,
        wormno: 1,
    });
    state.level.monlist = worm;
    place_monster(worm, 11, 5, state);
    initworm(worm, 2, { state });
    const segments = state.level.worms[worm.wormno].segments;
    // These adjacent tail cells and the head at (11,5) give the first set
    // mask bit a worm while the second bit tests that remove_worm cleared all
    // of its occupied squares before the scan reaches that cell.
    segments[0].x = 9;
    segments[0].y = 4;
    segments[1].x = 10;
    segments[1].y = 5;
    state.level.monsters[9][4] = worm;
    state.level.monsters[10][5] = worm;
    const originalY = segments.map(({ y }) => y);
    // C visits columns then rows; 2x2 rows [1,2] set (x=0,y=0) and
    // (x=1,y=1), covering (9,4) and (10,5). The first capture therefore
    // removes the whole worm before the second cell is visited.
    const bubble = {
        x: 9,
        y: 4,
        dx: 0,
        dy: 0,
        mask: { width: 2, height: 2, rows: [1, 2] },
        cons: [],
    };
    state.air_bubbles = [bubble];
    state.air_bubbles_up = false;

    const draws = [];
    const random = (bound) => {
        draws.push(bound);
        if (draws.length === 1) {
            // mkmaze.c collects the monster before drawing movement. C's
            // remove_worm() clears each wx but preserves its wy, and the
            // bubble owns one monster record even when it covered two tails.
            assert.deepEqual(segments.map(({ x }) => x), [0, 0, 0]);
            assert.deepEqual(segments.map(({ y }) => y), originalY);
            assert.deepEqual([9, 10, 11].map((x, i) =>
                state.level.monsters[x][[4, 5, 5][i]]), [null, null, null]);
            assert.equal(bubble.cons.length, 1);
            assert.equal(bubble.cons[0].what, 'monster');
            assert.equal(bubble.cons[0].list, worm);
            assert.ok(worm.mstate & MON_BUBBLEMOVE);
            assert.deepEqual([worm.mx, worm.my], [0, 0]);
        }
        // The first two rn2(3) results are zero, so C's rx/ry expression
        // moves this stationary bubble down-right by (1,1). The later rn2(5)
        // result 1 suppresses a direction reroll. These mappings pin exactly
        // [3,3,5] while leaving tail placement on its independently seeded RNG.
        return bound === 5 ? 1 : 0;
    };

    movebubbles(state, random);

    assert.deepEqual(draws, [3, 3, 5]);
    assert.deepEqual(bubble.cons, []);
    assert.ok(worm.mx > 0 && worm.my > 0);
    assert.equal(state.level.monsters[worm.mx][worm.my], worm);
    const movedSegments = segments.slice(0, -1);
    for (const segment of movedSegments)
        assert.equal(state.level.monsters[segment.x][segment.y], worm);
});

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
