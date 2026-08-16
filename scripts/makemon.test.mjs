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
    grow_up,
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

test('monster selection fails closed without initialized source catalogs', () => {
    assert.throws(
        () => rndmonst({ state: { u: { uz: { dnum: 0, dlevel: 1 } } } }),
        /monst_globals_init/u,
    );
});

// makemon.c grow_up() (2049-2100), the arm mhitm.c mdamagem() reaches on every
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

// makemon.c:2085-2090, the hit-point threshold, and :2096-2097, the clamp that
// keeps the new maximum one point above it. C's own comment at :2092-2093 says
// the limit sits "at the bottom of the next level rather than the top", so a
// clamped gain always crosses the threshold and the level gain below it is
// where the clamped value can be read.
test('grow_up clamps the gain to one point past the level ceiling', () => {
    const state = growState();
    // A level-zero monster uses the fixed threshold of 4 rather than
    // `m_lev * 8`, so a roll of 8 against a maximum of 4 is cut to 1.
    const cub = grower(state, PM_FOX, { m_lev: 0, mhp: 2, mhpmax: 4 });
    const env = growEnv(state, [8]);
    assert.throws(
        () => grow_up(cub, grower(state, PM_FIRE_ANT, { m_lev: 7 }), env),
        /a monster gaining a level/u,
    );
    // The clamped max_increase is 1, not the 8 the die returned, and it is
    // not greater than 1, so no rn2() follows it.
    assert.deepEqual(env.bounds, ['rnd(8)']);
    assert.equal(cub.mhpmax, 5);
    assert.equal(cub.mhp, 2);

    // A maximum already past the ceiling clamps to zero rather than going
    // negative, so the maximum does not move at all.
    const swollen = grower(state, PM_FOX, { m_lev: 0, mhp: 9, mhpmax: 9 });
    assert.throws(
        () => grow_up(swollen, grower(state, PM_JACKAL, { m_lev: 0 }),
                      growEnv(state, [1])),
        /a monster gaining a level/u,
    );
    assert.equal(swollen.mhpmax, 9);

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

// makemon.c:2101 onwards, the level gain, and :2103-2110, the `!victim` arm
// that always reaches it. Both are outside this port.
test('grow_up stops at a level gain and at a victimless one', () => {
    const state = growState();
    const dog = grower(state, PM_FOX, { m_lev: 1, mhp: 8, mhpmax: 8 });
    // A threshold of 8 with a maximum of 8: one more point crosses it.
    assert.throws(
        () => grow_up(dog, grower(state, PM_JACKAL, { m_lev: 0 }),
                      growEnv(state, [1])),
        /a monster gaining a level/u,
    );
    // C banks the point before it tests the threshold, and its own comment at
    // :2078-2081 calls that a possible bug; the write therefore survives the
    // stop.
    assert.equal(dog.mhpmax, 9);

    const potion = growEnv(state);
    assert.throws(
        () => grow_up(grower(state, PM_FOX), null, potion),
        /a monster gaining a level from no victim/u,
    );
    // The stop precedes that arm's own rnd(8).
    assert.deepEqual(potion.bounds, []);
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
