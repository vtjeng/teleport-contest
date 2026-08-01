// Pin scripts/run-leave-level.mjs, which is the only matrix in this repository
// that accepts a segment the port does not finish. Its verdict decides whether
// a descent counts as evidence, so a bug here would make the matrix pass
// vacuously; every case below is a result shape the runner must reject.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    DOWN_COMMAND,
    classifySegment,
    isTruncationOnly,
    loadLeaveLevelRecipe,
    runLeaveLevelMatrix,
} from './run-leave-level.mjs';

const DESCENT = { moves: `hj${DOWN_COMMAND}` };
const CONTROL = { moves: 'hj' };

// The shape a clean descent produces: nine screens and cursors against C's
// ten, and a random-number log that stops where the port stopped. The numbers
// are the run recorded for seed 6100772 in the matrix.
function truncatedResult(overrides = {}) {
    return {
        error: null,
        passed: false,
        segmentMismatch: null,
        animMismatch: null,
        lengths: {
            rng: { c: 5294, js: 2813 },
            screens: { c: 10, js: 9 },
            cursors: { c: 10, js: 9 },
            animFrames: { c: 0, js: 0 },
        },
        rngMismatch: { index: 2813, jsEntry: undefined },
        screenMismatch: { index: 9, kind: 'js-missing' },
        cursorMismatch: { index: 9, jsCursor: undefined },
        ...overrides,
    };
}

test('the leave-level matrix contains only source-selected inputs', () => {
    const recipe = loadLeaveLevelRecipe();
    assert.equal(recipe.version, 5);
    // Five segments: three descents on different layouts, the control that
    // walks one of them without the '>', and a third role.
    assert.equal(recipe.segments.length, 5);
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);

    // Exactly one segment omits the command, and it repeats another segment's
    // seed and keys. That is what makes the missing screen attributable to the
    // descent rather than to the walk.
    const controls = recipe.segments.filter(
        ({ moves }) => !moves.endsWith(DOWN_COMMAND),
    );
    assert.equal(controls.length, 1);
    const twin = recipe.segments.find(
        ({ moves, seed }) => seed === controls[0].seed
            && moves === `${controls[0].moves}${DOWN_COMMAND}`,
    );
    assert.ok(twin, 'the control repeats a descending segment');
});

test('a clean truncation is accepted and a value mismatch is not', () => {
    assert.equal(classifySegment(DESCENT, truncatedResult()), null);

    // A random-number value that differs rather than being absent.
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            rngMismatch: { index: 40, jsEntry: 'rn2(3)=1' },
        })),
        /random-number values differ/u,
    );
    // A screen cell that differs before the descent: kind is absent, because
    // diff-fresh reports a cell rather than a missing screen.
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            screenMismatch: { index: 7, ch: { c: 'd', js: '#' } },
        })),
        /screens differ/u,
    );
    // A cursor that differs at a boundary both sides drew.
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            cursorMismatch: { index: 3, jsCursor: [1, 2, 3] },
        })),
        /cursors differ/u,
    );
});

test('the runner rejects a port that stops in the wrong place', () => {
    // Two screens short means something before the descent went missing too.
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            lengths: {
                rng: { c: 5294, js: 2813 },
                screens: { c: 11, js: 9 },
                cursors: { c: 10, js: 9 },
                animFrames: { c: 0, js: 0 },
            },
        })),
        /2 screens short/u,
    );
    // A port that drew every screen has stopped nowhere, which is slice 3's
    // result and not this one's.
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            lengths: {
                rng: { c: 5294, js: 5294 },
                screens: { c: 10, js: 10 },
                cursors: { c: 10, js: 10 },
                animFrames: { c: 0, js: 0 },
            },
            rngMismatch: null,
            screenMismatch: null,
            cursorMismatch: null,
        })),
        /0 screens short/u,
    );
});

test('a JavaScript error or a lost segment fails whatever else matched', () => {
    assert.match(
        classifySegment(DESCENT, truncatedResult({ error: 'boom' })),
        /JavaScript error: boom/u,
    );
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            segmentMismatch: { c: 1, js: 0 },
        })),
        /segment count mismatch/u,
    );
    assert.match(
        classifySegment(DESCENT, truncatedResult({
            animMismatch: { index: 0, kind: 'count' },
        })),
        /animation frame mismatch/u,
    );
});

test('the control segment is held to a strict match', () => {
    // The truncation the descending segments are allowed is exactly what the
    // control must not show.
    assert.match(
        classifySegment(CONTROL, truncatedResult()),
        /control segment did not match/u,
    );
    assert.equal(
        classifySegment(CONTROL, truncatedResult({ passed: true })),
        null,
    );
});

test('isTruncationOnly needs the port to be the shorter log', () => {
    // With no mismatch reported, the two logs have to be the same length.
    assert.equal(isTruncationOnly(null, 'jsEntry', { c: 5, js: 5 }), true);
    assert.equal(isTruncationOnly(null, 'jsEntry', { c: 5, js: 4 }), false);
    // A JavaScript log longer than C's is an extra entry, not a truncation,
    // even though the missing value sits where the port stopped.
    assert.equal(
        isTruncationOnly({ index: 6, jsEntry: undefined }, 'jsEntry',
            { c: 5, js: 6 }),
        false,
    );
    assert.equal(
        isTruncationOnly({ index: 4, jsEntry: undefined }, 'jsEntry',
            { c: 5, js: 4 }),
        true,
    );
    // The right length but the wrong index: the port stopped earlier than the
    // mismatch says, so something between them was skipped.
    assert.equal(
        isTruncationOnly({ index: 3, jsEntry: undefined }, 'jsEntry',
            { c: 5, js: 4 }),
        false,
    );
});

test('the matrix stops at the first failing segment', async () => {
    const seen = [];
    const written = [];
    const result = await runLeaveLevelMatrix({
        runDifferentialFn: async (recipe) => {
            seen.push(recipe.segments[0].seed);
            return seen.length === 2
                ? truncatedResult({ error: 'stop here' })
                : truncatedResult({ passed: true });
        },
        write: (text) => written.push(text),
    });

    assert.equal(result.passed, false);
    assert.equal(result.failure.index, 1);
    assert.equal(seen.length, 2, 'the third segment was never recorded');
    assert.ok(written.join('').includes('stop here'));
});

test('the matrix reports the prefix it matched', async () => {
    const written = [];
    const result = await runLeaveLevelMatrix({
        runDifferentialFn: async (recipe) => (
            recipe.segments[0].moves.endsWith(DOWN_COMMAND)
                ? truncatedResult()
                : truncatedResult({ passed: true })
        ),
        write: (text) => written.push(text),
    });

    assert.equal(result.passed, true);
    assert.equal(result.totals.segments, 5);
    // Five segments of the same fixture: 5 * 2813 calls and 5 * 9 screens.
    assert.equal(result.totals.rng, 5 * 2813);
    assert.equal(result.totals.screens, 5 * 9);
    assert.match(written.join(''), /LEAVE LEVEL: PASS: 5 segments/u);
});
