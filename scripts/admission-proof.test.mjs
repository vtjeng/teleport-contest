import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {admissionPlan, readAdmissionReceipt, verifyAdmissionRun} from './admission-proof.mjs';
import {fetchAdmission} from './fetch-admission.mjs';
import {challengeInputSnapshot, corpusDigest, digest, totalsFor} from './challenge-results.mjs';
import {verifyEvent, verifyPublicationChanges} from './worker-delivery.mjs';
import {groupCases} from './synthetic-ci.mjs';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {COLUMNS, readRows} from './score-log.mjs';
import {scorerIdentity} from './score-challenges.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'teleport-admission-only-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
        {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    const save = (path, value) => {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        const bytes = typeof value === 'string' ? value : JSON.stringify(value);
        writeFileSync(join(root, path), bytes);
        return digest(bytes);
    };
    git('init', '-qb', 'main');
    git('config', 'user.name', 'Admission fixture');
    git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    save('.gitignore', '.cache/\n');
    save('js/game.js', 'export const fixture = true;\n');
    save('frozen/scorer.js', '// fixture scorer\n');
    save('package.json', '{}');
    save('SCORE.tsv', COLUMNS.join('\t') + '\n');
    const manifests = ['v1', 'v2', 'v3'].map(batch => {
        // One C boundary per batch is enough to check membership and partial baselines; no replay occurs.
        const segment = {seed: 273, datetime: '20000412120000', nethackrc: '', moves: 'i'};
        const recipe = `challenges/cases/${batch}/inventory.recipe.json`;
        const recording = `challenges/cases/${batch}/inventory.session.json`;
        return {version: 1, ...(batch === 'v1' ? {} : {batch}), cases: [{id: 'inventory', title: 'C inventory',
            reproducibility: 'Saved independent C replay.', recipe, recording,
            recipeSha256: save(recipe, {version: 5, segments: [segment]}),
            recordingSha256: save(recording, {version: 5, segments: [{...segment,
                steps: [{key: '', screen: 'C inventory', cursor: [0, 0, 1], rng: []}]}]})}]};
    });
    save('challenges/manifest.json', manifests[0]);
    git('add', '.gitignore', 'js', 'frozen', 'package.json', 'SCORE.tsv', 'challenges');
    git('commit', '-qm', 'Validated game with prepared case files');
    const base = git('rev-parse', 'HEAD');
    for (const manifest of manifests.slice(1)) save(`challenges/manifests/${manifest.batch}.json`, manifest);
    git('add', 'challenges/manifests'); git('commit', '-qm', 'Admit new manifests', '--trailer', `Admission-base: ${base}`);
    const commit = git('rev-parse', 'HEAD'), plan = admissionPlan(root, base, commit);
    const checkpoint = {commit: base, executionCommit: base, allPassed: true, recordings: {passed: true},
        artifacts: join(root, '.git/checkpoint-results', base, 'fixture'), score: {screensMatched: 1, screensTotal: 1}};
    save(`.git/checkpoint-results/${base}/latest.json`, checkpoint);
    save(`.git/checkpoint-results/${base}/fixture/summary.json`, checkpoint);
    const paths = plan.batches.map(batch => `challenges/evaluations/admission-${commit}-${batch.batch}.json`);
    const artifact = '.cache/remote-artifact';
    save(`${artifact}/.cache/admission-ci/summary.json`, {version: 1, kind: 'admission', base, commit,
        batches: plan.batches.map(batch => batch.batch), evaluations: paths});
    for (const [index, batch] of plan.batches.entries()) {
        // Initial mismatches are valid baseline results, not a CI failure or a regression.
        const metrics = {screens: {matched: 0, total: 1}, rng: {matched: 0, total: 0}, cursors: {matched: 0, total: 1}};
        const cases = batch.cases.map(entry => ({id: entry.id, recordingSha256: entry.recordingSha256,
            passed: false, error: null, metrics}));
        save(`${artifact}/${paths[index]}`, {version: 1, batch: batch.batch, manifestPath: batch.manifestPath,
            sha: commit, utc: '2026-10-13T00:00:00Z', status: 'complete', cases,
            manifestSha256: corpusDigest(cases), scorerSha256: scorerIdentity(root).sha256,
            inputsSha256: challengeInputSnapshot(root, batch).sha256, totals: totalsFor(cases)});
    }
    // A positive synthetic run ID identifies transport fixtures, not a real GitHub run.
    const run = {id: 42, run_attempt: 1, status: 'completed', conclusion: 'success', head_sha: commit,
        repository: {full_name: 'vtjeng/teleport-contest'}, head_repository: {full_name: 'vtjeng/teleport-contest'},
        path: '.github/workflows/admission.yml'};
    const calls = [];
    const runGh = args => {
        calls.push(args);
        if (args[0] === 'repo') return 'vtjeng/teleport-contest';
        if (args[0] === 'api') return JSON.stringify(run);
        cpSync(join(root, artifact), args[args.indexOf('--dir') + 1], {recursive: true});
        return '';
    };
    return {root, git, save, base, commit, plan, paths, artifact, run, calls, runGh};
}

