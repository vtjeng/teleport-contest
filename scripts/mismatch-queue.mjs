#!/usr/bin/env node

// Each development session's first known mismatch and its source owner, read
// from `scripts/scan-sessions.mjs --json`. Declaration counts are inventory;
// they do not establish whether an implementation is complete or reachable.
//
// Usage:
//   node scripts/mismatch-queue.mjs               # print the ranked queue
//   node scripts/mismatch-queue.mjs --json        # machine-readable form
//   node scripts/mismatch-queue.mjs --scan <path> # reuse a saved scan

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    PROJECT_ROOT, cFunctions, functionOwners, jsFunctionNames,
} from './c-functions.mjs';

// Patch 004 adds Lua annotations alongside ordinary `name(file.c:line)`.
const CALLER = /^(.+)\(([A-Za-z0-9_.-]+\.(c|lua)):(\d+)\)$/u;
const LUA_PARENT = /^(.+) src=([A-Za-z0-9_.-]+\.lua):(\d+) parent=(.+)$/u;
const NAMED_FUNCTION = /\b([A-Za-z_][A-Za-z0-9_]*)\(\)/gu;
const MISSING_LOADER = /\bno loader for (?:special level )?["']([A-Za-z0-9_.-]+)["']/u;

export function parseCaller(caller) {
    const match = caller ? CALLER.exec(caller.trim()) : null;
    if (!match) return null;
    const lua = match[3] === 'lua';
    const parent = lua ? LUA_PARENT.exec(match[1]) : null;
    return {
        function: parent?.[4] ?? match[1],
        sourceFile: match[2],
        cFile: lua ? null : match[2],
        luaFile: lua ? match[2] : null,
        line: Number(match[4]),
        ...(parent ? { helper: {
            function: parent[1], luaFile: parent[2], line: Number(parent[3]),
        } } : {}),
    };
}

function refusalOwner(message, owners) {
    // A loader stub is owned by the missing Lua program, even when its
    // message also names the already-declared C dispatch function.
    const loader = MISSING_LOADER.exec(message);
    if (loader) {
        const luaFile = loader[1].endsWith('.lua') ? loader[1] : `${loader[1]}.lua`;
        return { function: null, sourceFile: luaFile, cFile: null, luaFile, line: null };
    }
    for (const named of message.matchAll(NAMED_FUNCTION)) {
        const cFile = owners.get(named[1]);
        if (cFile) return {
            function: named[1], sourceFile: cFile, cFile, luaFile: null, line: null,
        };
    }
    return null;
}

const knownStep = (step) => Number.isInteger(step) && step >= 0 ? step : null;
const stepOrder = (step) => step ?? Infinity;

/**
 * One entry per mismatching session, including mismatches without a step.
 * Positioned differences sort by step, with RNG before screen/cursor before
 * stop at a tie. Unlocated differences remain visible in `unlocatedKinds`;
 * they do not prove where a positioned difference began. When none has a
 * position, the entry has step null and requires source investigation.
 */
export function queueEntry(row, owners, declaredNames = new Set()) {
    const candidates = [];
    const rng = row.divergence?.rng;
    if (rng) candidates.push({
        step: knownStep(rng.stepIndex), kind: 'rng', order: 0,
        caller: parseCaller(rng.cCaller),
    });
    for (const [kind, order] of [['screen', 1], ['cursor', 2]]) {
        const difference = row.divergence?.[kind];
        if (difference) candidates.push({ step: knownStep(difference.index), kind, order });
    }
    if (row.boundary) candidates.push({
        step: knownStep(row.screensEmitted), kind: 'stop', order: 3,
        caller: refusalOwner(row.boundary, owners), message: row.boundary,
    });
    if (candidates.length === 0 && row.screensEmitted !== row.recordedSteps) {
        candidates.push({
            step: knownStep(Math.min(row.screensEmitted, row.recordedSteps)),
            kind: 'unresolved', order: 4,
            message: 'Emitted and recorded screen counts differ without a named mismatch.',
        });
    }
    if (candidates.length === 0 && row.divergence) candidates.push({
        step: null, kind: 'unresolved', order: 4,
        message: 'The scan reports a divergence without a recognized location.',
    });
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => stepOrder(a.step) - stepOrder(b.step) || a.order - b.order);
    const first = candidates[0];
    const fn = first.caller?.function ?? null;
    return {
        session: row.file.replace(/\.session\.json$/u, ''),
        step: first.step,
        kind: first.kind,
        function: fn,
        functionDeclared: fn !== null && first.caller.cFile !== null && declaredNames.has(fn),
        sourceFile: first.caller?.sourceFile ?? null,
        cFile: first.caller?.cFile ?? null,
        luaFile: first.caller?.luaFile ?? null,
        line: first.caller?.line ?? null,
        ...(first.caller?.helper ? { helper: first.caller.helper } : {}),
        message: first.message ?? null,
        unlocatedKinds: candidates.filter((entry) => entry.step === null).map((entry) => entry.kind),
        recordedSteps: row.recordedSteps,
        // A later blocker can consume this entire apparent opportunity. When
        // location is unknown, only the whole recording is a safe upper bound.
        remainingScreensUpperBound: Math.max(0, row.recordedSteps - (first.step ?? 0)),
    };
}

