import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {acceptPrepGroup, integratePrepGroup, parsePrepArgs, planPrepGroup, publishPrepGroup} from './prep-handoff.mjs';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {deliveryGit, verifyEvent} from './worker-delivery.mjs';
import {digest} from './challenge-results.mjs';
import {COLUMNS} from './score-log.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'prep-group-'));
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
    git('config', 'user.name', 'Prep fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('config', 'commit.gpgsign', 'false');
    save('.gitignore', '.cache/\n'); save('QUALITY.json', {areas: []});
    save('SCORE.tsv', COLUMNS.join('\t') + '\n');
    git('add', '.gitignore', 'QUALITY.json', 'SCORE.tsv'); git('commit', '-qm', 'Base');
    const base = git('rev-parse', 'HEAD');
    let ledger = createLedger('loop-20261013', root), sequence = 0;
    const send = event => {
        if (existsSync(join(root, '.cache/ledger.json'))) ledger = JSON.parse(readFileSync(join(root, '.cache/ledger.json')));
        ledger = recordEvent(ledger, {id: `fixture-${++sequence}`, ...event}); save('.cache/ledger.json', ledger);
    };
    send({type: 'register', worker: 'Prep', worktree: root, branch: 'worker/prep', base, handle: 'fixture-Prep'});
    git('switch', '-qc', 'worker/prep');
    const deliveries = [];
    // Four sequential dependent batches demonstrate that Prep has no cap of three.
    for (let version = 2; version <= 5; version++) {
        const batch = `v${version}`, task = `Prep-${batch}`, start = git('rev-parse', 'HEAD');
        const inputs = {seed: 42, datetime: '20000101120000', nethackrc: '', moves: 'i'};
        // A single C boundary is sufficient for metadata/transport checks; these tests never replay games.
        const recipe = `challenges/cases/${batch}/inventory.recipe.json`, recording = `challenges/cases/${batch}/inventory.session.json`;
        const manifest = {version: 1, batch, cases: [{id: 'inventory', title: 'C inventory transport fixture',
            recipe, recording, recipeSha256: save(recipe, {version: 5, segments: [inputs]}),
            recordingSha256: save(recording, {version: 5, segments: [{...inputs,
                steps: [{key: '', screen: 'inventory', cursor: [0, 0, 1], rng: []}]}]}),
            reproducibility: 'Saved independent C replay.'}]};
        git('add', recipe, recording); git('commit', '-qm', `Prepare ${batch}`);
        const source = deliveryGit(root, start, 'HEAD');
        const packet = {git: source, context: {kind: 'challenge-preparation', batch}, manifest,
            missionPlan: 'Record C inventory independently.', checks: [{kind: 'fresh', caseId: 'inventory', exitCode: 0}]};
        const bytes = JSON.stringify(packet), packetPath = `.cache/${digest(bytes)}.json`, evidence = join(root, packetPath);
        save(packetPath, bytes);
        send({type: 'assign', task, worker: 'Prep', kind: 'challenge-preparation', seed: null,
            base: start, reservations: [`challenge-batch:${batch}`], allowedPaths: [`challenges/cases/${batch}/`]});
        send({type: 'ready', task, delivery: source.head, base: start, commits: source.commits,
            paths: source.paths, evidence, dependencies: [...deliveries]});
        send({type: 'received', task, delivery: source.head});
        deliveries.push(source.head);
    }
    git('switch', '-q', 'main');
    const options = {ledger: '.cache/ledger.json'};
    const state = () => summarizeLedger(JSON.parse(readFileSync(join(root, options.ledger), 'utf8')));
    const checkpoint = (commit, passed = true) => {
        const artifacts = join(root, `.git/checkpoint-results/${commit}/fixture`);
        // Publication requires a complete fixed-workload artifact, not just a verdict flag.
        const results = {results: Array.from({length: 44}, (_, i) => ({session: `fixture-${i}.session.json`, passed: true,
            metrics: Object.fromEntries(['screens', 'rngCalls', 'cursors'].map(key => [key, {matched: 1, total: 1}]))}))};
        const bytes = JSON.stringify(results);
        save(`.git/checkpoint-results/${commit}/fixture/session-results.json`, bytes);
        const summary = {commit, executionCommit: commit, allPassed: passed, artifacts, timestamp: '2026-10-13T00:00:00Z',
            artifactHashes: {'session-results.json': digest(bytes)},
            score: {screensMatched: 44, rngMatched: 44, cursorsMatched: 44}};
        save(`.git/checkpoint-results/${commit}/latest.json`, summary);
        save(`.git/checkpoint-results/${commit}/fixture/summary.json`, summary);
        return join(artifacts, 'summary.json');
    };
    return {root, git, save, send, options, state, checkpoint, deliveries};
}

