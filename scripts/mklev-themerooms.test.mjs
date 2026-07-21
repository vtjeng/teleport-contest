import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CROSSWALL, HWALL, MAXNROFROOMS, ROOM, ROOMOFFSET, STONE, VWALL,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import {
    lspo_map,
    select_themeroom,
    themerooms_generate,
} from '../js/mklev.js';
import { THEMEROOM_DEFINITIONS } from '../js/themeroom_data.js';

function crossDefinition() {
    return THEMEROOM_DEFINITIONS.find((definition) => definition.name === 'Cross');
}

test('themeroom reservoir selects Cross in source order', () => {
    const bounds = [];
    const selected = select_themeroom(1, (bound) => {
        bounds.push(bound);
        // Weight 1000 makes the default entry the initial choice. Returning
        // zero only at cumulative weight 1034 replaces it with Cross; the
        // final two eligible entries do not replace Cross.
        return bound === 1034 ? 0 : bound - 1;
    });

    assert.deepEqual(bounds, [
        // The 6/2/2 weighted fill-room variants cause the jumps from 1004
        // through 1014. Every following level-1 entry has weight one; Twin
        // businesses is excluded because its minimum difficulty is four.
        1000, 1001, 1002, 1003, 1004, 1010, 1012, 1014,
        ...Array.from({ length: 22 }, (_, index) => 1015 + index),
    ]);
    assert.equal(selected.name, 'Cross');
    assert.equal(selected.sourceKind, 'map');
    // These are Cross's source map dimensions and filler_region(6, 6) arguments.
    assert.equal(selected.width, 11);
    assert.equal(selected.height, 11);
    assert.deepEqual(selected.filler, { x: 6, y: 6 });
});

test('lspo_map places a Cross without a build_room chance draw', () => {
    const state = { level: new GameMap() };
    const calls = [];
    const results = [30, 4];
    const origin = lspo_map(crossDefinition(), (bound) => {
        calls.push(bound);
        assert.ok(results.length, `unexpected rn2(${bound})`);
        return results.shift();
    }, state);

    // An 11-wide map uses 80 - 1 - 11 columns; an 11-high map uses
    // 21 - 11 rows. No rn2(100) room-chance call belongs between them.
    assert.deepEqual(calls, [68, 10]);
    // Draws 30 and 4 place the map at (31, 4). These cells sample Cross's
    // transparent corner, top wall, side wall, and interior floor.
    assert.deepEqual(origin, { x: 31, y: 4, width: 11, height: 11 });
    assert.equal(state.level.at(31, 4).typ, STONE); // transparent map 'x'
    assert.equal(state.level.at(34, 4).typ, HWALL);
    assert.equal(state.level.at(34, 4).horizontal, true);
    assert.equal(state.level.at(34, 5).typ, VWALL);
    assert.equal(state.level.at(34, 5).horizontal, false);
    assert.equal(state.level.at(35, 5).typ, ROOM);
});

test('lspo_map retries when the required stone halo is outside the map', () => {
    const state = { level: new GameMap() };
    const calls = [];
    const results = [0, 4, 30, 4];
    const origin = lspo_map(crossDefinition(), (bound) => {
        calls.push(bound);
        assert.ok(results.length, `unexpected rn2(${bound})`);
        return results.shift();
    }, state);

    // The first x result gives origin column one, whose one-cell halo reaches
    // invalid column zero. The second candidate has a valid empty halo.
    assert.deepEqual(calls, [68, 10, 68, 10]);
    assert.equal(origin.x, 31);
    assert.equal(origin.y, 4);
});

test('themeroom generation connects selection, map placement, and filler region', async () => {
    resetGame();
    game.level = new GameMap();
    game.u = { uz: { dnum: 0, dlevel: 1 } };
    game.smeq = new Array(MAXNROFROOMS + 1).fill(0);
    const calls = [];
    // At difficulty one, all 30 eligible descriptors have positive frequency,
    // so selection consumes one reservoir draw per descriptor.
    const reservoirDrawCount = 30;
    let reservoirCalls = 0;
    const random = (bound) => {
        calls.push(bound);
        if (reservoirCalls++ < reservoirDrawCount) return bound === 1034 ? 0 : bound - 1;
        // Place at (31,4), choose the 70% ordinary-fill branch, and leave the
        // resulting level-1 region lit after litstate_rnd's second draw.
        const scripted = new Map([[68, 30], [10, 4], [100, 99], [77, 76]]);
        assert.ok(scripted.has(bound), `unexpected rn2(${bound})`);
        return scripted.get(bound);
    };
    const randomOneBased = (bound) => {
        assert.equal(bound, 2); // rnd(1 + abs(level depth)) at depth one
        return 2;
    };

    assert.equal(await themerooms_generate(1, random, randomOneBased), true);
    assert.deepEqual(calls.slice(reservoirDrawCount), [68, 10, 100, 77]);
    assert.equal(game.level.nroom, 1);
    const room = game.level.rooms[0];
    // Flooding from Cross's translated filler point (37, 10) registers its 9x9
    // interior bounds and assigns the adjacent top wall to the same irregular
    // room. The wall remains generic HWALL until post-level wallification.
    assert.deepEqual(
        [room.lx, room.ly, room.hx, room.hy],
        [32, 5, 40, 13],
    );
    assert.equal(room.irregular, true);
    assert.equal(room.needjoining, true);
    assert.equal(game.level.at(37, 10).roomno, ROOMOFFSET);
    assert.equal(game.level.at(34, 4).roomno, ROOMOFFSET);
    assert.notEqual(game.level.at(34, 4).typ, CROSSWALL);
});
