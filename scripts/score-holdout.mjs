#!/usr/bin/env node

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readGoals } from './goal-log.mjs';
import { readRows } from './score-log.mjs';
import {
    PROJECT_ROOT,
    createScoringWorkspace,
    listSessionFiles,
    parseRunnerBundle,
    removeScoringWorkspace,
    runScorer,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const HOLDOUT_DIR = join(PROJECT_ROOT, 'sessions', 'holdout');

// The split is deliberately fixed. A count change means files were moved
// across the clean-room boundary and must be reviewed before evaluation.
const EXPECTED_HOLDOUT_COUNT = 11;

function sessionFiles() {
    if (!existsSync(HOLDOUT_DIR)) throw new Error('holdout directory missing');
    const files = listSessionFiles(HOLDOUT_DIR);
    if (files.length !== EXPECTED_HOLDOUT_COUNT) {
        throw new Error('holdout count changed');
    }
    return files;
}

export { parseRunnerBundle };

// .agents/review.md, "Review scheduling": an authorized holdout evaluation is
// a review deadline, so every outstanding review completes before one runs.
// The dashboard's exit code is that rule's executable form; runCheck is
// injected so a test can stand in for the spawned dashboard.
export function reviewGateRefusal(runCheck) {
    try {
        runCheck();
        return null;
    } catch {
        return 'review debt blocks a holdout evaluation: npm run quality -- '
            + '--check is red. Clear the gate, or pass --despite-review-debt '
            + 'to record a deliberate exception.';
    }
}

// AGENTS.md, "Prevent overfitting to the holdout sessions": the user
// authorizes one evaluation at the close of each goal in advance, and an
// evaluation at any other time needs explicit authorization for that specific
// run. Which goals have already been evaluated is derived rather than stored.
// GOALS.json records the commit each goal opened and closed at, and every
// evaluation leaves a SCORE.tsv row naming the commit it ran at, so a
// recorded evaluation belongs to the goal whose commit range holds its sha.
//
// A goal spans the commits after its `openedAt` through its `closedAt`, or
// through HEAD while it is still open, which is where the run that closes it
// sits: of the five evaluations recorded by 12 August 2026, three ran at their
// goal's `closedAt` exactly, one ran at the commit immediately before it, and
// the fifth is a mid-goal attribution run inside `drop-command`. The
// derivation therefore misses an evaluation run after `close-goal` recorded
// `closedAt` and after further commits landed, which falls in the gap between
// two goals and counts against neither.

// Long enough to force a sentence rather than "ok" or "authorized", short
// enough for a terse one naming who authorized the run and why.
const MIN_OVERRIDE_REASON = 20;

// Enough of a recorded note to show whether the earlier run stated its own
// authorization. `node scripts/score-log.mjs --latest holdout` prints it whole.
const NOTE_EXCERPT = 120;

const VALUED_OPTIONS = new Set(['--goal', '--despite-prior-evaluation']);

/**
 * Options for an evaluation run.
 *
 * An unknown or incomplete option throws instead of returning a refusal,
 * because main()'s catch reports a failure without echoing what it was given.
 */
export function parseEvaluationArgs(args) {
    const options = {
        goal: null,
        despiteReviewDebt: false,
        despitePriorEvaluation: null,
    };
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--despite-review-debt') {
            options.despiteReviewDebt = true;
            continue;
        }
        if (!VALUED_OPTIONS.has(argument) || index + 1 >= args.length) {
            throw new Error('usage: score-holdout.mjs --goal <id> '
                + '[--despite-prior-evaluation <reason>] '
                + '[--despite-review-debt]');
        }
        index += 1;
        if (argument === '--goal') options.goal = args[index];
        else options.despitePriorEvaluation = args[index];
    }
    return options;
}

function shortSha(sha) {
    return sha === 'HEAD' ? 'HEAD' : sha.slice(0, 7);
}

function noteExcerpt(note) {
    if (!note) return '(no note recorded)';
    return note.length > NOTE_EXCERPT
        ? `${note.slice(0, NOTE_EXCERPT)}...`
        : note;
}

