import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_LAWFUL,
    A_NONE,
    AGGRAVATE_MONSTER,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    AM_NONE,
    G_EXTINCT,
    G_GENOD,
    G_GONE,
} from '../js/const.js';
import { level_difficulty } from '../js/dungeon.js';
import { adj_erinys } from '../js/mon.js';
import {
    align_shift,
    golemhp,
    grow_up,
    init_mextra,
    init_mongen_order,
    mbirth_limit,
    mk_gen_ok,
    mkclass,
    mkclass_aligned,
    mkclass_poly,
    newmcorpsenm,
    newmextra,
    newmonhp,
    peace_minded,
    propagate,
    rndmonnum,
    rndmonst,
    rndmonst_adj,
    set_malign,
    temperature_shift,
    wrong_elem_type,
} from '../js/makemon.js';
import {
    G_FREQ,
    G_NOGEN,
    G_UNIQ,
    LOW_PM,
    NUMMONS,
    PM_AIR_ELEMENTAL,
    PM_ARCHEOLOGIST,
    PM_BAT,
    PM_DEATH,
    PM_EARTH_ELEMENTAL,
    PM_ELF,
    PM_ERINYS,
    PM_FIRE_ANT,
    PM_FIRE_ELEMENTAL,
    PM_FLOATING_EYE,
    PM_FOG_CLOUD,
    PM_FOX,
    PM_GIANT,
    PM_GOBLIN,
    PM_GRAY_DRAGON,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_HELL_HOUND,
    PM_HELL_HOUND_PUP,
    PM_HUMAN,
    PM_JACKAL,
    PM_JUIBLEX,
    PM_KILLER_BEE,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_LEPRECHAUN,
    PM_LICHEN,
    PM_LITTLE_DOG,
    PM_LURKER_ABOVE,
    PM_MAIL_DAEMON,
    PM_NEWT,
    PM_NAZGUL,
    PM_ORC,
    PM_QUEEN_BEE,
    PM_GHOST,
    PM_SEWER_RAT,
    PM_STRAW_GOLEM,
    PM_WOLF,
    PM_WATER_ELEMENTAL,
    PM_WIZARD_OF_YENDOR,
    M2_ORC,
    NON_PM,
    S_ANT,
    S_DEMON,
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
    // Fixed golem HP has no random dependency, including no incidental rn2.
    newmonhp(golem, PM_STRAW_GOLEM, { state, random: {} });
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
    // Birth accounting is deterministic and must not inherit selection RNG.
    const random = {};
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

// ---- wrong_elem_type tests ----
// C ref: makemon.c wrong_elem_type() (55-75). Pure filter that checks whether
// a given monster species does not belong on the current elemental level.
// Elementals must be on their home plane; ordinary monsters must satisfy
// level-specific capability checks (swimming, fire resistance, flying, etc.).

// makemon.c:58-59. An elemental on its home plane is not wrong; on a foreign
// plane it is. is_home_elemental(ptr) compares the elemental's pmidx against
// the four elemental-plane level identities.
test('wrong_elem_type rejects an elemental on a foreign plane', () => {
    const state = planeState('air_level');
    // Air elemental on the air plane: home elemental, not wrong.
    assert.equal(wrong_elem_type(state.mons[PM_AIR_ELEMENTAL], state), false);
    // Fire elemental on the air plane: foreign elemental, wrong.
    assert.equal(wrong_elem_type(state.mons[PM_FIRE_ELEMENTAL], state), true);
});

// makemon.c:60-61. The earth level has no restrictions: any species passes.
// C comment: "/* no restrictions? */".
test('wrong_elem_type allows any monster on the earth level', () => {
    const state = planeState('earth_level');
    // A jackal has no swimming, fire resistance, or flying; it passes because
    // the earth level imposes no capability filter.
    assert.equal(wrong_elem_type(state.mons[PM_JACKAL], state), false);
});

// makemon.c:62-65. The water level rejects non-swimmers. is_swimmer(ptr) tests
// M1_SWIM. PM_GREMLIN has M1_SWIM; PM_JACKAL does not.
test('wrong_elem_type filters by swimming on the water level', () => {
    const state = planeState('water_level');
    assert.equal(wrong_elem_type(state.mons[PM_GREMLIN], state), false);
    assert.equal(wrong_elem_type(state.mons[PM_JACKAL], state), true);
});

// makemon.c:66-68. The fire level rejects non-fire-resistant monsters.
// pm_resistance(ptr, MR_FIRE) checks mresists. PM_FIRE_ANT has MR_FIRE.
test('wrong_elem_type filters by fire resistance on the fire level', () => {
    const state = planeState('fire_level');
    assert.equal(wrong_elem_type(state.mons[PM_FIRE_ANT], state), false);
    assert.equal(wrong_elem_type(state.mons[PM_JACKAL], state), true);
});

// makemon.c:69-72. The air level admits flyers (except S_TRAPPER), floaters
// (S_EYE or S_LIGHT), amorphous (M1_AMORPHOUS), noncorporeal (S_GHOST), and
// whirly (S_VORTEX or PM_AIR_ELEMENTAL). Everything else is wrong.
test('wrong_elem_type filters by air capabilities on the air level', () => {
    const state = planeState('air_level');
    // Flyer (bat, M1_FLY, not S_TRAPPER): accepted.
    assert.equal(wrong_elem_type(state.mons[PM_BAT], state), false);
    // Floater (floating eye, S_EYE): accepted.
    assert.equal(wrong_elem_type(state.mons[PM_FLOATING_EYE], state), false);
    // Noncorporeal (ghost, S_GHOST): accepted.
    assert.equal(wrong_elem_type(state.mons[PM_GHOST], state), false);
    // Whirly (fog cloud, S_VORTEX): accepted.
    assert.equal(wrong_elem_type(state.mons[PM_FOG_CLOUD], state), false);
    // No qualifying property (jackal): rejected.
    assert.equal(wrong_elem_type(state.mons[PM_JACKAL], state), true);
});

// makemon.c:70. A lurker above has M1_FLY but its class is S_TRAPPER, so the
// flyer check excludes it. It has no other air-level-valid property (not a
// floater, not amorphous, not noncorporeal, not whirly), so it is wrong.
test('wrong_elem_type excludes S_TRAPPER flyers on the air level', () => {
    const state = planeState('air_level');
    assert.equal(wrong_elem_type(state.mons[PM_LURKER_ABOVE], state), true);
});

// Off elemental planes the non-elemental branches return false because none
// of the Is_*level() conditions match. An S_ELEMENTAL still hits the first
// branch and returns !is_home_elemental(), which is true off its home plane.
test('wrong_elem_type returns false for non-elementals off elemental planes', () => {
    const state = startingState();
    // The default state places the hero on dungeon level 1, which is not an
    // elemental plane.
    assert.equal(wrong_elem_type(state.mons[PM_JACKAL], state), false);
    // An air elemental off elemental planes: S_ELEMENTAL, not home -> true.
    assert.equal(wrong_elem_type(state.mons[PM_AIR_ELEMENTAL], state), true);
});

test('monster selection fails closed without initialized source catalogs', () => {
    assert.throws(
        () => rndmonst({ state: { u: { uz: { dnum: 0, dlevel: 1 } } } }),
        /monst_globals_init/u,
    );
});

// makemon.c grow_up() (2049-2178), the arm mhitm.c mdamagem() reaches on every
// monster-versus-monster kill.
function growState() {
    const state = startingState();
    state.u = { ...state.u, uz: { dnum: 0, dlevel: 1 } };
    return state;
}

function grower(state, pmidx, overrides = {}) {
    const species = state.mons[pmidx];
    return {
        data: species,
        m_lev: species.mlevel,
        mhp: 4,
        mhpmax: 4,
        ...overrides,
    };
}

function growEnv(state, rolls = []) {
    const bounds = [];
    const queue = [...rolls];
    const take = (label) => {
        bounds.push(label);
        return queue.length ? queue.shift() : 1;
    };
    return {
        bounds,
        state,
        random: {
            rn2: (b) => take(`rn2(${b})`),
            rnd: (b) => take(`rnd(${b})`),
        },
        unsupported: (reason) => { throw new Error(reason); },
    };
}

// makemon.c:2095, `max_increase = rnd((int) victim->m_lev + 1)`, and the two
// writes at :2098-2099. rnd.c:163 is `x = RND(x) + 1`, so a level-zero victim
// still spends a draw and always answers 1.
test('grow_up banks its hit points from the victim level', () => {
    const state = growState();
    // A jackal is level 0, so the roll is rnd(1); a giant ant is level 2, so
    // it is rnd(3).
    const dog = grower(state, PM_FOX, { m_lev: 1, mhp: 4, mhpmax: 4 });
    const jackalEnv = growEnv(state, [1]);
    assert.equal(
        grow_up(dog, grower(state, PM_JACKAL, { m_lev: 0 }), jackalEnv),
        dog.data,
    );
    assert.deepEqual(jackalEnv.bounds, ['rnd(1)']);
    assert.equal(dog.mhpmax, 5);
    // cur_increase is 0 whenever max_increase is 1, and C spends no draw on
    // it, so current hit points stay where the fight left them.
    assert.equal(dog.mhp, 4);

    // A larger max_increase adds rn2(max_increase) to current hit points.
    const antEnv = growEnv(state, [3, 2]);
    grow_up(dog, grower(state, PM_FIRE_ANT, { m_lev: 3 }), antEnv);
    assert.deepEqual(antEnv.bounds, ['rnd(4)', 'rn2(3)']);
    assert.equal(dog.mhpmax, 8);
    assert.equal(dog.mhp, 6);
});

// makemon.c:2082-2088, the hit-point threshold, and :2096-2097, the clamp that
// keeps the new maximum one point above it. C's own comment at :2093-2094 says
// the limit sits "at the bottom of the next level rather than the top", so a
// clamped gain always crosses the threshold and the level gain below it reads
// the clamped value.
test('grow_up clamps the gain to one point past the level ceiling', () => {
    const state = growState();
    // A level-zero monster uses the fixed threshold of 4 rather than
    // `m_lev * 8`, so a roll of 8 against a maximum of 4 is cut to 1.
    const cub = grower(state, PM_FOX, { m_lev: 0, mhp: 2, mhpmax: 4 });
    const env = growEnv(state, [8]);
    assert.equal(grow_up(cub, grower(state, PM_FIRE_ANT, { m_lev: 7 }), env),
                 cub.data);
    // The clamped max_increase is 1, not the 8 the die returned, and it is
    // not greater than 1, so no rn2() follows it.
    assert.deepEqual(env.bounds, ['rnd(8)']);
    assert.equal(cub.mhpmax, 5);
    assert.equal(cub.mhp, 2);
    // 5 is one point past the threshold of 4, which is what the clamp is for:
    // the level rises even though the gain was cut to a single point.
    assert.equal(cub.m_lev, 1);

    // A maximum already past the ceiling clamps to zero rather than going
    // negative, so the maximum does not move at all -- and the level still
    // rises, because the unchanged maximum is already past the threshold.
    const swollen = grower(state, PM_FOX, { m_lev: 0, mhp: 9, mhpmax: 9 });
    assert.equal(grow_up(swollen, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), swollen.data);
    assert.equal(swollen.mhpmax, 9);
    assert.equal(swollen.m_lev, 1);

    // A monster far below its own ceiling keeps the whole roll, which is how
    // the clamp is shown to be a clamp and not the only path.
    const grown = grower(state, PM_FOX, { m_lev: 2, mhp: 4, mhpmax: 4 });
    const room = growEnv(state, [8, 5]);
    assert.equal(grow_up(grown, grower(state, PM_FIRE_ANT, { m_lev: 7 }), room),
                 grown.data);
    assert.deepEqual(room.bounds, ['rnd(8)', 'rn2(8)']);
    assert.equal(grown.mhpmax, 12);
    assert.equal(grown.mhp, 9);
});

// makemon.c:2087-2088. A golem's threshold is derived from its own maximum
// rather than from its level.
test('grow_up gives a golem a threshold of its own', () => {
    const state = growState();
    // ((25 / 10) + 1) * 10 - 1 is 29 and `m_lev * 8` is 24, so a maximum of 25
    // raised by one lands between the two thresholds. That is what makes the
    // row fail if the golem arm is dropped: against 24 the same monster gains
    // a level and stops.
    const golem = grower(state, PM_STRAW_GOLEM,
                         { m_lev: 3, mhp: 25, mhpmax: 25 });
    const env = growEnv(state, [1]);
    assert.equal(grow_up(golem, grower(state, PM_JACKAL, { m_lev: 0 }), env),
                 golem.data);
    // The clamp at :2096-2097 leaves the roll alone, because 26 is below the
    // golem threshold; against 24 it would have cut the gain to zero.
    assert.deepEqual(env.bounds, ['rnd(1)']);
    assert.equal(golem.mhpmax, 26);
});

// makemon.c:2120, `(int) ++mtmp->m_lev >= mons[newtype].mlevel && newtype !=
// oldtype`. C increments in the left conjunct, so the level rises for every
// grower, including one whose species little_to_big() does not map.
test('grow_up raises the level of a species with no bigger form', () => {
    const state = growState();
    // A fox is absent from mondata.c grownups[], so newtype == oldtype and
    // only the increment survives the condition. A threshold of 8 with a
    // maximum of 8: one more point crosses it.
    const fox = grower(state, PM_FOX, { m_lev: 1, mhp: 8, mhpmax: 8 });
    const env = growEnv(state, [1]);
    assert.equal(grow_up(fox, grower(state, PM_JACKAL, { m_lev: 0 }), env),
                 fox.data);
    assert.deepEqual(env.bounds, ['rnd(1)']);
    assert.equal(fox.m_lev, 2);
    assert.equal(fox.data.pmidx, PM_FOX); /* still a fox */
    // C banks the point before it tests the threshold, and its own comment at
    // :2078-2081 calls the resulting gain a possible bug.
    assert.equal(fox.mhpmax, 9);

    // The pet case the fresh differential covers: a little dog at m_lev 1 with
    // its starting maximum of 8. lev_limit is 3 * 2 / 2 = 3, raised to a dog's
    // 4 at :2091-2092 and then to 5 by the arbitrary floor at :2115-2116, so
    // the gain stands; 2 is short of a dog's level, so the form does not
    // change.
    const puppy = grower(state, PM_LITTLE_DOG, { m_lev: 1, mhp: 6, mhpmax: 8 });
    assert.equal(grow_up(puppy, grower(state, PM_SEWER_RAT, { m_lev: 0 }),
                         growEnv(state, [1])), puppy.data);
    assert.equal(puppy.m_lev, 2);
    assert.equal(puppy.mhpmax, 9);
    assert.equal(puppy.mhp, 6);
});

// makemon.c:2121-2163, the form change, and :2099-2106, the `!victim` arm.
// Both are outside this port.
test('grow_up stops at a form change, with the level already raised', () => {
    const state = growState();
    // A little dog at m_lev 3 reaches a dog's level of 4 on the increment, and
    // a dog is its little_to_big() form, so both conjuncts hold. A threshold
    // of 24 with a maximum of 24: one more point crosses it.
    const puppy = grower(state, PM_LITTLE_DOG,
                         { m_lev: 3, mhp: 24, mhpmax: 24 });
    assert.throws(
        () => grow_up(puppy, grower(state, PM_JACKAL, { m_lev: 0 }),
                      growEnv(state, [1])),
        /a monster growing into a bigger form/u,
    );
    // C increments before it tests either conjunct, so the raised level and
    // the banked point both survive the stop.
    assert.equal(puppy.m_lev, 4);
    assert.equal(puppy.mhpmax, 25);

    const potion = growEnv(state);
    assert.throws(
        () => grow_up(grower(state, PM_FOX), null, potion),
        /a monster gaining a level from no victim/u,
    );
    // The stop precedes that arm's own rnd(8).
    assert.deepEqual(potion.bounds, []);
});

// makemon.c:2089-2092, the crude upper limit and the raise that makes room for
// the bigger form, both computed above the early return at :2110-2111.
test('grow_up raises the level limit to reach the bigger form', () => {
    const state = growState();
    // A hell hound pup's species level is 7, so the crude limit is 10; a hell
    // hound is level 12, which raises it to 12. At m_lev 10 the increment
    // lands on 11: inside the raised limit, outside the crude one. A threshold
    // of 80 with a maximum of 80 crosses on one point.
    const pup = grower(state, PM_HELL_HOUND_PUP,
                       { m_lev: 10, mhp: 80, mhpmax: 80 });
    assert.equal(grow_up(pup, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), pup.data);
    // 11 is short of a hell hound's 12, so the form does not change and the
    // sanity check at :2166-2170 leaves both the level and the maximum alone.
    assert.equal(pup.m_lev, 11);
    assert.equal(pup.mhpmax, 81);
    assert.equal(state.mons[PM_HELL_HOUND].mlevel, 12);
});

// makemon.c:2089, `3 * (int) ptr->mlevel / 2`. C truncates the product, so an
// odd species level keeps the extra half-step.
test('grow_up truncates the level limit after tripling, not before', () => {
    const state = growState();
    // A wolf's species level is 5: 3 * 5 / 2 is 7, while halving first gives
    // 6. At m_lev 6 the increment lands on 7, which the correct limit allows
    // and the halved-first one would undo. A threshold of 48 with a maximum
    // of 48 crosses on one point.
    const wolf = grower(state, PM_WOLF, { m_lev: 6, mhp: 48, mhpmax: 48 });
    assert.equal(grow_up(wolf, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), wolf.data);
    assert.equal(wolf.m_lev, 7);
    assert.equal(wolf.mhpmax, 49);
});

// makemon.c:2165-2175, the closing sanity checks.
test('grow_up undoes an increment past the level limit', () => {
    const state = growState();
    // A wolf at m_lev 7 is already at its limit of 7, so the increment to 8 is
    // undone. A threshold of 56 with a maximum of 56 crosses on one point, and
    // that point is exactly hp_threshold + 1, so it is given back as well: the
    // kill leaves the wolf where it started, having spent a draw.
    const wolf = grower(state, PM_WOLF, { m_lev: 7, mhp: 56, mhpmax: 56 });
    const env = growEnv(state, [1]);
    assert.equal(grow_up(wolf, grower(state, PM_JACKAL, { m_lev: 0 }), env),
                 wolf.data);
    assert.deepEqual(env.bounds, ['rnd(1)']);
    assert.equal(wolf.m_lev, 7);
    assert.equal(wolf.mhpmax, 56);
    assert.equal(wolf.mhp, 56);

    // A maximum that is not hp_threshold + 1 is kept when the level is undone:
    // 100 is far past the threshold of 56, so :2096-2097 banks nothing and
    // :2169-2170 gives nothing back.
    const stout = grower(state, PM_WOLF, { m_lev: 7, mhp: 100, mhpmax: 100 });
    assert.equal(grow_up(stout, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), stout.data);
    assert.equal(stout.m_lev, 7);
    assert.equal(stout.mhpmax, 100);

    // 50 * 8 caps the maximum, and the current hit points then follow it down.
    const swollen = grower(state, PM_WOLF, { m_lev: 7, mhp: 500, mhpmax: 500 });
    assert.equal(grow_up(swollen, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), swollen.data);
    assert.equal(swollen.m_lev, 7);
    assert.equal(swollen.mhpmax, 400);
    assert.equal(swollen.mhp, 400);
});

// makemon.c:2113-2118, the three limit clamps between the threshold test and
// the increment.
test('grow_up clamps the level limit for a player monster and a demon lord',
     () => {
    const state = growState();
    // An archeologist's species level is 10, so the crude limit is 15;
    // is_mplayer() replaces it with 30. At m_lev 20 the increment lands on 21,
    // which only the player limit allows. A threshold of 160 with a maximum of
    // 160 crosses on one point.
    const player = grower(state, PM_ARCHEOLOGIST,
                          { m_lev: 20, mhp: 160, mhpmax: 160 });
    assert.equal(grow_up(player, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), player.data);
    assert.equal(player.m_lev, 21);
    assert.equal(player.mhpmax, 161);

    // Juiblex's species level is 50, so the crude limit is 75 and the hard
    // limit at :2117-2118 cuts it to 50 rather than 49. The increment to 51 is
    // therefore undone, and the point that carried it is given back. A
    // threshold of 400 with a maximum of 400 crosses on one point.
    const lord = grower(state, PM_JUIBLEX, { m_lev: 50, mhp: 400, mhpmax: 400 });
    assert.equal(grow_up(lord, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), lord.data);
    assert.equal(lord.m_lev, 50);
    assert.equal(lord.mhpmax, 400);

    // :2118's other arm needs a species level at most 49 whose crude limit is
    // past 49, and mons[] holds none: every entry above 33 is a demon lord at
    // 50 or more. mon.c adj_erinys() (5922-5966) is the one writer that lands
    // in between, `min(7 + u.ualign.abuse, 50)`, so an abuse of 42 makes an
    // erinys level 49. Its crude limit is then 73, cut to 49 and not 50, so
    // the increment to 50 is undone and its point given back.
    state.u.ualign.abuse = 42;
    adj_erinys(42, state);
    assert.equal(state.mons[PM_ERINYS].mlevel, 49);
    const fury = grower(state, PM_ERINYS, { m_lev: 49, mhp: 392, mhpmax: 392 });
    assert.equal(grow_up(fury, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), fury.data);
    assert.equal(fury.m_lev, 49);
    assert.equal(fury.mhpmax, 392);
});

// makemon.c:2062-2067. The comment there says a killer bee "can't grow into
// queen bee by just killing things", which is what the `!victim` conjunct
// enforces: the pair is absent from grownups[], so a kill leaves newtype at
// PM_KILLER_BEE and the queen's level never raises lev_limit.
test('grow_up keeps a killer bee that killed something a killer bee', () => {
    const state = growState();
    // A killer bee's species level is 1, so the crude limit is 1 and the
    // arbitrary floor lifts it to 5. Reading the queen's level of 9 instead
    // would lift it to 9 and let the increment to 6 stand. A threshold of 40
    // with a maximum of 40 crosses on one point.
    const bee = grower(state, PM_KILLER_BEE, { m_lev: 5, mhp: 40, mhpmax: 40 });
    assert.equal(grow_up(bee, grower(state, PM_JACKAL, { m_lev: 0 }),
                         growEnv(state, [1])), bee.data);
    assert.equal(bee.m_lev, 5);
    assert.equal(bee.mhpmax, 40);
    assert.equal(state.mons[PM_QUEEN_BEE].mlevel, 9);
});

// makemon.c:2060-2061. "monster died after killing enemy but before calling
// this function"; mdamagem() reads the answer as the M_ATTK_AGR_DIED bit.
test('grow_up answers nothing for a killer that is already dead', () => {
    const state = growState();
    const dead = grower(state, PM_FOX, { mhp: 0 });
    const env = growEnv(state, [1]);
    assert.equal(grow_up(dead, grower(state, PM_JACKAL, { m_lev: 0 }), env),
                 null);
    assert.deepEqual(env.bounds, []);
    assert.equal(dead.mhpmax, 4);

    // One hit point is alive, so the same killer grows.
    const wounded = grower(state, PM_FOX, { m_lev: 1, mhp: 1, mhpmax: 4 });
    const alive = growEnv(state, [1]);
    assert.equal(
        grow_up(wounded, grower(state, PM_JACKAL, { m_lev: 0 }), alive),
        wounded.data,
    );
    assert.deepEqual(alive.bounds, ['rnd(1)']);
    assert.equal(wounded.mhpmax, 5);
});

// ---- mk_gen_ok tests ----
// C ref: makemon.c mk_gen_ok() (1736-1752). Pure filter that checks mvitals
// flags, geno flags, placeholder status, and the mail daemon.

// makemon.c:1741. A normal generatable monster passes all filters.
// PM_KOBOLD (index 59) has geno 0x23 = G_GENO|0x03; no G_NOGEN or G_UNIQ bits,
// not a placeholder, not the mail daemon.
test('mk_gen_ok accepts a normal generatable monster', () => {
    const state = startingState();
    assert.equal(mk_gen_ok(PM_KOBOLD, G_GONE, G_NOGEN | G_UNIQ, state), true);
});

// makemon.c:1740. A genocided monster is rejected by the mvflags mask.
// Setting mvflags to G_GENOD and checking with G_GONE (which includes G_GENOD)
// triggers the first rejection.
test('mk_gen_ok rejects a genocided monster', () => {
    const state = startingState();
    state.mvitals[PM_KOBOLD].mvflags = G_GENOD;
    assert.equal(mk_gen_ok(PM_KOBOLD, G_GONE, G_NOGEN | G_UNIQ, state), false);
    // Zero mvflagsmask ignores the G_GENOD in mvflags.
    assert.equal(mk_gen_ok(PM_KOBOLD, 0, G_NOGEN | G_UNIQ, state), true);
});

// makemon.c:1742. A unique monster's geno field carries G_UNIQ; the genomask
// filter rejects it. PM_WIZARD_OF_YENDOR has geno 0x1200 = G_NOGEN | G_UNIQ.
test('mk_gen_ok rejects a unique monster by genomask', () => {
    const state = startingState();
    assert.equal(
        mk_gen_ok(PM_WIZARD_OF_YENDOR, G_GONE, G_NOGEN | G_UNIQ, state),
        false,
    );
    // With genomask 0, the geno check passes; the wizard is not a placeholder
    // or the mail daemon, so it passes.
    assert.equal(mk_gen_ok(PM_WIZARD_OF_YENDOR, 0, 0, state), true);
});

// makemon.c:1744. The four placeholder species (orc, giant, elf, human) are
// rejected unconditionally, even with zero masks.
test('mk_gen_ok rejects every placeholder species', () => {
    const state = startingState();
    for (const pm of [PM_ORC, PM_GIANT, PM_ELF, PM_HUMAN]) {
        assert.equal(mk_gen_ok(pm, 0, 0, state), false,
            `placeholder pm=${pm} should be rejected`);
    }
});

// makemon.c:1748 (MAIL_STRUCTURES). The mail daemon is rejected
// unconditionally, even with zero masks.
test('mk_gen_ok rejects the mail daemon', () => {
    const state = startingState();
    assert.equal(mk_gen_ok(PM_MAIL_DAEMON, 0, 0, state), false);
});

// ---- init_mongen_order tests ----
// C ref: makemon.c init_mongen_order() (1807-1828). Sorts mongen_order by
// (mlet << 8 | difficulty) within the first SPECIAL_PM entries; entries at
// SPECIAL_PM and above retain their identity positions.

// The sort groups monsters by class (mlet) and orders them by ascending
// difficulty within each class. Within equal difficulty, the stable sort
// preserves the original mons[] index order. C values read from the source
// monst.c and verified against the patched build's dump_mongen output.
test('init_mongen_order sorts the S_ANT class by ascending difficulty', () => {
    const state = startingState();
    init_mongen_order(state);
    const order = state._mongen_order;
    // S_ANT (mlet=1) occupies positions 0-5 in the sorted order.
    // C monst.c: giant ant diff=4, killer bee diff=6, soldier ant diff=7,
    // fire ant diff=6, giant beetle diff=6, queen bee diff=12.
    // Sorted by difficulty, with stable order for ties (indices 1,3,4 all diff=6):
    //   giant ant(0), killer bee(1), fire ant(3), giant beetle(4),
    //   soldier ant(2), queen bee(5).
    assert.deepEqual(order.slice(0, 6), [0, 1, 3, 4, 2, 5]);
});

// Entries at and after SPECIAL_PM remain identity-mapped because qsort
// only covers the first SPECIAL_PM entries.
test('init_mongen_order leaves entries at SPECIAL_PM and above unchanged', () => {
    const state = startingState();
    init_mongen_order(state);
    const order = state._mongen_order;
    for (let i = SPECIAL_PM; i < NUMMONS; i++) {
        assert.equal(order[i], i,
            `mongen_order[${i}] should be identity (${i}), got ${order[i]}`);
    }
});

// mclass_maxf records the highest G_FREQ value across all NUMMONS entries
// for each monster class (mlet). C ref: makemon.c:1818-1819.
test('init_mongen_order computes mclass_maxf from mons geno frequencies', () => {
    const state = startingState();
    init_mongen_order(state);
    const maxf = state._mclass_maxf;
    // Verify mclass_maxf[mlet] matches the manual max of (geno & G_FREQ) over
    // all mons with that mlet, scanning LOW_PM..NUMMONS-1 as the C does.
    for (let mlet = 0; mlet < maxf.length; mlet++) {
        let expected = 0;
        for (let i = LOW_PM; i < NUMMONS; i++) {
            if (state.mons[i].mlet === mlet) {
                const freq = state.mons[i].geno & G_FREQ;
                if (freq > expected) expected = freq;
            }
        }
        assert.equal(maxf[mlet], expected,
            `mclass_maxf[${mlet}] should be ${expected}, got ${maxf[mlet]}`);
    }
});

// init_mongen_order is idempotent: calling it twice returns immediately on
// the second call without changing the cached arrays.
test('init_mongen_order is idempotent', () => {
    const state = startingState();
    init_mongen_order(state);
    const firstOrder = state._mongen_order;
    const firstMaxf = state._mclass_maxf;
    init_mongen_order(state);
    // Same array references, not new copies.
    assert.equal(state._mongen_order, firstOrder);
    assert.equal(state._mclass_maxf, firstMaxf);
});

// mkclass_aligned with A_LAWFUL filters out chaotic and neutral demons,
// consuming rn2(9) only for the lawful candidates. The mongen_order for
// S_DEMON contains three generatable lawful demons (mndx 291, 292, 293 with
// freq 2 each) and four lawful uniques (mndx 306-309, G_NOGEN|G_UNIQ,
// rejected by mk_gen_ok). With rn2(9)=0 for all seven, the hell-restriction
// mask is not added, letting the G_HELL demons pass. Each gets nums = 3
// (freq 2 + 1 - 0, since adj_lev << ulevel*2 at hero level 30). Total
// weight is 9; rnd(9)=4 lands in mndx 292's interval.
test('mkclass_aligned filters demons by alignment sign', () => {
    const state = startingState();
    state.u.ulevel = 30;
    state.u.uz = { dnum: 0, dlevel: 30 };
    state.dungeons[0].num_dunlevs = 50;
    const rng = scriptedRandom([
        // rn2(9) for each lawful-aligned demon reached in mongen_order:
        // 3 generatable (mndx 291, 292, 293) + 4 unique (mndx 306-309)
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        // rnd(9) selection draw; 4 lands in mndx 292's interval [4,6]
        { kind: 'rnd', bound: 9, result: 4 },
    ]);

    const result = mkclass_aligned(S_DEMON, 0, A_LAWFUL,
        { state, random: rng.random });
    assert.equal(result.pmidx, 292,
        'should select the second lawful demon (mndx 292)');
    rng.assertExhausted();
});

// mkclass_aligned with A_NONE is equivalent to mkclass: both exercise the
// same code path without the alignment filter.
test('mkclass_aligned with A_NONE matches mkclass', () => {
    const state = startingState();
    // Use S_ANT so the existing mkclass test's RNG sequence applies.
    const steps = [
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 2, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 9, result: 0 },
        { bound: 2, result: 0 },
        { bound: 9, result: 0 },
        { kind: 'rnd', bound: 15, result: 8 },
    ];
    const rng1 = scriptedRandom([...steps]);
    const rng2 = scriptedRandom([...steps]);

    const a = mkclass(S_ANT, 0, { state, random: rng1.random });
    const b = mkclass_aligned(S_ANT, 0, A_NONE, { state, random: rng2.random });
    assert.equal(a.pmidx, b.pmidx,
        'mkclass and mkclass_aligned(A_NONE) should select the same monster');
    rng1.assertExhausted();
    rng2.assertExhausted();
});

