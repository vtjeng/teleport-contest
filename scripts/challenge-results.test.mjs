import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { COLUMNS, readRows } from './score-log.mjs';
import { challengeDashboard, challengeInputSnapshot, challengePath, challengeState,
    compareEvaluations, corpusDigest, digest, evaluationFields, readChallengeBatches,
    readChallenges, saveEvaluation, totalsFor, admittedBatchIds } from './challenge-results.mjs';
import { measuredCases, recordEvaluation, recordEvaluations, runAllBatches } from './score-challenges.mjs';

// Distinct complete SHAs distinguish an initial implementation, its successor,
// and a changed scorer without relying on the repository's mutable history.
const FIRST_SHA = 'a'.repeat(40);
const NEXT_SHA = 'b'.repeat(40);
const SCORER = digest('scorer one');
const FIRST_TIME = '2026-09-01T00:00:00.000Z';
const NEXT_TIME = '2026-09-02T00:00:00.000Z';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'teleport-challenge-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    mkdirSync(join(root, 'challenges/cases'), { recursive: true });
    mkdirSync(join(root, 'challenges/evaluations'));
    writeFileSync(join(root, 'SCORE.tsv'), `${COLUMNS.join('\t')}\n`);
    return root;
}
function entry(root, id) {
    // Two recorded boundaries allow a partial result, a full match and a zero
    // to be distinguished without a large game fixture.
    const recipe = JSON.stringify({ version: 5, segments: [{ moves: 'i' }] });
    const recording = JSON.stringify({ version: 5, segments: [{ steps: [{ screen: 'start' }, { screen: 'inventory' }] }] });
    const result = { id, title: id, recipe: `challenges/cases/${id}.recipe.json`,
        recording: `challenges/cases/${id}.session.json`, recipeSha256: digest(recipe), recordingSha256: digest(recording) };
    writeFileSync(join(root, result.recipe), recipe);
    writeFileSync(join(root, result.recording), recording);
    return result;
}
function manifest(root, cases) {
    writeFileSync(join(root, 'challenges/manifest.json'), JSON.stringify({ version: 1, cases }));
}
function measured(entry, matched) {
    // All three metrics use the same two boundaries for compact fixtures.
    return { id: entry.id, recordingSha256: entry.recordingSha256, passed: matched === 2,
        metrics: { screens: { matched, total: 2 }, rng: { matched, total: 2 }, cursors: { matched, total: 2 } }, error: null };
}
function evaluation(cases, sha = FIRST_SHA, utc = FIRST_TIME) {
    return { version: 1, sha, utc, status: 'complete', scorerSha256: SCORER,
        manifestSha256: corpusDigest(cases), cases, totals: totalsFor(cases) };
}
function saved(root, name, evaluation) {
    const path = `challenges/evaluations/${name}.json`;
    saveEvaluation(root, path, evaluation);
    return Object.fromEntries(Object.entries(evaluationFields(path, evaluation)).map(([key, value]) => [key, String(value)]));
}
function fresh(root, evaluation, batch = 'v1') {
    const snapshot = challengeInputSnapshot(root, batch);
    return { ...evaluation, inputsSha256: snapshot.sha256,
        inputFiles: snapshot.files.map(file => file.path) };
}

test('bulk score import validates every batch before appending any rows', t => {
    const root = fixture(t);
    const a = entry(root, 'first'), b = entry(root, 'second');
    manifest(root, [a]);
    mkdirSync(join(root, 'challenges/manifests'));
    writeFileSync(join(root, 'challenges/manifests/v2.json'), JSON.stringify({ version: 1, batch: 'v2', cases: [b] }));
    const first = saved(root, 'first', evaluation([measured(a, 1)]));
    const second = saved(root, 'second', { ...evaluation([measured(b, 2)]), batch: 'v2' });
    // The second packet belongs to the wrong immutable membership. A valid
    // first packet must not cause a partial import before this is rejected.
    const secondPath = join(root, second.challenge_evaluation);
    const secondBytes = readFileSync(secondPath);
    writeFileSync(secondPath, JSON.stringify({ ...evaluation([measured(a, 2)]), batch: 'v2' }));
    const paths = [first.challenge_evaluation, second.challenge_evaluation];
    assert.throws(() => recordEvaluations(root, paths), /complete admitted batch/);
    assert.equal(readRows(join(root, 'SCORE.tsv')).length, 0);
    writeFileSync(secondPath, secondBytes);
    assert.deepEqual(recordEvaluations(root, paths).map(row => row.challenge_evaluation), paths);
    assert.deepEqual(readRows(join(root, 'SCORE.tsv')).map(row => row.challenge_evaluation), paths);
    assert.throws(() => recordEvaluations(root, paths), /already recorded/);
});

