import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    COLNO, COULD_SEE, IN_SIGHT, M_AP_OBJECT, POOL, ROOM, ROWNO,
    SEE_INVIS,
} from '../js/const.js';
import {
    does_block, do_clear_area_async, makeVisionBuffers, recalc_block_point,
    vision_recalc, vision_reset,
} from '../js/vision.js';
import { set_mimic_blocking } from '../js/display.js';
import { BOULDER } from '../js/objects.js';
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

test('See Invisible toggle updates light blocking for living invisible boulder mimics', () => {
    const source = readFileSync(new URL('../nethack-c/upstream/src/display.c',
        import.meta.url), 'utf8');
    assert.match(source,
        /mimic_light_blocking\(struct monst \*mtmp\)[\s\S]*?mtmp->minvis && is_lightblocker_mappear\(mtmp\)[\s\S]*?if \(See_invisible\)[\s\S]*?block_point\(mtmp->mx, mtmp->my\)[\s\S]*?unblock_point\(mtmp->mx, mtmp->my\)/u);
    assert.match(source, /set_mimic_blocking\(void\)[\s\S]*?iter_mons\(mimic_light_blocking\)/u);
    const level = new GameMap();
    level.at(10, 10).typ = ROOM;
    const mimic = { mx: 10, my: 10, mhp: 10, minvis: 1,
        m_ap_type: M_AP_OBJECT, mappearance: BOULDER, nmon: null };
    level.monlist = mimic;
    level.monsters[10][10] = mimic;
    const state = { level, u: { uprops: { [SEE_INVIS]: {
        intrinsic: 0, extrinsic: 0,
    } } }, viz_array: Array.from({ length: ROWNO },
        () => new Uint8Array(COLNO)), vision_full_recalc: 0 };
    state.viz_array[10][10] = COULD_SEE;
    vision_reset(state);
    state.vision_full_recalc = 0;
    assert.equal(does_block(10, 10, null, state), false);

    state.u.uprops[SEE_INVIS].intrinsic = 1;
    set_mimic_blocking(state);
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(does_block(10, 10, null, state), true);
    state.vision_full_recalc = 0;
    state.u.uprops[SEE_INVIS].intrinsic = 0;
    set_mimic_blocking(state);
    assert.equal(state.vision_full_recalc, 1);
    assert.equal(does_block(10, 10, null, state), false);
});

test('underwater sight includes only adjacent pool squares', () => {
    assert.match(VISION_C,
        /if \(Underwater && !Is_waterlevel\(&u\.uz\)\)[\s\S]*?has_night_vision = 0;[\s\S]*?if \(!isok\(col, row\) \|\| !is_pool\(col, row\)\)[\s\S]*?IN_SIGHT \| COULD_SEE/u);

    const level = new GameMap();
    level.at(10, 10).typ = POOL;
    level.at(11, 10).typ = POOL;
    level.at(9, 10).typ = ROOM;
    level.at(12, 10).typ = POOL;
    const state = {
        level,
        u: {
            ux: 10, uy: 10, uz: { dnum: 0, dlevel: 1 },
            uinwater: true, xray_range: -1, nv_range: 3,
            uprops: {}, uswallow: 0,
        },
        water_level: { dnum: 1, dlevel: 1 },
        rogue_level: { dnum: 2, dlevel: 1 },
        _visionBuffers: makeVisionBuffers(),
        program_state: {}, context: {}, flags: {}, iflags: {},
    };
    vision_reset(state);
    state.viz_array = Array.from(
        { length: ROWNO }, () => new Uint8Array(COLNO),
    );

    vision_recalc(0, { state, redraw() {} });

    assert.equal(state.viz_array[10][10], IN_SIGHT | COULD_SEE);
    assert.equal(state.viz_array[10][11], IN_SIGHT | COULD_SEE);
    assert.equal(state.viz_array[10][9], 0,
        'an adjacent ordinary floor square is outside underwater sight');
    assert.equal(state.viz_array[10][12], 0,
        'a pool square beyond the adjacent 3-by-3 area is outside sight');
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
