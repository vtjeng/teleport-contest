import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { copiedRecipe, verifyEvent } from './worker-delivery.mjs';
import { corpusDigest, digest } from './challenge-results.mjs';
import { preparedFromDelivery } from './admit-challenge-batch.mjs';
import { executionTree } from './checkpoint-reuse.mjs';
import { COLUMNS } from './score-log.mjs';
import {recordEvent} from './worker-state.mjs';
import {queueCommand} from './work-queue.mjs';

const SCRIPT = fileURLToPath(new URL('./worker-state.mjs', import.meta.url));

function git(cwd, ...args) {
    const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr); // Only disposable fixture repositories are written.
    return result.stdout.trim();
}

function fixture(t) {
    const parent = mkdtempSync(join(tmpdir(), 'worker-delivery-test-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'main'); const cRoot = join(parent, 'source');
    for (const path of [root, cRoot]) {
        mkdirSync(path); git(path, 'init', '-qb', 'main');
        git(path, 'config', 'user.name', 'Delivery fixture');
        git(path, 'config', 'user.email', 'fixture@example.invalid');
        git(path, 'config', 'commit.gpgsign', 'false');
    }
    mkdirSync(join(cRoot, 'src'));
    // A second source function lets partial deliveries keep an honest blocked unit.
    writeFileSync(join(cRoot, 'src/sample.c'), 'int\nsample(void)\n{\n    return 1;\n}\nint\nother(void)\n{\n    return 2;\n}\n');
    // A same-named function from a second file exposes owner collisions.
    writeFileSync(join(cRoot, 'src/foreign.c'), 'int\nsample(void)\n{\n    return 3;\n}\n');
    git(cRoot, 'add', 'src/sample.c', 'src/foreign.c'); git(cRoot, 'commit', '-qm', 'source fixture');
    git(root, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', cRoot, 'nethack-c/upstream');
    for (const dir of ['js', 'scripts', 'sessions']) mkdirSync(join(root, dir));
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    writeFileSync(join(root, 'js/sample.js'), 'export function sample() { return 0; }\nexport function caller() { return sample(); }\n');
    writeFileSync(join(root, 'scripts/sample.test.mjs'), "import { sample } from '../js/sample.js';\nvoid sample;\n");
    // This unchanged importer is deliberately absent from source evidence.
    writeFileSync(join(root, 'scripts/importer-only.test.mjs'), "import { caller } from '../js/sample.js';\nvoid caller;\n");
    writeFileSync(join(root, 'QUALITY.json'), JSON.stringify({ areas: [{ paths: ['js/sample.js'] }] }));
    // The long fixed route makes a renamed/redated copy unambiguous.
    writeFileSync(join(root, 'sessions/fixed.session.json'), JSON.stringify({ segments: [{ seed: 360, moves: 'hhjjkkll' }] }));
    git(root, 'add', '.gitignore', '.gitmodules', 'nethack-c/upstream', 'js/sample.js',
        'scripts/sample.test.mjs', 'scripts/importer-only.test.mjs', 'QUALITY.json', 'sessions/fixed.session.json');
    git(root, 'commit', '-qm', 'base fixture');
    const base = git(root, 'rev-parse', 'HEAD');
    const workers = {};
    for (const name of ['A', 'B']) {
        const path = join(parent, name); workers[name] = path;
        git(root, 'worktree', 'add', '-qb', `worker/${name}`, path);
        git(path, '-c', 'protocol.file.allow=always', 'submodule', 'update', '--init', '--checkout', '--no-fetch');
        mkdirSync(join(path, '.cache'));
    }
    const file = join(root, '.cache/worker-state.json');
    const run = (args, cwd = root) => spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    const success = (args, cwd = root) => {
        const result = run(args, cwd);
        assert.equal(result.status, 0, result.stderr || result.stdout);
        return JSON.parse(result.stdout);
    };
    let sequence = 0;
    const event = (payload, cwd = root) => success(['event', '--file', file,
        '--json', JSON.stringify({ id: `fixture-${++sequence}`, ...payload })], cwd);
    success(['init', '--run', 'fixture']);
    for (const name of ['A', 'B']) event({ type: 'register', worker: name,
        worktree: workers[name], branch: `worker/${name}`, base, handle: `handle-${name}` });
    const assign = (name = 'A', task = 'A-1', reservations = ['source:sample.c:sample']) => event({
        type: 'assign', task, worker: name, goal: 'sample-port', span: 'sample', seed: null,
        base: git(workers[name], 'rev-parse', 'HEAD'), reservations,
        allowedPaths: ['js/sample.js', 'scripts/sample.test.mjs', 'recipes/sample.c/'],
    }, workers[name]);
    const artifacts = (name = 'A') => {
        const path = workers[name];
        writeFileSync(join(path, '.cache/context.json'), JSON.stringify({ goal: 'sample-port',
            kind: 'file-port', cFile: 'sample.c', functions: ['sample'] }));
        writeFileSync(join(path, '.cache/evidence.json'), JSON.stringify({ functions: [{
            name: 'sample', implementation: 'js/sample.js', sourceReview: 'Fixture return and caller checked.',
            callers: [{ path: 'js/sample.js', symbol: 'caller', source: 'sample.c caller fixture' }],
            pure: true, tests: ['scripts/sample.test.mjs'], recordings: [],
        }], entryPointReview: 'Helper-only fixture.', entryPoints: [] }));
        const log = join(path, '.cache/check.log');
        writeFileSync(log, 'Transport fixture: a completed check result, not a real game-validation claim.\n');
        writeFileSync(join(path, '.cache/checks.json'), JSON.stringify(['focused', 'lint'].map(kind => ({
            kind, command: ['fixture-check', kind], exitCode: 0, log,
        }))));
    };
    const commit = (name = 'A') => {
        const path = workers[name];
        writeFileSync(join(path, 'js/sample.js'), 'export function sample() { return 1; }\nexport function caller() { return sample(); }\n');
        git(path, 'add', 'js/sample.js'); git(path, 'commit', '-qm', 'delivery fixture');
        return git(path, 'rev-parse', 'HEAD');
    };
    const submitArgs = ['submit', '--task', 'A-1', '--file', file, '--context', '.cache/context.json',
        '--evidence', '.cache/evidence.json', '--checks', '.cache/checks.json'];
    return { parent, root, workers, file, base, git, run, success, event, assign, artifacts, commit, submitArgs };
}

test('unified queue delivers through source-evidence gates and reworks from another persistent worktree', t => {
    const f = fixture(t);
    writeFileSync(join(f.root, 'SCORE.tsv'), COLUMNS.join('\t') + '\n');
    f.git(f.root, 'add', 'SCORE.tsv'); f.git(f.root, 'commit', '-qm', 'score schema');
    const base = f.git(f.root, 'rev-parse', 'HEAD'), prep = join(f.parent, 'Prep');
    for (const worker of ['A', 'B']) f.event({type: 'observe', worker, handle: null, processes: []});
    f.git(f.root, 'worktree', 'add', '-qb', 'worker/Prep', prep);
    f.event({type: 'register', worker: 'Prep', worktree: prep, branch: 'worker/Prep', base, handle: 'handle-Prep'});
    queueCommand('enable', {file: f.file, prep}, f.root);
    for (const [old, worker] of [['A', 'Worker-1'], ['B', 'Worker-2']]) f.event({type: 'register', worker,
        worktree: f.workers[old], branch: `worker/${old}`, base: f.base, handle: `handle-${worker}`});
    const queue = join(f.root, '.cache/current-queue.json');
    writeFileSync(queue, JSON.stringify({mode: 'work', sessions: [{session: 'fixture-case'}],
        blockers: [], synthetic: {batches: []}}));
    queueCommand('refresh', {file: f.file, queue}, f.root);
    const imported = Object.keys(f.success(['status', '--file', f.file]).queue.tasks)[0];
    queueCommand('supersede', {file: f.file, task: imported, reason: 'Use the scoped source-plan assignment.'}, f.root);
    const json = join(f.root, '.cache/assignment.json');
    writeFileSync(json, JSON.stringify({id: 'source-fix', type: 'implementation', output: 'implementation',
        producer: 'Main', recipient: 'Main', question: 'Implement sample from C.', stop: 'Submit source evidence.',
        base, sessions: ['fixture-case'], goal: 'sample-port', dependencies: [], checks: ['focused', 'lint'], artifacts: [],
        reservations: ['session:fixture-case', 'source:sample.c:sample'],
        allowedPaths: ['js/sample.js', 'scripts/sample.test.mjs', 'recipes/sample.c/']}));
    queueCommand('enqueue', {file: f.file, json}, f.root);
    const claim = queueCommand('claim', {file: f.file, worker: 'Worker-1'}, f.workers.A);
    f.artifacts('A'); const revision = f.commit('A');
    const submit = f.submitArgs.map((arg, index) => index === 2 ? claim.transport : arg);
    let state = f.success(submit, f.workers.A);
    assert.equal(state.queue.tasks['source-fix'].status, 'completed');
    assert.equal(state.tasks[claim.transport].status, 'ready');
    const evidence = state.deliveries[revision].evidence, bytes = readFileSync(evidence, 'utf8');
    f.event({type: 'feedback', task: claim.transport, delivery: revision, reason: 'Preserve the demonstrated correction.'});
    const correction = queueCommand('claim', {file: f.file, worker: 'Worker-2'}, f.workers.B);
    assert.equal(correction.target, revision);
    f.artifacts('B');
    const source = join(f.workers.B, 'js/sample.js');
    writeFileSync(source, readFileSync(source, 'utf8') + '// Correction fixture.\n');
    f.git(f.workers.B, 'add', 'js/sample.js'); f.git(f.workers.B, 'commit', '-qm', 'correction fixture');
    state = f.success(submit, f.workers.B);
    assert.equal(state.queue.tasks[correction.id].status, 'completed');
    assert.equal(state.queue.tasks['source-fix'].worker, 'Worker-1');
    assert.equal(state.tasks[claim.transport].worker, 'Worker-2');
    assert.equal(state.tasks[claim.transport].deliveries.length, 2);
    assert.equal(readFileSync(evidence, 'utf8'), bytes);
});

test('submission rejects malformed committed investigation before saving a ready delivery', t => {
    const f = fixture(t); const assigned = f.assign(); f.artifacts(); f.commit();
    const worker = f.workers.A, path = 'investigations/fixed.json';
    f.event({ type: 'scope', task: 'A-1', reservations: assigned.tasks['A-1'].reservations,
        allowedPaths: [...assigned.tasks['A-1'].allowedPaths, path] }, worker);
    const report = { session: 'fixed', commit: f.base, status: 'complete',
        remainingScreensUpperBound: 2, summary: 'A two-screen source defect.',
        goalKind: 'file-port', source: { file: 'sample.c', functions: ['sample'],
            branch: 'Return value.', callers: ['caller'], dependencies: [] },
        evidence: ['Read sample.c.'], mismatch: {} }; // Reproduce the omitted canonical mismatch fields.
    mkdirSync(join(worker, 'investigations'));
    const save = () => {
        writeFileSync(join(worker, path), JSON.stringify(report));
        f.git(worker, 'add', path); f.git(worker, 'commit', '-qm', 'investigation fixture');
    };
    save();
    const ledgerBefore = readFileSync(f.file, 'utf8');
    const rejected = f.run(f.submitArgs, worker);
    assert.match(rejected.stderr, /invalid investigation report/);
    assert.equal(readFileSync(f.file, 'utf8'), ledgerBefore);
    assert.equal(existsSync(`${f.file}.deliveries`), false, 'no malformed packet is saved');
    // A valid uncommitted repair cannot conceal the invalid submitted blob.
    report.mismatch = { session: 'fixed', remainingScreensUpperBound: 2 };
    writeFileSync(join(worker, path), JSON.stringify(report));
    assert.match(f.run(f.submitArgs, worker).stderr, /invalid investigation report/);
    save();
    const state = f.success(f.submitArgs, worker);
    assert.equal(state.tasks['A-1'].status, 'ready');
});

test('submission requires the assigned session report even when no report path changed', t => {
    const f = fixture(t), worker = f.workers.A;
    f.event({ type: 'assign', task: 'A-1', worker: 'A', goal: 'sample-port', seed: 'fixed', base: f.base,
        reservations: ['source:sample.c:sample'], allowedPaths: ['js/sample.js', 'investigations/fixed.json'] }, worker);
    f.artifacts(); f.commit();
    const before = readFileSync(f.file, 'utf8');
    assert.match(f.run(f.submitArgs, worker).stderr, /investigation report must be a regular/);
    assert.equal(readFileSync(f.file, 'utf8'), before);
});

test('worker submits durably and starts another task before receipt; snapshots survive changed evidence', (t) => {
    const f = fixture(t); const assigned = f.assign(); f.artifacts(); f.commit();
    const addedTest = 'scripts/delivered.test.mjs';
    f.event({ type: 'scope', task: 'A-1', reservations: assigned.tasks['A-1'].reservations,
        allowedPaths: [...assigned.tasks['A-1'].allowedPaths, addedTest] }, f.workers.A);
    // This evidence reference exists only in the submitted commit, not in the
    // coordinator checkout. Ignoring the commit now breaks the positive case.
    writeFileSync(join(f.workers.A, addedTest), '/* Delivery-only evidence fixture. */\n');
    const evidencePath = join(f.workers.A, '.cache/evidence.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    evidence.functions[0].tests.push(addedTest);
    writeFileSync(evidencePath, JSON.stringify(evidence));
    f.git(f.workers.A, 'add', addedTest); f.git(f.workers.A, 'commit', '-qm', 'delivery-only test');
    const head = f.git(f.workers.A, 'rev-parse', 'HEAD');
    const submitted = f.success(f.submitArgs, f.workers.A);
    const first = submitted.deliveries[head];
    assert.equal(first.delivery, head);
    const retry = f.success(f.submitArgs, f.workers.A);
    assert.equal(retry.deliveries[head].readyAt, first.readyAt);
    f.assign('A', 'A-2', ['source:sample.c:next']);
    writeFileSync(join(f.workers.A, '.cache/evidence.json'), '{"next":"task"}');
    writeFileSync(join(f.workers.A, 'js/sample.js'), 'unfinished next-task edits\n');
    const next = f.success(['next']);
    assert.equal(next.unread[0].delivery, head);
    assert.equal(next.integration.delivery, head);
    // Saved scheduling evidence is separate from delivery integration: sample
    // is still reserved, whereas an unknown cause can be investigated now.
    writeFileSync(join(f.root, 'SCORE.tsv'), COLUMNS.join('\t') + '\n');
    const queuePath = join(f.root, '.cache/work-queue.json');
    const queue = { mode: 'work', synthetic: { batches: [] }, sessions: [
        { session: 'reserved-cause', investigation: { status: 'complete',
            result: { source: { file: 'sample.c', functions: ['sample'] } } } },
        { session: 'new-cause' },
    ], blockers: [], selectionBlocked: false };
    writeFileSync(queuePath, JSON.stringify(queue));
    const availability = f.success(['next', '--queue', queuePath]);
    assert.equal(availability.pendingMainWork.deliveries.length, 1);
    assert.equal(availability.workerWork.candidateGroups, 1);
    assert.deepEqual(availability.workerWork.investigations, ['new-cause']);
    assert.deepEqual(availability.workerWork.unavailable[0].blockedBy, ['A-1']);
    assert.equal(availability.integration.delivery, head, 'availability does not interrupt integration');
    writeFileSync(queuePath, JSON.stringify({ ...queue, mode: 'fixed' }));
    const blocked = f.success(['next', '--queue', queuePath]).workerWork;
    assert.equal(blocked.status, 'unknown');
    assert.equal(blocked.candidateGroups, null, 'invalid evidence must not appear as measured zero');
    f.event({ type: 'received', task: 'A-1', delivery: head });
    const packet = JSON.parse(readFileSync(first.evidence, 'utf8'));
    assert.equal(packet.functions[0].name, 'sample');
    assert.equal(packet.git.head, head);
    const preflight = f.success(['preflight', '--task', 'A-1', '--commit', head]);
    assert.equal(preflight.passed, true); // Reads Git, not the worker's new dirty file.
    assert.deepEqual(preflight.focusedTests, [addedTest, 'scripts/importer-only.test.mjs', 'scripts/sample.test.mjs']);
});

test('delivery preflight rejects committed evidence tests outside discovered roots', t => {
    const f = fixture(t); f.assign(); f.artifacts(); f.commit();
    const submitted = f.success(f.submitArgs, f.workers.A);
    const head = f.git(f.workers.A, 'rev-parse', 'HEAD');
    assert.ok(submitted.deliveries[head]);
    assert.equal(f.success(['preflight', '--task', 'A-1', '--commit', head]).passed, true);
    const path = 'diagnostics/reviews/check.test.mjs';
    mkdirSync(join(f.workers.A, 'diagnostics/reviews'), { recursive: true });
    writeFileSync(join(f.workers.A, path), '');
    f.git(f.workers.A, 'add', path); f.git(f.workers.A, 'commit', '-qm', 'stray evidence runner');
    const candidate = f.git(f.workers.A, 'rev-parse', 'HEAD');
    rmSync(join(f.workers.A, path));
    const result = f.run(['preflight', '--task', 'A-1', '--commit', candidate]);
    assert.equal(result.status, 1);
    assert.ok(JSON.parse(result.stdout).issues.some(issue =>
        issue.includes('test discovery: test files outside discovered roots: diagnostics/reviews/check.test.mjs')));
});

test('partial source delivery requires an explicit blocker and committed recipe', (t) => {
    const f = fixture(t);
    f.assign('A', 'A-1', ['source:sample.c:sample', 'source:sample.c:other']);
    f.artifacts();
    const worker = f.workers.A;
    const contextPath = join(worker, '.cache/context.json');
    const context = JSON.parse(readFileSync(contextPath, 'utf8'));
    context.functions.push('other');
    writeFileSync(contextPath, JSON.stringify(context));
    f.commit();

    const evidencePath = join(worker, '.cache/evidence.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    const blockedRecipe = 'recipes/sample.c/other-blocked.session.json';
    evidence.incompleteFunctions = [{ name: 'other', reason: 'The caller setup stops before other().',
        blockedRecipe }];
    writeFileSync(evidencePath, JSON.stringify(evidence));
    assert.match(f.run(f.submitArgs, worker).stderr, /committed blocked recipe/u);

    mkdirSync(join(worker, 'recipes/sample.c'), { recursive: true });
    writeFileSync(join(worker, blockedRecipe), '{"segments":[]}\n');
    f.git(worker, 'add', blockedRecipe);
    f.git(worker, 'commit', '-qm', 'preserve blocked source setup');
    evidence.incompleteFunctions[0].reason = '';
    writeFileSync(evidencePath, JSON.stringify(evidence));
    assert.match(f.run(f.submitArgs, worker).stderr, /blocker reason/u);
    evidence.incompleteFunctions[0].reason = 'The caller setup stops before other().';
    writeFileSync(evidencePath, JSON.stringify(evidence));
    const submitted = f.success(f.submitArgs, worker);
    const head = f.git(worker, 'rev-parse', 'HEAD');
    const packet = JSON.parse(readFileSync(submitted.deliveries[head].evidence, 'utf8'));
    assert.deepEqual(packet.functions.map(entry => entry.name), ['sample']);
    assert.deepEqual(packet.incompleteFunctions, evidence.incompleteFunctions);
});

test('a partial single-function delivery needs an evidenced entry and fresh replay', (t) => {
    const f = fixture(t);
    f.assign();
    f.artifacts();
    f.commit();
    const worker = f.workers.A;
    const blockedRecipe = 'recipes/sample.c/sample-blocked.session.json';
    mkdirSync(join(worker, 'recipes/sample.c'), { recursive: true });
    writeFileSync(join(worker, blockedRecipe), '{"segments":[]}\n');
    f.git(worker, 'add', blockedRecipe);
    f.git(worker, 'commit', '-qm', 'preserve blocked source setup');

    const evidencePath = join(worker, '.cache/evidence.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    evidence.functions = [];
    evidence.incompleteFunctions = [{ name: 'sample',
        reason: 'Other source branches are still incomplete.', blockedRecipe }];
    evidence.entryPoints = [{ name: 'sample caller', functions: ['sample'],
        recordings: [], synthetic: [] }];
    writeFileSync(evidencePath, JSON.stringify(evidence));
    assert.match(f.run(f.submitArgs, worker).stderr, /replay-verified partial entry point/u);

    evidence.entryPoints[0].synthetic = [{ batch: 'v1', caseId: 'sample-caller',
        segment: 0, fromStep: 0, throughStep: 1, source: 'sample.c caller' }];
    writeFileSync(evidencePath, JSON.stringify(evidence));
    assert.match(f.run(f.submitArgs, worker).stderr, /replay-verified partial entry point/u);

    const checksPath = join(worker, '.cache/checks.json');
    const checks = JSON.parse(readFileSync(checksPath, 'utf8'));
    checks.push({ kind: 'fresh', command: ['fixture-check', 'fresh'],
        exitCode: 0, log: join(worker, '.cache/check.log') });
    writeFileSync(checksPath, JSON.stringify(checks));
    const submitted = f.success(f.submitArgs, worker);
    const head = f.git(worker, 'rev-parse', 'HEAD');
    const packet = JSON.parse(readFileSync(submitted.deliveries[head].evidence, 'utf8'));
    assert.deepEqual(packet.functions, []);
    assert.equal(packet.incompleteFunctions[0].name, 'sample');
});

test('Prep submissions enforce saved comparisons, preserve old packets and require Main to approve controls', async t => {
    const f = fixture(t);
    const worker = f.workers.B;
    // A previously accepted checkpoint is the comparison anchor. These are
    // transport fixtures, not claims of a real source port or game validation.
    let ledger = JSON.parse(readFileSync(f.file));
    for (const event of [
        {type: 'assign', task: 'baseline', worker: 'A', goal: 'baseline', seed: null, base: f.base,
            reservations: ['source:sample.c:baseline'], allowedPaths: ['js/']},
        {type: 'ready', task: 'baseline', delivery: f.base, base: f.base, commits: [f.base],
            paths: ['js/sample.js'], evidence: join(f.root, '.cache/baseline.json'), dependencies: []},
        {type: 'integrating', task: 'baseline', integration: f.base},
        {type: 'validated', task: 'baseline', passed: true, checkpoint: join(f.root, '.cache/checkpoint.json')},
        {type: 'accepted', task: 'baseline'},
    ]) ledger = recordEvent(ledger, {id: `baseline-${event.type}`, ...event});
    writeFileSync(f.file, JSON.stringify(ledger));
    const unauthorized = f.run(['event', '--file', f.file, '--json', JSON.stringify({id: 'approve-own-control',
        type: 'assign', task: 'prep-v2', worker: 'B', kind: 'challenge-preparation', seed: null, base: f.base,
        reservations: ['challenge-batch:v2'], allowedPaths: ['challenges/cases/v2/'], controlCases: ['alpha']})], worker);
    assert.match(unauthorized.stderr, /only the Work lead may authorize/u);
    f.event({ type: 'assign', task: 'prep-v2', worker: 'B',
        kind: 'challenge-preparation', seed: null, base: f.base,
        reservations: ['challenge-batch:v2'], allowedPaths: ['challenges/cases/v2/'] }, worker);
    const directory = join(worker, 'challenges/cases/v2');
    mkdirSync(directory, { recursive: true });
    const segment = { seed: 891, datetime: '20010412120000', nethackrc: '', moves: 'i' };
    const recipePath = 'challenges/cases/v2/alpha.recipe.json';
    const recordingPath = 'challenges/cases/v2/alpha.session.json';
    const recipe = JSON.stringify({ version: 5, segments: [segment] }) + '\n';
    const recording = JSON.stringify({ version: 5, segments: [{ ...segment,
        steps: [{ key: '', screen: 'C screen', cursor: [0, 0, 1], rng: [] }] }] }) + '\n';
    writeFileSync(join(worker, recipePath), recipe);
    writeFileSync(join(worker, recordingPath), recording);
    f.git(worker, 'add', recipePath, recordingPath);
    f.git(worker, 'commit', '-qm', 'prepare C cases');
    const head = f.git(worker, 'rev-parse', 'HEAD');
    const manifest = { version: 1, batch: 'v2', cases: [{
        id: 'alpha', title: 'Inventory from C',
        reproducibility: 'Independent C replay matched every recorded step.',
        recipe: recipePath, recipeSha256: digest(recipe),
        recording: recordingPath, recordingSha256: digest(recording),
    }] };
    writeFileSync(join(worker, '.cache/context.json'),
        JSON.stringify({ kind: 'challenge-preparation', batch: 'v2' }));
    const evidencePath = join(worker, '.cache/evidence.json');
    writeFileSync(evidencePath, JSON.stringify({ missionPlan: 'Exercise C inventory startup.',
        manifest }));
    const log = join(worker, '.cache/replay.log');
    writeFileSync(log, 'Independent C replay matched the recorded screen and trace.\n');
    writeFileSync(join(worker, '.cache/checks.json'), JSON.stringify([{
        kind: 'fresh', caseId: 'alpha', command: ['fixture-c-replay', recipePath],
        exitCode: 0, log,
    }]));
    const args = ['submit', '--task', 'prep-v2', '--file', f.file,
        '--context', '.cache/context.json', '--evidence', '.cache/evidence.json',
        '--checks', '.cache/checks.json'];
    const comparisonLog = join(worker, '.cache/comparison.log');
    const comparison = {passed: false, error: null, screenMismatch: {index: 0, kind: 'cell'},
        provenance: {commit: f.base, recordingSha256: digest(recording)}};
    const checks = JSON.parse(readFileSync(join(worker, '.cache/checks.json')));
    checks.push({kind: 'comparison', caseId: 'alpha', command: ['fixture-js-comparison', recordingPath, f.base],
        exitCode: 0, log: comparisonLog});
    const saveComparison = result => writeFileSync(comparisonLog,
        `__FRESH_DIFF_RESULT__\n${JSON.stringify(result)}\nbounded fixture: success\n`);
    assert.match(f.run(args, worker).stderr, /needs exactly one saved comparison/u);
    writeFileSync(join(worker, '.cache/checks.json'), JSON.stringify(checks));
    for (const [label, result, message] of [
        ['rejects an unrequested passing control', {...comparison, passed: true, screenMismatch: null}, /must have a saved mismatch/u],
        ['rejects a comparison for another recording', {...comparison, provenance: {...comparison.provenance, recordingSha256: '0'.repeat(64)}}, /recording hash differs/u],
        ['rejects a comparison against an unaccepted commit', {...comparison, provenance: {...comparison.provenance, commit: head}}, /must be an accepted Main/u],
        ['rejects a runner error without an observed mismatch', {...comparison, error: 'runner failed', screenMismatch: null}, /must have a saved mismatch/u],
    ]) {
        await t.test(label, () => {
            saveComparison(result);
            assert.match(f.run(args, worker).stderr, message);
            assert.equal(f.success(['status']).tasks['prep-v2'].status, 'working', 'rejection must not mark the task ready');
        });
    }
    saveComparison(comparison);
    const bad = { ...manifest, cases: [{ ...manifest.cases[0], recordingSha256: '0'.repeat(64) }] };
    writeFileSync(evidencePath, JSON.stringify({ missionPlan: 'Exercise C inventory startup.',
        manifest: bad }));
    assert.match(f.run(args, worker).stderr, /recording hash differs/);
    writeFileSync(evidencePath, JSON.stringify({ missionPlan: 'Exercise C inventory startup.',
        manifest }));
    const submitted = f.success(args, worker);
    assert.equal(submitted.deliveries[head].delivery, head);
    const packet = JSON.parse(readFileSync(submitted.deliveries[head].evidence, 'utf8'));
    assert.equal(packet.checks.find(check => check.kind === 'comparison').output, readFileSync(comparisonLog, 'utf8'));
    assert.deepEqual(packet.manifest, manifest);
    assert.deepEqual(preparedFromDelivery(submitted.deliveries[head].evidence), manifest);
    assert.equal(f.git(worker, 'ls-tree', '-r', '--name-only', head, '--',
        'challenges/manifests'), '');
    // Reuse the tiny fixture recording to test batch scoping and dependency
    // inference, not gameplay novelty. v3 starts before v2 is accepted.
    const nextRecipe = recipePath.replace('/v2/', '/v3/');
    const nextRecording = recordingPath.replace('/v2/', '/v3/');
    f.event({ type: 'assign', task: 'prep-v3', worker: 'B',
        kind: 'challenge-preparation', seed: null, base: head,
        reservations: ['challenge-batch:v3'], allowedPaths: ['challenges/cases/v3/'] }, worker);
    mkdirSync(join(worker, 'challenges/cases/v3'), { recursive: true });
    writeFileSync(join(worker, nextRecipe), recipe);
    writeFileSync(join(worker, nextRecording), recording);
    f.git(worker, 'add', nextRecipe, nextRecording);
    f.git(worker, 'commit', '-qm', 'prepare next batch before acceptance');
    const nextHead = f.git(worker, 'rev-parse', 'HEAD');
    const nextManifest = { ...manifest, batch: 'v3', cases: [{ ...manifest.cases[0],
        recipe: nextRecipe, recording: nextRecording }] };
    writeFileSync(join(worker, '.cache/context.json'),
        JSON.stringify({ kind: 'challenge-preparation', batch: 'v3' }));
    writeFileSync(evidencePath, JSON.stringify({ missionPlan: 'Exercise next batch submission.', manifest: nextManifest }));
    // Main can advance while Prep works. The earlier accepted comparison
    // remains admissible; the gate must not demand a new replay at latest Main.
    const advanced = recordEvent(JSON.parse(readFileSync(f.file)), {id: 'advanced-accepted-main',
        type: 'tooling-published', tested: head, commit: head, checkpoint: join(f.root, '.cache/later-checkpoint.json')});
    writeFileSync(f.file, JSON.stringify(advanced));
    const next = f.success(args.map(arg => arg === 'prep-v2' ? 'prep-v3' : arg), worker);
    assert.equal(next.tasks['prep-v2'].status, 'ready');
    assert.deepEqual(next.deliveries[nextHead].commits, [nextHead]);
    assert.deepEqual(next.deliveries[nextHead].paths.sort(), [nextRecipe, nextRecording].sort());
    assert.deepEqual(next.deliveries[nextHead].dependencies, [head]);
    assert.deepEqual(preparedFromDelivery(next.deliveries[head].evidence), manifest,
        'the earlier immutable packet survives new worktree-local evidence');
    f.git(f.root, 'cherry-pick', head);
    const preflight = f.success(['preflight', '--task', 'prep-v2']);
    assert.equal(preflight.passed, true);
    // Simulate an immutable packet submitted before the new gate. Preflight
    // must not retrofit the requirement onto historical deliveries.
    const oldPacket = JSON.parse(readFileSync(submitted.deliveries[head].evidence, 'utf8'));
    oldPacket.checks = oldPacket.checks.filter(check => check.kind !== 'comparison');
    const oldBytes = JSON.stringify(oldPacket, null, 2) + '\n', oldPath = join(`${f.file}.deliveries`, `${digest(oldBytes)}.json`);
    writeFileSync(oldPath, oldBytes);
    const historical = JSON.parse(readFileSync(f.file));
    historical.events.find(event => event.type === 'ready' && event.task === 'prep-v2').evidence = oldPath;
    writeFileSync(f.file, JSON.stringify(historical, null, 2) + '\n');
    assert.equal(f.success(['preflight', '--task', 'prep-v2']).passed, true, 'grandfathered packets need no new comparison');
    writeFileSync(join(worker, '.cache/context.json'), JSON.stringify(oldPacket.context));
    writeFileSync(evidencePath, JSON.stringify({missionPlan: oldPacket.missionPlan, manifest}));
    writeFileSync(join(worker, '.cache/checks.json'), JSON.stringify(checks.filter(check => check.kind !== 'comparison')));
    const beforeRetry = readFileSync(f.file, 'utf8');
    f.success([...args, '--head', head], worker);
    assert.equal(readFileSync(f.file, 'utf8'), beforeRetry, 'an exact historical submission retry remains unchanged');
    // A coordinator-issued exception is specific to a future task and case;
    // putting approval text in worker evidence cannot grant it.
    f.event({type: 'assign', task: 'prep-v4', worker: 'B', kind: 'challenge-preparation', seed: null, base: nextHead,
        reservations: ['challenge-batch:v4'], allowedPaths: ['challenges/cases/v4/'], controlCases: ['alpha']});
    const controlRecipe = recipePath.replace('/v2/', '/v4/'), controlRecording = recordingPath.replace('/v2/', '/v4/');
    mkdirSync(join(worker, 'challenges/cases/v4'), {recursive: true});
    writeFileSync(join(worker, controlRecipe), recipe); writeFileSync(join(worker, controlRecording), recording);
    f.git(worker, 'add', controlRecipe, controlRecording); f.git(worker, 'commit', '-qm', 'Requested control');
    writeFileSync(join(worker, '.cache/context.json'), JSON.stringify({kind: 'challenge-preparation', batch: 'v4'}));
    writeFileSync(evidencePath, JSON.stringify({missionPlan: 'Explicitly requested transport control.', manifest: {
        ...manifest, batch: 'v4', cases: [{...manifest.cases[0], recipe: controlRecipe, recording: controlRecording}]}}));
    saveComparison({...comparison, passed: true, screenMismatch: null});
    writeFileSync(join(worker, '.cache/checks.json'), JSON.stringify(checks));
    assert.equal(f.success(args.map(arg => arg === 'prep-v2' ? 'prep-v4' : arg), worker).tasks['prep-v4'].status, 'ready');
});

test('integration permits changed context only when every delivered edit matches', async (t) => {
    for (const value of [1, 2]) await t.test(`integrated return ${value}`, t => {
        const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
        f.success(f.submitArgs, f.workers.A);
        f.event({ type: 'received', task: 'A-1', delivery: head });
        const source = result => `export function sample() { return ${result}; }\n`
            + 'export function caller() { /* accepted context */ return sample(); }\n';
        writeFileSync(join(f.root, 'js/sample.js'), source(0));
        f.git(f.root, 'add', 'js/sample.js'); f.git(f.root, 'commit', '-qm', 'new caller context');
        assert.equal(f.run(['preflight', '--task', 'A-1']).status, 1);
        writeFileSync(join(f.root, 'js/sample.js'), source(value));
        f.git(f.root, 'add', 'js/sample.js'); f.git(f.root, 'commit', '-qm', 'resolved delivery');
        // Even the correct edit has a different ordinary Git patch identity.
        assert.match(f.git(f.root, 'cherry', 'HEAD', head, f.base), /^\+/);
        const result = f.run(['preflight', '--task', 'A-1']);
        assert.equal(JSON.parse(result.stdout).passed, value === 1);
        const event = { type: 'integrating', task: 'A-1', integration: f.git(f.root, 'rev-parse', 'HEAD') };
        if (value === 1) f.event(event);
        else assert.throws(() => f.event(event), /missing delivered patches/);
    });
});

test('preflight ignores oversized unrelated Prep recordings for exact snapshots and changed-context patches', async t => {
    for (const proof of ['exact snapshot', 'changed context']) await t.test(proof, t => {
        const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
        f.success(f.submitArgs, f.workers.A);
        f.event({type: 'received', task: 'A-1', delivery: head});
        const path = 'challenges/cases/v2/unrelated.session.json';
        mkdirSync(join(f.root, 'challenges/cases/v2'), {recursive: true});
        // One MiB beyond the production 32 MiB Git-output bound reproduces ENOBUFS
        // if preflight hashes this unrelated commit's full recording patch.
        writeFileSync(join(f.root, path), JSON.stringify({screen: 'x'.repeat(33 * 1024 * 1024)}));
        f.git(f.root, 'add', path); f.git(f.root, 'commit', '-qm', 'Unrelated large Prep recording');
        const source = value => `export function sample() { return ${value}; }\n`
            + (proof === 'exact snapshot' ? 'export function caller() { return sample(); }\n'
                : 'export function caller() { /* accepted context */ return sample(); }\n');
        // A different return (-1) forces snapshot proof; changed caller context
        // with the original return (0) forces context-free full-patch proof.
        writeFileSync(join(f.root, 'js/sample.js'), source(proof === 'exact snapshot' ? -1 : 0));
        f.git(f.root, 'add', 'js/sample.js'); f.git(f.root, 'commit', '-qm', 'New accepted source context');
        writeFileSync(join(f.root, 'js/sample.js'), source(1));
        f.git(f.root, 'add', 'js/sample.js'); f.git(f.root, 'commit', '-qm', 'Resolve submitted source edit');
        assert.match(f.git(f.root, 'cherry', 'HEAD', head, f.base), /^\+/);
        const result = f.run(['preflight', '--task', 'A-1']);
        assert.equal(result.status, 0, result.stderr || result.stdout);
        assert.equal(JSON.parse(result.stdout).passed, true);
        f.event({type: 'integrating', task: 'A-1', integration: f.git(f.root, 'rev-parse', 'HEAD')});
    });
});

test('path-filtered patch identity still rejects a candidate commit with extra edits', t => {
    const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
    f.success(f.submitArgs, f.workers.A);
    // Different caller context prevents exact-snapshot proof, so only complete
    // patch identity can establish this delivery. The extra file changes that identity.
    const source = value => `export function sample() { return ${value}; }\n`
        + 'export function caller() { /* accepted context */ return sample(); }\n';
    writeFileSync(join(f.root, 'js/sample.js'), source(0));
    f.git(f.root, 'add', 'js/sample.js'); f.git(f.root, 'commit', '-qm', 'New caller context');
    writeFileSync(join(f.root, 'js/sample.js'), source(1));
    writeFileSync(join(f.root, 'extra.txt'), 'Unrelated edit in the same commit.\n');
    f.git(f.root, 'add', 'js/sample.js', 'extra.txt'); f.git(f.root, 'commit', '-qm', 'Mixed source patch');
    const result = JSON.parse(f.run(['preflight', '--task', 'A-1']).stdout);
    assert.equal(result.passed, false);
    assert.match(result.issues.join('\n'), /missing delivered patches/);
});

test('submission rejects evidence references found only in an uncommitted checkout', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); f.commit();
    const path = join(f.workers.A, '.cache/evidence.json');
    const evidence = JSON.parse(readFileSync(path, 'utf8'));
    evidence.functions[0].callers[0].symbol = 'checkoutOnly';
    writeFileSync(path, JSON.stringify(evidence));
    writeFileSync(join(f.workers.A, 'js/sample.js'),
        'export function sample() { return 1; }\nexport function checkoutOnly() { return sample(); }\n');
    const result = f.run(f.submitArgs, f.workers.A);
    assert.equal(result.status, 1); // The claimed caller is absent from HEAD.
    assert.match(result.stderr, /checkoutOnly/);
    assert.deepEqual(f.success(['status']).deliveries, {});
});

test('a rejected private-cache delivery can be replaced without dropping source or dependency checks', async t => {
    for (const scenario of ['identical source', 'changed source', 'new cache', 'wrong packet', 'unaccepted dependency']) {
        await t.test(scenario, t => {
            const f = fixture(t); f.assign(); f.artifacts();
            let dependency;
            if (scenario === 'unaccepted dependency') {
                // The other reservation isolates the transport dependency fixture.
                f.assign('B', 'B-1', ['source:sample.c:other']); f.artifacts('B');
                const otherContext = join(f.workers.B, '.cache/context.json');
                const otherEvidence = join(f.workers.B, '.cache/evidence.json');
                const declaration = JSON.parse(readFileSync(otherContext, 'utf8'));
                declaration.functions = ['other'];
                writeFileSync(otherContext, JSON.stringify(declaration));
                const evidence = JSON.parse(readFileSync(otherEvidence, 'utf8'));
                evidence.functions[0].name = 'other';
                writeFileSync(otherEvidence, JSON.stringify(evidence));
                // The fixture C function other() returns 2; this independent
                // declaration gives the transport dependency its reserved symbol.
                writeFileSync(join(f.workers.B, 'js/sample.js'),
                    'export function other() { return 2; }\nexport function caller() { return other(); }\n');
                f.git(f.workers.B, 'add', 'js/sample.js');
                f.git(f.workers.B, 'commit', '-qm', 'independent dependency fixture');
                dependency = f.git(f.workers.B, 'rev-parse', 'HEAD');
                f.success(f.submitArgs.map(arg => arg === 'A-1' ? 'B-1' : arg), f.workers.B);
            }
            const privatePath = '.cache/private.log';
            const scope = f.success(['status']).tasks['A-1'];
            f.event({ type: 'scope', task: 'A-1', reservations: scope.reservations,
                allowedPaths: [...scope.allowedPaths, '.cache/'] }, f.workers.A);
            const sourceHead = f.commit();
            writeFileSync(join(f.workers.A, privatePath), 'Private transport diagnostic fixture.\n');
            f.git(f.workers.A, 'add', '-f', privatePath);
            f.git(f.workers.A, 'commit', '-qm', 'accidental private cache fixture');
            const original = f.git(f.workers.A, 'rev-parse', 'HEAD');
            const dependencies = dependency ? ['--dependencies', dependency] : ['--dependencies', 'none'];
            const old = f.success([...f.submitArgs, ...dependencies], f.workers.A).deliveries[original];
            f.event({ type: 'received', task: 'A-1', delivery: original });
            f.event({ type: 'feedback', task: 'A-1', delivery: original, reason: 'Keep private cache artifacts untracked.' });
            f.event({ type: 'resume', task: 'A-1' }, f.workers.A);

            // Build the replacement off the original base, preserving worker A's
            // submitted branch, packet, and private file in place.
            f.git(f.workers.B, 'checkout', '--detach', sourceHead);
            if (scenario === 'changed source') {
                // Returning 2 changes the source fixture's result, unlike cache cleanup.
                writeFileSync(join(f.workers.B, 'js/sample.js'),
                    'export function sample() { return 2; }\nexport function caller() { return sample(); }\n');
                f.git(f.workers.B, 'add', 'js/sample.js');
                f.git(f.workers.B, 'commit', '-qm', 'changed source fixture');
            }
            if (scenario === 'new cache') {
                writeFileSync(join(f.workers.B, privatePath), 'Still private.\n');
                f.git(f.workers.B, 'add', '-f', privatePath);
                f.git(f.workers.B, 'commit', '-qm', 'uncorrected private cache fixture');
            }
            // A distinct commit identifies this immutable replacement even if
            // Git created identical source-only commits in both fixture worktrees.
            f.git(f.workers.B, 'commit', '--allow-empty', '-qm', 'replacement fixture identity');
            const replacement = f.git(f.workers.B, 'rev-parse', 'HEAD');
            const contextPath = join(f.workers.A, '.cache/context.json');
            const context = JSON.parse(readFileSync(contextPath, 'utf8'));
            context.replacementPackaging = {
                supersedesCommit: original,
                supersedesPacketSha256: scenario === 'wrong packet' ? 'wrong-packet' : digest(readFileSync(old.evidence)),
                omittedPathPrefix: '.cache/',
            };
            writeFileSync(contextPath, JSON.stringify(context));
            f.success([...f.submitArgs, '--base', f.base, '--head', replacement, ...dependencies], f.workers.A);
            f.event({ type: 'received', task: 'A-1', delivery: replacement });
            f.git(f.root, 'merge', '--ff-only', replacement);
            const result = f.run(['preflight', '--task', 'A-1']);
            if (scenario === 'identical source') {
                assert.equal(result.status, 0, result.stderr || result.stdout);
                f.event({ type: 'integrating', task: 'A-1', integration: replacement });
                assert.equal(f.git(f.root, 'ls-tree', 'HEAD', '--', privatePath), '');
                assert.equal(readFileSync(join(f.workers.A, privatePath), 'utf8'), 'Private transport diagnostic fixture.\n');
                assert.equal(JSON.parse(readFileSync(old.evidence, 'utf8')).git.head, original);
            } else {
                assert.equal(result.status, 1);
                const expected = { 'changed source': /changes non-cache/, 'new cache': /remove.*private cache/,
                    'wrong packet': /different original packet/, 'unaccepted dependency': /dependency is not accepted/ }[scenario];
                assert.match(JSON.parse(result.stdout).issues.join('\n'), expected);
                assert.throws(() => f.event({ type: 'integrating', task: 'A-1', integration: replacement }), expected);
            }
        });
    }
});

test('a valid acceptance event remains coordinator-only', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
    f.success(f.submitArgs, f.workers.A); f.event({ type: 'received', task: 'A-1', delivery: head });
    f.git(f.root, 'merge', '--ff-only', head);
    f.event({ type: 'integrating', task: 'A-1', integration: head });
    const summary = join(f.parent, 'validated.json');
    writeFileSync(summary, JSON.stringify({ commit: head, allPassed: true }));
    f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary });
    const before = readFileSync(f.file, 'utf8');
    const result = f.run(['event', '--file', f.file, '--json',
        JSON.stringify({ id: 'worker-accept', type: 'accepted', task: 'A-1' })], f.workers.A);
    assert.equal(result.status, 1); // Every state precondition holds; only actor ownership rejects it.
    assert.match(result.stderr, /only the Work lead/);
    assert.equal(readFileSync(f.file, 'utf8'), before);
    assert.equal(f.event({ type: 'accepted', task: 'A-1' }).tasks['A-1'].status, 'accepted');
});

test('an exact retry retains inferred dependencies after their acceptance', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); const first = f.commit();
    f.success(f.submitArgs, f.workers.A); f.assign('A', 'A-2');
    // A later source edit supplies a distinct dependent delivery on the same branch.
    writeFileSync(join(f.workers.A, 'js/sample.js'), 'export function sample() { return 2; }\nexport function caller() { return sample(); }\n');
    f.git(f.workers.A, 'add', 'js/sample.js'); f.git(f.workers.A, 'commit', '-qm', 'dependent fixture');
    const second = f.git(f.workers.A, 'rev-parse', 'HEAD');
    const args = [...f.submitArgs.map(arg => arg === 'A-1' ? 'A-2' : arg), '--base', first, '--head', second];
    const original = f.success(args, f.workers.A).deliveries[second];
    assert.deepEqual(original.dependencies, [first]);
    f.event({ type: 'received', task: 'A-1', delivery: first });
    f.git(f.root, 'merge', '--ff-only', first);
    f.event({ type: 'integrating', task: 'A-1', integration: first });
    const summary = join(f.parent, 'first-pass.json');
    writeFileSync(summary, JSON.stringify({ commit: first, allPassed: true }));
    f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary });
    f.event({ type: 'accepted', task: 'A-1' });
    assert.deepEqual(f.success(['accepted-main', '--file', f.file], f.workers.A), {
        task: 'A-1', commit: first, checkpoint: summary,
        acceptedAt: f.success(['status']).deliveries[first].acceptedAt,
    }, 'workers can query accepted Main without merging the active coordinator HEAD');
    const before = readFileSync(f.file, 'utf8');
    assert.deepEqual(f.success(args, f.workers.A).deliveries[second], original);
    assert.equal(readFileSync(f.file, 'utf8'), before); // No new event or timestamp on retry.
    assert.equal(f.run([...args, '--dependencies', 'none'], f.workers.A).status, 1);
    assert.equal(readFileSync(f.file, 'utf8'), before); // Explicit conflicting retries still fail.
});

