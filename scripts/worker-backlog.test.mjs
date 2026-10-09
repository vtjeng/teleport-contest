import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptedMain, pendingMainWork, workerWork, savedQueueIssues } from './worker-backlog.mjs';
import { nextActions } from './worker-state.mjs';

// Small ledger projections isolate backlog display from Git and validation.
const at = minute => `2026-10-08T10:${String(minute).padStart(2, '0')}:00Z`;
function fixture() {
    return { tasks: {}, deliveries: {} };
}
function add(state, id, status = 'ready', dependencies = []) {
    const delivery = `${id}-delivery`;
    state.tasks[id] = { id, worker: 'A', kind: 'implementation', status,
        assignedAt: at(0), deliveries: [delivery], reservations: [] };
    state.deliveries[delivery] = { task: id, delivery, readyAt: at(1), dependencies };
    return delivery;
}

test('worker sync selects the latest accepted or published Main, never the active candidate', () => {
    const state = fixture();
    assert.equal(acceptedMain(state), null);
    const old = add(state, 'old', 'accepted');
    Object.assign(state.deliveries[old], { acceptedAt: at(2), integration: 'old-tested',
        publishedAt: at(3), publishedCommit: 'old-reports', checkpoint: '/old-summary' });
    assert.equal(acceptedMain(state).commit, 'old-reports', 'publication includes accepted reports');
    const current = add(state, 'current', 'integrating');
    state.deliveries[current].integration = 'untested';
    assert.equal(acceptedMain(state).commit, 'old-reports', 'an active candidate is not accepted');
    Object.assign(state.deliveries[current], { acceptedAt: at(4), checkpoint: '/new-summary' });
    assert.deepEqual(acceptedMain(state), { task: 'current', commit: 'untested',
        checkpoint: '/new-summary', acceptedAt: at(4) });
    // A later, verified batch-admission publication may belong to an older
    // preparation task. Its passing supplemental checkpoint covers the new inputs.
    state.deliveries[old].publishedAt = at(5);
    state.deliveries[old].publishedCommit = 'admitted-batch-main';
    state.deliveries[old].supplementalCheckpoint = '/batch-summary';
    assert.equal(acceptedMain(state).commit, 'admitted-batch-main');
    assert.equal(acceptedMain(state).checkpoint, '/batch-summary');
});

test('pending deliveries show blockers without treating accepted corrections as blocked', () => {
    const state = fixture();
    const original = add(state, 'repair', 'accepted');
    const corrected = 'corrected-delivery';
    state.tasks.repair.deliveries.push(corrected);
    state.deliveries[corrected] = { task: 'repair', delivery: corrected, acceptedAt: at(2), publishedAt: at(3) };
    const dependency = add(state, 'dependency');
    add(state, 'waiting', 'ready', [original, dependency]);
    const rows = pendingMainWork(state).deliveries;
    assert.deepEqual(rows.map(row => [row.task, row.blockedBy]), [
        ['dependency', []], ['waiting', ['dependency']],
    ]);
    assert.equal(rows[0].unblocks, 1, 'the dependency unlocks one submitted task');
    assert.equal(state.tasks.waiting.status, 'ready', 'display does not change ownership');
});

test('accepted preparation remains visible until admission, in numeric batch order', () => {
    const state = fixture();
    // v9/v10 straddle the lexical/numeric sorting boundary.
    for (const batch of ['v10', 'v9']) {
        const delivery = add(state, batch, 'accepted');
        state.tasks[batch].kind = 'challenge-preparation';
        state.tasks[batch].reservations = [`challenge-batch:${batch}`];
        state.deliveries[delivery].acceptedAt = at(2);
        state.deliveries[delivery].publishedAt = at(3);
    }
    assert.deepEqual(pendingMainWork(state).preparedBatches.map(row => row.batch), ['v9', 'v10']);
    assert.deepEqual(pendingMainWork(state, ['v9']).preparedBatches.map(row => row.batch), ['v10']);
    assert.equal(pendingMainWork(state, ['v9', 'v10']).preparedBatches.length, 0);
});

