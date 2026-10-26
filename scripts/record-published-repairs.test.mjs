import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseRepairMembers, preparePublishedRepairs } from './record-published-repairs.mjs';

const baseline = 'a'.repeat(40), source1 = 'b'.repeat(40), source2 = 'c'.repeat(40);
const commit = 'd'.repeat(40), at = '2026-10-26T04:00:00Z';
const members = [{ id: 'repair-one', sourceCommit: source1 },
  { id: 'repair-two', sourceCommit: source2 }];
const run = (id, name, branch) => ({ id, name, head_sha: commit,
  run_attempt: 1, event: 'push', head_branch: branch, status: 'completed',
  conclusion: 'success', created_at: '2026-10-26T03:00:00Z',
  updated_at: at, html_url: `https://github.com/vtjeng/teleport-contest/actions/runs/${id}` });
const checkpointRun = run(10, 'Checkpoint', 'integration-checkpoint/group');
const publicationRuns = [run(11, 'Lint', 'main'), run(12, 'Dashboard', 'main')];
const publication = { commit, passed: true, workflows: [
  { workflow: '.github/workflows/lint.yml', id: 11, status: 'completed', conclusion: 'success' },
  { workflow: '.github/workflows/dashboard.yml', id: 12, status: 'completed', conclusion: 'success' },
] };
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'published-repairs-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  mkdirSync(join(root, 'trial-monitor'));
  const path = join(root, 'trial-monitor/repairs.json');
  const register = { version: 1, asOf: '2026-10-26T02:00:00Z', repairs: [
    { id: 'repair-one', window: 'single-worker', candidates: [] },
    { id: 'repair-two', window: 'post-trial', candidates: [] },
    { id: 'older-single', window: 'baseline', candidates: [{ sha: baseline, runs: [] }] },
  ] };
  writeFileSync(path, JSON.stringify(register, null, 2) + '\n');
  return { root, path, register };
}
const git = args => {
  if (args[0] === 'merge-base') return '';
  if (args[0] === 'show') return at;
  throw new Error('unexpected Git command');
};
const prepare = (root, overrides = {}) => preparePublishedRepairs(root, {
  commit, baseline, members, publication, publicationRuns, checkpointRun,
  checkpointCompletedAt: at, git, ...overrides,
});

test('explicit members have unique IDs and full source commits', () => {
  assert.deepEqual(parseRepairMembers(`repair-one:${source1},repair-two:${source2}`), members);
  for (const text of ['', `repair-one:${source1},repair-one:${source2}`,
    `repair-one:${source1},repair-two:${source1}`, 'repair-one:short',
    `repair-one:${source1}:extra`]) assert.throws(() => parseRepairMembers(text));
});

test('records one shared exact-SHA group, preserves old records, and retries without changes', t => {
  const { root, path, register } = fixture(t);
  const first = prepare(root)();
  assert.deepEqual(first, { changed: true, members: 2 });
  const saved = readFileSync(path, 'utf8');
  const after = JSON.parse(saved);
  assert.deepEqual(after.repairs[2], register.repairs[2]);
  assert.equal(after.asOf, at);
  for (const [index, member] of members.entries()) {
    const candidate = after.repairs[index].candidates[0];
    assert.equal(candidate.sha, commit);
    assert.equal(candidate.sourceCommit, member.sourceCommit);
    assert.deepEqual(candidate.runs.map(item => item.name), ['Checkpoint', 'Lint', 'Dashboard']);
    assert.ok(candidate.runs.every(item => item.sha === commit && item.conclusion === 'success'));
  }
  assert.deepEqual(prepare(root)(), { changed: false, members: 2 });
  assert.equal(readFileSync(path, 'utf8'), saved);
});

test('rejects missing, failed, wrong-SHA and stale run evidence before changing register', t => {
  const { root, path } = fixture(t), original = readFileSync(path, 'utf8');
  const cases = [
    { publicationRuns: publicationRuns.slice(0, 1) },
    { publicationRuns: publicationRuns.map((item, i) => i ? { ...item, conclusion: 'failure' } : item) },
    { publicationRuns: publicationRuns.map((item, i) => i ? { ...item, head_sha: baseline } : item) },
    { checkpointRun: { ...checkpointRun, updated_at: '2026-10-26T03:59:00Z' } },
    { publication: { ...publication, passed: false } },
  ];
  for (const changes of cases) {
    assert.throws(() => prepare(root, changes));
    assert.equal(readFileSync(path, 'utf8'), original);
  }
});

test('rejects unknown members, stale source ancestry, conflicting records and concurrent edits', t => {
  const { root, path } = fixture(t), original = readFileSync(path, 'utf8');
  assert.throws(() => prepare(root, { members: [{ id: 'absent', sourceCommit: source1 }] }), /Unknown/);
  assert.throws(() => prepare(root, { members: [{ id: 'repair-one', sourceCommit: baseline }] }),
    /must follow the accepted baseline/);
  assert.throws(() => prepare(root, { git: args => {
    if (args[0] === 'merge-base') throw new Error('source is not an ancestor');
    return at;
  } }), /not an ancestor/);
  const register = JSON.parse(original);
  register.repairs[0].candidates.push({ sha: commit, runs: [] });
  writeFileSync(path, JSON.stringify(register, null, 2) + '\n');
  assert.throws(() => prepare(root), /Conflicting existing candidate/);
  writeFileSync(path, original);
  const write = prepare(root);
  writeFileSync(path, original + ' ');
  assert.throws(write, /changed during publication/);
});
