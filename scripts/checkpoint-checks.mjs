#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
    compareToBaseline,
    currentFromResults,
    describeDrops,
    readBaseline,
} from './score-baseline.mjs';

const GENERATED_CHECKS = [
    'check:colors',
    'check:config-statements',
    'check:data-base',
    'check:extcmds',
    'check:glyph-offsets',
    'check:help-data',
    'check:monsters',
    'check:nasties',
    'check:objects',
    'check:options',
    'check:shtypes',
    'check:symbols',
    'check:themerooms',
];

// The default test suite emits more than Node's 1 MiB spawnSync capture
// buffer.  Keep the complete reporter stream so the wrapper can reach its
// final exit status and summary instead of failing with an incomplete log.
const CHECKPOINT_CAPTURE_MAX_BUFFER = 64 * 1024 * 1024;

export function checkpointCommands() {
    const commands = [];
    commands.push({
        label: 'full test suite',
        command: 'npm',
        args: ['test'],
    });
    for (const check of GENERATED_CHECKS) {
        commands.push({
            label: `generated data (${check})`,
            command: 'npm',
            args: ['run', check],
        });
    }
    // Not a generated-data comparison: this one reads the hand-written sources
    // in js/ and scripts/ and rejects a namespace member that no module
    // exports. See scripts/check-namespace-members.mjs.
    commands.push({
        label: 'static sources (check:namespace-members)',
        command: 'npm',
        args: ['run', 'check:namespace-members'],
    });
    // Also static, and about what leaves this repository rather than what runs
    // in it: the judge imports js/ with no node_modules and no import map, so
    // one bare or `node:` specifier fails the submission at load time. See
    // scripts/check-relative-imports.mjs.
    commands.push({
        label: 'static sources (check:relative-imports)',
        command: 'npm',
        args: ['run', 'check:relative-imports'],
    });
    // Also static, and about the tests rather than the port: recorder patch
    // 001 leaves calendar.c getnow() falling back to the wall clock on a
    // datetime it cannot parse, so a malformed literal in a test or a recipe
    // hands that test a live clock and makes its output depend on when it ran.
    // See scripts/check-fixed-datetime.mjs.
    commands.push({
        label: 'static sources (check:fixed-datetime)',
        command: 'npm',
        args: ['run', 'check:fixed-datetime'],
    });
    // Informational: a name defined twice is sometimes a module-private helper
    // that genuinely differs from its namesake, and only a reader who knows the
    // C function can tell that from a divergent duplicate port. The listing
    // stays in the check's own output; only its count rides the summary.
    commands.push({
        label: 'duplicate symbols (check:duplicate-symbols)',
        command: 'npm',
        args: ['run', 'check:duplicate-symbols'],
        capture: true,
        informational: true,
        summarize: summarizeDuplicateSymbols,
    });
    // Informational: compares JS constant values against C #define values.
    // A mismatch is a copy error worth investigating, but conditional #ifdef
    // values produce false positives, so the check is informational.
    commands.push({
        label: 'constants vs C headers (check:constants)',
        command: 'npm',
        args: ['run', 'check:constants'],
        capture: true,
        informational: true,
        summarize: (result) => {
            const last = result.stdout.trim().split('\n').at(-1) ?? '';
            const skipped = last.includes('skipping');
            return { passed: result.status === 0, body: last, skipped };
        },
    });
    // Informational: .agents/review.md schedules reviews on demand, and this
    // line puts the unreviewed debt in the one output every agent already
    // reads, so the reader can decide whether a pass is warranted.
    commands.push({
        label: 'review gate',
        command: process.execPath,
        args: ['scripts/quality-status.mjs', '--check'],
        capture: true,
        informational: true,
        summarize: summarizeReviewGate,
    });
    commands.push({
        label: 'development score',
        command: process.execPath,
        args: ['scripts/score-development.mjs'],
        capture: true,
        summarize: (result) => ({
            body: summarizeDevelopmentScore(result.stdout),
            ...compareScoreToBaseline(result.stdout),
        }),
    });
    // The recordings corpus: recipes recorded with the C program and
    // committed under recordings/. Every one must keep matching.
    commands.push({
        label: 'recordings corpus',
        command: process.execPath,
        args: ['scripts/score-recordings.mjs'],
        capture: true,
        summarize: (result) => ({
            passed: result.status === 0,
            body: result.stdout.trim().split('\n').at(-1) ?? '',
        }),
    });
    commands.push({
        label: 'end-of-input over-read',
        command: process.execPath,
        args: ['scripts/check-overread.mjs'],
        capture: true,
        summarize: (result) => {
            const last = result.stdout.trim().split('\n').at(-1) ?? '';
            const skipped = last.includes('skipping');
            return { passed: result.status === 0, body: last, skipped };
        },
    });
    return commands;
}

