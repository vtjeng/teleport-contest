import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AGGRAVATE_MONSTER,
    G_EXTINCT,
    G_GENOD,
    G_GONE,
} from '../js/const.js';
import { level_difficulty } from '../js/dungeon.js';
import {
    golemhp,
    mbirth_limit,
    mkclass,
    newmonhp,
    peace_minded,
    propagate,
    rndmonnum,
    rndmonst,
    rndmonst_adj,
    set_malign,
} from '../js/makemon.js';
import {
    PM_AIR_ELEMENTAL,
    PM_BAT,
    PM_DEATH,
    PM_EARTH_ELEMENTAL,
    PM_ERINYS,
    PM_FIRE_ANT,
    PM_FIRE_ELEMENTAL,
    PM_FOX,
    PM_GOBLIN,
    PM_GRAY_DRAGON,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_JACKAL,
    PM_KILLER_BEE,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LEPRECHAUN,
    PM_LICHEN,
    PM_NEWT,
    PM_NAZGUL,
    PM_SEWER_RAT,
    PM_STRAW_GOLEM,
    PM_WATER_ELEMENTAL,
    PM_WIZARD_OF_YENDOR,
    M2_ORC,
    G_NOGEN,
    NON_PM,
    S_ANT,
    S_LEPRECHAUN,
    SPECIAL_PM,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import { rawMonsterGenerationState } from './monster-test-state.mjs';

function startingState() {
    const state = {
        ...rawMonsterGenerationState(),
        astral_level: { dnum: 0, dlevel: 0 },
        level: { flags: { temperature: 0 } },
        rogue_level: { dnum: 0, dlevel: 0 },
        sanctum_level: { dnum: 0, dlevel: 0 },
    };
    monst_globals_init(state);
    reset_mvitals(state);
    return state;
}

test('raw monster-generation fixtures do not share nested state', () => {
    const first = rawMonsterGenerationState();
    const second = rawMonsterGenerationState();
    // Arbitrary non-default alignment and level values make leaked nested
    // mutations visible without selecting a production behavior.
    first.dungeons[0].flags.hellish = true;
    first.u.ualign.record = 7;
    first.specialLevels.push({ dlevel: { dnum: 0, dlevel: 2 } });

    assert.equal(second.dungeons[0].flags.hellish, false);
    assert.equal(second.u.ualign.record, 0);
    assert.deepEqual(second.specialLevels, []);
});

function scriptedRandom(steps) {
    let offset = 0;
    function draw(kind, bound) {
        const step = steps[offset++];
        assert.ok(step, `unexpected ${kind}(${bound})`);
        assert.equal(kind, step.kind ?? 'rn2');
        assert.deepEqual(bound, step.bound);
        return step.result;
    }
    return {
        random: {
            rn2: (bound) => draw('rn2', bound),
            rnd: (bound) => draw('rnd', bound),
            d: (number, sides) => draw('d', [number, sides]),
        },
        assertExhausted() {
            assert.equal(offset, steps.length);
        },
    };
}

function planeState(field) {
    const state = startingState();
    state.air_level = { dnum: 0, dlevel: 1 };
    state.fire_level = { dnum: 0, dlevel: 2 };
    state.earth_level = { dnum: 0, dlevel: 3 };
    state.water_level = { dnum: 0, dlevel: 4 };
    state.astral_level = { dnum: 0, dlevel: 5 };
    state.sanctum_level = { dnum: 0, dlevel: 20 };
    state.u.uz = { ...state[field] };
    return state;
}

function selectOnlyMonster(state, index) {
    // Wide adjustments admit every difficulty. G_GONE leaves `index` as the
    // only candidate not marked G_GONE; the remaining filters still decide
    // whether it is eligible, and a zero reservoir draw selects it when it is.
    for (const vital of state.mvitals) vital.mvflags |= G_GONE;
    state.mvitals[index].mvflags &= ~G_GONE;
    const bounds = [];
    const selected = rndmonst_adj(-100, 100, {
        state,
        random: {
            rn2(bound) {
                bounds.push(bound);
                return 0;
            },
        },
    });
    return { bounds, selected };
}

test('depth-one rndmonst preserves every reservoir-sampling draw', () => {
    const state = startingState();
    const bounds = [];
    const selected = rndmonst({
        state,
        random: {
            rn2(bound) {
                bounds.push(bound);
                return 0;
            },
        },
    });

    // At ordinary DoD depth 1 and hero level 1, these are the nine viable
    // records in mons[] order. A zero draw replaces the reservoir each time,
    // so the final newt also proves that no separate choice draw follows.
    assert.deepEqual(bounds, [3, 4, 5, 7, 8, 11, 15, 16, 21]);
    assert.equal(selected.pmidx, PM_NEWT);
    assert.deepEqual(
        [
            PM_JACKAL,
            PM_FOX,
            PM_KOBOLD,
            PM_GOBLIN,
            PM_SEWER_RAT,
            PM_GRID_BUG,
            PM_LICHEN,
            PM_KOBOLD_ZOMBIE,
            PM_NEWT,
        ],
        [12, 13, 59, 70, 88, 116, 158, 239, 322],
    );
});

test('reservoir sampling can retain the first viable monster', () => {
    const state = startingState();
    const bounds = [];
    const selected = rndmonnum({
        state,
        random: {
            rn2(bound) {
                bounds.push(bound);
                return bound - 1;
            },
        },
    });
    assert.deepEqual(bounds, [3, 4, 5, 7, 8, 11, 15, 16, 21]);
    assert.equal(selected, PM_JACKAL);
});

test('rndmonnum plan B ignores extinction but still filters geno flags', () => {
    const state = startingState();
    for (const vital of state.mvitals) vital.mvflags |= G_GONE;
    state.mons[PM_FOX].geno |= G_NOGEN;
    const bounds = [];
    const candidates = [PM_FOX, PM_JACKAL];
    const selected = rndmonnum({
        state,
        random: {
            rn2(bound) {
                bounds.push(bound);
                assert.equal(bound, SPECIAL_PM);
                return candidates.shift();
            },
        },
    });
    assert.deepEqual(bounds, [SPECIAL_PM, SPECIAL_PM]);
    assert.equal(selected, PM_JACKAL);
    assert.deepEqual(candidates, []);
});

test('level_difficulty keeps ordinary, Amulet, and upward-branch cases', () => {
    const ordinary = startingState();
    assert.equal(level_difficulty(ordinary), 1);

    ordinary.dungeons.push({
        depth_start: 7,
        dunlev_ureached: 3,
        entry_lev: 1,
        flags: { align: 0, hellish: false },
        num_dunlevs: 4,
    });
    ordinary.u.uhave.amulet = 1;
    assert.equal(level_difficulty(ordinary), 9);

    const upward = startingState();
    upward.dungeons[0] = {
        ...upward.dungeons[0],
        depth_start: 5,
        entry_lev: 4,
        num_dunlevs: 4,
    };
    upward.u.uz.dlevel = 3;
    // Base depth 7 plus two elevation units for being two steps past entry.
    assert.equal(level_difficulty(upward), 11);
});

test('level_difficulty applies extrinsic aggravation after every branch', () => {
    const ordinary = startingState();
    ordinary.u.uprops = [];
    ordinary.u.uprops[AGGRAVATE_MONSTER] = { extrinsic: 1 };
    assert.equal(level_difficulty(ordinary), 2);

    ordinary.dungeons.push({
        depth_start: 7,
        dunlev_ureached: 3,
        entry_lev: 1,
        flags: { align: 0, hellish: false },
        num_dunlevs: 4,
    });
    ordinary.u.uhave.amulet = 1;
    assert.equal(level_difficulty(ordinary), 18);

    const endgame = startingState();
    endgame.dungeons.push({
        depth_start: 50,
        dunlev_ureached: 1,
        entry_lev: 1,
        flags: { align: 0, hellish: false },
        num_dunlevs: 5,
    });
    endgame.astral_level = { dnum: 1, dlevel: 5 };
    endgame.sanctum_level = { dnum: 0, dlevel: 20 };
    endgame.u.ulevel = 10;
    endgame.u.uz = { dnum: 1, dlevel: 1 };
    endgame.u.uprops = [];
    endgame.u.uprops[AGGRAVATE_MONSTER] = { extrinsic: 1 };
    assert.equal(level_difficulty(endgame), 50);

    const deep = startingState();
    deep.dungeons[0].depth_start = 30;
    deep.u.uprops = [];
    deep.u.uprops[AGGRAVATE_MONSTER] = { extrinsic: 1 };
    assert.equal(level_difficulty(deep), 50);
});

test('newmonhp preserves level-zero and ordinary minimum-hit-point boosts', () => {
    const state = startingState();
    const newt = {};
    const newtRng = scriptedRandom([
        // A level-zero newt uses rnd(4); the minimum result equals basehp, so
        // newmonhp raises both hit-point fields from 1 to 2.
        { kind: 'rnd', bound: 4, result: 1 },
    ]);
    newmonhp(newt, PM_NEWT, { state, random: newtRng.random });
    newtRng.assertExhausted();
    assert.deepEqual(
        [newt.m_lev, newt.mhp, newt.mhpmax],
        [0, 2, 2],
    );

    const bee = {};
    const beeRng = scriptedRandom([
        // A level-one killer bee uses d(1, 8); the minimum result equals
        // basehp, so newmonhp raises both hit-point fields from 1 to 2.
        { kind: 'd', bound: [1, 8], result: 1 },
    ]);
    newmonhp(bee, PM_KILLER_BEE, { state, random: beeRng.random });
    beeRng.assertExhausted();
    assert.deepEqual(
        [bee.m_lev, bee.mhp, bee.mhpmax],
        [1, 2, 2],
    );
});

test('newmonhp preserves golem fixed HP and Rider/adult-dragon formulas', () => {
    const state = startingState();

    const golem = {};
    const noDraw = scriptedRandom([]);
    newmonhp(golem, PM_STRAW_GOLEM, { state, random: noDraw.random });
    noDraw.assertExhausted();
    assert.equal(golemhp(PM_STRAW_GOLEM), 20);
    assert.deepEqual([golem.mhp, golem.mhpmax], [20, 20]);

    const rider = {};
    const riderRng = scriptedRandom([
        // One on each of 10 d8 yields basehp 10, triggering the final
        // minimum-hit-point boost to 11.
        { kind: 'd', bound: [10, 8], result: 10 },
    ]);
    newmonhp(rider, PM_DEATH, { state, random: riderRng.random });
    riderRng.assertExhausted();
    assert.deepEqual([rider.mhp, rider.mhpmax], [11, 11]);

    const dragon = {};
    const dragonRng = scriptedRandom([
        // Gray dragon level 15 drops to 14 at this level difficulty; rolling
        // one on each of 14 d4 establishes the exact 4 * level + d(level, 4).
        { kind: 'd', bound: [14, 4], result: 14 },
    ]);
    newmonhp(dragon, PM_GRAY_DRAGON, {
        state,
        random: dragonRng.random,
    });
    dragonRng.assertExhausted();
    assert.deepEqual(
        [dragon.m_lev, dragon.mhp, dragon.mhpmax],
        [14, 70, 70],
    );
});

test('propagate preserves birth limits, extinction, and ghostly tally rules', () => {
    const state = startingState();
    const random = scriptedRandom([]).random;
    // Nazgul and erinys exercise the two special caps; jackal uses MAXMONNO.
    assert.equal(mbirth_limit(PM_NAZGUL), 9);
    assert.equal(mbirth_limit(PM_ERINYS), 3);
    assert.equal(mbirth_limit(PM_JACKAL), 120);

    // One below the default cap remains eligible. Tallying reaches 120 and
    // marks this non-G_NOGEN species extinct.
    state.mvitals[PM_JACKAL].born = 119;
    assert.equal(propagate(PM_JACKAL, true, false, { state, random }), true);
    assert.equal(state.mvitals[PM_JACKAL].born, 120);
    assert.ok(state.mvitals[PM_JACKAL].mvflags & G_EXTINCT);

    // A non-ghostly tally increments an extinct species even though
    // propagation returns false.
    assert.equal(propagate(PM_JACKAL, true, false, { state, random }), false);
    assert.equal(state.mvitals[PM_JACKAL].born, 121);

    // Ghostly restoration of an extinct species returns false without tallying.
    state.mvitals[PM_FOX].mvflags |= G_EXTINCT;
    assert.equal(propagate(PM_FOX, true, true, { state, random }), false);
    assert.equal(state.mvitals[PM_FOX].born, 0);

    assert.equal(
        propagate(PM_WIZARD_OF_YENDOR, true, false, { state, random }),
        true,
    );
    assert.ok(state.mvitals[PM_WIZARD_OF_YENDOR].mvflags & G_EXTINCT);
});

test('peace_minded preserves hostility gates and co-aligned RNG', () => {
    const state = startingState();
    const noDraw = scriptedRandom([]);
    const alwaysHostile = [
        PM_JACKAL,
        PM_FOX,
        PM_KOBOLD,
        PM_SEWER_RAT,
        PM_GRID_BUG,
        PM_LICHEN,
        PM_KOBOLD_ZOMBIE,
        PM_NEWT,
    ];
    for (const mndx of alwaysHostile) {
        assert.equal(
            peace_minded(state.mons[mndx], { state, random: noDraw.random }),
            false,
        );
    }

    // A human treats the goblin's orc race as hostile before alignment RNG.
    state.urace.hatemask = M2_ORC;
    assert.equal(
        peace_minded(state.mons[PM_GOBLIN], { state, random: noDraw.random }),
        false,
    );
    noDraw.assertExhausted();

    state.urace.hatemask = 0;
    state.u.ualign = { type: -1, record: 10, abuse: 0 };
    // The chaotic hero and goblin are co-aligned. Record 10 gives rn2(26),
    // while goblin maligntyp -3 gives rn2(5); two nonzero results are peaceful.
    const coaligned = scriptedRandom([
        { bound: 26, result: 1 },
        { bound: 5, result: 1 },
    ]);
    assert.equal(
        peace_minded(state.mons[PM_GOBLIN], {
            state,
            random: coaligned.random,
        }),
        true,
    );
    coaligned.assertExhausted();

    // Carrying the Amulet rejects a negatively aligned monster first.
    state.u.uhave.amulet = 1;
    assert.equal(
        peace_minded(state.mons[PM_GOBLIN], { state, random: noDraw.random }),
        false,
    );
});

test('set_malign distinguishes peaceful and hostile coaligned monsters', () => {
    const state = startingState();
    state.u.ualign.type = -1;
    const goblin = {
        data: state.mons[PM_GOBLIN],
        ispriest: false,
        isminion: false,
        mpeaceful: true,
    };
    assert.equal(set_malign(goblin, state), -9);
    goblin.mpeaceful = false;
    assert.equal(set_malign(goblin, state), 3);

    state.u.ualign.type = 0;
    const jackal = {
        data: state.mons[PM_JACKAL],
        ispriest: false,
        isminion: false,
        mpeaceful: false,
    };
    assert.equal(set_malign(jackal, state), 0);
});

test('Quest fixed-enemy selection preserves its three source draws', () => {
    const state = startingState();
    state.quest_dnum = state.u.uz.dnum;
    state.urole = {
        enemy1num: PM_KILLER_BEE,
        enemy1sym: S_ANT,
        enemy2num: PM_JACKAL,
        enemy2sym: state.mons[PM_JACKAL].mlet,
    };
    // rndmonst_adj() first chooses the Quest path; qt_montype() then chooses
    // enemy1 and accepts its fixed species.  Extinction is intentionally not
    // genocide, matching questpgr.c's G_GENOD-only test.
    state.mvitals[PM_KILLER_BEE].mvflags |= G_EXTINCT;
    const rng = scriptedRandom([
        { bound: 7, result: 1 },
        { bound: 5, result: 1 },
        { bound: 5, result: 1 },
    ]);

    assert.equal(rndmonst({ state, random: rng.random }).pmidx, PM_KILLER_BEE);
    rng.assertExhausted();
});

test('Quest genocide falls back through source mkclass RNG order', () => {
    const state = startingState();
    state.quest_dnum = state.u.uz.dnum;
    state.urole = {
        enemy1num: PM_KILLER_BEE,
        enemy1sym: S_LEPRECHAUN,
        enemy2num: NON_PM,
        enemy2sym: S_LEPRECHAUN,
    };
    state.mvitals[PM_KILLER_BEE].mvflags |= G_GENOD;
    const rng = scriptedRandom([
        // Enter the Quest branch, choose enemy1, then reject its genocided
        // fixed species before falling back to enemy1sym's class.
        { bound: 7, result: 1 },
        { bound: 5, result: 1 },
        { bound: 5, result: 1 },
        // The one-member leprechaun class consumes its genesis-mask draw,
        // then rnd(4) selects the weighted candidate.
        { bound: 9, result: 0 },
        { kind: 'rnd', bound: 4, result: 1 },
    ]);

    assert.equal(rndmonst({ state, random: rng.random }).pmidx, PM_LEPRECHAUN);
    rng.assertExhausted();
});

test('mkclass uses difficulty order, per-record masks, and one final draw', () => {
    const state = startingState();
    const rng = scriptedRandom([
        // makemon.c processes ants by difficulty: giant ant, killer bee,
        // fire ant, giant beetle, soldier ant, then the non-generatable queen.
        // Each record consumes rn2(9) for its genesis mask. The rn2(2) draws
        // keep scanning at the killer-bee and soldier-ant strength boundaries.
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 2, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 2, result: 0 },
        // The queen still consumes its mask draw before G_NOGEN rejects it;
        // rnd(15)=8 then lands in the fire ant's cumulative weight interval.
        { bound: 9, result: 0 },
        { kind: 'rnd', bound: 15, result: 8 },
    ]);

    assert.equal(
        mkclass(S_ANT, 0, { state, random: rng.random }).pmidx,
        PM_FIRE_ANT,
    );
    rng.assertExhausted();
});

