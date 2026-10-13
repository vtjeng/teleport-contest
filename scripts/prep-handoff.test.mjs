import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import test from 'node:test';
import {acceptPrepGroup, integratePrepGroup, parsePrepArgs, planPrepGroup} from './prep-handoff.mjs';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {deliveryGit} from './worker-delivery.mjs';
import {digest} from './challenge-results.mjs';

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
    git('add', '.gitignore', 'QUALITY.json'); git('commit', '-qm', 'Base');
    const base = git('rev-parse', 'HEAD');
    let ledger = createLedger('loop-20261013', root), sequence = 0;
    const send = event => {ledger = recordEvent(ledger, {id: `fixture-${++sequence}`, ...event}); save('.cache/ledger.json', ledger);};
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
        const summary = {commit, executionCommit: commit, allPassed: passed, artifacts};
        save(`.git/checkpoint-results/${commit}/latest.json`, summary);
        save(`.git/checkpoint-results/${commit}/fixture/summary.json`, summary);
        return join(artifacts, 'summary.json');
    };
    return {root, git, save, options, state, checkpoint, deliveries};
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
