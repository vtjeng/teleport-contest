#!/usr/bin/env node
// Admit a complete prepared C batch. JS outcomes never filter its membership.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { challengePath, challengeState, validatePreparedBatch } from './challenge-results.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';

const USAGE = 'Usage: node scripts/admit-challenge-batch.mjs --manifest <prepared.json>\n'
    + 'Requires current complete synthetic screen parity and a passing HEAD checkpoint.\n'
    + 'Writes the next immutable challenges/manifests/vN.json. Commit it, then baseline it with score-challenges.';

function verifyPreparedRecordings(root, manifest, batch) {
    if (!manifest.cases.length) throw new Error('a new batch must contain at least one C case');
    for (const entry of manifest.cases) {
        const prefix = `challenges/cases/${batch}/`;
        if (!entry.recipe.startsWith(prefix) || !entry.recording.startsWith(prefix))
            throw new Error(`new case files must be under ${prefix}`);
        if (typeof entry.reproducibility !== 'string' || !entry.reproducibility.trim())
            throw new Error(`${entry.id} needs evidence of an independent C replay`);
        const recipe = normalizeSession(JSON.parse(readFileSync(challengePath(root, entry.recipe), 'utf8')));
        const recording = normalizeSession(JSON.parse(readFileSync(challengePath(root, entry.recording), 'utf8')));
        if (recording.source === 'js' || recording.jsGroundTruth)
            throw new Error(`${entry.id} requires C recording evidence`);
        const inputs = session => session.segments.map(({ seed, datetime, nethackrc, moves }) =>
            ({ seed, datetime, nethackrc, moves }));
        if (!isDeepStrictEqual(inputs(recipe), inputs(recording)))
            throw new Error(`${entry.id} recipe and recording inputs differ`);
        if (!recording.segments.length || recording.segments.some(segment => !segment.steps.length
            || segment.steps.some(step => typeof step.screen !== 'string'
                || !Array.isArray(step.cursor) || !Array.isArray(step.rng))))
            throw new Error(`${entry.id} needs complete C screens, cursors, and RNG traces`);
    }
}

export function admitChallengeBatch(root, prepared) {
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const state = challengeState(root, undefined, head);
    if (!state.batches?.length || !state.generationReady)
        throw new Error('every admitted synthetic batch needs current complete measurements with zero unmatched screens');
    let checkpoint;
    try { checkpoint = readCheckpointResult(root, head); } catch { /* The error below explains how to recover. */ }
    if (checkpoint?.commit !== head || checkpoint.allPassed !== true
        || checkpoint.recordings?.passed !== true
        || !Number.isSafeInteger(checkpoint.score?.screensTotal) || checkpoint.score.screensTotal <= 0
        || checkpoint.score.screensMatched !== checkpoint.score.screensTotal)
        throw new Error('run a passing checkpoint at HEAD with all fixed screens matching before admitting a batch');
    const next = Math.max(...state.batches.map(entry => Number(entry.batch.slice(1)))) + 1;
    if (!Number.isSafeInteger(next)) throw new Error('invalid next batch number');
    const batch = `v${next}`;
    if (prepared.batch !== batch) throw new Error(`the next batch must be ${batch}`);
    validatePreparedBatch(root, prepared, batch);
    verifyPreparedRecordings(root, prepared, batch);
    const manifestPath = `challenges/manifests/${batch}.json`;
    const path = challengePath(root, manifestPath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(prepared, null, 2) + '\n', { flag: 'wx' });
    return { batch, manifestPath, cases: prepared.cases.length, baselineRequired: true };
}

export function main(args) {
    if (args.length === 1 && args[0] === '--help') { console.log(USAGE); return; }
    if (args.length !== 2 || args[0] !== '--manifest' || args[1].startsWith('-'))
        throw new Error(USAGE);
    const prepared = JSON.parse(readFileSync(resolve(args[1]), 'utf8'));
    console.log(JSON.stringify(admitChallengeBatch(process.cwd(), prepared), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(`admit-challenge-batch: ${error.message}`); process.exitCode = 1; }
}
