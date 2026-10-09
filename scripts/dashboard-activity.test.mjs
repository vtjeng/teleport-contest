import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { activityTimeline, agentStages, syntheticGainByCommit } from './dashboard-activity.mjs';
import { activityFromLedger, developmentFromCheckpoint, mergeActivity } from './dashboard-snapshot.mjs';

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