// mkclass_poly iterates raw mons[] order (not mongen_order), excludes
// difficulty considerations, uses G_GENOD (not G_GONE) for mvflags, and
// returns a monster index (not a permonst pointer). For S_ANT, ants 0-4
// pass mk_gen_ok (mndx 5 has G_NOGEN); total freq = 3+2+2+1+3 = 11.
// rnd(11)=6 walks: 6-3=3 (mndx 0), 3-2=1 (mndx 1), 1-2=-1 (mndx 2,
// loop exits), first-- yields mndx 2.
test('mkclass_poly selects from raw mons order and returns an index', () => {
    const state = startingState();
    const rng = scriptedRandom([
        // rn2(9) for the hell-mask decision (once at the top)
        { bound: 9, result: 1 },
        // rnd(11) selection draw
        { kind: 'rnd', bound: 11, result: 6 },
    ]);

    const result = mkclass_poly(S_ANT, { state, random: rng.random });
    // mkclass_poly returns a monster index, not a permonst pointer.
    assert.equal(typeof result, 'number');
    assert.equal(result, 2,
        'rnd(11)=6 should land on mndx 2 (the third ant in raw order)');
    rng.assertExhausted();
});

// mkclass_poly returns NON_PM when the class has no eligible monster (all
// rejected by mk_gen_ok). Genocide all ants; then every ant fails the
// G_GENOD mvflags check, yielding num=0 and NON_PM.
test('mkclass_poly returns NON_PM for an empty class', () => {
    const state = startingState();
    // Genocide all ants (mndx 0-5)
    for (let i = 0; i <= 5; i++)
        state.mvitals[i].mvflags |= G_GENOD;
    const rng = scriptedRandom([
        // rn2(9) for the hell-mask decision
        { bound: 9, result: 1 },
    ]);
    const result = mkclass_poly(S_ANT, { state, random: rng.random });
    assert.equal(result, NON_PM);
    rng.assertExhausted();
});

