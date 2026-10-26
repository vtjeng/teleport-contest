import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createTrialMonitor } from './trial-monitor.mjs';

const savedManifest = JSON.parse(readFileSync(new URL(
  '../trial-monitor/manifest.json', import.meta.url,
), 'utf8'));
const savedRegister = JSON.parse(readFileSync(new URL(
  '../trial-monitor/repairs.json', import.meta.url,
), 'utf8'));
const sha = letter => letter.repeat(40);
const copy = value => structuredClone(value);
const snapshot = (manifest = copy(savedManifest), register = copy(savedRegister)) =>
  ({ manifest, register, builtAt: '2026-10-21T17:20:00Z', buildSha: sha('f') });

function run(name, candidateSha, completedAt, extras = {}) {
  const id = extras.id ?? 100 + ['Checkpoint', 'Lint', 'Dashboard'].indexOf(name);
  return {
    id, name, sha: candidateSha, attempt: extras.attempt ?? 1,
    event: extras.event ?? 'push',
    branch: extras.branch ?? (name === 'Checkpoint'
      ? 'integration-checkpoint/trial-test' : 'main'),
    status: extras.status ?? 'completed', conclusion: extras.conclusion ?? 'success',
    createdAt: extras.createdAt ?? completedAt, completedAt,
    url: `https://github.com/vtjeng/teleport-contest/actions/runs/${id}`,
  };
}
function repair(id, candidateSha, runs, extras = {}) {
  return {
    id, kind: extras.kind ?? 'parity-repair', title: id, window: extras.window ?? 'trial',
    origin: 'investigator-A', investigator: 'A', carryIn: extras.carryIn ?? false,
    evidence: { source: ['js/example.js'], witness: ['recipes/example.json'],
      test: ['scripts/example.test.mjs'] },
    candidates: [{ sha: candidateSha, startedAt: extras.startedAt
      ?? '2026-10-22T00:05:00Z', runs }],
  };
}
function running(repairs, extras = {}) {
  const manifest = copy(savedManifest);
  manifest.trial = {
    status: 'running', plannedHours: 4, start: '2026-10-22T00:00:00Z',
    end: null, coverage: extras.coverage ?? 'complete', interruptions: [],
  };
  manifest.operations = {
    currentCandidate: extras.currentCandidate ?? null,
    investigators: extras.investigators ?? [{ id: 'A', status: 'working' }],
    waitingHandoffs: extras.waitingHandoffs ?? [],
    asOf: '2026-10-22T00:10:00Z',
  };
  return snapshot(manifest, { version: 1, asOf: manifest.operations.asOf, repairs });
}

test('audited baseline is 13 unique closures in four wall hours with one carry-in', () => {
  const view = createTrialMonitor(snapshot()).summarize('2026-10-21T17:30:00Z');
  assert.equal(view.baseline.acceptedCount, 13);
  assert.equal(view.baseline.carryInCount, 1);
  assert.equal(view.baseline.rate, 3.25);
  assert.equal(view.baseline.withoutCarryInRate, 3);
  assert.equal(view.trial.status, 'not-started');
  assert.equal(view.trial.elapsedHours, null);
  assert.equal(view.trial.rate, null);
  assert.equal(view.investigators, null);
  assert.equal(view.waitingHandoffs, null);
});

test('stable ID counts one correction, preserves retries and uses last required gate time', () => {
  const candidateSha = sha('a');
  const attempts = [
    run('Checkpoint', candidateSha, '2026-10-22T00:10:00Z', {
      id: 201, conclusion: 'cancelled',
    }),
    run('Checkpoint', candidateSha, '2026-10-22T00:20:00Z', {
      id: 202, attempt: 2, event: 'workflow_dispatch',
    }),
    run('Lint', candidateSha, '2026-10-22T00:30:00Z', { id: 203 }),
    run('Dashboard', candidateSha, '2026-10-22T00:50:00Z', { id: 204 }),
  ];
  const fixed = repair('same-repair', candidateSha, attempts, {
    startedAt: '2026-10-21T23:55:00Z',
  });
  fixed.candidates.push({
    sha: sha('b'), startedAt: '2026-10-22T01:10:00Z',
    runs: ['Checkpoint', 'Lint', 'Dashboard'].map((name, index) =>
      run(name, sha('b'), `2026-10-22T01:2${index}:00Z`, { id: 300 + index })),
  });
  const view = createTrialMonitor(running([fixed])).summarize('2026-10-22T02:00:00Z');
  assert.equal(view.trial.acceptedCount, 1);
  assert.equal(view.trial.carryInCount, 1);
  assert.equal(view.trial.rate, 0.5);
  assert.equal(view.results[0].accepted.closureAt, '2026-10-22T00:50:00.000Z');
  assert.equal(view.results[0].candidates[0].gates.Checkpoint.runs.length, 2);
});

