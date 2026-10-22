import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { COLUMNS, readRows } from './score-log.mjs';
import { digest, readChallengeBatches, challengeInputSnapshot, totalsFor } from './challenge-results.mjs';
import { scorerIdentity } from './score-challenges.mjs';
import { recordPublishedSynthetic } from './record-published-synthetic.mjs';
import { readPublishedScore, publishedScoreView, syntheticPublicationStatus } from './published-synthetic.mjs';
const sha = 'b'.repeat(40), base = 'a'.repeat(40), time = '2026-10-22T07:00:00Z';
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'published-synthetic-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['frozen', 'challenges/cases', 'challenges/manifests', 'challenges/evaluations', 'current/synthetic', 'prior/synthetic'])
    mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, 'SCORE.tsv'), COLUMNS.join('\t') + '\n');
  for (const [batch, id] of [['v1', 'one'], ['v2', 'two']]) {
    const recipe = JSON.stringify({ version: 5, segments: [{ moves: 'i' }] });
    const recording = JSON.stringify({ version: 5, segments: [{ steps: [{ screen: 'start' }, { screen: 'inventory' }] }] });
    const entry = { id, title: id, recipe: `challenges/cases/${id}.recipe.json`, recording: `challenges/cases/${id}.session.json`,
      recipeSha256: digest(recipe), recordingSha256: digest(recording) };
    writeFileSync(join(root, entry.recipe), recipe); writeFileSync(join(root, entry.recording), recording);
    writeFileSync(join(root, batch === 'v1' ? 'challenges/manifest.json' : 'challenges/manifests/v2.json'), JSON.stringify({ version: 1, batch, cases: [entry] }));
  }
  const batches = readChallengeBatches(root), summaries = {};
  for (const [commit, dir] of [[sha, 'current'], [base, 'prior']]) {
    const artifactHashes = {}, fileHashes = {};
    const results = { results: [{ session: 'fixture', metrics: { screens: { matched: 2 }, rngCalls: { matched: 2 }, cursors: { matched: 2 } } }] };
    const bytes = JSON.stringify(results);
    writeFileSync(join(root, dir, 'session-results.json'), bytes); artifactHashes['session-results.json'] = digest(bytes);
    for (const batch of batches) {
      const cases = batch.cases.map(entry => ({ id: entry.id, recordingSha256: entry.recordingSha256, passed: true,
        metrics: Object.fromEntries(['screens', 'rng', 'cursors'].map(key => [key, { matched: 2, total: 2 }])), error: null }));
      const value = { version: 1, batch: batch.batch, manifestPath: batch.manifestPath, sha: commit, utc: time, status: 'complete',
        manifestSha256: batch.manifestSha256, scorerSha256: scorerIdentity(root).sha256,
        inputsSha256: challengeInputSnapshot(root, batch).sha256, cases, totals: totalsFor(cases) };
      const path = `synthetic/ci-${batch.batch}.json`, bytes = JSON.stringify(value);
      writeFileSync(join(root, dir, path), bytes); fileHashes[path] = digest(bytes);
    }
    summaries[commit] = { allPassed: true, commit, executionCommit: commit, score: { passing: 44 },
      artifacts: join(root, dir), artifactHashes, hostedEvidence: { fileHashes },
      hostedRun: { provider: 'github', repository: 'vtjeng/teleport-contest', id: '123', attempt: '1' } };
  }
  const publication = { commit: sha, passed: true, workflows: [] };
  const run = { id: 123, run_attempt: 1, head_sha: sha, status: 'completed', conclusion: 'success',
    repository: { full_name: 'vtjeng/teleport-contest' }, head_repository: { full_name: 'vtjeng/teleport-contest' },
    path: '.github/workflows/checkpoint-trial.yml', html_url: 'https://github.com/vtjeng/teleport-contest/actions/runs/123' };
  const gh = args => JSON.stringify(args[1].includes('/jobs?') ? { total_count: 1, jobs: [{ status: 'completed', conclusion: 'success', completed_at: '2026-10-22T07:01:00Z' }] } : run);
  const options = { git: args => args[0] === 'ls-remote' ? sha + '\trefs/heads/main' : '', checkpoint: (_, commit) => summaries[commit] };
  const record = () => recordPublishedSynthetic(root, sha, base, publication, gh, options);
  const view = { batches: batches.map(batch => ({ ...batch, freshness: { expected: challengeInputSnapshot(root, batch).sha256 } })), status: 'incomplete', totals: null };
  return { root, record, view, summaries, publication, run };
}
test('complete accepted evidence records once, preserves actual timestamps, and survives a newer partial/failed row', t => {
  const f = fixture(t);
  assert.equal(f.record().changed, true);
  const pointer = readFileSync(join(f.root, 'challenges/published.json'), 'utf8');
  const ledger = readFileSync(join(f.root, 'SCORE.tsv'), 'utf8');
  assert.equal(f.record().changed, false);
  assert.equal(readFileSync(join(f.root, 'challenges/published.json'), 'utf8'), pointer);
  assert.equal(readFileSync(join(f.root, 'SCORE.tsv'), 'utf8'), ledger);
  assert.equal(readRows(join(f.root, 'SCORE.tsv')).length, 2);
  for (const status of ['incomplete', 'failed']) {
    const view = readPublishedScore(f.root, { ...f.view, status, totals: null });
    assert.deepEqual(view.totals.screens, { matched: 4, total: 4 });
    assert.equal(view.publication.sha, sha); assert.equal(view.publication.measuredThrough, time);
    assert.equal(view.publication.checkpointCompletedAt, '2026-10-22T07:01:00Z');
  }
});
test('partial, failed, changed and mixed candidates cannot replace the last complete pointer', t => {
  const f = fixture(t); f.record();
  const pointer = readFileSync(join(f.root, 'challenges/published.json'), 'utf8');
  const path = join(f.root, 'current/synthetic/ci-v2.json'), original = readFileSync(path, 'utf8');
  for (const patch of [{ sha: base }, { status: 'failed', totals: null, error: 'runner failed' }, { utc: 'invalid' }]) {
    writeFileSync(path, JSON.stringify({ ...JSON.parse(original), ...patch }));
    assert.throws(f.record);
    assert.equal(readFileSync(join(f.root, 'challenges/published.json'), 'utf8'), pointer);
  }
  rmSync(path); assert.throws(f.record); writeFileSync(path, original);
  f.publication.passed = false; assert.throws(f.record, /successful publication/);
  assert.equal(readFileSync(join(f.root, 'challenges/published.json'), 'utf8'), pointer);
});
test('dataset and input changes retain clearly labelled earlier aggregate; corrupt evidence is unknown', t => {
  const f = fixture(t); f.record();
  const changed = readPublishedScore(f.root, { ...f.view, batches: f.view.batches.slice(0, 1) });
  assert.equal(changed.publication.datasetMatches, false); assert.equal(changed.totals.sessions.total, 2);
  assert.match(syntheticPublicationStatus(changed.publication), /Previous dataset/);
  const stale = readPublishedScore(f.root, { ...f.view, batches: f.view.batches.map(b => ({ ...b, freshness: { expected: digest('new game') } })) });
  assert.equal(stale.status, 'stale'); assert.equal(stale.publication.measuredThrough, time);
  assert.match(syntheticPublicationStatus(stale.publication), /unknown/);
  const receipt = JSON.parse(readFileSync(join(f.root, 'challenges/published.json')));
  writeFileSync(join(f.root, receipt.entries[0].path), '{}');
  assert.equal(readPublishedScore(f.root, f.view).status, 'unknown');
  assert.equal(readPublishedScore(f.root, f.view).totals, null);
});
test('timestamp provenance and complete cohort membership are checked even on display', t => {
  const f = fixture(t); f.record();
  const receipt = JSON.parse(readFileSync(join(f.root, 'challenges/published.json')));
  const values = receipt.entries.map(e => JSON.parse(readFileSync(join(f.root, e.path))));
  assert.throws(() => publishedScoreView(f.view, { ...receipt, measuredThrough: '2026-10-23T00:00:00Z' }, values), /timestamps/);
  assert.throws(() => publishedScoreView(f.view, receipt, values.slice(1)), /Incomplete/);
  assert.ok(existsSync(join(f.root, 'challenges/published.json')));
});
test('only verified exact-candidate API states announce updating, failure or completed validation', () => {
  const publication = { sha: base, fresh: true, datasetMatches: true, batches: 98 };
  const view = { api: { status: 'fresh' }, currentCandidate: { sha, gates: { Checkpoint: { run: { sha, status: 'in_progress', conclusion: null } } } } };
  assert.match(syntheticPublicationStatus(publication, view), /^Updating/);
  view.currentCandidate.gates.Checkpoint.run = { sha, status: 'completed', conclusion: 'failure' };
  assert.match(syntheticPublicationStatus(publication, view), /failed/);
  view.currentCandidate.gates.Checkpoint.run.conclusion = 'success';
  assert.match(syntheticPublicationStatus(publication, view), /awaits accepted publication/);
  view.api.status = 'stale'; assert.equal(syntheticPublicationStatus(publication, view), 'Complete · 98 batches');
  view.api.status = 'fresh'; view.currentCandidate.gates.Checkpoint.run.sha = base;
  assert.equal(syntheticPublicationStatus(publication, view), 'Complete · 98 batches');
});

