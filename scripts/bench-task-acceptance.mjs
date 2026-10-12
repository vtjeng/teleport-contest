#!/usr/bin/env node
// Measure helper overhead on saved artifacts, not game execution or model time.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { acceptTask } from './accept-task.mjs';
import { handoffFixture } from './test-fixtures/task-handoff.mjs';

const [beforeRoot, count = '5'] = process.argv.slice(2);
const samples = Number(count);
if (!beforeRoot || !Number.isSafeInteger(samples) || samples < 2)
    throw new Error('Usage: node scripts/bench-task-acceptance.mjs <baseline-worktree> [samples>=2]');
const candidateRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const baselineRoot = resolve(beforeRoot);
const before = await import(pathToFileURL(join(baselineRoot, 'scripts/accept-task.mjs')).href);
const { reviewTask } = await import(pathToFileURL(join(baselineRoot, 'scripts/task-handoff.mjs')).href);
function measure(root, accept, review = null) {
    const times = [];
    for (let index = 0; index < samples; index++) {
        const cleanup = [];
        const f = handoffFixture({ after: fn => cleanup.push(fn) }, {
            acceptance: true, fixedTarget: true, scriptsRoot: join(root, 'scripts'),
        });
        try {
            const started = performance.now();
            if (review) assert.equal(review(f.options, f.root).reviewRequired, false);
            assert.equal(accept(f.options, f.root).commit, f.candidate);
            times.push(performance.now() - started);
            assert.equal(f.state().tasks.A1.status, 'accepted');
        } finally { for (const fn of cleanup) fn(); }
    }
    times.sort((a, b) => a - b);
    return { samples: times, medianMs: times[Math.floor(times.length / 2)],
        totalMs: times.reduce((sum, value) => sum + value, 0) };
}
const first = measure(baselineRoot, before.acceptTask, reviewTask);
const repeat = measure(baselineRoot, before.acceptTask, reviewTask);
const candidate = measure(candidateRoot, acceptTask);
console.log(JSON.stringify({ workload: '44 fixed rows and one two-boundary synthetic case; fixed target improves',
    measured: 'saved review + acceptance, excluding fixture setup; no replay, publication, or model time',
    machine: process.platform + '/' + process.arch,
    baselineCommit: execFileSync('git', ['-C', baselineRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    candidateCommit: execFileSync('git', ['-C', candidateRoot, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    candidateDirty: Boolean(execFileSync('git', ['-C', candidateRoot, 'status', '--porcelain'], { encoding: 'utf8' }).trim()),
    first, repeat, candidate,
    improvementPercent: 100 * (1 - candidate.medianMs / first.medianMs),
    noisePercent: 100 * Math.abs(repeat.medianMs - first.medianMs) / first.medianMs,
}, null, 2));
