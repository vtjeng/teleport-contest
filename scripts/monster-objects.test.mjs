import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORPSTAT_FEMALE,
    CORPSTAT_MALE,
    HATCH_EGG,
    MAX_EGG_HATCH_TIME,
    NON_PM,
    ROT_AGE,
    ROT_CORPSE,
    TIMER_OBJECT,
} from '../js/const.js';
import { init_objects } from '../js/o_init.js';
import {
    mksobj,
    newObject,
    set_corpsenm,
} from '../js/obj.js';
import {
    G_NOCORPSE,
    PM_HUMAN,
    PM_JACKAL,
    PM_KILLER_BEE,
    PM_NEWT,
    S_ANT,
    monst_globals_init,
    reset_mvitals,
} from '../js/monsters.js';
import {
    CORPSE,
    EGG,
    TIN,
    objects_globals_init,
} from '../js/objects.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

// At ordinary dungeon depth 1 and hero level 1, rndmonnum() visits these
// cumulative reservoir weights in mons[] order. Returning bound - 1 retains
// the first viable species (jackal); returning zero selects the last (newt).
const DEPTH_ONE_RESERVOIR_BOUNDS = [3, 4, 5, 7, 8, 11, 15, 16, 21];

// mkobj.c deliberately uses different retry caps for corpses and for eggs or
// tins. Exact exhaustion matters because every attempt advances the PRNG.
const CORPSE_ATTEMPT_LIMIT = 50;
const MONSTER_FOOD_ATTEMPT_LIMIT = 200;

// eat.c has fifteen non-sentinel tin descriptions; index zero is rotten.
const TIN_VARIETY_COUNT = 15;

function call(name, args, result) {
    return { name, args, result };
}

function scriptedRandom(script) {
    const pending = [...script];

    function draw(name, args) {
        const expected = pending.shift();
        assert.ok(expected, `unexpected ${name}(${args.join(', ')})`);
        assert.equal(name, expected.name, 'random function order');
        assert.deepEqual(args, expected.args, `${name} arguments`);

        const result = expected.result;
        assert.ok(Number.isInteger(result), `${name} result must be an integer`);
        if (name === 'rn2') {
            assert.ok(result >= 0 && result < args[0], 'rn2 result range');
        } else if (name === 'rnd') {
            assert.ok(result >= 1 && result <= args[0], 'rnd result range');
        } else if (name === 'rn1') {
            assert.ok(
                result >= args[1] && result < args[1] + args[0],
                'rn1 result range',
            );
        } else {
            assert.ok(result >= 1, `${name} result range`);
        }
        return result;
    }

    return {
        random: {
            rn2: (...args) => draw('rn2', args),
            rnd: (...args) => draw('rnd', args),
            rn1: (...args) => draw('rn1', args),
            rne: (...args) => draw('rne', args),
            rnz: (...args) => draw('rnz', args),
        },
        assertExhausted() {
            assert.deepEqual(pending, [], 'all scripted random calls consumed');
        },
    };
}

function retainFirstMonsterDraws() {
    return DEPTH_ONE_RESERVOIR_BOUNDS.map(
        (bound) => call('rn2', [bound], bound - 1),
    );
}

function selectLastMonsterDraws() {
    return DEPTH_ONE_RESERVOIR_BOUNDS.map(
        (bound) => call('rn2', [bound], 0),
    );
}

function repeatedDraws(count, factory) {
    const draws = [];
    for (let attempt = 0; attempt < count; ++attempt)
        draws.push(...factory());
    return draws;
}

function objectMonsterState() {
    const state = {
        astral_level: { dnum: 0, dlevel: 0 },
        branches: [],
        context: { ident: 2 },
        dungeons: [{
            depth_start: 1,
            dunlev_ureached: 1,
            entry_lev: 1,
            flags: { align: 0, hellish: false },
            num_dunlevs: 20,
        }],
        flags: {},
        gz: { zombify: false },
        level: { flags: { temperature: 0 } },
        moves: 1,
        quest_dnum: 1,
        rogue_level: { dnum: 0, dlevel: 0 },
        sanctum_level: { dnum: 0, dlevel: 0 },
        specialLevels: [],
        u: {
            uhave: { amulet: 0 },
            ulevel: 1,
            uz: { dnum: 0, dlevel: 1 },
        },
        urole: { mnum: PM_HUMAN },
    };
    objects_globals_init(state);
    init_objects(state, () => 0);
    monst_globals_init(state);
    reset_mvitals(state);
    timeout_globals_init(state);
    return state;
}

