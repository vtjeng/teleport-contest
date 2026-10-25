import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseHandoffArgs, publishTask, reviewTask } from './task-handoff.mjs';
import { digest, totalsFor } from './challenge-results.mjs';
import { acceptTask } from './accept-task.mjs';
import { completedSourceUnits } from './port-evidence.mjs';
import { appendRow } from './score-log.mjs';
import { recordEvaluation } from './score-challenges.mjs';
import { writeDashboardSnapshot } from './dashboard-snapshot.mjs';

import { handoffFixture as fixture } from './test-fixtures/task-handoff.mjs';

test('handoff phases reject misspelled, missing, duplicate and irrelevant arguments', () => {
    assert.deepEqual(parseHandoffArgs(['review', '--task', 'A1', '--ledger', 'ledger']),
        { phase: 'review', task: 'A1', ledger: 'ledger' });
    for (const args of [[], ['approve'], ['publish', '--task', 'A1'],
        ['publish', '--task', 'A1', '--ledger', 'ledger', '--baseline', 'summary'],
        ['accept', '--task', 'A1', '--ledger', 'ledger', '--task', 'A2']])
        assert.throws(() => parseHandoffArgs(args), /Usage/);
});

test('saved comparison selects an accepted baseline and exposes per-case loss without writes', t => {
    const f = fixture(t), before = f.git('status', '--porcelain');
    const report = reviewTask(f.options, f.root);
    assert.equal(report.baseline, f.baseline);
    assert.equal(report.candidate, f.candidate);
    assert.equal(report.reviewRequired, false);
    assert.deepEqual(report.next.command, ['node', 'scripts/task-handoff.mjs', 'accept',
        '--task', 'A1', '--ledger', '.cache/ledger.json']);
    const evaluations = join(dirname(f.candidateCheckpoint), 'synthetic');
    assert.deepEqual(reviewTask({ ...f.options, evaluations }, f.root).next.command,
        [...report.next.command, '--evaluations', evaluations], 'acceptance keeps the reviewed artifact directory');
    assert.equal(report.aggregateDelta.screens, 1, 'the candidate gains the second screen');
    assert.equal(f.git('status', '--porcelain'), before);
    const evaluationPath = join(dirname(f.candidateCheckpoint), 'synthetic/v1.json');
    const value = JSON.parse(readFileSync(evaluationPath, 'utf8'));
    // Losing the one accepted boundary must be visible even though the checkpoint passed.
    for (const metric of Object.values(value.cases[0].metrics)) metric.matched = 0;
    value.cases[0].passed = false; value.totals = totalsFor(value.cases);
    writeFileSync(evaluationPath, JSON.stringify(value));
    const loss = reviewTask(f.options, f.root);
    assert.equal(loss.reviewRequired, true);
    assert.equal(loss.next.command, null, 'a regression does not suggest immediate acceptance');
    assert.equal(loss.regressions[0].id, 'case');
    assert.throws(() => reviewTask({ ...f.options, baseline: f.candidateCheckpoint }, f.root), /accepted checkpoint/);
    assert.equal(f.state().tasks.A1.status, 'integrating', 'comparison never accepts a task');
});

test('preparation handoff requests its saved C review without implementation synthetic comparison', t => {
    const f = fixture(t, { preparation: true });
    // Keep the exact integration and passing checkpoint, but model a prep task
    // whose cases have not been admitted and therefore have no synthetic score.
    rmSync(join(dirname(f.candidateCheckpoint), 'synthetic'), { recursive: true });
    const before = f.git('status', '--porcelain');
    const report = reviewTask(f.options, f.root);
    assert.equal(report.preparation, true);
    assert.match(report.next.review, /saved C mission and replay evidence/);
    assert.deepEqual(report.next.command, ['node', 'scripts/task-handoff.mjs', 'accept',
        '--task', 'A1', '--ledger', '.cache/ledger.json']);
    assert.equal(f.git('status', '--porcelain'), before);
    assert.equal(f.state().tasks.A1.status, 'integrating', 'review cannot accept preparation automatically');
});

