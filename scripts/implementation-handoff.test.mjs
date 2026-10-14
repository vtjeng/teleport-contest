import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {acceptImplementationGroup, integrateImplementationGroup, parseImplementationArgs,
    planImplementationGroup, publishImplementationGroup, splitImplementationGroup} from './implementation-handoff.mjs';
import {acceptTask} from './accept-task.mjs';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {deliveryGit, verifyEvent} from './worker-delivery.mjs';
import {challengeInputSnapshot, corpusDigest, digest, totalsFor} from './challenge-results.mjs';
import {COLUMNS, readRows} from './score-log.mjs';

function fixture(t, {dependent = true} = {}) {
    const parent = mkdtempSync(join(tmpdir(), 'implementation-group-')), root = join(parent, 'main');
    t.after(() => rmSync(parent, {recursive: true, force: true}));
    const gitAt = (cwd, ...args) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args],
        {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    const git = (...args) => gitAt(root, ...args);
    const save = (path, value) => {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        const bytes = typeof value === 'string' ? value : JSON.stringify(value);
        writeFileSync(join(root, path), bytes); return digest(bytes);
    };
    const init = directory => {
        mkdirSync(directory); gitAt(directory, 'init', '-qb', 'main');
        gitAt(directory, 'config', 'user.name', 'Implementation fixture');
        gitAt(directory, 'config', 'user.email', 'fixture@example.invalid');
        gitAt(directory, 'config', 'commit.gpgsign', 'false');
    };
    init(root); init(join(parent, 'source'));
    // Four functions exceed the old proposed cap of three without any game replay.
    const names = ['f1', 'f2', 'f3', 'f4'];
    mkdirSync(join(parent, 'source/src'));
    writeFileSync(join(parent, 'source/src/fixture.c'), names.map(name => `int\n${name}(void)\n{\n    return 1;\n}\n`).join(''));
    gitAt(join(parent, 'source'), 'add', 'src/fixture.c'); gitAt(join(parent, 'source'), 'commit', '-qm', 'C fixture');
    git('-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', join(parent, 'source'), 'nethack-c/upstream');
    save('.gitignore', '.cache/\nscripts/*\n!scripts/pinned.test.mjs\n');
    const scripts = dirname(fileURLToPath(import.meta.url));
    mkdirSync(join(root, 'scripts'));
    for (const name of readdirSync(scripts).filter(name => name.endsWith('.mjs') && !name.endsWith('.test.mjs')))
        copyFileSync(join(scripts, name), join(root, 'scripts', name));
    save('scripts/pinned.test.mjs', '// Pinned source-reference fixture; the handoff does not rerun this test.\n');
    for (const name of names) save(`js/${name}.js`, `export function ${name}() { return 0; }\n`);
    save('QUALITY.json', {areas: [{paths: names.map(name => `js/${name}.js`)}]});
    save('GOALS.json', {goals: names.map((name, i) => ({id: `A${i + 1}`, kind: 'file-port', status: 'queued',
        summary: 'Transport fixture; no source certification.', cFile: 'fixture.c', functions: [{name}]}))});
    save('SCORE.tsv', COLUMNS.join('\t') + '\n');
    const cases = names.map(name => {
        const recipe = `challenges/cases/${name}.recipe.json`, recording = `challenges/cases/${name}.session.json`;
        return {id: name, title: 'Independent transport fixture', recipe, recording,
            recipeSha256: save(recipe, {version: 5, segments: [{moves: 'i'}]}),
            // Two boundaries allow partial target improvement and later correction.
            recordingSha256: save(recording, {version: 5, segments: [{steps: [{screen: 'start'}, {screen: 'inventory'}]}]})};
    });
    save('challenges/manifest.json', {version: 1, cases});
    git('add', '.gitignore', '.gitmodules', 'nethack-c/upstream', 'scripts/pinned.test.mjs',
        'QUALITY.json', 'GOALS.json', 'SCORE.tsv', 'js/f1.js', 'js/f2.js', 'js/f3.js', 'js/f4.js',
        'challenges/manifest.json', ...cases.flatMap(entry => [entry.recipe, entry.recording]));
    git('commit', '-qm', 'Accepted baseline'); const base = git('rev-parse', 'HEAD');
    const checkpoint = (commit, gains = names, passed = true) => {
        const relative = `.git/checkpoint-results/${commit}/fixture`, artifacts = join(root, relative);
        const results = {results: Array.from({length: 44}, (_, i) => ({session: `fixture-${i}.session.json`, passed: true,
            metrics: Object.fromEntries(['screens', 'rngCalls', 'cursors'].map(key => [key, {matched: 1, total: 1}]))}))};
        const bytes = JSON.stringify(results); save(`${relative}/session-results.json`, bytes);
        const measured = cases.map(entry => ({id: entry.id, recordingSha256: entry.recordingSha256, passed: false, error: null,
            metrics: Object.fromEntries(['screens', 'rng', 'cursors'].map(key => [key, {matched: gains.includes(entry.id) ? 1 : 0, total: 2}]))}));
        save(`${relative}/synthetic/v1.json`, {version: 1, sha: commit, utc: '2026-10-14T00:00:00Z', status: 'complete',
            scorerSha256: digest('unchanged fixture scorer'), manifestSha256: corpusDigest(measured),
            inputsSha256: challengeInputSnapshot(root, 'v1').sha256, cases: measured, totals: totalsFor(measured)});
        save(`${relative}/scan-cache.json`, {sha: commit, rows: []});
        const summary = {commit, executionCommit: commit, allPassed: passed, artifacts, timestamp: '2026-10-14T00:00:00Z',
            artifactHashes: {'session-results.json': digest(bytes)}, recordings: {passed: true},
            score: {passing: 44, sessions: 44, screensMatched: 44, screensTotal: 44,
                rngMatched: 44, rngTotal: 44, cursorsMatched: 44, cursorsTotal: 44}};
        save(`${relative}/summary.json`, summary); save(`.git/checkpoint-results/${commit}/latest.json`, summary);
        return join(artifacts, 'summary.json');
    };
    const baseline = checkpoint(base, []);
    let sequence = 0; save('.cache/ledger.json', createLedger('loop-20261014', root));
    const send = event => {
        const ledger = JSON.parse(readFileSync(join(root, '.cache/ledger.json')));
        save('.cache/ledger.json', recordEvent(ledger, {id: `fixture-${++sequence}`, ...event}));
    };
    send({type: 'register', worker: 'A', worktree: root, branch: 'worker/a', base, handle: 'fixture-A'});
    send({type: 'assign', task: 'A0', worker: 'A', goal: 'A0', seed: null, base,
        reservations: ['source:fixture.c:baseline'], allowedPaths: ['js/']});
    send({type: 'ready', task: 'A0', delivery: base, base, commits: [base], paths: ['js/f1.js'],
        evidence: join(root, '.cache/unused.json'), dependencies: []});
    send({type: 'integrating', task: 'A0', integration: base});
    send({type: 'validated', task: 'A0', passed: true, checkpoint: baseline}); send({type: 'accepted', task: 'A0'});
    git('switch', '-qc', 'worker/a');
    const deliveries = [];
    for (const [index, name] of names.entries()) {
        const task = `A${index + 1}`, start = git('rev-parse', 'HEAD');
        save(`js/${name}.js`, `export function ${name}() { return 1; }\n`);
        git('add', `js/${name}.js`); git('commit', '-qm', `Implement ${name}`);
        const source = deliveryGit(root, start, 'HEAD');
        const packet = {git: source, context: {goal: task, kind: 'file-port', cFile: 'fixture.c', functions: [name]},
            checks: [], entryPointReview: 'Pure helper fixture.', entryPoints: [], functions: [{name,
                implementation: `js/${name}.js`, sourceReview: 'Worker claim: source return is one.',
                pure: true, tests: ['scripts/pinned.test.mjs'], recordings: [], callers: [], inactiveReason: 'Isolated fixture helper.'}]};
        const bytes = JSON.stringify(packet), evidence = `.cache/${digest(bytes)}.json`; save(evidence, bytes);
        send({type: 'assign', task, worker: 'A', goal: task, seed: `synthetic/v1/${name}`, base: start,
            reservations: [`source:fixture.c:${name}`], allowedPaths: [`js/${name}.js`]});
        send({type: 'ready', task, delivery: source.head, base: start, commits: source.commits, paths: source.paths,
            evidence: join(root, evidence), dependencies: dependent ? [...deliveries] : []});
        send({type: 'received', task, delivery: source.head}); deliveries.push(source.head);
    }
    git('switch', '-q', 'main');
    const state = () => summarizeLedger(JSON.parse(readFileSync(join(root, '.cache/ledger.json'))));
    return {root, parent, git, save, send, base, names, deliveries, checkpoint, state, options: {ledger: '.cache/ledger.json'}};
}