// --- newmcorpsenm ---
// C ref: makemon.c newmcorpsenm() (2370-2376). Pure allocation helper that
// ensures mextra exists and sets mcorpsenm to NON_PM.

// When mextra is absent, newmcorpsenm allocates it and writes NON_PM into
// the mcorpsenm field. The C function calls newmextra() which initializes
// the struct with mcorpsenm = NON_PM.
test('newmcorpsenm allocates mextra and sets mcorpsenm to NON_PM', () => {
    const mtmp = {};
    newmcorpsenm(mtmp);
    assert.ok(mtmp.mextra, 'mextra should be allocated');
    assert.equal(mtmp.mextra.mcorpsenm, NON_PM,
        'mcorpsenm should be NON_PM after newmcorpsenm');
});

// When mextra already exists, newmcorpsenm preserves it and overwrites
// mcorpsenm. The C guard `if (!mtmp->mextra)` skips allocation when the
// struct is present.
test('newmcorpsenm preserves existing mextra and resets mcorpsenm', () => {
    const mtmp = { mextra: { mcorpsenm: 42, epri: { shralign: 1 } } };
    newmcorpsenm(mtmp);
    assert.equal(mtmp.mextra.mcorpsenm, NON_PM,
        'mcorpsenm should be reset to NON_PM');
    assert.deepEqual(mtmp.mextra.epri, { shralign: 1 },
        'existing mextra fields should be preserved');
});

