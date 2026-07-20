#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    PROJECT_ROOT,
    createScoringWorkspace,
    listSessionFiles,
    removeScoringWorkspace,
    runScorer,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEVELOPMENT_DIR = join(PROJECT_ROOT, 'sessions');

// Keep routine scoring on the reviewed side of the fixed 33/11 split.
const EXPECTED_DEVELOPMENT_COUNT = 33;

async function main(args) {
    if (args.length !== 0) throw new Error('arguments are not accepted');

    const files = listSessionFiles(DEVELOPMENT_DIR);
    if (files.length !== EXPECTED_DEVELOPMENT_COUNT) {
        throw new Error('development count changed');
    }

    const tempRoot = createScoringWorkspace(DEVELOPMENT_DIR, files);
    try {
        const child = runScorer(tempRoot);
        const stderr = (child.stderr || '')
            .replace(/^fatal: not a git repository[^\n]*\n?/m, '');
        if (stderr) process.stderr.write(stderr);
        if (child.stdout) process.stdout.write(child.stdout);
        if (child.error || child.status !== 0) throw new Error('runner failed');

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
    main(process.argv.slice(2)).catch(() => {
        console.error('Development scoring failed.');
        process.exitCode = 1;
    });
}
