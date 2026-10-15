import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {initializeBaseline, parseInitialBaselineArgs} from './initial-baseline.mjs';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {acceptedMain} from './worker-backlog.mjs';
import {queueBase, queueWork} from './assignment-queue.mjs';
import {submitDelivery, verifyEvent} from './worker-delivery.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const SCRIPT = fileURLToPath(new URL('./initial-baseline.mjs', import.meta.url));
const STATE = fileURLToPath(new URL('./worker-state.mjs', import.meta.url));
const QUEUE = fileURLToPath(new URL('./work-queue.mjs', import.meta.url));

function fixture(t, {tooling = true} = {}) {
    const parent = mkdtempSync(join(tmpdir(), 'initial-baseline-')), root = join(parent, 'main');
    t.after(() => rmSync(parent, {recursive: true, force: true}));
    mkdirSync(root);
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Baseline fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    const save = (path, value) => {
        mkdirSync(dirname(path), {recursive: true});
        const bytes = typeof value === 'string' ? value : JSON.stringify(value) + '\n';
        writeFileSync(path, bytes); return bytes;
    };
    git(root, 'init', '-qb', 'main');
    save(join(root, '.gitignore'), '.cache/\n');
    save(join(root, 'js/fixture.js'), 'export const value = 1;\n');
    git(root, 'add', '.gitignore', 'js/fixture.js'); git(root, 'commit', '-qm', 'Existing published source');
    const base = git(root, 'rev-parse', 'HEAD'), workers = {};
    for (const worker of ['Prep', 'Worker-1']) {
        workers[worker] = join(parent, worker);
        git(root, 'worktree', 'add', '-qb', `initial/${worker}`, workers[worker]);
    }
    const file = join(parent, 'runtime/ledger.json');
    let ledger = createLedger('initial-baseline-fixture', root), sequence = 0;
    const send = event => {
        ledger = recordEvent(ledger, {id: `fixture-${++sequence}`, ...event});
        save(file, ledger);
    };
    for (const worker of Object.keys(workers)) send({type: 'register', worker,
        worktree: workers[worker], branch: `initial/${worker}`, base, handle: `fixture-${worker}`});
    send({type: 'queue-enable', prepRoot: workers.Prep, base});
    send({type: 'queue-refresh', base, digest: 'a'.repeat(64), sessions: []});
    send({type: 'queue-enqueue', assignment: {id: 'live-exploration', type: 'exploration', output: 'exploration',
        producer: 'Prep', recipient: 'Prep', batch: 'v2', question: 'Keep existing C work.', stop: 'Return evidence.',
        base, sessions: [], dependencies: [], reservations: ['source:fixture.c:live'],
        allowedPaths: ['challenges/cases/v2/'], checks: [], artifacts: []}});
    send({type: 'queue-claim', worker: 'Worker-1', task: 'live-exploration', branch: 'initial/Worker-1'});
    const commitPath = (path, contents) => {
        save(join(root, path), contents); git(root, 'add', path); git(root, 'commit', '-qm', `Change ${path}`);
        return git(root, 'rev-parse', 'HEAD');
    };
    const commit = tooling ? commitPath('.agents/tooling.md', 'A tooling-only publication after the initial source.\n') : base;
    git(root, 'init', '--bare', '-q', join(parent, 'remote.git'));
    git(root, 'remote', 'add', 'origin', join(parent, 'remote.git'));
    const publish = () => git(root, 'push', '-q', 'origin', 'main');
    publish(); // Disposable local remote only; no network or real repository push.
    const archive = (sha = commit, patch = {}) => {
        const artifacts = join(root, '.git/checkpoint-results', sha, 'fixture');
        const summary = {commit: sha, executionCommit: sha, allPassed: true, artifacts,
            timestamp: '2026-10-15T00:00:00Z', source: {kind: 'fixture', run: 'not-game-execution'}, ...patch};
        const path = join(artifacts, 'summary.json');
        save(path, summary); save(join(dirname(artifacts), 'latest.json'), summary);
        return path;
    };
    const checkpoint = archive();
    return {parent, root, file, workers, base, commit, git, save, send, commitPath, publish, archive,
        options: {ledger: file, commit, checkpoint},
        state: () => summarizeLedger(JSON.parse(readFileSync(file, 'utf8')))};
}