test('targeted acceptance records its verdict without waking an idle worker', t => {
    const f = fixture(t, { acceptance: true });
    const receipt = acceptTask(f.options, f.root);
    assert.equal(receipt.commit, f.candidate);
    assert.equal(receipt.handoff.action, 'wait', 'acceptance alone does not establish new worker work');
    assert.match(receipt.next, /\.agents\/loop\.md.*Notifications/, 'the receipt points to the notification policy');
    assert.equal(f.state().tasks.A1.status, 'accepted');
    const goal = JSON.parse(readFileSync(join(f.root, 'GOALS.json'), 'utf8')).goals[0];
    assert.equal(goal.status, 'closed', 'a queued task can be accepted without the selection/open-goal ceremony');
    assert.equal(goal.acceptance.basis, 'target-improvement');
    assert.equal(goal.acceptance.baseline, f.baseline);
    assert.equal(goal.workerClaims.functions[0].name, 'fixture');
    assert.equal(goal.evidence, undefined, 'a worker claim is not independent source certification');
    assert.deepEqual(completedSourceUnits(goal), [], 'acceptance must not inflate whole-source completion');
    const before = f.git('status', '--porcelain');
    assert.deepEqual(acceptTask(f.options, f.root), receipt);
    assert.equal(f.git('status', '--porcelain'), before, 'retry does not duplicate imports or records');
});

test('fixed-development targets use the same saved-result acceptance rule', t => {
    const f = fixture(t, { acceptance: true, fixedTarget: true });
    const verdict = reviewTask(f.options, f.root);
    assert.equal(verdict.target, 'fixture-0');
    assert.equal(verdict.targetImproved, true);
    assert.equal(verdict.fixed.changes[0].delta.screens, 1, 'the target gains its second recorded boundary');
    assert.equal(acceptTask(f.options, f.root).commit, f.candidate);
    assert.equal(f.state().tasks.A1.status, 'accepted');
});

test('accepting an earlier delivery preserves the worker\'s current assignment', t => {
    const f = fixture(t, { acceptance: true });
    f.send({ type: 'assign', task: 'A2', worker: 'A', goal: 'A2', seed: null,
        base: f.candidate, reservations: ['source:fixture.c:next'], allowedPaths: ['js/fixture.js'] });
    f.send({ type: 'turn', worker: 'A', state: 'active', reason: null, processes: [] });
    const receipt = acceptTask(f.options, f.root);
    assert.deepEqual(receipt.handoff, { turn: 'active', currentTask: 'A2', action: 'keep-current-task' });
    assert.equal(f.state().tasks.A2.status, 'working', 'acceptance does not replace or park later work');
    assert.equal(f.state().reservations['source:fixture.c:next'].worker, 'A');
});

test('target improvement cannot hide a fixed-session regression or unchanged target', t => {
    const f = fixture(t, { acceptance: true });
    const evaluationPath = join(dirname(f.candidateCheckpoint), 'synthetic/v1.json');
    const originalEvaluation = readFileSync(evaluationPath);
    const evaluation = JSON.parse(originalEvaluation);
    // Equal to the accepted baseline: gains on another session would not fix this target.
    evaluation.cases[0].passed = false;
    for (const metric of Object.values(evaluation.cases[0].metrics)) metric.matched = 1;
    evaluation.totals = totalsFor(evaluation.cases);
    writeFileSync(evaluationPath, JSON.stringify(evaluation));
    assert.throws(() => acceptTask(f.options, f.root), /targetImproved.*false/);
    assert.equal(f.state().tasks.A1.status, 'integrating', 'a rejected verdict must not record validation or acceptance');
    writeFileSync(evaluationPath, originalEvaluation);
    const summary = JSON.parse(readFileSync(f.candidateCheckpoint));
    const path = join(summary.artifacts, 'session-results.json');
    const results = JSON.parse(readFileSync(path));
    // One loss and one gain leave the aggregate unchanged; only per-session comparison catches it.
    results.results[0].metrics.screens.matched = 0;
    results.results[1].metrics.screens.matched = 2;
    const bytes = JSON.stringify(results);
    writeFileSync(path, bytes);
    summary.artifactHashes['session-results.json'] = digest(bytes);
    f.json(`.git/checkpoint-results/${f.candidate}/latest.json`, summary);
    assert.throws(() => acceptTask(f.options, f.root), /fixture-0/);
    assert.equal(f.state().tasks.A1.status, 'integrating');
    assert.equal(f.git('status', '--porcelain'), '', 'failed comparisons write no score or goal reports');
});

