import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CONFLICT,
    I_SPECIAL,
    M_AP_FURNITURE,
    MFAST,
    MON_FLOOR,
    MON_MIGRATING,
    MSLOW,
    NORMAL_SPEED,
    STRAT_WAITFORU,
} from '../js/const.js';
import {
    counter_were,
    curr_mon_load,
    decide_to_shapeshift,
    iter_mons_safe,
    m_carrying,
    mcalcdistress,
    mcalcmove,
    max_mon_load,
    mon_regen,
    movemon,
    movemon_singlemon,
} from '../js/mon.js';
import {
    M1_HIDE,
    M1_REGEN,
    M2_WERE,
    M2_ROCKTHROW,
    M2_STRONG,
    MZ_HUGE,
    PM_HUMAN_WEREWOLF,
    PM_VAMPIRE,
    PM_WEREWOLF,
    S_EEL,
} from '../js/monsters.js';
import { BOULDER, DAGGER, LONG_SWORD } from '../js/objects.js';

function monster(mmove, mspeed = 0) {
    return { data: { mmove }, mspeed };
}

function draws(results) {
    const bounds = [];
    return {
        random(bound) {
            bounds.push(bound);
            assert.ok(results.length, `unexpected rn2(${bound})`);
            return results.shift();
        },
        assertBounds(expected) {
            assert.deepEqual(bounds, expected);
            assert.deepEqual(results, []);
        },
    };
}

function schedulerState(monsters = []) {
    for (let index = 0; index < monsters.length; ++index) {
        monsters[index].mhp ??= 1;
        monsters[index].nmon = monsters[index + 1] ?? null;
    }
    return {
        context: {
            bypasses: false,
            objsplit: { parent_oid: 7, child_oid: 8 },
        },
        gl: { light_base: null },
        iflags: { purge_monsters: 0 },
        level: { monlist: monsters[0] ?? null },
        somebody_can_move: 'unchanged',
        u: { utotype: 0 },
        vision_full_recalc: 0,
    };
}

function schedulerOperations(overrides = {}) {
    return {
        moveSingleMonster: () => false,
        clearBypasses: ({ state }) => {
            state.context.bypasses = false;
        },
        deferredGoto: ({ state }) => {
            state.u.utotype = 0;
        },
        ...overrides,
    };
}

function actionMonster(overrides = {}) {
    return {
        data: { mflags1: 0, mlet: 0 },
        mhp: 5, // Any positive value keeps lifecycle gates on the live path.
        mstate: MON_FLOOR,
        movement: NORMAL_SPEED,
        mx: 4, // Interior coordinates keep distance checks away from edges.
        my: 4,
        mlstmv: 0,
        misc_worn_check: 0,
        mcanmove: true,
        mpeaceful: false,
        mtame: 0,
        m_ap_type: 0,
        mundetected: false,
        mflee: false,
        iswiz: false,
        isgd: false,
        ...overrides,
    };
}

function actionState(subject) {
    const state = schedulerState([subject]);
    state.moves = 10; // One turn after the parked guard test's mlstmv value.
    state.somebody_can_move = false;
    state.u = {
        utotype: 0,
        ux: 10,
        uy: 10,
        uprops: [],
    };
    return state;
}

function actionOperations(overrides = {}) {
    return {
        everyTurnEffect() {},
        visionRecalc() {},
        clearBypasses() {},
        minLiquid: () => false,
        dowear() {},
        restrap: () => false,
        canSeeMonster: () => true,
        hideUnder: () => false,
        canSeeHero: () => false,
        canSeeSquare: () => false,
        fightMonster: () => false,
        moveMonster() {},
        ...overrides,
    };
}

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

test('m_carrying returns the first matching object from the source inventory', () => {
    const firstDagger = { otyp: DAGGER, nobj: null };
    const sword = { otyp: LONG_SWORD, nobj: firstDagger };
    const laterDagger = { otyp: DAGGER, nobj: null };
    firstDagger.nobj = laterDagger;
    const subject = { minvent: sword };

    assert.equal(m_carrying(subject, DAGGER, {}), firstDagger);
    assert.equal(m_carrying(subject, LONG_SWORD, {}), sword);
    assert.equal(m_carrying(subject, BOULDER, {}), null);

    const heroForm = {};
    const heroInventory = { otyp: BOULDER, nobj: null };
    assert.equal(m_carrying(heroForm, BOULDER, {
        youmonst: heroForm,
        invent: heroInventory,
    }), heroInventory);
});

