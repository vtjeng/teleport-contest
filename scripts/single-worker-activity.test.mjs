import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import test from 'node:test';
import { singleWorkerActivity } from './single-worker-activity.mjs';
import { createTrialMonitor } from './trial-monitor.mjs';
import { injectDashboardData } from './build-dashboard.mjs';
const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const saved = () => {
  const register = read('../trial-monitor/repairs.json');
  register.repairs = ['vault-silent-guard', 'vault-hidden-guard'].map(id => {
    const repair = register.repairs.find(row => row.id === id);
    // Freeze this historical fixture even as later normal work adds candidates.
    repair.candidates = repair.candidates.slice(0, id === 'vault-silent-guard' ? 2 : 1);
    return repair;
  });
  return {manifest: read('../trial-monitor/manifest.json'), register,
    buildSha: 'f'.repeat(40), builtAt: '2026-10-22T03:00:00Z'};
};
const view = data => createTrialMonitor(data).summarize();

test('two accepted repairs group the correction and retain exact commit and attempt links', () => {
  const activity = singleWorkerActivity(view(saved()));
  assert.equal(activity.tasks.length, 2);
  assert.equal(activity.acceptedCount, 2);
  assert.equal(activity.segments.length, 6);
  assert(activity.segments.every(row => row.lane === 'Standard engineer'));
  const silent = activity.tasks.find(row => row.id === 'vault-silent-guard');
  assert.match(silent.status, /latest correction passed/);
  assert.equal(activity.segments.filter(row => row.task === silent.id).length, 4);
  assert(silent.links.some(row => row.url.endsWith('/39708782496/attempts/1')));
  assert(silent.links.some(row => row.url.endsWith('/commit/724ed98a40cc6c6b8c3166c4b0029843a1791935')));
  assert.match(silent.investigation, /unknown/);
  assert(!activity.segments.some(row => row.phase === 'investigation' || row.phase === 'idle'));
});

test('missing or wrong-trigger gates cannot produce acceptance or invented spans', () => {
  const data = saved();
  data.register.repairs = [data.register.repairs.at(-1)];
  const candidate = data.register.repairs[0].candidates[0];
  candidate.runs.find(row => row.name === 'Checkpoint').completedAt = null;
  candidate.runs.find(row => row.name === 'Dashboard').event = 'workflow_dispatch';
  const activity = singleWorkerActivity(view(data));
  assert.equal(activity.acceptedCount, 0);
  assert.equal(activity.segments.filter(row => row.phase === 'validation').length, 0);
  assert.match(activity.tasks[0].status, /time-unknown.*Dashboard wrong-trigger/);
});

test('recorded investigation spans stop at stale register time, never commit time or now', () => {
  const data = saved();
  const repair = data.register.repairs.at(-1);
  data.register.asOf = '2026-10-22T01:10:00Z';
  repair.investigations = [{ start: '2026-10-22T01:00:00Z', end: null, note: 'C probe' },
    {start: 'invalid', end: '2026-10-22T01:00:00Z'}];
  const activity = singleWorkerActivity(view(data));
  const spans = activity.segments.filter(row => row.phase === 'investigation');
  assert.equal(spans.length, 1);
  assert.equal(spans[0].end, '2026-10-22T01:10:00.000Z');
  assert.equal(spans[0].ongoing, true);
});

test('reruns and duplicate API snapshots do not add repairs or double CI spans', () => {
  const data = saved();
  const candidate = data.register.repairs.at(-1).candidates[0];
  const run = candidate.runs[0];
  candidate.runs.push({...run});
  candidate.runs.push({...run, attempt: 2, conclusion: 'failure'});
  const activity = singleWorkerActivity(view(data));
  assert.equal(activity.acceptedCount, 2);
  assert.equal(activity.segments.filter(row => row.phase === 'validation').length, 4);
});

test('embedded timeline parses and keeps narrow layout, freshness and historical separation', () => {
  const template = readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
  const html = injectDashboardData(template, '{}', 'null', 'f'.repeat(40), JSON.stringify(saved()));
  for (const script of html.matchAll(/<script>([\s\S]*?)<\/script>/gu)) new Script(script[1]);
  assert(!html.includes('Repair trial monitor'));
  assert.match(html, /Show retired worker history/);
  assert.match(html, /Recorded activity:/);
  assert.match(html, /\.activity-label\s*\{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/u);
  assert.match(html, /\.trial-tiles,\.trial-details\s*\{\s*grid-template-columns:minmax\(0,1fr\)/u);
});