/** Rank C/Lua owners and unattributed investigations together by exposure. */
export function candidateOrder(entries, declaredCounts) {
    const grouped = new Map();
    for (const entry of entries) {
        const key = entry.sourceFile ?? `session:${entry.session}`;
        const candidate = grouped.get(key) ?? {
            kind: entry.sourceFile ? 'source' : 'source-investigation',
            sourceFile: entry.sourceFile, cFile: entry.cFile, luaFile: entry.luaFile,
            sessions: [], earliestStep: null, remainingScreensUpperBound: 0,
        };
        candidate.sessions.push(entry.session);
        if (entry.step !== null && (candidate.earliestStep === null
            || entry.step < candidate.earliestStep)) candidate.earliestStep = entry.step;
        candidate.remainingScreensUpperBound += entry.remainingScreensUpperBound;
        grouped.set(key, candidate);
    }
    return [...grouped.values()]
        .map((candidate) => ({ ...candidate,
            ...(candidate.cFile ? declaredCounts(candidate.cFile) : {}),
        }))
        .sort((a, b) => b.remainingScreensUpperBound - a.remainingScreensUpperBound
            || stepOrder(a.earliestStep) - stepOrder(b.earliestStep)
            || (a.sourceFile ?? a.sessions[0]).localeCompare(b.sourceFile ?? b.sessions[0]));
}

export function buildQueue(scan, owners, declaredCounts, declaredNames = new Set()) {
    const sessions = scan.rows
        .map((row) => queueEntry(row, owners, declaredNames))
        .filter(Boolean)
        .sort((a, b) => stepOrder(a.step) - stepOrder(b.step)
            || a.session.localeCompare(b.session));
    return {
        sessions,
        candidates: candidateOrder(sessions, declaredCounts),
        roadmapFallbackAllowed: sessions.length === 0,
    };
}

/**
 * Used by both queue-goal and open-goal. A declaration never clears a blocker.
 * Changing owner after tracing, or bypassing a higher-ranked candidate, needs
 * a recorded source-based reason. Unknown owners also need a named session.
 */
export function assertGoalSelection(queue, goal) {
    if (queue.sessions.length === 0) return;
    const sourceFile = goal.luaFile ?? goal.cFile;
    const sessions = new Set([goal.session, ...(goal.sessions ?? [])].filter(Boolean));
    const candidate = queue.candidates.find((entry) => entry.sourceFile === sourceFile)
        ?? queue.candidates.find((entry) => entry.sessions.some((session) => sessions.has(session)));
    if (!candidate) throw new Error('fixed-corpus mismatches remain; select a ranked source '
        + 'or name the mismatching session whose source trace justifies this goal');
    const reason = typeof goal.selectionReason === 'string' ? goal.selectionReason.trim() : '';
    const sameSource = candidate.sourceFile !== null && candidate.sourceFile === sourceFile;
    if (!sameSource && !reason) throw new Error('selectionReason is required to identify '
        + 'the source owner traced from the named mismatching session');
    if (candidate !== queue.candidates[0] && !reason) throw new Error('selectionReason is '
        + 'required to explain the dependency or blocker preventing the highest-ranked candidate');
    return candidate;
}

