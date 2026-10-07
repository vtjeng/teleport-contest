import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { compareChallengeBatches, loadEvaluationDirectory } from './compare-challenge-evaluations.mjs';
import { corpusDigest, digest, totalsFor, validateEvaluation } from './challenge-results.mjs';

// Distinct implementation SHAs and two-boundary recordings let gains and losses
// cancel in aggregate while remaining visible per case.
const baseline = 'a'.repeat(40), candidate = 'b'.repeat(40);
function measured(id, matched) {
    return { id, recordingSha256: digest(id), passed: matched === 2, error: null,
        metrics: Object.fromEntries(['screens', 'rng', 'cursors'].map(key => [key, { matched, total: 2 }])) };
}
function evaluation(cases, sha = baseline, batch = 'v1') {
    return { version: 1, sha, batch, utc: '2026-10-01T00:00:00Z', status: 'complete',
        scorerSha256: digest('same scorer'), inputsSha256: digest(sha),
        manifestSha256: corpusDigest(cases), cases, totals: totalsFor(cases) };
}
function compare(before, after) {
    validateEvaluation(before);
    validateEvaluation(after);
    return compareChallengeBatches(new Map([[before.batch, before]]), new Map([[after.batch, after]]),
        [{ batch: after.batch, manifestSha256: after.manifestSha256 }]);
}

test('different implementation digests are comparable and unchanged cases stay out of the report', () => {
    const cases = [measured('unchanged', 1)]; // A partial match can remain unchanged.
    const result = compare(evaluation(cases), evaluation(cases, candidate));
    assert.equal(result.reviewRequired, false);
    assert.equal(result.comparedCases, 1);
    assert.deepEqual(result.changes, []);
});

test('per-case regressions cannot hide behind equal aggregate gains', () => {
    const result = compare(evaluation([measured('loses', 2), measured('gains', 0)]),
        evaluation([measured('loses', 0), measured('gains', 2)], candidate));
    assert.equal(result.reviewRequired, true);
    assert.deepEqual(result.aggregateDelta, { sessions: 0, screens: 0, rng: 0, cursors: 0 });
    assert.deepEqual(result.regressions[0].metrics, ['sessions', 'screens', 'rng', 'cursors']);
    assert.equal(result.regressions[0].id, 'loses');
});

test('RNG-only, cursor-only, pass and error changes are reported', () => {
    for (const key of ['rng', 'cursors']) {
        const before = evaluation([measured('case', 2)]);
        const next = structuredClone(before);
        next.sha = candidate;
        next.cases[0].metrics[key].matched = 1; // Lose only this metric's second boundary.
        if (key === 'rng') next.cases[0].passed = false;
        next.totals = totalsFor(next.cases);
        assert.ok(compare(before, next).regressions[0].metrics.includes(key));
    }
    const before = evaluation([measured('case', 1)]);
    const next = structuredClone(before);
    next.cases[0].error = 'new replay error';
    assert.equal(compare(before, next).changes[0].errorChanged, true);
    assert.equal(compare(before, next).reviewRequired, true);
});

test('changed recordings, scorers, denominators and membership require review', () => {
    const before = evaluation([measured('case', 1)]);
    for (const mutate of [
        next => { next.cases[0].recordingSha256 = digest('different recording'); },
        next => { next.scorerSha256 = digest('different scorer'); },
        next => { next.cases[0].metrics.screens.total = 3; }, // Different denominator, not a gain.
        next => { next.cases = [measured('replacement', 1)]; },
    ]) {
        const next = structuredClone(before);
        mutate(next);
        next.manifestSha256 = corpusDigest(next.cases);
        next.totals = totalsFor(next.cases);
        const result = compare(before, next);
        assert.equal(result.reviewRequired, true);
        assert.ok(result.issues.length > 0);
    }
    const changed = evaluation([measured('replacement', 1)]);
    assert.deepEqual(compare(before, changed).issues.filter(row => row.status).map(row => row.status),
        ['added', 'removed']);
});

test('batch identity isolates repeated case IDs and missing or extra batches fail closed', () => {
    const first = evaluation([measured('shared-id', 1)]);
    const second = evaluation([measured('shared-id', 2)], baseline, 'v2');
    const before = new Map([['v1', first], ['v2', second]]);
    const admitted = [first, second].map(({ batch, manifestSha256 }) => ({ batch, manifestSha256 }));
    assert.equal(compareChallengeBatches(before, before, admitted).comparedCases, 2);
    assert.equal(compareChallengeBatches(new Map(), new Map(), admitted).issues.length, 2);
    assert.equal(compareChallengeBatches(before, before, admitted.slice(0, 1)).reviewRequired, true);
    const failed = { ...first, status: 'failed', totals: null, error: 'runner failed' };
    assert.equal(compare(first, failed).reviewRequired, true);
    assert.equal(compareChallengeBatches(before, before,
        [{ batch: 'v1', manifestSha256: digest('not the admitted corpus') }]).reviewRequired, true);
});

test('directory loading verifies explicit SHAs, schemas and unique batch identity, not filenames', t => {
    const directory = mkdtempSync(join(tmpdir(), 'compare-challenges-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const value = evaluation([measured('case', 1)]);
    const file = join(directory, 'not-a-batch-name.json');
    writeFileSync(file, JSON.stringify(value));
    assert.equal(loadEvaluationDirectory(directory, baseline).get('v1').sha, baseline);
    assert.throws(() => loadEvaluationDirectory(directory, candidate), /expected commit/);
    assert.throws(() => loadEvaluationDirectory(directory, 'short'), /full measured commit/);
    const corrupt = { ...value, totals: {} };
    writeFileSync(file, JSON.stringify(corrupt));
    assert.throws(() => loadEvaluationDirectory(directory, baseline), /totals differ/);
    writeFileSync(file, JSON.stringify(value));
    writeFileSync(join(directory, 'duplicate.json'), JSON.stringify(value));
    assert.throws(() => loadEvaluationDirectory(directory, baseline), /duplicate evaluation/);
});
