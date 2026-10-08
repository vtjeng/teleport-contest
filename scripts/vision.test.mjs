import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { COLNO, ROWNO } from '../js/const.js';
import { do_clear_area_async, vision_reset, recalc_block_point } from '../js/vision.js';
import { GameMap } from '../js/game.js';

const VISION_C = readFileSync(
    new URL('../nethack-c/upstream/src/vision.c', import.meta.url), 'utf8',
);

function darkCenteredState(level) {
    // The arbitrary in-bounds center (10,10) and all-zero visibility bitmap
    // isolate vision.c's detection override from ordinary couldsee results.
    return {
        u: { ux: 10, uy: 10, uz: level },
        viz_array: Array.from({ length: ROWNO }, () => new Uint8Array(COLNO)),
        vision_full_recalc: false,
    };
}

async function visitedFor(state, detecting, center = [10, 10]) {
    const visited = [];
    await do_clear_area_async(
        center[0], center[1], 1,
        (x, y) => { visited.push([x, y]); },
        null,
        state,
        { detecting },
    );
    return visited;
}

test('do_clear_area detection override is centered and limited to air or water',
    async () => {
        // C's override is the conjunction of callback identity and a matching
        // air/water level, and C takes this path only when centered on the hero.
        assert.match(VISION_C,
            /detecting\(func\)[\s\S]{0,160}Is_waterlevel\(&u\.uz\)[\s\S]{0,100}Is_airlevel\(&u\.uz\)/u);
        assert.match(VISION_C,
            /if \(scol != u\.ux \|\| srow != u\.uy\)[\s\S]{0,180}view_from/u);

        const water = { dnum: 2, dlevel: 4 };
        const air = { dnum: 3, dlevel: 2 };
        const other = { dnum: 1, dlevel: 1 };

        const ordinary = darkCenteredState(other);
        ordinary.water_level = water;
        ordinary.air_level = air;
        assert.deepEqual(await visitedFor(ordinary, false), []);

        const underwater = darkCenteredState(water);
        underwater.water_level = water;
        underwater.air_level = air;
        const detectedOnWater = await visitedFor(underwater, true);
        assert.ok(detectedOnWater.length > 0);
        assert.ok(detectedOnWater.some(([x, y]) => x === 10 && y === 10));

        const inAir = darkCenteredState(air);
        inAir.water_level = water;
        inAir.air_level = air;
        assert.ok((await visitedFor(inAir, true)).length > 0);

        const ordinaryLevel = darkCenteredState(other);
        ordinaryLevel.water_level = water;
        ordinaryLevel.air_level = air;
        assert.deepEqual(await visitedFor(ordinaryLevel, true), []);

    });

test('vision_reset publishes the source ready and deferred recalculation flags', () => {
    assert.match(VISION_C, /iflags\.vision_inited = TRUE;/u);
    assert.match(VISION_C, /gv\.vision_full_recalc = 1;/u);
    const state = { level: new GameMap(), iflags: { vision_inited: false },
        vision_full_recalc: 0 }; // Cleared source flags expose both publications.
    vision_reset(state);
    assert.equal(state.iflags.vision_inited, true);
    assert.equal(state.vision_full_recalc, 1);
});

test('borrowed transparency rebuilding preserves live publication and display bounds', () => {
    const state = { level: new GameMap(),
        iflags: Object.freeze({ vision_inited: true }),
        vision_full_recalc: 0,
        _viz_rmin: [1], _viz_rmax: [1] }; // Existing display bounds remain owned.
    const minimum = state._viz_rmin, maximum = state._viz_rmax;
    // An unseen point updates only the derived transparency index. Planning
    // cleanup performs this same rebuild against immutable live iflags.
    recalc_block_point(1, 1, state);
    assert.equal(state.iflags.vision_inited, true);
    assert.equal(state.vision_full_recalc, 0);
    assert.equal(state._viz_rmin, minimum);
    assert.equal(state._viz_rmax, maximum);
});
