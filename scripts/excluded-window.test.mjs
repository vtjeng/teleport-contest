// Guards on the excluded gameplay window 736b8cd04..15ed31f2d.
//
// Vincent's rule: no code from the commits in that window may return to the
// game, whether by cherry-picking or copying part of it. The behaviour those
// commits changed may be ported again from the C source.
// "game code must not copy the excluded commits" enforces the rule. The other
// tests pin the historical restoration audits (experiments/restoration/,
// experiments/backlog-terminal-lava/) to the commits they reviewed; they read
// only past commits and never the current tree.
// trial-monitor/restoration-context.json is the former
// trial-monitor/dashboard-restoration.json.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import test from 'node:test';

import {assertExceptionCount} from './exception-count.mjs';

const read = path => readFileSync(new URL(`../trial-monitor/${path}`, import.meta.url), 'utf8');
const context = JSON.parse(read('restoration-context.json'));
const root = new URL('../', import.meta.url);
const git = (...args) => execFileSync('git', args, {cwd:root, encoding:'utf8', maxBuffer:1 << 28});
const sourceAt = (commit, path) => git('show', `${commit}:${path}`);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const currentSource = path => readFileSync(new URL(path, root), 'utf8');

// The window runs from the commit after WINDOW_BASE through WINDOW_TIP.
const WINDOW_BASE = '736b8cd0424817ab9838e29b7ffb7e04228a354b';
const WINDOW_TIP = '15ed31f2d2a765d68c8377f8360f4475d9476ac7';
// Four consecutive window lines in one file count as a copy. Three-line runs
// matched the C tables that every port writes identically (three GFILTER_*
// rows, three GPCOORDS_* rows); the window's own tip still has 12 runs of
// four or more, so the check still finds partial copies.
const COPY_RUN = 4;

const normalize = line => line.trim().replace(/\s+/gu, ' ');
// Blank lines and short punctuation lines ("} else {", "});") separate no
// runs and join none.
const significant = line => line.length >= 8 && /[A-Za-z0-9]/u.test(line);

// Lines the window added that no js/ file contained before it. A line the
// window moved, or one the codebase already used elsewhere (menu boilerplate,
// common calls), is not evidence of copying.
function windowLines() {
  const jsFiles = git('ls-tree', '-r', '--name-only', WINDOW_BASE, '--', 'js/')
    .trim().split('\n').filter(path => path.endsWith('.js'));
  const before = new Set(git('show', ...jsFiles.map(path => `${WINDOW_BASE}:${path}`))
    .split('\n').map(normalize));
  const added = new Set();
  for (const line of git('diff', '-U0', WINDOW_BASE, WINDOW_TIP, '--', 'js/').split('\n')) {
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    const text = normalize(line.slice(1));
    if (significant(text) && !before.has(text)) added.add(text);
  }
  return added;
}

// Runs of at least COPY_RUN consecutive significant lines that are all window
// lines, as {path, first, last, text}. Line numbers are one-based.
function copiedRuns(sources, added) {
  const runs = [];
  for (const [path, source] of sources) {
    let run = [];
    const flush = () => {
      if (run.length >= COPY_RUN)
        runs.push({path, first:run[0].number, last:run.at(-1).number, text:run.map(line => line.text).join('\n')});
      run = [];
    };
    source.split('\n').forEach((raw, index) => {
      const text = normalize(raw);
      if (!significant(text)) return;
      if (added.has(text)) run.push({text, number:index + 1});
      else flush();
    });
    flush();
  }
  return runs;
}

// Runs reviewed and found to be independent ports from the C source. Each
// entry names the file, the sha256 of the run's normalized text (as the
// failure message prints it), and why the match is forced. Add an entry only
// after comparing the run with the window's version and with the C source.
const REVIEWED_RUNS = [
  {
    // OPTION_HANDLERS rows "sortloot: handler_sortloot," through
    // "whatis_filter: handler_whatis_filter,". Each row pairs an option name
    // with the handler named after its options.c function, as AGENTS.md
    // requires. Ported fresh from options.c 6124-6319 in alphabetical
    // order with sortdiscoveries between them; the window put whatis_filter
    // before whatis_coord elsewhere in the table. Reviewed 2026-10-31.
    path:'js/options.js',
    sha256:'34fd4717288eb9bac53a1f29d5e79788bd99ca6cfe0a0acc8c8d72db720f1ac6',
  },
];

const reviewed = run => REVIEWED_RUNS.some(entry => entry.path === run.path && entry.sha256 === digest(run.text));
const describe = run => `${run.path}:${run.first}-${run.last} sha256 ${digest(run.text)}\n${run.text}`;

test('game code must not copy the excluded commits', () => {
  const added = windowLines();
  const paths = git('ls-files', '--', 'js/').trim().split('\n').filter(path => path.endsWith('.js'));
  const runs = copiedRuns(paths.map(path => [path, currentSource(path)]), added);
  assert.deepEqual(runs.filter(run => !reviewed(run)).map(describe), []);
  // On 9f7e42e6 (8 November 2026): 1 REVIEWED_RUNS entry, matching 1 run.
  const PINS = {entries:1, runs:1};
  assertExceptionCount(REVIEWED_RUNS.length, PINS.entries,
    {what:'REVIEWED_RUNS entries', pin:'PINS.entries in scripts/excluded-window.test.mjs'});
  assertExceptionCount(runs.filter(reviewed).length, PINS.runs,
    {what:'copied runs that REVIEWED_RUNS excuses', pin:'PINS.runs in scripts/excluded-window.test.mjs'});
});

