#!/usr/bin/env node
import { boundedMain } from './run-bounded.mjs';

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    PROJECT_ROOT,
    createScoringWorkspace,
    removeScoringWorkspace,
    runScorer,
    parseRunnerBundle,
} from './scoring-workspace.mjs';
import { developmentInputs, cacheDevelopmentStanding } from './development-standing.mjs';
import { fixedWorkload } from './fixed-workload.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEVELOPMENT_DIR = join(PROJECT_ROOT, 'sessions');

export const USAGE = 'Usage: node scripts/score-development.mjs';

export function parseArgs(args) {
    if (args.length === 0) return { help: false };
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
        return { help: true };
    throw new Error(USAGE);
}

async function main(args) {
    if (parseArgs(args).help) {
        console.log(USAGE);
        return;
    }

    const inputs = developmentInputs();
    const { scoringEntries } = fixedWorkload();

    const tempRoot = createScoringWorkspace(DEVELOPMENT_DIR, scoringEntries);
    try {
        const child = runScorer(tempRoot);
        const stderr = (child.stderr || '')
            .replace(/^fatal: not a git repository[^\n]*\n?/m, '');
        if (stderr) process.stderr.write(stderr);
        if (child.stdout) process.stdout.write(child.stdout);
        if (child.error || child.status !== 0) throw new Error('runner failed');
        cacheDevelopmentStanding(inputs, parseRunnerBundle(child.stdout));

        const cacheSource = join(tempRoot, '.cache', 'session-results.json');
        if (existsSync(cacheSource)) {
            const cacheDir = join(PROJECT_ROOT, '.cache');
            mkdirSync(cacheDir, { recursive: true });
            cpSync(cacheSource, join(cacheDir, 'session-results.json'));
        }
    } finally {
        removeScoringWorkspace(tempRoot);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    boundedMain('full', () => main(process.argv.slice(2))).then(code => {
        if (code !== undefined) process.exitCode = code;
    }).catch((error) => {
        console.error(`Development scoring failed: ${error.message}`);
        process.exitCode = 1;
    });
}