test('one exact-SHA group counts each repair and its elapsed wall rate once', () => {
  const groupSha = sha('a');
  const runs = ['Checkpoint', 'Lint', 'Dashboard'].map((name, index) =>
    run(name, groupSha, `2026-10-22T00:${20 + index * 5}:00Z`, { id: 500 + index }));
  const repairs = ['first', 'second', 'third'].map((id, index) => {
    const row = repair(id, groupSha, copy(runs), { window: 'post-trial' });
    row.candidates[0].committedAt = '2026-10-22T00:10:00Z';
    row.candidates[0].sourceCommit = sha(String(index + 1));
    row.candidates[0].sourceCommittedAt = `2026-10-22T00:0${index}:00Z`;
    return row;
  });
  const view = createTrialMonitor(running(repairs)).summarize('2026-10-22T01:00:00Z');
  assert.equal(view.currentCandidate.sha, groupSha);
  assert.equal(view.currentCandidate.groupSize, 3);
  assert.equal(view.currentCandidate.state, 'completed');
  assert.equal(view.selection.status, 'selected');
  assert.equal(view.recentProgress.groupCount, 1);
  assert.equal(view.recentProgress.repairCount, 3);
  assert.equal(view.recentProgress.start, '2026-10-22T00:00:00.000Z');
  assert.equal(view.recentProgress.end, '2026-10-22T00:30:00.000Z');
  assert.equal(view.recentProgress.rate, 6);
  assert.equal(view.results.filter(result => result.accepted).length, 3);

  repairs.push({ id: 'newer-unrecorded', kind: 'parity-repair', window: 'post-trial',
    title: 'Newer repair', evidence: { source: ['js/example.js'], witness: ['example'],
      test: ['scripts/example.test.mjs'] }, candidates: [],
    investigations: [{ start: '2026-10-22T00:41:00Z', end: '2026-10-22T00:42:00Z' }] });
  const newer = createTrialMonitor(running(repairs)).summarize('2026-10-22T01:00:00Z');
  assert.equal(newer.selection.unrecordedNewerCount, 1);
  repairs.pop();

  repairs[1].candidates[0].runs.find(item => item.name === 'Dashboard').conclusion = 'failure';
  const failed = createTrialMonitor(running(repairs)).summarize('2026-10-22T01:00:00Z');
  assert.equal(failed.currentCandidate.state, 'pending');
  assert.equal(failed.results.filter(result => result.accepted).length, 0,
    'partial group evidence cannot accept the other members');
  assert.equal(failed.recentProgress.groupCount, 0);
});

test('a revalidated correction shares CI without becoming another accepted repair', () => {
  const oldSha = sha('a'), groupSha = sha('b');
  const runs = candidateSha => ['Checkpoint', 'Lint', 'Dashboard'].map((name, index) =>
    run(name, candidateSha, (candidateSha === oldSha
      ? ['2026-10-22T00:10:00Z', '2026-10-22T00:15:00Z', '2026-10-22T00:20:00Z']
      : ['2026-10-22T00:50:00Z', '2026-10-22T00:55:00Z', '2026-10-22T01:00:00Z'])[index],
    { id: (candidateSha === oldSha ? 600 : 610) + index }));
  const corrected = repair('already-accepted', oldSha, runs(oldSha), { window: 'post-trial' });
  corrected.candidates.push({ sha: groupSha, committedAt: '2026-10-22T00:40:00Z',
    runs: runs(groupSha) });
  const newRepair = repair('new-repair', groupSha, runs(groupSha), { window: 'post-trial' });
  newRepair.candidates[0].committedAt = '2026-10-22T00:40:00Z';
  const view = createTrialMonitor(running([corrected, newRepair])).summarize();
  assert.equal(view.results.filter(result => result.accepted).length, 2);
  assert.equal(view.recentProgress.groupCount, 2);
  assert.equal(view.recentProgress.repairCount, 2, 'the correction is not a third acceptance');
});