test('parked tasks and corrections stay visible without exposing delivery evidence paths', () => {
    const state = fixture();
    add(state, 'parked', 'parked');
    state.tasks.parked.parkedAt = at(2);
    state.tasks.parked.reason = 'Await dependency source port.';
    const delivery = add(state, 'correction', 'changes-required');
    state.deliveries[delivery].evidence = '/private/evidence.json';
    add(state, 'working', 'working');
    const accepted = add(state, 'accepted', 'accepted');
    state.deliveries[accepted].acceptedAt = at(3);
    // Acceptance already implies integration, even if publication was not recorded.
    const backlog = pendingMainWork(state);
    assert.deepEqual(backlog.deliveries.map(row => row.task), ['correction']);
    assert.equal(backlog.parkedTasks[0].reason, 'Await dependency source port.');
    assert.equal(backlog.parkedTasks[0].since, at(2));
    assert.ok(!JSON.stringify(backlog).includes('/private/'));
});

test('next integration prioritizes a delivery that unlocks work, without replacing an active checkpoint', () => {
    const state = { ...fixture(), workers: {} };
    add(state, 'oldest');
    const dependency = add(state, 'dependency');
    state.deliveries[dependency].readyAt = at(2); // Newer than the independent oldest task.
    add(state, 'waiting', 'ready', [dependency]);
    assert.equal(nextActions(state).integration.task, 'dependency');
    state.tasks.oldest.status = 'integrating';
    assert.equal(nextActions(state).integration.task, 'oldest', 'active validation keeps its slot');
});

// Three live implementation workers plus Prep reproduce the scheduling roles.
function availabilityFixture() {
    return { ...fixture(), reservations: {}, workers: Object.fromEntries(
        ['A', 'B', 'C', 'Prep'].map(worker => [worker, { worker, handle: worker,
            turn: worker === 'C' ? 'idle' : 'active' }])) };
}
const queue = sessions => ({ mode: 'work', sessions, blockers: [], selectionBlocked: false });
const sourceCase = (session, fn) => ({ session, investigation: { status: 'complete',
    result: { source: { file: 'spell.c', functions: [fn] } } } });

test('submitted work supplies Main but cannot supply independent next work', () => {
    const state = availabilityFixture();
    for (const id of ['submitted', 'assigned']) {
        add(state, id, id === 'assigned' ? 'working' : 'ready');
        state.reservations['session:' + id] = { tasks: [id], worker: 'A' };
    }
    state.reservations['source:spell.c:spelleffects'] = { tasks: ['submitted'], worker: 'A' };
    const work = workerWork(state, queue([
        { session: 'submitted' }, { session: 'assigned' },
        sourceCase('another-spell', 'spelleffects (bounded caller)'),
        { session: 'unknown-owner' },
    ]));
    assert.equal(pendingMainWork(state).deliveries.length, 1);
    assert.equal(work.mismatchingSessions, 4, 'raw debt includes assigned and submitted cases');
    assert.equal(work.candidateGroups, 1, 'only the unclaimed investigation is next work');
    assert.deepEqual(work.investigations, ['unknown-owner']);
    assert.deepEqual(work.unavailable.map(row => row.blockedBy), [['submitted'], ['assigned'], ['submitted']]);
    assert.deepEqual(work.idleWorkers, ['C']);
    assert.equal(work.implementationWorkers, 3, 'Prep is not an implementation slot');
});

