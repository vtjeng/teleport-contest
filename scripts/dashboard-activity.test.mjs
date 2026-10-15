import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { activityTimeline, activityUtilization, mainIntegrationDurations, agentStages, syntheticGainByCommit, goalHistory } from './dashboard-activity.mjs';
import { activityFromLedger, developmentFromCheckpoint, mergeActivity, reservationSnapshot } from './dashboard-snapshot.mjs';
import {createLedger, recordEvent} from './worker-state.mjs';

test('public reservations retain pending ownership without exposing private worker or delivery fields', () => {
  // Ready source work remains reserved; accepted source and Prep are not assignable source owners.
  const source = {id: 'A1', kind: 'implementation', status: 'ready', worker: 'A', seed: 'synthetic/v1/case',
    reservations: ['source:spell.c:cast'], worktree: '/private/worktree', deliveries: ['private-packet']};
  const state = {tasks: {A1: source, A0: {...source, id: 'A0', status: 'accepted'},
    Prep1: {...source, id: 'Prep1', kind: 'challenge-preparation'}},
    reservations: {'source:spell.c:cast': {tasks: ['A1'], worker: 'A'},
      'challenge-batch:v2': {tasks: ['Prep1']}, 'source:spell.c:old': {tasks: ['A0']}}};
  const result = reservationSnapshot(state);
  assert.deepEqual(Object.keys(result.tasks), ['A1']);
  assert.deepEqual(result.reservations, {'source:spell.c:cast': {tasks: ['A1']}});
  assert.doesNotMatch(JSON.stringify(result), /private|worktree|deliveries/u);
});

test('a shared Prep run stays in every task lifespan but counts once in Main timing', () => {
  // Two tasks share the same five-minute hosted attempt; neither is a second CPU/elapsed sample.
  const at = minute => new Date(Date.UTC(2026, 9, 13, 10, minute)).toISOString();
  let ledger = createLedger('loop-20261013', '/tmp/dashboard-prep-group');
  let sequence = 0;
  const send = (event, minute) => {ledger = recordEvent(ledger, {id: `shared-${++sequence}`, ...event}, at(minute));};
  const base = 'a'.repeat(40), integration = 'd'.repeat(40); // Synthetic transport IDs only.
  send({type: 'register', worker: 'Prep', worktree: '/tmp/dashboard-prep-group/prep',
    branch: 'worker/prep', base, handle: 'fixture'}, 0);
  ['Prep-v2', 'Prep-v3'].forEach((task, index) => {
    const batch = `v${index + 2}`, delivery = String(index + 1).repeat(40);
    send({type: 'assign', task, worker: 'Prep', kind: 'challenge-preparation', seed: null,
      base, reservations: [`challenge-batch:${batch}`], allowedPaths: [`challenges/cases/${batch}/`]}, index);
    send({type: 'ready', task, delivery, base, commits: [delivery], paths: [`challenges/cases/${batch}/case.json`],
      evidence: `/tmp/${task}.json`, dependencies: []}, index + 1);
    send({type: 'received', task, delivery}, index + 1);
  });
  send({type: 'prep-integrating', tasks: ['Prep-v2', 'Prep-v3'], integration}, 3);
  for (const task of ['Prep-v2', 'Prep-v3']) {
    send({type: 'validated', task, passed: true, checkpoint: '/tmp/summary.json'}, 8);
    send({type: 'accepted', task}, 8);
  }
  const timeline = activityTimeline(activityFromLedger(ledger), at(9));
  const stages = timeline.segments.filter(segment => segment.phase === 'integrating');
  assert.equal(stages.length, 2, 'both task histories retain the shared attempt');
  assert.deepEqual(stages[0].prepGroup, ['Prep-v2', 'Prep-v3']);
  const points = mainIntegrationDurations(timeline).preparation;
  assert.equal(points.length, 1);
  assert.equal(points[0].durationMs / 60000, 5);
  assert.equal(points[0].sampleSize, 1);
  assert.deepEqual(points[0].prepGroup, ['Prep-v2', 'Prep-v3']);
});