test('non-repairs, wrong SHA, manual Dashboard, and missing gates never count', () => {
  const validSha = sha('a');
  const passed = ['Checkpoint', 'Lint', 'Dashboard'].map(name =>
    run(name, validSha, '2026-10-22T00:30:00Z'));
  const dashboard = repair('dashboard-only', validSha, passed, { kind: 'dashboard' });
  const mismatch = repair('wrong-sha', validSha, [
    run('Checkpoint', sha('b'), '2026-10-22T00:10:00Z'),
    ...passed.slice(1),
  ]);
  const manual = repair('manual-dashboard', validSha, [
    ...passed.slice(0, 2), run('Dashboard', validSha, '2026-10-22T00:40:00Z',
      { event: 'workflow_dispatch' }),
  ]);
  const missing = repair('missing-dashboard', validSha, passed.slice(0, 2));
  const view = createTrialMonitor(running([dashboard, mismatch, manual, missing]))
    .summarize('2026-10-22T01:00:00Z');
  assert.equal(view.trial.acceptedCount, 0);
  assert.equal(view.results[1].candidates[0].gates.Checkpoint.status, 'wrong-sha');
  assert.equal(view.results[2].candidates[0].gates.Dashboard.status, 'wrong-trigger');
  assert.equal(view.results[3].candidates[0].gates.Dashboard.status, 'missing');
});

test('window cutoff, carry-in, zero elapsed, and missing coverage remain explicit', () => {
  const candidateSha = sha('a');
  const times = ['2026-10-22T00:10:00Z', '2026-10-22T00:11:00Z',
    '2026-10-22T04:00:00Z'];
  const exactCutoff = repair('at-cutoff', candidateSha,
    ['Checkpoint', 'Lint', 'Dashboard'].map((name, index) =>
      run(name, candidateSha, times[index])));
  const atStart = createTrialMonitor(running([exactCutoff]))
    .summarize('2026-10-22T00:00:00Z');
  assert.equal(atStart.trial.elapsedHours, 0);
  assert.equal(atStart.trial.rate, null);
  const atEnd = createTrialMonitor(running([exactCutoff]))
    .summarize('2026-10-22T04:00:00Z');
  assert.equal(atEnd.trial.acceptedCount, 0);
  const unknown = createTrialMonitor(running([exactCutoff], { coverage: 'unknown' }))
    .summarize('2026-10-22T02:00:00Z');
  assert.equal(unknown.trial.acceptedCount, null);
  assert.equal(unknown.trial.rate, null);
});

test('window boundaries compare instants across equivalent ISO formats', () => {
  const atStart = repair('start-boundary', sha('a'),
    ['Checkpoint', 'Lint', 'Dashboard'].map(name =>
      run(name, sha('a'), '2026-10-21T11:50:00Z')),
    { window: 'baseline', startedAt: '2026-10-21T11:49:00Z' });
  const atEnd = repair('end-boundary', sha('b'),
    ['Checkpoint', 'Lint', 'Dashboard'].map(name =>
      run(name, sha('b'), '2026-10-21T15:50:00Z')),
    { window: 'baseline', startedAt: '2026-10-21T15:49:00Z' });
  const manifest = copy(savedManifest);
  const register = { version: 1, asOf: manifest.asOf, repairs: [atStart, atEnd] };
  const view = createTrialMonitor(snapshot(manifest, register))
    .summarize('2026-10-21T17:30:00Z');
  assert.equal(view.results[0].accepted.closureAt, '2026-10-21T11:50:00.000Z');
  assert.equal(view.results[1].accepted.closureAt, '2026-10-21T15:50:00.000Z');
  assert.equal(view.baseline.acceptedCount, 1);
  assert.equal(view.baseline.carryInCount, 1);
  const startOnly = createTrialMonitor(snapshot(manifest,
    { ...register, repairs: [atStart] })).summarize('2026-10-21T17:30:00Z');
  const endOnly = createTrialMonitor(snapshot(manifest,
    { ...register, repairs: [atEnd] })).summarize('2026-10-21T17:30:00Z');
  assert.equal(startOnly.baseline.acceptedCount, 1);
  assert.equal(endOnly.baseline.acceptedCount, 0);
});

