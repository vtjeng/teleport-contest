import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
    formatCheckpointReport, parseRecordingSummary, readInvalidReferences, summarizeCheckpoint, summarizeSynthetic,
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

// Invalid references (challenges/invalid-references.json). The fixture entry
// mirrors a host-recorded #version case: one of two screens differs and all
// 50 RNG calls match, so a later RNG difference is a change in shape.
const listed = (overrides = {}) => ({ batch: 'v9', id: 'v9-host', cause: 'Recorded on the wrong host.',
    evidence: ['docs/testing.md'], expected: { screens: { matched: 1, total: 2 },
        rng: { matched: 50, total: 50 }, cursors: { matched: 2, total: 2 } }, ...overrides });
const hostCase = (overrides = {}) => ({ id: 'v9-host', passed: false, error: null,
    metrics: { screens: { matched: 1, total: 2 }, rng: { matched: 50, total: 50 },
        cursors: { matched: 2, total: 2 } }, ...overrides });
// An unrelated passing case, so the valid totals are not empty: 3 screens, 7 RNG calls.
const passingCase = { id: 'v9-pass', passed: true, error: null, metrics: { screens: { matched: 3, total: 3 },
    rng: { matched: 7, total: 7 }, cursors: { matched: 3, total: 3 } } };
const reportText = (cases, entries) => formatCheckpointReport(summarizeCheckpoint(
    { commit: 'c'.repeat(40), timestamp: 't', allPassed: true, results: [] }, [{ batch: 'v9', cases }], entries));

test('a listed case that fails exactly as expected is reported apart from port failures', () => {
    // v9-other is unlisted and fails (screen 1 of 1, RNG 4 of 5), so it must
    // stay an ordinary failure.
    const other = { id: 'v9-other', passed: false, error: null, metrics: { screens: { matched: 0, total: 1 },
        rng: { matched: 4, total: 5 }, cursors: { matched: 1, total: 1 } } };
    const cases = [hostCase(), passingCase, other];
    const s = summarizeSynthetic([{ batch: 'v9', cases }], [listed()]);
    assert.deepEqual(s.invalid.map((c) => c.id), ['v9-host']);
    assert.deepEqual(s.failing.map((c) => c.id), ['v9-other']);
    assert.deepEqual(s.listProblems, []);
    // Raw totals keep all three cases; valid totals drop only v9-host (2 screens, 50 RNG calls).
    assert.deepEqual(s.totals, { cases: 3, passing: 1, batches: 1, screens: [4, 6], rng: [61, 62], cursors: [6, 6] });
    assert.deepEqual(s.valid, { cases: 2, passing: 1, batches: 1, screens: [3, 4], rng: [11, 12], cursors: [4, 4] });
    const text = reportText(cases, [listed()]);
    assert.match(text, /^Synthetic: 1\/2 valid cases passing in 1 batches; screens 3\/4; rng 11\/12; cursors 4\/4$/mu);
    assert.match(text, /^Synthetic, all admitted cases: 1\/3 passing; screens 4\/6; rng 61\/62; cursors 6\/6$/mu);
    assert.match(text, /^ {2}FAIL v9-other: /mu);
    assert.match(text, /^1 invalid references \(host-recorded or corrupted recordings\), not port defects; /mu);
    assert.match(text, /^ {2}INVALID v9-host: screens 1\/2, rng 50\/50, cursors 2\/2; Recorded on the wrong host\.$/mu);
    assert.doesNotMatch(text, /needs attention/u);
});

test('a listed case that now matches is flagged for removal', () => {
    // The listed case now matches both of its screens.
    const fixed = hostCase({ passed: true, metrics: { screens: { matched: 2, total: 2 },
        rng: { matched: 50, total: 50 }, cursors: { matched: 2, total: 2 } } });
    const s = summarizeSynthetic([{ batch: 'v9', cases: [fixed] }], [listed()]);
    assert.deepEqual(s.invalid, []);
    assert.deepEqual(s.failing, []);
    assert.deepEqual(s.listProblems.map(({ id, problem }) => [id, problem]), [['v9-host', 'matches']]);
    // A passing listed case counts as a valid case.
    assert.equal(s.valid.cases, 1);
    const text = reportText([fixed], [listed()]);
    assert.match(text, /^Invalid-reference list needs attention: 1 entry in challenges\/invalid-references\.json$/mu);
    assert.match(text, /^ {2}CHECK v9-host: listed as an invalid reference but now matches; remove its entry$/mu);
});

