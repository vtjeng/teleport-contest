#!/usr/bin/env node
// Compare score import APIs against the same copied, real historical corpus.
// Fixture setup and artifact creation are outside the measured interval.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, hostname, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRows } from './score-log.mjs';
import { digest, evaluationBatch, readChallengeBatches, readEvaluation, saveEvaluation } from './challenge-results.mjs';

const [before, after] = process.argv.slice(2);
if (!before || !after || process.argv.length !== 4) throw new Error('Usage: node scripts/bench-score-import.mjs <before-ref> <after-ref>');
const source = process.cwd();
const root = mkdtempSync(join(tmpdir(), 'teleport-import-bench-'));
try {
    cpSync(join(source, 'scripts'), join(root, 'scripts'), { recursive: true });
    cpSync(join(source, 'frozen'), join(root, 'frozen'), { recursive: true });
    cpSync(join(source, 'challenges'), join(root, 'challenges'), { recursive: true });
    copyFileSync(join(source, 'SCORE.tsv'), join(root, 'SCORE.tsv'));
    const score = readFileSync(join(root, 'SCORE.tsv'));
    const rows = readRows(join(root, 'SCORE.tsv'));
    const latest = new Map();
    let lastTime = 0;
    for (const row of rows.filter(row => row.event === 'challenge')) {
        const evaluation = readEvaluation(root, row.challenge_evaluation);
        latest.set(evaluationBatch(evaluation), evaluation);
        lastTime = Math.max(lastTime, Date.parse(evaluation.utc));
    }
    // One second after the newest measurement keeps every sample's inputs
    // identical and satisfies measurement ordering without using wall time.
    const utc = new Date(lastTime + 1000).toISOString();
    const paths = readChallengeBatches(root).map(({ batch, manifestSha256 }) => {
        const old = latest.get(batch);
        assert.equal(old?.status, 'complete', batch + ': expected complete baseline');
        assert.equal(old.manifestSha256, manifestSha256, batch + ': membership changed');
        const path = `challenges/evaluations/bench-import-${batch}.json`;
        saveEvaluation(root, path, { ...old, utc });
        return path;
    });
    const variants = [];
    for (const [name, ref] of [['before', before], ['after', after]]) {
        const sha = execFileSync('git', ['rev-parse', ref], { cwd: source, encoding: 'utf8' }).trim();
        const bytes = execFileSync('git', ['show', `${sha}:scripts/score-challenges.mjs`], { cwd: source });
        const path = join(root, 'scripts', `bench-${name}.mjs`);
        writeFileSync(path, bytes);
        variants.push({ name, sha, module: await import(pathToFileURL(path).href) });
    }
    console.log(JSON.stringify({ machine: hostname(), cpu: cpus()[0]?.model, node: process.version,
        corpus: { source: resolve(source), scoreSha256: digest(score), historyRows: rows.length,
            challengeRows: rows.filter(row => row.event === 'challenge').length, batches: paths.length },
        commits: variants.map(({ name, sha }) => ({ name, sha })) }));
    const results = [];
    let expected;
    // Repeating unchanged baseline measures the noise floor. Interleaving the
    // pair limits sensitivity to changing machine load; each starts with the
    // exact same ledger bytes. No game replay or Main mutation occurs.
    for (const index of [0, 1, 0, 1]) {
        writeFileSync(join(root, 'SCORE.tsv'), score);
        const variant = variants[index];
        const started = performance.now();
        const cpuStarted = process.cpuUsage();
        const imported = variant.module.recordEvaluations
            ? variant.module.recordEvaluations(root, paths)
            : paths.map(path => variant.module.recordEvaluation(root, path));
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuStarted);
        const normalized = imported.map(({ utc: _utc, ...row }) => row);
        if (expected) assert.deepEqual(normalized, expected);
        else expected = normalized;
        const result = { variant: variant.name, elapsedMs, cpuMs: (cpu.user + cpu.system) / 1000 };
        results.push(result);
        console.log(JSON.stringify(result));
    }
    const baseline = results.filter(row => row.variant === 'before').map(row => row.elapsedMs);
    const candidate = results.filter(row => row.variant === 'after').map(row => row.elapsedMs);
    const mean = values => values.reduce((a, b) => a + b) / values.length;
    console.log(JSON.stringify({ baselineMs: mean(baseline), candidateMs: mean(candidate),
        reductionPercent: 100 * (1 - mean(candidate) / mean(baseline)),
        noiseFloorPercent: 100 * Math.abs(baseline[0] - baseline[1]) / mean(baseline),
        identicalImportedRows: true }));
} finally {
    rmSync(root, { recursive: true, force: true });
}
