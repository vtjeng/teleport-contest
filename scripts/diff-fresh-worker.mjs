#!/usr/bin/env node

// Isolated JS replay worker for diff-fresh.mjs. Keeping contestant imports in
// this process lets the parent enforce the same timeout boundary as the judge.

import { readFileSync } from 'node:fs';

import {
    compareSessionOutputs,
    runJsSession,
} from './diff-fresh.mjs';

const RESULT_MARKER = '__FRESH_DIFF_RESULT__';

async function main() {
    const [recordingPath, scoringRoot] = process.argv.slice(2);
    if (!recordingPath || !scoringRoot) {
        throw new Error('worker requires a recording path and scoring workspace');
    }
    const recording = JSON.parse(readFileSync(recordingPath, 'utf8'));
    const jsOutput = await runJsSession(recording, scoringRoot);
    const result = compareSessionOutputs(recording, jsOutput);
    process.stdout.write(`${RESULT_MARKER}\n${JSON.stringify(result)}\n`);
}

main().catch((error) => {
    process.stderr.write(`diff-fresh-worker: ${error.message || error}\n`);
    process.exitCode = 2;
});
