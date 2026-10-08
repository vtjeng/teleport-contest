import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { activityTimeline, syntheticGainByCommit } from './dashboard-activity.mjs';
import { activityFromLedger, developmentFromCheckpoint, mergeActivity } from './dashboard-snapshot.mjs';

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
    [[at(8), at(10)], [at(16), at(18)]]);
  assert.equal(segments.find(row => row.phase === 'rework').lane, 'C');
  assert.equal(segments.find(row => row.phase === 'admission').lane, 'Main');
  assert.equal(segments.find(row => row.phase === 'baseline').end, at(17));
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
  const waits = segments.filter(row => row.phase === 'waiting');
  assert.deepEqual(waits.map(row => [row.start, row.end, row.reason]),
    [[at(8), at(15), 'Awaiting Prep admission.']]);
  assert.ok(segments.some(row => row.lane === 'C' && row.phase === 'unrecorded'
    && row.start === at(18))); // The old blocked turn cannot leak across C2's assignment.
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