function priorEvaluationRefusal(goal, range, prior) {
    const lines = [
        `goal ${goal.id} already had ${prior.length} holdout evaluation`
        + `${prior.length === 1 ? '' : 's'} recorded in SCORE.tsv, inside the `
        + `commits it spans (${shortSha(range.from)}..${shortSha(range.to)}):`,
    ];
    for (const row of prior) {
        lines.push(`  ${row.sha}  ${row.utc.slice(0, 10)}  `
            + noteExcerpt(row.note));
    }
    lines.push('AGENTS.md authorizes one evaluation at the close of each goal '
        + 'in advance, and any other run needs authorization for that specific '
        + 'run. Pass --despite-prior-evaluation "<who authorized this run, and '
        + 'why>" to record a deliberate second evaluation.');
    return lines.join('\n');
}

function overrideNotice(goal, prior, reason) {
    return [
        `Second holdout evaluation for goal ${goal.id}, over `
        + `${prior.length} already recorded `
        + `(${prior.map((row) => row.sha).join(', ')}).`,
        `Authorization: ${reason}`,
        "Copy that reason into the note column of this run's SCORE.tsv row. A "
        + 'later refusal for this goal prints the notes of the runs it found, '
        + 'so that is where the next reader looks for it.',
    ].join('\n');
}

/**
 * Decide whether this goal may be evaluated.
 *
 * Returns the refusal to print and stop on, the notice a recorded override
 * earns, and warnings that describe the derivation without blocking it.
 * `isAncestor` is injected so a test can stand in for git, and it throws for a
 * commit this repository cannot resolve.
 */
export function goalEvaluationGate({
    goalId, goals, rows, isAncestor, overrideReason,
}) {
    const warnings = [];
    const refuse = (refusal) => ({ refusal, notice: null, warnings });

    // A refusal names a goal id only once GOALS.json is known to hold it, so a
    // mistyped argument is never echoed back.
    if (!goalId) {
        return refuse('a holdout evaluation names the goal it closes: pass '
            + '--goal <id>. `node scripts/goal-log.mjs --current` prints the '
            + 'open goal.');
    }
    const goal = goals.find((entry) => entry.id === goalId);
    if (!goal) {
        return refuse('--goal names no goal in GOALS.json. '
            + '`node scripts/goal-log.mjs --current` prints the open goal.');
    }
    if (!goal.openedAt) {
        return refuse(`goal ${goal.id} is ${goal.status} and spans no commits, `
            + 'so no evaluation closes it. Open it first with '
            + '`node scripts/goal-log.mjs open-goal`.');
    }

    const range = { from: goal.openedAt, to: goal.closedAt ?? 'HEAD' };
    const prior = [];
    for (const row of rows) {
        if (row.event !== 'holdout') continue;
        try {
            if (isAncestor(row.sha, range.to)
                && !isAncestor(row.sha, range.from)) {
                prior.push(row);
            }
        } catch {
            warnings.push(`score-holdout: SCORE.tsv holdout row ${row.sha} `
                + 'names a commit this repository cannot resolve, so it '
                + 'counts against no goal.');
        }
    }

    if (prior.length === 0) {
        if (overrideReason) {
            warnings.push('score-holdout: --despite-prior-evaluation was '
                + `passed, but goal ${goal.id} has no recorded evaluation to `
                + 'override.');
        }
        return { refusal: null, notice: null, warnings };
    }
    if (!overrideReason) {
        return refuse(priorEvaluationRefusal(goal, range, prior));
    }
    const reason = overrideReason.trim();
    if (reason.length < MIN_OVERRIDE_REASON) {
        return refuse('--despite-prior-evaluation needs a reason of at least '
            + `${MIN_OVERRIDE_REASON} characters saying who authorized a `
            + `second evaluation of ${goal.id} and why. The reason is `
            + 'recorded, not counted.');
    }
    return {
        refusal: null,
        notice: overrideNotice(goal, prior, reason),
        warnings,
    };
}