test('integration timing retains retries and outliers but excludes open and unknown endpoints', () => {
  // The first attempt ends in feedback; the second passes. Both spent Main time.
  const at = minutes => new Date(Date.UTC(2026, 9, 10) + minutes * 60000).toISOString();
  const row = (task, start, end, extra = {}) => ({ task, lane: 'Main', phase: 'integrating',
    start: at(start), end: at(end), ...extra });
  const activity = { segments: [row('A1', 0, 5), row('A1', 10, 20),
    row('outage', 20, 740), // Twelve hours is retained, not silently capped or trimmed.
    row('open', 740, 750, { ongoing: true }), row('unknown', 750, 750, { durationUnknown: true }),
    row('other', 760, 765, { phase: 'acceptance' }), row('invalid', 780, 770),
    row('missing-end', 790, 790, { superseded: true })] };
  const points = mainIntegrationDurations(activity).implementation;
  assert.deepEqual(points.map(point => point.durationMs / 60000), [5, 10, 720]);
  assert.deepEqual(points.map(point => point.attempt), [1, 2, 1]);
  assert.equal(points[1].rollingMeanMs / 60000, 7.5, 'early means use the two available samples');
  assert.deepEqual(mainIntegrationDurations({ segments: [] }), { implementation: [], preparation: [] });
});

test('an implementation group appears in each task history but contributes one timing sample per attempt', () => {
  // Two tasks share a five-minute failed run and a three-minute successful retry.
  const at = minute => new Date(Date.UTC(2026, 9, 14, 10, minute)).toISOString();
  let ledger = createLedger('loop-20261014', '/tmp/dashboard-implementation-group');
  let sequence = 0;
  const send = (event, minute) => {ledger = recordEvent(ledger, {id: `shared-${++sequence}`, ...event}, at(minute));};
  const base = 'a'.repeat(40), integration = 'd'.repeat(40), retry = 'e'.repeat(40); // Transport IDs, not real commits.
  send({type: 'register', worker: 'A', worktree: '/tmp/dashboard-implementation-group/a',
    branch: 'worker/a', base, handle: 'fixture'}, 0);
  ['A1', 'A2'].forEach((task, index) => {
    const delivery = String(index + 1).repeat(40);
    send({type: 'assign', task, worker: 'A', goal: task, seed: null, base,
      reservations: [`source:fixture.c:${task}`], allowedPaths: [`js/${task}.js`]}, index);
    send({type: 'ready', task, delivery, base, commits: [delivery], paths: [`js/${task}.js`],
      evidence: `/tmp/${task}.json`, dependencies: []}, index + 1);
    send({type: 'received', task, delivery}, index + 1);
  });
  send({type: 'implementation-integrating', tasks: ['A1', 'A2'], integration}, 3);
  send({type: 'implementation-released', tasks: ['A1', 'A2'], integration, reason: 'Split failed run.'}, 8);
  send({type: 'implementation-integrating', tasks: ['A1', 'A2'], integration: retry}, 9);
  for (const task of ['A1', 'A2']) {
    send({type: 'validated', task, passed: true, checkpoint: '/tmp/summary.json'}, 12);
    send({type: 'accepted', task}, 12);
  }
  const timeline = activityTimeline(activityFromLedger(ledger), at(13));
  const stages = timeline.segments.filter(segment => segment.phase === 'integrating');
  assert.equal(stages.length, 4, 'both histories retain both shared attempts');
  assert.deepEqual(stages[0].validationGroup, ['A1', 'A2']);
  const points = mainIntegrationDurations(timeline).implementation;
  assert.deepEqual(points.map(point => point.durationMs / 60000), [5, 3]);
  assert.deepEqual(points.map(point => point.sampleSize), [1, 2]);
  assert.deepEqual(points[0].validationGroup, ['A1', 'A2']);
  assert.equal(agentStages(stages).filter(row => row.lane === 'Main').length, 2,
    'Main has one stage per attempt, not duplicate simultaneous rows');
});

test('integration rolling mean uses the last ten complete attempts before the visible window', () => {
  // Eleven attempts replace the oldest duration in a ten-attempt mean.
  const segments = Array.from({ length: 11 }, (_, index) => ({ task: `task-${index}`, lane: 'Main',
    phase: 'integrating', start: new Date(index * 3600000).toISOString(),
    end: new Date(index * 3600000 + (index + 1) * 60000).toISOString() }));
  const points = mainIntegrationDurations({ segments: [...segments].reverse() }).implementation;
  assert.equal(points.at(-1).sampleSize, 10);
  assert.equal(points.at(-1).rollingMeanMs / 60000, 6.5, 'mean of durations 2 through 11');
  assert.equal(points.at(-1).durationMs / 60000, 11, 'display filtering never clips a stage duration');
  assert.equal(points.at(-1).sourceIndex, 0, 'point selection retains the original history index');
});

