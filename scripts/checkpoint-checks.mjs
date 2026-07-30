#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const GENERATED_CHECKS = [
    'check:extcmds',
    'check:monsters',
    'check:objects',
    'check:symbols',
    'check:themerooms',
];

export function checkpointCommands(focusedTests = [], {
    includeScore = true,
} = {}) {
    const commands = [];
    if (focusedTests.length) {
        commands.push({
            label: 'focused tests',
            command: process.execPath,
            args: [
                '--test',
                '--test-isolation=none',
                ...focusedTests,
            ],
        });
    }
    commands.push({
        label: 'full test suite',
        command: 'npm',
        args: ['test'],
    });
    // Informational, and ordered after the suite on purpose: a red suite makes
    // the mutator exit 2 without measuring anything, and the suite has already
    // reported that. On a clean tree there is no mutant and the run costs
    // 0.59 s, so this bills only while js/ work is uncommitted, which is when
    // an added assertion is cheapest to write.
    commands.push({
        label: 'uncommitted mutants',
        command: process.execPath,
        args: [
            'scripts/mutate-sites.mjs',
            '--worktree',
            '--kind',
            'relational,logical,boolean',
        ],
        capture: true,
        informational: true,
        summarize: summarizeMutation,
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
    if (includeScore) {
        commands.push({
            label: 'development score',
            command: process.execPath,
            args: ['scripts/score-development.mjs'],
            capture: true,
            informational: true,
            summarize: ({ stdout }) => ({
                body: summarizeDevelopmentScore(stdout),
            }),
        });
    }
    return commands;
}

export function parseCheckpointArgs(args) {
    const focusedTests = [];
    let includeScore = true;
    for (let index = 0; index < args.length; ++index) {
        const arg = args[index];
        if (arg === '--focus') {
            const testPath = args[++index];
            if (!testPath)
                throw new Error('--focus requires a test path');
            focusedTests.push(testPath);
        } else if (arg === '--skip-score') {
            includeScore = false;
        } else {
            throw new Error(`unknown checkpoint option: ${arg}`);
        }
    }
    return { focusedTests, includeScore };
}

export function runCheckpointChecks(commands, {
    run = spawnSync,
    output = console.log,
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
        const result = run(command, args, capture
            ? { encoding: 'utf8' }
            : { stdio: 'inherit' });
        const summary = summarize ? summarize(result) : {};
        if (summary.body) output(summary.body);
        if (capture && result.stderr && result.status !== 0)
            output(result.stderr.trimEnd());
        const passed = result.status === 0;
        results.push({ label, passed, informational,
            skipped: Boolean(summary.skipped), detail: summary.detail ?? '' });
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
    // An informational check carries evidence, so it never fails the run.
    return results.every(({ passed, informational }) => passed || informational);
}

/**
 * Read the mutation run's outcome for the checkpoint.
 *
 * Survivors are evidence and never a failure. The mutator exits 2 without
 * measuring anything when the tests covering the changed modules are red, and
 * the suite check above has already reported that, so this reports itself
 * skipped.
 */
export function summarizeMutation({ stdout = '', stderr = '', status }) {
    const output = `${stdout}${stderr}`;
    if (status !== 0) {
        const reason = /the unmutated tests do not pass/u.test(output)
            ? 'the tests covering the changed js/ files are red, so no mutant '
                + 'was measured'
            : `the mutator exited ${status}`;
        return { body: output.trimEnd(), detail: reason, skipped: true };
    }
    const survivors = output.split('\n')
        .filter((line) => line.startsWith('survived '));
    const summary = /^(\d+) mutant\(s\): (\d+) killed/mu.exec(output);
    if (!summary)
        return { body: output.trimEnd(), detail: 'no js/ line in scope' };
    return {
        body: output.trimEnd(),
        detail: `${survivors.length} survivor(s) of ${summary[1]} mutant(s) `
            + 'over the uncommitted js/ diff',
    };
}

export function summarizeDevelopmentScore(stdout) {
    const marker = '__RESULTS_JSON__';
    const markerIndex = stdout.lastIndexOf(marker);
    if (markerIndex < 0) return stdout.trimEnd();
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
    };
    for (const { metrics } of report.results) {
        totals.rngMatched += metrics.rngCalls.matched;
        totals.rngTotal += metrics.rngCalls.total;
        totals.screensMatched += metrics.screens.matched;
        totals.screensTotal += metrics.screens.total;
        totals.cursorsMatched += metrics.cursors.matched;
        totals.cursorsTotal += metrics.cursors.total;
    }
    return [
        `${totals.passing}/${totals.sessions} sessions fully matched`,
        `RNG ${totals.rngMatched}/${totals.rngTotal}`,
        `screens ${totals.screensMatched}/${totals.screensTotal}`,
        `cursors ${totals.cursorsMatched}/${totals.cursorsTotal}`,
        `speed ${report.speed.label}`,
    ].join('; ');
}

function main(args) {
    const options = parseCheckpointArgs(args);
    const commands = checkpointCommands(
        options.focusedTests,
        options,
    );
    if (!runCheckpointChecks(commands)) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`checkpoint-checks: ${error.message}`);
        process.exitCode = 1;
    }
}
