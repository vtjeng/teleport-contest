import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { admitChallengeBatch, preparedFromDelivery } from './admit-challenge-batch.mjs';
import { challengeInputSnapshot, corpusDigest, digest, evaluationFields, readChallengeBatches,
    saveEvaluation, totalsFor } from './challenge-results.mjs';
import { appendRow, COLUMNS } from './score-log.mjs';
import { scorerIdentity } from './score-challenges.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'teleport-batch-admission-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const save = (path, value) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        const bytes = typeof value === 'string' ? value : JSON.stringify(value);
        writeFileSync(join(root, path), bytes);
        return digest(bytes);
    };
    git('init', '-qb', 'main');
    git('config', 'user.name', 'Admission fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    save('js/game.js', 'export const fixture = true;\n');
    save('frozen/scorer.js', '// fixture scorer\n');
    save('package.json', '{}');
    const makeCase = (batch, id) => {
        const segment = { seed: 273, datetime: '20000412120000', nethackrc: '', moves: 'i' };
        const prefix = batch === 'v1' ? 'challenges/cases/' : `challenges/cases/${batch}/`;
        const recipe = prefix + id + '.recipe.json';
        const recording = prefix + id + '.session.json';
        return { id, title: id, outcome: 'Missed mission; retain this valid C case.',
            reproducibility: 'Independent C replay matched the recorded screen and trace in this fixture.',
            recipe, recipeSha256: save(recipe, { version: 5, segments: [segment] }),
            recording, recordingSha256: save(recording, { version: 5, segments: [{ ...segment,
                steps: [{ key: '', screen: 'fixture', cursor: [0, 0, 1], rng: [] }] }] }),
        };
    };
    const original = { version: 1, cases: [makeCase('v1', 'initial')] };
    save('challenges/manifest.json', original);
    git('add', 'js/game.js', 'frozen/scorer.js', 'package.json', 'challenges/manifest.json', 'challenges/cases');
    git('commit', '-qm', 'admitted v1 fixture');
    const head = git('rev-parse', 'HEAD');
    const batch = readChallengeBatches(root)[0];
    const count = { matched: 1, total: 1 };
    const cases = original.cases.map(({ id, recordingSha256 }) => ({ id, recordingSha256,
        passed: true, metrics: { screens: count, rng: count, cursors: count } }));
    const evaluation = { version: 1, batch: 'v1', manifestPath: 'challenges/manifest.json',
        sha: head, utc: '2026-01-01T00:00:00Z', status: 'complete', cases,
        manifestSha256: corpusDigest(cases), scorerSha256: scorerIdentity(root).sha256,
        inputsSha256: challengeInputSnapshot(root, batch).sha256, totals: totalsFor(cases) };
    mkdirSync(join(root, 'challenges/evaluations'));
    const evidence = 'challenges/evaluations/initial.json';
    saveEvaluation(root, evidence, evaluation);
    save('SCORE.tsv', COLUMNS.join('\t') + '\n');
    appendRow({ ...evaluationFields(evidence, evaluation), note: 'Fixture baseline.' }, join(root, 'SCORE.tsv'));
    save(`.git/checkpoint-results/${head}/latest.json`, { commit: head, allPassed: true,
        recordings: { passed: true }, score: { screensMatched: 1, screensTotal: 1 } });
    const prepared = { version: 1, batch: 'v2', cases: [makeCase('v2', 'first'), makeCase('v2', 'second')] };
    return { root, head, save, prepared, evaluation, evidence };
}

test('admission preserves every prepared C case and freezes the next manifest', t => {
    const f = fixture(t);
    const old = readFileSync(join(f.root, 'challenges/manifest.json'), 'utf8');
    const result = admitChallengeBatch(f.root, f.prepared);
    assert.deepEqual(result, { batch: 'v2', manifestPath: 'challenges/manifests/v2.json',
        cases: 2, baselineRequired: true });
    assert.deepEqual(JSON.parse(readFileSync(join(f.root, result.manifestPath))), f.prepared);
    assert.equal(readFileSync(join(f.root, 'challenges/manifest.json'), 'utf8'), old);
    const frozen = readFileSync(join(f.root, result.manifestPath), 'utf8');
    assert.throws(() => admitChallengeBatch(f.root, f.prepared), /current complete measurements/);
    assert.equal(readFileSync(join(f.root, result.manifestPath), 'utf8'), frozen);
});

test('admission reads the hash-verified preparation delivery packet', t => {
    const f = fixture(t);
    const contents = JSON.stringify({ context: { kind: 'challenge-preparation', batch: 'v2' },
        manifest: f.prepared }) + '\n';
    const path = join(f.root, `${digest(contents)}.json`);
    writeFileSync(path, contents);
    assert.deepEqual(preparedFromDelivery(path), f.prepared);
    assert.equal(admitChallengeBatch(f.root, preparedFromDelivery(path)).cases, 2);
    writeFileSync(path, `${contents} `);
    assert.throws(() => preparedFromDelivery(path), /packet hash differs/);
});

test('admission rejects stale measurements and fixed checkpoint failures', async t => {
    await t.test('changed game', t => {
        const f = fixture(t);
        f.save('js/game.js', 'export const fixture = false;\n');
        assert.throws(() => admitChallengeBatch(f.root, f.prepared), /current complete measurements/);
    });
    await t.test('fixed regression', t => {
        const f = fixture(t);
        f.save(`.git/checkpoint-results/${f.head}/latest.json`, { commit: f.head, allPassed: false,
            recordings: { passed: true }, score: { screensMatched: 0, screensTotal: 1 } });
        assert.throws(() => admitChallengeBatch(f.root, f.prepared), /passing checkpoint/);
    });
});

test('admission verifies sequential batches, prepared hashes and matching replay inputs', async t => {
    const mutations = [
        ['wrong version', f => { f.prepared.batch = 'v3'; }, /next batch must be v2/],
        ['empty batch', f => { f.prepared.cases = []; }, /at least one|empty/],
        ['changed recording', f => { f.save(f.prepared.cases[0].recording, '{}'); }, /digest mismatch/],
        ['missing C evidence', f => { delete f.prepared.cases[0].reproducibility; }, /independent C replay/],
        ['wrong recipe', f => {
            const entry = f.prepared.cases[0];
            const recipe = JSON.parse(readFileSync(join(f.root, entry.recipe)));
            recipe.segments[0].moves = 'z';
            entry.recipeSha256 = f.save(entry.recipe, recipe);
        }, /inputs differ/],
    ];
    for (const [name, mutate, error] of mutations) await t.test(name, t => {
        const f = fixture(t); mutate(f);
        assert.throws(() => admitChallengeBatch(f.root, f.prepared), error);
    });
});
