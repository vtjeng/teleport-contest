import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {verifyEvent} from './worker-delivery.mjs';
import {queueCommand} from './work-queue.mjs';
import {COLUMNS} from './score-log.mjs';
const ARTIFACT = 'challenges/cases/v2/evidence.txt';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'shared-queue-cli-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Queue fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    git(root, 'init', '-qb', 'main');
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    writeFileSync(join(root, 'SCORE.tsv'), COLUMNS.join('\t') + '\n');
    mkdirSync(join(root, 'challenges/cases/v2'), {recursive: true});
    writeFileSync(join(root, ARTIFACT), 'A source observation.\n');
    git(root, 'add', '.gitignore', 'SCORE.tsv', ARTIFACT); git(root, 'commit', '-qm', 'fixture');
    const base = git(root, 'rev-parse', 'HEAD');
    mkdirSync(join(root, '.cache'));
    const file = join(root, '.cache/ledger.json');
    let ledger = createLedger('loop-20261015', root), sequence = 0;
    const paths = {};
    for (const worker of ['Prep', 'Worker-1', 'Worker-2', 'Worker-3']) {
        const worktree = join(root, worker);
        git(root, 'worktree', 'add', '-qb', `initial/${worker}`, worktree);
        paths[worker] = worktree;
        ledger = recordEvent(ledger, verifyEvent(root, summarizeLedger(ledger), {id: `fixture-${++sequence}`,
            type: 'register', worker, worktree, branch: `initial/${worker}`, base, handle: `private-${worker}`}));
    }
    // Worker directories are untracked in this fixture's Main checkout only.
    writeFileSync(join(root, '.git/info/exclude'), 'Prep/\nWorker-*/\n');
    writeFileSync(file, JSON.stringify(ledger));
    queueCommand('enable', {file, prep: paths.Prep}, root);
    const save = (cwd, name, data) => {
        mkdirSync(join(cwd, '.cache'), {recursive: true});
        const path = join(cwd, '.cache', name); writeFileSync(path, JSON.stringify(data)); return path;
    };
    const refresh = (sessions = []) => queueCommand('refresh', {file,
        queue: save(root, 'queue.json', {mode: 'work', sessions: sessions.map(session => ({session})),
            blockers: [], synthetic: {batches: []}})}, root);
    refresh();
    const enqueue = name => queueCommand('enqueue', {file,
        json: save(paths.Prep, `${name}.json`, {id: name, type: 'exploration', output: 'exploration',
            producer: 'Prep', recipient: 'Prep', batch: 'v2', question: 'Inspect the source fixture.',
            stop: 'Return a source observation.', base, dependencies: [], sessions: [],
            reservations: [`source:fixture.c:${name}`], allowedPaths: ['challenges/cases/v2/'], checks: [], artifacts: [ARTIFACT]})}, paths.Prep);
    return {root, paths, file, base, git, save, refresh, enqueue,
        state: () => summarizeLedger(JSON.parse(readFileSync(file, 'utf8')))};
}

test('persistent worker changes assignment branches across exploration and implementation without losing results', t => {
    const f = fixture(t), worker = 'Worker-1', cwd = f.paths[worker];
    f.enqueue('explore');
    const first = queueCommand('claim', {file: f.file, worker}, cwd);
    assert.equal(first.recipient, 'Prep');
    assert.equal(f.git(cwd, 'branch', '--show-current'), first.branch);
    assert.equal(queueCommand('claim', {file: f.file, worker}, cwd).id, first.id, 'claim retry attaches');
    queueCommand('complete', {file: f.file, worker, json: f.save(cwd, 'result.json',
        {summary: 'Source observed.', outcome: 'match', paths: [ARTIFACT], checks: []})}, cwd);
    const result = f.state().queue.tasks.explore.result;
    const packet = readFileSync(result.packet, 'utf8');
    assert.match(packet, /Source observed/u);
    f.refresh(['case0', 'case1', 'case2', 'case3', 'case4']);
    const second = queueCommand('claim', {file: f.file, worker}, cwd);
    assert.equal(second.output, 'implementation');
    assert.equal(second.worktree, first.worktree);
    assert.notEqual(second.branch, first.branch);
    assert.equal(f.git(cwd, 'rev-parse', first.branch), f.base);
    assert.equal(readFileSync(result.packet, 'utf8'), packet);
    assert.equal(f.state().tasks[second.transport].kind, 'investigation');
});