test('copied-run check finds the window and ignores code shared with the base', () => {
  const added = windowLines();
  // The window's tip holds every window line, so the check must flag it.
  const tipPaths = git('diff', '--name-only', WINDOW_BASE, WINDOW_TIP, '--', 'js/').trim().split('\n');
  const tipRuns = copiedRuns(tipPaths.map(path => [path, sourceAt(WINDOW_TIP, path)]), added);
  assert.ok(tipRuns.length >= 12, `window tip runs: ${tipRuns.length}`);
  // The base predates the window, so none of its lines are window lines.
  assert.deepEqual(copiedRuns(tipPaths.map(path => [path, sourceAt(WINDOW_BASE, path)]), added), []);
  // A single copied run pasted into an unrelated file is found there.
  const [first] = tipRuns;
  const pasted = copiedRuns([['js/example.js', `const a = 1;\n${first.text}\n`]], added);
  assert.deepEqual(pasted.map(run => [run.first, run.text]), [[2, first.text]]);
  // One line short of COPY_RUN is not a copy.
  const short = first.text.split('\n').slice(0, COPY_RUN - 1).join('\n');
  assert.deepEqual(copiedRuns([['js/example.js', short]], added), []);
  // An unrelated line between window lines breaks the run.
  const split = first.text.split('\n');
  split.splice(2, 0, 'const unrelatedLineBreaksTheRun = true;');
  assert.ok(copiedRuns([['js/example.js', split.join('\n')]], added).every(run => run.text !== first.text));
});

test('frozen evidence remains byte-pinned and historical outcomes keep source revisions', () => {
  const bytes = read('evidence.json');
  assert.equal(digest(bytes), context.evidenceSha256);
  const evidence = JSON.parse(bytes);
  assert.ok(evidence.sources.length > 0);
  assert.ok(evidence.sources.every(source => /^[a-f0-9]{40}$/u.test(source.ref)));
  assert.ok(evidence.cohorts.every(cohort => /^[a-f0-9]{40}$/u.test(cohort.scanBase)));
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

test('recovery19 separately pins its reviewed runtime', () => {
  assert.equal(git('rev-parse', `${currentAudit.candidate}^{tree}`).trim(), currentAudit.tree);
  for (const [path, expected] of Object.entries(currentAudit.gameplayPathHashes)) {
    assert.equal(digest(sourceAt(currentAudit.candidate, path)), expected, `reviewed ${path}`);
  }
  const changed = git('diff', '--name-only', currentAudit.historicalAuditCommit, currentAudit.candidate, '--', 'js/').trim().split('\n').sort();
  assert.deepEqual(changed, [...currentAudit.runtimePaths].sort());
  for (const path of currentAudit.otherModulesUnchangedAcrossWindow) {
    assert.equal(sourceAt(currentAudit.goodCommit, path), sourceAt(currentAudit.badCommit, path), path);
  }
});

for (const name of ['six', 'twelve', 'thirteen', 'fourteen', 'fourteen-revised'])
test(`post53 ${name}-component review pins its runtime without rewriting history`, () => {
  const audit = JSON.parse(readFileSync(new URL(`../experiments/restoration/post53-${name}-window-audit-20261030.json`, import.meta.url), 'utf8'));
  assert.equal(git('rev-parse', `${audit.candidate}^{tree}`).trim(), audit.tree);
  const changed = git('diff', '--name-only', audit.base, audit.candidate, '--', 'js/').trim().split('\n').sort();
  assert.deepEqual(changed, [...audit.runtimePaths].sort());
  for (const [path, expected] of Object.entries(audit.gameplayPathHashes))
    assert.equal(digest(sourceAt(audit.candidate, path)), expected, `post53 reviewed ${path}`);
  for (const path of audit.otherModulesUnchangedAcrossWindow)
    assert.equal(sourceAt(audit.goodCommit, path), sourceAt(audit.badCommit, path), path);
  const windowPaths = git('diff', '--name-only', audit.goodCommit, audit.badCommit, '--', 'js/').trim().split('\n');
  assert.deepEqual(windowPaths.filter(path => changed.includes(path)), audit.windowOverlap);
  for (const path of windowPaths.filter(path => !audit.windowOverlap.includes(path)))
    assert.equal(sourceAt(audit.candidate, path), sourceAt(audit.base, path), `reviewed unchanged window owner ${path}`);
});

test('terminal and mounted-entry review pins its reviewed runtime', () => {
  const audit = JSON.parse(readFileSync(new URL('../experiments/backlog-terminal-lava/window-audit.json', import.meta.url), 'utf8'));
  for (const [path, hash] of Object.entries(audit.currentPathHashes))
    assert.equal(digest(sourceAt(audit.runtimeCommit, path)), hash, `reviewed ${path}`);
  const changed = git('diff', '--name-only', audit.base, audit.runtimeCommit, '--', 'js/').trim().split('\n').sort();
  assert.deepEqual(changed, audit.runtimePaths);
});