test('rndmonst_adj accepts elementals only on their home planes without hooks', () => {
    const cases = [
        ['air_level', PM_AIR_ELEMENTAL, PM_FIRE_ELEMENTAL],
        ['fire_level', PM_FIRE_ELEMENTAL, PM_EARTH_ELEMENTAL],
        ['earth_level', PM_EARTH_ELEMENTAL, PM_WATER_ELEMENTAL],
        ['water_level', PM_WATER_ELEMENTAL, PM_AIR_ELEMENTAL],
    ];
    for (const [field, home, foreign] of cases) {
        const accepted = selectOnlyMonster(planeState(field), home);
        assert.equal(accepted.selected?.pmidx, home, `${field} home`);
        assert.equal(accepted.bounds.length, 1, `${field} home RNG`);

        const rejected = selectOnlyMonster(planeState(field), foreign);
        assert.equal(rejected.selected, null, `${field} foreign`);
        assert.deepEqual(rejected.bounds, [], `${field} foreign RNG`);
    }
});

test('elemental planes filter ordinary monsters by source capabilities', () => {
    const cases = [
        ['earth_level', PM_JACKAL, true],
        ['water_level', PM_GREMLIN, true],
        ['water_level', PM_JACKAL, false],
        ['fire_level', PM_FIRE_ANT, true],
        ['fire_level', PM_JACKAL, false],
        ['air_level', PM_BAT, true],
        ['air_level', PM_JACKAL, false],
    ];
    for (const [field, candidate, allowed] of cases) {
        const result = selectOnlyMonster(planeState(field), candidate);
        assert.equal(result.selected?.pmidx ?? NON_PM,
            allowed ? candidate : NON_PM, `${field} candidate ${candidate}`);
        assert.equal(result.bounds.length, allowed ? 1 : 0);
    }
});

test('monster selection fails closed without initialized source catalogs', () => {
    assert.throws(
        () => rndmonst({ state: { u: { uz: { dnum: 0, dlevel: 1 } } } }),
        /monst_globals_init/u,
    );
});
