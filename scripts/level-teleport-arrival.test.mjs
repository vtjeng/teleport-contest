// Focused tests for the source-owned helpers which carry a positive decimal
// level teleport from dungeon topology resolution to random hero placement.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AIR,
    ARROW_TRAP,
    CORR,
    LAST_PROP,
    LR_BRANCH,
    LR_DOWNTELE,
    LR_TELE,
    LR_UPTELE,
    MAGIC_PORTAL,
    ROOM,
    STONE,
    VIBRATING_SQUARE,
    undestroyable_trap,
} from '../js/const.js';
import {
    In_W_tower,
    On_W_tower_level,
    get_level,
    lev_by_name,
    single_level_branch,
    u_on_rndspot,
} from '../js/dungeon.js';
import { GameMap } from '../js/game.js';
import {
    UnsupportedRegionPlacementError,
    bad_location,
    is_exclusion_zone,
    place_lregion,
} from '../js/mkmaze.js';
import { enableRngLog, getRngLog, initRng } from '../js/rng.js';
import { loadLevelTeleportArrivalRecipe } from './run-level-teleport-arrival.mjs';

test('the arrival matrix is a clean three-case replay recipe', () => {
    const recipe = loadLevelTeleportArrivalRecipe();
    assert.equal(recipe.version, 5);
    assert.deepEqual(
        recipe.segments.map(({ seed }) => seed),
        [7621004, 7621001, 7621009],
    );
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.match(segment.nethackrc, /playmode:debug/u);
        assert.match(segment.moves, /^\.\x16[125]\n\.$/u);
    }
});

function placementState() {
    return {
        level: new GameMap(),
        flags: {},
        iflags: {},
        urace: { mnum: -1 },
        u: {
            ux: 1,
            uy: 1,
            ux0: 1,
            uy0: 1,
            uz: { dnum: 0, dlevel: 2 },
            uz0: { dnum: 0, dlevel: 1 },
            umonnum: 0,
            umonster: 0,
            uprops: Array.from(
                { length: LAST_PROP + 1 },
                () => ({ intrinsic: 0, extrinsic: 0, blocked: 0 }),
            ),
        },
        dndest: {},
        updest: {},
        wiz1_level: { dnum: 9, dlevel: 1 },
        wiz2_level: { dnum: 9, dlevel: 2 },
        wiz3_level: { dnum: 9, dlevel: 3 },
        exclusion_zones: null,
    };
}

test('bad_location admits exactly room, air, and maze corridors', () => {
    const state = placementState();
    const location = state.level.at(10, 5);

    location.typ = ROOM;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), false);
    location.typ = AIR;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), false);
    location.typ = CORR;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), true);
    state.level.flags.is_maze_lev = true;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), false);
    location.typ = STONE;
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), true);

    location.typ = ROOM;
    assert.equal(bad_location(10, 5, 9, 4, 11, 6, state), true);
    state.level.traps.push({ tx: 10, ty: 5, ttyp: ARROW_TRAP });
    assert.equal(bad_location(10, 5, 0, 0, 0, 0, state), true);
});

test('teleport exclusion zones apply in C source order and direction', () => {
    const state = placementState();
    state.exclusion_zones = {
        zonetype: LR_DOWNTELE,
        lx: 20, ly: 4, hx: 25, hy: 8,
        next: {
            zonetype: LR_TELE,
            lx: 10, ly: 3, hx: 15, hy: 7,
            next: null,
        },
    };

    assert.equal(is_exclusion_zone(LR_DOWNTELE, 20, 4, state), true);
    assert.equal(is_exclusion_zone(LR_UPTELE, 20, 4, state), false);
    assert.equal(is_exclusion_zone(LR_DOWNTELE, 12, 5, state), true);
    assert.equal(is_exclusion_zone(LR_UPTELE, 12, 5, state), true);
    assert.equal(is_exclusion_zone(LR_BRANCH, 12, 5, state), false);
    assert.equal(is_exclusion_zone(LR_DOWNTELE, 16, 5, state), false);
});

test('u_on_rndspot retries trap and monster squares in exact PRNG order', () => {
    const state = placementState();
    // ISAAC seed 1 produces <7,14>, <36,7>, <79,4> for the first three
    // rn1(79,1)/rn1(21,0) pairs. Make them respectively trap, monster, clear.
    const candidates = [[7, 14], [36, 7], [79, 4]];
    for (const [x, y] of candidates) state.level.at(x, y).typ = ROOM;
    const trap = { tx: 7, ty: 14, ttyp: ARROW_TRAP };
    const monster = { mx: 36, my: 7, mhp: 1 };
    state.level.traps.push(trap);
    state.level.monsters[36][7] = monster;

    initRng(1);
    enableRngLog();
    u_on_rndspot(0, state);

    assert.deepEqual([state.u.ux, state.u.uy], [79, 4]);
    assert.deepEqual(getRngLog(), [
        'rn2(79)=6', 'rn2(21)=14',
        'rn2(79)=35', 'rn2(21)=7',
        'rn2(79)=78', 'rn2(21)=4',
    ]);
    assert.equal(state.level.traps[0], trap);
    assert.equal(state.level.monsters[36][7], monster);
});

