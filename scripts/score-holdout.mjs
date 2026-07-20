#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    if (args.length !== 0) throw new Error('arguments are not accepted');

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
