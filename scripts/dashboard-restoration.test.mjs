import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {injectDashboardData, reportingContextNotice} from './build-dashboard.mjs';
const read = path => readFileSync(new URL(`../trial-monitor/${path}`, import.meta.url), 'utf8');
const context = JSON.parse(read('dashboard-restoration.json'));

test('restored reporting identifies the gameplay baseline and separate historical source', () => {
  const notice = reportingContextNotice(context);
  for (const key of ['baselineCommit', 'baselineSourceCommit', 'baselineTree', 'reportingSourceCommit'])
    assert.ok(notice.includes(context[key]));
  assert.match(notice, /not an applied-repair inventory/);
  for (const source of context.reintroducedSources ?? []) assert.ok(notice.includes(source));
  assert.throws(() => reportingContextNotice({...context, reintroducedSources:['<script>']}), /provenance/);
  assert.match(reportingContextNotice({...context, reintroducedSources:[]}), /No post-baseline gameplay source changes are recorded/);
  assert.match(notice, /does not refresh/);
  assert.equal(reportingContextNotice(null), '');
  assert.throws(() => reportingContextNotice({...context, reportingSourceCommit:'<script>'}), /provenance/);
});

test('frozen evidence remains byte-pinned and historical outcomes keep source revisions', () => {
  const bytes = read('evidence.json');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), context.evidenceSha256);
  const evidence = JSON.parse(bytes);
  assert.ok(evidence.sources.length > 0);
  assert.ok(evidence.sources.every(source => /^[a-f0-9]{40}$/u.test(source.ref)));
  assert.ok(evidence.cohorts.every(cohort => /^[a-f0-9]{40}$/u.test(cohort.scanBase)));
});

test('dashboard injection embeds self-contained models and the historical notice', () => {
  const template = readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
  const output = injectDashboardData(template, '{}', 'null', context.baselineCommit, 'null', read('evidence.json'), context);
  assert.match(output, /id="reportingContext"/);
  assert.match(output, /function workflowSummary\(/);
  assert.match(output, /function renderWorkflow\(/);
  assert.doesNotMatch(output, /\/\*(?:WORKFLOW_[A-Z_]+)_PLACEHOLDER\*\//u);
  assert.doesNotMatch(output, /<!--REPORTING_CONTEXT_PLACEHOLDER-->/u);
});

test('applied-source notice matches only the local selected original patches', () => {
  const manifest = JSON.parse(readFileSync(new URL('../experiments/restoration/later-source-selection-20261029.json', import.meta.url), 'utf8'));
  const combined = JSON.parse(readFileSync(new URL('../experiments/restoration/recovery-broad-batch-20261030.json', import.meta.url), 'utf8'));
  assert.deepEqual(combined.baselineIncludedSources, manifest.includedSources);
  assert.deepEqual(context.reintroducedSources, combined.includedSources);
  assert.equal(new Set(context.reintroducedSources).size, context.reintroducedSources.length);
  for (const decision of manifest.decisions) {
    assert.equal(manifest.includedSources.includes(decision.sha),
      decision.status === 'selected-reconciliation', decision.sha);
  }
});

// Source provenance is not a no-regression oracle; this guards the explicit
// exclusion decision and the exact gameplay bytes that received source review.
test('broad recovery preserves the reviewed window exclusion boundary', () => {
  const audit = JSON.parse(readFileSync(new URL('../experiments/restoration/recovery-broad-window-audit-20261030.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../experiments/restoration/recovery-broad-batch-20261030.json', import.meta.url), 'utf8'));
  assert.equal(audit.rows.length, 18);
  const window = new Set(audit.rows.map(row => row.sha));
  assert.deepEqual(manifest.additionalIncludedSourceScopes.filter(sha => window.has(sha)), []);
  assert.equal(audit.rows.filter(row => row.status === 'already-baseline-infrastructure').length, 2);
  assert.ok(audit.rows.every(row => ['not-reintroduced', 'already-baseline-infrastructure'].includes(row.status)));
  for (const [path, expected] of Object.entries(audit.gameplayPathHashes)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(`../${path}`, import.meta.url))).digest('hex'), expected, path);
  }
});
