import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatSummary,
    goalEvaluationGate,
    isCommitAncestor,
    parseEvaluationArgs,
    parseRunnerBundle,
    reviewGateRefusal,
    summarizeBundle,
} from './score-holdout.mjs';

test('a red review gate refuses a holdout evaluation', () => {
    // execFileSync throws when the dashboard exits nonzero, so a throwing
    // runner stands in for a blocked gate. The refusal names the dashboard
    // command and the override flag, so a reader can tell a deliberate
    // exception from an oversight.
    const refusal = reviewGateRefusal(() => { throw new Error('exit 1'); });
    assert.match(refusal, /review debt blocks a holdout evaluation/u);
    assert.match(refusal, /--despite-review-debt/u);
    // A runner that returns is a clear gate: no refusal, evaluation proceeds.
    assert.equal(reviewGateRefusal(() => {}), null);
});

// A synthetic linear history. `isAncestor` answers by position, and a sha
// outside it stands for a commit this repository cannot resolve, which is
// what `git merge-base --is-ancestor` reports through status 128.
const HISTORY = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'HEAD'];

function isAncestor(ancestor, descendant) {
    const from = HISTORY.indexOf(ancestor);
    const to = HISTORY.indexOf(descendant);
    if (from < 0 || to < 0) throw new Error('unknown commit');
    return from <= to;
}

// The three goal shapes GOALS.json holds: closed with both commits recorded,
// open with `closedAt` still null, and queued with neither.
const GOALS = [
    { id: 'closed-goal', status: 'closed', openedAt: 'c1', closedAt: 'c4' },
    { id: 'open-goal', status: 'open', openedAt: 'c5', closedAt: null },
    { id: 'queued-goal', status: 'queued', openedAt: null, closedAt: null },
];

function holdoutRow(sha, note) {
    return { sha, event: 'holdout', utc: '2026-08-11T07:26:31.951Z', note };
}

function gate(goalId, rows = [], overrideReason = null) {
    return goalEvaluationGate({
        goalId, goals: GOALS, rows, isAncestor, overrideReason,
    });
}

test('a holdout evaluation names the goal it closes', () => {
    assert.match(gate(null).refusal, /--goal <id>/u);

    // A mistyped id is never echoed back: a refusal names a goal only once
    // GOALS.json is known to hold it, the rule the argument test below pins
    // for the rest of this script's input.
    const sentinel = 'goal-name-must-not-be-echoed';
    const unknown = gate(sentinel);
    assert.match(unknown.refusal, /names no goal in GOALS\.json/u);
    assert.doesNotMatch(unknown.refusal, new RegExp(sentinel));

    // A queued goal has no `openedAt`, so it spans no commits and no
    // evaluation can close it.
    assert.match(gate('queued-goal').refusal, /spans no commits/u);
});

test('an evaluation already recorded inside a goal refuses a second one', () => {
    // c3 falls inside c1..c4; c0 precedes the goal and the `goal` row at c2 is
    // a different event, so exactly one row counts against `closed-goal`.
    const rows = [
        holdoutRow('c0', 'the evaluation that closed the previous goal'),
        { sha: 'c2', event: 'goal', utc: '2026-08-11T00:00:00.000Z', note: '' },
        holdoutRow('c3', 'the evaluation that closed this goal'),
    ];

    const refused = gate('closed-goal', rows);
    assert.equal(refused.notice, null);
    assert.deepEqual(refused.warnings, []);
    assert.match(refused.refusal, /goal closed-goal already had 1 holdout/u);
    assert.match(refused.refusal, /c1\.\.c4/u);
    assert.match(
        refused.refusal,
        /c3 {2}2026-08-11 {2}the evaluation that closed this goal/u,
    );
    assert.match(refused.refusal, /--despite-prior-evaluation/u);

    // The same rows leave the open goal, which spans c5..HEAD, evaluable.
    const allowed = gate('open-goal', rows);
    assert.equal(allowed.refusal, null);
    assert.equal(allowed.notice, null);
});

test('an override records its reason and proceeds', () => {
    const rows = [holdoutRow('c3', 'the evaluation that closed this goal')];
    const reason = 'the user authorized a rerun after the scorer fix';
    const { refusal, notice, warnings } = gate('closed-goal', rows, reason);

    assert.equal(refusal, null);
    assert.deepEqual(warnings, []);
    assert.match(notice, new RegExp(reason));
    // The notice names the run it overrides and where the reason has to land,
    // because SCORE.tsv is what a later refusal prints back.
    assert.match(notice, /c3/u);
    assert.match(notice, /note column/u);
});

test('a terse override reason refuses instead of passing by reflex', () => {
    // "ok" is the reflex answer the flag exists to make impossible. The
    // 20-character floor is about four words: enough to name who authorized
    // the run and why, and too many to type without meaning it.
    const rows = [holdoutRow('c3', 'the evaluation that closed this goal')];
    const { refusal, notice } = gate('closed-goal', rows, 'ok');

    assert.equal(notice, null);
    assert.match(refusal, /at least 20 characters/u);
});

