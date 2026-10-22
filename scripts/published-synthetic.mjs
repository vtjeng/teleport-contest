// A publication points at one complete accepted cohort, never each batch's
// independently newest row. The immutable evaluations remain the authority.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { digest, evaluationBatch, validateEvaluation } from './challenge-results.mjs';

export function completeCohort(entries, evaluations, sha) {
  if (!/^[a-f0-9]{40}$/.test(sha ?? '') || !entries?.length
      || entries.length !== evaluations.length) throw new Error('Incomplete synthetic cohort');
  const seen = new Set();
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i], value = validateEvaluation(evaluations[i]);
    if (seen.has(entry.batch) || evaluationBatch(value) !== entry.batch
        || value.sha !== sha || value.status !== 'complete'
        || value.manifestSha256 !== entry.manifestSha256
        || value.inputsSha256 !== entry.inputsSha256 || !value.inputsSha256
        || value.scorerSha256 !== evaluations[0].scorerSha256)
      throw new Error('Mixed, failed or changed synthetic cohort');
    seen.add(entry.batch);
  }
  return {
    totals: Object.fromEntries(['sessions', 'screens', 'rng', 'cursors'].map(metric => [metric, {
      matched: evaluations.reduce((sum, value) => sum + value.totals[metric].matched, 0),
      total: evaluations.reduce((sum, value) => sum + value.totals[metric].total, 0),
    }])),
    measuredFrom: evaluations.map(value => value.utc).sort((a, b) => Date.parse(a) - Date.parse(b))[0],
    measuredThrough: evaluations.map(value => value.utc).sort((a, b) => Date.parse(a) - Date.parse(b)).at(-1),
  };
}

export function publishedScoreView(view, receipt, evaluations) {
  if (receipt.version !== 1) throw new Error('Unknown synthetic publication format');
  const cohort = completeCohort(receipt.entries, evaluations, receipt.sha);
  if (cohort.measuredFrom !== receipt.measuredFrom || cohort.measuredThrough !== receipt.measuredThrough
      || !Number.isFinite(Date.parse(receipt.checkpointCompletedAt))
      || Date.parse(receipt.checkpointCompletedAt) < Date.parse(cohort.measuredThrough))
    throw new Error('Invalid synthetic publication timestamps');
  const datasetMatches = view.batches.length === receipt.entries.length && receipt.entries.every(entry =>
    view.batches.some(batch => batch.batch === entry.batch && batch.manifestSha256 === entry.manifestSha256));
  const fresh = datasetMatches && receipt.entries.every(entry => view.batches.some(batch =>
    batch.batch === entry.batch && batch.freshness?.expected === entry.inputsSha256));
  return { ...view, totals: cohort.totals, status: fresh ? 'measured' : 'stale', error: null,
    publication: { sha: receipt.sha, ...cohort, checkpointCompletedAt: receipt.checkpointCompletedAt,
      checkpoint: receipt.checkpoint, batches: receipt.entries.length, datasetMatches, fresh } };
}

export function readPublishedScore(root, view) {
  const path = join(root, 'challenges/published.json');
  if (!existsSync(path)) return view;
  try {
    const receipt = JSON.parse(readFileSync(path, 'utf8'));
    const values = receipt.entries.map(entry => {
      if (!/^challenges\/evaluations\/[a-z0-9][a-z0-9.-]*\.json$/.test(entry.path))
        throw new Error('Invalid published evidence path');
      const bytes = readFileSync(join(root, entry.path));
      if (digest(bytes) !== entry.sha256) throw new Error('Published evidence hash changed');
      return JSON.parse(bytes);
    });
    return publishedScoreView(view, receipt, values);
  } catch {
    // Never substitute unaccepted newest rows when the publication cannot be
    // verified, or claim a changed/partial dataset is the published aggregate.
    return { ...view, totals: null, status: 'unknown', error: 'Published score evidence unavailable.' };
  }
}

// Also embedded in the page. A public CI observation annotates the last score;
// it cannot replace it or turn its measurement timestamp into a refresh time.
export function syntheticPublicationStatus(publication, view) {
  if (!publication) return 'Published score status unknown';
  if (!publication.datasetMatches) return 'Previous dataset — current dataset has no complete published score';
  const candidate = view?.currentCandidate;
  const run = candidate?.gates?.Checkpoint?.run;
  if (view?.api?.status === 'fresh' && candidate?.sha !== publication.sha && run?.sha === candidate?.sha) {
    if (['queued', 'in_progress'].includes(run.status)) return 'Updating — showing last completed score';
    if (run.status === 'completed' && run.conclusion !== 'success')
      return 'Latest validation failed — showing last completed score';
    if (run.status === 'completed' && run.conclusion === 'success')
      return 'Validation complete — newer score awaits accepted publication';
  }
  return publication.fresh ? 'Complete · ' + publication.batches + ' batches'
    : 'Earlier measurement — newer evaluation status unknown';
}