export function parseCheckpointArgs(args) {
    let verbose = false;
    for (const arg of args) {
        if (arg === '--verbose') {
            verbose = true;
        } else {
            throw new Error(`unknown checkpoint option: ${arg}`);
        }
    }
    return { verbose };
}

export function runCheckpointChecks(commands, {
    run = spawnSync,
    output = console.log,
    verbose = false,
} = {}) {
    const results = [];
    for (const {
        label,
        command,
        args,
        capture = false,
        informational = false,
        summarize = null,
    } of commands) {
        output(`\n== ${label} ==`);
        const useCapture = capture || !verbose;
        const result = run(command, args, useCapture
            ? {
                encoding: 'utf8',
                maxBuffer: CHECKPOINT_CAPTURE_MAX_BUFFER,
            }
            : { stdio: 'inherit' });
        const summary = summarize ? summarize(result) : {};
        if (summary.body) output(summary.body);
        if (useCapture && result.status !== 0) {
            const full = [result.stdout, result.stderr]
                .filter(Boolean).join('\n').trimEnd();
            if (full) {
                const lines = full.split('\n');
                const slug = label.replace(/[^a-z0-9]+/gi, '-');
                const logPath = join('/tmp', `checkpoint-${slug}.log`);
                writeFileSync(logPath, full + '\n');
                const TAIL = 20;
                if (lines.length > TAIL) {
                    output(`  (${lines.length} lines written to ${logPath})`);
                }
                output(lines.slice(-TAIL).join('\n'));
            }
        }
        // A summarize may decide the verdict. The score check reads its own
        // ratchet, so a run that exits 0 while a session matched fewer screens
        // than its baseline still fails.
        const passed = summary.passed ?? (result.status === 0);
        const entry = { label, passed, informational,
            skipped: Boolean(summary.skipped), detail: summary.detail ?? '' };
        if (label === 'development score' && capture) entry.stdout = result.stdout;
        results.push(entry);
    }

    output('\nCheckpoint summary');
    for (const result of results) {
        const status = result.skipped ? 'SKIP'
            : result.passed && result.informational ? 'DONE'
                : result.passed ? 'PASS' : 'FAIL';
        // The detail rides the summary line because `.agents/validation.md` has
        // agents read the tail of the log, which the body never reaches.
        output(`${status}  ${result.label}`
            + (result.detail ? `: ${result.detail}` : ''));
    }
    // A skipped check ran nothing and has nothing to say. An informational one
    // carries evidence and no verdict, so it cannot fail either.
    const allPassed = results.every(({ passed, informational, skipped }) =>
        passed || informational || skipped);
    return { allPassed, results };
}

/**
 * Read the review gate's state for the checkpoint summary.
 *
 * The detail carries the dashboard's Review line and, when one prints, its
 * Unassigned js/ files line, so the checkpoint a worker already runs names
 * the file it forgot to assign with `npm run quality -- assign`.
 */
export function summarizeReviewGate({ stdout = '', status }) {
    const lines = stdout.split('\n');
    const review = lines.find((line) => line.startsWith('Review since '));
    const unassigned = lines.find(
        (line) => line.startsWith('Unassigned js/ files: '));
    return {
        passed: status === 0,
        detail: [review ?? 'no review line in quality output', unassigned]
            .filter(Boolean).join('; '),
    };
}

/**
 * Read the duplicate-symbol index for the checkpoint.
 *
 * The detail is the index's own two summary lines, and the listing is
 * deliberately left off the checkpoint's output: 282 keys at the time of
 * writing would bury the checks around it, and the counts are what tell a
 * reader whether their own commit added one. Both counts ride here because the
 * exact index alone answered nothing for a duplicate that differs by a suffix.
 */
export function summarizeDuplicateSymbols({ stdout = '' }) {
    const lines = stdout.split('\n');
    const summary = lines.find((line) => line.startsWith('indexed '));
    const nearMiss = lines.find((line) => line.startsWith('near-miss keys: '));
    return {
        detail: [
            summary ?? 'no summary line in the duplicate-symbol index',
            nearMiss,
        ].filter(Boolean).join('; '),
    };
}