test('worker-scoped writes reject another worker, central events and overlapping claims', (t) => {
    const f = fixture(t); f.assign();
    for (const payload of [
        { type: 'assign', worker: 'B', task: 'wrong-owner', goal: 'sample-port', span: 'sample', seed: null,
            base: f.base, reservations: ['source:sample.c:other'], allowedPaths: ['js/sample.js'] },
        { type: 'accepted', task: 'A-1' },
        { type: 'observe', worker: 'A', handle: null, processes: [] },
    ]) {
        const result = f.run(['event', '--file', f.file, '--json', JSON.stringify({ id: 'forbidden', ...payload })], f.workers.A);
        assert.equal(result.status, 1, result.stdout);
    }
    assert.throws(() => f.assign('B', 'B-overlap'), /reserved/);
    f.assign('B', 'B-independent', ['source:sample.c:other']);
});

test('simultaneous overlapping claims yield one owner, never two', async (t) => {
    const f = fixture(t);
    const claims = ['A', 'B'].map(worker => new Promise(resolve => {
        const event = { id: `claim-${worker}`, type: 'assign', task: `${worker}-1`, worker,
            goal: 'sample-port', span: 'sample', seed: null, base: f.base,
            reservations: ['source:sample.c:sample'], allowedPaths: ['js/sample.js'] };
        const child = spawn(process.execPath, [SCRIPT, 'event', '--file', f.file, '--json', JSON.stringify(event)],
            { cwd: f.workers[worker], stdio: 'ignore' });
        child.on('error', error => resolve({ error }));
        child.on('close', code => resolve({ code }));
    }));
    const results = await Promise.all(claims);
    assert.equal(results.filter(result => result.code === 0).length, 1);
    assert.equal(Object.keys(f.success(['status']).tasks).length, 1);
});

