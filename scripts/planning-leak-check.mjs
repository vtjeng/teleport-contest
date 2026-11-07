#!/usr/bin/env node

// Replays recordings in a scoring workspace instrumented by
// scripts/planning-leak-lib.mjs and fails if a planning pass produced any
// live effect, or if js/gstate.js's guard stopped a planning pass that reached
// the live game. By default it replays every recording under recordings/ and
// the 44 sessions directly under sessions/ and sessions/holdout/.
//
// Usage: node scripts/planning-leak-check.mjs [--shard i/n] [--jobs n]
//          [--out results.jsonl] [--list file] [recording...]
// --list names a file of recording paths, one per line; paths given on the
// command line are replayed instead of the default set.

import { spawn } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { instrumentPlanningLeakWorkspace, LINE_MARKER } from './planning-leak-lib.mjs';
import { listRecordings, RECORDINGS_DIR } from './score-recordings.mjs';
import { createScoringWorkspace, PROJECT_ROOT, removeScoringWorkspace, sizeBalancedBatches } from './scoring-workspace.mjs';

const REPLAY = join(PROJECT_ROOT, 'scripts', 'planning-leak-replay.mjs');
const FILES_PER_CHILD = 20;
export const GUARD_ERROR = 'planning pass reached the live game';

export function defaultRecordingSet() {
    const sessions = ['sessions', 'sessions/holdout'].flatMap((dir) =>
        readdirSync(join(PROJECT_ROOT, dir), { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.session.json'))
            .map((entry) => join(PROJECT_ROOT, dir, entry.name)));
    return [...listRecordings().map((path) => join(RECORDINGS_DIR, path)), ...sessions.sort()];
}

// A row fails when the plan produced a live effect, or when the guard in
// js/gstate.js refused a planning pass's use of `game`.
export function rowFindings(row) {
    const findings = (row.leaks ?? []).map((leak) => `${leak.kind} at ${leak.site} (from ${leak.entry}), ${leak.count}x`);
    if (row.jsError?.includes(GUARD_ERROR)) findings.push(row.jsError);
    return findings;
}

function runChild(root, files) {
    return new Promise((resolveRun) => {
        const child = spawn(process.execPath, [REPLAY, root, ...files], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.setEncoding('utf8').on('data', (chunk) => { out += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk) => { err = (err + chunk).slice(-4000); });
        child.on('close', (code) => {
            const rows = out.split('\n').filter((line) => line.startsWith(LINE_MARKER))
                .map((line) => JSON.parse(line.slice(LINE_MARKER.length)));
            const seen = new Set(rows.map((row) => row.file));
            for (const file of files) {
                if (!seen.has(file))
                    rows.push({ file, jsError: `replay process exited ${code} before this recording finished: ${err.slice(-500)}`, leaks: [] });
            }
            resolveRun(rows);
        });
    });
}

// Replay `files` in one instrumented workspace. `prepare(root)`, if given,
// edits the workspace after instrumentation (the test injects leaks with it).
export async function runPlanningLeakCheck(files, { jobs = 1, onRow = null, prepare = null } = {}) {
    const chunks = [];
    for (let i = 0; i < files.length; i += FILES_PER_CHILD) chunks.push(files.slice(i, i + FILES_PER_CHILD));
    const root = createScoringWorkspace(join(PROJECT_ROOT, 'sessions'), []);
    const rows = [];
    const failing = [];
    try {
        instrumentPlanningLeakWorkspace(root);
        prepare?.(root);
        let next = 0;
        const lane = async () => {
            while (next < chunks.length) {
                for (const row of await runChild(root, chunks[next++])) {
                    rows.push(row);
                    onRow?.(row);
                    const findings = rowFindings(row);
                    if (findings.length) failing.push({ file: relative(PROJECT_ROOT, row.file), findings });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.max(1, jobs) }, lane));
    } finally {
        removeScoringWorkspace(root);
    }
    return { rows, failing };
}

async function main(args) {
    let shard = null;
    let jobs = Math.max(1, Math.min(4, availableParallelism() - 1));
    let out = null;
    const files = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--shard') {
            const [index, count] = args[++i].split('/').map(Number);
            shard = { index, count };
        } else if (args[i] === '--jobs') jobs = Number(args[++i]);
        else if (args[i] === '--out') out = resolve(args[++i]);
        else if (args[i] === '--list') files.push(...readFileSync(args[++i], 'utf8').split('\n').filter(Boolean));
        else files.push(args[i]);
    }
    let selected = (files.length ? files : defaultRecordingSet()).map((f) => (isAbsolute(f) ? f : resolve(f)));
    if (shard) {
        const sizes = selected.map((f) => readFileSync(f).length);
        selected = (sizeBalancedBatches(sizes, shard.count)[shard.index - 1] ?? []).map((index) => selected[index]);
    }
    if (out) writeFileSync(out, '');
    const { rows, failing } = await runPlanningLeakCheck(selected, { jobs, onRow: out ? (row) => appendFileSync(out, `${JSON.stringify(row)}\n`) : null });
    const crashed = rows.filter((row) => row.jsError && !row.jsError.includes(GUARD_ERROR)).length;
    const replayed = rows.length;
    for (const { file, findings } of failing) {
        console.log(`${file}:`);
        for (const finding of findings) console.log(`  ${finding}`);
    }
    console.log(`planning leaks: ${failing.length} of ${replayed} recordings leak`
        + (crashed ? `; ${crashed} other replay errors (not planning leaks; scored elsewhere)` : ''));
    return failing.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
    process.exitCode = await main(process.argv.slice(2));