test('Prep group arguments reject missing and irrelevant flags', () => {
    assert.deepEqual(parsePrepArgs(['accept', '--ledger', 'ledger']), {phase: 'accept', ledger: 'ledger'});
    for (const args of [[], ['integrate'], ['accept', '--ledger', 'ledger', '--task', 'Prep-v2'],
        ['publish', '--ledger', 'ledger'], ['plan', '--ledger', 'a', '--ledger', 'b']])
        assert.throws(() => parsePrepArgs(args), /Usage/);
});

test('four dependent Prep submissions share one candidate and checkpoint, with idempotent recovery', t => {
    const f = fixture(t), plan = planPrepGroup(f.options, f.root);
    assert.equal(plan.tasks.length, 4);
    const group = integratePrepGroup(f.options, f.root);
    assert.equal(group.tasks.length, 4);
    assert.equal(group.preflight.every(result => result.passed), true);
    assert.equal(integratePrepGroup(f.options, f.root).commit, group.commit, 'retry does not cherry-pick twice');
    const checkpoint = f.checkpoint(group.commit);
    acceptPrepGroup(f.options, f.root);
    for (const member of plan.tasks) {
        const delivery = f.state().deliveries[member.delivery];
        assert.equal(f.state().tasks[member.task].status, 'accepted');
        assert.equal(delivery.integration, group.commit);
        assert.equal(delivery.checkpoint, checkpoint);
    }
    const before = readFileSync(join(f.root, f.options.ledger), 'utf8');
    acceptPrepGroup(f.options, f.root);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), before, 'retry records no duplicate events');
});

test('a failed shared checkpoint accepts none of the Prep group', t => {
    const f = fixture(t), group = integratePrepGroup(f.options, f.root);
    const before = readFileSync(join(f.root, f.options.ledger), 'utf8');
    f.checkpoint(group.commit, false);
    assert.throws(() => acceptPrepGroup(f.options, f.root), /passing checkpoint/);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), before);
});

test('a correction submitted before first integration retains the original Prep case files', t => {
    const f = fixture(t);
    // The correction is only a later delta; Main has not integrated any v3 files yet.
    f.send({type: 'feedback', task: 'Prep-v3', delivery: f.deliveries[1], reason: 'Correct saved inventory evidence.'});
    f.send({type: 'resume', task: 'Prep-v3'});
    f.git('switch', '-q', 'worker/prep');
    const base = f.git('rev-parse', 'HEAD');
    const original = f.state().deliveries[f.deliveries[1]], packet = JSON.parse(readFileSync(original.evidence));
    const entry = packet.manifest.cases[0], recording = JSON.parse(readFileSync(join(f.root, entry.recording)));
    recording.segments[0].steps[0].screen = 'corrected inventory';
    entry.recordingSha256 = f.save(entry.recording, recording);
    f.git('add', entry.recording); f.git('commit', '-qm', 'Correct v3 inventory');
    packet.git = deliveryGit(f.root, base, 'HEAD');
    const bytes = JSON.stringify(packet), evidence = `.cache/${digest(bytes)}.json`;
    f.save(evidence, bytes);
    f.send({type: 'ready', task: 'Prep-v3', delivery: packet.git.head, base, commits: packet.git.commits,
        paths: packet.git.paths, evidence: join(f.root, evidence), dependencies: [f.deliveries[0]]});
    f.send({type: 'received', task: 'Prep-v3', delivery: packet.git.head});
    f.git('switch', '-q', 'main');
    const group = integratePrepGroup(f.options, f.root);
    assert.equal(group.preflight.every(result => result.passed), true);
    assert.equal(digest(readFileSync(join(f.root, entry.recipe))), entry.recipeSha256);
    assert.equal(digest(readFileSync(join(f.root, entry.recording))), entry.recordingSha256);
    f.checkpoint(group.commit); acceptPrepGroup(f.options, f.root);
    assert.equal(f.state().tasks['Prep-v3'].status, 'accepted');
});

test('a changed submission stops frozen-group recovery without accepting or dropping it', t => {
    const f = fixture(t), group = integratePrepGroup(f.options, f.root);
    const plan = JSON.parse(readFileSync(join(f.root, '.cache/prep-group.json')));
    plan.tasks.at(-1).delivery = f.deliveries[0]; // Simulates a stale cached submission identity, not a Git change.
    f.save('.cache/prep-group.json', plan);
    f.checkpoint(group.commit);
    assert.throws(() => acceptPrepGroup(f.options, f.root), /submission changed/);
    assert.equal(Object.values(f.state().tasks).filter(task => task.status === 'accepted').length, 0);
});

test('a missing earlier receipt holds later Prep submissions out of the group', t => {
    const f = fixture(t);
    const ledger = JSON.parse(readFileSync(join(f.root, f.options.ledger)));
    ledger.events = ledger.events.filter(event => !(event.type === 'received' && event.task === 'Prep-v3'));
    f.save(f.options.ledger, ledger);
    const plan = planPrepGroup(f.options, f.root);
    assert.deepEqual(plan.tasks.map(member => member.task), ['Prep-v2']);
    assert.equal(plan.held.task, 'Prep-v3');
});