test('queued corrections do not interrupt or mix with the current task', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
    f.success(f.submitArgs, f.workers.A);
    f.assign('A', 'A-next', ['source:sample.c:next']);
    f.event({ type: 'feedback', task: 'A-1', delivery: head, reason: 'Repair the caller evidence.' });
    const next = f.success(['next']);
    assert.equal(next.corrections[0].afterTask, 'A-next');
    assert.throws(() => f.event({ type: 'resume', task: 'A-1' }, f.workers.A), /already working/);
    assert.equal(f.success(['status']).tasks['A-next'].status, 'working');
});

test('preflight reports quality omissions, copied recipes and all previous failed checks together', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); f.commit();
    const worker = f.workers.A;
    mkdirSync(join(worker, 'recipes/sample.c'), { recursive: true });
    writeFileSync(join(worker, 'recipes/sample.c/copied.session.json'), JSON.stringify({
        comment: 'Different name and date do not make this route independent.',
        segments: [{ seed: 360, datetime: '20000101120000', moves: 'hhjjkkll' }],
    }));
    f.git(worker, 'add', 'recipes/sample.c/copied.session.json'); f.git(worker, 'commit', '-qm', 'copied fixture');
    const submitted = f.success(f.submitArgs, worker);
    const head = Object.keys(submitted.deliveries)[0];
    f.git(f.root, 'merge', '--ff-only', head);
    writeFileSync(join(f.root, 'QUALITY.json'), JSON.stringify({ areas: [] }));
    f.git(f.root, 'add', 'QUALITY.json'); f.git(f.root, 'commit', '-qm', 'missing assignment fixture');
    const summary = join(f.parent, 'failed.json');
    writeFileSync(summary, JSON.stringify({ allPassed: false, results: [
        { label: 'quality', passed: false, logPath: '/fixture/quality.log' },
        { label: 'caller tests', passed: false, logPath: '/fixture/callers.log' },
        { label: 'informational', passed: false, informational: true },
    ] }));
    const result = f.run(['preflight', '--task', 'A-1', '--previous-checkpoint', summary]);
    assert.equal(result.status, 1);
    const report = JSON.parse(result.stdout);
    assert.ok(report.issues.some(issue => issue.includes('unassigned')));
    assert.ok(report.issues.some(issue => issue.includes('copies seed and moves')));
    assert.deepEqual(report.previousFailures.map(item => item.label), ['quality', 'caller tests', 'informational']);
});