// git exits 0 for an ancestor and 1 for a commit that is not one. Any other
// status, 128 for a commit this repository does not hold, means the row cannot
// be placed in a goal at all.
export function isCommitAncestor(ancestor, descendant) {
    const result = spawnSync(
        'git',
        ['merge-base', '--is-ancestor', ancestor, descendant],
        { cwd: PROJECT_ROOT, stdio: 'ignore' },
    );
    if (result.status === 0) return true;
    if (result.status === 1) return false;
    throw new Error('git cannot resolve that commit');
}

export function summarizeBundle(bundle) {
    const summary = {
        sessions: { passed: 0, total: bundle.results.length, errored: 0 },
        screens: { matched: 0, total: 0 },
        rngCalls: { matched: 0, total: 0 },
    };

    for (const result of bundle.results) {
        if (result.passed) summary.sessions.passed++;
        if (result.error) summary.sessions.errored++;
        summary.screens.matched += result.metrics?.screens?.matched || 0;
        summary.screens.total += result.metrics?.screens?.total || 0;
        summary.rngCalls.matched += result.metrics?.rngCalls?.matched || 0;
        summary.rngCalls.total += result.metrics?.rngCalls?.total || 0;
    }
    return summary;
}

function percentage(metric) {
    if (!metric.total) return '0.0%';
    return `${(100 * metric.matched / metric.total).toFixed(1)}%`;
}

export function formatSummary(summary) {
    return [
        'Reserved holdout (aggregate only)',
        `Sessions: ${summary.sessions.passed}/${summary.sessions.total} passing; `
            + `${summary.sessions.errored} replay errors`,
        `Screens: ${summary.screens.matched}/${summary.screens.total} `
            + `(${percentage(summary.screens)})`,
        `PRNG: ${summary.rngCalls.matched}/${summary.rngCalls.total} `
            + `(${percentage(summary.rngCalls)})`,
    ].join('\n');
}

async function main(args) {
    if (args.length === 1 && args[0] === '--check') {
        const count = sessionFiles().length;
        console.log(`Reserved holdout is sealed: ${count} sessions; contents not read.`);
        return;
    }
    const options = parseEvaluationArgs(args);

    // The goal gate runs first: it answers whether this evaluation is
    // authorized at all, and it reads two committed files where the review
    // gate spawns the dashboard.
    const gate = goalEvaluationGate({
        goalId: options.goal,
        goals: readGoals().goals,
        rows: readRows(),
        isAncestor: isCommitAncestor,
        overrideReason: options.despitePriorEvaluation,
    });
    // Printed directly, for the reason the review-gate refusal below states.
    for (const warning of gate.warnings) console.error(warning);
    if (gate.refusal) {
        console.error(gate.refusal);
        process.exitCode = 1;
        return;
    }

    if (!options.despiteReviewDebt) {
        const refusal = reviewGateRefusal(() => execFileSync(
            process.execPath,
            [join(PROJECT_ROOT, 'scripts', 'quality-status.mjs'), '--check'],
            { stdio: 'ignore' },
        ));
        if (refusal) {
            // Printed directly: the generic catch below hides messages by
            // design, and this refusal precedes any holdout access.
            console.error(refusal);
            process.exitCode = 1;
            return;
        }
    }

    // Ahead of the run, so a deliberate second evaluation states itself even
    // if the run then fails.
    if (gate.notice) console.log(gate.notice);

    const files = sessionFiles();
    const tempRoot = createScoringWorkspace(HOLDOUT_DIR, files);
    try {
        const child = runScorer(tempRoot);
        if (child.error || child.status !== 0) throw new Error('runner failed');

        const bundle = parseRunnerBundle(child.stdout || '');
        if (bundle.results.length !== EXPECTED_HOLDOUT_COUNT) {
            throw new Error('runner result count changed');
        }
        console.log(formatSummary(summarizeBundle(bundle)));
    } finally {
        removeScoringWorkspace(tempRoot);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch(() => {
        console.error('Reserved holdout validation failed without exposing per-session diagnostics.');
        process.exitCode = 1;
    });
}
