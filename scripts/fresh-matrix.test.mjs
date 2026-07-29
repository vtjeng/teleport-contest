import assert from 'node:assert/strict';
import test from 'node:test';

import {
    chunkRecipe,
    RECORDER_SEGMENT_LIMIT,
    runFreshMatrix,
} from './fresh-matrix.mjs';

function segment(seed) {
    return {
        seed,
        datetime: '20310102030405',
        nethackrc: '',
        moves: '',
    };
}

function passingResult(segmentCount) {
    return {
        passed: true,
        error: null,
        lengths: {
            // These counts make each total visibly different while testing
            // aggregation; they do not describe a recorded game.
            rng: { c: segmentCount * 2, js: segmentCount * 2 },
            screens: { c: segmentCount * 3, js: segmentCount * 3 },
            cursors: { c: segmentCount * 4, js: segmentCount * 4 },
            animFrames: { c: segmentCount * 5, js: segmentCount * 5 },
        },
        rngMismatch: null,
        screenMismatch: null,
        cursorMismatch: null,
    };
}

function failingResult(message = 'unsupported test path') {
    return {
        ...passingResult(1),
        passed: false,
        error: message,
    };
}

test('chunks clean recipes at the recorder segment limit', () => {
    const recipe = {
        version: 5,
        // Eleven arbitrary cases exercise one full recorder chunk and a tail.
        segments: Array.from({ length: 11 }, (_, index) => segment(81000 + index)),
    };
    const chunks = chunkRecipe(recipe);

    assert.deepEqual(
        chunks.map(({ segments }) => segments.length),
        [RECORDER_SEGMENT_LIMIT, 1],
    );
    assert.deepEqual(
        chunks.flatMap(({ segments }) => segments),
        recipe.segments,
    );
    assert.throws(() => chunkRecipe(recipe, 0), /positive integer/u);
});

test('runs entries in order and totals every passing chunk', async () => {
    const entries = [
        {
            label: 'alpha',
            recipe: {
                version: 5,
                // These three arbitrary cases force a two-case chunk and tail.
                segments: [segment(82001), segment(82002), segment(82003)],
            },
        },
        {
            label: 'beta',
            recipe: { version: 5, segments: [segment(82004)] },
        },
    ];
    const seenSeeds = [];
    const verifiedSeeds = [];
    let output = '';

    const result = await runFreshMatrix({
        entries,
        summaryLabel: 'TEST MATRIX',
        chunkLimit: 2,
        verifySegment: async ({ seed }) => verifiedSeeds.push(seed),
        runDifferentialFn: async (recipe) => {
            seenSeeds.push(recipe.segments.map(({ seed }) => seed));
            return passingResult(recipe.segments.length);
        },
        write: (text) => { output += text; },
    });

    assert.equal(result.passed, true);
    assert.deepEqual(seenSeeds, [[82001, 82002], [82003], [82004]]);
    assert.deepEqual(verifiedSeeds, [82001, 82002, 82003, 82004]);
    assert.deepEqual(result.totals, {
        segments: 4,
        rng: 8,
        screens: 12,
        cursors: 16,
        animFrames: 20,
    });
    assert.match(output, /\[alpha 1\/2\] 2 segments/u);
    assert.match(output, /TEST MATRIX: PASS: 4 segments/u);
});

test('stops at the first failing chunk and keeps prior passing totals', async () => {
    const entries = [{
        label: 'failure order',
        recipe: {
            version: 5,
            // Three arbitrary cases make the second two-case chunk fail.
            segments: [segment(83001), segment(83002), segment(83003)],
        },
    }];
    let calls = 0;
    let output = '';

    const result = await runFreshMatrix({
        entries,
        summaryLabel: 'FAILURE MATRIX',
        chunkLimit: 2,
        runDifferentialFn: async (recipe) => {
            calls++;
            return calls === 1
                ? passingResult(recipe.segments.length)
                : failingResult();
        },
        write: (text) => { output += text; },
    });

    assert.equal(result.passed, false);
    assert.equal(calls, 2);
    assert.deepEqual(result.totals, {
        segments: 2,
        rng: 4,
        screens: 6,
        cursors: 8,
        animFrames: 10,
    });
    assert.deepEqual(
        { entry: result.failure.entry, chunk: result.failure.chunk },
        { entry: 'failure order', chunk: 2 },
    );
    assert.match(output, /JS error: unsupported test path/u);
    assert.match(output, /RESULT: FAIL/u);
    assert.doesNotMatch(output, /FAILURE MATRIX: PASS/u);
});