test('implementation group CLI rejects missing, duplicate and unrelated flags', () => {
    assert.deepEqual(parseImplementationArgs(['split', '--ledger', 'ledger', '--tasks', 'A1,A2']),
        {phase: 'split', ledger: 'ledger', tasks: 'A1,A2'});
    for (const args of [[], ['integrate'], ['split', '--ledger', 'x'], ['accept', '--ledger', 'x', '--tasks', 'A1'],
        ['plan', '--ledger', 'x', '--ledger', 'y']]) assert.throws(() => parseImplementationArgs(args), /Usage/);
});

test('four dependent implementation tasks share one checkpoint and common baseline, then one publication', t => {
    const f = fixture(t), plan = planImplementationGroup(f.options, f.root);
    assert.equal(plan.tasks.length, 4);
    const group = integrateImplementationGroup(f.options, f.root);
    assert.equal(f.git('rev-parse', 'main'), f.base, 'unaccepted candidates do not advance main');
    assert.equal(integrateImplementationGroup(f.options, f.root).commit, group.commit, 'integration retry is idempotent');
    f.checkpoint(group.commit);
    assert.throws(() => acceptTask({...f.options, task: 'A1'}, f.root), /entire frozen/);
    const receipts = acceptImplementationGroup(f.options, f.root);
    assert.equal(receipts.tasks.length, 4);
    const goals = JSON.parse(readFileSync(join(f.root, 'GOALS.json')));
    for (const goal of goals.goals) {
        assert.equal(goal.status, 'closed'); assert.equal(goal.closedAt, group.commit);
        assert.equal(goal.acceptance.baseline, f.base);
    }
    assert.equal(readRows(join(f.root, 'SCORE.tsv')).filter(row => row.event === 'challenge').length, 1,
        'one shared evaluation is imported once, not once per target');
    const ledger = readFileSync(join(f.root, f.options.ledger), 'utf8');
    acceptImplementationGroup(f.options, f.root);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), ledger);
    f.git('init', '--bare', '-q', join(f.parent, 'remote.git')); f.git('remote', 'add', 'origin', join(f.parent, 'remote.git'));
    f.git('push', '-q', 'origin', `${f.base}:refs/heads/main`); // Disposable local remote, never GitHub.
    const published = publishImplementationGroup(f.options, f.root,
        {checkCI: () => ({checked: 0, pending: [], completed: [], failed: false})});
    assert.equal(f.git('branch', '--show-current'), 'main');
    for (const sha of f.deliveries) assert.equal(f.state().deliveries[sha].publishedCommit, published.commit);
    const count = f.git('rev-list', '--count', 'HEAD');
    publishImplementationGroup(f.options, f.root,
        {checkCI: () => ({checked: 0, pending: [], completed: [], failed: false})});
    assert.equal(f.git('rev-list', '--count', 'HEAD'), count);
});

