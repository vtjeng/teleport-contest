import assert from 'node:assert/strict';
import test from 'node:test';

import {
    COLNO,
    CONFLICT,
    IN_SIGHT,
    I_SPECIAL,
    M_AP_FURNITURE,
    MFAST,
    MON_FLOOR,
    MON_MIGRATING,
    MSLOW,
    NON_PM,
    NORMAL_SPEED,
    OBJ_FLOOR,
    OBJ_MINVENT,
    ROWNO,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import {
    adaptMonsterActionToDochugwSignature,
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
    mpickstuff,
    wake_msg,
    wake_nearto,
} from '../js/mon.js';
import {
    G_UNIQ,
    M1_HIDE,
    M1_REGEN,
    M2_WERE,
    M2_ROCKTHROW,
    M2_STRONG,
    MZ_HUGE,
    PM_FLESH_GOLEM,
    PM_DWARF,
    PM_GNOME,
    PM_HUMAN_WEREWOLF,
    PM_VAMPIRE,
    PM_WEREWOLF,
    S_EEL,
    monst_globals_init,
} from '../js/monsters.js';
import { init_objects } from '../js/o_init.js';
import { newObject } from '../js/obj.js';
import {
    BOULDER,
    DAGGER,
    FOOD_RATION,
    GOLD_PIECE,
    LONG_SWORD,
    POT_HEALING,
    objects_globals_init,
} from '../js/objects.js';

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
        mux: 0,
        muy: 0,
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

// An override whose key does not name a real operation is silently replaced by
// the default below, which turns an assert.fail oracle into a no-op and leaves
// the suite green. Reject the unknown key instead, so a renamed operation
// cannot leave dead oracles behind.
function actionOperations(overrides = {}) {
    const defaults = {
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
        dochugwAction() {},
    };
    for (const key of Object.keys(overrides)) {
        if (!Object.hasOwn(defaults, key))
            assert.fail(`actionOperations has no operation named ${key}`);
    }
    return { ...defaults, ...overrides };
}

test('monster action adapter skips chug, forwards env, and returns the result',
    async () => {
        const subject = { sentinel: 'monster' };
        const state = { sentinel: 'state' };
        const random = { sentinel: 'random' };
        const env = { state, random };
        const expectedResult = 17;
        const action = adaptMonsterActionToDochugwSignature(
            async (monsterArg, envArg) => {
                assert.equal(monsterArg, subject);
                assert.equal(envArg, env);
                assert.equal(envArg.state, state);
                assert.equal(envArg.random, random);
                return expectedResult;
            },
        );

        // true occupies the middle argument of this port's
        // dochugw(monster, chug, env) (js/monmove.js:495), the slot holding
        // C's `chug` boolean. C's own dochugw() takes two parameters
        // (monmove.c:204), with `chug` last; the trailing env is the port's
        // injection seam. The environment-owned action accepts neither, so
        // the adapter drops chug and forwards env in its place.
        assert.equal(await action(subject, true, env), expectedResult);
    });

test('wake_nearto wakes only living monsters inside the strict range',
    async () => {
        const ordinary = actionMonster({
            data: {
                geno: 0,
                mflags1: 0,
                mlet: 0,
                pmnames: ['jackal'],
            },
            msleeping: true,
            mstrategy: STRAT_WAITMASK,
            mx: 1,
            my: 1,
        });
        const unique = actionMonster({
            data: {
                geno: G_UNIQ,
                mflags1: 0,
                mlet: 0,
                pmnames: ['unique monster'],
            },
            msleeping: true,
            mstrategy: STRAT_WAITMASK,
            mx: 1,
            my: 0,
        });
        const boundary = actionMonster({
            msleeping: true,
            mstrategy: STRAT_WAITMASK,
            mx: 2,
            my: 0,
        });
        const dead = actionMonster({
            mhp: 0,
            msleeping: true,
            mstrategy: STRAT_WAITMASK,
            mx: 0,
            my: 0,
        });
        ordinary.nmon = unique;
        unique.nmon = boundary;
        boundary.nmon = dead;
        dead.nmon = null;
        const state = schedulerState([ordinary, unique, boundary, dead]);
        const messages = [];
        const buriedCalls = [];

        await wake_nearto(0, 0, 4, {
            canSeeMonster: (subject) => subject === ordinary,
            disturbBuriedZombies: (...args) => {
                buriedCalls.push(args);
            },
            message: (text) => {
                messages.push(text);
            },
            state,
        });

        assert.equal(ordinary.msleeping, false);
        assert.equal(ordinary.mstrategy & STRAT_WAITMASK, 0);
        assert.equal(unique.msleeping, false);
        assert.equal(unique.mstrategy & STRAT_WAITMASK, STRAT_WAITMASK);
        assert.equal(boundary.msleeping, true);
        assert.equal(dead.msleeping, true);
        assert.deepEqual(messages, ['The jackal wakes up.']);
        assert.equal(buriedCalls.length, 1);
        // C reaches this line through pline_mon() (mon.c:4325), which prefixes
        // the victim's coordinates under accessiblemsg, where new_were()'s
        // plain pline() at were.c:113 does not. Nothing pinned that: with the
        // option off both spellings answer the same string, so unwrapping
        // wake_msg()'s messageAt() left the whole suite and every score
        // unchanged. Re-run the same wake with the option on.
        const accessible = [];
        ordinary.msleeping = true;
        ordinary.mstrategy = STRAT_WAITMASK;
        state.a11y = { accessiblemsg: true };
        await wake_nearto(0, 0, 4, {
            canSeeMonster: (subject) => subject === ordinary,
            disturbBuriedZombies: () => {},
            message: (text) => { accessible.push(text); },
            state,
        });
        // The jackal sits at <1,0> and the hero at the fixture's own position;
        // the prefix comes from coordinateDescription(), so this asserts the
        // wrapping is present rather than pinning a particular compass phrase.
        assert.equal(accessible.length, 1);
        assert.notEqual(accessible[0], 'The jackal wakes up.');
        assert.match(accessible[0], /: The jackal wakes up\.$/u);
        assert.deepEqual(buriedCalls[0].slice(0, 2), [0, 0]);
        assert.equal(buriedCalls[0][2].state, state);
    });

function deferred() {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
}

test('wake_msg awaits visible output before its caller can clear sleep',
    async () => {
        const subject = actionMonster({
            data: {
                pmidx: PM_FLESH_GOLEM,
                pmnames: ['flesh golem'],
            },
            msleeping: true,
        });
        const output = deferred();
        let rendered;
        let settled = false;
        const pending = wake_msg(subject, true, {
            state: {},
            canSeeMonster: () => true,
            message: (text) => {
                rendered = text;
                return output.promise;
            },
        });
        pending.then(() => { settled = true; });

        await Promise.resolve();
        assert.equal(
            rendered,
            "The flesh golem wakes up! It's alive!",
        );
        assert.equal(settled, false);
        assert.equal(subject.msleeping, true);

        output.resolve();
        await pending;
        assert.equal(settled, true);
        assert.equal(subject.msleeping, true);
    });

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

test('mcalcdistress skips dead and off-map list entries', async () => {
    const offMap = {
        nmon: null,
        data: { mmove: 0, mflags1: 0, mflags2: M2_WERE },
        cham: -1,
        mhp: 2,
        mhpmax: 3,
        mstate: MON_MIGRATING,
        mspec_used: 1,
        mblinded: 1,
        mfrozen: 1,
        mfleetim: 1,
    };
    const dead = {
        ...offMap,
        nmon: offMap,
        data: { mmove: 0, mflags1: M1_REGEN, mflags2: M2_WERE },
        mhp: 0,
        mstate: MON_FLOOR,
    };
    const state = {
        moves: 20,
        level: { monlist: dead },
        vision_full_recalc: 1,
    };
    await mcalcdistress(state);
    assert.deepEqual(
        [dead.mhp, dead.mspec_used, dead.mblinded,
            dead.mfrozen, dead.mfleetim],
        [0, 1, 1, 1, 1],
    );
    assert.deepEqual(
        [offMap.mhp, offMap.mspec_used, offMap.mblinded,
            offMap.mfrozen, offMap.mfleetim],
        [2, 1, 1, 1, 1],
    );
});

test('mcalcdistress resolves vision for a later immobile monster', async () => {
    const immobile = {
        nmon: null,
        data: { mmove: 0, mflags1: 0, mflags2: 0 },
        cham: -1,
        mhp: 2,
        mhpmax: 2,
        mstate: MON_FLOOR,
        mspec_used: 0,
        mblinded: 0,
        mfrozen: 0,
        mfleetim: 0,
    };
    const changing = {
        ...immobile,
        nmon: immobile,
        data: { mmove: 12, mflags1: 0, mflags2: 0 },
        cham: PM_VAMPIRE,
    };
    const state = {
        moves: 20,
        level: { monlist: changing },
        vision_full_recalc: 0,
    };
    const events = [];
    await mcalcdistress(state, {
        decideToShapeshift() {
            events.push('shape');
            state.vision_full_recalc = 1;
        },
        visionRecalc() {
            events.push('vision');
            state.vision_full_recalc = 0;
        },
        minLiquid() {
            events.push('liquid');
            return false;
        },
    });
    assert.deepEqual(events, ['shape', 'vision', 'liquid']);
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
        dochugwAction(_monster, chug) {
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
            dochugwAction: () => assert.fail(
                'liquid effect ends the action',
            ),
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
        dochugwAction: () => assert.fail('equipping consumes this action'),
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
            dochugwAction: () => { ++unchangedMoves; },
        }),
    }), false);
    assert.equal(unchangedMoves, 1);
    assert.equal(unchanged.misc_worn_check, 0x08);

    const closeHostile = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mx: 4,
        my: 4,
        mux: 5,
        muy: 4,
    });
    const closeState = actionState(closeHostile);
    closeState.u.ux = 5;
    closeState.u.uy = 4;
    let moved = 0;
    assert.equal(await movemon_singlemon(closeHostile, {
        state: closeState,
        ...actionOperations({
            dowear: () => assert.fail('close hostile retains I_SPECIAL'),
            dochugwAction: () => { ++moved; },
        }),
    }), false);
    assert.equal(moved, 1);
    assert.ok(closeHostile.misc_worn_check & I_SPECIAL);

    const mistakenDistant = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mx: 4,
        my: 4,
        mux: 20,
        muy: 4,
    });
    const mistakenDistantState = actionState(mistakenDistant);
    mistakenDistantState.u.ux = 5;
    mistakenDistantState.u.uy = 4;
    let wore = 0;
    assert.equal(await movemon_singlemon(mistakenDistant, {
        state: mistakenDistantState,
        ...actionOperations({
            dowear(current) {
                ++wore;
                current.misc_worn_check |= 0x10;
            },
            dochugwAction: () => assert.fail('remembered distance equips'),
        }),
    }), false);
    assert.equal(wore, 1);
    assert.equal(Boolean(mistakenDistant.misc_worn_check & I_SPECIAL), false);

    const mistakenClose = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mx: 4,
        my: 4,
        mux: 5,
        muy: 4,
    });
    const mistakenCloseState = actionState(mistakenClose);
    mistakenCloseState.u.ux = 20;
    mistakenCloseState.u.uy = 4;
    let mistakenCloseMoves = 0;
    assert.equal(await movemon_singlemon(mistakenClose, {
        state: mistakenCloseState,
        ...actionOperations({
            dowear: () => assert.fail('remembered proximity defers gear'),
            dochugwAction: () => { ++mistakenCloseMoves; },
        }),
    }), false);
    assert.equal(mistakenCloseMoves, 1);
    assert.ok(mistakenClose.misc_worn_check & I_SPECIAL);

    // C's gate is `mtmp->mpeaceful || mtmp->mtame || dist2(...) > (3 * 3)`
    // (mon.c:1276-1277). Every fixture above that sets mpeaceful also sits at
    // believed dist2 32, so the distance arm alone carried them. These two put
    // the believed hero one square away, where only the peaceful and tame arms
    // can open the gate.
    for (const [label, disposition] of [
        ['peaceful', { mpeaceful: true }],
        ['tame', { mpeaceful: false, mtame: 1 }],
    ]) {
        const friendly = actionMonster({
            misc_worn_check: I_SPECIAL | 0x08,
            mx: 4,
            my: 4,
            mux: 5, // believed dist2 = 1, well inside the 3 * 3 gate
            muy: 4,
            ...disposition,
        });
        const friendlyState = actionState(friendly);
        friendlyState.u.ux = 5;
        friendlyState.u.uy = 4;
        let friendlyWore = 0;
        assert.equal(await movemon_singlemon(friendly, {
            state: friendlyState,
            ...actionOperations({
                dowear(current) {
                    ++friendlyWore;
                    current.misc_worn_check |= 0x10;
                },
                dochugwAction: () => assert.fail(
                    `${label} monster equips whatever it believes`,
                ),
            }),
        }), false);
        assert.equal(friendlyWore, 1, label);
        assert.equal(Boolean(friendly.misc_worn_check & I_SPECIAL), false);
    }

    // The believed distances above are 1, 32 and 256, none of them near the
    // `3 * 3` C compares against. These two hostiles straddle it exactly:
    // dist2(4, 4, 7, 4) is 9, which `> 9` rejects, and dist2(4, 4, 7, 5) is
    // 10, which it accepts.
    const atGate = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mx: 4,
        my: 4,
        mux: 7,
        muy: 4,
    });
    const atGateState = actionState(atGate);
    atGateState.u.ux = 7;
    atGateState.u.uy = 4;
    let atGateMoves = 0;
    assert.equal(await movemon_singlemon(atGate, {
        state: atGateState,
        ...actionOperations({
            dowear: () => assert.fail('believed dist2 9 is not yet distant'),
            dochugwAction: () => { ++atGateMoves; },
        }),
    }), false);
    assert.equal(atGateMoves, 1);
    assert.ok(atGate.misc_worn_check & I_SPECIAL);

    const pastGate = actionMonster({
        misc_worn_check: I_SPECIAL | 0x08,
        mx: 4,
        my: 4,
        mux: 7,
        muy: 5,
    });
    const pastGateState = actionState(pastGate);
    pastGateState.u.ux = 7;
    pastGateState.u.uy = 5;
    let pastGateWore = 0;
    assert.equal(await movemon_singlemon(pastGate, {
        state: pastGateState,
        ...actionOperations({
            dowear(current) {
                ++pastGateWore;
                current.misc_worn_check |= 0x10;
            },
            dochugwAction: () => assert.fail('believed dist2 10 is distant'),
        }),
    }), false);
    assert.equal(pastGateWore, 1);
    assert.equal(Boolean(pastGate.misc_worn_check & I_SPECIAL), false);
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
            dochugwAction: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 0);

    hidden.movement = NORMAL_SPEED;
    hidden.m_ap_type = M_AP_FURNITURE;
    assert.equal(await movemon_singlemon(hidden, {
        state: hiddenState,
        ...actionOperations({
            restrap: () => false,
            dochugwAction: () => { ++moves; },
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
            dochugwAction: () => { ++moves; },
        }),
    }), false);
    assert.equal(moves, 0);

    hidden.movement = NORMAL_SPEED;
    hidden.mundetected = false;
    assert.equal(await movemon_singlemon(hidden, {
        state: hiddenState,
        ...actionOperations({
            restrap: () => false,
            dochugwAction: () => { ++moves; },
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
            dochugwAction: () => { ++moves; },
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
            dochugwAction: () => { ++moves; },
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
            dochugwAction: () => assert.fail(
                'successful fight ends the action',
            ),
        }),
    }), false);
    assert.deepEqual(events, ['every', 'liquid', 'hero', 'square', 'fight']);

    // C guards fightm() with `mdistu(mtmp) <= BOLT_LIM * BOLT_LIM`
    // (mon.c:1317). BOLT_LIM is 8 (hack.h:49), so the limit is 64. The subject
    // above stands at dist2 1, which a limit of 8 would also admit; these two
    // straddle the real bound. dist2(4, 4, 12, 4) is 64, the inclusive end,
    // and dist2(4, 4, 12, 5) is 65, the first distance outside.
    const atRangeEnd = actionMonster({ mx: 4, my: 4 });
    const atRangeEndState = actionState(atRangeEnd);
    atRangeEndState.u.ux = 12;
    atRangeEndState.u.uy = 4;
    atRangeEndState.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0 };
    let atRangeEndFights = 0;
    assert.equal(await movemon_singlemon(atRangeEnd, {
        state: atRangeEndState,
        ...actionOperations({
            canSeeHero: () => true,
            canSeeSquare: () => true,
            fightMonster: () => { ++atRangeEndFights; return true; },
            dochugwAction: () => assert.fail('dist2 64 is inside bolt range'),
        }),
    }), false);
    assert.equal(atRangeEndFights, 1);

    const outOfRange = actionMonster({ mx: 4, my: 4 });
    const outOfRangeState = actionState(outOfRange);
    outOfRangeState.u.ux = 12;
    outOfRangeState.u.uy = 5;
    outOfRangeState.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0 };
    let outOfRangeMoves = 0;
    assert.equal(await movemon_singlemon(outOfRange, {
        state: outOfRangeState,
        ...actionOperations({
            // Both perception owners must answer true, or the default false
            // would stop the chain before the range check is reached.
            canSeeHero: () => true,
            canSeeSquare: () => true,
            fightMonster: () => assert.fail('dist2 65 is out of bolt range'),
            dochugwAction: () => { ++outOfRangeMoves; },
        }),
    }), false);
    assert.equal(outOfRangeMoves, 1);

    // C exempts the Wizard of Yendor from conflict outright, before it asks
    // whether he can see the hero (`Conflict && !mtmp->iswiz && m_canseeu`,
    // mon.c:1305). An adjacent conflicted Wizard must therefore reach dochugw
    // without either perception owner running.
    const wizard = actionMonster({ mx: 4, my: 4, iswiz: true });
    const wizardState = actionState(wizard);
    wizardState.u.ux = 5;
    wizardState.u.uy = 4;
    wizardState.u.uprops[CONFLICT] = { intrinsic: 1, extrinsic: 0 };
    let wizardMoves = 0;
    assert.equal(await movemon_singlemon(wizard, {
        state: wizardState,
        ...actionOperations({
            canSeeHero: () => assert.fail('the Wizard is exempt from conflict'),
            canSeeSquare: () => assert.fail('the Wizard never reaches fightm'),
            fightMonster: () => assert.fail('the Wizard never reaches fightm'),
            dochugwAction: () => { ++wizardMoves; },
        }),
    }), false);
    assert.equal(wizardMoves, 1);
});

