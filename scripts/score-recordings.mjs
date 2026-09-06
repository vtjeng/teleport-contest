#!/usr/bin/env node

// Replays every recording under recordings/ with the port and reports how
// many matched. A recording is a recipe under recipes/ recorded with the
// patched C program; AGENTS.md, "Validate completed work", states when one
// is committed. `npm run checkpoint` runs this beside the development score
// and fails when any recording stops matching.

import { cpSync, existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localTmpdir } from './local-tmpdir.mjs';
import {
    PROJECT_ROOT,
    createScoringWorkspace,
    parseRunnerBundle,
    removeScoringWorkspace,
    runScorer,
} from './scoring-workspace.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const RECORDINGS_DIR = join(PROJECT_ROOT, 'recordings');

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

/** Totals over a runner bundle, and the recordings that did not match. */
export function summarizeRecordings(bundle) {
    const totals = { recordings: 0, passing: 0, screens: 0, screensTotal: 0,
        rng: 0, rngTotal: 0, failing: [] };
    for (const result of bundle.results) {
        totals.recordings += 1;
        if (result.passed) totals.passing += 1;
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
    if (args.length !== 0) throw new Error('arguments are not accepted');
    const recordings = listRecordings();
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
        if (child.error || child.status !== 0) throw new Error('runner failed');
        const totals = summarizeRecordings(parseRunnerBundle(child.stdout));
        for (const name of totals.failing) console.log(`  FAIL: ${name}`);
        console.log(formatSummary(totals));
        if (totals.failing.length > 0) process.exitCode = 1;
    } finally {
        if (workspace) removeScoringWorkspace(workspace);
        rmSync(flat, { recursive: true, force: true });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`score-recordings: ${error.message}`);
        process.exitCode = 1;
    });
}