test('a failed checkpoint or one unchanged target accepts none and writes no closure', t => {
    const f = fixture(t), group = integrateImplementationGroup(f.options, f.root);
    const goals = readFileSync(join(f.root, 'GOALS.json'), 'utf8'), ledger = readFileSync(join(f.root, f.options.ledger), 'utf8');
    f.checkpoint(group.commit, f.names, false);
    assert.throws(() => acceptImplementationGroup(f.options, f.root), /passing checkpoint/);
    f.checkpoint(group.commit, ['f1', 'f2', 'f3']); // The fourth assigned target has no improvement.
    assert.throws(() => acceptImplementationGroup(f.options, f.root), /acceptance blocked/);
    assert.equal(readFileSync(join(f.root, 'GOALS.json'), 'utf8'), goals);
    assert.equal(readFileSync(join(f.root, f.options.ledger), 'utf8'), ledger);
    assert.equal(readRows(join(f.root, 'SCORE.tsv')).length, 0);
});

test('publication resumes when interrupted after switching main but before committing closure reports', t => {
    const f = fixture(t), group = integrateImplementationGroup(f.options, f.root);
    f.checkpoint(group.commit); acceptImplementationGroup(f.options, f.root);
    f.git('init', '--bare', '-q', join(f.parent, 'remote.git'));
    f.git('remote', 'add', 'origin', join(f.parent, 'remote.git'));
    f.git('push', '-q', 'origin', `${f.base}:refs/heads/main`); // Disposable local remote only.
    assert.throws(() => publishImplementationGroup(f.options, f.root,
        {checkCI: () => {throw new Error('simulated interruption before report commit');}}), /simulated interruption/);
    assert.equal(f.git('branch', '--show-current'), 'main');
    assert.ok(f.git('status', '--porcelain').includes('GOALS.json'), 'valid closure reports remain uncommitted');
    const published = publishImplementationGroup(f.options, f.root,
        {checkCI: () => ({checked: 0, pending: [], completed: [], failed: false})});
    for (const sha of f.deliveries) assert.equal(f.state().deliveries[sha].publishedCommit, published.commit);
});