test('initial publication freezes exact evidence, preserves live claims and works with existing readers', t => {
    const f = fixture(t), before = f.state();
    // Ordinary tooling publication still cannot create its own accepted anchor.
    assert.throws(() => verifyEvent(f.root, before, {id: 'ordinary', type: 'tooling-published',
        tested: f.commit, commit: f.commit, checkpoint: f.options.checkpoint}), /follow accepted Main/u);
    const result = JSON.parse(execFileSync(process.execPath, [SCRIPT, '--ledger', f.file,
        '--commit', f.commit, '--checkpoint', f.options.checkpoint], {cwd: f.root, encoding: 'utf8'}));
    assert.equal(result.initialized, true);
    assert.notEqual(result.checkpoint, f.options.checkpoint);
    assert.equal(readFileSync(result.checkpoint, 'utf8'), readFileSync(f.options.checkpoint, 'utf8'));
    assert.equal(statSync(result.checkpoint).mode & 0o222, 0);
    const state = f.state();
    assert.deepEqual(state.tasks, before.tasks);
    assert.deepEqual(state.deliveries, before.deliveries);
    assert.deepEqual(state.workers, before.workers);
    assert.deepEqual(state.queue, before.queue, 'no claims, original bases or queue evidence rewritten');
    assert.equal(acceptedMain(state).commit, f.commit);
    assert.equal(queueBase(state), f.commit);
    assert.equal(queueWork(state).readySessions, null, 'old evidence needs an explicit accepted-base refresh');
    const legacy = JSON.parse(execFileSync(process.execPath, [STATE, 'accepted-main', '--file', f.file],
        {cwd: f.workers['Worker-1'], encoding: 'utf8'}));
    assert.equal(legacy.commit, f.commit, 'existing worker-state reader recognizes unchanged event schema');
    const queue = JSON.parse(execFileSync(process.execPath, [QUEUE, 'next', '--file', f.file],
        {cwd: f.root, encoding: 'utf8'}));
    assert.equal(queue.workers['Worker-1'].assignment, 'live-exploration');
    const bytes = readFileSync(f.file, 'utf8');
    const retry = initializeBaseline(f.options, f.root);
    assert.deepEqual(retry, {...result, initialized: false});
    assert.equal(readFileSync(f.file, 'utf8'), bytes, 'retry retains event and original timestamp');
});

test('first Prep submit requires the genuinely observed comparison commit, never original initialBase', t => {
    const f = fixture(t), prep = f.workers.Prep;
    f.send({type: 'assign', task: 'Prep-v2', worker: 'Prep', kind: 'challenge-preparation', seed: null,
        base: f.base, reservations: ['challenge-batch:v2'], allowedPaths: ['challenges/cases/v2/']});
    const segment = {seed: 891, datetime: '20010412120000', nethackrc: '', moves: 'i'};
    const recipe = f.save(join(prep, 'challenges/cases/v2/alpha.recipe.json'), {version: 5, segments: [segment]});
    const recording = f.save(join(prep, 'challenges/cases/v2/alpha.session.json'), {version: 5, segments: [{...segment,
        steps: [{key: '', screen: 'C fixture screen', cursor: [0, 0, 1], rng: []}]}]});
    f.git(prep, 'add', 'challenges/cases/v2/alpha.recipe.json', 'challenges/cases/v2/alpha.session.json');
    f.git(prep, 'commit', '-qm', 'Retained C fixture');
    const contextPath = join(prep, '.cache/context.json'), evidencePath = join(prep, '.cache/evidence.json');
    f.save(contextPath, {kind: 'challenge-preparation', batch: 'v2'});
    f.save(evidencePath, {missionPlan: 'Transport fixture; no real game execution claimed.', manifest: {version: 1,
        batch: 'v2', cases: [{id: 'alpha', title: 'C fixture', reproducibility: 'Fixture replay evidence.',
            recipe: 'challenges/cases/v2/alpha.recipe.json', recipeSha256: hash(recipe),
            recording: 'challenges/cases/v2/alpha.session.json', recordingSha256: hash(recording)}]}});
    const replay = join(prep, '.cache/replay.log'), comparison = join(prep, '.cache/comparison.log');
    f.save(replay, 'Transport fixture replay.\n');
    const saveComparison = commit => f.save(comparison, `__FRESH_DIFF_RESULT__\n${JSON.stringify({passed: false,
        screenMismatch: {index: 0}, provenance: {commit, recordingSha256: hash(recording)}})}\n`);
    const checksPath = join(prep, '.cache/checks.json');
    f.save(checksPath, [{kind: 'fresh', caseId: 'alpha', command: ['fixture-replay'], exitCode: 0, log: replay},
        {kind: 'comparison', caseId: 'alpha', command: ['fixture-comparison'], exitCode: 0, log: comparison}]);
    const submit = () => submitDelivery({root: prep, file: f.file, state: f.state(), taskId: 'Prep-v2',
        contextPath, evidencePath, checksPath});
    saveComparison(f.commit);
    assert.throws(submit, /must be an accepted Main/u);
    initializeBaseline(f.options, f.root);
    saveComparison(f.base);
    assert.throws(submit, /must be an accepted Main/u, 'does not invent acceptance of original queue base');
    saveComparison(f.commit);
    const result = submit();
    assert.equal(result.type, 'ready');
    assert.ok(existsSync(result.evidence));
});

