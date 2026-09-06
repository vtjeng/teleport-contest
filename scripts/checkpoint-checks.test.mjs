import test from 'node:test';
import assert from 'node:assert/strict';

import {
    checkpointCommands,
    compareScoreToBaseline,
    parseCheckpointArgs,
    runCheckpointChecks,
    summarizeDevelopmentScore,
    summarizeDuplicateSymbols,
    summarizeReviewGate,
} from './checkpoint-checks.mjs';
import { readBaseline } from './score-baseline.mjs';

test('the checkpoint surfaces the review gate without gating on it', () => {
    const gate = checkpointCommands().find(
        (entry) => entry.label.startsWith('review gate'));
    // Informational: .agents/review.md schedules reviews on demand, and the
    // checkpoint only surfaces the debt, so it must not fail a checkpoint.
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
    const index = checkpointCommands().find(
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

test('checkpoint runs full, generated, static, and score', () => {
    const commands = checkpointCommands();

    assert.deepEqual(
        commands.map(({ label }) => label),
        [
            'full test suite',
            'generated data (check:colors)',
            'generated data (check:config-statements)',
            'generated data (check:data-base)',
            'generated data (check:extcmds)',
            'generated data (check:glyph-offsets)',
            'generated data (check:help-data)',
            'generated data (check:monsters)',
            'generated data (check:nasties)',
            'generated data (check:objects)',
            'generated data (check:options)',
            'generated data (check:shtypes)',
            'generated data (check:symbols)',
            'generated data (check:themerooms)',
            'static sources (check:namespace-members)',
            'static sources (check:relative-imports)',
            'static sources (check:fixed-datetime)',
            'duplicate symbols (check:duplicate-symbols)',
            'review gate',
            'development score',
            'recordings corpus',
        ],
    );
});

test('checkpoint runner finishes all checks and reports any failure', () => {
    const calls = [];
    const output = [];
    const { allPassed: passed } = runCheckpointChecks([
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

test('an informational check carries evidence and never fails the run', () => {
    const output = [];
    const { allPassed: passed } = runCheckpointChecks([
        { label: 'full test suite', command: 'npm', args: ['test'] },
        {
            label: 'duplicate symbols',
            command: 'node',
            args: ['check-dup'],
            capture: true,
            informational: true,
            summarize: () => ({ body: 'body text', detail: '3 duplicate(s)' }),
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
    assert.equal(output.at(-2), 'FAIL  duplicate symbols: 3 duplicate(s)');
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
                ([session, { screens, rngCalls, cursors }]) => ({
                    session,
                    metrics: {
                        screens: { matched: screens },
                        rngCalls: { matched: rngCalls },
                        cursors: { matched: cursors },
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
    for (const [session, { screens, rngCalls, cursors }] of Object.entries(baseline))
        run[session] = { screens, rngCalls, cursors };
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

test('the score check watches cursor matches as well as screens', () => {
    // cursors is a scored column that moves independently of screens: at
    // 16ab32d, 4 of 33 sessions disagree.
    const baseline = readBaseline();
    const [first] = Object.keys(baseline);
    const dropped = baselineRun(baseline);
    dropped[first].cursors -= 1;

    assert.deepEqual(compareScoreToBaseline(scorerOutput(dropped)), {
        passed: false,
        detail: `${first} cursors ${baseline[first].cursors} -> `
            + `${baseline[first].cursors - 1}`,
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
    const { allPassed: passed } = runCheckpointChecks([
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

test('checkpoint parser accepts --verbose and rejects unknown options', () => {
    assert.deepEqual(parseCheckpointArgs([]), { verbose: false });
    assert.deepEqual(parseCheckpointArgs(['--verbose']), { verbose: true });
    assert.throws(
        () => parseCheckpointArgs(['--wat']),
        /unknown checkpoint option/,
    );
});

test('quiet mode suppresses passing output and tails failures', () => {
    const output = [];
    const failStdout = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
    const { allPassed: passed } = runCheckpointChecks([
        { label: 'full test suite', command: 'npm', args: ['test'] },
        { label: 'static check', command: 'node', args: ['check'] },
    ], {
        run(command, args, opts) {
            // quiet mode always passes encoding: 'utf8'
            assert.equal(opts?.encoding, 'utf8');
            // The full reporter stream is larger than spawnSync's default
            // buffer, so quiet capture must retain enough output to reach the
            // test runner's final summary.
            assert.equal(opts?.maxBuffer, 64 * 1024 * 1024);
            return {
                status: command === 'node' ? 1 : 0,
                stdout: command === 'node' ? failStdout : 'all good',
                stderr: '',
            };
        },
        output: (line) => output.push(line),
        verbose: false,
    });

    assert.equal(passed, false);
    // Passing check: no stdout dumped
    assert.equal(output.includes('all good'), false);
    // Failing check: last 20 lines shown, full output written to file
    assert.ok(output.some((line) => line.includes('lines written to')));
    assert.ok(output.some((line) => line.includes('line 49')));
});