test('split rebuilds from accepted base, preserves failed candidate and leaves other submissions ready', t => {
    const f = fixture(t), original = integrateImplementationGroup(f.options, f.root);
    f.checkpoint(original.commit, f.names, false);
    assert.throws(() => splitImplementationGroup({...f.options, tasks: 'A3'}, f.root), /required dependency/);
    const split = splitImplementationGroup({...f.options, tasks: 'A1,A2'}, f.root);
    assert.notEqual(split.branch, original.branch);
    assert.equal(f.git('rev-parse', original.branch), original.commit);
    assert.equal(f.git('rev-parse', 'main'), f.base);
    assert.equal(f.state().tasks.A3.status, 'ready'); assert.equal(f.state().tasks.A4.status, 'ready');
    assert.match(f.git('show', 'HEAD:js/f3.js'), /return 0/, 'excluded patches are absent from the new candidate');
    f.checkpoint(split.commit, ['f1', 'f2']); acceptImplementationGroup(f.options, f.root);
    assert.equal(f.state().tasks.A1.status, 'accepted'); assert.equal(f.state().tasks.A3.status, 'ready');
});

test('unreceived tasks and their dependents remain queued rather than dropping or joining the group', t => {
    const f = fixture(t), ledger = JSON.parse(readFileSync(join(f.root, f.options.ledger)));
    ledger.events = ledger.events.filter(event => !(event.type === 'received' && event.task === 'A2'));
    f.save(f.options.ledger, ledger);
    const plan = planImplementationGroup(f.options, f.root);
    assert.deepEqual(plan.tasks.map(member => member.task), ['A1']);
    assert.deepEqual(plan.held.map(member => member.task).sort(), ['A2', 'A3', 'A4']);
});