function runScan() {
    const scan = join(PROJECT_ROOT, 'scripts', 'scan-sessions.mjs');
    const run = spawnSync(process.execPath, [scan, '--json', '--include-holdout'], {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) throw new Error(`scan-sessions failed: ${run.stderr?.trim() || run.error || run.status}`);
    return JSON.parse(run.stdout);
}

export function loadMismatchQueue(scan = runScan()) {
    const declaredNames = jsFunctionNames();
    const declaredCounts = (cFile) => {
        const functions = cFunctions(cFile);
        return {
            functionsTotal: functions.length,
            functionsDeclared: functions.filter((entry) => declaredNames.has(entry.name)).length,
        };
    };
    return buildQueue(scan, functionOwners(), declaredCounts, declaredNames);
}

export function formatQueue(queue) {
    const lines = ['Mismatch queue (development and local-holdout sessions, first known mismatch):'];
    if (queue.sessions.length === 0) lines.push('  every session matches');
    for (const entry of queue.sessions) {
        const where = entry.sourceFile
            ? `${entry.function ? `${entry.function}() in ` : ''}${entry.sourceFile}`
            : 'source investigation needed';
        const tag = entry.functionDeclared ? ' [same-name declaration exists]' : '';
        lines.push(`  ${entry.session}: step ${entry.step ?? 'unknown'} (${entry.kind}), `
            + `${where}${tag}, at most ${entry.remainingScreensUpperBound} of `
            + `${entry.recordedSteps} remaining screens`
            + (entry.message ? `\n      ${entry.message}` : '')
            + (entry.unlocatedKinds.length ? `\n      ${entry.unlocatedKinds.join(', ')} `
                + 'mismatch has no step; relative ordering needs investigation' : ''));
    }
    lines.push('', 'Goal order (remaining-screen upper bounds, not predicted gains):');
    if (queue.candidates.length === 0) lines.push('  none');
    for (const candidate of queue.candidates) {
        const owner = candidate.sourceFile ?? `investigate ${candidate.sessions.join(', ')}`;
        const declarations = candidate.cFile ? `, ${candidate.functionsDeclared} of `
            + `${candidate.functionsTotal} functions declared` : '';
        lines.push(`  ${owner}: at most ${candidate.remainingScreensUpperBound} remaining screens `
            + `across ${candidate.sessions.length} session(s), earliest step `
            + `${candidate.earliestStep ?? 'unknown'}${declarations}`);
    }
    lines.push('', queue.roadmapFallbackAllowed
        ? 'Roadmap fallback: allowed (no fixed-corpus mismatches).'
        : 'Roadmap fallback: blocked while any development mismatch remains.');
    return lines.join('\n');
}

function main(args) {
    let json = false;
    let scanPath = null;
    for (let index = 0; index < args.length; index += 1) {
        if (args[index] === '--json') json = true;
        else if (args[index] === '--scan') {
            scanPath = args[++index];
            if (!scanPath || scanPath.startsWith('--')) throw new Error('--scan requires a path');
        } else throw new Error(`unexpected argument: ${args[index]}`);
    }
    const queue = scanPath ? loadMismatchQueue(JSON.parse(readFileSync(scanPath, 'utf8')))
        : loadMismatchQueue();
    console.log(json ? JSON.stringify(queue, null, 2) : formatQueue(queue));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        console.error(`mismatch-queue: ${error.message}`);
        process.exitCode = 1;
    }
}
