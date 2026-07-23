import assert from 'node:assert/strict';
import test from 'node:test';

import { MFAST, MSLOW } from '../js/const.js';
import { iter_mons_safe, mcalcmove, movemon } from '../js/mon.js';

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
    const state = schedulerState([first, second]);
    const events = [];
    state.context.bypasses = true;
    state.gl.light_base = {};

    const result = await movemon({
        state,
        ...schedulerOperations({
            moveSingleMonster(current, env) {
                events.push(`move:${current.id}:${env.state.somebody_can_move}`);
                if (current === first) env.state.somebody_can_move = true;
                return false;
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
