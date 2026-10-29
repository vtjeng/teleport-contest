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
  assert(activity.segments.every(row => row.lane === 'Main integration'));
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


test('post-trial repairs share the current lane without admitting baseline or double-counting corrections', () => {
  const data = saved();
  const corrected = data.register.repairs[0];
  corrected.window = 'post-trial';
  const pending = structuredClone(data.register.repairs[1]);
  pending.id = 'post-trial-pending'; pending.window = 'post-trial';
  pending.candidates[0].runs.find(run => run.name === 'Dashboard').conclusion = 'failure';
  const baseline = read('../trial-monitor/repairs.json').repairs.find(repair => repair.window === 'baseline');
  data.register.repairs.push(pending, baseline);
  const summarized = view(data), activity = singleWorkerActivity(summarized);
  assert.equal(activity.tasks.length, 3);
  assert.equal(activity.acceptedCount, 1,
    'an incomplete shared SHA keeps both siblings pending; the earlier correction stays accepted');
  assert.equal(activity.tasks.filter(task => task.id === corrected.id).length, 1);
  assert.equal(activity.tasks.find(task => task.id === corrected.id).publishedAt,
    summarized.results.find(result => result.repair.id === corrected.id).accepted.closureAt,
    'grouped correction retains first acceptance time');
  assert.equal(activity.tasks.find(task => task.id === pending.id).publishedAt, undefined);
  assert.equal(activity.tasks.find(task => task.id === data.register.repairs[1].id).publishedAt, undefined);
  assert.ok(activity.segments.some(segment => segment.task === corrected.id));
  assert.ok(activity.tasks.every(task => task.worker === 'Main integration'));
  assert.ok(!activity.tasks.some(task => task.id === baseline.id));
  assert.ok(!activity.segments.some(segment => segment.task === baseline.id));
});

test('published 2/2/3 pilot has seven repairs and only three shared CI spans per phase', () => {
  const data = saved();
  const ids = new Set(['versinfo-choice-handler', 'message-types-choice-handler',
    'autopickup-exceptions-choice-handler', 'status-condition-choice-handler',
    'pile-limit-live-choice-handler', 'packorder-live-choice-handler',
    'menuinvertmode-live-choice-handler']);
  data.register.repairs = read('../trial-monitor/repairs.json').repairs
    .filter(repair => ids.has(repair.id));
  const summarized = view(data), activity = singleWorkerActivity(summarized);
  assert.equal(activity.acceptedCount, 7);
  assert.equal(activity.segments.filter(row => row.phase === 'validation').length, 3);
  assert.equal(activity.segments.filter(row => row.phase === 'publication').length, 3);
  assert.equal(summarized.recentProgress.groupCount, 3);
  assert.equal(summarized.recentProgress.repairCount, 7);
  assert.equal(summarized.recentProgress.rate.toFixed(2), '5.66');
  assert.equal(summarized.currentCandidate.groupSize, 3);
  const first = activity.tasks.find(task => task.id === 'versinfo-choice-handler');
  assert.equal(first.validationGroupSize, 2);
  assert(first.links.some(link => link.url.endsWith('/commit/4b227e84c703872a8553f369007f177d8bbc27f5')));
  assert.match(activity.segments.find(row => row.phase === 'validation').reason, /Shared by 2 repairs/u);
});

test('partial sibling evidence yields one incomplete publication span for a shared SHA', () => {
  const data = saved();
  const first = data.register.repairs[1];
  const second = structuredClone(first);
  second.id = 'partial-sibling'; second.window = first.window;
  second.candidates[0].runs = second.candidates[0].runs.filter(run => run.name !== 'Dashboard');
  data.register.repairs = [first, second];
  const activity = singleWorkerActivity(view(data));
  const spans = activity.segments.filter(row => row.phase === 'publication');
  assert.equal(spans.length, 1);
  assert.match(spans[0].reason, /Acceptance incomplete/);
  assert.equal(activity.acceptedCount, 0);
});
