import assert from 'node:assert/strict';
import test from 'node:test';
import {
    formatCheckpointReport, parseRecordingSummary, summarizeCheckpoint, summarizeSynthetic,
} from './checkpoint-report.mjs';

test('recording summaries from several shards are added together', () => {
    // Two shard clauses in the hosted format; the second has one failing
    // session so passing and total differ.
    const text = 'recordings: 3/3 passing, screens 10/10, rng 100/100; '
        + 'recordings: 1/2 passing, screens 5/7, rng 40/50';
    assert.deepEqual(parseRecordingSummary(text),
        { passing: 4, sessions: 5, screens: [15, 17], rng: [140, 150] });
    // A summary without the recordings clause (e.g. a skipped stage) is absent, not zero.
    assert.equal(parseRecordingSummary('skipped'), null);
});

test('synthetic totals count every case and list failures by id', () => {
    const metrics = (s, st) => ({ screens: { matched: s, total: st }, rng: { matched: 9, total: 9 },
        cursors: { matched: st, total: st } });
    // Batch v2 holds one failing case (screens 1/2); v1 holds one passing case.
    const { totals, failing } = summarizeSynthetic([
        { batch: 'v2', cases: [{ id: 'v2-b', passed: false, metrics: metrics(1, 2), error: null }] },
        { batch: 'v1', cases: [{ id: 'v1-a', passed: true, metrics: metrics(3, 3), error: null }] },
    ]);
    assert.deepEqual(totals, { cases: 2, passing: 1, batches: 2, screens: [4, 5], rng: [18, 18], cursors: [5, 5] });
    assert.deepEqual(failing.map((f) => f.id), ['v2-b']);
});

test('report names failed checks and says when synthetic results are missing', () => {
    // A local run (no hostedRun, no synthetic files) with one failing check.
    const report = summarizeCheckpoint({
        commit: 'a'.repeat(40), timestamp: 't', allPassed: false,
        results: [{ label: 'lint', passed: false }, { label: 'full test suite', passed: true }],
        recordings: { summary: 'recordings: 2/2 passing, screens 4/4, rng 8/8' },
        score: null,
    }, []);
    const text = formatCheckpointReport(report);
    assert.match(text, /^Checkpoint aaaaaaaaa \(local run, t\): FAIL$/mu);
    assert.match(text, /^Checks: 1\/2 passed; FAILED: lint$/mu);
    assert.match(text, /^Recordings: 2\/2 passing; screens 4\/4; rng 8\/8$/mu);
    assert.match(text, /^Synthetic: not in this result/mu);
});

test('a partial fixed-session score prints placeholders instead of failing', () => {
    // Checkpoint fixtures and older summaries carry a score object without
    // every count; the report must still format.
    const text = formatCheckpointReport(summarizeCheckpoint({
        commit: 'b'.repeat(40), timestamp: 't', allPassed: true, results: [], score: { sessions: 1 },
    }, []));
    assert.match(text, /^Fixed sessions: \?\/1 passing; screens \?\/\?/mu);
});