test('curr_mon_load sums inventory weight except rock-thrower boulders', () => {
    const dagger = { otyp: DAGGER, owt: 10, nobj: null };
    const boulder = { otyp: BOULDER, owt: 6000, nobj: dagger };
    const ordinary = { data: { mflags2: 0 }, minvent: boulder };
    const thrower = {
        data: { mflags2: M2_ROCKTHROW },
        minvent: boulder,
    };

    assert.equal(curr_mon_load(ordinary), 6010);
    assert.equal(curr_mon_load(thrower), 10);
    assert.equal(curr_mon_load({ data: {}, minvent: null }), 0);
});

test('max_mon_load preserves source weight, size, and strength scaling', () => {
    const capacity = (cwt, msize, mflags2 = 0) => max_mon_load({
        data: { cwt, msize, mflags2 },
    });

    // Corpseless monsters scale from size, then non-strong species halve it.
    assert.equal(capacity(0, 1), 250);
    assert.equal(capacity(0, MZ_HUGE, M2_STRONG), 2000);

    // Weighted non-strong species scale by body weight and then halve.
    assert.equal(capacity(1000, 2), 344);
    assert.equal(capacity(1, 2), 1);

    // Strong human-weight or lighter species receive the full human limit;
    // heavier strong species scale above it without the non-strong halving.
    assert.equal(capacity(1450, 2, M2_STRONG), 1000);
    assert.equal(capacity(2000, 2, M2_STRONG), 1379);
});

test('mcalcmove preserves the source slow and fast integer formulas', () => {
    const state = { u: {}, context: {} };
    const cases = [
        [monster(1, MSLOW), 1],
        [monster(11, MSLOW), 7],
        [monster(12, MSLOW), 8],
        [monster(24, MSLOW), 12],
        [monster(1, MFAST), 2],
        [monster(11, MFAST), 15],
        [monster(12, MFAST), 16],
        [monster(18), 18],
    ];

    for (const [subject, expected] of cases) {
        assert.equal(
            mcalcmove(subject, false, state, () => {
                assert.fail('speed-only calculation must not draw');
            }),
            expected,
        );
    }
});

test('mcalcmove randomly rounds every moving speed to NORMAL_SPEED', () => {
    for (const [roll, expected] of [[0, 24], [1, 12]]) {
        const script = draws([roll]);
        assert.equal(mcalcmove(monster(13), true, { u: {} }, script.random), expected);
        script.assertBounds([12]);
    }

    // The source still consumes rn2(12) when the remainder is zero.
    const exact = draws([11]);
    assert.equal(mcalcmove(monster(12), true, { u: {} }, exact.random), 12);
    exact.assertBounds([12]);
});

test('mcalcmove rounds the slow or fast adjusted speed', () => {
    const state = { u: {}, context: {} };
    const cases = [
        [monster(11, MSLOW), 6, 12],
        [monster(11, MSLOW), 7, 0],
        [monster(11, MFAST), 2, 24],
        [monster(11, MFAST), 3, 12],
    ];

    for (const [subject, roll, expected] of cases) {
        const script = draws([roll]);
        assert.equal(mcalcmove(subject, true, state, script.random), expected);
        script.assertBounds([12]);
    }
});

test('mcalcmove applies steed gallop before moving-speed rounding', () => {
    const steed = monster(10);
    const state = {
        u: { usteed: steed, ugallop: true },
        context: { mv: 1 },
    };
    const script = draws([0, 3]);

    assert.equal(mcalcmove(steed, true, state, script.random), 24);
    script.assertBounds([2, 12]);

    const other = monster(10);
    const ordinary = draws([9]);
    assert.equal(mcalcmove(other, true, state, ordinary.random), 12);
    ordinary.assertBounds([12]);
});