test('acceptance requires comparable saved artifacts, not just a green aggregate', t => {
    const f = fixture(t, { acceptance: true });
    const path = join(dirname(f.candidateCheckpoint), 'synthetic/v1.json');
    const evaluation = JSON.parse(readFileSync(path));
    writeFileSync(path, JSON.stringify({ ...evaluation, scorerSha256: digest('another scorer') }));
    assert.throws(() => acceptTask(f.options, f.root), /scorer changed/);
    writeFileSync(path, JSON.stringify(evaluation));
    const summary = JSON.parse(readFileSync(f.candidateCheckpoint));
    f.json(`.git/checkpoint-results/${f.candidate}/latest.json`, { ...summary, artifactHashes: {} });
    assert.throws(() => acceptTask(f.options, f.root), /session results do not belong/);
    f.json(`.git/checkpoint-results/${f.candidate}/latest.json`, summary);
    const report = reviewTask(f.options, f.root);
    assert.equal(report.target, 'synthetic/v1/case');
    assert.equal(report.targetImproved, true);
    assert.equal(report.reviewRequired, false);
    assert.equal(f.git('status', '--porcelain'), '');
});

test('new admissions use their first recorded baseline, but missing accepted artifacts stay missing', t => {
    const f = fixture(t);
    const firstManifest = JSON.parse(readFileSync(join(f.root, 'challenges/manifest.json'), 'utf8'));
    f.json('challenges/manifests/v2.json', { ...firstManifest, batch: 'v2' });
    f.git('add', 'challenges/manifests/v2.json'); f.git('commit', '-qm', 'Admit second batch');
    const admission = f.git('rev-parse', 'HEAD');
    const oldSummary = JSON.parse(readFileSync(f.candidateCheckpoint, 'utf8'));
    const first = JSON.parse(readFileSync(join(oldSummary.artifacts, 'synthetic/v1.json'), 'utf8'));
    const path = 'challenges/evaluations/v2-admission.json';
    const value = { ...first, batch: 'v2', manifestPath: 'challenges/manifests/v2.json', sha: admission };
    f.json(path, value);
    recordEvaluation(f.root, path);
    f.git('add', path, 'SCORE.tsv'); f.git('commit', '-qm', 'Record admission baseline');
    const candidate = f.git('rev-parse', 'HEAD');
    const artifacts = join(f.root, `.git/checkpoint-results/${candidate}/fixture`);
    f.json(`.git/checkpoint-results/${candidate}/fixture/synthetic/v1.json`, { ...first, sha: candidate });
    f.json(`.git/checkpoint-results/${candidate}/fixture/synthetic/v2.json`, { ...value, sha: candidate });
    f.write(`.git/checkpoint-results/${candidate}/fixture/session-results.json`,
        readFileSync(join(oldSummary.artifacts, 'session-results.json')));
    f.json(`.git/checkpoint-results/${candidate}/latest.json`, { ...oldSummary, commit: candidate, artifacts });
    f.send({ type: 'integrating', task: 'A1', integration: candidate });
    const report = reviewTask(f.options, f.root);
    assert.equal(report.reviewRequired, false);
    assert.deepEqual(report.admissionBaselines, [{ batch: 'v2', commit: admission, evaluation: path }]);
    // A corrupt score/artifact link cannot become a trusted admission baseline.
    f.json(path, { ...value, sha: f.baseline });
    assert.throws(() => reviewTask(f.options, f.root), /recorded commit/);
    f.json(path, value);
    // Removing v1's accepted artifact must not silently substitute its older
    // first measurement. The manifest existed at the accepted baseline already.
    const oldPath = join(dirname(f.baselineCheckpoint), 'synthetic/v1.json');
    const old = JSON.parse(readFileSync(oldPath, 'utf8'));
    f.json('challenges/evaluations/v1-history.json', old);
    appendRow({ event: 'challenge', sha: f.baseline, challenge_manifest_sha256: old.manifestSha256,
        challenge_evaluation: 'challenges/evaluations/v1-history.json',
        challenge_sessions_passed: 0, challenge_sessions_total: 1,
        challenge_screens_matched: 1, challenge_screens_total: 2,
        challenge_rng_matched: 1, challenge_rng_total: 2,
        challenge_cursors_matched: 1, challenge_cursors_total: 2 }, join(f.root, 'SCORE.tsv'));
    rmSync(oldPath);
    const missing = reviewTask(f.options, f.root);
    assert.equal(missing.reviewRequired, true);
    assert.ok(missing.issues.some(row => row.batch === 'v1' && row.reason === 'missing evaluation'));
});

