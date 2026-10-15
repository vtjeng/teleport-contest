#!/usr/bin/env node

// Isolated JS replay worker for diff-fresh.mjs. Keeping contestant imports in
// this process lets the parent enforce the same timeout boundary as the judge.

import { readFileSync } from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyComparisonWorkspace} from './prep-comparison.mjs';

import {
    compareSessionOutputs,
    runJsSession,
} from './diff-fresh.mjs';

const RESULT_MARKER = '__FRESH_DIFF_RESULT__';

async function main() {
    const [recordingPath, scoringRoot, comparisonCommit] = process.argv.slice(2);
    if (!recordingPath || !scoringRoot) {
        throw new Error('worker requires a recording path and scoring workspace');
    }
    const bytes = readFileSync(recordingPath);
    const recording = JSON.parse(bytes);
    const commit = comparisonCommit && verifyComparisonWorkspace(process.cwd(), scoringRoot, comparisonCommit);
    const jsOutput = await runJsSession(recording, scoringRoot);
    const result = compareSessionOutputs(recording, jsOutput);
    if (commit) {
        verifyComparisonWorkspace(process.cwd(), scoringRoot, commit);
        if (!bytes.equals(readFileSync(recordingPath))) throw new Error('comparison recording changed during replay');
        result.provenance = {commit, recordingSha256: createHash('sha256').update(bytes).digest('hex')};
    }
    process.stdout.write(`${RESULT_MARKER}\n${JSON.stringify(result)}\n`);
}

main().catch((error) => {
    process.stderr.write(`diff-fresh-worker: ${error.message || error}\n`);
    process.exitCode = 2;
});