test('Prep and implementation integration have independent rolling means and sample counts', () => {
  const at = minute => new Date(minute * 60000).toISOString();
  const row = (task, start, end, kind) => ({ task, kind, lane: 'Main', phase: 'integrating',
    start: at(start), end: at(end) });
  // Interleave short implementation attempts with much longer Prep attempts.
  const result = mainIntegrationDurations({ segments: [
    row('A1', 0, 5, 'implementation'), row('Prep1', 5, 105, 'challenge-preparation'),
    row('A1', 105, 120, 'implementation'), row('Prep1', 120, 320, 'challenge-preparation'),
  ] });
  assert.deepEqual(result.implementation.map(point => point.rollingMeanMs / 60000), [5, 10]);
  assert.deepEqual(result.preparation.map(point => point.rollingMeanMs / 60000), [100, 150]);
  for (const points of Object.values(result)) {
    assert.deepEqual(points.map(point => point.sampleSize), [1, 2]);
    assert.deepEqual(points.map(point => point.attempt), [1, 2]);
  }
  assert.deepEqual(result.preparation.map(point => point.sourceIndex), [1, 3]);
});

test('utilization pools clipped agent-stage time and keeps idle, blocked and unknown distinct', () => {
  // A and B each cover ten minutes; C joins for five. Pool worker-minutes,
  // rather than averaging percentages or assuming every worker was always live.
  const at = minute => `2026-10-10T10:${String(minute).padStart(2, '0')}:00Z`;
  const stage = (lane, phase, a, b) => ({ lane, phase, start: at(a), end: at(b) });
  const rows = [stage('A2', 'working', 0, 10), stage('A2', 'idle', 10, 20),
    stage('B', 'working', 5, 15), stage('B', 'parked', 15, 20),
    stage('C', 'unrecorded', 10, 15), stage('Prep', 'rework', 10, 15),
    stage('Prep', 'blocked', 15, 20), stage('Main', 'integrating', 5, 15),
    stage('Main', 'waiting', 15, 20), stage('A2', 'queued', 0, 20)];
  const result = activityUtilization(rows, Date.parse(at(10)), Date.parse(at(20)));
  const minute = 60000;
  assert.equal(result[0].role, 'A/B/C');
  assert.equal(result[0].total, 25 * minute);
  assert.equal(result[0].work, 5 * minute);
  assert.equal(result[0].idle, 10 * minute);
  assert.equal(result[0].blocked, 5 * minute);
  assert.equal(result[0].unknown, 5 * minute);
  assert.equal(result[0].utilization, 0.2);
  assert.equal(result[1].role, 'Prep');
  assert.equal(result[1].utilization, 0.5);
  assert.equal(result[2].role, 'Main');
  assert.equal(result[2].utilization, 0.5);
  assert.equal(result[0].workers.find(worker => worker.lane === 'A2').utilization, 0);
  assert.equal(result[0].workers.find(worker => worker.lane === 'B').utilization, 0.5);
});

test('utilization has no invented activity in empty windows or retired worker histories', () => {
  const at = hour => `2026-10-10T${String(hour).padStart(2, '0')}:00:00Z`;
  const stages = [{ lane: 'A', phase: 'working', start: at(1), end: at(2) },
    { lane: 'A2', phase: 'working', start: at(3), end: at(4) }];
  // The historical replacement slot does not contribute hours after retirement.
  const result = activityUtilization(stages, Date.parse(at(2)), Date.parse(at(4)));
  assert.equal(result[0].total, 3600000);
  assert.equal(result[0].utilization, 1);
  assert.equal(result[1].utilization, null);
  for (const row of activityUtilization([], Date.parse(at(2)), Date.parse(at(4)))) {
    assert.equal(row.total, 0);
    assert.equal(row.utilization, null);
  }
});

