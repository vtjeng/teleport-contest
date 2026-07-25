#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const GENERATED_CHECKS = [
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
    for (const check of GENERATED_CHECKS) {
        commands.push({
            label: `generated data (${check})`,
            command: 'npm',
            args: ['run', check],
        });
    }
    if (includeScore) {
        commands.push({
            label: 'development score',
            command: process.execPath,
            args: ['scripts/score-development.mjs'],
            capture: true,
            informational: true,
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
    } of commands) {
        output(`\n== ${label} ==`);
        const result = run(command, args, capture
            ? { encoding: 'utf8' }
            : { stdio: 'inherit' });
        if (capture && result.stdout)
            output(summarizeDevelopmentScore(result.stdout));
        if (capture && result.stderr && result.status !== 0)
            output(result.stderr.trimEnd());
        const passed = result.status === 0;
        results.push({ label, passed, informational });
    }

    output('\nCheckpoint summary');
    for (const result of results) {
        const status = result.passed && result.informational
            ? 'DONE'
            : result.passed ? 'PASS' : 'FAIL';
        output(`${status}  ${result.label}`);
    }
    return results.every(({ passed }) => passed);
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
