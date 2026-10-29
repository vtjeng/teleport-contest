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
  assert.match(notice, /not repairs applied to this gameplay baseline/);
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