test('admission plans only new cases and reuses fixed-size CI grouping', t => {
    const f = fixture(t);
    assert.deepEqual(f.plan.batches.map(batch => batch.batch), ['v2', 'v3']);
    assert.equal(groupCases(f.plan.batches)[0].cases.length, 2, 'v1 is not replayed in the new-case job');
    f.save('js/game.js', 'export const fixture = false;\n');
    f.git('add', 'js/game.js'); f.git('commit', '-qm', 'Unvalidated game edit');
    assert.throws(() => admissionPlan(f.root, f.base), /changes other inputs/);
});

test('admission rejects changed old inputs, non-regular manifests and version gaps', async t => {
    for (const [name, mutate] of [
        ['old manifest', f => f.save('challenges/manifest.json', {version: 1, cases: []})],
        ['old recording', f => f.save('challenges/cases/v1/inventory.session.json', '{}')],
        ['scorer', f => f.save('frozen/scorer.js', '// changed scorer\n')],
    ]) await t.test(name, t => {
        const f = fixture(t); mutate(f);
        f.git('add', 'challenges', 'frozen'); f.git('commit', '-qm', 'Changed existing input');
        assert.throws(() => admissionPlan(f.root, f.base), /changes other inputs/);
    });
    await t.test('executable manifest', t => {
        const f = fixture(t); f.git('update-index', '--chmod=+x', 'challenges/manifests/v2.json');
        f.git('commit', '-qm', 'Executable JSON');
        assert.throws(() => admissionPlan(f.root, f.base), /regular non-executable/);
    });
    await t.test('missing batch', t => {
        const f = fixture(t); f.git('rm', 'challenges/manifests/v2.json'); f.git('commit', '-qm', 'Skip v2');
        assert.throws(() => admissionPlan(f.root, f.base), /next admitted batch/);
    });
});

test('admission workflow identity rejects stale commits, forks and other workflows', t => {
    const f = fixture(t);
    assert.equal(verifyAdmissionRun(f.run, 'vtjeng/teleport-contest', f.commit).provider, 'github');
    for (const change of [{head_sha: f.base}, {conclusion: 'failure'}, {run_attempt: 0},
        {head_repository: {full_name: 'somewhere/else'}}, {path: '.github/workflows/checkpoint-trial.yml'}])
        assert.throws(() => verifyAdmissionRun({...f.run, ...change}, 'vtjeng/teleport-contest', f.commit), /successful exact-commit/);
});

test('hosted import produces a separate receipt that authorizes manifests, not code', t => {
    const f = fixture(t);
    assert.throws(() => verifyPublicationChanges(f.root, f.base, f.commit), /unvalidated changes/);
    const result = fetchAdmission('42', f);
    assert.equal(result.recorded, false, 'archive-only verification does not write scores');
    assert.equal(readAdmissionReceipt(f.root, result.receipt).commit, f.commit);
    assert.equal(f.calls.filter(args => args[0] === 'run').length, 1, 'one artifact download; no replay command');
    verifyPublicationChanges(f.root, f.base, f.commit, result.receipt);
    assert.throws(() => readFileSync(join(f.root, `.git/checkpoint-results/${f.commit}/latest.json`)), /ENOENT/,
        'admission must not masquerade as a full checkpoint at the new commit');
    f.save('js/game.js', 'export const fixture = false;\n');
    f.git('add', 'js/game.js'); f.git('commit', '-qm', 'Changed game after admission');
    assert.throws(() => verifyPublicationChanges(f.root, f.base, f.git('rev-parse', 'HEAD'), result.receipt),
        /differs from the candidate inputs|unvalidated changes/);
});

