import test from 'node:test';
import assert from 'node:assert/strict';

import { queueCandidates } from './queue-candidates.mjs';

function emptyStore() {
    return { goals: [] };
}

// Valid candidate with all required fields.
function validCandidate(overrides = {}) {
    return {
        id: 'test-boundary',
        boundary: 'The test boundary condition.',
        owners: ['test.c'],
        forecastSteps: 10,
        forecastBasis: 'Capped look-ahead at abc1234.',
        sessions: ['seed0001-test'],
        witnesses: [{ session: 'seed0001-test', evidence: 'stop at step 5' }],
        detail: 'Some traced findings.',
        ...overrides,
    };
}

test('queues a candidate into an empty store', () => {
    const store = emptyStore();
    const results = queueCandidates([validCandidate()], store);
    assert.equal(results.length, 1);
    assert.equal(results[0].action, 'queued');
    assert.equal(store.goals.length, 1);
    assert.equal(store.goals[0].id, 'test-boundary');
    assert.equal(store.goals[0].status, 'queued');
    assert.equal(store.goals[0].boundary, 'The test boundary condition.');
    assert.deepEqual(store.goals[0].upstreamOwners, ['test.c']);
    assert.equal(store.goals[0].forecast.steps, 10);
    assert.equal(store.goals[0].forecast.sessions.length, 1);
    assert.equal(store.goals[0].forecast.witnesses.length, 1);
    assert.equal(store.goals[0].detail, 'Some traced findings.');
});

test('skips a candidate whose id already exists', () => {
    const store = emptyStore();
    store.goals.push({
        id: 'test-boundary', status: 'open', boundary: 'existing',
        upstreamOwners: [], forecast: null, detail: '', slices: [],
        openedAt: null, openStanding: null, closedAt: null, delivered: null,
    });
    const results = queueCandidates([validCandidate()], store);
    assert.equal(results.length, 1);
    assert.equal(results[0].action, 'skipped');
    // Store unchanged.
    assert.equal(store.goals.length, 1);
});

test('queues multiple candidates in order', () => {
    const store = emptyStore();
    const candidates = [
        validCandidate({ id: 'first', sessions: ['s1'],
            witnesses: [{ session: 's1', evidence: 'e1' }] }),
        validCandidate({ id: 'second', sessions: ['s2'],
            witnesses: [{ session: 's2', evidence: 'e2' }] }),
    ];
    const results = queueCandidates(candidates, store);
    assert.equal(results.length, 2);
    assert.equal(results[0].action, 'queued');
    assert.equal(results[1].action, 'queued');
    assert.equal(store.goals.length, 2);
    assert.equal(store.goals[0].id, 'first');
    assert.equal(store.goals[1].id, 'second');
});

test('rejects a candidate without an id', () => {
    assert.throws(
        () => queueCandidates([{ boundary: 'x' }], emptyStore()),
        /each candidate needs a string id/,
    );
});

test('rejects a candidate without a boundary', () => {
    assert.throws(
        () => queueCandidates([{ id: 'x' }], emptyStore()),
        /needs a boundary/,
    );
});

test('handles a zero-forecast candidate', () => {
    const store = emptyStore();
    // A fresh-seed-census candidate with forecast 0 has no sessions or witnesses.
    const candidate = validCandidate({
        forecastSteps: 0,
        forecastBasis: 'Fresh-seed census: 600 walks, 67 stops.',
        sessions: [],
        witnesses: [],
    });
    const results = queueCandidates([candidate], store);
    assert.equal(results[0].action, 'queued');
    assert.equal(store.goals[0].forecast.steps, 0);
});