test('a listed case whose failure changes shape stays an ordinary failure and is flagged', () => {
    // The screen difference is unchanged, but only 40 of 50 RNG calls match:
    // a port defect that the host difference must not hide.
    const rngMismatch = hostCase({ metrics: { screens: { matched: 1, total: 2 },
        rng: { matched: 40, total: 50 }, cursors: { matched: 2, total: 2 } } });
    // The expected metrics, but the replay threw: also a change in shape.
    const crashed = hostCase({ id: 'v9-crash', error: 'TypeError: boom' });
    const entries = [listed(), listed({ id: 'v9-crash' })];
    const s = summarizeSynthetic([{ batch: 'v9', cases: [rngMismatch, crashed] }], entries);
    assert.deepEqual(s.invalid, []);
    assert.deepEqual(s.failing.map((c) => c.id), ['v9-crash', 'v9-host']);
    assert.deepEqual(s.listProblems.map(({ id, problem }) => [id, problem]),
        [['v9-crash', 'changed'], ['v9-host', 'changed']]);
    // Nothing is set apart, so the valid totals equal the raw totals.
    assert.deepEqual(s.valid, s.totals);
    const text = reportText([rngMismatch, crashed], entries);
    assert.match(text, /^ {2}FAIL v9-host: screens 1\/2, rng 40\/50, cursors 2\/2$/mu);
    assert.match(text, /^ {2}CHECK v9-host: listed as an invalid reference but its result changed; expected screens 1\/2, rng 50\/50, cursors 2\/2, got screens 1\/2, rng 40\/50, cursors 2\/2$/mu);
    assert.match(text, /^ {2}CHECK v9-crash: .*; error: TypeError: boom$/mu);
});

test('a listed case that no evaluation contains is flagged', () => {
    // The entry names batch v9, but only a v8 evaluation is present.
    const s = summarizeSynthetic([{ batch: 'v8', cases: [{ ...passingCase, id: 'v8-pass' }] }], [listed()]);
    assert.deepEqual(s.listProblems, [{ batch: 'v9', id: 'v9-host', problem: 'missing' }]);
});

test('the committed invalid-reference list names admitted, failing cases and existing evidence', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const entries = readInvalidReferences();
    assert.ok(entries.length > 0);
    for (const entry of entries) {
        // Batches after v1 live in challenges/manifests/<batch>.json.
        const manifest = JSON.parse(readFileSync(join(root, 'challenges/manifests', `${entry.batch}.json`), 'utf8'));
        assert.equal(manifest.batch, entry.batch);
        assert.ok(manifest.cases.some((c) => c.id === entry.id), `${entry.batch}/${entry.id} is not an admitted case`);
        for (const path of entry.evidence) assert.ok(existsSync(join(root, path)), `${entry.id}: missing evidence ${path}`);
        // An entry describes a failure, so at least one count falls short.
        assert.ok(Object.values(entry.expected).some((c) => c.matched < c.total), `${entry.id} expects a match`);
    }
});

test('a malformed or duplicate invalid-reference entry is rejected', () => {
    const directory = mkdtempSync(join(tmpdir(), 'invalid-references-'));
    try {
        const path = join(directory, 'list.json');
        // The same batch and id twice.
        writeFileSync(path, JSON.stringify({ version: 1, cases: [listed(), listed()] }));
        assert.throws(() => readInvalidReferences(pathToFileURL(path)), /duplicate entry v9\/v9-host/u);
        // No expected RNG count, so a change in RNG could not be detected.
        writeFileSync(path, JSON.stringify({ version: 1, cases: [listed({ expected: {
            screens: { matched: 1, total: 2 }, cursors: { matched: 2, total: 2 } } })] }));
        assert.throws(() => readInvalidReferences(pathToFileURL(path)), /malformed/u);
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
});
