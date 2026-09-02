import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
    chunkRecipe,
    RECORDER_SEGMENT_LIMIT,
    runFreshMatrix,
    runMatrixCli,
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

// runMatrixCli() is what every matrix script's last line calls. These drive
// it with the hooks it takes instead of the real process, so the tests neither
// set process.exitCode nor depend on the test runner's own argv.
function cliHooks(argv) {
    const calls = { written: '', exitCode: undefined };
    return {
        calls,
        hooks: {
            argv,
            write: (text) => { calls.written += text; },
            setExitCode: (status) => { calls.exitCode = status; },
        },
    };
}

// A module URL and the argv[1] that names its file, so the entry check passes.
const CLI_MODULE_URL = new URL('./run-example.mjs', import.meta.url);
const CLI_ENTRY_ARGV = ['node', fileURLToPath(CLI_MODULE_URL)];

test('runMatrixCli does nothing when the module was imported', async () => {
    let ran = 0;
    const { calls, hooks } = cliHooks(['node', '/elsewhere/other.mjs']);
    const status = await runMatrixCli(
        CLI_MODULE_URL, async () => { ran++; }, 'example', hooks,
    );
    assert.equal(status, null);
    assert.equal(ran, 0);
    assert.equal(calls.exitCode, undefined);
    assert.equal(calls.written, '');
});

test('runMatrixCli refuses arguments with status 2', async () => {
    let ran = 0;
    const { calls, hooks } = cliHooks([...CLI_ENTRY_ARGV, '--verbose']);
    const status = await runMatrixCli(
        CLI_MODULE_URL, async () => { ran++; }, 'example', hooks,
    );
    assert.equal(status, 2);
    assert.equal(calls.exitCode, 2);
    assert.equal(ran, 0);
    assert.equal(calls.written, 'example: arguments are not accepted\n');
});

test('runMatrixCli maps the matrix result to status 0 or 1', async () => {
    for (const [passed, expected] of [[true, 0], [false, 1]]) {
        const { calls, hooks } = cliHooks(CLI_ENTRY_ARGV);
        const status = await runMatrixCli(
            CLI_MODULE_URL, async () => ({ passed }), 'example', hooks,
        );
        assert.equal(status, expected);
        assert.equal(calls.exitCode, expected);
        assert.equal(calls.written, '');
    }
});

test('runMatrixCli reports a thrown error under the label with status 2', async () => {
    const { calls, hooks } = cliHooks(CLI_ENTRY_ARGV);
    const status = await runMatrixCli(
        CLI_MODULE_URL,
        async () => { throw new Error('recorder binary not found'); },
        'example',
        hooks,
    );
    assert.equal(status, 2);
    assert.equal(calls.exitCode, 2);
    assert.equal(calls.written, 'example: recorder binary not found\n');
});
