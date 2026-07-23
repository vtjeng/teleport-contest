import assert from 'node:assert/strict';
import test from 'node:test';

import { MFAST, MSLOW } from '../js/const.js';
import { mcalcmove } from '../js/mon.js';

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
