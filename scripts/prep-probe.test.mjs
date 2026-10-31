import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import {createLedger, nextActions, recordEvent, summarizeLedger} from './worker-state.mjs';

const ROOT = '/tmp/prep-probe-fixture';
const BASE = 'a'.repeat(40); // Synthetic transport commit, not gameplay data.
const DELIVERY = 'b'.repeat(40); // A parent delivery distinct from the base.
const at = minute => new Date(Date.UTC(2026, 9, 15, 10, minute)).toISOString();

function fixture() {
  let ledger = createLedger('loop-20261015', ROOT, at(0)), sequence = 0;
  const send = (event, minute = sequence) => {
    ledger = recordEvent(ledger, {id: `event-${++sequence}`, ...event}, at(minute));
    return summarizeLedger(ledger);
  };
  // Preserve the ledger's historical role capacity independently of the host
  // thread budget. This fixture launches no agents; probes are not Main deliveries.
  for (const worker of ['A', 'B', 'C', 'Prep']) send({type: 'register', worker,
    worktree: `${ROOT}/${worker}`, branch: `worker/${worker}`, base: BASE, handle: `private-${worker}`}, 0);
  send({type: 'assign', task: 'Prep47', worker: 'Prep', kind: 'challenge-preparation',
    seed: null, base: BASE, reservations: ['challenge-batch:v83'], allowedPaths: ['challenges/cases/v83/']}, 0);
  const probe = (n, patch = {}) => ({type: 'prep-probe', task: 'Prep47', probe: `v83-probe-${n}`,
    worker: `Prep-${n}`, state: 'active', summary: `Investigating C target ${n}.`,
    processes: [], recording: false, worktree: `${ROOT}/lane-${n}`, branch: `prep/lane-${n}`,
    handle: `private-lane-${n}`, source: `fixture.c:target${n}`, ...patch});
  const ready = () => send({type: 'ready', task: 'Prep47', delivery: DELIVERY,
    base: BASE, commits: [DELIVERY], paths: ['challenges/cases/v83/case.recipe.json'],
    evidence: `${ROOT}/packet.json`, dependencies: []});
  return {send, probe, ready, ledger: () => ledger, state: () => summarizeLedger(ledger)};
}

test('six Prep lanes coexist with A/B/C and produce only one Main delivery', () => {
  const f = fixture();
  for (let n = 1; n <= 6; n++) f.send(f.probe(n)); // Schema coverage, not a live allocation.
  assert.equal(Object.keys(f.state().workers).length, 4);
  assert.equal(Object.keys(f.state().probes).length, 6);
  assert.equal(Object.keys(f.state().tasks).length, 1);
  assert.equal(nextActions(f.state()).preparationProbes.length, 6);
  assert.throws(() => f.send(f.probe(7)), /Prep-1 through Prep-6/u);
  assert.throws(f.ready, /finish outstanding/u);
  assert.throws(() => f.send({type: 'park', task: 'Prep47', reason: 'Pause parent.'}), /finish outstanding/u);
  for (let n = 1; n <= 6; n++) f.send(f.probe(n, {state: 'done', outcome: n === 1 ? 'failure' : 'match'}));
  const state = f.ready();
  assert.equal(Object.keys(state.deliveries).length, 1);
  assert.deepEqual(nextActions(state).preparationProbes, []);
});

test('all six Prep lanes can run commands independently while preserving process ownership', () => {
  const f = fixture();
  // Six is the schema's probe-role limit, not a granted live thread allocation.
  for (let n = 1; n <= 6; n++) f.send(f.probe(n, {recording: true, processes: [`session-${n}`]}));
  assert.equal(Object.values(f.state().probes).filter(row => row.recording).length, 6);
  assert.throws(() => f.send(f.probe(1, {processes: ['session-1']})), /retain its handle/u);
  assert.throws(() => f.send(f.probe(1, {recording: true, processes: ['one', 'two']})), /one command/u);
  assert.throws(() => f.send(f.probe(1, {state: 'blocked', recording: true})), /reap commands/u);
  assert.throws(() => f.send(f.probe(1, {state: 'done', outcome: 'failure', processes: ['session-1']})), /retain its handle/u);
  f.send(f.probe(1, {recording: false}));
  assert.equal(Object.values(f.state().probes).filter(row => row.recording).length, 5);
  f.send(f.probe(1, {recording: true, processes: ['next-session']}));
  assert.equal(Object.values(f.state().probes).filter(row => row.recording).length, 6);
});

test('probe ownership, target and outcome cannot silently change', () => {
  const f = fixture();
  f.send(f.probe(1));
  for (const patch of [{worker: 'Prep-2'}, {worktree: `${ROOT}/other`}, {source: 'other.c:target'},
    {handle: 'replacement'}, {branch: 'other'}, {outcome: 'failure'}])
    assert.throws(() => f.send(f.probe(1, patch)));
  assert.throws(() => f.send(f.probe(2, {worktree: `${ROOT}/A`})), /private owner/u);
  assert.throws(() => f.send(f.probe(2, {handle: 'private-lane-1'})), /unfinished probe/u);
  assert.throws(() => f.send(f.probe(1, {probe: 'new-probe'})), /unfinished probe/u);
  assert.throws(() => f.send(f.probe(1, {state: 'done'})), /outcome/u);
  f.send(f.probe(1, {state: 'done', outcome: 'deferred'}));
  assert.throws(() => f.send(f.probe(1)), /cannot be reopened/u);
  f.send(f.probe(1, {probe: 'next-probe'})); // A persistent lane can take another target.
});

