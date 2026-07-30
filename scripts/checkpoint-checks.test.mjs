import test from 'node:test';
import assert from 'node:assert/strict';

import {
    checkpointCommands,
    parseCheckpointArgs,
    runCheckpointChecks,
    summarizeDevelopmentScore,
    summarizeMutation,
} from './checkpoint-checks.mjs';

test('checkpoint runs focused, full, mutants, generated, static, and score',
    () => {
        const commands = checkpointCommands([
            'scripts/dogmove.test.mjs',
            'scripts/monmove.test.mjs',
        ]);

        assert.deepEqual(
            commands.map(({ label }) => label),
            [
                'focused tests',
                'full test suite',
                'uncommitted mutants',
                'generated data (check:extcmds)',
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

test('the mutation check reports survivors on its summary line', () => {
    // `.agents/validation.md` has agents read the tail of the checkpoint log,
    // which holds the summary lines and none of the bodies, so the count has to
    // ride the summary line.
    const stdout = [
        'js/lock.js: 3 line(s) in scope, 2 site(s), 2 mutant(s) [logical 2], 1',
        'verdict: the first wave only, so a survivor below may still be killed',
        'survived js/lock.js:29:50: logical `||` -> `&&` (first wave was 1)',
        'killed js/lock.js:29:28: logical `||` -> `&&` (first wave: lock.test)',
        '2 mutant(s): 1 killed, 1 survived, 0 timed out; 0.9 s of test time',
    ].join('\n');

    assert.deepEqual(summarizeMutation({ stdout, status: 0 }), {
        body: stdout,
        detail: '1 survivor(s) of 2 mutant(s) over the uncommitted js/ diff',
    });

    // A clean tree puts no line in scope, so the mutator prints no summary.
    assert.equal(
        summarizeMutation({ stdout: '0 file(s), 0 line(s) in scope', status: 0 })
            .detail,
        'no js/ line in scope',
    );
});

test('a red covering suite skips the mutation check instead of failing it',
    () => {
        // The mutator exits 2 without measuring anything when the tests
        // covering the changed modules fail, and the suite check above has
        // already reported that. Reporting this one as failed would name the
        // same problem twice.
        const red = summarizeMutation({
            stdout: '',
            stderr: 'mutate-sites: the unmutated tests do not pass, so no '
                + 'mutant result would be meaningful',
            status: 2,
        });

        assert.equal(red.skipped, true);
        assert.equal(red.detail, 'the tests covering the changed js/ files are '
            + 'red, so no mutant was measured');
        // Any other nonzero exit is skipped too, and says which code it was.
        assert.equal(summarizeMutation({ stdout: 'boom', status: 3 }).detail,
            'the mutator exited 3');
    });

test('an informational check carries evidence and never fails the run', () => {
    const output = [];
    const passed = runCheckpointChecks([
        { label: 'full test suite', command: 'npm', args: ['test'] },
        {
            label: 'uncommitted mutants',
            command: 'node',
            args: ['mutate'],
            capture: true,
            informational: true,
            summarize: () => ({ body: 'body text', detail: '3 survivor(s)' }),
        },
        {
            label: 'development score',
            command: 'node',
            args: ['score'],
            capture: true,
            informational: true,
            summarize: () => ({ body: 'score body', skipped: true }),
        },
    ], {
        run: (command) => ({ status: command === 'node' ? 2 : 0, stdout: '' }),
        output: (line) => output.push(line),
    });

    // Both informational checks exited nonzero and the run still passes: they
    // carry evidence, and the suite is what decides.
    assert.equal(passed, true);
    assert.equal(output.at(-3), 'PASS  full test suite');
    // The detail rides the summary line; a skipped check says SKIP.
    assert.equal(output.at(-2), 'FAIL  uncommitted mutants: 3 survivor(s)');
    assert.equal(output.at(-1), 'SKIP  development score');
    assert.equal(output.includes('body text'), true);
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
