#!/usr/bin/env node

// Replays every recording under recordings/ with the port and reports how
// many matched. A recording is a recipe under recipes/ recorded with the
// patched C program; AGENTS.md, "Validate completed work", states when one
// is committed. `npm run checkpoint` runs this beside the development score
// and fails when any recording stops matching, or draws its random numbers
// in another input step than C did (scripts/rng-step-compare.mjs).

import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localTmpdir } from './local-tmpdir.mjs';
import { LAGGING_RECORDINGS, combineSegments } from './rng-step-compare.mjs';
import {
    PROJECT_ROOT,
    createScoringWorkspace,
    parseRunnerBundle,
    removeScoringWorkspace,
    runScorer,
    sizeBalancedBatches,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const RECORDINGS_DIR = join(PROJECT_ROOT, 'recordings');
export const USAGE = 'Usage: node scripts/score-recordings.mjs [--shard index/count]';

export function parseArgs(args) {
    if (args.length === 0) return { help: false };
    if (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
        return { help: true };
    if (args.length === 2 && args[0] === '--shard' && /^[1-9]\d*\/[1-9]\d*$/u.test(args[1])) {
        const [index, count] = args[1].split('/').map(Number);
        if (Number.isSafeInteger(index) && Number.isSafeInteger(count) && index <= count)
            return { help: false, shard: { index, count } };
    }
    throw new Error(USAGE);
}

export function selectRecordings(recordings, shard, root = RECORDINGS_DIR) {
    if (!shard) return recordings;
    const batches = sizeBalancedBatches(recordings.map(path => statSync(join(root, path)).size), shard.count);
    return (batches[shard.index - 1] ?? []).map(index => recordings[index]);
}

/** Every `*.session.json` under `root`, relative to it, sorted. */
export function listRecordings(root = RECORDINGS_DIR) {
    if (!existsSync(root)) return [];
    const found = [];
    const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) walk(path);
            else if (entry.name.endsWith('.session.json')) found.push(relative(root, path));
        }
    };
    walk(root);
    return found.sort();
}

/** The flat file name a recording gets in the scoring workspace. */
export function flatName(relativePath) {
    return relativePath.split(/[\\/]/u).join('__');
}

// LAGGING_RECORDINGS under the names the scoring workspace gives them.
const PINNED_LAGGING = new Set([...LAGGING_RECORDINGS.keys()].map(flatName));

/**
 * What is wrong with a result's per-step RNG comparison (`rngSteps`, which
 * scripts/scoring-workspace.mjs runScorer() attaches), or null. A recording
 * must be in step unless `pinned` holds it, and a pinned one must lag, so
 * the list cannot keep an entry that a fix has made stale. A recording with
 * no comparison fails: the check never passes by not running.
 */
export function rngStepProblem(result, pinned = PINNED_LAGGING) {
    const segments = result.rngSteps ?? [];
    const error = segments.find(segment => segment.error);
    if (error) return `per-step RNG comparison failed: ${error.error}`;
    const { steps, differing, first } = combineSegments(segments);
    if (!steps) return 'per-step RNG comparison did not run';
    const isPinned = pinned.has(result.session);
    if (differing && !isPinned) {
        return `${differing} of ${steps} steps draw other RNG calls than C, first at segment `
            + `${first.segment} step ${first.step} (recorded ${first.recorded}, port ${first.port})`;
    }
    if (!differing && isPinned)
        return 'in step now: remove it from LAGGING_RECORDINGS in scripts/rng-step-compare.mjs';
    return null;
}

/**
 * Totals over a runner bundle, and the recordings that did not match. A
 * recording whose replay recorded a termination violation (scripts/
 * scoring-workspace.mjs runScorer() attaches them) fails even when the
 * judge's comparison passed: something ran after the game ended. So does one
 * that gave a js/youprop.js macro the wrong argument, which the judge's
 * runSegment() records instead of throwing (js/gstate.js), and one that
 * rngStepProblem() faults; `outOfStep` holds those with the fault.
 */
export function summarizeRecordings(bundle, pinned = PINNED_LAGGING) {
    const totals = { recordings: 0, passing: 0, screens: 0, screensTotal: 0,
        rng: 0, rngTotal: 0, failing: [], outOfStep: [] };
    for (const result of bundle.results) {
        totals.recordings += 1;
        const problem = rngStepProblem(result, pinned);
        if (problem) totals.outOfStep.push({ session: result.session, problem });
        if (result.passed && !result.terminationViolations?.length
            && !result.argumentMisuses?.length && !problem) totals.passing += 1;
        else totals.failing.push(result.session);
        const screens = result.metrics?.screens ?? {};
        const rng = result.metrics?.rngCalls ?? {};
        totals.screens += screens.matched ?? 0;
        totals.screensTotal += screens.total ?? 0;
        totals.rng += rng.matched ?? 0;
        totals.rngTotal += rng.total ?? 0;
    }
    return totals;
}

export function formatSummary(totals) {
    return `recordings: ${totals.passing}/${totals.recordings} passing, `
        + `screens ${totals.screens}/${totals.screensTotal}, `
        + `rng ${totals.rng}/${totals.rngTotal}`;
}

async function main(args) {
    const options = parseArgs(args);
    if (options.help) {
        console.log(USAGE);
        return;
    }
    const recordings = selectRecordings(listRecordings(), options.shard);
    if (recordings.length === 0) {
        console.log('recordings: none under recordings/');
        return;
    }
    // The workspace helper copies files that sit directly under one
    // directory, so the tree is flattened into a scratch directory first.
    const flat = mkdtempSync(join(localTmpdir(), 'teleport-recordings-'));
    let workspace = null;
    try {
        const names = recordings.map((path) => {
            const name = flatName(path);
            cpSync(join(RECORDINGS_DIR, path), join(flat, name));
            return name;
        });
        workspace = createScoringWorkspace(flat, names);
        const child = runScorer(workspace);
        const stderr = (child.stderr || '')
            .replace(/^fatal: not a git repository[^\n]*\n?/m, '');
        if (stderr) process.stderr.write(stderr);
        if (child.error || child.status !== 0) {
            // Say why here: an error thrown from the clean-up below would
            // otherwise replace this one.
            const why = child.error?.code === 'ETIMEDOUT' ? 'timed out'
                : child.error ? child.error.message
                : child.signal ? `killed by ${child.signal}` : `exit status ${child.status}`;
            console.error(`score-recordings: runner failed (${why})`);
            throw new Error('runner failed');
        }
        const totals = summarizeRecordings(parseRunnerBundle(child.stdout));
        for (const name of totals.failing) console.log(`  FAIL: ${name}`);
        for (const { session, problem } of totals.outOfStep)
            console.log(`  STEP: ${session} (${problem})`);
        console.log(formatSummary(totals));
        if (totals.failing.length > 0) process.exitCode = 1;
    } finally {
        if (workspace) removeScoringWorkspace(workspace);
        rmSync(flat, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then(code => {
        if (code !== undefined) process.exitCode = code;
    }).catch((error) => {
        console.error(`score-recordings: ${error.message}`);
        process.exitCode = 1;
    });
}