/**
 * Compare a scoring run against the per-session ratchet.
 *
 * Returns a verdict the checkpoint honours. `scripts/score-baseline.mjs` states
 * why the ratchet is per session and why a drop is worth stopping for.
 */
export function compareScoreToBaseline(stdout) {
    const marker = '__RESULTS_JSON__';
    const index = stdout.lastIndexOf(marker);
    if (index < 0) return {};
    let results;
    try {
        ({ results } = JSON.parse(stdout.slice(index + marker.length).trim()));
    } catch {
        return {};
    }
    const comparison = compareToBaseline(
        currentFromResults(results ?? []), readBaseline());
    const failed = comparison.drops.length > 0 || comparison.missing.length > 0;
    if (!failed) return { passed: true };
    return { passed: false, detail: describeDrops(comparison) };
}

export function developmentTotals(stdout) {
    const marker = '__RESULTS_JSON__';
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) return null;
    const jsonLine = stdout.slice(markerIndex + marker.length)
        .trimStart()
        .split(/\r?\n/u, 1)[0];
    const report = JSON.parse(jsonLine);
    const totals = {
        sessions: report.results.length,
        passing: report.results.filter(({ passed }) => passed).length,
        rngMatched: 0,
        rngTotal: 0,
        screensMatched: 0,
        screensTotal: 0,
        cursorsMatched: 0,
        cursorsTotal: 0,
        speedLabel: report.speed.label,
    };
    for (const { metrics } of report.results) {
        totals.rngMatched += metrics.rngCalls.matched;
        totals.rngTotal += metrics.rngCalls.total;
        totals.screensMatched += metrics.screens.matched;
        totals.screensTotal += metrics.screens.total;
        totals.cursorsMatched += metrics.cursors.matched;
        totals.cursorsTotal += metrics.cursors.total;
    }
    return totals;
}

export function summarizeDevelopmentScore(stdout) {
    const totals = developmentTotals(stdout);
    if (!totals) return stdout.trimEnd();
    return [
        `${totals.passing}/${totals.sessions} sessions fully matched`,
        `RNG ${totals.rngMatched}/${totals.rngTotal}`,
        `screens ${totals.screensMatched}/${totals.screensTotal}`,
        `cursors ${totals.cursorsMatched}/${totals.cursorsTotal}`,
        `speed ${totals.speedLabel}`,
    ].join('; ');
}

// A scoring run writes no SCORE.tsv row. It ran on whatever the working tree
// held, which is usually not HEAD, so the row it used to append named a commit
// that had not produced its figures; `.agents/scoring.md` has the orchestrator
// record a row at each event instead, when the tree is committed. The score's
// verdict never depended on the row: compareScoreToBaseline() alone decides it.

const SUMMARY_PATH = new URL('../.cache/checkpoint-summary.json',
    import.meta.url);

export function writeCheckpointSummary(results) {
    const commit = spawnSync('git', ['rev-parse', 'HEAD'],
        { encoding: 'utf8' }).stdout.trim();
    const testEntry = results.find(({ label }) => label === 'full test suite');
    const scoreEntry = results.find(
        ({ label }) => label === 'development score');
    const summary = {
        commit,
        timestamp: new Date().toISOString(),
        allPassed: results.every(({ passed, informational, skipped }) =>
            passed || informational || skipped),
        tests: { passed: testEntry?.passed ?? false },
        score: scoreEntry?.stdout
            ? developmentTotals(scoreEntry.stdout)
            : null,
    };
    const dest = fileURLToPath(SUMMARY_PATH);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, JSON.stringify(summary, null, 2) + '\n');
}

function main(args) {
    const { verbose } = parseCheckpointArgs(args);
    const status = spawnSync('git', ['status', '--porcelain'],
        { encoding: 'utf8' }).stdout.trim();
    if (status) {
        console.error(
            'npm run checkpoint: working tree is not clean.'
            + ' Commit before running checkpoint.');
        process.exit(1);
    }
    const commands = checkpointCommands();
    const { allPassed, results } = runCheckpointChecks(commands, { verbose });
    writeCheckpointSummary(results);
    if (!allPassed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`checkpoint-checks: ${error.message}`);
        process.exitCode = 1;
    }
}