test('mcalcmove preserves both gallop factors and state gates', () => {
    const steed = monster(10);
    const state = {
        u: { usteed: steed, ugallop: true },
        context: { mv: 1 },
    };
    const fourThirds = draws([1, 1]);
    assert.equal(mcalcmove(steed, true, state, fourThirds.random), 12);
    fourThirds.assertBounds([2, 12]);

    for (const disabled of [
        { u: { usteed: steed, ugallop: false }, context: { mv: 1 } },
        { u: { usteed: steed, ugallop: true }, context: { mv: 0 } },
    ]) {
        const ordinary = draws([9]);
        assert.equal(mcalcmove(steed, true, disabled, ordinary.random), 12);
        ordinary.assertBounds([12]);
    }
});

test('mon_regen heals on cadence or regeneration and advances cooldown', () => {
    const ordinary = {
        data: { mflags1: 0 },
        mhp: 3,
        mhpmax: 5,
        mspec_used: 2,
    };
    mon_regen(ordinary, false, { moves: 19 });
    assert.deepEqual(
        [ordinary.mhp, ordinary.mspec_used],
        [3, 1],
    );
    mon_regen(ordinary, false, { moves: 20 });
    assert.deepEqual(
        [ordinary.mhp, ordinary.mspec_used],
        [4, 0],
    );

    const regenerating = {
        data: { mflags1: M1_REGEN },
        mhp: 2,
        mhpmax: 2,
        mspec_used: 0,
    };
    mon_regen(regenerating, false, { moves: 1 });
    assert.equal(regenerating.mhp, 2);
});

test('mcalcdistress advances ordinary maladies in list order', async () => {
    const second = {
        nmon: null,
        data: { mmove: 12, mflags1: 0, mflags2: 0 },
        cham: -1,
        mhp: 2,
        mhpmax: 4,
        mspec_used: 1,
        mblinded: 1,
        mcansee: false,
        mfrozen: 2,
        mcanmove: false,
        mfleetim: 1,
        mflee: true,
    };
    const first = {
        ...second,
        nmon: second,
        mhp: 1,
        mhpmax: 3,
        mblinded: 2,
        mfrozen: 1,
        mfleetim: 2,
    };
    const state = {
        moves: 20,
        level: { monlist: first },
        vision_full_recalc: 0,
    };
    await mcalcdistress(state);
    assert.deepEqual(
        [first.mhp, first.mspec_used, first.mblinded, first.mcansee,
            first.mfrozen, first.mcanmove, first.mfleetim, first.mflee],
        [2, 0, 1, false, 0, true, 1, true],
    );
    assert.deepEqual(
        [second.mhp, second.mspec_used, second.mblinded, second.mcansee,
            second.mfrozen, second.mcanmove, second.mfleetim, second.mflee],
        [3, 0, 0, true, 1, false, 0, false],
    );
});

test('mcalcdistress preflights rare downstream owners atomically', async () => {
    const ordinary = {
        nmon: null,
        data: { mmove: 12, mflags1: 0, mflags2: 0 },
        cham: -1,
        mhp: 1,
        mhpmax: 2,
        mspec_used: 1,
        mblinded: 1,
        mfrozen: 0,
        mfleetim: 0,
    };
    const were = {
        ...ordinary,
        data: { mmove: 12, mflags1: 0, mflags2: M2_WERE },
    };
    ordinary.nmon = were;
    const state = {
        moves: 20,
        level: { monlist: ordinary },
        vision_full_recalc: 0,
    };
    await assert.rejects(
        () => mcalcdistress(state),
        /requires a wereChange operation/u,
    );
    assert.deepEqual(
        [ordinary.mhp, ordinary.mspec_used, ordinary.mblinded],
        [1, 1, 1],
    );
});

test('waiting vampires skip distress shapechange without a random draw', async () => {
    const noDraw = () => assert.fail('waiting vampire consumed randomness');
    const vampire = {
        cham: PM_VAMPIRE,
        mstrategy: STRAT_WAITFORU,
    };
    assert.equal(await decide_to_shapeshift(vampire, {
        state: { u: { uprops: [] } },
        random: {
            d: noDraw,
            rn1: noDraw,
            rn2: noDraw,
            rnd: noDraw,
            rne: noDraw,
        },
        canSeeMonster: () => false,
        canSpotMonster: () => false,
        message: noDraw,
    }), false);
});

