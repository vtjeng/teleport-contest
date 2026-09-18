#!/usr/bin/env node
import { boundedMain } from './run-bounded.mjs';

// Each fixed-workload session's first known mismatch and its source owner, read
// from `scripts/scan-sessions.mjs --json`. Declaration counts are inventory;
// they do not establish whether an implementation is complete or reachable.
//
// Usage:
//   node scripts/mismatch-queue.mjs               # print the ranked queue
//   node scripts/mismatch-queue.mjs --json        # machine-readable form
//   node scripts/mismatch-queue.mjs --scan <path> # reuse a saved scan

import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    PROJECT_ROOT, cFunctions, functionOwners, jsFunctionNames,
} from './c-functions.mjs';
import * as challengeResults from './challenge-results.mjs';
import { readInvestigation, syntheticSessionParts } from './investigation-cache.mjs';
import { normalizeSession } from '../frozen/session_loader.mjs';
import { diagnosticToolIdentity } from './scan-sessions.mjs';

// Patch 004 adds Lua annotations alongside ordinary `name(file.c:line)`.
const CALLER = /^(.+)\(([A-Za-z0-9_.-]+\.(c|lua)):(\d+)\)$/u;
const LUA_PARENT = /^(.+) src=([A-Za-z0-9_.-]+\.lua):(\d+) parent=(.+)$/u;
const NAMED_FUNCTION = /\b([A-Za-z_][A-Za-z0-9_]*)\(\)/gu;
const MISSING_LOADER = /\bno loader for (?:special level )?["']([A-Za-z0-9_.-]+)["']/u;

export const USAGE = `Usage: node scripts/mismatch-queue.mjs [--json] [--work|--fixed] [--scan <path>]

Print the combined fixed-regression and synthetic work queue with --work.
The default remains the fixed 44-session queue for older callers; --fixed is
explicit. Sessions sort by measured remaining screens; select only entries
with complete, current investigations. Use --scan with a saved fixed scan.`;

const BATCH = /^v[1-9][0-9]*$/u;
const CASE_ID = /^[a-z0-9][a-z0-9-]*$/u;

export function syntheticSessionId(batch, caseId) {
    if (!BATCH.test(batch) || !CASE_ID.test(caseId))
        throw new Error('synthetic batch and case IDs must be path-safe');
    return `synthetic/${batch}/${caseId}`;
}

export function readSyntheticBatches(root = PROJECT_ROOT, { state = null } = {}) {
    // challengeState validates the admitted catalog, every saved evaluation,
    // and SCORE.tsv freshness. This queue only consumes that API; it does not
    // infer a batch by walking challenge directories.
    const current = state ?? challengeResults.challengeState(root);
    if (!current || !Array.isArray(current.batches))
        throw new Error('challengeState API is required for the synthetic work queue');
    return current.batches.filter(batch => batch?.admitted !== false).map(batch => ({
        ...batch,
        replayInputSha256: batch.replayInputSha256
            ?? batch.freshness?.expected ?? null,
    }));
}

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

function count(value) {
    return value && Number.isSafeInteger(value.matched)
        && Number.isSafeInteger(value.total) && value.matched >= 0
        && value.total >= value.matched ? value : null;
}

function recordingSteps(root, entry) {
    const path = entry.recording && join(root, entry.recording);
    if (!path || !existsSync(path) || lstatSync(path).isSymbolicLink()) return null;
    let data;
    try { data = JSON.parse(readFileSync(path, 'utf8')); }
    catch { return null; }
    if (!data) return null;
    try {
        return normalizeSession(data).segments.reduce(
            (sum, segment) => sum + (segment.steps?.length ?? 0), 0);
    } catch { return null; }
}

function diagnosticStep(diagnostic) {
    if (!diagnostic || typeof diagnostic !== 'object') return null;
    const values = [diagnostic.step, diagnostic.stepIndex, diagnostic.index,
        diagnostic.screen?.step, diagnostic.screen?.index,
        diagnostic.cursor?.step, diagnostic.cursor?.index,
        diagnostic.rng?.stepIndex, diagnostic.rng?.index];
    return values.map(knownStep).find(value => value !== null) ?? null;
}

function diagnosticKind(diagnostic, metrics, error) {
    if (diagnostic?.kind) return diagnostic.kind;
    if (diagnostic?.rng || metrics.rng.matched < metrics.rng.total) return 'rng';
    if (diagnostic?.cursor || metrics.cursors.matched < metrics.cursors.total) return 'cursor';
    if (diagnostic?.screen || metrics.screens.matched < metrics.screens.total) return 'screen';
    return error ? 'error' : 'unresolved';
}

function cachedSyntheticDiagnostic(batch, entry) {
    const path = join(batch.root, '.cache', 'synthetic-scans', batch.batch,
        `${entry.id}.json`);
    if (!existsSync(path) || lstatSync(path).isSymbolicLink()) return null;
    let cached;
    try { cached = JSON.parse(readFileSync(path, 'utf8')); }
    catch { return null; }
    const identity = cached.inputIdentity;
    const catalog = batch.caseById.get(entry.id);
    const expectedInput = batch.replayInputSha256 ?? null;
    const expectedTools = diagnosticToolIdentity(batch.root).sha256;
    if (identity?.corpus !== 'synthetic' || identity.batch !== batch.batch
        || identity.caseId !== entry.id
        || identity.manifestPath !== batch.manifestPath
        || identity.manifestSha256 !== batch.manifestSha256
        || identity.recordingPath !== catalog?.recording
        || identity.recordingSha256 !== entry.recordingSha256
        || identity.recipeSha256 !== (catalog?.recipeSha256 ?? null)
        || identity.replayInputSha256 !== expectedInput
        || identity.diagnosticToolSha256 !== expectedTools) return null;
    return cached;
}

function cachedDiagnosticEntry(batch, entry, cached, owners) {
    if (!cached) return null;
    const row = {
        ...cached,
        file: `synthetic/${batch.batch}/${entry.id}.session.json`,
    };
    return queueEntry(row, owners);
}

// The queue is synchronous, while a synthetic replay may take a full child
// process. When an evaluated loss has no current diagnostic, ask the scanner
// CLI to create exactly one admitted-case cache and then read that cache back
// through the same identity checks. A failed diagnostic replay leaves the loss
// visible and blocked at source attribution; it never falls back to a fixed
// session or treats a missing scan as parity.
function ensureSyntheticDiagnostic(batch, entry) {
    let cached = cachedSyntheticDiagnostic(batch, entry);
    if (cached) return cached;
    const script = join(batch.root, 'scripts', 'scan-sessions.mjs');
    const run = spawnSync(process.execPath, [script, '--json', '--synthetic',
        `${batch.batch}/${entry.id}`], {
        cwd: batch.root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) return null;
    return cachedSyntheticDiagnostic(batch, entry);
}

function comparableMeasurement(evaluation, entry, previous, previousEntry, recordingSha256) {
    return previous && previousEntry
        && previousEntry.recordingSha256 === recordingSha256
        && (!evaluation.scorerSha256 || !previous.scorerSha256
            || evaluation.scorerSha256 === previous.scorerSha256)
        && ['screens', 'rng', 'cursors'].every(key =>
            entry.metrics?.[key]?.total === previousEntry.metrics?.[key]?.total);
}

function evaluationCase(batch, evaluation, entry, previous, owners) {
    const metrics = {
        screens: count(entry.metrics?.screens),
        rng: count(entry.metrics?.rng ?? entry.metrics?.rngCalls),
        cursors: count(entry.metrics?.cursors),
    };
    const recordedSteps = recordingSteps(batch.root, batch.caseById.get(entry.id));
    if (!metrics.screens || !metrics.rng || !metrics.cursors || recordedSteps === null
        || metrics.screens.total !== recordedSteps || entry.recordingSha256
            !== batch.caseById.get(entry.id)?.recordingSha256) return {
        blocked: true, reason: `incomplete synthetic evidence for ${entry.id}`,
    };
    const remainingScreens = metrics.screens.total - metrics.screens.matched;
    const mismatch = Boolean(entry.error || !entry.passed
        || metrics.screens.matched < metrics.screens.total
        || metrics.rng.matched < metrics.rng.total
        || metrics.cursors.matched < metrics.cursors.total);
    if (!mismatch) return null;
    const directDiagnostic = entry.firstMismatch ?? entry.diagnostic ?? entry.divergence
        ?? entry.mismatch ?? null;
    const cached = directDiagnostic ? null : ensureSyntheticDiagnostic(batch, entry);
    const attributed = cachedDiagnosticEntry(batch, entry, cached, owners);
    const diagnostic = directDiagnostic ?? cached?.divergence ?? (cached?.boundary ? {
        kind: 'stop', message: cached.boundary, step: cached.screensEmitted,
    } : null);
    const previousEntry = previous?.cases?.get(entry.id);
    const comparable = comparableMeasurement(evaluation, entry, previous?.evaluation,
        previousEntry, entry.recordingSha256);
    const previousMatched = comparable
        ? count(previousEntry?.metrics?.screens)?.matched ?? null : null;
    return {
        corpus: 'synthetic', batch: batch.batch, caseId: entry.id,
        session: syntheticSessionId(batch.batch, entry.id),
        manifestPath: batch.manifestPath, manifestSha256: batch.manifestSha256,
        recording: batch.caseById.get(entry.id).recording,
        recordingSha256: entry.recordingSha256,
        recipe: batch.caseById.get(entry.id).recipe ?? null,
        recipeSha256: batch.caseById.get(entry.id).recipeSha256 ?? null,
        replayInputSha256: batch.replayInputSha256
            ?? batch.inputSnapshotSha256 ?? batch.freshness?.expected ?? null,
        evaluationPath: batch.evaluationPath, evaluationCommit: evaluation.sha,
        evaluationArtifact: batch.evaluationPath,
        evaluationUtc: evaluation.utc,
        remainingScreens, recordedSteps,
        previousScreensMatched: previousMatched,
        regression: previousMatched !== null && metrics.screens.matched < previousMatched,
        passed: Boolean(entry.passed), error: entry.error ?? null,
        metrics, firstMismatch: diagnostic,
        step: diagnosticStep(diagnostic),
        kind: diagnosticKind(diagnostic, metrics, entry.error),
        sourceFile: diagnostic?.sourceFile ?? diagnostic?.cFile ?? diagnostic?.luaFile ?? null,
        function: diagnostic?.function ?? diagnostic?.owner ?? null,
        message: diagnostic?.message ?? entry.error ?? null,
        ...(attributed ? {
            step: attributed.step,
            kind: attributed.kind,
            sourceFile: attributed.sourceFile,
            function: attributed.function,
            cFile: attributed.cFile,
            luaFile: attributed.luaFile,
            line: attributed.line,
            ...(attributed.helper ? { helper: attributed.helper } : {}),
            message: attributed.message ?? diagnostic?.message ?? entry.error ?? null,
        } : {}),
    };
}

export function buildSyntheticQueue(batches, { root = PROJECT_ROOT, owners = null } = {}) {
    const sessions = [];
    const blockers = [];
    const normalized = [];
    const sourceOwners = owners ?? (() => {
        try { return functionOwners(); }
        catch { return new Map(); }
    })();
    for (const source of batches ?? []) {
        const batch = { ...source, root,
            caseById: new Map((source.cases ?? []).map(entry => [entry.id, entry])) };
        // challengeState has already validated evaluation membership, digest,
        // SCORE.tsv freshness, and the current implementation commit.
        const state = source.status === 'measured'
            ? { status: 'complete', evaluation: source.evaluation,
                previous: source.previous ?? source.previousEvaluation,
                path: source.evaluationPath }
            : { status: source.status ?? 'unmeasured', reason: source.error ?? null };
        const status = state.status;
        const reason = state.reason;
        const previous = state.previous ? { evaluation: state.previous,
            cases: new Map(state.previous.cases.map(entry => [entry.id, entry])) } : null;
        const evaluation = state.evaluation;
        const batchView = {
            corpus: 'synthetic', batch: batch.batch, manifestPath: batch.manifestPath,
            manifestSha256: batch.manifestSha256, status, reason: reason ?? null,
            replayInputSha256: batch.replayInputSha256
                ?? batch.inputSnapshotSha256 ?? batch.freshness?.expected ?? null,
            evaluationPath: state.path ?? null, evaluationCommit: evaluation?.sha ?? null,
            evaluationArtifact: state.path ?? null, generationReady: false,
        };
        if (status !== 'complete') {
            blockers.push({ ...batchView, blocked: true });
            normalized.push(batchView);
            continue;
        }
        batch.evaluationPath = state.path;
        for (const result of evaluation.cases) {
            const entry = evaluationCase(batch, evaluation, result, previous, sourceOwners);
            if (entry?.blocked) {
                blockers.push({ ...batchView, caseId: result.id, blocked: true, reason: entry.reason });
                continue;
            }
            if (entry) {
                entry.investigation = readInvestigation(root, entry);
                sessions.push(entry);
            }
        }
        // A cursor/RNG-only loss remains actionable, but it does not block
        // generating the next synthetic batch. Generation is blocked only by
        // screen debt, incomplete evidence, or a stale batch.
        batchView.generationReady = !sessions.some(entry => entry.batch === batch.batch
            && entry.remainingScreens > 0);
        normalized.push(batchView);
    }
    const ordered = [...sessions].sort((a, b) => Number(b.regression) - Number(a.regression)
        || b.remainingScreens - a.remainingScreens
        || stepOrder(a.step) - stepOrder(b.step)
        || a.batch.localeCompare(b.batch) || a.caseId.localeCompare(b.caseId));
    return {
        mode: 'synthetic', corpus: 'synthetic', batches: normalized,
        sessions: ordered, blockers,
        generationReady: blockers.length === 0
            && normalized.every(batch => batch.generationReady),
        status: blockers.length ? 'blocked' : ordered.length ? 'actionable' : 'ready',
        availability: blockers.length ? 'blocked' : 'available',
        selectionBlocked: blockers.length > 0,
    };
}

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
        .sort((a, b) => b.remainingScreensUpperBound - a.remainingScreensUpperBound
            || stepOrder(a.step) - stepOrder(b.step)
            || a.session.localeCompare(b.session));
    return {
        mode: 'fixed', corpus: 'fixed', sessions: sessions.map(entry => ({
            ...entry, corpus: 'fixed', regression: true,
            remainingScreens: null,
        })),
        candidates: candidateOrder(sessions, declaredCounts),
        roadmapFallbackAllowed: sessions.length === 0,
        blockers: [], selectionBlocked: false, generationReady: sessions.length === 0,
        status: sessions.length ? 'actionable' : 'ready', availability: 'available',
    };
}

export function buildWorkQueue(fixed, synthetic) {
    const fixedSessions = fixed?.sessions ?? [];
    const syntheticSessions = synthetic?.sessions ?? [];
    const blockers = synthetic?.blockers ?? [];
    const sessions = [...fixedSessions, ...syntheticSessions].sort((a, b) => {
        // Fixed regressions and prior synthetic losses are always surfaced
        // before new synthetic debt; each corpus retains its own ordering.
        const loss = Number(Boolean(b.regression)) - Number(Boolean(a.regression));
        if (loss) return loss;
        if (a.corpus === 'fixed' && b.corpus !== 'fixed') return -1;
        if (a.corpus !== 'fixed' && b.corpus === 'fixed') return 1;
        const aRemaining = a.corpus === 'synthetic'
            ? a.remainingScreens : a.remainingScreensUpperBound;
        const bRemaining = b.corpus === 'synthetic'
            ? b.remainingScreens : b.remainingScreensUpperBound;
        return bRemaining - aRemaining || stepOrder(a.step) - stepOrder(b.step)
            || a.session.localeCompare(b.session);
    });
    const syntheticCandidates = syntheticSessions.map(entry => ({
        kind: 'synthetic', corpus: 'synthetic', sourceFile: entry.sourceFile,
        cFile: entry.cFile ?? null, luaFile: entry.luaFile ?? null,
        sessions: [entry.session], remainingScreens: entry.remainingScreens,
        remainingScreensUpperBound: null, earliestStep: entry.step,
        caseId: entry.caseId, batch: entry.batch,
    }));
    const fixedCandidates = (fixed?.candidates ?? []).map(entry => ({
        ...entry, corpus: 'fixed', regression: true,
    }));
    return {
        mode: 'work', corpus: 'combined', fixed, synthetic,
        sessions, candidates: [...fixedCandidates, ...syntheticCandidates],
        blockers, selectionBlocked: blockers.length > 0,
        generationReady: Boolean(synthetic?.generationReady)
            && blockers.length === 0 && fixedSessions.length === 0,
        status: blockers.length ? 'blocked' : sessions.length ? 'actionable' : 'ready',
        availability: blockers.length ? 'blocked' : 'available',
        // The combined queue is the operational synthetic-first interface.
        // An empty fixed corpus must not silently turn an unmeasured or empty
        // synthetic catalog into permission to invent a roadmap goal.
        roadmapFallbackAllowed: false,
    };
}

/**
 * Used by both queue-goal and open-goal. A declaration never clears a blocker.
 * Changing owner after tracing, or bypassing a higher-ranked candidate, needs
 * a recorded source-based reason. Unknown owners also need a named session.
 */
export function assertGoalSelection(queue, goal) {
    if (queue?.mode === 'work' || queue?.corpus === 'combined') {
        if (queue.blockers?.length) {
            throw new Error('synthetic evidence is incomplete, missing, stale, or invalid; '
                + 'goal selection is blocked');
        }
        const synthetic = syntheticSessionParts(goal.session)
            || syntheticSessionParts(goal.sessions?.[0]);
        if (synthetic) {
            const entry = queue.sessions.find(candidate => candidate.session
                === (goal.session ?? goal.sessions?.[0]));
            if (!entry || entry.corpus !== 'synthetic')
                throw new Error('synthetic session is not an actionable work-queue entry');
            if (entry.investigation?.status !== 'complete')
                throw new Error(`synthetic investigation is ${entry.investigation?.status
                ?? 'missing'}; complete it before selecting the goal`);
            const candidate = queue.candidates.find(item =>
                item.sessions?.includes(entry.session));
            if (!candidate) throw new Error('synthetic session is not a ranked queue candidate');
            assertRankedCandidate(candidate, queue.candidates[0], goal);
            return entry;
        }
        // A source-port goal may omit --sessions when its traced owner is the
        // ranked synthetic entry. Preserve the fixed queue's source-selection
        // rules when a fixed candidate owns that source instead.
        if (!goal.session && !(goal.sessions?.length)) {
            const sourceFile = goal.luaFile ?? goal.cFile;
            const entry = queue.sessions.find(candidate => candidate.corpus === 'synthetic'
                && candidate.sourceFile === sourceFile);
            if (entry) {
                if (entry.investigation?.status !== 'complete')
                    throw new Error(`synthetic investigation is ${entry.investigation?.status
                    ?? 'missing'}; complete it before selecting the goal`);
                const candidate = queue.candidates.find(item =>
                    item.sessions?.includes(entry.session));
                if (!candidate) throw new Error('synthetic session is not a ranked queue candidate');
                assertRankedCandidate(candidate, queue.candidates[0], goal);
                return entry;
            }
        }
        const fixed = queue.fixed ?? { ...queue, mode: 'fixed' };
        if (fixed.sessions.length === 0) {
            throw new Error('fixed-corpus mismatches remain; no fixed regression or '
                + 'synthetic candidate justifies this goal');
        }
        return assertGoalSelection(fixed, goal);
    }
    if (queue.sessions.length === 0) return;
    const sourceFile = goal.luaFile ?? goal.cFile;
    const sessions = new Set([goal.session, ...(goal.sessions ?? [])].filter(Boolean));
    const candidate = queue.candidates.find((entry) => entry.sourceFile === sourceFile)
        ?? queue.candidates.find((entry) => entry.sessions.some((session) => sessions.has(session)));
    if (!candidate) throw new Error('fixed-corpus mismatches remain; select a ranked source '
        + 'or name the mismatching session whose source trace justifies this goal');
    assertRankedCandidate(candidate, queue.candidates[0], goal);
    return candidate;
}

function assertRankedCandidate(candidate, first, goal) {
    const reason = typeof goal.selectionReason === 'string' ? goal.selectionReason.trim() : '';
    const sourceFile = goal.luaFile ?? goal.cFile;
    const sameSource = candidate.sourceFile != null && candidate.sourceFile === sourceFile;
    if (!sameSource && !reason) throw new Error('selectionReason is required to identify '
        + 'the source owner traced from the named mismatching session');
    if (candidate !== first && !reason) throw new Error('selectionReason is required to '
        + 'explain the dependency or blocker preventing the highest-ranked candidate');
}

function runScan() {
    const scan = join(PROJECT_ROOT, 'scripts', 'scan-sessions.mjs');
    const run = spawnSync(process.execPath, [scan, '--json'], {
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
    const queue = buildQueue(scan, functionOwners(), declaredCounts, declaredNames);
    for (const entry of queue.sessions) entry.investigation = readInvestigation(PROJECT_ROOT, entry);
    return queue;
}

export function loadWorkQueue({ scan = null, root = PROJECT_ROOT } = {}) {
    const fixed = loadMismatchQueue(scan ?? undefined);
    const batches = readSyntheticBatches(root);
    let owners;
    try { owners = functionOwners(); }
    catch { owners = new Map(); }
    const synthetic = buildSyntheticQueue(batches, { root, owners });
    return buildWorkQueue(fixed, synthetic);
}

export function formatQueue(queue) {
    const lines = ['Mismatch queue (fixed 44-session workload, first known mismatch):'];
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
        const investigation = entry.investigation;
        const result = investigation?.result;
        const status = investigation?.status ?? 'missing';
        const description = result ? `${status}: ${result.summary}` : ({
            missing: 'no investigation result',
            stale: 'needs investigation; remaining-screen count changed',
            invalid: 'investigation file is incomplete or unreadable',
        })[status];
        lines.push(`      Investigation: ${description}`);
    }
    lines.push('', 'Source groups (remaining-screen upper bounds, not predicted gains):');
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

export function formatWorkQueue(queue) {
    const lines = ['Combined work queue (fixed regressions and synthetic batches):'];
    if (queue.blockers?.length) {
        lines.push('  Blocked evidence:');
        for (const blocker of queue.blockers)
            lines.push(`    ${blocker.batch ?? blocker.session}: ${blocker.reason}`);
    }
    if (!queue.sessions?.length) lines.push('  no measured actionable mismatches');
    for (const entry of queue.sessions ?? []) {
        const remaining = entry.corpus === 'synthetic'
            ? `${entry.remainingScreens} of ${entry.recordedSteps}`
            : `at most ${entry.remainingScreensUpperBound} of ${entry.recordedSteps}`;
        lines.push(`  ${entry.session}: ${remaining} remaining screens`
            + `, step ${entry.step ?? 'unknown'} (${entry.kind})`
            + (entry.regression ? ', regression' : ''));
        if (entry.corpus === 'synthetic') {
            lines.push(`      ${entry.manifestPath} ${entry.caseId}`
                + `; evaluation ${entry.evaluationCommit ?? 'unknown'}`);
        }
        if (entry.message) lines.push(`      ${entry.message}`);
        const investigation = entry.investigation;
        lines.push(`      Investigation: ${investigation?.status ?? 'missing'}`);
    }
    lines.push('', queue.generationReady
        ? 'Synthetic generation: ready (all admitted batches measured and matched).'
        : 'Synthetic generation: blocked until every admitted batch has current complete evidence.');
    return lines.join('\n');
}

export function parseArgs(args) {
    let json = false;
    let scanPath = null;
    let mode = 'fixed';
    for (let index = 0; index < args.length; index += 1) {
        if (args.length === 1 && (args[0] === '--help' || args[0] === '-h'))
            return { help: true };
        if (args[index] === '--json') json = true;
        else if (args[index] === '--work') mode = 'work';
        else if (args[index] === '--fixed') mode = 'fixed';
        else if (args[index] === '--scan') {
            scanPath = args[++index];
            if (!scanPath || scanPath.startsWith('--')) throw new Error('--scan requires a path');
        } else throw new Error(`unexpected argument: ${args[index]}`);
    }
    if (mode === 'work' && scanPath === null) return { help: false, json, scanPath, mode };
    return { help: false, json, scanPath, mode };
}

export function main(args) {
    const options = parseArgs(args);
    if (options.help) {
        console.log(USAGE);
        return;
    }
    const queue = options.mode === 'work'
        ? loadWorkQueue({
            scan: options.scanPath
                ? JSON.parse(readFileSync(options.scanPath, 'utf8')) : null,
        })
        : options.scanPath
            ? loadMismatchQueue(JSON.parse(readFileSync(options.scanPath, 'utf8')))
            : loadMismatchQueue();
    console.log(options.json ? JSON.stringify(queue, null, 2)
        : options.mode === 'work' ? formatWorkQueue(queue) : formatQueue(queue));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        const code = await boundedMain('full', () => main(process.argv.slice(2)));
        if (code !== undefined) process.exitCode = code;
    } catch (error) {
        console.error(`mismatch-queue: ${error.message}`);
        process.exitCode = 1;
    }
}