test('dirty files and wrong producer/worker roots are rejected without changing claims or branches', t => {
    const f = fixture(t), worker = 'Worker-1', cwd = f.paths[worker];
    f.enqueue('explore');
    const before = readFileSync(f.file, 'utf8');
    writeFileSync(join(cwd, 'unfinished.txt'), 'Keep this work.');
    assert.throws(() => queueCommand('claim', {file: f.file, worker}, cwd), /must be clean/);
    assert.equal(readFileSync(f.file, 'utf8'), before);
    assert.equal(f.git(cwd, 'branch', '--show-current'), 'initial/Worker-1');
    assert.throws(() => queueCommand('claim', {file: f.file, worker}, f.paths['Worker-2']), /registered worker worktree/);
    assert.throws(() => queueCommand('refresh', {file: f.file, queue: 'unused'}, f.paths.Prep), /only the Work lead|Challenge lead may/);
});

test('distinct assignment IDs with punctuation get separate valid Git branches', t => {
    const f = fixture(t), worker = 'Worker-1', cwd = f.paths[worker], branches = [];
    for (const id of ['room:trace', 'room-trace', 'review..source']) {
        f.enqueue(id);
        const task = queueCommand('claim', {file: f.file, worker}, cwd);
        assert.equal(task.id, id);
        assert.match(task.branch, /^queue\/[a-f0-9]{64}\/attempt-1$/u);
        branches.push(task.branch);
        queueCommand('complete', {file: f.file, worker, json: f.save(cwd, 'result.json',
            {summary: 'Bounded observation.', outcome: 'match', paths: [ARTIFACT], checks: []})}, cwd);
    }
    assert.equal(new Set(branches).size, 3);
    let fresh = createLedger('loop-20261016', f.root);
    for (const name of ['Prep', worker]) fresh = recordEvent(fresh, {id: `fresh-${name}`, type: 'register',
        worker: name, worktree: f.paths[name], branch: f.git(f.paths[name], 'branch', '--show-current'),
        base: f.base, handle: `fresh-${name}`});
    writeFileSync(f.file, JSON.stringify(fresh));
    queueCommand('enable', {file: f.file, prep: f.paths.Prep}, f.root);
    f.refresh(); f.enqueue('room:trace');
    const nextRun = queueCommand('claim', {file: f.file, worker}, cwd);
    assert.ok(!branches.includes(nextRun.branch), 'a fresh run must preserve earlier assignment branches');
    assert.equal(f.git(cwd, 'rev-parse', branches[0]), f.base);
});

test('Prep changes its batch-assembly branch without spawning explorers or restarting its producer identity', t => {
    const f = fixture(t), cwd = f.paths.Prep;
    const worker = queueCommand('batch', {file: f.file, branch: 'prep/v2'}, cwd);
    assert.equal(worker.branch, 'prep/v2');
    assert.equal(f.git(cwd, 'branch', '--show-current'), 'prep/v2');
    f.enqueue('from-new-batch');
    assert.equal(f.state().queue.tasks['from-new-batch'].producer, 'Prep');
    assert.equal(f.state().workers.Prep.handle, 'private-Prep');
});

