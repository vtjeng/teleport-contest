import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    checkpointCommands,
    logCheckpointScore,
    parseCheckpointArgs,
    runCheckpointChecks,
    summarizeDevelopmentScore,
    summarizeMutation,
    summarizeReviewGate,
} from './checkpoint-checks.mjs';

test('the checkpoint surfaces the review gate without gating on it', () => {
    const gate = checkpointCommands([]).find(
        (entry) => entry.label.startsWith('review gate'));
    // Informational: .agents/review.md's gate stops implementation, and the
    // checkpoint only surfaces it, so a red gate must not fail a checkpoint.
    assert.equal(gate.informational, true);
    assert.deepEqual(gate.args, ['scripts/quality-status.mjs', '--check']);
    // The detail is the dashboard's own Review line, the one number agents
    // otherwise only see by running npm run quality themselves.
    assert.equal(
        summarizeReviewGate({
            stdout: 'Quality coverage at abc12345\n\n'
                + 'Review since 12345678: clear\n',
            status: 0,
        }).detail,
        'Review since 12345678: clear',
    );
    // Exit 1 means the gate blocks; DONE flips to FAIL on the summary line
    // while the informational flag keeps the checkpoint itself green.
    assert.equal(summarizeReviewGate({ stdout: '', status: 1 }).passed, false);
});

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
                'generated data (check:shtypes)',
                'generated data (check:symbols)',
                'generated data (check:themerooms)',
                'static sources (check:namespace-members)',
                'review gate',
                'development score',
            ],
        );
        assert.deepEqual(commands[0].args, [
            '--test',
            'scripts/dogmove.test.mjs',
            'scripts/monmove.test.mjs',
        ]);
    });

test('the focused run this Node builds actually runs its tests', () => {
    // Pinning an argument list proves nothing about whether Node will take it:
    // --focus shipped for weeks passing `--test-isolation=none`, which Node 22
    // rejects with `node: bad option` before starting a test process, and the
    // assertion above passed throughout because it compared the broken string
    // with itself. Only running the command tells an accepted option from a
    // rejected one, so this spawns it over one small file -- 23 tests, about a
    // third of a second -- and demands the tests it reports.
    const focused = checkpointCommands(['scripts/dogmove-goal.test.mjs'])
        .find(({ label }) => label === 'focused tests');
    // Node sets NODE_TEST_CONTEXT for a test file's own process, and a runner
    // that inherits it reports to its parent over the nested-runner protocol
    // instead of writing TAP, which leaves stdout empty here. The checkpoint
    // spawns this command from an ordinary process, so drop the variable.
    const environment = { ...process.env };
    delete environment.NODE_TEST_CONTEXT;
    const probe = spawnSync(focused.command, focused.args, {
        encoding: 'utf8',
        env: environment,
    });

    assert.equal(probe.status, 0,
        `${process.version} rejected ${focused.args.join(' ')}: `
            + `${probe.stderr}`);
    assert.match(probe.stdout, /^# fail 0$/mu);
});

test('the focused run isolates test files the way the full suite does', () => {
    // The two commands must agree on a verdict, so they must agree on
    // isolation. Under one shared process the whole suite reports 2,379 of
    // 2,380: state that one file freezes or installs globally outlives it.
    // `npm test` takes Node's default, one process per file, so the focused
    // run passes no isolation flag either.
    const [focused, full] = checkpointCommands(['scripts/dogmove.test.mjs']);

    assert.deepEqual(full.args, ['test']);
    assert.equal(
        focused.args.some((argument) => argument.includes('isolation')),
        false,
    );
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

test('a scoring run appends one checkpoint row and survives a bad log', () => {
    // The same scorer fixture as the summary test above: two sessions, one
    // passing, aggregating to RNG 15/30, screens 3/6, cursors 4/6.
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
    const appended = [];
    // rev-parse answers with a sha; status --porcelain answers with one
    // modified file, so the row must carry the `tree dirty` note.
    const fakeRun = (command, args) => ({
        stdout: args[0] === 'rev-parse' ? 'abc123\n' : ' M js/dogmove.js\n',
    });
    logCheckpointScore({ stdout, durationMs: 104_499 }, {
        append: (fields) => appended.push(fields),
        run: fakeRun,
    });
    assert.equal(appended.length, 1);
    assert.equal(appended[0].sha, 'abc123');
    assert.equal(appended[0].event, 'checkpoint');
    assert.equal(appended[0].sessions_passed, '1');
    assert.equal(appended[0].screens_matched, '3');
    assert.equal(appended[0].screens_total, '6');
    assert.equal(appended[0].rng_matched, '15');
    assert.equal(appended[0].note, 'tree dirty');
    // wall_s holds whole seconds: 104,499 ms rounds to 104.
    assert.equal(appended[0].wall_s, '104');

    // No __RESULTS_JSON__ marker means the scorer crashed; nothing appends.
    logCheckpointScore({ stdout: 'no marker here', durationMs: 5 }, {
        append: () => { throw new Error('must not be called'); },
        run: fakeRun,
    });

    // The row is telemetry: an appender that throws must not propagate.
    logCheckpointScore({ stdout, durationMs: 5 }, {
        append: () => { throw new Error('disk full'); },
        run: fakeRun,
    });
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
