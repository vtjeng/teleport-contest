#!/usr/bin/env node
import {withMainWork} from './main-work.mjs';
// Admit a complete prepared C batch. JS outcomes never filter its membership.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { challengePath, challengeState, digest, validatePreparedBatch } from './challenge-results.mjs';
import { readCheckpointResult } from './checkpoint-results.mjs';
import { summarizeLedger } from './worker-state.mjs';
import { pendingMainWork } from './worker-backlog.mjs';

const USAGE = 'Usage: node scripts/admit-challenge-batch.mjs --delivery <immutable-packet.json>\n'
    + '   or: node scripts/admit-challenge-batch.mjs --manifest <prepared.json>\n'
    + '   or: node scripts/admit-challenge-batch.mjs --ledger <shared-ledger.json>\n'
    + 'Requires current complete synthetic evaluations and a passing HEAD checkpoint.\n'
    + 'The ledger route writes all accepted manifests. Commit only those manifests with\n'
    + 'an Admission-base: <HEAD> trailer; push integration-checkpoint/admission/* for hosted baselines.';

export function verifyPreparedRecordings(root, manifest, batch) {
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
        const invalidCursor = recording.segments.some(segment => segment.steps.some(step => {
            const [x, y, visible] = step.cursor;
            return step.cursor.length !== 3 || !step.cursor.every(Number.isInteger)
                || x < 0 || x >= 80 || y < 0 || y >= 24 || ![0, 1].includes(visible);
        }));
        if (invalidCursor)
            throw new Error(`${entry.id} needs valid 24x80 C cursor coordinates and visibility`);
    }
}

export function admitChallengeBatch(root, prepared) {
    return admitChallengeBatches(root, [prepared])[0];
}

export function committedBatchIds(root, head = 'HEAD') {
    return execFileSync('git', ['ls-tree', '-r', '--name-only', head, '--',
        'challenges/manifest.json', 'challenges/manifests'], {cwd: root, encoding: 'utf8'})
        .trim().split('\n').map(path => path === 'challenges/manifest.json' ? 'v1'
            : /^challenges\/manifests\/(v[1-9][0-9]*)\.json$/u.exec(path)?.[1]).filter(Boolean);
}

export function admitChallengeBatches(root, prepared) {
    return withMainWork(root, () => admitChallengeBatchesOwned(root,prepared));
}
function admitChallengeBatchesOwned(root, prepared) {
    if (!prepared.length) return [];
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    const committed = committedBatchIds(root, head);
    const state = challengeState(root, undefined, head);
    if (!committed.length || state.batches.filter(batch => committed.includes(batch.batch))
        .some(batch => batch.status !== 'measured'))
        throw new Error('every admitted synthetic batch needs current complete measurements');
    let checkpoint;
    try { checkpoint = readCheckpointResult(root, head); } catch { /* The error below explains how to recover. */ }
    if (checkpoint?.commit !== head || checkpoint.allPassed !== true
        || checkpoint.recordings?.passed !== true
        || !Number.isSafeInteger(checkpoint.score?.screensTotal) || checkpoint.score.screensTotal <= 0
        || checkpoint.score.screensMatched !== checkpoint.score.screensTotal)
        throw new Error('run a passing checkpoint at HEAD with all fixed screens matching before admitting a batch');
    const next = Math.max(...committed.map(batch => Number(batch.slice(1)))) + 1;
    if (!Number.isSafeInteger(next)) throw new Error('invalid next batch number');
    const rows = prepared.map((manifest, index) => {
        const batch = `v${next + index}`;
        if (manifest.batch !== batch) throw new Error(`the next batch must be ${batch}`);
        validatePreparedBatch(root, manifest, batch);
        verifyPreparedRecordings(root, manifest, batch);
        const manifestPath = `challenges/manifests/${batch}.json`;
        const path = challengePath(root, manifestPath);
        const contents = JSON.stringify(manifest, null, 2) + '\n';
        if (existsSync(path) && readFileSync(path, 'utf8') !== contents)
            throw new Error('admitted manifests are immutable');
        return {batch, manifestPath, cases: manifest.cases.length, baselineRequired: true, path, contents};
    });
    // Validate the whole group first. An interrupted write can be retried at the same HEAD.
    if (execFileSync('git', ['rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim() !== head)
        throw new Error('HEAD changed during admission preparation');
    for (const row of rows) {
        mkdirSync(dirname(row.path), {recursive: true});
        if (!existsSync(row.path)) writeFileSync(row.path, row.contents, {flag: 'wx'});
    }
    return rows.map(({path: _path, contents: _contents, ...row}) => row);
}

export function preparedFromDelivery(path) {
    const contents = readFileSync(path, 'utf8');
    if (basename(path) !== `${digest(contents)}.json`)
        throw new Error('immutable delivery packet hash differs');
    const packet = JSON.parse(contents);
    if (packet.context?.kind !== 'challenge-preparation'
        || packet.context.batch !== packet.manifest?.batch)
        throw new Error('delivery packet does not name its prepared challenge batch');
    return packet.manifest;
}

export function main(args) {
    if (args.length === 1 && args[0] === '--help') { console.log(USAGE); return; }
    if (args.length !== 2 || !['--manifest', '--delivery', '--ledger'].includes(args[0])
        || args[1].startsWith('-'))
        throw new Error(USAGE);
    const path = resolve(args[1]);
    if (args[0] === '--ledger') {
        const root = process.cwd(), state = summarizeLedger(JSON.parse(readFileSync(path, 'utf8')));
        if (state.coordinatorRoot !== root || Object.values(state.tasks)
            .some(task => ['integrating', 'validated'].includes(task.status)))
            throw new Error('admit at a safe coordinator boundary, not during integration');
        const prepared = pendingMainWork(state, committedBatchIds(root)).preparedBatches.map(row =>
            preparedFromDelivery(state.deliveries[row.delivery].evidence));
        return console.log(JSON.stringify({base: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
            batches: admitChallengeBatches(root, prepared)}, null, 2));
    }
    const prepared = args[0] === '--delivery'
        ? preparedFromDelivery(path)
        : JSON.parse(readFileSync(path, 'utf8'));
    console.log(JSON.stringify(admitChallengeBatch(process.cwd(), prepared), null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    try { main(process.argv.slice(2)); }
    catch (error) { console.error(`admit-challenge-batch: ${error.message}`); process.exitCode = 1; }
}
