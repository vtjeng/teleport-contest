import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { readInvestigation } from './investigation-cache.mjs';

// A synthetic holdout ID checks nested canonical paths without reading a game.
const entry = { session: 'holdout/example', step: 2, kind: 'screen',
    remainingScreensUpperBound: 8 }; // Eight screens remain after the fixture's mismatch.
const record = {
    session: entry.session, remainingScreensUpperBound: entry.remainingScreensUpperBound,
    status: 'complete', commit: 'a'.repeat(40), // An old, well-formed provenance SHA.
    mismatch: entry, summary: 'A source-backed finding with <markup> & "quotes".',
    source: { file: 'hack.c', functions: ['test_move'], branch: 'Blocked movement',
        callers: ['hack.c: domove calls test_move'], dependencies: [] },
    goalKind: 'divergence-fix', evidence: ['hack.c: test_move blocked-movement branch'],
};

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'investigations-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const put = (value, path = `investigations/${entry.session}.json`) => {
        const target = join(root, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, JSON.stringify(value));
    };
    return { root, put };
}

test('investigation files are read independently of .cache', t => {
    const { root, put } = fixture(t);
    assert.equal(readInvestigation(root, entry).status, 'missing');
    put(record, `.cache/investigations/${entry.session}.json`);
    assert.equal(readInvestigation(root, entry).status, 'missing');
    put(record);
    assert.deepEqual(readInvestigation(root, entry), {
        status: 'complete', path: `investigations/${entry.session}.json`, result: record,
    });
});

test('only the remaining count makes a complete investigation stale', t => {
    const { root, put } = fixture(t);
    put(record);
    // The mismatch kind, site, and code state can change while the count stays
    // fixed. None of them participates in the requested invalidation policy.
    const changed = { ...entry, kind: 'rng', step: null, sourceFile: 'objnam.c',
        commit: 'b'.repeat(40), recordedSteps: 50 };
    assert.equal(readInvestigation(root, changed).status, 'complete');
    for (const count of [7, 9]) { // Either one fewer or one more remaining screen invalidates.
        const stale = readInvestigation(root, { ...changed, remainingScreensUpperBound: count });
        assert.equal(stale.status, 'stale');
        assert.equal(stale.previousRemainingScreensUpperBound, 8);
        assert.equal(stale.result, undefined); // Do not display an old finding as current.
    }
    // Another session's progress cannot invalidate this session's entry.
    put({ ...record, session: 'another', remainingScreensUpperBound: 3 },
        'investigations/another.json');
    assert.equal(readInvestigation(root, entry).status, 'complete');
});

test('partial findings remain visible but do not become complete', t => {
    const { root, put } = fixture(t);
    const partial = { ...record, status: 'partial', source: undefined, goalKind: undefined };
    put(partial);
    assert.equal(readInvestigation(root, entry).status, 'partial');
    assert.equal(readInvestigation(root, entry).result.summary, record.summary);
});

test('malformed or misassigned results cannot masquerade as completed investigations', t => {
    const { root, put } = fixture(t);
    for (const broken of [
        null,
        { ...record, session: 'wrong-session' },
        { ...record, evidence: [] },
        { ...record, source: { ...record.source, callers: [] } },
        { ...record, mismatch: { ...entry, remainingScreensUpperBound: 9 } }, // Inconsistent provenance.
    ]) {
        put(broken);
        assert.equal(readInvestigation(root, entry).status, 'invalid');
    }
    put(record);
    writeFileSync(join(root, 'investigations', `${entry.session}.json`), '{');
    assert.equal(readInvestigation(root, entry).status, 'invalid');
    assert.equal(readInvestigation(root, { ...entry, session: '../outside' }).status, 'invalid');
    // A missing session must not be coerced into a literal "undefined" ID.
    assert.equal(readInvestigation(root, { ...entry, session: undefined }).status, 'invalid');
});

test('synthetic investigations use qualified identity and screen debt', t => {
    const syntheticEntry = {
        session: 'synthetic/v1/case-one', remainingScreens: 3, recordedSteps: 8,
        manifestPath: 'challenges/manifest.json', manifestSha256: 'a'.repeat(64),
        recordingSha256: 'b'.repeat(64), evaluationPath: 'challenges/evaluations/old.json',
        evaluationCommit: 'c'.repeat(40),
    };
    const syntheticRecord = {
        corpus: 'synthetic', batch: 'v1', caseId: 'case-one', ...syntheticEntry,
        status: 'complete', commit: 'd'.repeat(40), mismatch: syntheticEntry,
        summary: 'The selected synthetic case reaches the source branch.',
        source: { file: 'hack.c', functions: ['test_move'], branch: 'branch',
            callers: ['hack.c: test_move'], dependencies: [] },
        goalKind: 'divergence-fix', evidence: ['hack.c: test_move'],
    };
    const { root, put } = fixture(t);
    put(syntheticRecord, 'investigations/synthetic/v1/case-one.json');
    assert.equal(readInvestigation(root, syntheticEntry).status, 'complete');

    // A replacement evaluation artifact is replay provenance, not source
    // provenance, so it must not stale the investigation by itself.
    assert.equal(readInvestigation(root, {
        ...syntheticEntry, evaluationPath: 'challenges/evaluations/new.json',
        evaluationCommit: 'e'.repeat(40),
    }).status, 'complete');
    assert.equal(readInvestigation(root, {
        ...syntheticEntry, remainingScreens: 2,
    }).status, 'stale');
    assert.equal(readInvestigation(root, {
        ...syntheticEntry, recordingSha256: 'f'.repeat(64),
    }).status, 'stale');
});