test('an exactly published initialBase can initialize and a pre-event frozen snapshot can recover', t => {
    const f = fixture(t, {tooling: false}), bytes = readFileSync(f.options.checkpoint);
    const snapshot = join(`${f.file}.baselines`, `${hash(bytes)}.json`);
    mkdirSync(dirname(snapshot), {recursive: true});
    writeFileSync(snapshot, bytes, {flag: 'wx', mode: 0o444}); // Simulate interruption after freezing but before the event.
    const result = initializeBaseline(f.options, f.root);
    assert.equal(result.checkpoint, snapshot);
    assert.equal(acceptedMain(f.state()).commit, f.base);
    assert.deepEqual(f.state().deliveries, {});
});

test('failed, mismatched, nonarchived and latest-mutated checkpoints cannot initialize a baseline', async t => {
    for (const [label, mutate, pattern] of [
        ['failed', f => f.archive(f.commit, {allPassed: false}), /passing exact-execution/u],
        ['reused execution', f => f.archive(f.commit, {executionCommit: f.base}), /passing exact-execution/u],
        ['wrong commit', f => f.archive(f.commit, {commit: f.base}), /passing exact-execution/u],
        ['missing', f => rmSync(f.options.checkpoint), /ENOENT/u],
        ['copied summary', f => {f.options.checkpoint = join(f.parent, 'copy.json'); f.save(f.options.checkpoint,
            JSON.parse(readFileSync(join(f.root, '.git/checkpoint-results', f.commit, 'fixture/summary.json'))));}, /original archived/u],
        ['latest mutation', f => f.save(join(f.root, '.git/checkpoint-results', f.commit, 'latest.json'),
            {...JSON.parse(readFileSync(f.options.checkpoint)), source: {kind: 'changed'}}), /latest archived/u],
    ]) await t.test(label, t => {
        const f = fixture(t), before = readFileSync(f.file, 'utf8');
        mutate(f);
        assert.throws(() => initializeBaseline(f.options, f.root), pattern);
        assert.equal(readFileSync(f.file, 'utf8'), before);
    });
});

test('retry rejects a changed original proof, latest provenance, or frozen snapshot', async t => {
    for (const mode of ['original', 'latest', 'frozen', 'writable snapshot']) await t.test(mode, t => {
        const f = fixture(t), receipt = initializeBaseline(f.options, f.root);
        const before = readFileSync(f.file, 'utf8');
        if (mode === 'frozen') {chmodSync(receipt.checkpoint, 0o600); f.save(receipt.checkpoint, '{}\n');}
        else if (mode === 'writable snapshot') chmodSync(receipt.checkpoint, 0o600);
        else if (mode === 'latest') f.save(join(f.root, '.git/checkpoint-results', f.commit, 'latest.json'),
            {...JSON.parse(readFileSync(f.options.checkpoint)), source: {kind: 'mutated'}});
        else f.archive(f.commit, {source: {kind: 'mutated'}});
        assert.throws(() => initializeBaseline(f.options, f.root), /retry differs|latest archived|snapshot changed/u);
        assert.equal(readFileSync(f.file, 'utf8'), before);
    });
});

