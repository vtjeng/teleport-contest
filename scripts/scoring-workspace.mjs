import { spawn, spawnSync } from 'node:child_process';
import {
    cpSync,
    mkdtempSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { localTmpdir } from './local-tmpdir.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const PROJECT_ROOT = resolve(dirname(SCRIPT_PATH), '..');
export const RESULT_MARKER = '__RESULTS_JSON__';

// The official scorer overlays these files before importing contestant code.
const FROZEN_FILES = ['isaac64.js', 'terminal.js', 'storage.js'];

export function listSessionFiles(sessionDir) {
    return readdirSync(sessionDir, { withFileTypes: true })
        .filter(entry => entry.isFile() && entry.name.endsWith('.session.json'))
        .map(entry => entry.name)
        .sort();
}

export function createScoringWorkspace(sessionDir, files) {
    const targetRoot = mkdtempSync(join(localTmpdir(), 'teleport-score-'));
    try {
        cpSync(join(PROJECT_ROOT, 'js'), join(targetRoot, 'js'), { recursive: true });
        cpSync(join(PROJECT_ROOT, 'frozen'), join(targetRoot, 'frozen'), { recursive: true });
        cpSync(join(PROJECT_ROOT, 'package.json'), join(targetRoot, 'package.json'));
        mkdirSync(join(targetRoot, 'sessions'));

        for (const entry of files) {
            const source = typeof entry === 'string' ? entry : entry.source;
            const target = typeof entry === 'string' ? entry : entry.target;
            const targetPath = join(targetRoot, 'sessions', target);
            mkdirSync(dirname(targetPath), { recursive: true });
            cpSync(join(sessionDir, source), targetPath);
        }
        for (const file of FROZEN_FILES) {
            cpSync(join(targetRoot, 'frozen', file), join(targetRoot, 'js', file));
        }
        return targetRoot;
    } catch (error) {
        removeScoringWorkspace(targetRoot);
        throw error;
    }
}

// frozen/ps_test_runner.mjs scores its sessions one at a time. When a
// workspace holds enough replay work, runScorer() instead runs this module as
// a child that splits the sessions into batches, scores each batch with its
// own runner call, SCORER_JOBS at a time, and prints the runner's output format
// with the results in the runner's order. Each session still replays in the
// runner's own worker process, so the scores equal a single runner call's; only
// the per-session times behind `speed` are measured under parallel load.
const SCORER_JOBS = Math.max(1, availableParallelism() - 1);
// Each batch starts another runner process. The smallest recorded session is
// 40 KiB and replays in about half a second, so a 1 MiB batch repays the start;
// a test fixture's few-byte sessions stay in one direct runner call.
const MIN_BATCH_BYTES = 1024 * 1024;

function sessionSizes(sessionDir) {
    return listSessionFiles(sessionDir).map(name => statSync(join(sessionDir, name)).size);
}

function batchCount(sizes) {
    const total = sizes.reduce((sum, size) => sum + size, 0);
    return Math.max(1, Math.min(SCORER_JOBS, Math.ceil(total / MIN_BATCH_BYTES)));
}

export function runScorer(targetRoot) {
    const sessionDir = join(targetRoot, 'sessions');
    const args = batchCount(sessionSizes(sessionDir)) > 1
        ? [SCRIPT_PATH, targetRoot]
        : [join(targetRoot, 'frozen', 'ps_test_runner.mjs'), sessionDir];
    return spawnSync(process.execPath, args, {
        cwd: targetRoot,
        encoding: 'utf8',
        // Allow the scorer's normal per-session timeout across an entire suite.
        timeout: 10 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
    });
}

/**
 * Split session indices into at most `count` batches of similar total size,
 * placing the largest first. A session file's size tracks its number of
 * steps, and so its replay time. Each batch lists its indices in ascending
 * order.
 */
export function sizeBalancedBatches(sizes, count) {
    const batches = Array.from({ length: Math.min(count, sizes.length) },
        () => ({ total: 0, indices: [] }));
    const largestFirst = sizes.map((_, index) => index)
        .sort((a, b) => sizes[b] - sizes[a] || a - b);
    for (const index of largestFirst) {
        const lightest = batches.reduce((best, batch) =>
            (batch.total < best.total ? batch : best));
        lightest.total += sizes[index];
        lightest.indices.push(index);
    }
    return batches.map(batch => batch.indices.sort((a, b) => a - b));
}

function runRunner(runner, files, cwd) {
    return new Promise((resolveRun, reject) => {
        const child = spawn(process.execPath, [runner, ...files], { cwd });
        let stdout = '';
        let stderr = '';
        child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
        child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
        child.once('error', reject);
        child.once('close', (status) => resolveRun({ status, stdout, stderr }));
    });
}

// The runner's bundle-level linear fit, total_ms = a + b * moves, over every
// session that recorded a time (frozen/ps_test_runner.mjs main()).
export function runnerSpeed(results) {
    const points = results
        .filter(r => r.time && r.time.moves >= 0 && r.time.ms >= 0)
        .map(r => [r.time.moves, r.time.ms]);
    if (points.length < 2) {
        return { startup_ms: 0, per_move_ms: 0, r2: 0, label: '?',
                 sessions: points.length };
    }
    const n = points.length;
    const mx = points.reduce((s, p) => s + p[0], 0) / n;
    const my = points.reduce((s, p) => s + p[1], 0) / n;
    let num = 0, den = 0;
    for (const [x, y] of points) {
        num += (x - mx) * (y - my);
        den += (x - mx) ** 2;
    }
    const b = den ? num / den : 0;
    const a = my - b * mx;
    let ss_res = 0, ss_tot = 0;
    for (const [x, y] of points) {
        ss_res += (y - (a + b * x)) ** 2;
        ss_tot += (y - my) ** 2;
    }
    const r2 = ss_tot ? 1 - ss_res / ss_tot : 0;
    return {
        startup_ms: +a.toFixed(1),
        per_move_ms: +b.toFixed(4),
        r2: +r2.toFixed(3),
        label: `${Math.round(a)}+${b.toFixed(2)}/turn`,
        sessions: n,
    };
}

// Lines each batch's runner call prints about that call alone: its git lookup
// outside a repository, its batch tally, and its batch fit.
const PER_CALL_LINE = /^(fatal: not a git repository|  \d+\/\d+ passing$|  speed: )/u;
// The runner's per-session status line, which names the session file.
const STATUS_LINE = /^  (?:PASS|FAIL): (\S+) \(/u;

async function scoreSessionsInParallel(targetRoot) {
    const runner = join(targetRoot, 'frozen', 'ps_test_runner.mjs');
    const sessionDir = join(targetRoot, 'sessions');
    // The order resolveSessionFiles() gives a directory target.
    const names = listSessionFiles(sessionDir);
    const files = names.map(name => join(sessionDir, name));
    const sizes = sessionSizes(sessionDir);
    const batches = sizeBalancedBatches(sizes, batchCount(sizes));
    const runs = await Promise.all(batches.map(indices =>
        runRunner(runner, indices.map(index => files[index]), targetRoot)));

    const position = new Map(names.map((name, index) => [name, index]));
    const results = new Array(names.length);
    const lines = [];
    let commit;
    for (const run of runs) {
        if (run.status !== 0) throw new Error(`runner failed: ${run.stderr.trim() || `exit ${run.status}`}`);
        const bundle = parseRunnerBundle(run.stdout);
        commit ??= bundle.commit;
        for (const result of bundle.results) {
            const index = position.get(result.session);
            if (index === undefined || results[index])
                throw new Error(`runner returned an unexpected result for ${result.session}`);
            results[index] = result;
        }
        for (const line of run.stderr.split('\n'))
            if (line && !PER_CALL_LINE.test(line)) lines.push(line);
    }
    const missing = names.filter((_, index) => !results[index]);
    if (missing.length) throw new Error(`runner returned no result for ${missing.join(', ')}`);
    // Status lines in session order, then any other diagnostics in batch order.
    const order = (line) => position.get(STATUS_LINE.exec(line)?.[1]) ?? names.length;
    for (const line of lines.sort((a, b) => order(a) - order(b)))
        process.stderr.write(`${line}\n`);
    const speed = runnerSpeed(results);
    process.stderr.write(`  ${results.filter(r => r.passed).length}/${results.length} passing\n`);
    process.stderr.write(`  speed: ${speed.label} (R² = ${speed.r2})\n`);
    const bundle = { timestamp: new Date().toISOString(), commit, speed, results };
    console.log(RESULT_MARKER);
    console.log(JSON.stringify(bundle));
    // The runner leaves the same advisory copy for the Session Viewer.
    mkdirSync(join(targetRoot, '.cache'), { recursive: true });
    writeFileSync(join(targetRoot, '.cache', 'session-results.json'), JSON.stringify(bundle, null, 2));
}

export function parseRunnerBundle(stdout) {
    const markerIndex = stdout.lastIndexOf(RESULT_MARKER);
    if (markerIndex < 0) throw new Error('runner marker missing');
    const bundle = JSON.parse(stdout.slice(markerIndex + RESULT_MARKER.length).trim());
    if (!bundle || !Array.isArray(bundle.results)) {
        throw new Error('runner bundle malformed');
    }
    return bundle;
}

export function removeScoringWorkspace(targetRoot) {
    const expectedPrefix = join(localTmpdir(), 'teleport-score-');
    if (!resolve(targetRoot).startsWith(expectedPrefix)) {
        throw new Error('refusing to remove an unexpected scoring path');
    }
    rmSync(targetRoot, { recursive: true, force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    scoreSessionsInParallel(process.argv[2]).catch((error) => {
        console.error(`Fatal: ${error.message}`);
        process.exitCode = 1;
    });
}