test('publication generates reports, checks them before push, records exact remote SHA and returns next work', t => {
    const f = fixture(t);
    assert.throws(() => publishTask(f.options, f.root, f), /accepted work/);
    f.accept();
    f.json('QUALITY.json', {});
    const report = publishTask(f.options, f.root, f);
    assert.equal(f.git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0], report.commit);
    assert.equal(f.state().deliveries[f.candidate].publishedCommit, report.commit);
    assert.equal(f.state().deliveries[f.baseline].publishedCommit, report.commit,
        'one push confirms every earlier accepted delivery it includes');
    assert.equal(f.state().deliveries[f.baseline].publishedAt, undefined,
        'an older missing first-push time is not rewritten as the latest push time');
    assert.equal(f.state().deliveries[f.baseline].publicationKnownBy,
        f.state().deliveries[f.candidate].publishedAt);
    assert.equal(report.next.workers[0].action, 'wait', 'publication alone does not establish new worker work');
    const snapshot = JSON.parse(readFileSync(join(f.root, 'dashboard-snapshot.json'), 'utf8'));
    assert.equal(snapshot.development.executionCommit, f.candidate);
    assert.ok(snapshot.activity.events.some(event => event.type === 'accepted' && event.task === 'A1'));
    assert.match(f.git('show', '-s', '--format=%B', report.commit), /Assisted-by: Codex/);
    const count = f.git('rev-list', '--count', 'HEAD');
    publishTask(f.options, f.root, f); // Published retries only check CI and summarize next work.
    assert.equal(f.git('rev-list', '--count', 'HEAD'), count);
    assert.equal(f.calls.filter(call => call.commit === report.commit).length, 2);
});

test('publication reconciliation previews without writes, applies once, and leaves unmerged work pending', t => {
    const f = fixture(t); f.accept();
    // An accepted side-branch delivery is not included in Main's later push.
    f.git('switch', '-qc', 'unmerged-fixture', f.baseline);
    f.git('commit', '--allow-empty', '-qm', 'Unmerged fixture delivery');
    const unmerged = f.git('rev-parse', 'HEAD');
    f.git('switch', '-q', 'main');
    f.send({ type: 'assign', task: 'A2', worker: 'A', goal: 'A2', seed: null, base: f.baseline,
        reservations: ['source:fixture.c:A2'], allowedPaths: ['js/fixture.js'] });
    f.send({ type: 'ready', task: 'A2', base: f.baseline, delivery: unmerged, commits: [unmerged],
        paths: ['js/fixture.js'], evidence: join(f.root, '.cache/evidence.json'), dependencies: [] });
    f.send({ type: 'integrating', task: 'A2', integration: unmerged });
    f.send({ type: 'validated', task: 'A2', passed: true, checkpoint: f.candidateCheckpoint });
    f.send({ type: 'accepted', task: 'A2' });
    f.git('push', '-q', 'origin', `${f.candidate}:refs/heads/main`);
    f.send({ type: 'published', task: 'A1', commit: f.candidate });
    const script = fileURLToPath(new URL('./worker-state.mjs', import.meta.url));
    const args = [script, 'reconcile-publications', '--file', f.options.ledger];
    const run = (extra = []) => JSON.parse(execFileSync(process.execPath, [...args, ...extra],
        { cwd: f.root, encoding: 'utf8' }));
    const before = readFileSync(join(f.root, f.options.ledger), 'utf8');
    assert.deepEqual(run().events.map(event => event.task), ['A0']);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), before);
    assert.equal(run(['--apply']).count, 1);
    assert.equal(f.state().deliveries[f.baseline].publishedCommit, f.candidate);
    assert.equal(f.state().deliveries[unmerged].publishedCommit, undefined);
    assert.equal(run(['--apply']).count, 0, 'an applied repair is not repeated');
    const after = readFileSync(join(f.root, f.options.ledger), 'utf8');
    const forged = { id: 'forged-publication-bound', type: 'publication-confirmed', task: 'A2',
        commit: f.candidate, knownBy: f.state().deliveries[f.candidate].publishedAt, evidenceTask: 'A1' };
    assert.throws(() => execFileSync(process.execPath, [script, 'event', '--file', f.options.ledger,
        '--json', JSON.stringify(forged)], { cwd: f.root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }),
    /publication evidence must contain the accepted integration/);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), after,
        'a publication claim for an unmerged integration leaves the ledger unchanged');
});

