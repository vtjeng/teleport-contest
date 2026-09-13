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

// Opening the corpus does not change its historical membership.
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

// The corpus is open. A goal is an optional bookkeeping label, not an
// authorization gate; repeated measurements are useful after source changes.
export function parseEvaluationArgs(args) {
    if (args.length === 0) return { goal: null };
    if (args.length === 2 && args[0] === '--goal' && args[1]
        && !args[1].startsWith('--')) return { goal: args[1] };
    throw new Error('usage: score-holdout.mjs [--goal <id>] or --check');
}

export function summarizeBundle(bundle) {
    const summary = {
        sessions: { passed: 0, total: bundle.results.length, errored: 0 },
        screens: { matched: 0, total: 0 },
        rngCalls: { matched: 0, total: 0 },
        cursors: { matched: 0, total: 0 },
    };

    for (const result of bundle.results) {
        if (result.passed) summary.sessions.passed++;
        if (result.error) summary.sessions.errored++;
        summary.screens.matched += result.metrics?.screens?.matched || 0;
        summary.screens.total += result.metrics?.screens?.total || 0;
        summary.rngCalls.matched += result.metrics?.rngCalls?.matched || 0;
        summary.rngCalls.total += result.metrics?.rngCalls?.total || 0;
        summary.cursors.matched += result.metrics?.cursors?.matched || 0;
        summary.cursors.total += result.metrics?.cursors?.total || 0;
    }
    return summary;
}

function percentage(metric) {
    if (!metric.total) return '0.0%';
    return `${(100 * metric.matched / metric.total).toFixed(1)}%`;
}

export function formatSummary(summary) {
    return [
        'Local holdout (opened; aggregate scores)',
        `Sessions: ${summary.sessions.passed}/${summary.sessions.total} passing; `
            + `${summary.sessions.errored} replay errors`,
        `Screens: ${summary.screens.matched}/${summary.screens.total} `
            + `(${percentage(summary.screens)})`,
        `PRNG: ${summary.rngCalls.matched}/${summary.rngCalls.total} `
            + `(${percentage(summary.rngCalls)})`,
        `Cursors: ${summary.cursors.matched}/${summary.cursors.total} `
            + `(${percentage(summary.cursors)})`,
    ].join('\n');
}

async function main(args) {
    if (args.length === 1 && args[0] === '--check') {
        const count = sessionFiles().length;
        console.log(`Local holdout: ${count} sessions; contents not read.`);
        return;
    }
    const options = parseEvaluationArgs(args);

    if (options.goal) console.log('Goal: ' + options.goal);

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
    main(process.argv.slice(2)).catch((error) => {
        console.error('Local holdout scoring failed: ' + error.message);
        process.exitCode = 1;
    });
}
