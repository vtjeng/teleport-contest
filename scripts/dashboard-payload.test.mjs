import assert from 'node:assert/strict';
import { test } from 'node:test';
import { challengeDashboardPayload } from './dashboard-payload.mjs';

test('dashboard payload omits evaluator evidence and manifest replay metadata', () => {
  const first = { screens: { matched: 1, total: 2 } };
  const current = { screens: { matched: 2, total: 2 }, passed: true };
  const payload = challengeDashboardPayload({
    status: 'measured', totals: { screens: { matched: 2, total: 2 } },
    error: null, commitUtc: '2026-09-02T00:00:00.000Z',
    commitAgeLabel: 'Oldest measured commit',
    cases: [{ batch: 'v2', id: 'case', title: 'Case', first, current,
      screenCount: 2, delta: 1, outcome: 'match',
      localComparison: { trace: 'large replay trace' }, cReplay: ['unused'],
      sourceTrace: ['unused'], selectionRationale: 'unused' }],
    batches: [{ batch: 'v2', status: 'measured', error: null,
      history: [{ screens: 2 }], evaluation: { cases: ['unused'] },
      cases: ['unused'], previous: { cases: ['unused'] } }],
  });
  assert.deepEqual(payload, {
    status: 'measured', totals: { screens: { matched: 2, total: 2 } },
    error: null, commitUtc: '2026-09-02T00:00:00.000Z',
    commitAgeLabel: 'Oldest measured commit',
    cases: [{ batch: 'v2', id: 'case', title: 'Case', first, current,
      screenCount: 2, delta: 1, outcome: 'match' }],
    batches: [{ batch: 'v2', status: 'measured', error: null }],
  });
  assert.equal(payload.cases[0].localComparison, undefined);
  assert.equal(payload.batches[0].history, undefined);
  assert.equal(payload.batches[0].evaluation, undefined);
});