test('Git objects and exact checkpoint candidates are verified rather than trusting SHA spelling', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
    f.success(f.submitArgs, f.workers.A);
    f.event({ type: 'received', task: 'A-1', delivery: head });
    assert.throws(() => f.event({ type: 'integrating', task: 'A-1', integration: 'f'.repeat(40) }), /revision|object|commit/i);
    assert.throws(() => f.event({ type: 'integrating', task: 'A-1', integration: f.base }), /delivered patch/);
    f.git(f.root, 'merge', '--ff-only', head);
    f.event({ type: 'integrating', task: 'A-1', integration: head.slice(0, 12) }); // Resolve, never pad a short SHA.
    const summary = join(f.parent, 'summary.json');
    writeFileSync(summary, JSON.stringify({ commit: f.base, allPassed: true }));
    assert.throws(() => f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary }), /different integration/);
    writeFileSync(summary, JSON.stringify({ commit: head, allPassed: false }));
    assert.throws(() => f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary }), /disagrees/);
    f.git(f.root, 'commit', '--allow-empty', '-qm', 'coordinator correction fixture');
    const corrected = f.git(f.root, 'rev-parse', 'HEAD');
    f.event({ type: 'integrating', task: 'A-1', integration: corrected });
    writeFileSync(summary, JSON.stringify({ commit: head, allPassed: true }));
    assert.throws(() => f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary }), /different integration/);
    writeFileSync(summary, JSON.stringify({ commit: corrected, allPassed: true }));
    f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary });
});