// --- align_shift tests ---
// C ref: makemon.c align_shift(). ALIGNWEIGHT is 4 (global.h:411).
// The function returns a generation-weight bonus based on the level's
// alignment and the monster's maligntyp.

// AM_LAWFUL formula: (maligntyp + 20) / (2 * 4) = (maligntyp + 20) / 8.
// A strongly lawful monster (maligntyp = 10) on a lawful level gets
// (10 + 20) / 8 = 3. A chaotic monster (maligntyp = -10) gets
// (-10 + 20) / 8 = 1. Integer truncation applies.
test('align_shift on a lawful level favors lawful monsters', () => {
    const state = startingState();
    state.dungeons[0].flags.align = AM_LAWFUL;
    // maligntyp 10 (lawful): (10 + 20) / 8 = 3
    assert.equal(align_shift({ maligntyp: 10 }, state), 3);
    // maligntyp -10 (chaotic): (-10 + 20) / 8 = 1
    assert.equal(align_shift({ maligntyp: -10 }, state), 1);
    // maligntyp 0 (neutral): (0 + 20) / 8 = 2
    assert.equal(align_shift({ maligntyp: 0 }, state), 2);
});

// AM_NEUTRAL formula: (20 - abs(maligntyp)) / 4.
// A neutral monster (maligntyp = 0) on a neutral level gets 20 / 4 = 5.
// A lawful or chaotic monster (maligntyp = +/-10) gets (20 - 10) / 4 = 2.
test('align_shift on a neutral level favors neutral monsters', () => {
    const state = startingState();
    state.dungeons[0].flags.align = AM_NEUTRAL;
    // maligntyp 0 (neutral): (20 - 0) / 4 = 5
    assert.equal(align_shift({ maligntyp: 0 }, state), 5);
    // maligntyp 10 (lawful): (20 - 10) / 4 = 2
    assert.equal(align_shift({ maligntyp: 10 }, state), 2);
    // maligntyp -10 (chaotic): (20 - 10) / 4 = 2
    assert.equal(align_shift({ maligntyp: -10 }, state), 2);
});