test('a one-dimensional arrival region is not treated as a one-shot square',
    () => {
        const state = placementState();
        state.level.at(7, 14).typ = ROOM;
        state.level.at(7, 15).typ = ROOM;
        const trap = { tx: 7, ty: 14, ttyp: ARROW_TRAP };
        state.level.traps.push(trap);

        initRng(1);
        place_lregion(7, 14, 7, 15, 0, 0, 0, 0,
                      LR_DOWNTELE, null, state);

        assert.deepEqual([state.u.ux, state.u.uy], [7, 15]);
        assert.equal(state.level.traps[0], trap);
    });

test('the deterministic placement sweep includes both upper bounds', () => {
    const state = placementState();
    // Leave exactly the last square usable. Seed 1 does not choose it during
    // the 200 random attempts, so mkmaze.c's deterministic sweep must reach it.
    state.level.at(79, 20).typ = ROOM;

    initRng(1);
    place_lregion(1, 0, 79, 20, 0, 0, 0, 0,
                  LR_DOWNTELE, null, state);

    assert.deepEqual([state.u.ux, state.u.uy], [79, 20]);
});

test('unbounded branch placement is refused only for a level with rooms',
    () => {
        const state = placementState();
        state.level.nroom = 0;
        assert.throws(
            () => place_lregion(0, 0, 0, 0, 0, 0, 0, 0,
                                LR_BRANCH, null, state),
            (error) => !(error instanceof UnsupportedRegionPlacementError)
                && error.message === `Couldn't place lregion type ${LR_BRANCH}!`,
        );
    });

test('numeric topology resolution is pure and stays in the current dungeon',
    () => {
        const state = {
            u: { uz: { dnum: 0, dlevel: 1 } },
            dungeons: [{
                depth_start: 1,
                num_dunlevs: 10,
                ledger_start: 0,
            }],
            branches: [],
            specialLevels: [],
            valley_level: { dnum: 1, dlevel: 1 },
            medusa_level: { dnum: 0, dlevel: 8 },
        };
        assert.equal(lev_by_name('5', state), 0);
        assert.equal(Object.hasOwn(state, 'svl'), false);

        const destination = { dnum: -1, dlevel: -1 };
        get_level(destination, 5, state);
        assert.deepEqual(destination, { dnum: 0, dlevel: 5 });
        get_level(destination, 99, state);
        assert.deepEqual(destination, { dnum: 0, dlevel: 10 });
        get_level(destination, 0, state);
        assert.deepEqual(destination, { dnum: 0, dlevel: 1 });

        const branchState = {
            u: { uz: { dnum: 1, dlevel: 1 } },
            dungeons: [
                { depth_start: 1, num_dunlevs: 4, ledger_start: 0 },
                { depth_start: 5, num_dunlevs: 3, ledger_start: 4 },
            ],
            branches: [{
                end1: { dnum: 0, dlevel: 4 },
                end2: { dnum: 1, dlevel: 1 },
            }],
        };
        get_level(destination, 1, branchState);
        assert.deepEqual(destination, { dnum: 0, dlevel: 1 });
    });

test('single-level and Wizard tower predicates read their source-owned state',
    () => {
        const state = placementState();
        state.knox_level = { dnum: 4, dlevel: 1 };
        assert.equal(single_level_branch({ dnum: 4, dlevel: 1 }, state), true);
        assert.equal(single_level_branch({ dnum: 0, dlevel: 1 }, state), false);

        assert.equal(On_W_tower_level({ dnum: 9, dlevel: 2 }, state), true);
        assert.equal(On_W_tower_level({ dnum: 0, dlevel: 2 }, state), false);
        state.dndest = { nlx: 30, nly: 4, nhx: 40, nhy: 12 };
        assert.equal(In_W_tower(35, 8, { dnum: 9, dlevel: 2 }, state), true);
        assert.equal(In_W_tower(20, 8, { dnum: 9, dlevel: 2 }, state), false);
        assert.equal(In_W_tower(35, 8, { dnum: 0, dlevel: 2 }, state), false);
    });

test('ordinary tower-level arrivals do not use the tower-preservation region',
    () => {
        const state = placementState();
        state.u.uz = { dnum: 9, dlevel: 2 };
        state.dndest = {
            lx: 10, ly: 5, hx: 10, hy: 5,
            nlx: 30, nly: 7, nhx: 30, nhy: 7,
        };
        state.level.at(10, 5).typ = ROOM;
        state.level.at(30, 7).typ = ROOM;

        initRng(1);
        u_on_rndspot(0, state);
        assert.deepEqual([state.u.ux, state.u.uy], [10, 5]);
    });

test('undestroyable_trap names exactly the two trap.h exceptions', () => {
    assert.equal(undestroyable_trap(MAGIC_PORTAL), true);
    assert.equal(undestroyable_trap(VIBRATING_SQUARE), true);
    assert.equal(undestroyable_trap(ARROW_TRAP), false);
});