test('admission import rejects incomplete artifacts and a failed base checkpoint', t => {
    const f = fixture(t);
    const path = `${f.artifact}/${f.paths[0]}`, bytes = readFileSync(join(f.root, path));
    const value = JSON.parse(bytes); value.sha = f.base;
    f.save(path, value);
    assert.throws(() => fetchAdmission('42', f), /differs from the candidate inputs/);
    f.save(path, bytes.toString());
    f.save(`.git/checkpoint-results/${f.base}/latest.json`, {commit: f.base, allPassed: false});
    assert.throws(() => fetchAdmission('42', f), /passing gameplay checkpoint/);
});

test('coordinator import records baselines once and publication retains the admission receipt', t => {
    const f = fixture(t);
    let ledger = createLedger('loop-20261013', f.root), sequence = 0;
    const send = event => {ledger = recordEvent(ledger, {id: `fixture-${++sequence}`, ...event});};
    send({type: 'register', worker: 'Prep', worktree: join(f.root, 'worker'),
        branch: 'worker/prep', base: f.base, handle: 'fixture-Prep'});
    for (const [index, batch] of f.plan.batches.entries()) {
        // Distinct synthetic delivery IDs exercise ledger transport, not Git patch correctness.
        const sha = (index === 0 ? 'a' : 'b').repeat(40), task = `Prep-${batch.batch}`;
        const packet = {git: {head: sha, base: f.base}, context: {kind: 'challenge-preparation', batch: batch.batch},
            manifest: JSON.parse(readFileSync(join(f.root, batch.manifestPath)))};
        const bytes = JSON.stringify(packet), path = `.cache/${digest(bytes)}.json`;
        f.save(path, bytes);
        send({type: 'assign', task, worker: 'Prep', kind: 'challenge-preparation', seed: null,
            base: f.base, reservations: [`challenge-batch:${batch.batch}`], allowedPaths: [`challenges/cases/${batch.batch}/`]});
        send({type: 'ready', task, delivery: sha, base: f.base, commits: [sha],
            paths: batch.cases.flatMap(entry => [entry.recipe, entry.recording]), evidence: join(f.root, path), dependencies: []});
        send({type: 'integrating', task, integration: f.base});
        send({type: 'validated', task, passed: true,
            checkpoint: join(f.root, `.git/checkpoint-results/${f.base}/fixture/summary.json`)});
        send({type: 'accepted', task});
    }
    f.save('.cache/ledger.json', ledger);
    const options = {...f, ledger: '.cache/ledger.json'};
    const result = fetchAdmission('42', options);
    assert.equal(result.recorded, true);
    assert.equal(readRows(join(f.root, 'SCORE.tsv')).length, 2, 'one saved baseline per new batch');
    const saved = readFileSync(join(f.root, options.ledger), 'utf8');
    assert.ok(summarizeLedger(JSON.parse(saved)).tasks['Prep-v3'].baselineAt);
    fetchAdmission('42', options);
    assert.equal(readRows(join(f.root, 'SCORE.tsv')).length, 2, 'retry does not duplicate scores');
    assert.equal(readFileSync(join(f.root, options.ledger), 'utf8'), saved, 'retry does not duplicate baseline events');
    // Publish only to a disposable filesystem remote to exercise the real publication guard.
    f.git('init', '--bare', '-q', join(f.root, '.cache/remote.git'));
    f.git('remote', 'add', 'origin', join(f.root, '.cache/remote.git'));
    f.git('push', '-q', 'origin', 'HEAD:refs/heads/main');
    const current = JSON.parse(readFileSync(join(f.root, options.ledger), 'utf8'));
    const event = verifyEvent(f.root, summarizeLedger(current), {id: 'publish-admission', type: 'published',
        task: 'Prep-v2', commit: f.commit, supplementalAdmission: result.receipt});
    const published = summarizeLedger(recordEvent(current, event));
    assert.equal(published.deliveries['a'.repeat(40)].supplementalAdmission, result.receipt);
});