test('preparation batch identity survives public snapshot and every task stage', () => {
  // Read the batch from the reserved scope, not a guess from a task label.
  const at = minute => `2026-10-10T10:${String(minute).padStart(2, '0')}:00Z`;
  const activity = activityFromLedger({ runId: 'loop-20260925', events: [
    { id: 'claim', type: 'assign', task: 'Prep4', worker: 'Prep', kind: 'challenge-preparation',
      reservations: ['challenge-batch:v40'], allowedPaths: ['/private'], at: at(0) },
    { id: 'ready', type: 'ready', task: 'Prep4', at: at(5) },
    { id: 'merge', type: 'integrating', task: 'Prep4', at: at(6) },
    { id: 'pass', type: 'validated', task: 'Prep4', passed: true, at: at(7) },
    { id: 'accept', type: 'accepted', task: 'Prep4', at: at(8) },
    { id: 'admit', type: 'activity', task: 'Prep4', phase: 'admission', at: at(9) },
  ] });
  assert.equal(activity.events[0].batch, 'v40');
  assert.ok(!JSON.stringify(activity).includes('/private'));
  const timeline = activityTimeline(activity, at(10));
  assert.equal(timeline.tasks[0].batch, 'v40');
  assert.ok(timeline.segments.every(row => row.batch === 'v40' || row.phase === 'unrecorded'));
});

test('parked task reasons survive publication and older deliveries never replace worker activity', () => {
  // Reproduce A177: two dependency parks interrupt work while three older deliveries wait.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const events = [
    ...['A174', 'A175', 'A176'].flatMap((task, index) => [
      { type: 'assign', task, worker: 'A2', at: at(index * 2) },
      { type: 'ready', task, at: at(index * 2 + 1) },
    ]),
    { type: 'assign', task: 'A177', worker: 'A2', at: at(6) },
    { type: 'park', task: 'A177', reason: 'Await A175 prayer caller.', at: at(7) },
    { type: 'resume', task: 'A177', at: at(10) },
    { type: 'park', task: 'A177', reason: 'Await C158 prayer caller.', at: at(11) },
    { type: 'turn', worker: 'A2', state: 'idle', summary: 'C158 still owns the caller.', at: at(12) },
    { type: 'resume', task: 'A177', at: at(15) },
    { type: 'ready', task: 'A177', at: at(18) },
  ].map((row, index) => ({ id: String(index), ...row }));
  const activity = activityFromLedger({ runId: 'loop-20260925', events });
  assert.equal(activity.events.find(row => row.type === 'park').reason, 'Await A175 prayer caller.');
  const { stages, segments } = activityTimeline(activity, at(20));
  const sequence = stages.filter(row => row.lane === 'A2' && row.start >= at(6) && row.start < at(18));
  assert.ok(sequence.every(row => row.task.endsWith('/A177')));
  assert.deepEqual(sequence.map(row => [row.phase, row.start, row.end]), [
    ['working', at(6), at(7)], ['parked', at(7), at(10)],
    ['working', at(10), at(11)], ['parked', at(11), at(15)], ['working', at(15), at(18)],
  ]);
  assert.equal(sequence[3].reason, 'Await C158 prayer caller.');
  assert.equal(segments.filter(row => row.phase === 'queued').length, 4,
    'all deliveries remain in task history');
  assert.ok(stages.every(row => row.phase !== 'queued' && row.phase !== 'pending'));
  assert.ok(stages.some(row => row.lane === 'A2' && row.phase === 'unrecorded' && row.start === at(18)),
    'resuming A177 invalidates the earlier idle report');
});

test('an older parked task cannot reappear after the worker delivers newer work', () => {
  // Ownership persists, but A1's unfinished task is no longer this worker's current activity.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const { stages } = activityTimeline({ events: [
    { type: 'register', worker: 'A', live: true, at: at(0) },
    { type: 'assign', task: 'A1', worker: 'A', at: at(0) },
    { type: 'park', task: 'A1', reason: 'Await source port.', at: at(1) },
    { type: 'assign', task: 'A2', worker: 'A', at: at(2) },
    { type: 'ready', task: 'A2', at: at(3) },
    { type: 'turn', worker: 'A', state: 'idle', reason: 'No independent task selected.', at: at(4) },
  ] }, at(5));
  assert.deepEqual(stages.filter(row => row.lane === 'A').map(row => row.phase),
    ['working', 'parked', 'working', 'unrecorded', 'idle']);
  assert.ok(stages.filter(row => row.start >= at(2)).every(row => row.task !== 'A1'));
});