test('implementation feedback releases siblings and preserves group metadata on retry', t => {
    const f = fixture(t), group = integrateImplementationGroup(f.options, f.root);
    const event = verifyEvent(f.root, f.state(), {id: 'correct-A2', type: 'feedback', task: 'A2',
        delivery: f.deliveries[1], reason: 'Correct the target behavior.'});
    f.send(event);
    assert.deepEqual(event.implementationGroup, group.tasks);
    assert.equal(f.state().tasks.A2.status, 'changes-required');
    for (const id of ['A1', 'A3', 'A4']) assert.equal(f.state().tasks[id].status, 'ready');
    assert.throws(() => integrateImplementationGroup(f.options, f.root), /finish.*corrections/);
    // A later correction is a delta on the worker branch, not a replacement for its original patch.
    f.git('switch', '-q', 'worker/a'); f.send({type: 'resume', task: 'A2'});
    const base = f.git('rev-parse', 'HEAD'), original = f.state().deliveries[f.deliveries[1]];
    const packet = JSON.parse(readFileSync(original.evidence));
    f.save('js/f2.js', 'export function f2() { return 2; }\n'); // A distinct correction makes missing originals visible.
    f.git('add', 'js/f2.js'); f.git('commit', '-qm', 'Correct f2'); packet.git = deliveryGit(f.root, base, 'HEAD');
    const bytes = JSON.stringify(packet), evidence = `.cache/${digest(bytes)}.json`; f.save(evidence, bytes);
    f.send({type: 'ready', task: 'A2', delivery: packet.git.head, base, commits: packet.git.commits,
        paths: packet.git.paths, evidence: join(f.root, evidence), dependencies: [f.deliveries[0]]});
    f.send({type: 'received', task: 'A2', delivery: packet.git.head});
    f.git('switch', '-q', group.branch);
    const corrected = integrateImplementationGroup(f.options, f.root);
    assert.notEqual(corrected.branch, group.branch);
    assert.equal(f.git('rev-parse', group.branch), group.commit);
    assert.match(f.git('show', 'HEAD:js/f1.js'), /return 1/);
    assert.match(f.git('show', 'HEAD:js/f2.js'), /return 2/);
    assert.equal(f.state().tasks.A4.status, 'integrating');
    f.checkpoint(corrected.commit); acceptImplementationGroup(f.options, f.root);
    assert.equal(f.state().tasks.A2.status, 'accepted');
});

test('a reserved candidate plan resumes after interruption before branch creation', t => {
    const f = fixture(t), plan = planImplementationGroup(f.options, f.root);
    // This is the durable state immediately before git switch -c executes.
    plan.branch = 'integration-checkpoint/implementation-interrupted';
    f.save('.cache/implementation-group.json', plan);
    const group = integrateImplementationGroup(f.options, f.root);
    assert.equal(group.branch, plan.branch);
    assert.equal(f.git('rev-parse', 'main'), f.base);
    assert.equal(group.preflight.every(result => result.passed), true);
});

test('a fixed-session regression rejects a group even when every synthetic target improves', t => {
    const f = fixture(t), group = integrateImplementationGroup(f.options, f.root);
    const file = f.checkpoint(group.commit), summary = JSON.parse(readFileSync(file));
    const results = JSON.parse(readFileSync(join(summary.artifacts, 'session-results.json')));
    // One lost fixed screen must not be hidden by the four synthetic gains.
    results.results[0].metrics.screens.matched = 0; results.results[0].passed = false;
    summary.artifactHashes['session-results.json'] = f.save(`${summary.artifacts}/session-results.json`.slice(f.root.length + 1), results);
    summary.score.screensMatched--; summary.score.passing--;
    f.save(file.slice(f.root.length + 1), summary);
    f.save(`.git/checkpoint-results/${group.commit}/latest.json`, summary);
    assert.throws(() => acceptImplementationGroup(f.options, f.root), /acceptance blocked/);
    for (const id of group.tasks) assert.equal(f.state().tasks[id].status, 'integrating');
});

test('shared acceptance preserves a worker already working on its next task', t => {
    const f = fixture(t), group = integrateImplementationGroup(f.options, f.root);
    f.send({type: 'assign', task: 'A5', worker: 'A', goal: 'A5', seed: null, base: group.commit,
        reservations: ['source:fixture.c:next'], allowedPaths: ['js/next.js']});
    f.checkpoint(group.commit); const result = acceptImplementationGroup(f.options, f.root);
    assert.equal(result.tasks.every(receipt => receipt.handoff.currentTask === 'A5'
        && receipt.handoff.action === 'keep-current-task'), true);
    assert.equal(f.state().tasks.A5.status, 'working');
    assert.equal(existsSync(join(f.root, '.cache/ledger.json.lock')), false);
});
