import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
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

// Historical source pins belong to their reviewed snapshot. A later, separately
// reviewed batch must not invalidate that provenance merely by sharing a file.
const currentAudit = JSON.parse(readFileSync(new URL('../experiments/restoration/recovery19-window-audit-20261030.json', import.meta.url), 'utf8'));
const root = new URL('../', import.meta.url);
const sourceAt = (commit, path) => execFileSync('git', ['show', `${commit}:${path}`], {cwd:root, encoding:'utf8'});
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const currentSource = path => readFileSync(new URL(path, root), 'utf8');
function boundedSource(source, start, end) {
  const first = source.indexOf(start);
  assert.ok(first >= 0, `missing start: ${start}`);
  assert.equal(source.indexOf(start, first + start.length), -1, `ambiguous start: ${start}`);
  const last = source.indexOf(end, first + start.length);
  assert.ok(last > first, `missing end: ${end}`);
  return source.slice(first, last);
}
function assertWindowBoundaries(readSource) {
  const paths = [
    ['js/allmain.js', 'export async function finishHeroTimeEffects(', '\nexport async function '],
    ['js/monmove.js', '    await m_respond(monster, env);', '    // PHASE TWO:'],
  ];
  for (const [path, start, end] of paths) {
    assert.equal(boundedSource(readSource(path), start, end),
      boundedSource(sourceAt(currentAudit.goodCommit, path), start, end), path);
  }
  assert.equal(readSource('js/shknam.js'), sourceAt(currentAudit.goodCommit, 'js/shknam.js'), 'js/shknam.js');
}

test('broad recovery preserves the reviewed window exclusion boundary', () => {
  const audit = JSON.parse(readFileSync(new URL('../experiments/restoration/recovery-broad-window-audit-20261030.json', import.meta.url), 'utf8'));
  const manifest = JSON.parse(readFileSync(new URL('../experiments/restoration/recovery-broad-batch-20261030.json', import.meta.url), 'utf8'));
  assert.equal(audit.rows.length, 18);
  const window = new Set(audit.rows.map(row => row.sha));
  assert.deepEqual(manifest.additionalIncludedSourceScopes.filter(sha => window.has(sha)), []);
  assert.equal(audit.rows.filter(row => row.status === 'already-baseline-infrastructure').length, 2);
  assert.ok(audit.rows.every(row => ['not-reintroduced', 'already-baseline-infrastructure'].includes(row.status)));
  for (const [path, expected] of Object.entries(audit.gameplayPathHashes)) {
    assert.equal(digest(sourceAt(currentAudit.historicalAuditCommit, path)), expected, `historical ${path}`);
  }
});


test('recovery19 separately pins its reviewed runtime and retains the window boundaries', () => {
  assert.equal(execFileSync('git', ['rev-parse', `${currentAudit.candidate}^{tree}`], {cwd:root, encoding:'utf8'}).trim(), currentAudit.tree);
  for (const [path, expected] of Object.entries(currentAudit.gameplayPathHashes)) {
    assert.equal(digest(sourceAt(currentAudit.candidate, path)), expected, `reviewed ${path}`);
    assert.equal(digest(currentSource(path)), expected, `current ${path}`);
  }
  const changed = execFileSync('git', ['diff', '--name-only', currentAudit.historicalAuditCommit, currentAudit.candidate, '--', 'js/'], {cwd:root, encoding:'utf8'}).trim().split('\n').sort();
  assert.deepEqual(changed, [...currentAudit.runtimePaths].sort());
  for (const path of currentAudit.otherModulesUnchangedAcrossWindow) {
    assert.equal(sourceAt(currentAudit.goodCommit, path), sourceAt(currentAudit.badCommit, path), path);
  }
  assertWindowBoundaries(currentSource);
});

test('window boundary controls reject changed elapsed-turn, fatal-response and shop-door owners', () => {
  const mutations = [
    ['js/allmain.js', 'export async function finishHeroTimeEffects(state = game, env = {}) {', 'export async function finishHeroTimeEffects(state = game, env = {}) {\n    await sink_into_lava(state);'],
    ['js/monmove.js', '    await m_respond(monster, env);', '    await m_respond(monster, env);\n    if (state.program_state?.gameover) return 1;'],
    ['js/shknam.js', 'doorLoc.doormask === D_NODOOR', '(doorLoc.flags || doorLoc.doormask) === D_NODOOR'],
  ];
  for (const [path, before, after] of mutations) {
    assert.ok(currentSource(path).includes(before), `mutation applies: ${path}`);
    assert.throws(() => assertWindowBoundaries(candidatePath => candidatePath === path
      ? currentSource(path).replace(before, after) : currentSource(candidatePath)), {name:'AssertionError'});
  }
  // Unrelated source edits do not rewrite historical evidence; current snapshot
  // pinning above still requires an explicit new audit before adopting them.
  assert.doesNotThrow(() => assertWindowBoundaries(path => path === 'js/allmain.js'
    ? `${currentSource(path)}\n// unrelated trailing comment\n` : currentSource(path)));
  assert.throws(() => boundedSource('absent', 'start', 'end'), {name:'AssertionError'});
  assert.throws(() => boundedSource('start start end', 'start', 'end'), {name:'AssertionError'});
});