test('integration closes a resumed worker interval even without a second ready event', () => {
  // This is A117's handoff shape: a resumed parked task went directly to integration.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const { tasks, segments } = activityTimeline({ events: [
    { type: 'assign', task: 'A117', worker: 'A', at: at(0) },
    { type: 'park', task: 'A117', at: at(1) },
    { type: 'resume', task: 'A117', at: at(2) },
    { type: 'integrating', task: 'A117', at: at(3) },
    { type: 'accepted', task: 'A117', at: at(4) },
    { type: 'published', task: 'A117', at: at(5) },
  ] }, at(10));
  assert.equal(tasks[0].status, 'published');
  assert.deepEqual(segments.filter(row => row.task === 'A117' && row.phase === 'working')
    .map(row => row.end), [at(1), at(3)]);
  assert.ok(segments.filter(row => row.task === 'A117').every(row => !row.ongoing));
});

test('recovered publication closes task history without adding invented Main work', () => {
  // Acceptance at minute 3 and a known-public bound at 8 do not establish
  // five minutes of publication work, nor publication continuing to minute 10.
  const at = minute => `2026-10-10T10:${String(minute).padStart(2, '0')}:00Z`;
  const activity = activityFromLedger({ runId: 'loop-20260925', events: [
    { id: 'assign', type: 'assign', task: 'C1', worker: 'C', at: at(0) },
    { id: 'ready', type: 'ready', task: 'C1', at: at(1) },
    { id: 'merge', type: 'integrating', task: 'C1', at: at(2) },
    { id: 'accept', type: 'accepted', task: 'C1', at: at(3) },
    { id: 'recover', type: 'publication-confirmed', task: 'C1', knownBy: at(8), at: at(9) },
  ] });
  assert.equal(activity.events.at(-1).knownBy, at(8));
  const result = activityTimeline(activity, at(10));
  assert.equal(result.tasks[0].status, 'published');
  assert.equal(result.tasks[0].publicationKnownBy, at(8));
  assert.equal(result.tasks[0].publishedAt, null);
  const publications = result.segments.filter(row => row.phase === 'publication');
  assert.deepEqual(publications.map(row => [row.start, row.end, row.durationUnknown]), [[at(8), at(8), true]]);
  assert.ok(result.stages.every(row => row.phase !== 'publication'),
    'an unknown duration cannot count as measured publication utilization');
});

test('agent stages prefer active work over queued deliveries and reset stale blocked reports', () => {
  // A1 is pending while A2 works; A2 reports a block, then resumes without an active turn.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const rows = [
    { task: 'A1', worker: 'A', lane: 'A', phase: 'queued', start: at(0), end: at(10) },
    { task: 'A2', worker: 'A', lane: 'A', phase: 'working', start: at(2), end: at(10) },
  ];
  const stages = agentStages(rows, [
    { type: 'assign', task: 'A2', worker: 'A', at: at(2) },
    { type: 'turn', worker: 'A', state: 'blocked', reason: 'Await source lock.', at: at(4) },
    { type: 'implement', task: 'A2', at: at(6) },
  ]);
  assert.deepEqual(stages.map(row => [row.phase, row.start, row.end]), [
    ['working', at(2), at(4)], ['blocked', at(4), at(6)], ['working', at(6), at(10)],
  ]);
  assert.equal(stages[1].reason, 'Await source lock.');
  assert.equal(rows[0].phase, 'queued', 'queue evidence is preserved separately');
  assert.deepEqual(agentStages(rows).map(row => row.phase), ['working']);
});

test('a publication with no endpoint cannot reappear after newer Main work ends', () => {
  // The old publication remains in history, but silence after a newer stage is unknown.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const stages = agentStages([
    { task: 'A1', lane: 'Main', phase: 'publication', start: at(0), end: at(10), ongoing: true },
    { task: 'B1', lane: 'Main', phase: 'integrating', start: at(2), end: at(4) },
  ]);
  assert.deepEqual(stages.map(row => row.phase), ['publication', 'integrating', 'unrecorded']);
});

test('claiming source scope preserves time spent investigating in the worker interval', () => {
  // Distinct times make a lost diagnosis interval visible without wall-clock timing.
  const assigned = '2026-09-25T10:00:00Z';
  const scoped = '2026-09-25T10:10:00Z';
  const ready = '2026-09-25T10:20:00Z';
  const activity = activityFromLedger({ runId: 'loop-20260925', events: [
    { id: 'claim', type: 'assign', at: assigned, task: 'A1', worker: 'A', kind: 'investigation' },
    { id: 'scope', type: 'implement', at: scoped, task: 'A1', goal: 'sounds-port' },
    { id: 'delivery', type: 'ready', at: ready, task: 'A1' },
  ] });
  const timeline = activityTimeline(activity, ready);
  assert.equal(timeline.tasks[0].kind, 'implementation');
  assert.equal(timeline.tasks[0].goal, 'sounds-port');
  assert.deepEqual(timeline.segments.find(segment => segment.phase === 'working'), {
    task: 'loop-20260925/A1', goal: 'sounds-port', worker: 'A', kind: 'implementation',
    phase: 'working', start: assigned, end: ready, lane: 'A',
  });
});