test('bulk import preserves historical membership, measurement order and artifact validation', t => {
    const root = fixture(t);
    const a = entry(root, 'case');
    manifest(root, [a]);
    const old = saved(root, 'old', evaluation([measured(a, 0)]));
    recordEvaluation(root, old.challenge_evaluation);
    const newer = saved(root, 'newer', evaluation([measured(a, 1)], NEXT_SHA, NEXT_TIME));
    const older = saved(root, 'older', evaluation([measured(a, 2)], FIRST_SHA, FIRST_TIME));
    const before = readFileSync(join(root, 'SCORE.tsv'), 'utf8');
    // Both packets individually validate, but together reverse this batch's
    // measurement order. Prevalidation rejects them without a score write.
    assert.throws(() => recordEvaluations(root, [newer.challenge_evaluation, older.challenge_evaluation]), /measurement order/);
    assert.throws(() => recordEvaluations(root, [newer.challenge_evaluation, newer.challenge_evaluation]), /already recorded/);
    assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), before);
    // A previously recorded artifact remains authoritative, not an unchecked
    // cached summary; each new invocation must read and validate it again.
    const oldPath = join(root, old.challenge_evaluation), bytes = readFileSync(oldPath);
    writeFileSync(oldPath, '{}');
    assert.throws(() => recordEvaluations(root, [newer.challenge_evaluation]), /invalid challenge evaluation/);
    writeFileSync(oldPath, bytes);
    // Keep the new manifest internally valid so the historical membership
    // check, rather than the recording digest check, rejects the replacement.
    const replacement = JSON.stringify({ version: 5, segments: [{ steps: [{ screen: 'start' }, { screen: 'changed inventory' }] }] });
    writeFileSync(join(root, a.recording), replacement);
    const changed = { ...a, recordingSha256: digest(replacement) };
    manifest(root, [changed]);
    const changedPath = saved(root, 'changed', evaluation([measured(changed, 2)], NEXT_SHA, NEXT_TIME)).challenge_evaluation;
    assert.throws(() => recordEvaluations(root, [changedPath]), /membership is immutable/);
    assert.equal(readFileSync(join(root, 'SCORE.tsv'), 'utf8'), before);
});

test('reviewed hosted evidence becomes current queue evidence through explicit score import', t => {
    const root = fixture(t);
    const a = entry(root, 'mismatches');
    manifest(root, [a]);
    const hosted = fresh(root, evaluation([measured(a, 1)], NEXT_SHA, NEXT_TIME));
    const archive = join(root, 'hosted-artifact.json');
    writeFileSync(archive, JSON.stringify(hosted));
    // Match the fetcher's instructions: copy unchanged bytes, then explicitly record.
    const destination = 'challenges/evaluations/hosted-123-1-v1.json';
    copyFileSync(archive, join(root, destination));
    recordEvaluation(root, destination);
    const state = challengeState(root, readRows(join(root, 'SCORE.tsv')), NEXT_SHA);
    assert.equal(state.status, 'measured'); // Current evidence need not be screen parity.
    assert.equal(state.batches[0].evaluationPath, destination);
    assert.equal(state.aggregate.totals.screens.matched, 1); // Preserve the measured partial match.
    assert.equal(state.aggregate.totals.screens.total, 2);
    assert.equal(state.generationReady, false); // The unresolved case must still prevent parity.
});