test('counter_were preserves the source human and beast pairing', () => {
    assert.equal(counter_were(PM_WEREWOLF), PM_HUMAN_WEREWOLF);
    assert.equal(counter_were(PM_HUMAN_WEREWOLF), PM_WEREWOLF);
    assert.equal(counter_were(-1), -1);
});

test('iter_mons_safe visits its original identities despite list mutation', async () => {
    const first = { id: 'first' };
    const removed = { id: 'removed' };
    const last = { id: 'last' };
    const inserted = { id: 'inserted' };
    const state = schedulerState([first, removed, last]);
    const visited = [];

    await iter_mons_safe((current) => {
        visited.push(current.id);
        if (current === first) {
            first.nmon = last;
            removed.nmon = null;
            inserted.nmon = state.level.monlist;
            state.level.monlist = inserted;
        }
        return false;
    }, state);

    assert.deepEqual(visited, ['first', 'removed', 'last']);
    assert.equal(state.level.monlist, inserted);
});

test('iter_mons_safe stops when its callback returns true', async () => {
    const state = schedulerState([
        { id: 'first' },
        { id: 'second' },
        { id: 'third' },
    ]);
    const visited = [];

    await iter_mons_safe((current) => {
        visited.push(current.id);
        return current.id === 'second';
    }, state);

    assert.deepEqual(visited, ['first', 'second']);
});

test('movemon_singlemon preserves level-exit, guard, and lifecycle gates', async () => {
    const leaving = actionMonster();
    const leavingState = actionState(leaving);
    leavingState.u.utotype = 1;
    assert.equal(await movemon_singlemon(leaving, { state: leavingState }), true);
    assert.equal(leavingState.somebody_can_move, false);

    const guard = actionMonster({
        isgd: true,
        mx: 0,
        my: 0,
        mlstmv: 9,
    });
    const guardState = actionState(guard);
    const events = [];
    assert.equal(await movemon_singlemon(guard, {
        state: guardState,
        guardMove(current) {
            events.push(`guard:${current.mlstmv}`);
        },
    }), false);
    assert.deepEqual(events, ['guard:9']);
    assert.equal(guard.mlstmv, 10);

    guard.mlstmv = guardState.moves;
    assert.equal(await movemon_singlemon(guard, { state: guardState }), false);
    assert.deepEqual(events, ['guard:9']);

    const dead = actionMonster({ mhp: 0 });
    assert.equal(await movemon_singlemon(dead, {
        state: actionState(dead),
    }), false);
    const migrating = actionMonster({
        isgd: true,
        mx: 0,
        my: 0,
        mstate: MON_MIGRATING,
    });
    assert.equal(await movemon_singlemon(migrating, {
        state: actionState(migrating),
    }), false);
});

test('movemon_singlemon runs every-turn effects before the ration gate', async () => {
    // Eleven movement points are one below the 12-point action threshold.
    const subject = actionMonster({ movement: NORMAL_SPEED - 1 });
    const state = actionState(subject);
    const events = [];

    assert.equal(await movemon_singlemon(subject, {
        state,
        everyTurnEffect() {
            events.push('every');
        },
    }), false);
    assert.deepEqual(events, ['every']);
    assert.equal(subject.movement, NORMAL_SPEED - 1);
});

test('movemon_singlemon preserves active-monster cleanup and move order', async () => {
    // Twenty-four points leave one complete action after the 12-point debit.
    const subject = actionMonster({ movement: 2 * NORMAL_SPEED });
    const state = actionState(subject);
    state.vision_full_recalc = 1;
    state.context.bypasses = true;
    const events = [];
    const operations = actionOperations({
        everyTurnEffect() {
            events.push('every');
        },
        visionRecalc(mode) {
            events.push(`vision:${mode}`);
        },
        clearBypasses({ state: currentState }) {
            events.push('bypasses');
            currentState.context.bypasses = false;
        },
        minLiquid(_monster, { state: currentState }) {
            events.push('liquid');
            assert.equal(currentState.context.bypasses, false);
            assert.deepEqual(currentState.context.objsplit, {
                parent_oid: 0,
                child_oid: 0,
            });
            return false;
        },
        moveMonster(_monster, chug) {
            events.push(`move:${chug}`);
        },
    });

    assert.equal(await movemon_singlemon(subject, {
        state,
        ...operations,
    }), false);
    assert.deepEqual(events, [
        'every',
        'vision:0',
        'bypasses',
        'liquid',
        'move:true',
    ]);
    assert.equal(subject.movement, NORMAL_SPEED);
    assert.equal(state.somebody_can_move, true);
});