test('unsubmitted same-directory files and changed blobs cannot join a frozen Prep candidate', async t => {
    for (const path of ['challenges/cases/v2/extra.json', 'challenges/cases/v2/inventory.recipe.json']) {
        await t.test(path, t => {
            const f = fixture(t);
            integratePrepGroup(f.options, f.root);
            f.save(path, '{}'); // Neither an extra file nor altered bytes occur in a submitted patch.
            f.git('add', path); f.git('commit', '-qm', 'Unsubmitted candidate change');
            assert.throws(() => integratePrepGroup(f.options, f.root), /differs from the frozen Prep deliveries/);
        });
    }
});

test('feedback releases the group and a corrected submission can be integrated without losing siblings', t => {
    const f = fixture(t), initial = integratePrepGroup(f.options, f.root);
    f.send(verifyEvent(f.root, f.state(), {type: 'feedback', task: 'Prep-v3', delivery: f.deliveries[1], reason: 'Correct C inventory evidence.'}));
    assert.equal(f.state().tasks['Prep-v2'].status, 'ready');
    assert.equal(f.state().tasks['Prep-v3'].status, 'changes-required');
    assert.throws(() => integratePrepGroup(f.options, f.root), /finish the requested Prep corrections/);
    f.send({type: 'resume', task: 'Prep-v3'});
    f.git('switch', '-q', 'worker/prep');
    const base = f.git('rev-parse', 'HEAD');
    const previous = f.state().deliveries[f.deliveries[1]], packet = JSON.parse(readFileSync(previous.evidence));
    const entry = packet.manifest.cases[0], recording = JSON.parse(readFileSync(join(f.root, entry.recording)));
    recording.segments[0].steps[0].screen = 'corrected inventory';
    entry.recordingSha256 = f.save(entry.recording, recording);
    f.git('add', entry.recording); f.git('commit', '-qm', 'Correct v3 inventory evidence');
    packet.git = deliveryGit(f.root, base, 'HEAD');
    const bytes = JSON.stringify(packet), evidence = `.cache/${digest(bytes)}.json`;
    f.save(evidence, bytes);
    f.send({type: 'ready', task: 'Prep-v3', delivery: packet.git.head, base, commits: packet.git.commits,
        paths: packet.git.paths, evidence: join(f.root, evidence), dependencies: [f.deliveries[0]]});
    f.send({type: 'received', task: 'Prep-v3', delivery: packet.git.head});
    f.git('switch', '-q', 'main');
    const repaired = integratePrepGroup(f.options, f.root);
    assert.notEqual(repaired.commit, initial.commit);
    assert.deepEqual(repaired.tasks, initial.tasks);
    f.checkpoint(repaired.commit); acceptPrepGroup(f.options, f.root);
    assert.equal(f.state().deliveries[packet.git.head].integration, repaired.commit);
    for (const task of repaired.tasks) assert.equal(f.state().tasks[task].status, 'accepted');
});

test('retrying a feedback CLI event preserves the derived group release metadata', t => {
    const f = fixture(t);
    integratePrepGroup(f.options, f.root);
    const event = {id: 'feedback-retry', type: 'feedback', task: 'Prep-v3',
        delivery: f.deliveries[1], reason: 'Correct the saved evidence.'};
    const args = [fileURLToPath(new URL('./worker-state.mjs', import.meta.url)), 'event', '--file',
        join(f.root, f.options.ledger), '--json', JSON.stringify(event)];
    execFileSync(process.execPath, args, {cwd: f.root, stdio: 'pipe'});
    const before = readFileSync(join(f.root, f.options.ledger), 'utf8');
    execFileSync(process.execPath, args, {cwd: f.root, stdio: 'pipe'});
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), before);
});

test('one report push records publication for every accepted Prep task and retries do not push again', t => {
    const f = fixture(t), group = integratePrepGroup(f.options, f.root);
    f.checkpoint(group.commit); acceptPrepGroup(f.options, f.root);
    // The remote is a disposable local repository, never GitHub or Main's real remote.
    f.git('init', '--bare', '-q', join(f.root, '.cache/remote.git'));
    f.git('remote', 'add', 'origin', join(f.root, '.cache/remote.git'));
    const dependencies = {checkCI: () => ({failed: false, pending: []})};
    const result = publishPrepGroup(f.options, f.root, dependencies);
    assert.equal(f.git('rev-list', '--count', `${group.commit}..${result.commit}`), '1', 'one shared report commit');
    assert.equal(f.git('ls-remote', 'origin', 'refs/heads/main').split(/\s/u)[0], result.commit);
    for (const task of group.tasks) {
        const delivery = f.state().deliveries[f.state().tasks[task].deliveries.at(-1)];
        assert.equal(delivery.publishedCommit, result.commit);
    }
    const ledger = readFileSync(join(f.root, f.options.ledger), 'utf8');
    assert.equal(JSON.parse(ledger).events.filter(event => event.type === 'published').length, 1, 'only one push witness');
    assert.equal(publishPrepGroup(f.options, f.root, dependencies).commit, result.commit);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), ledger);
});