test('growth separates added screens from improvements and regressions on existing cases', t => {
    const root = fixture(t);
    const a = entry(root, 'improves'), b = entry(root, 'regresses'), c = entry(root, 'added');
    const first = evaluation([measured(a, 0), measured(b, 2)]);
    const next = evaluation([measured(a, 1), measured(b, 1), measured(c, 2)], NEXT_SHA, NEXT_TIME);
    assert.deepEqual(compareEvaluations(first, next), { added: 1, addedScreens: 2, addedScreensMatched: 2,
        improved: 1, regressed: 1, unchanged: 0, uncomparable: 0, screensGained: 1, screensLost: 1 });
    const unchangedCode = evaluation([...first.cases, measured(c, 2)]);
    assert.equal(compareEvaluations(first, unchangedCode).screensGained, 0);
    assert.equal(compareEvaluations(first, unchangedCode).added, 1);
    const otherBatch = { ...unchangedCode, batch: 'v2' };
    assert.equal(compareEvaluations(first, otherBatch).screensGained, 0);
    assert.equal(compareEvaluations(first, otherBatch).added, otherBatch.cases.length);
    next.scorerSha256 = digest('scorer two');
    assert.equal(compareEvaluations(first, next).uncomparable, 2);
});

test('first measurements persist; additions are unmeasured until included in a saved evaluation', t => {
    const root = fixture(t);
    const a = entry(root, 'existing'), b = entry(root, 'new');
    manifest(root, [a, b]);
    const first = evaluation([measured(a, 0)]);
    const row = saved(root, 'first', first);
    const bytes = readFileSync(join(root, row.challenge_evaluation));
    assert.throws(() => saveEvaluation(root, row.challenge_evaluation, first), /EEXIST/u);
    assert.deepEqual(readFileSync(join(root, row.challenge_evaluation)), bytes);
    const initialView = challengeDashboard(root, [row], FIRST_SHA);
    assert.equal(initialView.status, 'stale');
    assert.equal(initialView.cases[0].first.screens.matched, 0);
    assert.equal(initialView.cases[1].current, null);
    const next = saved(root, 'next',
        fresh(root, evaluation([measured(a, 2), measured(b, 1)], NEXT_SHA, NEXT_TIME)));
    const view = challengeDashboard(root, [row, next], NEXT_SHA);
    assert.equal(view.status, 'measured');
    assert.equal(view.cases[0].first.sha, FIRST_SHA);
    assert.equal(view.cases[0].first.screens.matched, 0);
    assert.equal(view.cases[0].delta, 2);
    assert.equal(view.totals.screens.matched, 3);
    // Saved evaluation times and the growing denominator survive into the chart.
    assert.deepEqual(view.history.map(point => [point.utc, point.screens, point.screensTotal]),
        [[FIRST_TIME, 0, 2], [NEXT_TIME, 3, 4]]);
    assert.equal(view.history[1].changes.addedScreensMatched, 1);
    assert.equal(view.history[1].changes.screensGained, 2);

    // A report-only HEAD change does not stale replay evidence; input digests govern freshness.
    assert.equal(challengeDashboard(root, [row, next], FIRST_SHA).status, 'measured');
});

test('missing, failed and measured zero stay distinct, including ledger evidence', t => {
    const root = fixture(t);
    const a = entry(root, 'case');
    manifest(root, [a]);
    assert.equal(challengeDashboard(root, [], FIRST_SHA).status, 'unmeasured');
    const zero = saved(root, 'zero', fresh(root, evaluation([measured(a, 0)])));
    assert.equal(challengeDashboard(root, [zero], FIRST_SHA).totals.screens.matched, 0);
    const failure = { ...evaluation([measured(a, 0)]), status: 'failed', error: 'worker timeout', totals: null,
        cases: [{ id: a.id, recordingSha256: a.recordingSha256 }] };
    const failed = saved(root, 'failed', failure);
    const view = challengeDashboard(root, [zero, failed], FIRST_SHA);
    assert.equal(view.status, 'failed');
    assert.equal(view.totals, null);
    assert.equal(view.cases[0].first.screens.matched, 0);
    assert.equal(view.cases[0].current, null);
    assert.equal(view.history[0].screens, 0);
    assert.equal(view.history[1].screens, null);
    assert.equal(view.history[1].error, 'worker timeout');

    recordEvaluation(root, failed.challenge_evaluation);
    assert.throws(() => recordEvaluation(root, failed.challenge_evaluation), /already recorded/u);
    const badRow = { ...zero, challenge_screens_matched: '1' }; // Ledger must agree with saved zero.
    assert.match(challengeDashboard(root, [badRow], FIRST_SHA).error, /differs from SCORE/u);
});

