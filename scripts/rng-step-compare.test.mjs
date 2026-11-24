// scripts/rng-step-compare.mjs compares a recording's random-number calls
// with the port's, input step by input step. These tests pin the comparison
// on hand-written steps, and the list of recordings allowed to lag.
// scripts/score-recordings.mjs applies the list to every replay of the
// corpus; scripts/score-recordings.test.mjs covers that verdict.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { assertExceptionCount } from './exception-count.mjs';
import { LAGGING_RECORDINGS, combineSegments, compareSegmentSteps } from './rng-step-compare.mjs';
import { RECORDINGS_DIR, listRecordings } from './score-recordings.mjs';

// Eight recordings lagged when the check was added on 23 November 2026:
// seven where display.c show_glyph() printed a notice from code the port
// ran synchronously, and one where pline.c impossible() did. The same
// branch brought all eight into step.
const LAGGING_COUNT = 0;

test('the list of lagging recordings holds existing recordings, each with a reason', () => {
    assertExceptionCount(LAGGING_RECORDINGS.size, LAGGING_COUNT, {
        what: 'recordings allowed to draw RNG calls in another step than C',
        pin: 'LAGGING_COUNT in scripts/rng-step-compare.test.mjs',
    });
    const recordings = new Set(listRecordings());
    for (const [path, reason] of LAGGING_RECORDINGS) {
        // A renamed or deleted recording would leave a pin nothing checks.
        assert.ok(recordings.has(path) && existsSync(join(RECORDINGS_DIR, path)),
            `${path} is not a recording under recordings/`);
        assert.ok(reason.length > 20, `${path} needs a reason`);
    }
});

// Two keys. C draws rn2(2) before the first screen and rnd(6) before the
// second; the port's log has an index prefix and no caller suffix.
const STEPS = [
    { rng: ['rn2(2)=1 @ f(a.c:1)', '>enter f'], screen: 'one' },
    { rng: ['rnd(6)=4 @ g(a.c:2)'], screen: 'two' },
];

test('steps whose calls match are in step, whatever the log decoration', () => {
    assert.deepEqual(compareSegmentSteps(STEPS, [['1 rn2(2)=1'], ['2 rnd(6)=4', 'not a call']]),
        { steps: 2, differing: 0, first: null });
});

test('a call drawn one step early differs in both steps', () => {
    // The judge's whole-log comparison passes this: the same two calls in
    // the same order. The port drew rnd(6) before the first key instead of
    // after it, as it does when it prints C's --More-- line late.
    assert.deepEqual(compareSegmentSteps(STEPS, [['rn2(2)=1', 'rnd(6)=4'], []]),
        { steps: 2, differing: 2, first: { step: 0, recorded: 1, port: 2 } });
});

test('a call with another result differs though the counts agree', () => {
    assert.deepEqual(compareSegmentSteps(STEPS, [['rn2(2)=0'], ['rnd(6)=4']]),
        { steps: 2, differing: 1, first: { step: 0, recorded: 1, port: 1 } });
});

test('a recorded step without a screen joins the next one that has a screen', () => {
    // The recorder saves an all-blank terminal as "", and the judge then
    // drops that screen; the step's rn2(3) belongs with the next screen.
    const steps = [STEPS[0], { rng: ['rn2(3)=2 @ h(a.c:3)'], screen: '' }, STEPS[1]];
    assert.deepEqual(compareSegmentSteps(steps, [['rn2(2)=1'], ['rn2(3)=2', 'rnd(6)=4']]),
        { steps: 2, differing: 0, first: null });
});

test('calls after the last screen are compared with the slices the port has left', () => {
    // A segment that ends on a blank terminal: C's last step has calls and
    // no screen. The port's two remaining slices together must hold them.
    const steps = [...STEPS, { rng: ['rn2(9)=8 @ k(a.c:4)', 'rn2(7)=0 @ k(a.c:5)'], screen: '' }];
    assert.deepEqual(compareSegmentSteps(steps, [['rn2(2)=1'], ['rnd(6)=4'], ['rn2(9)=8'], ['rn2(7)=0']]),
        { steps: 3, differing: 0, first: null });
    // Missing from the port, they differ at the index one past the steps.
    assert.deepEqual(compareSegmentSteps(steps, [['rn2(2)=1'], ['rnd(6)=4']]),
        { steps: 3, differing: 1, first: { step: 3, recorded: 2, port: 0 } });
    // So do calls the port drew after its last recorded screen.
    assert.deepEqual(compareSegmentSteps(STEPS, [['rn2(2)=1'], ['rnd(6)=4'], ['rn2(5)=1']]),
        { steps: 3, differing: 1, first: { step: 2, recorded: 0, port: 1 } });
});

test('a session\'s total names the first differing segment', () => {
    const inStep = { steps: 4, differing: 0, first: null };
    const lagging = { steps: 5, differing: 2, first: { step: 3, recorded: 0, port: 6 } };
    assert.deepEqual(combineSegments([inStep, lagging, lagging]),
        { steps: 14, differing: 4, first: { segment: 1, step: 3, recorded: 0, port: 6 } });
    assert.deepEqual(combineSegments([]), { steps: 0, differing: 0, first: null });
});