test('worker assignment overlaps another task waiting for integration', () => {
  const events = [
    { id: 'a', type: 'assign', at: '2026-09-25T10:00:00Z',
      task: 'A1', worker: 'A', goal: 'first' },
    { id: 'b', type: 'ready', at: '2026-09-25T10:20:00Z', task: 'A1' },
    { id: 'c', type: 'assign', at: '2026-09-25T10:21:00Z',
      task: 'A2', worker: 'A', goal: 'second' },
    { id: 'd', type: 'integrating', at: '2026-09-25T10:25:00Z',
      task: 'A1', integration: 'a'.repeat(40) },
    { id: 'e', type: 'validated', at: '2026-09-25T10:30:00Z',
      task: 'A1', passed: true },
    { id: 'f', type: 'accepted', at: '2026-09-25T10:35:00Z', task: 'A1' },
    { id: 'g', type: 'published', at: '2026-09-25T10:36:00Z', task: 'A1' },
  ];
  const timeline = activityTimeline({ runId: 'loop-20260925', events },
    '2026-09-25T10:40:00Z');
  assert.deepEqual(timeline.segments.filter(row => row.task === 'A1')
    .map(row => [row.phase, row.lane]), [
    ['working', 'A'], ['queued', 'A'], ['integrating', 'Main'],
    ['acceptance', 'Main'], ['publication', 'Main'],
  ]);
  const waiting = timeline.segments.find(row => row.task === 'A1' && row.phase === 'queued');
  assert.equal(waiting.start, '2026-09-25T10:20:00Z');
  assert.equal(waiting.end, '2026-09-25T10:25:00Z');
  assert.deepEqual(timeline.segments.find(row => row.task === 'A2'),
    { task: 'A2', goal: 'second', worker: 'A', kind: 'implementation',
      phase: 'working', start: '2026-09-25T10:21:00Z',
      end: '2026-09-25T10:40:00Z', lane: 'A', ongoing: true });
});

test('a correction has its own worker interval', () => {
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const types = ['assign', 'ready', 'feedback', 'resume', 'ready'];
  const events = types.map((type, i) => ({
    id: String(i), type, at: at(i * 5), task: 'A1',
    ...(type === 'assign' ? { worker: 'A', goal: 'source' } : {}),
  }));
  const segments = activityTimeline({ events }, at(25)).segments;
  assert.deepEqual(segments.filter(row => row.task === 'A1').map(row => row.phase),
    ['working', 'queued', 'rework', 'queued']);
  assert.equal(segments[2].start, at(15));
  assert.equal(segments[2].end, at(20));
});

test('pre-merge review, corrections and batch admission occupy explicit lanes', () => {
  // Minutes separate receipt from review and review from the actual merge.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const events = [
    { type: 'assign', task: 'C1', worker: 'C', at: at(0) },
    { type: 'ready', task: 'C1', at: at(5) },
    { type: 'received', task: 'C1', at: at(6) },
    { type: 'activity', task: 'C1', phase: 'review', reason: 'Check callers.', at: at(8) },
    { type: 'feedback', task: 'C1', at: at(10) },
    { type: 'resume', task: 'C1', at: at(11) },
    { type: 'ready', task: 'C1', at: at(15) },
    { type: 'activity', task: 'C1', phase: 'review', reason: 'Verify correction.', at: at(16) },
    { type: 'integrating', task: 'C1', at: at(18) },
    { type: 'assign', task: 'P1', worker: 'Prep', kind: 'challenge-preparation', at: at(0) },
    { type: 'ready', task: 'P1', at: at(3) },
    { type: 'integrating', task: 'P1', at: at(4) },
    { type: 'validated', task: 'P1', passed: true, at: at(5) },
    { type: 'accepted', task: 'P1', at: at(6) },
    { type: 'activity', task: 'P1', phase: 'admission', reason: 'Verify manifest.', at: at(9) },
    { type: 'activity', task: 'P1', phase: 'baseline', reason: 'Evaluate admitted cases.', at: at(12) },
    { type: 'activity', task: 'P1', phase: 'done', reason: 'Cases available.', at: at(17) },
    { type: 'published', task: 'P1', at: at(19) },
  ];
  const { segments } = activityTimeline({ events }, at(20));
  assert.deepEqual(segments.filter(row => row.phase === 'review').map(row => [row.start, row.end]),
    [[at(8), at(9)], [at(16), at(18)]]);
  assert.equal(segments.find(row => row.phase === 'rework').lane, 'C');
  assert.equal(segments.find(row => row.phase === 'admission').lane, 'Main');
  // A later Main stage supersedes a missing baseline endpoint, not an ongoing job.
  assert.equal(segments.find(row => row.phase === 'baseline').end, at(16));
  assert.equal(segments.find(row => row.phase === 'baseline').superseded, true);
  assert.deepEqual(segments.filter(row => row.task === 'P1' && row.phase === 'publication')
    .map(row => [row.start, row.end]), [[at(6), at(9)], [at(17), at(19)]]);
  assert.ok(segments.some(row => row.lane === 'Prep'));
});