test('movemon_singlemon preflights downstream owners before mutation', async () => {
    const subject = actionMonster();
    const state = actionState(subject);
    const operations = actionOperations();
    delete operations.dochugwAction;
    let everyTurnCalls = 0;
    operations.everyTurnEffect = () => { ++everyTurnCalls; };

    await assert.rejects(movemon_singlemon(subject, {
        state,
        ...operations,
    }), /dochugwAction/);
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

// ---- mon.c mpickstuff() ----

const PICKUP_X = 5; // An ordinary room coordinate away from the map edges.
const PICKUP_Y = 5; // An ordinary room coordinate away from the map edges.

// The effect half runs the real splitobj(), obj_extract_self(), mpickobj()
// and doname(), so it needs the object and monster catalogs, a map, and a
// hero position from which the monster's square is both visible and near.
function pickupState(pmidx = PM_GNOME) {
    const state = {
        context: {
            achieveo: { mines_prize_oid: 0, soko_prize_oid: 0 },
            ident: 500, // Any live object-id counter for splitobj().
        },
        flags: { verbose: true, implicit_uncursed: true },
        iflags: {},
        level: new GameMap(),
        moves: 17,
        program_state: {},
        u: {
            ux: PICKUP_X,
            uy: PICKUP_Y,
            uprops: [],
            xray_range: 0,
        },
        viz_array: Array.from(
            { length: ROWNO },
            () => new Array(COLNO).fill(0),
        ),
    };
    objects_globals_init(state);
    // Zero choices deterministically initialize every randomized description.
    init_objects(state, () => 0);
    monst_globals_init(state);
    state.viz_array[PICKUP_Y][PICKUP_X] = IN_SIGHT;
    // A gnome has hands and is M2_COLLECT (monsters.h:1686), so likes_objs()
    // puts weapons, armor, gems and food on its take list. It is not
    // M2_GREEDY, and gold is COIN_CLASS, which likes_objs() does not cover, so
    // the gold cases below use a dwarf instead: M2_GREEDY | M2_COLLECT
    // (monsters.h:491) and hands.
    const monster = {
        data: state.mons[pmidx],
        mcanmove: true,
        minvent: null,
        misc_worn_check: 0,
        mx: PICKUP_X,
        my: PICKUP_Y,
    };
    return { state, monster };
}

function pickupStack(state, otyp, quan, overrides = {}) {
    const obj = newObject({
        corpsenm: NON_PM,
        o_id: 101, // A live non-prize object id.
        oclass: state.objects[otyp].oc_class,
        otyp,
        ox: PICKUP_X,
        oy: PICKUP_Y,
        quan,
        where: OBJ_FLOOR,
        ...overrides,
    });
    obj.owt = quan;
    state.level.objects[PICKUP_X][PICKUP_Y] = obj;
    state.level.objlist = obj;
    return obj;
}

// obj.js requires the whole source random set even though the only draw the
// pickup reaches through it is next_ident()'s rnd(2).
function pickupRandom() {
    const unreached = (name) => () => {
        throw new Error(`mpickstuff test reached ${name}`);
    };
    return {
        d: unreached('d'),
        rn1: unreached('rn1'),
        rne: unreached('rne'),
        rnl: unreached('rnl'),
        rnz: unreached('rnz'),
        rn2: unreached('rn2'),
        rnd: () => 1, // next_ident() advances context.ident by rnd(2).
    };
}

test('mpickstuff lifts a whole stack, names it, and redraws last', async () => {
    const { state, monster } = pickupState();
    const ration = pickupStack(state, FOOD_RATION, 1);
    const messages = [];
    const redraws = [];

    const result = await mpickstuff(monster, ration, ration.quan, {
        message: async (text) => { messages.push(text); },
        // C ref: mon.c:1907-1909. newsym() is the last statement before the
        // return, after mpickobj() and check_gear_next_turn(), so the square
        // is empty and the monster already carries the stack when it runs.
        // dogmove.c's carry arm redraws between the extract and mpickobj().
        redraw: (x, y) => {
            redraws.push([x, y, state.level.objects[x][y], monster.minvent]);
        },
        random: pickupRandom(),
        state,
    });

    assert.equal(result, true);
    assert.deepEqual(messages, ['The gnome picks up a food ration.']);
    assert.deepEqual(redraws, [[PICKUP_X, PICKUP_Y, null, ration]]);
    assert.equal(state.level.objects[PICKUP_X][PICKUP_Y], null);
    assert.equal(state.level.objlist, null);
    assert.equal(monster.minvent, ration);
    assert.equal(ration.where, OBJ_MINVENT);
    assert.equal(ration.ocarry, monster);
    // check_gear_next_turn() asks movemon_singlemon() to reassess gear.
    assert.equal(monster.misc_worn_check & I_SPECIAL, I_SPECIAL);
});

test('mpickstuff names the stack left behind, not the portion taken',
    async () => {
        // C ref: mon.c:1889-1895. splitobj() returns the carried portion as
        // otmp3 and leaves the remainder in otmp, and mpickstuff() hands otmp
        // to distant_name(). A four-coin pile from which one coin is taken
        // therefore announces the three that stay on the floor.
        const { state, monster } = pickupState(PM_DWARF);
        const gold = pickupStack(state, GOLD_PIECE, 4);
        const messages = [];

        await mpickstuff(monster, gold, 1, {
            message: async (text) => { messages.push(text); },
            random: pickupRandom(),
            redraw: () => {},
            state,
        });

        assert.deepEqual(messages, ['The dwarf picks up 3 gold pieces.']);
        assert.equal(state.level.objects[PICKUP_X][PICKUP_Y], gold);
        assert.equal(gold.quan, 3);
        assert.equal(gold.where, OBJ_FLOOR);
        const taken = monster.minvent;
        assert.notEqual(taken, gold);
        assert.equal(taken.otyp, GOLD_PIECE);
        assert.equal(taken.quan, 1);
        assert.equal(taken.nobj, null);
    });

test('mpickstuff merges into a stack the monster already carries', async () => {
    const { state, monster } = pickupState(PM_DWARF);
    const carried = newObject({
        corpsenm: NON_PM,
        o_id: 102, // A second live object id, distinct from the floor pile.
        oclass: state.objects[GOLD_PIECE].oc_class,
        otyp: GOLD_PIECE,
        quan: 6,
        where: OBJ_MINVENT,
    });
    carried.owt = 6;
    carried.ocarry = monster;
    monster.minvent = carried;
    const gold = pickupStack(state, GOLD_PIECE, 4);

    await mpickstuff(monster, gold, gold.quan, {
        message: async () => {},
        random: pickupRandom(),
        redraw: () => {},
        state,
    });

    // add_to_minv() merged and freed the floor stack rather than prepending
    // it, so the carried quantity absorbs all four coins.
    assert.equal(monster.minvent, carried);
    assert.equal(carried.nobj, null);
    assert.equal(carried.quan, 10);
    assert.equal(state.level.objects[PICKUP_X][PICKUP_Y], null);
});

test('mpickstuff runs distant_name for its side effects when quiet',
    async () => {
        // flags.verbose off suppresses the line but not the naming call, so
        // the type still enters the discoveries list.
        const { state, monster } = pickupState();
        state.flags.verbose = false;
        const potion = pickupStack(state, POT_HEALING, 1);
        const messages = [];

        await mpickstuff(monster, potion, potion.quan, {
            message: async (text) => { messages.push(text); },
            random: pickupRandom(),
            redraw: () => {},
            state,
        });

        assert.deepEqual(messages, []);
        assert.equal(potion.dknown, true);
        assert.equal(state.objects[POT_HEALING].oc_encountered, 1);
        assert.equal(monster.minvent, potion);
    });

test('mpickstuff names nothing on a square the hero cannot see', async () => {
    const { state, monster } = pickupState();
    state.viz_array[PICKUP_Y][PICKUP_X] = 0;
    const potion = pickupStack(state, POT_HEALING, 1);
    const messages = [];
    const redraws = [];

    await mpickstuff(monster, potion, potion.quan, {
        message: async (text) => { messages.push(text); },
        random: pickupRandom(),
        redraw: (x, y) => { redraws.push([x, y]); },
        state,
    });

    assert.deepEqual(messages, []);
    // distant_name() never ran, so nothing observed the potion at all.
    assert.equal(potion.dknown, false);
    assert.equal(state.objects[POT_HEALING].oc_encountered, 0);
    assert.equal(monster.minvent, potion);
    // C ref: mon.c:1891-1905. Only the naming and the line sit inside
    // `if (cansee(mtmp->mx, mtmp->my))`; newsym() is outside it and runs
    // whatever the hero can see, because the square's remembered glyph has to
    // lose the object the monster just removed.
    assert.deepEqual(redraws, [[PICKUP_X, PICKUP_Y]]);
});

test('mpickstuff demands the whole random set only when it splits', async () => {
    const whole = pickupState();
    const ration = pickupStack(whole.state, FOOD_RATION, 1);
    // A whole-stack pickup never reaches splitobj(), so rnd() alone suffices.
    await mpickstuff(whole.monster, ration, ration.quan, {
        message: async () => {},
        random: { rnd: () => 1 },
        redraw: () => {},
        state: whole.state,
    });
    assert.equal(whole.monster.minvent, ration);

    const split = pickupState(PM_DWARF);
    const gold = pickupStack(split.state, GOLD_PIECE, 4);
    await assert.rejects(
        mpickstuff(split.monster, gold, 1, {
            message: async () => {},
            random: { rnd: () => 1 },
            redraw: () => {},
            state: split.state,
        }),
        /mpickstuff splitting requires rn2, rnd, rn1, and rne/,
    );
    assert.equal(split.monster.minvent, null);
    assert.equal(gold.quan, 4);
});
