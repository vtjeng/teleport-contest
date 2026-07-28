import test from 'node:test';
import assert from 'node:assert/strict';

import {
    checkpointCommands,
    parseCheckpointArgs,
    runCheckpointChecks,
    summarizeDevelopmentScore,
} from './checkpoint-checks.mjs';

test('checkpoint runs focused, full, generated, static, and score checks', () => {
    const commands = checkpointCommands([
        'scripts/dogmove.test.mjs',
        'scripts/monmove.test.mjs',
    ]);

    assert.deepEqual(
        commands.map(({ label }) => label),
        [
            'focused tests',
            'full test suite',
            'generated data (check:monsters)',
            'generated data (check:objects)',
            'generated data (check:symbols)',
            'generated data (check:themerooms)',
            'static sources (check:namespace-members)',
            'development score',
        ],
    );
    assert.deepEqual(commands[0].args, [
        '--test',
        '--test-isolation=none',
        'scripts/dogmove.test.mjs',
        'scripts/monmove.test.mjs',
    ]);
});

test('checkpoint options collect focus files and can skip scoring', () => {
    const options = parseCheckpointArgs([
        '--focus',
        'scripts/dogmove.test.mjs',
        '--focus',
        'scripts/monmove.test.mjs',
        '--skip-score',
    ]);

    assert.deepEqual(options, {
        focusedTests: [
            'scripts/dogmove.test.mjs',
            'scripts/monmove.test.mjs',
        ],
        includeScore: false,
    });
    assert.equal(
        checkpointCommands(options.focusedTests, options)
            .some(({ label }) => label === 'development score'),
        false,
    );
});

test('checkpoint runner finishes all checks and reports any failure', () => {
    const calls = [];
    const output = [];
    const passed = runCheckpointChecks([
        { label: 'focused tests', command: 'node', args: ['focused'] },
        { label: 'full test suite', command: 'npm', args: ['test'] },
    ], {
        run(command, args) {
            calls.push([command, ...args]);
            return { status: command === 'node' ? 1 : 0 };
        },
        output: (line) => output.push(line),
    });

    assert.equal(passed, false);
    assert.deepEqual(calls, [
        ['node', 'focused'],
        ['npm', 'test'],
    ]);
    assert.equal(output.at(-2), 'FAIL  focused tests');
    assert.equal(output.at(-1), 'PASS  full test suite');
});

test('development score summary keeps the checkpoint aggregates', () => {
    const stdout = [
        'human-readable scorer output',
        '__RESULTS_JSON__',
        JSON.stringify({
            speed: { label: '80+0.10/turn' },
            results: [
                {
                    passed: true,
                    metrics: {
                        rngCalls: { matched: 10, total: 10 },
                        screens: { matched: 2, total: 2 },
                        cursors: { matched: 2, total: 2 },
                    },
                },
                {
                    passed: false,
                    metrics: {
                        rngCalls: { matched: 5, total: 20 },
                        screens: { matched: 1, total: 4 },
                        cursors: { matched: 2, total: 4 },
                    },
                },
            ],
        }),
    ].join('\n');

    assert.equal(
        summarizeDevelopmentScore(stdout),
        '1/2 sessions fully matched; RNG 15/30; screens 3/6; '
            + 'cursors 4/6; speed 80+0.10/turn',
    );
});

test('checkpoint parser rejects missing or unknown options', () => {
    assert.throws(
        () => parseCheckpointArgs(['--focus']),
        /--focus requires a test path/,
    );
    assert.throws(
        () => parseCheckpointArgs(['--wat']),
        /unknown checkpoint option/,
    );
});