test('nonpublished, unrelated, game and corpus publications are rejected without ledger changes', async t => {
    for (const mode of ['remote differs', 'local main differs', 'unrelated base', 'game', 'corpus', 'reverted game'])
        await t.test(mode, t => {
            const f = fixture(t);
            if (mode === 'remote differs') {
                f.options.commit = f.commitPath('.agents/later.md', 'Not published.\n');
                f.options.checkpoint = f.archive(f.options.commit);
            } else if (mode === 'local main differs') f.commitPath('.agents/later.md', 'Local main advanced.\n');
            else if (mode === 'unrelated base') {
                const ledger = JSON.parse(readFileSync(f.file));
                // Use a real separate history rather than a fabricated SHA.
                f.git(f.root, 'checkout', '--orphan', 'unrelated');
                f.git(f.root, 'commit', '--allow-empty', '-qm', 'Unrelated initial source');
                const base = f.git(f.root, 'rev-parse', 'HEAD');
                f.git(f.root, 'switch', 'main');
                for (const event of ledger.events) {
                    if (['queue-enable', 'queue-refresh'].includes(event.type)) event.base = base;
                    if (event.type === 'queue-enqueue') event.assignment.base = base;
                }
                f.save(f.file, ledger);
            } else {
                const path = mode === 'corpus' ? 'challenges/cases/v2/new.json' : 'js/fixture.js';
                f.options.commit = f.commitPath(path, 'Unaccepted input change.\n');
                if (mode === 'reverted game') f.options.commit = f.commitPath(path, 'export const value = 1;\n');
                f.options.checkpoint = f.archive(f.options.commit); f.publish();
            }
            const before = readFileSync(f.file, 'utf8');
            assert.throws(() => initializeBaseline(f.options, f.root),
                /remote main|local main differs|descend from|only tooling and bookkeeping/u);
            assert.equal(readFileSync(f.file, 'utf8'), before);
        });
});

test('previous acceptance, active integration, missing queue and wrong owner prevent initialization', async t => {
    for (const mode of ['accepted history', 'active integration', 'missing queue', 'wrong owner']) await t.test(mode, t => {
        const f = fixture(t);
        if (mode === 'accepted history') f.send({type: 'tooling-published', tested: f.base, commit: f.base,
            checkpoint: f.options.checkpoint}); // Projection fixture only, not a real verified publication.
        else if (mode === 'missing queue') {
            const ledger = JSON.parse(readFileSync(f.file));
            ledger.events = ledger.events.filter(event => !event.type.startsWith('queue-'));
            f.save(f.file, ledger);
        } else if (mode === 'active integration') {
            f.send({type: 'assign', task: 'active-prep', worker: 'Prep', kind: 'challenge-preparation', seed: null,
                base: f.base, reservations: ['challenge-batch:v2'], allowedPaths: ['challenges/cases/v2/']});
            f.send({type: 'ready', task: 'active-prep', base: f.base, delivery: f.commit, commits: [f.commit],
                paths: ['challenges/cases/v2/fixture.json'], evidence: f.options.checkpoint, dependencies: []});
            f.send({type: 'integrating', task: 'active-prep', integration: f.commit});
        }
        const before = readFileSync(f.file, 'utf8');
        assert.throws(() => initializeBaseline(f.options, mode === 'wrong owner' ? f.workers.Prep : f.root),
            /no accepted history|active integration|only the Work lead/u);
        assert.equal(readFileSync(f.file, 'utf8'), before);
    });
});

test('initial baseline CLI requires one explicit commit, checkpoint and absolute shared ledger', () => {
    assert.deepEqual(parseInitialBaselineArgs(['--ledger', '/tmp/shared.json', '--commit', 'main', '--checkpoint', 'saved.json']),
        {ledger: '/tmp/shared.json', commit: 'main', checkpoint: 'saved.json'});
    for (const args of [[], ['--ledger', 'relative.json', '--commit', 'main', '--checkpoint', 'saved.json'],
        ['--ledger', '/tmp/a', '--commit', 'main', '--checkpoint'], ['--ledger', '/tmp/a', '--commit', 'main',
            '--checkpoint', 'saved.json', '--force', 'true']]) assert.throws(() => parseInitialBaselineArgs(args), /Usage/u);
});