// AM_CHAOTIC formula: (-(maligntyp - 20)) / (2 * 4) = (20 - maligntyp) / 8.
// A strongly chaotic monster (maligntyp = -10) on a chaotic level gets
// (20 - (-10)) / 8 = 3. A lawful monster (maligntyp = 10) gets
// (20 - 10) / 8 = 1.
test('align_shift on a chaotic level favors chaotic monsters', () => {
    const state = startingState();
    state.dungeons[0].flags.align = AM_CHAOTIC;
    // maligntyp -10 (chaotic): (20 + 10) / 8 = 3
    assert.equal(align_shift({ maligntyp: -10 }, state), 3);
    // maligntyp 10 (lawful): (20 - 10) / 8 = 1
    assert.equal(align_shift({ maligntyp: 10 }, state), 1);
    // maligntyp 0 (neutral): 20 / 8 = 2
    assert.equal(align_shift({ maligntyp: 0 }, state), 2);
});

// AM_NONE (default case): always returns 0 regardless of the monster's
// alignment.
test('align_shift on an unaligned level returns zero', () => {
    const state = startingState();
    state.dungeons[0].flags.align = AM_NONE;
    assert.equal(align_shift({ maligntyp: 10 }, state), 0);
    assert.equal(align_shift({ maligntyp: -10 }, state), 0);
    assert.equal(align_shift({ maligntyp: 0 }, state), 0);
});