test('reported waits fill unassigned time without hiding other work or inventing historical reasons', () => {
  // Two tasks bracket a wait; a late active turn deliberately leaves unknown time.
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const events = [
    { type: 'register', worker: 'C', live: true, at: at(0) },
    { type: 'assign', task: 'C1', worker: 'C', at: at(0) },
    { type: 'ready', task: 'C1', at: at(5) },
    { type: 'turn', worker: 'C', state: 'blocked', reason: 'Awaiting Prep admission.', at: at(6) },
    { type: 'integrating', task: 'C1', at: at(8) },
    { type: 'assign', task: 'C2', worker: 'C', at: at(15) },
    { type: 'ready', task: 'C2', at: at(17) },
    { type: 'integrating', task: 'C2', at: at(18) },
  ];
  const { segments } = activityTimeline({ events }, at(20));
  const waits = segments.filter(row => row.phase === 'blocked');
  assert.deepEqual(waits.map(row => [row.start, row.end, row.reason]),
    [[at(6), at(15), 'Awaiting Prep admission.']]);
  assert.ok(segments.some(row => row.lane === 'C' && row.phase === 'unrecorded'
    && row.start === at(17))); // The old blocked turn cannot leak across C2's assignment.
  const released = activityTimeline({ events: [...events,
    { type: 'observe', worker: 'C', live: false, at: at(19) }] }, at(30));
  assert.ok(released.segments.filter(row => row.lane === 'C').every(row => row.end <= at(19)));
});

test('synthetic gain excludes newly admitted cases and shows losses', () => {
  const evaluation = (sha, cases) => ({
    status: 'complete', manifestSha256: 'manifest', scorerSha256: 'scorer',
    sha, cases: cases.map(([id, matched]) => ({
      id, recordingSha256: id, metrics: { screens: { matched, total: 10 } },
    })),
  });
  const artifacts = new Map([
    ['first', evaluation('a', [['one', 2], ['two', 8]])],
    ['second', evaluation('b', [['one', 6], ['two', 5], ['new', 9]])],
  ]);
  const rows = [
    { event: 'challenge', sha: 'a', challenge_evaluation: 'first' },
    { event: 'challenge', sha: 'b', challenge_evaluation: 'second' },
  ];
  const gains = syntheticGainByCommit(rows, path => artifacts.get(path));
  assert.equal(gains.has('a'), false);
  assert.deepEqual(gains.get('b'), { gained: 4, lost: 3, batches: 1 });
});

test('published activity omits worktree paths and process handles', () => {
  const activity = activityFromLedger({ runId: 'loop-20260925', events: [
    { id: 'a', type: 'assign', at: '2026-09-25T10:00:00Z', task: 'A1',
      worker: 'A', goal: 'source', worktree: '/private/path',
      handle: 'private-process' },
    { id: 'b', type: 'turn', at: '2026-09-25T10:01:00Z',
      worker: 'A', state: 'blocked', reason: 'private prose',
      summary: 'Waiting for Prep to finish the next batch.', processes: ['private-process'] },
  ] });
  assert.deepEqual(activity.events, [{
    runId: 'loop-20260925', id: 'a', type: 'assign', at: '2026-09-25T10:00:00Z',
    task: 'A1', worker: 'A', goal: 'source',
  }, {
    runId: 'loop-20260925', id: 'b', type: 'turn', at: '2026-09-25T10:01:00Z',
    worker: 'A', state: 'blocked', reason: 'Waiting for Prep to finish the next batch.',
  }]);
});