test('catalog and state keep batches separate and require fresh evidence for readiness', t => {
    const root = fixture(t);
    const a = entry(root, 'one'), b = entry(root, 'one');
    manifest(root, [a]);
    mkdirSync(join(root, 'challenges/manifests'));
    writeFileSync(join(root, 'challenges/manifests/v2.json'),
        JSON.stringify({ version: 1, batch: 'v2', cases: [b] }));
    mkdirSync(join(root, 'challenges/manifests/nested'));
    writeFileSync(join(root, 'challenges/manifests/nested/v3.json'), '{}');
    assert.deepEqual(readChallengeBatches(root).map(batch => batch.batch), ['v1', 'v2']);
    assert.deepEqual(admittedBatchIds(root), ['v1', 'v2'], 'only direct manifest identities count as admitted');
    const first = saved(root, 'v1', fresh(root, evaluation([measured(a, 2)])));
    const secondEvaluation = fresh(root,
        { ...evaluation([measured(b, 2)]), batch: 'v2',
            manifestPath: 'challenges/manifests/v2.json' }, 'v2');
    assert.throws(() => saveEvaluation(root, 'challenges/evaluations/bad.json',
        { ...secondEvaluation, manifestPath: 'challenges/manifest.json' }), /invalid challenge evaluation/u);
    const second = saved(root, 'v2', secondEvaluation);
    const state = challengeState(root, [first, second], NEXT_SHA);
    assert.equal(state.status, 'ready');
    assert.equal(state.generationReady, true);
    assert.equal(state.batches[1].evaluationPath, second.challenge_evaluation);
    assert.equal(state.aggregate.totals.sessions.total, 2);
    const dashboard = challengeDashboard(root, [first, second], NEXT_SHA);
    assert.equal(dashboard.cases.length, 2);
    assert.deepEqual(dashboard.cases.map(caseEntry => caseEntry.batch), ['v1', 'v2']);
    assert.deepEqual(dashboard.cases.map(caseEntry => caseEntry.id), ['one', 'one']);
});

test('corrupt ledger evidence and masked historical case changes fail closed', t => {
    const root = fixture(t);
    const a = entry(root, 'case');
    manifest(root, [a]);
    const oldCase = measured(a, 0);
    oldCase.recordingSha256 = 'f'.repeat(64);
    const old = saved(root, 'old', { ...evaluation([oldCase]),
        manifestSha256: corpusDigest([oldCase]), totals: totalsFor([oldCase]) });
    const current = saved(root, 'current', fresh(root, evaluation([measured(a, 2)], NEXT_SHA, NEXT_TIME)));
    const changed = challengeState(root, [old, current], NEXT_SHA);
    assert.equal(changed.status, 'failed');
    assert.match(changed.batches[0].error, /removed or changed/u);

    const corrupt = challengeState(root, [current, {
        event: 'challenge', challenge_evaluation: 'challenges/evaluations/missing.json',
    }], NEXT_SHA);
    assert.equal(corrupt.status, 'failed');
    assert.match(corrupt.aggregate.error, /ENOENT|missing/u);
    assert.match(challengeDashboard(root, [current, {
        event: 'challenge', challenge_evaluation: 'challenges/evaluations/missing.json',
    }], NEXT_SHA).error, /ENOENT|missing/u);
});

test('all-batch scoring retains failed artifacts and pins one HEAD', () => {
    assert.throws(() => runAllBatches('/tmp', 'challenges/evaluations', { batches: [] }), /no admitted/u);
    const batches = [{ batch: 'v1' }, { batch: 'v2' }];
    const failed = runAllBatches('/tmp', 'challenges/evaluations', {
        batches, stamp: 'fixed',
        readHead: () => FIRST_SHA,
        evaluate: (root, path, batch) => ({ sha: FIRST_SHA,
            status: batch === 'v1' ? 'failed' : 'complete',
            error: batch === 'v1' ? 'runner timeout' : null }),
    });
    assert.equal(failed.results.length, 2);
    assert.deepEqual(failed.failures, [{
        batch: 'v1', relative: 'challenges/evaluations/fixed-v1.json', error: 'runner timeout',
    }]);
    let reads = 0;
    assert.throws(() => runAllBatches('/tmp', 'challenges/evaluations', {
        batches: [batches[0]], stamp: 'head-change',
        readHead: () => reads++ < 2 ? FIRST_SHA : NEXT_SHA,
        evaluate: () => ({ sha: FIRST_SHA, status: 'complete' }),
    }), /HEAD changed/u);
});