// C keeps `oldmoves` and `lev` as function statics (makemon.c:1611-1626) and
// redoes the Is_special(&u.uz) lookup only when svm.moves has changed since
// the previous call, so every call within one turn reuses the level the
// turn's first call found. A level change that takes no time, such as the
// wizard-mode ^V teleport (wizcmds.c wiz_level_tele() returns ECMD_OK, and
// allmain.c:539 runs deferred_goto() in the same moveloop_core() pass), then
// weights the new level's monsters by the old level's alignment.
test('align_shift keeps the turn\'s first special level across a level change', () => {
    const state = startingState();
    // Turn 5 starts on a chaotic special level while the dungeon is lawful.
    state.specialLevels.push({
        dlevel: { dnum: 0, dlevel: 1 },
        flags: { align: AM_CHAOTIC },
    });
    state.dungeons[0].flags.align = AM_LAWFUL;
    state.moves = 5;
    // maligntyp -10 on a chaotic level: (20 + 10) / 8 = 3.
    assert.equal(align_shift({ maligntyp: -10 }, state), 3);
    // An ordinary level of the lawful dungeon, reached in the same turn, still
    // uses the chaotic level; the lawful figure would be (-10 + 20) / 8 = 1.
    state.u.uz = { dnum: 0, dlevel: 2 };
    assert.equal(align_shift({ maligntyp: -10 }, state), 3);
    // The next turn looks the level up again.
    state.moves = 6;
    assert.equal(align_shift({ maligntyp: -10 }, state), 1);
});

