import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { parseHandoffArgs, publishTask, reviewTask } from './task-handoff.mjs';
import { createLedger, recordEvent, summarizeLedger } from './worker-state.mjs';
import { corpusDigest, digest, totalsFor } from './challenge-results.mjs';
import { appendRow, COLUMNS } from './score-log.mjs';
import { recordEvaluation } from './score-challenges.mjs';
import { writeDashboardSnapshot } from './dashboard-snapshot.mjs';

function fixture(t) {
    const parent = mkdtempSync(join(tmpdir(), 'task-handoff-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'main');
    mkdirSync(root);
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
        { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const write = (path, bytes) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), bytes);
    };
    const json = (path, value) => write(path, JSON.stringify(value));
    git('init', '-qb', 'main');
    git('config', 'user.name', 'Handoff fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    write('.gitignore', '.cache/\n');
    write('js/fixture.js', 'export const fixture = true;\n');
    write('SCORE.tsv', COLUMNS.join('\t') + '\n');
    const recipe = JSON.stringify({ version: 5, segments: [{ moves: 'i' }] });
    // Two screens permit a partial baseline and a full candidate without replay.
    const recording = JSON.stringify({ version: 5, segments: [{ steps: [{ screen: 'start' }, { screen: 'inventory' }] }] });
    const entry = { id: 'case', title: 'Independent transport fixture',
        recipe: 'challenges/cases/case.recipe.json', recipeSha256: digest(recipe),
        recording: 'challenges/cases/case.session.json', recordingSha256: digest(recording) };
    write(entry.recipe, recipe); write(entry.recording, recording);
    json('challenges/manifest.json', { version: 1, cases: [entry] });
    git('add', '.gitignore', 'js/fixture.js', 'SCORE.tsv', entry.recipe, entry.recording, 'challenges/manifest.json');
    git('commit', '-qm', 'Fixture baseline');
    const baseline = git('rev-parse', 'HEAD');
    write('js/fixture.js', 'export const fixture = false;\n');
    git('add', 'js/fixture.js'); git('commit', '-qm', 'Fixture candidate');
    const candidate = git('rev-parse', 'HEAD');
    git('init', '--bare', '-q', join(parent, 'remote.git'));
    git('remote', 'add', 'origin', join(parent, 'remote.git'));
    git('push', '-q', 'origin', `${baseline}:refs/heads/main`); // This is only a disposable filesystem remote.
    function checkpoint(commit, matched) {
        const relative = `.git/checkpoint-results/${commit}/fixture`;
        const artifacts = join(root, relative);
        const cases = [{ id: entry.id, recordingSha256: entry.recordingSha256,
            passed: matched === 2, error: null, metrics: Object.fromEntries(['screens', 'rng', 'cursors']
                .map(key => [key, { matched, total: 2 }])) }];
        json(`${relative}/synthetic/v1.json`, { version: 1, sha: commit, utc: '2026-10-01T00:00:00Z',
            status: 'complete', scorerSha256: digest('same fixture scorer'),
            manifestSha256: corpusDigest(cases), cases, totals: totalsFor(cases) });
        // The dashboard requires the actual 44-session shape and matching hash,
        // not just aggregate counts. Each fixture session has one of two matches.
        const results = { results: Array.from({ length: 44 }, (_, index) => ({ session: `fixture-${index}.session.json`,
            passed: false, metrics: Object.fromEntries(['screens', 'rngCalls', 'cursors']
                .map(key => [key, { matched: 1, total: 2 }])) })) };
        const bytes = JSON.stringify(results);
        write(`${relative}/session-results.json`, bytes);
        const summary = { commit, executionCommit: commit, artifacts, allPassed: true,
            timestamp: '2026-10-01T00:00:00Z', artifactHashes: { 'session-results.json': digest(bytes) },
            score: { sessions: 44, passing: 0, screensMatched: 44, rngMatched: 44, cursorsMatched: 44 } };
        json(`${relative}/summary.json`, summary);
        json(`.git/checkpoint-results/${commit}/latest.json`, summary);
        return join(artifacts, 'summary.json');
    }
    const baselineCheckpoint = checkpoint(baseline, 1), candidateCheckpoint = checkpoint(candidate, 2);
    let ledger = createLedger('loop-20261009', root), sequence = 0;
    const send = event => {
        ledger = recordEvent(ledger, { id: `fixture-${++sequence}`, ...event });
        json('.cache/ledger.json', ledger);
    };
    send({ type: 'register', worker: 'A', worktree: join(parent, 'worker'), branch: 'worker/a', base: baseline, handle: 'existing-A' });
    for (const [task, commit, summary] of [['A0', baseline, baselineCheckpoint], ['A1', candidate, candidateCheckpoint]]) {
        send({ type: 'assign', task, worker: 'A', goal: task, seed: null, base: baseline,
            reservations: [`source:fixture.c:${task}`], allowedPaths: ['js/fixture.js'] });
        send({ type: 'ready', task, base: baseline, delivery: commit, commits: [commit], paths: ['js/fixture.js'],
            evidence: join(root, '.cache/evidence.json'), dependencies: [] });
        send({ type: 'integrating', task, integration: commit });
        if (task === 'A0') {
            send({ type: 'validated', task, checkpoint: summary, passed: true });
            send({ type: 'accepted', task });
        }
    }
    send({ type: 'turn', worker: 'A', state: 'idle', reason: 'Submitted.', processes: [] });
    const options = { task: 'A1', ledger: '.cache/ledger.json' };
    const accept = () => {
        send({ type: 'validated', task: 'A1', passed: true, checkpoint: candidateCheckpoint });
        send({ type: 'accepted', task: 'A1' });
    };
    const calls = [];
    const checkCI = args => { calls.push(args); return { checked: 0, pending: [], completed: [], failed: false }; };
    return { root, parent, git, write, json, options, baseline, candidate, baselineCheckpoint, candidateCheckpoint,
        accept, send, calls, checkCI, state: () => summarizeLedger(JSON.parse(readFileSync(join(root, options.ledger), 'utf8'))) };
}

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
    assert.equal(loss.regressions[0].id, 'case');
    assert.throws(() => reviewTask({ ...f.options, baseline: f.candidateCheckpoint }, f.root), /accepted checkpoint/);
    assert.equal(f.state().tasks.A1.status, 'integrating', 'comparison never accepts a task');
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
    assert.equal(report.next.workers[0].action, 'resume');
    const snapshot = JSON.parse(readFileSync(join(f.root, 'dashboard-snapshot.json'), 'utf8'));
    assert.equal(snapshot.development.executionCommit, f.candidate);
    assert.ok(snapshot.activity.events.some(event => event.type === 'accepted' && event.task === 'A1'));
    assert.match(f.git('show', '-s', '--format=%B', report.commit), /Assisted-by: Codex/);
    const count = f.git('rev-list', '--count', 'HEAD');
    publishTask(f.options, f.root, f); // Published retries only check CI and summarize next work.
    assert.equal(f.git('rev-list', '--count', 'HEAD'), count);
    assert.equal(f.calls.filter(call => call.commit === report.commit).length, 2);
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
