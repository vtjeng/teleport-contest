import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {aggregateExplorationYield, buildExplorationYieldPayload} from './exploration-yield.mjs';

const at = hour => `2026-10-16T${String(hour).padStart(2, '0')}:00:00.000Z`;
const hash = letter => letter.repeat(64);
const enqueue = (id, hour, extra = {}) => ({type: 'queue-enqueue', at: at(hour), assignment: {
    id, batch: 'v91', producer: 'Prep', type: 'exploration', ...extra}});
const claim = (id, hour) => ({type: 'queue-claim', task: id, at: at(hour)});
const close = (id, hour, dg, extra = {}) => ({type: 'queue-result', task: id, at: at(hour),
    outcome: 'failure', digest: dg, packet: `/private/results/${dg}.json`, ...extra});
const row = (id, hour, extra = {}) => ({id, kind: 'discovery', claimedAt: at(hour - 1),
    closedAt: at(hour), usable: 'unknown', qualifyingSessionIds: [], bugFamilyIds: [], ...extra});

test('new tasks remain visible as unknown; support, linked and unclaimed work do not inflate denominator', () => {
    const ledger = {events: [enqueue('discovery', 1), claim('discovery', 2), close('discovery', 3, hash('a')),
        enqueue('validation', 3, {evidenceContract: {targetTask: 'discovery'}}), claim('validation', 4),
        close('validation', 5, hash('b')), enqueue('support', 5, {producer: 'Main'}),
        enqueue('retired-before-claim', 5), {type: 'queue-supersede', task: 'retired-before-claim', at: at(6)}]};
    const payload = buildExplorationYieldPayload(ledger);
    assert.equal(payload.records.find(r => r.id === 'discovery').usable, 'unknown');
    assert.equal(payload.coverage.mainSupportAssignments, 1);
    assert.equal(payload.coverage.linkedAssignments, 1);
    assert.equal(payload.coverage.preclaimAssignments, 1);
    assert.equal(payload.coverage.physicalCAttempts, null);
    const {totals} = aggregateExplorationYield(payload);
    assert.equal(totals.closedTasks, 1); assert.equal(totals.usableUnknown, 1);
    assert.equal(totals.qualifyingSessions, 0);
    assert.doesNotMatch(JSON.stringify(payload), /\/private|results\//u);
});

test('packet audit must bind exact task and digest, not outcome failure or task name', () => {
    const ledger = {events: [enqueue('original', 1), claim('original', 2), close('original', 3, hash('a'))]};
    const auditIndex = {packets: {[hash('a')]: {taskId: 'different-task', usable: 'yes', classification: 'qualified-mismatch'}}};
    const payload = buildExplorationYieldPayload(ledger, {auditIndex});
    assert.equal(payload.records[0].usable, 'unknown');
    assert.equal(payload.coverage.rejectedAuditBindings, 1);
    assert.equal(aggregateExplorationYield(payload).totals.qualifyingSessions, 0);
});

test('carried case belongs to original discovery time; no future admission leaks into earlier asOf', () => {
    const ledger = {events: [enqueue('card-original-v93', 1), claim('card-original-v93', 2),
        close('card-original-v93', 3, hash('a')), {type: 'coordinator', at: at(8)}]};
    const auditIndex = {packets: {[hash('a')]: {taskId: 'card-original-v93', kind: 'discovery', usable: 'yes'}},
        sessions: [{id: 'v94-card', taskId: 'card-original-v93', bugFamilyId: 'quote-order', admittedAt: at(7)}]};
    const before = buildExplorationYieldPayload(ledger, {asOf: at(6), auditIndex});
    assert.equal(aggregateExplorationYield(before).totals.qualifyingSessions, 0);
    const after = aggregateExplorationYield(buildExplorationYieldPayload(ledger, {auditIndex}));
    assert.equal(after.buckets.find(b => b.start === Date.parse(at(3))).qualifyingSessions, 1);
    assert.equal(after.buckets.find(b => b.start === Date.parse(at(7))).qualifyingSessions, 0);
    assert.equal(after.totals.distinctFamilies, 1);
});

test('zero-sample yield is null, claims and closures have separate cohorts and unknowns stay explicit', () => {
    const data = {asOf: at(5), records: [row('one', 4, {claimedAt: at(1)})]};
    const result = aggregateExplorationYield(data, {start: at(1), end: at(5)});
    assert.equal(result.buckets[0].claimedTasks, 1);
    assert.equal(result.buckets[0].closedTasks, 0); assert.equal(result.buckets[0].taskYield, null);
    assert.equal(result.totals.closedTasks, 1); assert.equal(result.totals.usableUnknown, 1);
    assert.equal(result.totals.taskYield, 0);
});

test('duplicate discovery IDs/families cannot manufacture per-hour or selected-window discoveries', () => {
    const records = [row('later', 5, {qualifyingSessionIds: ['case'], bugFamilyIds: ['family']}),
        row('earlier', 3, {qualifyingSessionIds: ['case', 'case'], bugFamilyIds: ['family']}),
        row('different-case-same-family', 6, {qualifyingSessionIds: ['case-2'], bugFamilyIds: ['family']})];
    const data = {asOf: at(7), records};
    const result = aggregateExplorationYield(data);
    assert.equal(result.totals.qualifyingSessions, 2); assert.equal(result.totals.distinctFamilies, 1);
    assert.equal(result.buckets.find(b => b.start === Date.parse(at(5))).qualifyingSessions, 0);
    const window = aggregateExplorationYield(data, {start: at(4), end: at(7)});
    assert.equal(window.totals.qualifyingSessions, 1); assert.equal(window.totals.distinctFamilies, 0);
});

test('boundaries are inclusive and future evidence is excluded; ratios are rates per 100 tasks', () => {
    const data = {asOf: at(4), records: [row('at-end', 4, {usable: 'yes',
        qualifyingSessionIds: ['a', 'b'], bugFamilyIds: ['x', 'y']}), row('future', 5)]};
    const result = aggregateExplorationYield(data, {start: at(4), end: at(6)});
    assert.equal(result.totals.closedTasks, 1); assert.equal(result.totals.taskYield, 200);
    assert.equal(result.totals.usableYes, 1);
    assert.throws(() => aggregateExplorationYield(data, {bucketMs: 0}), /positive/u);
    assert.throws(() => aggregateExplorationYield(data, {start: at(6), end: at(4)}), /precedes/u);
});

test('reopened task is active until a fresh closure; old block does not remain a completed cohort', () => {
    const ledger = {events: [enqueue('retry', 1), claim('retry', 2),
        close('retry', 3, hash('a'), {type: 'queue-block'}), claim('retry', 4)]};
    const payload = buildExplorationYieldPayload(ledger);
    assert.equal(payload.records[0].closedAt, null);
    assert.equal(aggregateExplorationYield(payload).totals.closedTasks, 0);
});

test('aggregation can be embedded alone and does not mutate caller records', () => {
    const embedded = runInNewContext(`(${aggregateExplorationYield.toString()})`);
    const data = {asOf: at(5), records: [row('one', 3, {classification: 'setup-miss'})]};
    const before = JSON.stringify(data), result = embedded(data);
    assert.equal(result.totals.closedTasks, 1);
    assert.equal(result.totals.classifications['setup-miss'], 1);
    assert.equal(JSON.stringify(data), before);
});

test('audited index has five unique admitted discoveries and excludes recovery/follow-up inflation', () => {
    const index = JSON.parse(readFileSync(new URL('./exploration-yield-audit.json', import.meta.url)));
    assert.equal(index.sessions.length, 5);
    assert.equal(new Set(index.sessions.map(s => s.id)).size, 5);
    assert.equal(new Set(index.sessions.map(s => s.bugFamilyId)).size, 5);
    const discovery = Object.values(index.packets).filter(r => r.kind === 'discovery');
    assert.equal(discovery.length, 252);
    assert.equal(discovery.filter(r => r.usable === 'yes').length, 190);
    assert.equal(discovery.filter(r => r.usable === 'unknown').length, 5);
    assert.equal(index.coverage.excludedV90.recoveredSessions, 7);
    assert.ok(index.markers.every(m => m.causality === 'unmeasured' && m.kind === 'operational'));
    assert.doesNotMatch(JSON.stringify(index), /\/workspace|\/tmp\/|base64|processes/u);
});