test('publication requires accepted work on both local and remote main', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); const head = f.commit();
    f.success(f.submitArgs, f.workers.A); f.event({ type: 'received', task: 'A-1', delivery: head });
    f.git(f.root, 'checkout', '-qb', 'integration'); f.git(f.root, 'merge', '--ff-only', head);
    f.event({ type: 'integrating', task: 'A-1', integration: head });
    const summary = join(f.parent, 'pass.json');
    writeFileSync(summary, JSON.stringify({ commit: head, allPassed: true }));
    f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary });
    f.event({ type: 'accepted', task: 'A-1' });
    assert.throws(() => f.event({ type: 'published', task: 'A-1', commit: head }), /local main/);
    f.success(['sync-main', '--commit', head]);
    const remote = join(f.parent, 'remote.git');
    f.git(f.parent, 'init', '--bare', '-q', remote); f.git(f.root, 'remote', 'add', 'origin', remote);
    assert.throws(() => f.event({ type: 'published', task: 'A-1', commit: head }), /git ls-remote|remote main/);
    f.git(f.root, 'push', '-q', 'origin', 'main'); // Disposable filesystem remote, never the project remote.
    const state = f.event({ type: 'published', task: 'A-1', commit: head });
    assert.ok(state.deliveries[head].publishedAt);
});