// The other direction of the same static: a turn whose first call found no
// special level reads the current dungeon's alignment on every later call,
// even after a level change onto a special level with its own alignment.
// Only `lev` is cached; svd.dungeons[u.uz.dnum].flags.align is read live.
test('align_shift ignores a special level reached after the turn\'s first lookup', () => {
    const state = startingState();
    state.dungeons.push({
        depth_start: 21,
        dunlev_ureached: 1,
        entry_lev: 1,
        flags: { align: AM_NEUTRAL, hellish: false },
        num_dunlevs: 4,
    });
    state.moves = 1;
    // Dungeon zero, ordinary level: unaligned, so 0.
    assert.equal(align_shift({ maligntyp: 0 }, state), 0);
    // Same turn, onto a chaotic special level of the neutral dungeon: the
    // stale null `lev` makes C read the dungeon's alignment, (20 - 0) / 4 = 5,
    // rather than the level's (20 - 0) / 8 = 2.
    state.specialLevels.push({
        dlevel: { dnum: 1, dlevel: 1 },
        flags: { align: AM_CHAOTIC },
    });
    state.u.uz = { dnum: 1, dlevel: 1 };
    assert.equal(align_shift({ maligntyp: 0 }, state), 5);
    state.moves = 2;
    assert.equal(align_shift({ maligntyp: 0 }, state), 2);
});

