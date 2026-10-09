import assert from 'node:assert/strict';
import test from 'node:test';
import { pendingMainWork } from './worker-backlog.mjs';
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