test('later ledger runs retain earlier activity without colliding task IDs', () => {
  const first = activityFromLedger({ runId: 'loop-20260925', events: [{
    id: 'one', type: 'assign', at: '2026-09-25T10:00:00Z',
    task: 'A1', worker: 'A', goal: 'old',
  }] });
  const second = activityFromLedger({ runId: 'loop-20260927', events: [{
    id: 'one', type: 'assign', at: '2026-09-27T10:00:00Z',
    task: 'A1', worker: 'A', goal: 'new',
  }] });
  const merged = mergeActivity(first, second);
  assert.deepEqual(activityTimeline(merged).tasks.map(task => task.id),
    ['loop-20260925/A1', 'loop-20260927/A1']);
  assert.equal(mergeActivity(merged, second).events.length, 2);
});

test('development snapshot is bound to checkpoint artifacts and names both fixed directories', () => {
  const results = { results: Array.from({ length: 44 }, (_, index) => ({
    session: index === 0 ? 'holdout--example.session.json'
      : `example-${index}.session.json`,
    passed: true, metrics: {
      screens: { matched: 2, total: 2 },
      rngCalls: { matched: 3, total: 3 },
      cursors: { matched: 2, total: 2 },
    },
  })) };
  const bytes = Buffer.from(JSON.stringify(results));
  const summary = { allPassed: true, executionCommit: 'a'.repeat(40),
    timestamp: '2026-09-25T10:00:00Z',
    artifactHashes: { 'session-results.json':
      createHash('sha256').update(bytes).digest('hex') },
    score: { screensMatched: 88, rngMatched: 132, cursorsMatched: 88 } };
  const snapshot = developmentFromCheckpoint(summary, results, bytes);
  assert.ok(snapshot.sessions.some(row => row.session === 'holdout/example'));
  assert.ok(snapshot.sessions.some(row => row.session === 'example-1'));
  assert.throws(() => developmentFromCheckpoint(
    { ...summary, artifactHashes: { 'session-results.json': 'bad' } }, results, bytes,
  ), /do not belong/u);
});


test('goal history attributes shared measurements once and preserves pending work', () => {
  // Two goals and a duplicate submission share one published commit. A third
  // goal has no publication evidence and must not acquire that commit's gain.
  const at = '2026-10-14T10:00:00Z', commit = 'a'.repeat(40);
  const task = (goal, extra = {}) => ({goal, worker: 'B', assignedAt: at,
    publishedAt: at, integration: commit, ...extra});
  const records = new Map([['first', {summary: 'Fix <caller>', cFile: 'hack.c'}]]);
  const gain = {gained: 346, lost: 2, batches: 3}; // Shared score with both directions of change.
  const groups = goalHistory([task('first'), task('second'), task('first', {worker: 'C'}),
    task('pending', {publishedAt: null})], records, new Map([[commit, gain]]));
  assert.equal(groups.length, 2, 'published integration and pending goal stay separate');
  assert.deepEqual(groups[0].synthetic, gain, 'score is not multiplied by task or goal count');
  assert.deepEqual(groups[0].goals.map(goal => goal.id), ['first', 'second']);
  assert.deepEqual(groups[0].goals[0].workers, ['B', 'C']);
  assert.equal(groups[0].goals[0].summary, 'Fix <caller>');
  assert.equal(groups[1].synthetic, null);
  assert.equal(groups[1].commit, null);
  assert.equal(groups[0].goals[0].synthetic, undefined, 'individual goals do not claim group credit');
});

test('integration medians retain outliers without letting one dominate the trend', () => {
  // A five-minute attempt, a seven-hour wait, then a nine-minute attempt.
  // The middle rolling sample uses the mean of the two middle values; the
  // third has a nine-minute median while preserving the full long duration.
  const points = mainIntegrationDurations({segments: [5, 420, 9].map((minutes, index) => ({
    task: String(index), lane: 'Main', phase: 'integrating',
    start: new Date(index * 86400000).toISOString(),
    end: new Date(index * 86400000 + minutes * 60000).toISOString(),
  }))}).implementation;
  assert.deepEqual(points.map(point => point.rollingMedianMs / 60000), [5, 212.5, 9]);
  assert.equal(points[1].durationMs / 60000, 420);
  assert.equal(points[2].rollingMeanMs / 60000, 434 / 3);
});
