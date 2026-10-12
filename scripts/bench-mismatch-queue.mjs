#!/usr/bin/env node
// Measure cold diagnostic dispatch for specified historical queue cases.
// These copied measurements are benchmark fixtures, not acceptance evidence.
// Usage: node scripts/bench-mismatch-queue.mjs <before-ref> <after-ref>
//   --scope synthetic/vN/case-id [synthetic/vN/other-case-id ...]
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
    rmSync, writeFileSync } from 'node:fs';
import { cpus, hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { challengeInputSnapshot, corpusDigest, readChallengeBatches } from './challenge-results.mjs';
import { syntheticSessionParts } from './investigation-cache.mjs';
import { readRows } from './score-log.mjs';

const [before, after, scopeFlag, scopedSession, ...otherSessions] = process.argv.slice(2);
const sessions = [scopedSession, ...otherSessions];
if (!before || !after || scopeFlag !== '--scope' || !sessions.every(syntheticSessionParts))
    throw new Error('Usage: node scripts/bench-mismatch-queue.mjs <before-ref> <after-ref> --scope <synthetic/vN/case-id> [other-session ...]');
assert.equal(new Set(sessions).size, sessions.length, 'benchmark sessions must be distinct');
const source = process.cwd();
const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim();
assert.equal(git('diff', '--name-only', before, after, '--', 'js', 'frozen', 'package.json', 'package-lock.json'), '',
    'compare tooling changes with identical replay inputs');
const rows = readRows(join(source, 'SCORE.tsv'));
const batchIds = [...new Set(sessions.map(session => syntheticSessionParts(session).batch))];
const scratch = mkdtempSync(join(tmpdir(), 'teleport-queue-bench-'));
try {
    const variants = [];
    for (const [name, ref] of [['before', before], ['after', after]]) {
        const root = join(scratch, name);
        mkdirSync(root);
        for (const path of ['scripts', 'js', 'frozen'])
            cpSync(join(source, path), join(root, path), { recursive: true });
        for (const path of ['package.json', 'package-lock.json'])
            copyFileSync(join(source, path), join(root, path));
        const commit = git('rev-parse', ref);
        writeFileSync(join(root, 'scripts/mismatch-queue.mjs'), git('show', `${commit}:scripts/mismatch-queue.mjs`));
        for (const batch of batchIds) {
            const path = batch === 'v1' ? 'challenges/manifest.json' : `challenges/manifests/${batch}.json`;
            mkdirSync(dirname(join(root, path)), { recursive: true });
            copyFileSync(join(source, path), join(root, path));
            const manifest = JSON.parse(readFileSync(join(source, path), 'utf8'));
            for (const entry of manifest.cases) for (const path of [entry.recipe, entry.recording]) {
                mkdirSync(dirname(join(root, path)), { recursive: true });
                copyFileSync(join(source, path), join(root, path));
            }
        }
        for (const session of sessions) {
            const path = `investigations/${session}.json`;
            if (!existsSync(join(source, path))) continue;
            mkdirSync(dirname(join(root, path)), { recursive: true });
            copyFileSync(join(source, path), join(root, path));
        }
        // The scanner records a replay commit. This disposable repository is
        // never scored, accepted, pushed, or substituted for either code ref.
        execFileSync('git', ['init', '-q', root]);
        execFileSync('git', ['-C', root, '-c', 'user.name=Queue benchmark',
            '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false',
            '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-qm', 'Benchmark fixture']);
        const batches = readChallengeBatches(root).map(batch => {
            const score = rows.findLast(row => row.event === 'challenge'
                && row.challenge_manifest_sha256 === batch.manifestSha256);
            assert.ok(score, `missing saved measurement for ${batch.batch}`);
            const evaluation = JSON.parse(readFileSync(join(source, score.challenge_evaluation), 'utf8'));
            const selected = batch.cases.filter(entry => sessions.includes(`synthetic/${batch.batch}/${entry.id}`));
            const cases = evaluation.cases.filter(entry => selected.some(item => item.id === entry.id));
            assert.equal(cases.length, selected.length, 'every fixture case needs measured evidence');
            assert.equal(corpusDigest(batch.cases), evaluation.manifestSha256);
            return { ...batch, cases: selected, status: 'measured', evaluation: { ...evaluation, cases },
                evaluationPath: score.challenge_evaluation,
                replayInputSha256: challengeInputSnapshot(root, batch).sha256 };
        });
        const module = await import(pathToFileURL(join(root, 'scripts/mismatch-queue.mjs')).href);
        assert.equal(batches.reduce((sum, batch) => sum + batch.cases.length, 0), sessions.length,
            'every requested session must exist in the copied manifests');
        variants.push({ name, commit, root, batches, module });
    }
    console.log(JSON.stringify({ machine: hostname(), cpu: cpus()[0]?.model, node: process.version,
        commits: variants.map(({ name, commit }) => ({ name, commit })), sessions, scopedSession,
        workload: 'Cold diagnostic caches; copied historical rows and real immutable recordings; setup excluded.' }));
    const measuredFacts = queue => [...queue.sessions, ...queue.excluded].map(entry => ({
        session: entry.session, metrics: entry.metrics, regression: entry.regression,
        investigation: entry.investigation.status, resolution: entry.resolution ?? null,
    })).sort((a, b) => a.session.localeCompare(b.session));
    const results = [];
    let expected, expectedScope;
    // The first two unchanged runs measure noise. The remaining two pairs
    // use identical rows, recordings, scope and cold caches for both variants.
    for (const index of [0, 0, 0, 1, 0, 1]) {
        const variant = variants[index];
        rmSync(join(variant.root, '.cache'), { recursive: true, force: true });
        const started = performance.now();
        const cpuStarted = process.cpuUsage();
        const queue = variant.module.buildSyntheticQueue(variant.batches, { root: variant.root,
            owners: new Map(), diagnosticSessions: new Set([scopedSession]) });
        const elapsedMs = performance.now() - started;
        const cpu = process.cpuUsage(cpuStarted);
        const scoped = queue.sessions.find(entry => entry.session === scopedSession);
        assert.ok(scoped, 'scope must name an actionable, unexcluded case');
        assert.ok(scoped.firstMismatch, 'the real scoped diagnostic must succeed');
        if (expected) {
            assert.deepEqual(measuredFacts(queue), expected);
            assert.deepEqual(scoped, expectedScope);
        } else { expected = measuredFacts(queue); expectedScope = scoped; }
        const result = { variant: variant.name, elapsedMs, parentCpuMs: (cpu.user + cpu.system) / 1000 };
        results.push(result); console.log(JSON.stringify(result));
    }
    const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    const baselineMs = mean(results.slice(2).filter(row => row.variant === 'before').map(row => row.elapsedMs));
    const candidateMs = mean(results.filter(row => row.variant === 'after').map(row => row.elapsedMs));
    console.log(JSON.stringify({ baselineMs, candidateMs, reductionPercent: 100 * (1 - candidateMs / baselineMs),
        noiseFloorPercent: 100 * Math.abs(results[0].elapsedMs - results[1].elapsedMs)
            / mean(results.slice(0, 2).map(row => row.elapsedMs)), identicalMeasuredFactsAndScopedDiagnostic: true,
        note: 'Parent CPU excludes scanner children; this does not measure end-to-end acceptance or model time.' }));
} finally {
    rmSync(scratch, { recursive: true, force: true });
}
