import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { copiedRecipe } from './worker-delivery.mjs';
import { corpusDigest } from './challenge-results.mjs';
import { executionTree } from './checkpoint-reuse.mjs';

const SCRIPT = fileURLToPath(new URL('./worker-state.mjs', import.meta.url));

function fixture(t) {
    const parent = mkdtempSync(join(tmpdir(), 'worker-delivery-test-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'main'); const cRoot = join(parent, 'source');
    const git = (cwd, ...args) => {
        const result = spawnSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], { cwd, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr); // Only disposable fixture repositories are written.
        return result.stdout.trim();
    };
    for (const path of [root, cRoot]) {
        mkdirSync(path); git(path, 'init', '-qb', 'main');
        git(path, 'config', 'user.name', 'Delivery fixture');
        git(path, 'config', 'user.email', 'fixture@example.invalid');
        git(path, 'config', 'commit.gpgsign', 'false');
    }
    mkdirSync(join(cRoot, 'src'));
    // One source function and caller are enough to exercise evidence references.
    writeFileSync(join(cRoot, 'src/sample.c'), 'int\nsample(void)\n{\n    return 1;\n}\n');
    git(cRoot, 'add', 'src/sample.c'); git(cRoot, 'commit', '-qm', 'source fixture');
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
    f.event({ type: 'received', task: 'A-1', delivery: head });
    const packet = JSON.parse(readFileSync(first.evidence, 'utf8'));
    assert.equal(packet.functions[0].name, 'sample');
    assert.equal(packet.git.head, head);
    const preflight = f.success(['preflight', '--task', 'A-1', '--commit', head]);
    assert.equal(preflight.passed, true); // Reads Git, not the worker's new dirty file.
    assert.deepEqual(preflight.focusedTests, [addedTest, 'scripts/importer-only.test.mjs', 'scripts/sample.test.mjs']);
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
    assert.match(result.stderr, /only coordinator/);
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

function reportPublication(t, withSavedReports = false, batch = 'v1') {
    const f = fixture(t); f.assign(); f.artifacts(); const delivered = f.commit();
    f.success(f.submitArgs, f.workers.A);
    f.event({ type: 'received', task: 'A-1', delivery: delivered });
    f.git(f.root, 'merge', '--ff-only', delivered);
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
    return { ...f, tested, delivered, summary, receipt, investigation, evaluation, save, publish };
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
    // Each mutation must fail before a published event is appended. Fixtures
    // deliberately isolate format, provenance, mode, and non-report path guards.
    const cases = [
        ['malformed JSON', f => f.save('investigations/fixed.json', '{'), /JSON|investigation/i],
        ['wrong investigation ID', f => f.save('investigations/fixed.json', { ...f.investigation, session: 'other' }), /investigation/i],
        ['unknown source commit', f => f.save('investigations/fixed.json', { ...f.investigation, commit: 'f'.repeat(40) }), /commit|ancestor|revision/i],
        ['unaccepted source commit', f => {
            // A real but unmerged child must not qualify as tested history.
            const child = f.git(f.root, 'commit-tree', `${f.tested}^{tree}`, '-p', f.tested, '-m', 'unaccepted source');
            f.save('investigations/fixed.json', { ...f.investigation, commit: child });
        }, /tested history/i],
        ['wrong measured commit', f => f.save('challenges/evaluations/new.json', { ...f.evaluation, sha: f.base }), /tested|integration/i],
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
        const f = reportPublication(t); const before = readFileSync(f.file, 'utf8');
        change(f);
        assert.throws(f.publish, error);
        assert.equal(readFileSync(f.file, 'utf8'), before);
        assert.equal(readFileSync(f.summary, 'utf8'), f.receipt);
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
