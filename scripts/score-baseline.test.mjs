import assert from 'node:assert/strict';
import test from 'node:test';

import {
    compareToBaseline,
    currentFromResults,
    describeDrops,
    lowerBaseline,
    raiseBaseline,
    RATCHET_METRICS,
} from './score-baseline.mjs';

// Two sessions and the two ratcheted metrics. The figures are the shape
// scripts/score-development.mjs emits: a matched count against a total, of
// which the ratchet reads only the matched half.
const results = [
    { session: 'a.json', metrics: { screens: { matched: 26, total: 60 },
        rngCalls: { matched: 2440, total: 2640 } } },
    { session: 'b.json', metrics: { screens: { matched: 12, total: 43 },
        rngCalls: { matched: 2630, total: 3223 } } },
];

test('the ratchet reads the matched half of each metric', () => {
    assert.deepEqual(currentFromResults(results), {
        'a.json': { screens: 26, rngCalls: 2440 },
        'b.json': { screens: 12, rngCalls: 2630 },
    });
    // Both metrics ratchet: a session can hold its screens while losing
    // random-number matches, which means the state behind them drifted.
    assert.deepEqual(RATCHET_METRICS, ['screens', 'rngCalls']);
});

test('a session that matches fewer than its baseline is a drop', () => {
    const baseline = {
        'a.json': { screens: 26, rngCalls: 2440 },
        'b.json': { screens: 21, rngCalls: 2630 },
    };
    const { drops, missing } = compareToBaseline(
        currentFromResults(results), baseline);
    // Only b.json fell, and only on screens: 21 down to 12.
    assert.deepEqual(drops, [
        { session: 'b.json', metric: 'screens', was: 21, now: 12 },
    ]);
    assert.deepEqual(missing, []);
});

test('a session the run did not score is reported, not passed over', () => {
    // Silently passing a session that stopped being scored would defeat the
    // ratchet: the figure it guards would simply stop being checked.
    const { drops, missing } = compareToBaseline(
        { 'a.json': { screens: 26, rngCalls: 2440 } },
        { 'a.json': { screens: 26, rngCalls: 2440 },
            'b.json': { screens: 12, rngCalls: 2630 } },
    );
    assert.deepEqual(drops, []);
    assert.deepEqual(missing, ['b.json']);
    assert.match(describeDrops({ drops, missing }), /b\.json was not scored/u);
});

test('a session absent from the baseline is new and cannot have dropped', () => {
    const { drops, missing } = compareToBaseline(
        currentFromResults(results), { 'a.json': { screens: 26, rngCalls: 2440 } });
    assert.deepEqual(drops, []);
    assert.deepEqual(missing, []);
});

test('raising takes the maximum, so it cannot lower a figure', () => {
    // b.json's baseline is higher than this run; raising must leave it alone,
    // which is what stops an update step from advancing past a regression.
    const baseline = {
        'a.json': { screens: 20, rngCalls: 2440 },
        'b.json': { screens: 21, rngCalls: 2630 },
    };
    assert.deepEqual(raiseBaseline(baseline, currentFromResults(results)), {
        'a.json': { screens: 26, rngCalls: 2440 },
        'b.json': { screens: 21, rngCalls: 2630 },
    });
});

test('lowering records its reason beside the number it explains', () => {
    // The real case: domove() began refusing a mounted hero, which is correct
    // and costs that session screens it would otherwise reach.
    const baseline = { 'b.json': { screens: 21, rngCalls: 2630 } };
    const next = lowerBaseline(baseline, 'b.json',
        { screens: 12, rngCalls: 2630 }, 'domove() now refuses a mounted hero',
        'ed43517');
    assert.equal(next['b.json'].screens, 12);
    assert.deepEqual(next['b.json'].lowerings, [
        { metric: 'screens', from: 21, to: 12, commit: 'ed43517',
            reason: 'domove() now refuses a mounted hero' },
    ]);
    // A second lowering appends, so a session lowered repeatedly shows it.
    const again = lowerBaseline(next, 'b.json', { screens: 9, rngCalls: 2630 },
        'a second refusal', 'abc1234');
    assert.equal(again['b.json'].lowerings.length, 2);
});

test('lowering refuses without a reason, and refuses to raise', () => {
    const baseline = { 'b.json': { screens: 21, rngCalls: 2630 } };
    for (const reason of ['', '   ', undefined]) {
        assert.throws(
            () => lowerBaseline(baseline, 'b.json', { screens: 12 }, reason, 'c'),
            /needs a reason/u,
        );
    }
    // The raise path is monotone by construction; routing a rise through the
    // lowering path would let it carry a reason and bypass that.
    assert.throws(
        () => lowerBaseline(baseline, 'b.json', { screens: 30 }, 'why', 'c'),
        /would rise/u,
    );
    assert.throws(
        () => lowerBaseline(baseline, 'b.json', { screens: 21 }, 'why', 'c'),
        /nothing to lower/u,
    );
    assert.throws(
        () => lowerBaseline(baseline, 'absent.json', { screens: 1 }, 'why', 'c'),
        /no baseline for session/u,
    );
});