test('recipe comparison ignores renamed metadata but not independently chosen moves', () => {
    const fixed = { seed: 360, moves: 'hhjjkkll' }; // Reproduce the observed same-seed/same-route defect.
    assert.equal(copiedRecipe({ ...fixed, datetime: '20000101120000', name: 'new' }, fixed), true);
    assert.equal(copiedRecipe({ ...fixed, moves: 'jj' }, fixed), false);
});

function publicationReports(f, withSavedReports = false, batch = 'v1') {
    // One immutable synthetic case makes membership checks independent of totals.
    const cases = [{ id: 'sample', recordingSha256: 'a'.repeat(64) }];
    mkdirSync(join(f.root, 'challenges'));
    const manifestPath = batch === 'v1' ? 'challenges/manifest.json' : `challenges/manifests/${batch}.json`;
    mkdirSync(join(f.root, manifestPath, '..'), { recursive: true });
    writeFileSync(join(f.root, manifestPath), JSON.stringify({ version: 1, cases }));
    f.git(f.root, 'add', manifestPath); f.git(f.root, 'commit', '-qm', 'tested challenge fixture');
    let tested = f.git(f.root, 'rev-parse', 'HEAD');
    const investigation = {
        session: 'fixed', remainingScreensUpperBound: 1, status: 'partial', commit: tested,
        mismatch: { session: 'fixed', remainingScreensUpperBound: 1 },
        summary: 'One remaining synthetic step needs source investigation.', evidence: ['sample.c:sample'],
    };
    // One fully matching screen/RNG/cursor gives explicit, independently readable totals.
    const count = { matched: 1, total: 1 };
    const evaluation = {
        version: 1, sha: tested, utc: '2026-01-01T00:00:00Z', status: 'complete',
        ...(batch !== 'v1' ? { batch, manifestPath } : {}),
        manifestSha256: corpusDigest(cases), scorerSha256: 'b'.repeat(64),
        cases: [{ ...cases[0], passed: true, metrics: { screens: count, rng: count, cursors: count } }],
        totals: { sessions: count, screens: count, rng: count, cursors: count },
    };
    const save = (path, value) => {
        mkdirSync(join(f.root, path, '..'), { recursive: true });
        writeFileSync(join(f.root, path), typeof value === 'string' ? value : JSON.stringify(value));
        f.git(f.root, 'add', path);
    };
    if (withSavedReports) {
        save('investigations/fixed.json', investigation);
        save('challenges/evaluations/earlier.json', evaluation);
        f.git(f.root, 'commit', '-qm', 'previous reports fixture');
        tested = f.git(f.root, 'rev-parse', 'HEAD');
        investigation.commit = tested;
        evaluation.sha = tested;
    }
    return { tested, investigation, evaluation, save };
}