test('an override with nothing to override warns and changes nothing', () => {
    const { refusal, notice, warnings } =
        gate('open-goal', [], 'a reason nobody needed for this run');

    assert.equal(refusal, null);
    assert.equal(notice, null);
    assert.match(warnings.join('\n'), /no recorded evaluation to override/u);
});

test('a row git cannot place warns instead of refusing', () => {
    // A sha that is no longer in the history -- rebased away, or mistyped when
    // the row was appended -- belongs to no goal that can be derived, and an
    // evaluation nobody can place must not block one the rule allows.
    const rows = [holdoutRow('rebased', 'an evaluation whose commit is gone')];
    const { refusal, warnings } = gate('closed-goal', rows);

    assert.equal(refusal, null);
    assert.match(warnings.join('\n'), /rebased.*cannot resolve/u);
});

test('git places a commit by ancestry and refuses one it cannot resolve', () => {
    // The two answers that place a SCORE.tsv row in a goal: a commit is its
    // own ancestor, and it is not an ancestor of its own parent.
    assert.equal(isCommitAncestor('HEAD', 'HEAD'), true);
    assert.equal(isCommitAncestor('HEAD', 'HEAD~1'), false);
    // An all-zero sha is a well-formed name no repository holds, so git exits
    // 128. That must not read as "not an ancestor", which would silently drop
    // a recorded evaluation out of the derivation.
    assert.throws(
        () => isCommitAncestor('0'.repeat(40), 'HEAD'),
        /cannot resolve/u,
    );
});

test('parses the options an evaluation accepts', () => {
    assert.deepEqual(
        parseEvaluationArgs([
            '--goal', 'zap-command',
            '--despite-review-debt',
            '--despite-prior-evaluation', 'a recorded reason',
        ]),
        {
            goal: 'zap-command',
            despiteReviewDebt: true,
            despitePriorEvaluation: 'a recorded reason',
        },
    );
    assert.deepEqual(parseEvaluationArgs([]), {
        goal: null, despiteReviewDebt: false, despitePriorEvaluation: null,
    });

    // A value-taking option with no value, and an unknown option, both throw
    // rather than return: main() reports those without echoing what it was
    // given, which the sentinel test below pins.
    assert.throws(() => parseEvaluationArgs(['--goal']), /usage/u);
    assert.throws(() => parseEvaluationArgs(['--unknown', 'x']), /usage/u);
});

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

test('parses the final scorer result bundle', () => {
    const expected = { results: [] };
    const stdout = `diagnostic\n__RESULTS_JSON__\n${JSON.stringify(expected)}\n`;
    assert.deepEqual(parseRunnerBundle(stdout), expected);
});

test('rejects scorer output without a result bundle', () => {
    assert.throws(() => parseRunnerBundle('diagnostic only'));
    assert.throws(() => parseRunnerBundle('__RESULTS_JSON__\n{}'));
});

test('aggregates metrics without retaining sealed diagnostics', () => {
    // Distinct totals exercise pass/error counting and make a swapped or
    // double-counted screen/RNG field visible in the expected sums.
    const bundle = {
        results: [
            {
                session: 'sealed-alpha.session.json',
                passed: true,
                error: null,
                metrics: {
                    screens: { matched: 3, total: 5 },
                    rngCalls: { matched: 7, total: 11 },
                },
            },
            {
                session: 'sealed-beta.session.json',
                passed: false,
                error: 'sensitive per-session failure',
                metrics: {
                    screens: { matched: 2, total: 6 },
                    rngCalls: { matched: 1, total: 13 },
                },
            },
        ],
    };

    const summary = summarizeBundle(bundle);
    assert.deepEqual(summary, {
        sessions: { passed: 1, total: 2, errored: 1 },
        screens: { matched: 5, total: 11 },
        rngCalls: { matched: 8, total: 24 },
    });

    const output = formatSummary(summary);
    assert.doesNotMatch(output, /sealed-alpha|sealed-beta|sensitive/);
    assert.match(output, /Sessions: 1\/2 passing; 1 replay errors/);
    assert.match(output, /Screens: 5\/11 \(45\.5%\)/);
    assert.match(output, /PRNG: 8\/24 \(33\.3%\)/);
});

test('formats empty metrics without dividing by zero', () => {
    const output = formatSummary({
        sessions: { passed: 0, total: 0, errored: 0 },
        screens: { matched: 0, total: 0 },
        rngCalls: { matched: 0, total: 0 },
    });
    assert.match(output, /Screens: 0\/0 \(0\.0%\)/);
    assert.match(output, /PRNG: 0\/0 \(0\.0%\)/);
});

test('rejects arguments without echoing sealed identifiers', () => {
    const sentinel = 'sealed-session-name-must-not-leak';
    const result = spawnSync(
        process.execPath,
        [join(TEST_DIR, 'score-holdout.mjs'), sentinel],
        { encoding: 'utf8' },
    );

    // Exit status 1 distinguishes an intentional generic rejection from a
    // successful check while the sentinel verifies both output channels.
    assert.equal(result.status, 1);
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(sentinel));
    assert.match(result.stderr, /failed without exposing per-session diagnostics/);
});