test('changed recordings and path escapes are rejected before replay', t => {
    const root = fixture(t);
    const a = entry(root, 'case');
    manifest(root, [a]);
    assert.equal(readChallenges(root).cases.length, 1);
    writeFileSync(join(root, a.recording), 'changed');
    assert.throws(() => readChallenges(root), /digest mismatch/u);
    assert.throws(() => challengePath(root, 'challenges/../sessions/holdout/anything'), /expected a file/u);
    // An isolated scratch directory stands in for any prohibited destination;
    // the test never creates or accesses an actual holdout path.
    mkdirSync(join(root, 'outside'));
    const linked = fixture(t);
    mkdirSync(join(linked, 'outside'));
    symlinkSync(join(linked, 'outside'), join(linked, 'challenges/manifests'));
    assert.throws(() => readChallengeBatches(linked), /symlinks/u);
    symlinkSync(join(root, 'outside'), join(root, 'challenges/link'));
    assert.throws(() => challengePath(root, 'challenges/link/recording.json'), /symlinks/u);
});

test('worker infrastructure failure cannot masquerade as a measured zero', t => {
    const root = fixture(t);
    const a = entry(root, 'case');
    const input = { cases: [a] };
    const failed = { results: [{ session: 'case.session.json', passed: false,
        metrics: { screens: { matched: 0, total: 0 } }, error: 'timeout' }] };
    assert.throws(() => measuredCases(root, input, failed), /did not measure case: timeout/u);
    const complete = { results: [{ session: 'case.session.json', passed: false,
        metrics: { screens: { matched: 0, total: 2 }, rngCalls: { matched: 0, total: 2 },
            cursors: { matched: 0, total: 2 } }, error: 'game refused input' }] };
    assert.equal(measuredCases(root, input, complete)[0].error, 'game refused input');
});

test('removing a previously measured case cannot improve the expanding set by omission', t => {
    const root = fixture(t);
    const failing = entry(root, 'failing'), passing = entry(root, 'passing');
    manifest(root, [failing, passing]);
    const first = saved(root, 'first', evaluation([measured(failing, 0), measured(passing, 2)]));
    recordEvaluation(root, first.challenge_evaluation);
    // Dropping the failing case would report perfect parity without a fix.
    manifest(root, [passing]);
    const next = saved(root, 'next', evaluation([measured(passing, 2)], NEXT_SHA, NEXT_TIME));
    assert.throws(() => recordEvaluation(root, next.challenge_evaluation), /membership is immutable/u);
    assert.equal(challengeDashboard(root, [first], FIRST_SHA).status, 'failed');
});

test('new imports require complete immutable batch membership while pilot history stays readable', t => {
    const root = fixture(t);
    const a = entry(root, 'original'), b = entry(root, 'added');
    manifest(root, [a]);
    const first = saved(root, 'first', fresh(root, { ...evaluation([measured(a, 2)]), batch: 'v1' }));
    recordEvaluation(root, first.challenge_evaluation);
    manifest(root, [a, b]);
    const enlarged = saved(root, 'enlarged', fresh(root,
        { ...evaluation([measured(a, 2), measured(b, 2)], NEXT_SHA, NEXT_TIME), batch: 'v1' }));
    assert.throws(() => recordEvaluation(root, enlarged.challenge_evaluation), /membership is immutable/u);
    // Even an externally appended row cannot turn a changed frozen batch into
    // permission to select goals or generate its successor.
    const state = challengeState(root, [first, enlarged]);
    assert.equal(state.generationReady, false);
    assert.equal(state.batches[0].status, 'failed');
    assert.match(state.batches[0].error, /membership is immutable/u);

    const partial = saved(root, 'partial', evaluation([measured(a, 2)], NEXT_SHA, NEXT_TIME));
    assert.throws(() => recordEvaluation(root, partial.challenge_evaluation), /complete admitted batch/u);
});