test('unsuccessful checkpoint or publication never creates a first score pointer', t => {
  const f = fixture(t);
  f.summaries[sha].allPassed = false;
  assert.throws(f.record, /successful exact-SHA/);
  f.summaries[sha].allPassed = true;
  f.run.conclusion = 'failure';
  assert.throws(f.record, /successful/);
  assert.equal(existsSync(join(f.root, 'challenges/published.json')), false);
  assert.equal(readRows(join(f.root, 'SCORE.tsv')).length, 0);
});
test('retry completes an interrupted ledger import without duplicate rows or resetting dates', t => {
  const f = fixture(t); f.record();
  const path = join(f.root, 'SCORE.tsv'), lines = readFileSync(path, 'utf8').trimEnd().split('\n');
  const pointer = readFileSync(join(f.root, 'challenges/published.json'), 'utf8');
  // Simulate interruption after one of two canonical row appends. The reader
  // still selects the immutable complete cohort, never the partial newest rows.
  writeFileSync(path, lines.slice(0, 2).join('\n') + '\n');
  assert.equal(readPublishedScore(f.root, f.view).totals.sessions.total, 2);
  f.record();
  assert.equal(readRows(path).length, 2);
  assert.equal(readFileSync(join(f.root, 'challenges/published.json'), 'utf8'), pointer);
});