function reportPublication(t, withSavedReports = false, batch = 'v1') {
    const f = fixture(t); f.assign(); f.artifacts(); const delivered = f.commit();
    f.success(f.submitArgs, f.workers.A);
    f.event({ type: 'received', task: 'A-1', delivery: delivered });
    f.git(f.root, 'merge', '--ff-only', delivered);
    const reports = publicationReports(f, withSavedReports, batch);
    const { tested } = reports;
    f.event({ type: 'integrating', task: 'A-1', integration: tested });
    const summary = join(f.parent, 'report-pass.json');
    const receipt = JSON.stringify({ commit: tested, allPassed: true });
    writeFileSync(summary, receipt);
    f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary });
    f.event({ type: 'accepted', task: 'A-1' });
    const remote = join(f.parent, 'remote.git');
    f.git(f.parent, 'init', '--bare', '-q', remote); f.git(f.root, 'remote', 'add', 'origin', remote);
    const publish = () => {
        f.git(f.root, 'commit', '-qm', 'post-checkpoint fixture');
        const commit = f.git(f.root, 'rev-parse', 'HEAD');
        f.git(f.root, 'push', '-q', 'origin', 'main'); // Local disposable remote only.
        return f.event({ type: 'published', task: 'A-1', commit });
    };
    return { ...f, ...reports, delivered, summary, receipt, publish };
}

// Report rejection depends on committed trees, not worker setup. The matrix
// below keeps CLI cases for malformed reports and changed game inputs; its
// other cases reach the same guard directly without a delivery lifecycle.
function rejectedPublication(t) {
    const root = mkdtempSync(join(tmpdir(), 'publication-policy-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    git(root, 'init', '-qb', 'main');
    git(root, 'config', 'user.name', 'Publication fixture');
    git(root, 'config', 'user.email', 'fixture@example.invalid');
    git(root, 'config', 'commit.gpgsign', 'false');
    mkdirSync(join(root, 'js'));
    mkdirSync(join(root, 'scripts'));
    // Distinct game inputs at base and tested make an earlier evaluation stale.
    writeFileSync(join(root, 'js/sample.js'), 'export function sample() { return 0; }\n');
    writeFileSync(join(root, 'scripts/sample.test.mjs'), "import { sample } from '../js/sample.js';\nvoid sample;\n");
    writeFileSync(join(root, 'QUALITY.json'), '{}\n'); // Existing target for the symlink-report case.
    git(root, 'add', 'js/sample.js', 'scripts/sample.test.mjs', 'QUALITY.json');
    git(root, 'commit', '-qm', 'base fixture');
    const base = git(root, 'rev-parse', 'HEAD');
    writeFileSync(join(root, 'js/sample.js'), 'export function sample() { return 1; }\n');
    git(root, 'add', 'js/sample.js');
    const reports = publicationReports({ root, git });
    const { tested } = reports;
    const state = { tasks: { 'A-1': { deliveries: [tested] } },
        deliveries: { [tested]: { integration: tested } } };
    const publish = () => {
        git(root, 'commit', '-qm', 'rejected report fixture');
        const commit = git(root, 'rev-parse', 'HEAD');
        return verifyEvent(root, state, { type: 'published', task: 'A-1', commit });
    };
    return { root, git, base, ...reports, publish };
}

test('publication accepts checked reports without changing the tested receipt or checkpoint inputs', (t) => {
    const f = reportPublication(t);
    f.save('investigations/fixed.json', f.investigation);
    f.save('investigations/holdout/fixed.json', { ...f.investigation, commit: f.base, session: 'holdout/fixed',
        mismatch: { ...f.investigation.mismatch, session: 'holdout/fixed' } });
    f.save('challenges/evaluations/after-checkpoint.json', f.evaluation);
    f.save('SCORE.tsv', 'fixture closure bookkeeping\n');
    const state = f.publish();
    assert.ok(state.deliveries[f.delivered].publishedAt);
    assert.equal(state.deliveries[f.delivered].integration, f.tested);
    assert.equal(readFileSync(f.summary, 'utf8'), f.receipt);
    // Publication's report allowance must not broaden checkpoint-cache reuse.
    assert.notEqual(executionTree(f.root, f.tested), executionTree(f.root, 'HEAD'));
});

test('publication accepts a later passing checkpoint for changed inputs', t => {
    const f = reportPublication(t);
    f.save('scripts/sample.test.mjs', 'export const checked = true;\n');
    f.git(f.root, 'commit', '-qm', 'validated tooling fixture');
    const later = f.git(f.root, 'rev-parse', 'HEAD');
    const supplementalCheckpoint = join(f.parent, 'later-pass.json');
    writeFileSync(supplementalCheckpoint, JSON.stringify({ commit: later, executionCommit: later, allPassed: true }));
    f.save('challenges/evaluations/after-checkpoint.json', f.evaluation);
    f.save('SCORE.tsv', 'fixture closure bookkeeping\n');
    f.git(f.root, 'commit', '-qm', 'post-checkpoint fixture');
    const commit = f.git(f.root, 'rev-parse', 'HEAD');
    f.git(f.root, 'push', '-q', 'origin', 'main');
    assert.throws(() => f.event({ type: 'published', task: 'A-1', commit }), /unvalidated changes/i);
    const state = f.event({ type: 'published', task: 'A-1', commit, supplementalCheckpoint });
    assert.equal(state.deliveries[f.delivered].supplementalCheckpoint, supplementalCheckpoint);
});

test('publication preserves an intermediate result without relabeling it as current evidence', t => {
    const f = reportPublication(t);
    f.save('js/sample.js', 'export const changed = true;\n');
    f.git(f.root, 'commit', '-qm', 'new game input fixture');
    const later = f.git(f.root, 'rev-parse', 'HEAD');
    const supplementalCheckpoint = join(f.parent, 'later-pass.json');
    writeFileSync(supplementalCheckpoint, JSON.stringify({ commit: later, executionCommit: later, allPassed: true }));
    f.save('challenges/evaluations/after-checkpoint.json', f.evaluation);
    f.git(f.root, 'commit', '-qm', 'post-checkpoint fixture');
    const commit = f.git(f.root, 'rev-parse', 'HEAD');
    f.git(f.root, 'push', '-q', 'origin', 'main');
    const state = f.event({ type: 'published', task: 'A-1', commit, supplementalCheckpoint });
    assert.ok(state.deliveries[f.delivered].publishedAt);
    assert.equal(JSON.parse(readFileSync(join(f.root,
        'challenges/evaluations/after-checkpoint.json'), 'utf8')).sha, f.tested);
    assert.equal(readFileSync(f.summary, 'utf8'), f.receipt);
});

test('publication permits refreshing an existing investigation while preserving old evaluations', (t) => {
    const f = reportPublication(t, true);
    f.save('investigations/fixed.json', { ...f.investigation, summary: 'Source probe now identifies the next branch.' });
    assert.ok(f.publish().deliveries[f.delivered].publishedAt);
});

test('publication validates a later batch against its own tested manifest', t => {
    const f = reportPublication(t, false, 'v2');
    f.save('challenges/evaluations/v2-baseline.json', f.evaluation);
    assert.ok(f.publish().deliveries[f.delivered].publishedAt);
});

test('publication cannot substitute a different manifest for an evaluation batch', t => {
    const f = reportPublication(t, false, 'v2');
    f.save('challenges/evaluations/v2-baseline.json', {
        ...f.evaluation, manifestPath: 'challenges/manifest.json',
    });
    assert.throws(f.publish, /batch|manifest|evaluation/i);
});

test('publication requires an explicit manifest path for a later batch', t => {
    const f = reportPublication(t, false, 'v2'); // Later batches cannot use the legacy v1 default.
    const { manifestPath: _manifestPath, ...evaluation } = f.evaluation;
    f.save('challenges/evaluations/v2-baseline.json', evaluation);
    assert.throws(f.publish, /evaluation path differs from its batch/u);
});

function syntheticInvestigation(f) {
    const session = 'synthetic/v2/sample';
    return { ...f.investigation, session, corpus: 'synthetic', batch: 'v2', caseId: 'sample',
        remainingScreens: 0, recordedSteps: 1,
        mismatch: { session, remainingScreens: 0 },
        manifestPath: 'challenges/manifests/v2.json', manifestSha256: f.evaluation.manifestSha256,
        recordingSha256: f.evaluation.cases[0].recordingSha256,
        evaluationPath: 'challenges/evaluations/v2-baseline.json', evaluationCommit: f.tested,
    };
}

test('publication accepts a batch-qualified investigation tied to the tested corpus', t => {
    const f = reportPublication(t, false, 'v2');
    f.save('investigations/synthetic/v2/sample.json', syntheticInvestigation(f));
    f.save('challenges/evaluations/v2-baseline.json', f.evaluation);
    assert.ok(f.publish().deliveries[f.delivered].publishedAt);
});

test('publication rejects a synthetic investigation for different recording evidence', t => {
    const f = reportPublication(t, false, 'v2');
    f.save('investigations/synthetic/v2/sample.json', {
        ...syntheticInvestigation(f), recordingSha256: 'e'.repeat(64),
    });
    assert.throws(f.publish, /manifest|investigation/i);
});

test('publication verifies the investigation count against its cited immutable evaluation', t => {
    const f = reportPublication(t, false, 'v2');
    const report = syntheticInvestigation(f);
    f.save('investigations/synthetic/v2/sample.json', { ...report, remainingScreens: 1,
        mismatch: { ...report.mismatch, remainingScreens: 1 } });
    f.save('challenges/evaluations/v2-baseline.json', f.evaluation);
    assert.throws(f.publish, /saved evaluation/i);
});

test('publication cannot overwrite or delete a saved challenge evaluation', async (t) => {
    for (const action of ['overwrite', 'delete']) await t.test(action, t => {
        const f = reportPublication(t, true); const before = readFileSync(f.file, 'utf8');
        if (action === 'overwrite') f.save('challenges/evaluations/earlier.json', f.evaluation);
        else f.git(f.root, 'rm', 'challenges/evaluations/earlier.json'); // Disposable fixture artifact only.
        assert.throws(f.publish, /immutable|regular/i);
        assert.equal(readFileSync(f.file, 'utf8'), before);
    });
});

test('publication rejects unsafe report changes and every other post-checkpoint input', async (t) => {
    // Isolate format, provenance, mode, and non-report path guards. Two CLI
    // cases also check that rejection leaves the ledger and receipt untouched.
    const cases = [
        ['malformed JSON', f => f.save('investigations/fixed.json', '{'), /JSON|investigation/i],
        ['wrong investigation ID', f => f.save('investigations/fixed.json', { ...f.investigation, session: 'other' }), /investigation/i],
        ['unknown source commit', f => f.save('investigations/fixed.json', { ...f.investigation, commit: 'f'.repeat(40) }), /commit|ancestor|revision/i],
        ['unaccepted source commit', f => {
            // A real but unmerged child must not qualify as tested history.
            const child = f.git(f.root, 'commit-tree', `${f.tested}^{tree}`, '-p', f.tested, '-m', 'unaccepted source');
            f.save('investigations/fixed.json', { ...f.investigation, commit: child });
        }, /tested history/i],
        ['measurement predates batch admission', f => f.save('challenges/evaluations/new.json',
            { ...f.evaluation, sha: f.base }), /manifest\.json.*not in/i],
        ['invalid totals', f => f.save('challenges/evaluations/new.json', { ...f.evaluation, totals: {} }), /totals/i],
        ['different challenge membership', f => f.save('challenges/evaluations/new.json', {
            ...f.evaluation, cases: [], manifestSha256: corpusDigest([]), totals: {
                sessions: { matched: 0, total: 0 }, screens: { matched: 0, total: 0 },
                rng: { matched: 0, total: 0 }, cursors: { matched: 0, total: 0 },
            },
        }), /manifest|membership/i],
        ['executable report', f => {
            f.save('investigations/fixed.json', f.investigation);
            chmodSync(join(f.root, 'investigations/fixed.json'), 0o755); // Executable files are never reports.
            f.git(f.root, 'add', 'investigations/fixed.json');
        }, /regular|executable|mode/i],
        ['symlink report', f => {
            mkdirSync(join(f.root, 'investigations'));
            symlinkSync('../QUALITY.json', join(f.root, 'investigations/fixed.json'));
            f.git(f.root, 'add', 'investigations/fixed.json');
        }, /regular|symlink|mode/i],
        ...['js/sample.js', 'scripts/sample.test.mjs', 'recipes/new.json', 'recordings/new.json',
            'challenges/manifest.json', 'challenges/cases/new.json', 'investigations/code.js',
            'investigations/nested/report.json', 'challenges/evaluations/code.js'].map(path =>
            [path, f => f.save(path, 'changed input\n'), /unvalidated changes/i]),
    ];
    for (const [name, change, error] of cases) await t.test(name, t => {
        const lifecycle = name === 'malformed JSON' || name === 'js/sample.js';
        const f = lifecycle ? reportPublication(t) : rejectedPublication(t);
        const before = lifecycle ? readFileSync(f.file, 'utf8') : null;
        change(f);
        assert.throws(f.publish, error);
        if (lifecycle) {
            assert.equal(readFileSync(f.file, 'utf8'), before);
            assert.equal(readFileSync(f.summary, 'utf8'), f.receipt);
        }
    });
});

test('repairing an earlier submission excludes the next task and unblocks its dependent delivery', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); const first = f.commit();
    const worker = f.workers.A;
    f.success(f.submitArgs, worker);
    f.assign('A', 'A-2');
    mkdirSync(join(worker, 'recipes/sample.c'), { recursive: true });
    const laterPath = 'recipes/sample.c/later.session.json';
    // This file belongs to the later task and must not enter the earlier repair.
    writeFileSync(join(worker, laterPath), JSON.stringify({ seed: 777, moves: 'j' }));
    f.git(worker, 'add', laterPath); f.git(worker, 'commit', '-qm', 'later task fixture');
    const second = f.git(worker, 'rev-parse', 'HEAD');
    const nextArgs = f.submitArgs.map(arg => arg === 'A-1' ? 'A-2' : arg);
    f.success([...nextArgs, '--base', first], worker);
    f.event({ type: 'feedback', task: 'A-1', delivery: first, reason: 'Correct the helper.' });
    f.event({ type: 'resume', task: 'A-1' }, worker);
    writeFileSync(join(worker, 'js/sample.js'), 'export function sample() { return 2; }\nexport function caller() { return sample(); }\n');
    f.git(worker, 'add', 'js/sample.js'); f.git(worker, 'commit', '-qm', 'repair fixture');
    const repair = f.git(worker, 'rev-parse', 'HEAD');
    const cyclic = f.run([...f.submitArgs, '--base', second], worker);
    assert.equal(cyclic.status, 1);
    assert.match(cyclic.stderr, /dependency cycle/);
    f.success([...f.submitArgs, '--base', second, '--dependencies', 'none'], worker);
    f.git(f.root, 'merge', '--ff-only', first);
    f.git(f.root, 'cherry-pick', repair);
    assert.equal(f.git(f.root, 'ls-tree', 'HEAD', '--', laterPath), '');
    f.event({ type: 'received', task: 'A-1', delivery: repair });
    const combined = f.git(f.root, 'rev-parse', 'HEAD');
    f.event({ type: 'integrating', task: 'A-1', integration: combined });
    const summary = join(f.parent, 'repair-pass.json');
    writeFileSync(summary, JSON.stringify({ commit: combined, allPassed: true }));
    f.event({ type: 'validated', task: 'A-1', passed: true, checkpoint: summary });
    const state = f.event({ type: 'accepted', task: 'A-1' });
    assert.equal(state.deliveries[first].acceptedAt, undefined); // Original failed snapshot is never relabelled passing.
    assert.equal(f.success(['next']).integration.delivery, second);
    const preflight = f.success(['preflight', '--task', 'A-1']);
    assert.equal(preflight.passed, true);
    f.event({ type: 'received', task: 'A-2', delivery: second });
    // The dependent branch contains the original, but not its accepted repair.
    f.git(f.root, 'checkout', '-qb', 'missing-repair', second);
    const missing = f.run(['preflight', '--task', 'A-2']);
    assert.equal(missing.status, 1);
    assert.match(JSON.parse(missing.stdout).issues.join('\n'), /missing delivered patches/);
    assert.throws(() => f.event({ type: 'integrating', task: 'A-2', integration: second }), /missing delivered patches/);
    f.git(f.root, 'cherry-pick', repair);
    assert.equal(f.success(['preflight', '--task', 'A-2']).passed, true);
    f.event({ type: 'integrating', task: 'A-2', integration: f.git(f.root, 'rev-parse', 'HEAD') });
});

