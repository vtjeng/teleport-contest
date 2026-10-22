// Called by the existing one-shot publication checker after Lint/Pages succeed.
// No replay, dispatch, polling, new credential, or automatic Git write.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCheckpointResult } from './checkpoint-results.mjs';
import { digest, evaluationFields, readChallengeBatches } from './challenge-results.mjs';
import { verifyAdmissionEvaluations } from './admission-proof.mjs';
import { verifyHostedRun } from './fetch-hosted-checkpoint.mjs';
import { loadEvaluationDirectory, compareChallengeBatches } from './compare-challenge-evaluations.mjs';
import { currentFromResults, compareToBaseline } from './score-baseline.mjs';
import { readRows } from './score-log.mjs';
import { recordEvaluations } from './score-challenges.mjs';
import { completeCohort } from './published-synthetic.mjs';

export function recordPublishedSynthetic(root, commit, baseline, publication, gh, {
  git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(),
  checkpoint = readCheckpointResult,
} = {}) {
  if (!/^[a-f0-9]{40}$/.test(baseline ?? '') || !publication.passed || publication.commit !== commit)
    throw new Error('Synthetic publication requires an accepted baseline and successful publication gates');
  git(['merge-base', '--is-ancestor', baseline, commit]);
  git(['merge-base', '--is-ancestor', commit, 'HEAD']);
  const remote = git(['ls-remote', 'https://github.com/vtjeng/teleport-contest.git', 'refs/heads/main']).split(/\s/)[0];
  if (remote !== commit) throw new Error('Record the current accepted Main before advancing it');
  const current = checkpoint(root, commit), prior = checkpoint(root, baseline);
  for (const [result, sha] of [[current, commit], [prior, baseline]]) {
    if (!result.allPassed || result.executionCommit !== sha || result.commit !== sha || result.score?.passing !== 44)
      throw new Error('Missing successful exact-SHA checkpoint');
    for (const [path, hash] of Object.entries(result.artifactHashes))
      assert.equal(digest(readFileSync(join(result.artifacts, path))), hash, 'Archived checkpoint bytes changed');
  }
  const repository = 'vtjeng/teleport-contest';
  const run = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${current.hostedRun.id}`]));
  assert.deepEqual(verifyHostedRun(run, repository, commit), current.hostedRun);
  const jobs = JSON.parse(gh(['api', `repos/${repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs?per_page=100`]));
  if (!jobs.jobs?.length || jobs.jobs.length !== jobs.total_count
      || jobs.jobs.some(job => job.status !== 'completed' || !['success', 'skipped'].includes(job.conclusion)))
    throw new Error('Incomplete checkpoint completion evidence');
  const checkpointCompletedAt = jobs.jobs.map(job => job.completed_at).filter(Boolean).sort().at(-1);
  const batches = readChallengeBatches(root);
  for (const result of [prior, current]) for (const batch of batches) {
    const path = `synthetic/ci-${batch.batch}.json`;
    assert.equal(digest(readFileSync(join(result.artifacts, path))),
      result.hostedEvidence?.fileHashes?.[path], 'Synthetic archive differs from imported CI evidence');
  }
  const before = loadEvaluationDirectory(join(prior.artifacts, 'synthetic'), baseline);
  const after = loadEvaluationDirectory(join(current.artifacts, 'synthetic'), commit);
  const comparison = compareChallengeBatches(before, after, batches);
  if (comparison.reviewRequired) throw new Error('Synthetic comparison requires review; retain last published score');
  const sessions = result => JSON.parse(readFileSync(join(result.artifacts, 'session-results.json'))).results;
  assert.deepEqual(compareToBaseline(currentFromResults(sessions(current)), currentFromResults(sessions(prior))),
    { drops: [], missing: [] }, 'Fixed checkpoint regressed');
  verifyAdmissionEvaluations(root, { commit, batches }, [...after.values()]);
  const entries = batches.map(batch => {
    const source = `synthetic/ci-${batch.batch}.json`, bytes = readFileSync(join(current.artifacts, source));
    const hash = current.hostedEvidence?.fileHashes?.[source];
    assert.equal(digest(bytes), hash, 'Synthetic bytes differ from imported CI evidence');
    const value = after.get(batch.batch);
    return { batch: batch.batch, manifestSha256: batch.manifestSha256, inputsSha256: value.inputsSha256,
      path: `challenges/evaluations/hosted-${run.id}-${run.run_attempt}-${batch.batch}.json`, sha256: hash };
  });
  const cohort = completeCohort(entries, batches.map(batch => after.get(batch.batch)), commit);
  if (!Number.isFinite(Date.parse(checkpointCompletedAt))
      || Date.parse(checkpointCompletedAt) < Date.parse(cohort.measuredThrough))
    throw new Error('Checkpoint completion predates measurement');
  const receipt = { version: 1, sha: commit, baseline, ...cohort, checkpointCompletedAt,
    checkpoint: { id: run.id, attempt: run.run_attempt, url: run.html_url },
    publication: publication.workflows, entries };
  const pointer = join(root, 'challenges/published.json');
  if (existsSync(pointer)) {
    const old = JSON.parse(readFileSync(pointer));
    if (Date.parse(old.measuredThrough) > Date.parse(receipt.measuredThrough)) throw new Error('Cannot publish older evidence');
  }
  // Preflight every destination, then import immutable files with the canonical
  // ledger writer. On interruption the old pointer remains selected; retry
  // verifies existing bytes/rows and finishes without duplicating measurements.
  for (const entry of entries) if (existsSync(join(root, entry.path)))
    assert.equal(digest(readFileSync(join(root, entry.path))), entry.sha256, 'Existing evidence changed');
  for (const entry of entries) if (!existsSync(join(root, entry.path)))
    writeFileSync(join(root, entry.path), readFileSync(join(current.artifacts, `synthetic/ci-${entry.batch}.json`)), { flag: 'wx' });
  const rows = readRows(join(root, 'SCORE.tsv'));
  const recorded = new Set(rows.map(row => row.challenge_evaluation));
  for (const entry of entries) for (const row of rows.filter(row => row.challenge_evaluation === entry.path))
    for (const [key, value] of Object.entries(evaluationFields(entry.path, after.get(entry.batch))))
      assert.equal(row[key], String(value), 'Recorded row differs from immutable evidence');
  recordEvaluations(root, entries.filter(entry => !recorded.has(entry.path)).map(entry => entry.path));
  const bytes = JSON.stringify(receipt, null, 2) + '\n';
  if (existsSync(pointer) && readFileSync(pointer, 'utf8') === bytes) return { changed: false, sha: commit };
  writeFileSync(pointer + '.tmp', bytes);
  renameSync(pointer + '.tmp', pointer);
  return { changed: true, sha: commit, measuredThrough: cohort.measuredThrough, totals: cohort.totals };
}