test('movemon_singlemon stops after a lethal or relocating liquid effect', async () => {
    const subject = actionMonster();
    const state = actionState(subject);
    state.context.bypasses = true;
    const events = [];

    assert.equal(await movemon_singlemon(subject, {
        state,
        ...actionOperations({
            everyTurnEffect: () => events.push('every'),
            clearBypasses: ({ state: currentState }) => {
                events.push('bypasses');
                currentState.context.bypasses = false;
            },
            minLiquid: () => {
                events.push('liquid');
                return true;
            },
            moveMonster: () => assert.fail('liquid effect ends the action'),
        }),
    }), false);
    assert.deepEqual(events, ['every', 'bypasses', 'liquid']);
    assert.equal(subject.movement, 0);
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 0,
        child_oid: 0,
    });
});

test('movemon_singlemon spends equipment turns at the source distance gate', async () => {
    const equipping = actionMonster({
        // 0x08 is an ordinary retained worn bit beside the I_SPECIAL request.
        misc_worn_check: I_SPECIAL | 0x08,
        mpeaceful: true,
    });
    const state = actionState(equipping);
    const events = [];
    const operations = actionOperations({
        everyTurnEffect: () => events.push('every'),
        minLiquid: () => {
            events.push('liquid');
            return false;
        },
        dowear(current, creation) {
            events.push(`wear:${creation}`);
            // A different ordinary worn bit proves runtime gear changed.
            current.misc_worn_check |= 0x10;
        },
        moveMonster: () => assert.fail('equipping consumes this action'),
    });

    assert.equal(await movemon_singlemon(equipping, {
        state,
        ...operations,
    }), false);
    assert.deepEqual(events, ['every', 'liquid', 'wear:false']);
    assert.equal(Boolean(equipping.misc_worn_check & I_SPECIAL), false);

    const unchanged = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mpeaceful: true,
    });
    const unchangedState = actionState(unchanged);
    let unchangedMoves = 0;
    assert.equal(await movemon_singlemon(unchanged, {
        state: unchangedState,
        ...actionOperations({
            dowear() {},
            moveMonster: () => { ++unchangedMoves; },
        }),
    }), false);
    assert.equal(unchangedMoves, 1);
    assert.equal(unchanged.misc_worn_check, 0x08);

    const closeHostile = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mx: 4,
        my: 4,
    });
    const closeState = actionState(closeHostile);
    closeState.u.ux = 5;
    closeState.u.uy = 4;
    let moved = 0;
    assert.equal(await movemon_singlemon(closeHostile, {
        state: closeState,
        ...actionOperations({
            dowear: () => assert.fail('close hostile retains I_SPECIAL'),
            moveMonster: () => { ++moved; },
        }),
    }), false);
    assert.equal(moved, 1);
    assert.ok(closeHostile.misc_worn_check & I_SPECIAL);
});