test('known shared causes form one candidate group while unrelated functions remain separate', () => {
    const state = availabilityFixture();
    const work = workerWork(state, queue([
        sourceCase('first', 'cast_protection'), sourceCase('second', 'cast_protection'),
        sourceCase('third', 'cast_chain_lightning'),
    ]));
    assert.equal(work.candidateGroups, 2, 'two sessions share a cause, not two independent tasks');
    assert.deepEqual(work.sourceTasks.map(row => row.sessions), [['first', 'second'], ['third']]);
    // One later case spans both functions and joins the two candidate groups.
    const bridge = sourceCase('bridge', 'cast_protection');
    bridge.investigation.result.source.functions.push('cast_chain_lightning');
    const connected = workerWork(state, queue([
        sourceCase('first', 'cast_protection'), sourceCase('second', 'cast_chain_lightning'), bridge,
    ]));
    assert.equal(connected.candidateGroups, 1);
    assert.deepEqual(connected.sourceTasks[0].sessions, ['first', 'second', 'bridge']);
});

test('parked causes require reassessment and unknown or blocked evidence is not zero availability', () => {
    const state = availabilityFixture();
    add(state, 'parked-owner', 'parked');
    state.tasks['parked-owner'].seed = 'parked-case';
    state.tasks['parked-owner'].reason = 'Await shared pointer contract.';
    const work = workerWork(state, queue([{ session: 'parked-case' }]));
    assert.equal(work.candidateGroups, 0);
    assert.equal(work.unavailable[0].reason, 'Await shared pointer contract.');
    assert.equal(work.unavailable[0].status, 'parked-needs-recheck');
    for (const input of [null, { ...queue([]), selectionBlocked: true, blockers: [{ reason: 'stale' }] }]) {
        const unknown = workerWork(state, input);
        assert.equal(unknown.candidateGroups, null, 'missing evidence must not trigger admission as a measured zero');
        assert.notEqual(unknown.status, 'available');
    }
});

test('saved queue must cover admitted batches and latest recorded evaluations', () => {
    // Distinct artifact identities let the fixture detect a replaced accepted measurement.
    const digest = 'a'.repeat(64), sha = 'b'.repeat(40), artifact = 'challenges/evaluations/current-v1.json';
    const q = { ...queue([]), synthetic: { batches: [{ batch: 'v1', status: 'complete',
        manifestSha256: digest, evaluationPath: artifact, evaluationCommit: sha }] } };
    const rows = [{ event: 'challenge', sha, challenge_manifest_sha256: digest, challenge_evaluation: artifact }];
    assert.deepEqual(savedQueueIssues(q, ['v1'], rows), []);
    assert.match(savedQueueIssues(q, ['v1', 'v2'], rows).join(' '), /admitted batches/);
    assert.match(savedQueueIssues(q, ['v1'], [{ ...rows[0], challenge_evaluation: 'newer' }]).join(' '), /latest recorded evaluation/);
    assert.match(savedQueueIssues(q, ['v1'], [{ ...rows[0], sha: 'c'.repeat(40) }]).join(' '),
        /latest recorded evaluation/, 'a different evaluation commit also invalidates the saved queue');
    assert.match(savedQueueIssues({ mode: 'fixed' }, ['v1'], rows).join(' '), /combined/);
});

test('next lists batch admission priority separately from an active integration', () => {
    const state = availabilityFixture();
    const prep = add(state, 'prep', 'accepted');
    state.tasks.prep.kind = 'challenge-preparation';
    state.tasks.prep.reservations = ['challenge-batch:v2'];
    state.deliveries[prep].acceptedAt = at(2);
    add(state, 'current', 'integrating');
    const next = nextActions(state, ['v1'], queue([]));
    assert.equal(next.integration.task, 'current', 'the active validation slot is never interrupted');
    assert.equal(next.workerWork.admission.batch, 'v2');
    assert.equal(next.workerWork.admission.action, 'admit-at-next-safe-boundary');
    assert.deepEqual(next.workerWork.idleWorkers, ['C']);
    const unknown = nextActions(state, ['v1']);
    assert.equal(unknown.workerWork.admission.action, 'reassess-worker-work');
});