test('required functions need their own source reservation and blocked recipe owner', (t) => {
    const f = fixture(t); f.assign(); f.artifacts(); f.commit();
    const contextPath = join(f.workers.A, '.cache/context.json');
    const context = JSON.parse(readFileSync(contextPath, 'utf8'));
    context.requiredFunctions = [{ sourceFile: 'foreign.c', name: 'sample' }];
    writeFileSync(contextPath, JSON.stringify(context));
    const evidencePath = join(f.workers.A, '.cache/evidence.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    evidence.functions.push({ ...evidence.functions[0], sourceFile: 'foreign.c' });
    writeFileSync(evidencePath, JSON.stringify(evidence));
    assert.match(f.run(f.submitArgs, f.workers.A).stderr, /unreserved source function: foreign.c:sample/u);
    f.event({ type: 'scope', task: 'A-1', reservations: ['source:sample.c:sample', 'source:foreign.c:sample'],
        allowedPaths: ['js/sample.js', 'scripts/sample.test.mjs', 'recipes/sample.c/', 'recipes/foreign.c/'] }, f.workers.A);
    evidence.functions.pop();
    evidence.incompleteFunctions = [{ sourceFile: 'foreign.c', name: 'sample',
        reason: 'Foreign caller stops before the helper.', blockedRecipe: 'recipes/sample.c/blocked.session.json' }];
    for (const owner of ['sample.c', 'foreign.c']) {
        mkdirSync(join(f.workers.A, 'recipes', owner), { recursive: true });
        writeFileSync(join(f.workers.A, 'recipes', owner, 'blocked.session.json'),
            JSON.stringify({ seed: 73, moves: '.' })); // Independent fixture recipe, not corpus input.
    }
    f.git(f.workers.A, 'add', 'recipes/sample.c/blocked.session.json', 'recipes/foreign.c/blocked.session.json');
    f.git(f.workers.A, 'commit', '-qm', 'blocked foreign fixture');
    writeFileSync(evidencePath, JSON.stringify(evidence));
    assert.match(f.run(f.submitArgs, f.workers.A).stderr, /recipes\/foreign.c\//u);
    evidence.incompleteFunctions[0].blockedRecipe = 'recipes/foreign.c/blocked.session.json';
    writeFileSync(evidencePath, JSON.stringify(evidence));
    const submitted = f.success(f.submitArgs, f.workers.A);
    assert.equal(submitted.tasks['A-1'].status, 'ready');
});