function idDraw() {
    // next_ident() starts this fixture at id 2 and advances it by rnd(2).
    return call('rnd', [2], 1);
}

test('ordinary corpse preserves species, sex, and rot-timer RNG order', () => {
    const state = objectMonsterState();
    const rng = scriptedRandom([
        idDraw(),
        ...retainFirstMonsterDraws(),
        // Variable-sex corpses use nonzero for female.
        call('rn2', [2], 1),
        // A result three above the ordinary rot adjustment delays rot by 3.
        call('rnz', [10], 13),
    ]);

    const corpse = mksobj(CORPSE, true, false, {
        state,
        random: rng.random,
    });

    assert.equal(corpse.corpsenm, PM_JACKAL);
    assert.equal(corpse.spe, CORPSTAT_FEMALE);
    assert.equal(corpse.quan, 1);
    assert.equal(corpse.owt, state.mons[PM_JACKAL].cwt);
    assert.equal(corpse.timed, 1);
    assert.equal(
        peek_timer(ROT_CORPSE, corpse, state),
        state.moves + ROT_AGE + 3,
    );
    rng.assertExhausted();
});

test('corpse retries G_NOCORPSE exactly fifty times before human fallback', () => {
    const state = objectMonsterState();
    state.mvitals[PM_JACKAL].mvflags |= G_NOCORPSE;
    const rng = scriptedRandom([
        idDraw(),
        ...repeatedDraws(CORPSE_ATTEMPT_LIMIT, retainFirstMonsterDraws),
        // The human fallback has variable sex; zero selects male.
        call('rn2', [2], 0),
        call('rnz', [10], 10),
    ]);

    const corpse = mksobj(CORPSE, true, false, {
        state,
        random: rng.random,
    });

    assert.equal(corpse.corpsenm, PM_HUMAN);
    assert.equal(corpse.spe, CORPSTAT_MALE);
    assert.equal(corpse.owt, state.mons[PM_HUMAN].cwt);
    assert.equal(corpse.timed, 1);
    rng.assertExhausted();
});

test('egg exhausts two hundred non-hatchable choices before stacking', () => {
    const state = objectMonsterState();
    const rng = scriptedRandom([
        idDraw(),
        // Zero enters the optional typed-egg search.
        call('rn2', [3], 0),
        ...repeatedDraws(
            MONSTER_FOOD_ATTEMPT_LIMIT,
            selectLastMonsterDraws,
        ),
        // Generic eggs still reach the common food quantity draw.
        call('rn2', [6], 0),
    ]);

    const egg = mksobj(EGG, true, false, {
        state,
        random: rng.random,
    });

    assert.equal(egg.corpsenm, NON_PM);
    assert.equal(egg.quan, 2);
    assert.equal(egg.owt, 2 * state.objects[EGG].oc_weight);
    assert.equal(egg.timed, 0);
    rng.assertExhausted();
});