test('dirty implementation and unsafe report contents never reach remote Main', t => {
    const f = fixture(t); f.accept();
    f.write('js/fixture.js', 'unvalidated edit\n');
    assert.throws(() => publishTask(f.options, f.root, f), /outside publication/);
    f.write('js/fixture.js', 'export const fixture = false;\n');
    f.json('investigations/not-valid.json', {});
    assert.throws(() => publishTask(f.options, f.root, f), /invalid investigation report/);
    assert.equal(f.git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0], f.baseline);
    assert.equal(f.state().deliveries[f.candidate].publishedCommit, undefined);
    // Bad reports leave a recoverable local commit, not a forced rollback.
    assert.ok(f.git('log', '-1', '--format=%s').includes('acceptance'));
});

test('publication resumes after the report commit and after a successful push with no ledger event', t => {
    const f = fixture(t); f.accept();
    f.json('QUALITY.json', {});
    writeDashboardSnapshot({ ledger: f.options.ledger, checkpoint: f.candidateCheckpoint,
        output: 'dashboard-snapshot.json' }, f.root);
    f.git('add', 'QUALITY.json', 'dashboard-snapshot.json'); f.git('commit', '-qm', 'Interrupted report packet');
    f.writeData('dashboard-data.json.gz');
    f.git('add', 'dashboard-data.json.gz'); f.git('commit', '-qm', 'Interrupted data packet');
    const packet = f.git('rev-parse', 'HEAD');
    f.git('push', '-q', 'origin', 'main'); // Simulate an interruption between push and publication event.
    const report = publishTask(f.options, f.root, f);
    assert.equal(report.commit, packet, 'retry reuses the existing immutable packet');
    assert.equal(f.state().deliveries[f.candidate].publishedCommit, packet);
});

test('a manual closure commit still receives a snapshot and unvalidated committed code cannot publish', t => {
    const f = fixture(t); f.accept();
    f.json('QUALITY.json', {});
    f.git('add', 'QUALITY.json'); f.git('commit', '-qm', 'Manual closure without snapshot');
    const manual = f.git('rev-parse', 'HEAD');
    const result = publishTask(f.options, f.root, f);
    assert.notEqual(result.commit, manual, 'publication adds the missing accepted snapshot');
    const g = fixture(t); g.accept();
    g.write('js/fixture.js', 'unvalidated committed code\n');
    g.git('add', 'js/fixture.js'); g.git('commit', '-qm', 'Unvalidated descendant');
    assert.throws(() => publishTask(g.options, g.root, g), /unvalidated changes/);
    assert.equal(g.git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0], g.baseline);
});

test('known publication CI failure stops a new push and a stale queue cannot authorize admission', t => {
    const f = fixture(t); f.accept();
    assert.throws(() => publishTask(f.options, f.root, { checkCI: () => ({ failed: true }) }), /CI failed/);
    assert.equal(f.git('rev-parse', 'HEAD'), f.candidate);
    f.json('.cache/old-queue.json', { mode: 'work', sessions: [], synthetic: { batches: [] } });
    const result = publishTask({ ...f.options, queue: '.cache/old-queue.json' }, f.root, f);
    assert.equal(result.next.workerWork.status, 'blocked');
    assert.equal(result.next.workerWork.candidateGroups, null);
});
