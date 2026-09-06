#!/usr/bin/env node

// The divergence queue: each development session's first mismatch against
// its recording and the C function that mismatch names, read from
// `scripts/scan-sessions.mjs --json`. `.agents/selection.md` states how the
// queue orders goals; the dashboard shows it.
//
// Usage:
//   node scripts/divergence-queue.mjs            # print the queue
//   node scripts/divergence-queue.mjs --json     # machine-readable form
//   node scripts/divergence-queue.mjs --scan <path>   # reuse a saved scan
//
// The scan replays the development sessions only and takes no path argument,
// so this queue cannot be aimed at sessions/holdout/.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    PROJECT_ROOT, cFunctions, functionOwners, jsFunctionNames,
} from './c-functions.mjs';

// `rn2(20)=13 @ makemon(makemon.c:1523)` arrives here as its caller part.
const CALLER = /^([A-Za-z_][A-Za-z0-9_]*)\(([A-Za-z0-9_.]+\.c):(\d+)\)$/u;

// A refusal message names the C function it stands in for as `name()`.
const NAMED_FUNCTION = /\b([A-Za-z_][A-Za-z0-9_]*)\(\)/u;

export function parseCaller(caller) {
    const match = caller ? CALLER.exec(caller.trim()) : null;
    if (!match) return null;
    return { function: match[1], cFile: match[2], line: Number(match[3]) };
}

/**
 * One queue entry per session that does not match completely.
 *
 * The first mismatch is the earliest of the screen mismatch, the RNG mismatch
 * with a recorded step, and a refusal the port raised. An RNG mismatch at the
 * same step as a screen mismatch wins, because the drawn value precedes the
 * screen it changes. A refusal counts at the step the port stopped emitting
 * screens; its C function comes from the `name()` its message carries, when a
 * C file defines that name.
 */
export function queueEntry(row, owners) {
    const candidates = [];
    const screen = row.divergence?.screen;
    if (screen && Number.isInteger(screen.index)) {
        candidates.push({ step: screen.index, kind: 'screen', order: 1 });
    }
    const rng = row.divergence?.rng;
    if (rng && Number.isInteger(rng.stepIndex)) {
        candidates.push({ step: rng.stepIndex, kind: 'rng', order: 0,
            caller: parseCaller(rng.cCaller) });
    }
    if (row.boundary) {
        const named = NAMED_FUNCTION.exec(row.boundary);
        const cFile = named ? owners.get(named[1]) ?? null : null;
        candidates.push({ step: row.screensEmitted, kind: 'stop', order: 2,
            caller: named && cFile ? { function: named[1], cFile, line: null } : null,
            message: row.boundary });
    }
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.step - b.step || a.order - b.order);
    const first = candidates[0];
    return {
        session: row.file.replace(/\.session\.json$/u, ''),
        step: first.step,
        kind: first.kind,
        function: first.caller?.function ?? null,
        cFile: first.caller?.cFile ?? null,
        line: first.caller?.line ?? null,
        message: first.message ?? null,
        recordedSteps: row.recordedSteps,
        remaining: row.recordedSteps - first.step,
    };
}

/**
 * The C files the queue names, ordered as `.agents/selection.md` ranks
 * goals: most sessions first, then the earliest mismatch step.
 */
export function fileOrder(entries, portedCounts) {
    const byFile = new Map();
    for (const entry of entries) {
        if (!entry.cFile) continue;
        const file = byFile.get(entry.cFile)
            ?? { cFile: entry.cFile, sessions: [], earliestStep: Infinity };
        file.sessions.push(entry.session);
        file.earliestStep = Math.min(file.earliestStep, entry.step);
        byFile.set(entry.cFile, file);
    }
    return [...byFile.values()]
        .map((file) => ({ ...file, ...(portedCounts(file.cFile)) }))
        .sort((a, b) => b.sessions.length - a.sessions.length
            || a.earliestStep - b.earliestStep
            || a.cFile.localeCompare(b.cFile));
}

export function buildQueue(scan, owners, portedCounts) {
    const sessions = scan.rows
        .map((row) => queueEntry(row, owners))
        .filter(Boolean)
        .sort((a, b) => a.step - b.step || a.session.localeCompare(b.session));
    return { sessions, files: fileOrder(sessions, portedCounts) };
}

function runScan() {
    const scan = join(PROJECT_ROOT, 'scripts', 'scan-sessions.mjs');
    const run = spawnSync(process.execPath, [scan, '--json'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) {
        throw new Error(`scan-sessions failed: ${run.stderr.trim()}`);
    }
    return JSON.parse(run.stdout);
}

function realPortedCounts() {
    const names = jsFunctionNames();
    return (cFile) => {
        const functions = cFunctions(cFile);
        return {
            functionsTotal: functions.length,
            functionsPorted: functions.filter((entry) => names.has(entry.name)).length,
        };
    };
}

export function formatQueue(queue) {
    const lines = ['Divergence queue (development sessions, first mismatch first):'];
    if (queue.sessions.length === 0) lines.push('  every session matches');
    for (const entry of queue.sessions) {
        const where = entry.function
            ? `${entry.function}() in ${entry.cFile}`
            : entry.kind === 'screen' ? 'display' : 'unresolved';
        lines.push(`  ${entry.session}: step ${entry.step} (${entry.kind}), `
            + `${where}, ${entry.remaining} of ${entry.recordedSteps} screens remain`
            + (entry.message ? `\n      ${entry.message}` : ''));
    }
    lines.push('');
    lines.push('Goal order (sessions naming the file, then earliest step):');
    if (queue.files.length === 0) lines.push('  no C file named');
    for (const file of queue.files) {
        lines.push(`  ${file.cFile}: ${file.sessions.length} session(s), earliest `
            + `step ${file.earliestStep}, ${file.functionsPorted} of `
            + `${file.functionsTotal} functions ported`);
    }
    return lines.join('\n');
}

function main(args) {
    let json = false;
    let scanPath = null;
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--json') json = true;
        else if (args[index] === '--scan') scanPath = args[++index];
        else throw new Error(`unexpected argument: ${args[index]}`);
    }
    const scan = scanPath ? JSON.parse(readFileSync(scanPath, 'utf8')) : runScan();
    const queue = buildQueue(scan, functionOwners(), realPortedCounts());
    console.log(json ? JSON.stringify(queue, null, 2) : formatQueue(queue));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`divergence-queue: ${error.message}`);
        process.exitCode = 1;
    }
}