test('two Prep lanes record a block and separate outcomes', () => {
  const f = fixture();
  f.send(f.probe(1), 1); f.send(f.probe(2), 1);
  f.send(f.probe(1, {state: 'blocked', summary: 'Waiting for source clarification.'}), 2);
  f.send(f.probe(1, {summary: 'Source clarification received.'}), 4);
  f.send(f.probe(1, {state: 'done', outcome: 'failure', summary: 'First mismatch traced to fixture.c.'}), 5);
  f.send(f.probe(2, {state: 'done', outcome: 'match', summary: 'Matched; evidence retained outside manifest.'}), 5);
  const {probes} = f.state();
  assert.deepEqual(['v83-probe-1', 'v83-probe-2'].map(id => probes[id].outcome), ['failure', 'match']);
});

test('a shared thread moves from parked implementation to Prep and back', () => {
  const f = fixture();
  f.send({type: 'assign', task: 'A-fix', worker: 'A', kind: 'implementation', goal: 'fixture-port',
    seed: 'independent-case', base: BASE, reservations: ['source:fixture.c:fix'],
    allowedPaths: ['js/fixture.js']}, 0);
  f.send({type: 'park', task: 'A-fix', reason: 'Handoff saved; prioritizing batch preparation.'}, 2);
  f.send({type: 'turn', worker: 'A', state: 'idle', reason: null, processes: [],
    summary: 'Slot reassigned to Prep exploration.'}, 2);
  f.send({type: 'observe', worker: 'A', handle: null, processes: []}, 3);
  // Preserve A's worktree and history; only the thread moves to a probe worktree.
  f.send(f.probe(1, {handle: 'private-A'}), 3);
  f.send(f.probe(1, {handle: 'private-A', state: 'done', outcome: 'failure',
    summary: 'Evidence returned before resuming implementation.'}), 5);
  f.send({type: 'observe', worker: 'A', handle: 'private-A', processes: []}, 5);
  f.send({type: 'resume', task: 'A-fix'}, 5);
  const state = f.state();
  assert.equal(state.tasks['A-fix'].worker, 'A');
  assert.equal(state.probes['v83-probe-1'].outcome, 'failure');
  assert.equal(state.workers.A.worktree, `${ROOT}/A`);
});

test('actual CLI allows the Prep lead and assigned lane but rejects sibling worktrees and fake ownership', t => {
  const root = mkdtempSync(join(tmpdir(), 'prep-probe-cli-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const git = (...args) => {
    const result = spawnSync('git', ['-C', root, '-c', 'core.hooksPath=/dev/null', ...args], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr); return result.stdout.trim();
  };
  git('init', '-q'); git('config', 'user.name', 'Prep fixture');
  git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(root, 'tracked'), 'fixture\n'); git('add', 'tracked'); git('commit', '-qm', 'fixture');
  const base = git('rev-parse', 'HEAD'), file = join(root, '.cache/ledger.json');
  const paths = Object.fromEntries(['Prep', 'lane', 'sibling'].map(name => {
    const path = join(root, name); git('worktree', 'add', '-qb', `worker/${name}`, path); return [name, path];
  }));
  const script = fileURLToPath(new URL('./worker-state.mjs', import.meta.url));
  const run = (cwd, args) => spawnSync(process.execPath, [script, ...args, '--file', file], {cwd, encoding: 'utf8'});
  const pass = (cwd, args) => {
    const result = run(cwd, args); assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout);
  };
  let sequence = 0;
  const event = (cwd, payload, ok = true) => {
    const args = ['event', '--json', JSON.stringify({id: `cli-${++sequence}`, ...payload})];
    return ok ? pass(cwd, args) : run(cwd, args);
  };
  pass(root, ['init', '--run', 'loop-20261015']);
  event(root, {type: 'register', worker: 'Prep', worktree: paths.Prep, branch: 'worker/Prep', base, handle: 'prep'});
  event(paths.Prep, {type: 'assign', task: 'Prep1', worker: 'Prep', kind: 'challenge-preparation', seed: null,
    base, reservations: ['challenge-batch:v2'], allowedPaths: ['challenges/cases/v2/']});
  const probe = {type: 'prep-probe', task: 'Prep1', probe: 'v2-route', worker: 'Prep-1', state: 'active',
    summary: 'Explore source route.', processes: [], recording: false,
    worktree: paths.lane, branch: 'worker/lane', handle: 'lane', source: 'fixture.c:route'};
  event(paths.Prep, probe);
  const {worktree: _worktree, branch: _branch, handle: _handle, source: _source, ...turn} = probe;
  event(paths.lane, {...turn, state: 'blocked', summary: 'Waiting for source clarification.'});
  const before = readFileSync(file, 'utf8');
  const denied = event(paths.sibling, {...turn, state: 'done', outcome: 'match'}, false);
  assert.equal(denied.status, 1); assert.match(denied.stderr, /registered worker worktree/u);
  assert.equal(readFileSync(file, 'utf8'), before);
  const fake = event(paths.Prep, {...probe, probe: 'v2-fake', worker: 'Prep-2',
    worktree: paths.sibling, branch: 'fake-branch', handle: 'fake'}, false);
  assert.equal(fake.status, 1); assert.match(fake.stderr, /branch does not match/u);
  event(paths.lane, {...turn, state: 'done', outcome: 'match'});
  assert.equal(pass(root, ['status']).probes['v2-route'].outcome, 'match');
});