test('another persistent worker resumes a blocked committed exploration without losing its recovery changes', t => {
    const f = fixture(t), first = f.paths['Worker-1'], second = f.paths['Worker-2'];
    f.enqueue('recover');
    queueCommand('claim', {file: f.file, worker: 'Worker-1'}, first);
    writeFileSync(join(first, ARTIFACT), 'Retain this partial source observation.\n');
    f.git(first, 'add', ARTIFACT); f.git(first, 'commit', '-qm', 'preserve partial investigation');
    const recovery = f.git(first, 'rev-parse', 'HEAD');
    queueCommand('block', {file: f.file, worker: 'Worker-1', reason: 'Awaiting a source pointer.'}, first);
    queueCommand('unblock', {file: f.file, task: 'recover', reason: 'Source pointer supplied.'}, f.root);
    const task = queueCommand('claim', {file: f.file, worker: 'Worker-2'}, second);
    assert.equal(task.base, f.base);
    assert.equal(f.git(second, 'rev-parse', 'HEAD'), recovery);
    assert.match(readFileSync(join(second, ARTIFACT), 'utf8'), /partial source observation/);
    queueCommand('complete', {file: f.file, worker: 'Worker-2', json: f.save(second, 'result.json',
        {summary: 'Completed retained evidence.', outcome: 'match', paths: [ARTIFACT], checks: []})}, second);
    assert.equal(f.state().queue.tasks.recover.status, 'completed');
    assert.equal(f.git(first, 'rev-parse', 'HEAD'), recovery);
});

test('Main support returns observed failing checks without misreporting them as successful Prep evidence', t => {
    const f = fixture(t), worker = 'Worker-1', cwd = f.paths[worker];
    queueCommand('enqueue', {file: f.file, json: f.save(f.root, 'support.json', {
        id: 'check-failure', type: 'exploration', output: 'exploration', producer: 'Main', recipient: 'Main',
        purpose: 'support', question: 'Report the failing focused check.', stop: 'Return its observed result.',
        base: f.base, dependencies: [], sessions: [], reservations: ['contract:fixture-check'],
        allowedPaths: ['.cache/'], checks: ['focused'], artifacts: [],
    })}, f.root);
    queueCommand('claim', {file: f.file, worker}, cwd);
    const log = join(cwd, '.cache/failure.log');
    mkdirSync(join(cwd, '.cache'), {recursive: true});
    writeFileSync(log, 'A fixture check failed as expected.');
    queueCommand('complete', {file: f.file, worker, json: f.save(cwd, 'support-result.json', {
        summary: 'Recorded the actual failure.', outcome: 'failure', paths: [],
        checks: [{kind: 'focused', exitCode: 1, command: ['node', '--test', 'fixture'], log}],
    })}, cwd);
    const packet = JSON.parse(readFileSync(f.state().queue.tasks['check-failure'].result.packet, 'utf8'));
    assert.equal(packet.checks[0].exitCode, 1);
    assert.match(packet.checks[0].output, /failed/u);
});

test('concurrent worker claims share one lock and cannot execute the same queue item', async t => {
    const f = fixture(t);
    f.enqueue('first'); f.enqueue('second');
    const script = fileURLToPath(new URL('./work-queue.mjs', import.meta.url));
    const claim = worker => new Promise(resolve => {
        const child = spawn(process.execPath, [script, 'claim', '--worker', worker, '--file', f.file],
            {cwd: f.paths[worker], stdio: ['ignore', 'pipe', 'pipe']});
        let output = '', error = '';
        child.stdout.on('data', chunk => {output += chunk;});
        child.stderr.on('data', chunk => {error += chunk;});
        child.on('exit', code => resolve({worker, code, output, error}));
    });
    const results = await Promise.all(['Worker-1', 'Worker-2'].map(claim));
    for (const result of results) if (result.code !== 0) {
        assert.match(result.error, /ledger is locked/u);
        assert.equal((await claim(result.worker)).code, 0);
    }
    const assigned = Object.values(f.state().queue.tasks).filter(task => task.status === 'claimed');
    assert.equal(assigned.length, 2);
    assert.equal(new Set(assigned.map(task => task.worker)).size, 2);
    assert.equal(new Set(assigned.map(task => task.id)).size, 2);
});
