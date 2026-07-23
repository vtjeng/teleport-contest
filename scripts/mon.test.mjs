import assert from 'node:assert/strict';
import test from 'node:test';

import { MFAST, MSLOW } from '../js/const.js';
import {
    curr_mon_load,
    iter_mons_safe,
    m_carrying,
    mcalcmove,
    max_mon_load,
    movemon,
} from '../js/mon.js';
import { M2_ROCKTHROW, M2_STRONG, MZ_HUGE } from '../js/monsters.js';
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
