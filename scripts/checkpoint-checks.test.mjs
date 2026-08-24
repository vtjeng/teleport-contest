import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    checkpointCommands,
    compareScoreToBaseline,
    parseCheckpointArgs,
    runCheckpointChecks,
    summarizeDevelopmentScore,
    summarizeDuplicateSymbols,
    summarizeMutation,
    summarizeReviewGate,
} from './checkpoint-checks.mjs';
import { readBaseline } from './score-baseline.mjs';

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
    // An unassigned js/ file blocks the gate silently unless the summary
    // names it: the dashboard's own line rides along after the Review line,
    // so the worker's checkpoint states which file needs
    // `npm run quality -- assign`.
    assert.equal(
        summarizeReviewGate({
            stdout: 'Quality coverage at abc12345\n\n'
                + 'Review since 12345678: clear\n'
                + 'Unassigned js/ files: js/newfile.js\n',
            status: 1,
        }).detail,
        'Review since 12345678: clear; Unassigned js/ files: js/newfile.js',
    );
});

test('the checkpoint reports duplicate symbols without gating on them', () => {
    const index = checkpointCommands([]).find(
        (entry) => entry.label.startsWith('duplicate symbols'));
    // Informational: a second definition is sometimes a module-private helper
    // that genuinely differs, so a duplicate must not fail a checkpoint.
    assert.equal(index.informational, true);
    assert.deepEqual(index.args, ['run', 'check:duplicate-symbols']);
    // The detail is the index's own two summary lines. The listing stays out
    // of the checkpoint: 282 keys would bury every check around it.
    const summary = summarizeDuplicateSymbols({
        stdout: 'isweptool: js/mondata.js:219 is_weptool (function), '
            + 'js/obj.js:44 isWeptool (function)\n'
            + 'near-miss surface: js/dungeon.js:1271 surface_typ (function), '
            + 'js/monmove.js:613 surfaceAt (function)\n'
            + 'indexed 7199 top-level definition(s) in 144 file(s); '
            + 'duplicate symbols: 282 (98 defined only as functions '
            + 'or classes)\n'
            + 'near-miss keys: 36 (102 site(s))\n',
    });
    assert.equal(
        summary.detail,
        'indexed 7199 top-level definition(s) in 144 file(s); '
            + 'duplicate symbols: 282 (98 defined only as functions '
            + 'or classes); near-miss keys: 36 (102 site(s))',
    );
    assert.equal(summary.body, undefined);
    // An index that printed no summary line says so rather than reporting a
    // blank detail, which would read as a clean run.
    assert.match(
        summarizeDuplicateSymbols({ stdout: '' }).detail,
        /no summary line/u,
    );
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
                'generated data (check:colors)',
                'generated data (check:config-statements)',
                'generated data (check:extcmds)',
                'generated data (check:glyph-offsets)',
                'generated data (check:monsters)',
                'generated data (check:objects)',
                'generated data (check:options)',
                'generated data (check:shtypes)',
                'generated data (check:symbols)',
                'generated data (check:themerooms)',
                'static sources (check:namespace-members)',
                'static sources (check:relative-imports)',
                'static sources (check:fixed-datetime)',
                'static sources (check:score-quoting)',
                'duplicate symbols (check:duplicate-symbols)',
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
        'report written: /tmp/teleport-mutation-report-fixed/report.json',
    ].join('\n');

    assert.deepEqual(summarizeMutation({ stdout, status: 0 }), {
        body: stdout,
        detail: '1 survivor(s) of 2 mutant(s) over the uncommitted js/ diff; '
            + 'report /tmp/teleport-mutation-report-fixed/report.json',
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

test('a failed host probe skips the mutation check and names the remedy',
    () => {
        // The stderr line is what the mutator's probeMutationHost() prints
        // through the CLI when a command sandbox blocks the user bus; the
        // parenthesised detail is the verbatim systemd error such a sandbox
        // produces. The summary must map it to the skip reason that tells the
        // reader to rerun outside the sandbox rather than the generic
        // exited-2 reason.
        const probed = summarizeMutation({
            stdout: '',
            stderr: 'mutate-sites: mutation host probe: user systemd is '
                + 'unreachable (Failed to connect to bus: Operation not '
                + 'permitted); a command sandbox is the likely cause, so '
                + 'rerun outside it',
            status: 2,
        });

        assert.equal(probed.skipped, true);
        assert.equal(probed.detail, 'the mutation host probe failed, so no '
            + 'mutant was measured; rerun outside the command sandbox');
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

// One scoring run's stdout, in the shape score-development.mjs prints it: a
// human-readable run, the marker, then the JSON. `sessions` maps a session
// name to its matched screens and random-number calls.
function scorerOutput(sessions) {
    return [
        'human-readable scorer output',
        `__RESULTS_JSON__${JSON.stringify({
            results: Object.entries(sessions).map(
                ([session, { screens, rngCalls }]) => ({
                    session,
                    metrics: {
                        screens: { matched: screens },
                        rngCalls: { matched: rngCalls },
                    },
                }),
            ),
        })}`,
    ].join('\n');
}

// The committed ratchet, with every session reporting exactly what it holds.
// Building the input from score-baseline.json rather than from literals is
// what keeps these cases honest as the ratchet advances.
function baselineRun(baseline) {
    const run = {};
    for (const [session, { screens, rngCalls }] of Object.entries(baseline))
        run[session] = { screens, rngCalls };
    return run;
}

test('the score check passes a run that meets the ratchet', () => {
    const baseline = readBaseline();
    assert.ok(Object.keys(baseline).length > 0, 'the ratchet holds sessions');
    assert.deepEqual(
        compareScoreToBaseline(scorerOutput(baselineRun(baseline))),
        { passed: true },
    );

    // One matched screen above the ratchet is a rise, not a drop. Together
    // with the case below this decides `now < was` against `now <= was`, which
    // differ only on the session that matched exactly its baseline.
    const [first] = Object.keys(baseline);
    const raised = baselineRun(baseline);
    raised[first].screens += 1;
    assert.deepEqual(
        compareScoreToBaseline(scorerOutput(raised)), { passed: true },
    );
});

test('the score check fails on a one-screen drop in a single session', () => {
    const baseline = readBaseline();
    const [first] = Object.keys(baseline);
    const dropped = baselineRun(baseline);
    dropped[first].screens -= 1;

    assert.deepEqual(compareScoreToBaseline(scorerOutput(dropped)), {
        passed: false,
        detail: `${first} screens ${baseline[first].screens} -> `
            + `${baseline[first].screens - 1}`,
    });
});

test('the score check watches random-number matches as well as screens', () => {
    // RATCHET_METRICS holds both, and a session can keep every screen while
    // the state behind them drifts, so a run that only watched screens would
    // pass this one.
    const baseline = readBaseline();
    const [first] = Object.keys(baseline);
    const dropped = baselineRun(baseline);
    dropped[first].rngCalls -= 1;

    assert.deepEqual(compareScoreToBaseline(scorerOutput(dropped)), {
        passed: false,
        detail: `${first} rngCalls ${baseline[first].rngCalls} -> `
            + `${baseline[first].rngCalls - 1}`,
    });
});

test('the score check fails on a session the run did not score', () => {
    const baseline = readBaseline();
    const [first] = Object.keys(baseline);
    const absent = baselineRun(baseline);
    delete absent[first];

    assert.deepEqual(compareScoreToBaseline(scorerOutput(absent)), {
        passed: false,
        detail: `${first} was not scored`,
    });
});

test('the score check abstains when it cannot read the scorer output', () => {
    // Neither arm answers `passed: false`. A scoring run that never reached
    // its marker, or printed something JSON.parse refuses, carries no ratchet
    // evidence, so the verdict falls back to the scorer's own exit status.
    assert.deepEqual(compareScoreToBaseline('the scorer crashed'), {});
    assert.deepEqual(
        compareScoreToBaseline('__RESULTS_JSON__ {not json'), {},
    );
});

test('a summarize verdict decides a check the command called green', () => {
    const output = [];
    const passed = runCheckpointChecks([
        {
            label: 'development score',
            command: 'node',
            args: ['score'],
            capture: true,
            summarize: () => ({ passed: false, detail: 'seedX screens 9 -> 8' }),
        },
        {
            // No verdict of its own, so the exit status decides. The scorer's
            // own status is nonzero here and the check still has to fail on
            // its own account above rather than borrowing this one.
            label: 'full test suite',
            command: 'npm',
            args: ['test'],
        },
    ], {
        run: (command) => ({ status: command === 'npm' ? 3 : 0, stdout: '' }),
        output: (line) => output.push(line),
    });

    assert.equal(passed, false);
    assert.equal(output.at(-2), 'FAIL  development score: seedX screens 9 -> 8');
    assert.equal(output.at(-1), 'FAIL  full test suite');
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
