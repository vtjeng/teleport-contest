import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';

import { activityTimeline, syntheticGainByCommit } from './dashboard-activity.mjs';
import { activityFromLedger, developmentFromCheckpoint, mergeActivity } from './dashboard-snapshot.mjs';

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
    ['working', 'A'], ['queued', 'Integration'], ['integrating', 'Integration'],
    ['acceptance', 'Integration'], ['publication', 'Integration'],
  ]);
  assert.deepEqual(timeline.segments.find(row => row.task === 'A2'),
    { task: 'A2', goal: 'second', worker: 'A', kind: 'implementation',
      phase: 'working', start: '2026-09-25T10:21:00Z',
      end: '2026-09-25T10:40:00Z', lane: 'A' });
});

test('a correction has its own worker interval', () => {
  const at = minute => `2026-09-25T10:${String(minute).padStart(2, '0')}:00Z`;
  const types = ['assign', 'ready', 'feedback', 'resume', 'ready'];
  const events = types.map((type, i) => ({
    id: String(i), type, at: at(i * 5), task: 'A1',
    ...(type === 'assign' ? { worker: 'A', goal: 'source' } : {}),
  }));
  const segments = activityTimeline({ events }, at(25)).segments;
  assert.deepEqual(segments.map(row => row.phase), ['working', 'queued', 'working', 'queued']);
  assert.equal(segments[2].start, at(15));
  assert.equal(segments[2].end, at(20));
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
      worker: 'A', reason: 'private prose' },
  ] });
  assert.deepEqual(activity.events, [{
    runId: 'loop-20260925', id: 'a', type: 'assign', at: '2026-09-25T10:00:00Z',
    task: 'A1', worker: 'A', goal: 'source',
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