// `oldmoves` and `lev` start at 0 and NULL. allmain.c newgame() calls mklev()
// before u_init_role() sets svm.moves to 1 (u_init.c:645, "initialize moves
// to 0 instead of 1, then set it to 1 here"), so the calls made while
// creating the first level find oldmoves == moves and keep the NULL `lev`
// even on a special level, such as the tutorial. The first lookup happens at
// the first call with a nonzero `moves`.
test('align_shift makes no lookup while moves is still zero', () => {
    const state = startingState();
    state.specialLevels.push({
        dlevel: { dnum: 0, dlevel: 1 },
        flags: { align: AM_NEUTRAL },
    });
    state.moves = 0;
    // The NULL `lev` reads the unaligned dungeon: 0, not the level's 5.
    assert.equal(align_shift({ maligntyp: 0 }, state), 0);
    state.moves = 1;
    // maligntyp 0 on a neutral level: (20 - 0) / 4 = 5.
    assert.equal(align_shift({ maligntyp: 0 }, state), 5);
});

// The statics live on the game state, which resetGame() replaces for each
// segment, so a second state starts with them at their initial values like a
// fresh C process rather than inheriting the first state's level.
test('align_shift keeps its statics on the game state', () => {
    const first = startingState();
    first.specialLevels.push({
        dlevel: { dnum: 0, dlevel: 1 },
        flags: { align: AM_NEUTRAL },
    });
    first.moves = 1;
    assert.equal(align_shift({ maligntyp: 0 }, first), 5);

    const second = startingState();
    second.dungeons[0].flags.align = AM_LAWFUL;
    second.moves = 1;
    // maligntyp 0 on a lawful level: (0 + 20) / 8 = 2, not the first state's 5.
    assert.equal(align_shift({ maligntyp: 0 }, second), 2);
});

// --- temperature_shift tests ---
// C ref: makemon.c temperature_shift(). Returns 3 when the monster resists the
// level's temperature element, 0 otherwise.

// A hot level (temperature > 0) checks MR_FIRE. PM_FIRE_ANT resists fire.
test('temperature_shift returns 3 for a fire-resistant monster on a hot level', () => {
    const state = startingState();
    state.level.flags.temperature = 1;
    // PM_FIRE_ANT has MR_FIRE in its mresists
    assert.equal(temperature_shift(state.mons[PM_FIRE_ANT], state), 3);
});

// A cold level (temperature < 0) checks MR_COLD. PM_FOX has no cold resistance.
test('temperature_shift returns 0 for a non-cold-resistant monster on a cold level', () => {
    const state = startingState();
    state.level.flags.temperature = -1;
    assert.equal(temperature_shift(state.mons[PM_FOX], state), 0);
});

// Zero temperature means no bonus for any monster.
test('temperature_shift returns 0 on a temperate level', () => {
    const state = startingState();
    state.level.flags.temperature = 0;
    assert.equal(temperature_shift(state.mons[PM_FIRE_ANT], state), 0);
});

// --- init_mextra / newmextra tests ---
// C ref: makemon.c init_mextra(). Initializes mcorpsenm to NON_PM; in C the
// rest of the struct is zeroed by zeromextra. In JS the empty object literal
// serves the same purpose.
test('init_mextra sets mcorpsenm to NON_PM on the given object', () => {
    const mex = {};
    init_mextra(mex);
    assert.equal(mex.mcorpsenm, NON_PM,
        'mcorpsenm should be NON_PM after init_mextra');
});

// C ref: makemon.c newmextra(). Allocates a new mextra record and initializes
// it via init_mextra().
test('newmextra returns an object with mcorpsenm set to NON_PM', () => {
    const mex = newmextra();
    assert.ok(mex, 'newmextra should return a truthy object');
    assert.equal(mex.mcorpsenm, NON_PM,
        'mcorpsenm should be NON_PM in a fresh mextra');
});