test('public refresh keeps last-known snapshot on fetch failure', async () => {
  const calls = [];
  const monitor = createTrialMonitor(snapshot(), {
    fetchPublic: async (url, init) => {
      calls.push({ url, init });
      throw new Error('offline');
    },
  });
  const view = await monitor.refresh();
  assert.equal(view.baseline.acceptedCount, 13);
  assert.equal(view.trial.status, 'not-started');
  assert.equal(view.api.status, 'failed');
  assert.equal(view.api.checkedAt, null);
  assert.match(view.api.error, /offline/u);
  assert.equal(calls.length, 1);
  assert.ok(calls.every(call => call.init.cache === 'no-store'));
  assert.ok(calls.every(call => !('Authorization' in call.init.headers)));
});

test('public refresh reads Main files and exact job times without credentials', async () => {
  const candidateSha = sha('a');
  const data = running([repair('api-repair', candidateSha, [])], {
    currentCandidate: { repairId: 'api-repair', sha: candidateSha, origin: 'investigator-A' },
  });
  const calls = [];
  const encode = value => ({ encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64') });
  const runs = ['Checkpoint', 'Lint', 'Dashboard'].map((name, index) => ({
    id: 401 + index, name, head_sha: candidateSha, run_attempt: 1,
    event: name === 'Checkpoint' ? 'workflow_dispatch' : 'push',
    head_branch: name === 'Checkpoint' ? 'integration-checkpoint/api-repair' : 'main',
    status: 'completed', conclusion: 'success', created_at: '2026-10-22T00:10:00Z',
  }));
  const monitor = createTrialMonitor(data, {
    now: () => new Date('2026-10-22T01:00:00Z'),
    fetchPublic: async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/commits/main')) return {ok:true, json:async () => ({sha:sha('e')})};
      let payload;
      if (url.includes('/manifest.json?')) payload = encode(data.manifest);
      else if (url.includes('/repairs.json?')) payload = encode(data.register);
      else if (url.includes('/actions/runs?')) payload = { workflow_runs: runs };
      else {
        const id = Number(url.match(/runs\/(\d+)\/jobs/u)?.[1]);
        payload = { total_count: 1, jobs: [{ completed_at: `2026-10-22T00:${id - 390}:00Z` }] };
      }
      return { ok: true, json: async () => payload };
    },
  });
  const view = await monitor.refresh();
  assert.equal(view.api.status, 'fresh');
  assert.equal(view.trial.acceptedCount, 1);
  assert.equal(view.results[0].accepted.closureAt, '2026-10-22T00:13:00.000Z');
  assert.equal(view.currentCandidate.gates.Checkpoint.status, 'passed');
  assert.equal(calls.length, 7);
  assert.ok(calls.every(call => !('Authorization' in call.init.headers)));
});

test('completed trial uses the four-hour cutoff for numerator and denominator', () => {
  const data = running([]);
  data.manifest.trial.status = 'completed';
  data.manifest.trial.end = '2026-10-22T05:00:00Z';
  const view = createTrialMonitor(data).summarize('2026-10-22T06:00:00Z');
  assert.equal(view.trial.elapsedHours, 4);
  assert.equal(view.trial.rate, 0);
});

test('handoff cap rejects two waiting items instead of hiding the excess', () => {
  assert.throws(() => createTrialMonitor(running([], {
    waitingHandoffs: [{ repairId: 'one' }, { repairId: 'two' }],
  })), /cap is one/u);
});

test('dashboard template preserves compact single-column mobile layout', () => {
  const html = readFileSync(new URL('./dashboard.template.html', import.meta.url), 'utf8');
  assert.match(html, /<meta name="viewport" content="width=device-width, initial-scale=1">/u);
  const mobileCss = html.slice(html.lastIndexOf('@media (max-width:600px)'), html.indexOf('</style>'));
  assert.match(mobileCss, /\.trial-tiles,\.trial-details\s*\{\s*grid-template-columns:minmax\(0,1fr\);/u);
  for (const id of ['trialHeadline', 'trialBaselineCount', 'recentRepairs',
    'trialGates', 'trialCandidate', 'trialFreshness', 'trialRefreshStatus']) {
    assert.match(html, new RegExp(`id="${id}"`, 'u'));
  }
});

test('failed required fetch retains the last successful check time and atomic snapshot', async () => {
  const data = snapshot();
  data.manifest.operations.currentCandidate = null;
  let fail = false, now = '2026-10-22T01:00:00Z';
  const monitor = createTrialMonitor(data, {now: () => new Date(now), fetchPublic: async url => {
    if (url.endsWith('/commits/main')) return {ok:true, json:async () => ({sha:sha('e')})};
    if (fail && url.includes('/repairs.json?')) throw new Error('offline');
    const value = url.includes('/manifest.json?') ? data.manifest
      : url.includes('/repairs.json?') ? data.register : null;
    return {ok: true, json: async () => value ? {encoding: 'base64',
      content: Buffer.from(JSON.stringify(value)).toString('base64')} : {workflow_runs: []}};
  }});
  const first = monitor.refresh();
  assert.equal(monitor.refresh(), first, 'concurrent calls share one transaction');
  const success = await first;
  assert.equal(success.api.checkedAt, new Date(now).toISOString());
  fail = true;
  now = '2026-10-22T02:00:00Z';
  data.manifest.asOf = now;
  const failed = await monitor.refresh();
  assert.equal(failed.api.status, 'failed');
  assert.equal(failed.api.checkedAt, success.api.checkedAt);
  assert.equal(failed.manifestAsOf, success.manifestAsOf);
});

test('incomplete job evidence cannot mark a refresh fresh or complete a gate', async () => {
  const candidateSha = sha('a');
  const data = running([repair('incomplete', candidateSha, [])], {
    currentCandidate: {repairId: 'incomplete', sha: candidateSha},
  });
  const monitor = createTrialMonitor(data, {fetchPublic: async url => {
    if (url.endsWith('/commits/main')) return {ok:true, json:async () => ({sha:sha('e')})};
    let payload;
    if (url.includes('/manifest.json?') || url.includes('/repairs.json?')) {
      const value = url.includes('/manifest.json?') ? data.manifest : data.register;
      payload = {encoding: 'base64', content: Buffer.from(JSON.stringify(value)).toString('base64')};
    } else if (url.includes('/jobs?')) {
      payload = {total_count: 2, jobs: [{completed_at: '2026-10-22T00:15:00Z'}]};
    } else {
      payload = {workflow_runs: [{id: 901, name: 'Checkpoint', head_sha: candidateSha,
        run_attempt: 1, event: 'push', head_branch: 'integration-checkpoint/test',
        status: 'completed', conclusion: 'success', created_at: '2026-10-22T00:10:00Z'}]};
    }
    return {ok: true, json: async () => payload};
  }});
  const view = await monitor.refresh();
  assert.equal(view.api.status, 'failed');
  assert.equal(view.api.checkedAt, null);
  assert.match(view.api.error, /incomplete/u);
  assert.equal(view.currentCandidate.gates.Checkpoint.status, 'missing');
});

test('real stale-manifest/new-register records select repair 152 by persisted evidence, not repair 141', () => {
  const data = snapshot();
  data.manifest.operations.currentCandidate = {repairId:'monster-potion-occupant-lifecycle', sha:'b4843ccf9e8b4b1d19d79bbc1b66237cb167da7b'};
  const latest = data.register.repairs.find(repair => repair.candidates.some(c => c.sha === '6dbc9246393ce3b5f31ab3f8cab7009d1dc03eff'));
  const older = data.register.repairs.find(repair => repair.id === data.manifest.operations.currentCandidate.repairId);
  assert.ok(latest && older, 'retained real recording-path evidence');
  data.register.repairs = [latest, older]; // Deliberately out of order.
  data.register.asOf = '2026-10-24T10:00:00Z';
  const view = createTrialMonitor(data).summarize('2026-10-24T10:01:00Z');
  assert.equal(view.currentCandidate.sha, '6dbc9246393ce3b5f31ab3f8cab7009d1dc03eff');
  assert.equal(view.currentCandidate.state, 'completed');
  assert.equal(view.currentCandidate.evidenceAt, '2026-10-23T22:17:50.000Z');
  assert.equal(view.currentCandidate.freshness, 'stale');
  assert.equal(view.selection.legacyPointerMismatch, true);
});

test('ordinary register additions and corrections advance selection without a manifest write', () => {
  const first = repair('old', sha('a'), [], {window:'single-worker'});
  const data = running([first], {currentCandidate:{repairId:'old',sha:sha('a')}});
  const newer = repair('pending', sha('b'), [], {window:'single-worker'});
  newer.candidates[0].committedAt = '2026-10-22T00:20:00Z';
  data.register.repairs.unshift(newer);
  let view = createTrialMonitor(data).summarize('2026-10-22T00:30:00Z');
  assert.equal(view.currentCandidate.sha, sha('b'));
  assert.equal(view.currentCandidate.state, 'pending');
  assert.equal(view.currentCandidate.gates.Checkpoint.status, 'missing');
  newer.candidates.unshift({sha:sha('c'), committedAt:'2026-10-22T00:25:00Z', runs:[]});
  view = createTrialMonitor(data).summarize('2026-10-22T00:30:00Z');
  assert.equal(view.currentCandidate.sha, sha('c'));
  assert.equal(view.currentCandidate.repairId, 'pending');
  assert.equal(view.results.length, 2);
  assert.equal(data.manifest.operations.currentCandidate.sha, sha('a'));
});

test('unknown chronology, conflicting dates, no candidate and future clocks stay explicit', () => {
  const data = running([]);
  assert.equal(createTrialMonitor(data).summarize().selection.status, 'none');
  const undated = repair('undated', sha('a'), []);
  delete undated.candidates[0].startedAt;
  data.register.repairs.push(undated);
  let view = createTrialMonitor(data).summarize();
  assert.equal(view.currentCandidate, null);
  assert.equal(view.selection.status, 'undated');
  const dated = repair('dated', sha('b'), []);
  data.register.repairs.push(dated);
  view = createTrialMonitor(data).summarize('2026-10-21T00:00:00Z');
  assert.equal(view.selection.status, 'partial');
  assert.equal(view.selection.undatedCount, 1);
  assert.equal(view.currentCandidate.freshness, 'clock-ahead');
  data.register.repairs.push(repair('conflict', sha('c'), []));
  view = createTrialMonitor(data).summarize();
  assert.equal(view.currentCandidate, null);
  assert.equal(view.selection.status, 'ambiguous');
});

test('refresh pins files, targets the register candidate and cannot freshen it with unrelated updates', async () => {
  const data = running([repair('old', sha('a'), [])], {currentCandidate:{repairId:'old',sha:sha('a')}});
  const next = repair('new', sha('b'), []);
  next.candidates[0].committedAt = '2026-10-22T01:00:00Z';
  const refreshed = {...data.register, asOf:'2026-10-23T02:00:00Z', repairs:[next,...data.register.repairs]};
  const calls = [], encode = value => ({encoding:'base64',content:Buffer.from(JSON.stringify(value)).toString('base64')});
  let failed = false;
  const monitor = createTrialMonitor(data, {now:()=>new Date('2026-10-23T02:01:00Z'), fetchPublic:async url => {
    calls.push(url);
    if (failed) throw new Error('offline');
    const payload = url.endsWith('/commits/main') ? {sha:sha('e')}
      : url.includes('/manifest.json?') ? encode(data.manifest)
        : url.includes('/repairs.json?') ? encode(refreshed) : {workflow_runs:[]};
    return {ok:true,json:async()=>payload};
  }});
  const fresh = await monitor.refresh();
  assert.equal(fresh.currentCandidate.sha, sha('b'));
  assert.equal(fresh.currentCandidate.freshness, 'stale');
  assert.equal(fresh.api.status, 'fresh');
  assert.equal(fresh.sourceSha, sha('e'));
  assert.ok(calls.filter(url=>url.includes('/contents/')).every(url=>url.endsWith('?ref='+sha('e'))));
  assert.ok(calls.some(url=>url.includes('head_sha='+sha('b'))));
  assert.ok(!calls.some(url=>url.includes('head_sha='+sha('a'))));
  failed = true;
  const offline = await monitor.refresh();
  assert.equal(offline.api.status, 'failed');
  assert.equal(offline.api.checkedAt, fresh.api.checkedAt);
  assert.equal(offline.currentCandidate.evidenceAt, fresh.currentCandidate.evidenceAt);
  assert.equal(offline.currentCandidate.freshness, 'stale');
});