test('typed egg schedules hatching after its common quantity draw', () => {
    const state = objectMonsterState();
    state.quest_dnum = state.u.uz.dnum;
    state.urole = {
        ...state.urole,
        enemy1num: PM_KILLER_BEE,
        enemy1sym: S_ANT,
        enemy2num: PM_KILLER_BEE,
        enemy2sym: S_ANT,
    };
    const firstHatchAge = MAX_EGG_HATCH_TIME - 50 + 1;
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [3], 0),
        // Nonzero takes the quest-monster path in rndmonst_adj().
        call('rn2', [7], 1),
        // qt_montype() chooses enemy1, then accepts its fixed species.
        call('rn2', [5], 1),
        call('rn2', [5], 1),
        // Keep one egg; hatch-time draws must occur only after this draw.
        call('rn2', [6], 1),
        // attach_egg_hatch_timeout() accepts the first result above 150.
        call('rnd', [firstHatchAge], 150),
        call('rnd', [firstHatchAge + 1], 151),
    ]);

    const egg = mksobj(EGG, true, false, {
        state,
        random: rng.random,
    });

    assert.equal(egg.corpsenm, PM_KILLER_BEE);
    assert.equal(egg.quan, 1);
    assert.equal(egg.timed, 1);
    assert.equal(
        peek_timer(HATCH_EGG, egg, state),
        state.moves + firstHatchAge + 1,
    );
    rng.assertExhausted();
});

test('meat tin selects variety and BUC before its quantity draw', () => {
    const state = objectMonsterState();
    const rng = scriptedRandom([
        idDraw(),
        // Nonzero chooses a monster tin rather than spinach.
        call('rn2', [6], 1),
        ...retainFirstMonsterDraws(),
        // Tin variety zero is rotten, represented in spe as -1.
        call('rn2', [TIN_VARIETY_COUNT], 0),
        // blessorcurse() succeeds, then nonzero selects blessed.
        call('rn2', [10], 0),
        call('rn2', [2], 1),
        // The common food draw runs last and doubles the stack.
        call('rn2', [6], 0),
    ]);

    const tin = mksobj(TIN, true, false, {
        state,
        random: rng.random,
    });

    assert.equal(tin.corpsenm, PM_JACKAL);
    assert.equal(tin.spe, -1);
    assert.equal(tin.blessed, true);
    assert.equal(tin.cursed, false);
    assert.equal(tin.quan, 2);
    assert.equal(tin.owt, 2 * state.objects[TIN].oc_weight);
    assert.equal(tin.timed, 0);
    rng.assertExhausted();
});

test('tin keeps NON_PM after exactly two hundred rejected meat choices', () => {
    const state = objectMonsterState();
    state.mvitals[PM_JACKAL].mvflags |= G_NOCORPSE;
    const rng = scriptedRandom([
        idDraw(),
        call('rn2', [6], 1),
        ...repeatedDraws(
            MONSTER_FOOD_ATTEMPT_LIMIT,
            retainFirstMonsterDraws,
        ),
        // Failed BUC and quantity draws keep a neutral singleton tin.
        call('rn2', [10], 1),
        call('rn2', [6], 1),
    ]);

    const tin = mksobj(TIN, true, false, {
        state,
        random: rng.random,
    });

    assert.equal(tin.corpsenm, NON_PM);
    assert.equal(tin.spe, 0);
    assert.equal(tin.blessed, false);
    assert.equal(tin.cursed, false);
    assert.equal(tin.quan, 1);
    assert.equal(tin.timed, 0);
    rng.assertExhausted();
});

test('set_corpsenm preserves an egg timer remaining across elapsed moves', () => {
    const state = objectMonsterState();
    const rng = scriptedRandom([]);
    const egg = newObject({
        age: state.moves,
        corpsenm: PM_KILLER_BEE,
        oclass: state.objects[EGG].oc_class,
        otyp: EGG,
        quan: 1,
    });
    // Seventeen is an arbitrary existing hatch delay; advancing five moves
    // makes this distinguish remaining-delay preservation from a fresh timer.
    const originalDelay = 17;
    const elapsedMoves = 5;
    start_timer(originalDelay, TIMER_OBJECT, HATCH_EGG, egg, state);
    const originalExpiry = state.moves + originalDelay;
    state.moves += elapsedMoves;

    set_corpsenm(egg, PM_KILLER_BEE, {
        state,
        random: rng.random,
    });

    assert.equal(peek_timer(HATCH_EGG, egg, state), originalExpiry);
    assert.equal(egg.timed, 1);
    // The stopped timer used id 1 and its replacement used id 2.
    assert.equal(state.svt.timer_id, 3);
    rng.assertExhausted();
});