test('movemon_singlemon preserves hider and eel re-hiding gates', async () => {
    const hidden = actionMonster({
        data: { mflags1: M1_HIDE, mlet: 0 },
    });
    const hiddenState = actionState(hidden);
    let moves = 0;
    assert.equal(await movemon_singlemon(hidden, {
        state: hiddenState,
        ...actionOperations({
            restrap: () => true,
            moveMonster: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 0);

    hidden.movement = NORMAL_SPEED;
    hidden.m_ap_type = M_AP_FURNITURE;
    assert.equal(await movemon_singlemon(hidden, {
        state: hiddenState,
        ...actionOperations({
            restrap: () => false,
            moveMonster: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 0);

    hidden.movement = NORMAL_SPEED;
    hidden.m_ap_type = 0;
    hidden.mundetected = true;
    assert.equal(await movemon_singlemon(hidden, {
        state: hiddenState,
        ...actionOperations({
            restrap: () => false,
            moveMonster: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 0);

    hidden.movement = NORMAL_SPEED;
    hidden.mundetected = false;
    assert.equal(await movemon_singlemon(hidden, {
        state: hiddenState,
        ...actionOperations({
            restrap: () => false,
            moveMonster: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 1);

    const eel = actionMonster({
        data: { mflags1: 0, mlet: S_EEL },
        mflee: true,
    });
    const eelState = actionState(eel);
    const bounds = [];
    assert.equal(await movemon_singlemon(eel, {
        state: eelState,
        random: {
            rn2(bound) {
                bounds.push(bound);
                return 0;
            },
        },
        ...actionOperations({
            canSeeMonster: () => false,
            hideUnder: () => true,
            moveMonster: () => { ++moves; },
        }),
    }), false);
    assert.deepEqual(bounds, [4]);
    assert.equal(moves, 1);

    eel.movement = NORMAL_SPEED;
    assert.equal(await movemon_singlemon(eel, {
        state: eelState,
        random: { rn2: () => assert.fail('visible eel must not draw') },
        ...actionOperations({
            canSeeMonster: () => true,
            hideUnder: () => assert.fail('visible eel must not re-hide'),
            moveMonster: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 2);
});

test('movemon_singlemon keeps conflict combat as the last pre-move action', async () => {
    const subject = actionMonster({ mx: 4, my: 4 });
    const state = actionState(subject);
    state.u.ux = 5;
    state.u.uy = 4;
    state.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0 };
    const events = [];

    assert.equal(await movemon_singlemon(subject, {
        state,
        ...actionOperations({
            everyTurnEffect: () => events.push('every'),
            minLiquid: () => {
                events.push('liquid');
                return false;
            },
            canSeeHero: () => {
                events.push('hero');
                return true;
            },
            canSeeSquare: () => {
                events.push('square');
                return true;
            },
            fightMonster: () => {
                events.push('fight');
                return true;
            },
            moveMonster: () => assert.fail('successful fight ends the action'),
        }),
    }), false);
    assert.deepEqual(events, ['every', 'liquid', 'hero', 'square', 'fight']);
});

test('movemon_singlemon preflights downstream owners before mutation', async () => {
    const subject = actionMonster();
    const state = actionState(subject);
    const operations = actionOperations();
    delete operations.moveMonster;
    let everyTurnCalls = 0;
    operations.everyTurnEffect = () => { ++everyTurnCalls; };

    await assert.rejects(movemon_singlemon(subject, {
        state,
        ...operations,
    }), /moveMonster/);
    assert.equal(subject.movement, NORMAL_SPEED);
    assert.equal(everyTurnCalls, 0);
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 7,
        child_oid: 8,
    });

    const eel = actionMonster({ data: { mflags1: 0, mlet: S_EEL } });
    const eelState = actionState(eel);
    everyTurnCalls = 0;
    await assert.rejects(movemon_singlemon(eel, {
        state: eelState,
        random: {},
        ...actionOperations({
            everyTurnEffect: () => { ++everyTurnCalls; },
        }),
    }), /requires rn2/);
    assert.equal(eel.movement, NORMAL_SPEED);
    assert.equal(everyTurnCalls, 0);
});

test('movemon preserves scheduler and terminal cleanup order', async () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const third = { id: 'third' };
    const state = schedulerState([first, second, third]);
    const events = [];
    state.context.bypasses = true;
    state.gl.light_base = {};

    const result = await movemon({
        state,
        ...schedulerOperations({
            moveSingleMonster(current, env) {
                events.push(`move:${current.id}:${env.state.somebody_can_move}`);
                if (current === first) env.state.somebody_can_move = true;
                return current === second;
            },
            clearBypasses(env) {
                events.push(`bypass:${env.state.vision_full_recalc}`);
                env.state.context.bypasses = false;
            },
        }),
    });

    assert.equal(result, true);
    assert.deepEqual(events, [
        'move:first:false',
        'move:second:true',
        'bypass:1',
    ]);
    assert.equal(state.context.bypasses, false);
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 0,
        child_oid: 0,
    });
    assert.equal(state.level.monlist, first);
});

test('movemon completes cleanup before a deferred level change', async () => {
    const first = { id: 'first', mhp: 1 };
    const second = { id: 'second', mhp: 0 };
    const state = schedulerState([first, second]);
    state.iflags.purge_monsters = 1;
    const events = [];

    const result = await movemon({
        state,
        ...schedulerOperations({
            moveSingleMonster(current, env) {
                events.push(`move:${current.id}`);
                env.state.somebody_can_move = true;
                env.state.u.utotype = 1;
                return true;
            },
            deferredGoto({ state: currentState }) {
                events.push('deferred');
                assert.equal(currentState.level.monlist, first);
                assert.equal(first.nmon, null);
                assert.deepEqual(currentState.context.objsplit, {
                    parent_oid: 0,
                    child_oid: 0,
                });
                currentState.u.utotype = 0;
            },
        }),
    });

    assert.equal(result, false);
    assert.deepEqual(events, ['move:first', 'deferred']);
    assert.equal(state.somebody_can_move, false);
});

test('movemon awaits actions, cleanup, and deferred level changes in order', async () => {
    const first = { id: 'first' };
    const second = { id: 'second' };
    const third = { id: 'third' };
    const state = schedulerState([first, second, third]);
    state.context.bypasses = true;
    state.u.utotype = 1;
    const firstAction = deferred();
    const bypass = deferred();
    const bypassStarted = deferred();
    const levelChange = deferred();
    const levelChangeStarted = deferred();
    const events = [];

    const pending = movemon({
        state,
        async moveSingleMonster(current, env) {
            events.push(`move:${current.id}:start`);
            if (current === first) await firstAction.promise;
            events.push(`move:${current.id}:end`);
            if (current === first) env.state.somebody_can_move = true;
            return current === second;
        },
        async clearBypasses(env) {
            events.push('bypass:start');
            bypassStarted.resolve();
            await bypass.promise;
            env.state.context.bypasses = false;
            events.push('bypass:end');
        },
        async deferredGoto(env) {
            events.push('deferred:start');
            levelChangeStarted.resolve();
            await levelChange.promise;
            env.state.u.utotype = 0;
            events.push('deferred:end');
        },
    });

    assert.deepEqual(events, ['move:first:start']);
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 7,
        child_oid: 8,
    });

    firstAction.resolve();
    await bypassStarted.promise;
    assert.deepEqual(events, [
        'move:first:start',
        'move:first:end',
        'move:second:start',
        'move:second:end',
        'bypass:start',
    ]);
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 7,
        child_oid: 8,
    });

    bypass.resolve();
    await levelChangeStarted.promise;
    assert.deepEqual(state.context.objsplit, {
        parent_oid: 0,
        child_oid: 0,
    });
    assert.equal(events.at(-1), 'deferred:start');

    let settled = false;
    pending.then(() => { settled = true; });
    await Promise.resolve();
    assert.equal(settled, false);
    levelChange.resolve();
    assert.equal(await pending, false);
    assert.equal(settled, true);
    assert.deepEqual(events, [
        'move:first:start',
        'move:first:end',
        'move:second:start',
        'move:second:end',
        'bypass:start',
        'bypass:end',
        'deferred:start',
        'deferred:end',
    ]);
});

test('movemon preflights every unported operation before state changes', async () => {
    const cases = [
        [{}, /moveSingleMonster/],
        [{ moveSingleMonster() {} }, /clearBypasses/],
        [{ moveSingleMonster() {}, clearBypasses() {} }, /deferredGoto/],
    ];

    for (const [operations, expected] of cases) {
        const state = schedulerState([{ id: 'untouched' }]);
        await assert.rejects(movemon({ state, ...operations }), expected);
        assert.equal(state.somebody_can_move, 'unchanged');
        assert.deepEqual(state.context.objsplit, {
            parent_oid: 7,
            child_oid: 8,
        });
    }
});
