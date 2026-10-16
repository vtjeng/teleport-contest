import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
    readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import test from 'node:test';
import {recordTaskAttempt} from './record-task-attempt.mjs';
import {createLedger, recordEvent, summarizeLedger} from './worker-state.mjs';
import {verifyEvent} from './worker-delivery.mjs';
import {queueCommand} from './work-queue.mjs';
import {COLUMNS} from './score-log.mjs';

function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'record-task-attempt-'));
    const writable = path => {
        const stat = lstatSync(path);
        if (stat.isDirectory()) {
            chmodSync(path, 0o700);
            for (const name of readdirSync(path)) writable(join(path, name));
        }
    };
    t.after(() => {writable(root); rmSync(root, {recursive: true, force: true});});
    const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, '-c', 'core.hooksPath=/dev/null',
        '-c', 'user.name=Attempt fixture', '-c', 'user.email=attempt@example.invalid',
        '-c', 'commit.gpgsign=false', ...args], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
    git(root, 'init', '-qb', 'main');
    writeFileSync(join(root, '.gitignore'), '.cache/\n');
    writeFileSync(join(root, 'SCORE.tsv'), COLUMNS.join('\t') + '\n');
    git(root, 'add', '.gitignore', 'SCORE.tsv'); git(root, 'commit', '-qm', 'fixture');
    const base = git(root, 'rev-parse', 'HEAD'), paths = {};
    let ledger = createLedger('loop-20261016-attempt-test', root), sequence = 0;
    for (const worker of ['Prep', 'Worker-1']) {
        const worktree = join(root, worker);
        git(root, 'worktree', 'add', '-qb', `initial/${worker}`, worktree);
        paths[worker] = worktree;
        ledger = recordEvent(ledger, verifyEvent(root, summarizeLedger(ledger), {id: `fixture-${++sequence}`,
            type: 'register', worker, worktree, branch: `initial/${worker}`, base, handle: `fixture-${worker}`}));
    }
    writeFileSync(join(root, '.git/info/exclude'), 'Prep/\nWorker-1/\n');
    mkdirSync(join(root, '.cache'));
    const file = join(root, '.cache/ledger.json'); writeFileSync(file, JSON.stringify(ledger));
    queueCommand('enable', {file, prep: paths.Prep}, root);
    const queue = join(root, '.cache/queue.json');
    writeFileSync(queue, JSON.stringify({mode: 'work', sessions: [], blockers: [], synthetic: {batches: []}}));
    queueCommand('refresh', {file, queue}, root);
    const assignment = join(root, '.cache/assignment.json');
    writeFileSync(assignment, JSON.stringify({id: 'source-probe', type: 'exploration', output: 'exploration',
        producer: 'Main', recipient: 'Main', purpose: 'support', question: 'Fixture recording.', stop: 'One fixture.',
        base, dependencies: [], sessions: [], reservations: ['source:fixture.c:probe'], allowedPaths: ['.cache/'],
        checks: [], artifacts: [], evidenceContract: {version: 1, complete: ['provenance'], block: ['provenance']}}));
    queueCommand('enqueue', {file, json: assignment}, root);
    queueCommand('claim', {file, worker: 'Worker-1'}, paths['Worker-1']);
    const cwd = paths['Worker-1']; mkdirSync(join(cwd, '.cache'), {recursive: true});
    const input = join(cwd, '.cache/source.json'), original = JSON.stringify({version: 5,
        segments: [{seed: 42, datetime: '20400101010101', nethackrc: '', moves: 'i '}], comment: 'Independent fixture.'});
    writeFileSync(input, original);
    const options = {cwd, ledger: file, input, history: 'primary', attempt: 'scout-1'};
    const fake = source => {
        const path = join(root, '.cache/fake-recorder.mjs'); writeFileSync(path, source); return path;
    };
    return {root, cwd, base, file, input, original, options, fake, git};
}

test('snapshots actual input once, owns output/logs and retains bytes after source reuse', async t => {
    const f = fixture(t);
    const recorderScript = f.fake(`import {readFileSync, writeFileSync} from 'node:fs';
        writeFileSync(${JSON.stringify(f.input)}, '{"changed":true}');
        const bytes=readFileSync(process.argv[2]); writeFileSync(process.argv[3], bytes);
        process.stdout.write('actual stdout\\n'); process.stderr.write('actual stderr\\n');`);
    const result = await recordTaskAttempt(f.options, {recorderScript});
    assert.equal(result.exitCode, 0);
    const receipt = JSON.parse(readFileSync(result.receipt));
    const directory = join(f.cwd, '.cache/recorder-attempts/source-probe/primary/scout-1');
    assert.equal(readFileSync(join(directory, 'input.snapshot.json'), 'utf8'), f.original);
    assert.equal(readFileSync(join(directory, 'capture.session.json'), 'utf8'), f.original);
    assert.equal(readFileSync(join(directory, 'stdout.log'), 'utf8'), 'actual stdout\n');
    assert.equal(readFileSync(join(directory, 'stderr.log'), 'utf8'), 'actual stderr\n');
    assert.equal(JSON.parse(readFileSync(join(directory, 'started.json'))).status, 'started');
    assert.equal(receipt.status, 'completed'); assert.equal(receipt.base, f.base);
    assert.equal(receipt.inputSnapshotIntact, true);
    assert.equal(receipt.files['input.snapshot.json'].sha256, receipt.files['capture.session.json'].sha256);
    assert.equal(statSync(join(directory, 'input.snapshot.json')).mode & 0o222, 0);
    assert.equal(statSync(directory).mode & 0o222, 0);
    assert.equal(JSON.parse(readFileSync(f.input)).changed, true);
});

test('a reused attempt refuses before launch and leaves prior bytes unchanged', async t => {
    const f = fixture(t);
    const recorderScript = f.fake(`import {copyFileSync} from 'node:fs'; copyFileSync(process.argv[2],process.argv[3]);`);
    const first = await recordTaskAttempt(f.options, {recorderScript}), before = readFileSync(first.receipt);
    let launched = false;
    await assert.rejects(recordTaskAttempt(f.options, {launch: () => {launched = true;}}), /EEXIST/);
    assert.equal(launched, false); assert.deepEqual(readFileSync(first.receipt), before);
    const second = await recordTaskAttempt({...f.options, attempt: 'correction-2'}, {recorderScript});
    assert.equal(second.exitCode, 0); assert.notEqual(second.receipt, first.receipt);
});

test('nonzero recorder exit preserves failed receipt, empty logs and absent capture honestly', async t => {
    const f = fixture(t), recorderScript = f.fake('process.exitCode=7;');
    const result = await recordTaskAttempt(f.options, {recorderScript});
    const receipt = JSON.parse(readFileSync(result.receipt));
    assert.equal(result.exitCode, 7); assert.equal(receipt.status, 'failed');
    assert.deepEqual(receipt.child, {exitCode: 7, signal: null});
    assert.equal(receipt.files['stdout.log'].bytes, 0); assert.equal(receipt.files['stderr.log'].bytes, 0);
    assert.deepEqual(receipt.files['capture.session.json'], {present: false});
});

test('child exit zero without a capture is retained as a failed attempt', async t => {
    const f = fixture(t), recorderScript = f.fake('process.stdout.write("no capture\\n");');
    const result = await recordTaskAttempt(f.options, {recorderScript});
    const receipt = JSON.parse(readFileSync(result.receipt));
    assert.equal(receipt.child.exitCode, 0); assert.notEqual(result.exitCode, 0);
    assert.equal(receipt.status, 'failed');
    assert.deepEqual(receipt.files['capture.session.json'], {present: false});
});

test('signal termination retains actual outcome and partial log without inventing a capture', async t => {
    const f = fixture(t), recorderScript = f.fake(`import {writeSync} from 'node:fs';
        writeSync(2,'before signal\\n'); process.kill(process.pid,'SIGTERM');`);
    const result = await recordTaskAttempt(f.options, {recorderScript});
    const receipt = JSON.parse(readFileSync(result.receipt));
    assert.notEqual(result.exitCode, 0); assert.equal(receipt.child.signal, 'SIGTERM');
    assert.equal(receipt.child.exitCode, null); assert.equal(receipt.files['capture.session.json'].present, false);
    assert.equal(readFileSync(join(result.receipt, '../stderr.log'), 'utf8'), 'before signal\n');
});

test('existing started-only attempt is preserved rather than resumed or counted successful', async t => {
    const f = fixture(t), directory = join(f.cwd, '.cache/recorder-attempts/source-probe/primary/scout-1');
    mkdirSync(directory, {recursive: true}); writeFileSync(join(directory, 'started.json'), '{"status":"started"}\n');
    let launched = false;
    await assert.rejects(recordTaskAttempt(f.options, {launch: () => {launched = true;}}), /EEXIST/);
    assert.equal(launched, false); assert.equal(existsSync(join(directory, 'receipt.json')), false);
    assert.equal(readFileSync(join(directory, 'started.json'), 'utf8'), '{"status":"started"}\n');
});

test('input-only and current authoritative claim checks refuse before recorder launch', async t => {
    const f = fixture(t); let launched = false;
    const dependencies = {launch: () => {launched = true;}};
    writeFileSync(f.input, JSON.stringify({segments: [{moves: 'i', steps: []}]}));
    await assert.rejects(recordTaskAttempt(f.options, dependencies), /input-only/);
    assert.equal(launched, false);
    writeFileSync(f.input, f.original);
    f.git(f.cwd, 'switch', '-qc', 'unassigned-branch');
    await assert.rejects(recordTaskAttempt(f.options, dependencies), /authoritative claim/);
    assert.equal(launched, false);
});

async function waitForFile(path) {
    for (let i = 0; i < 200; i++) {
        if (existsSync(path)) return;
        await delay(25);
    }
    throw new Error(`fixture did not become ready: ${path}`);
}

for (const cancelled of [true, false]) {
    test(`${cancelled ? 'wrapper cancellation' : 'leader exit'} collects a grandchild holding the log FD`,
        {timeout: 15_000}, async t => {
            const f = fixture(t), ready = join(f.root, '.cache/grandchild.ready');
            const leader = join(f.root, '.cache/leader.pid');
            const grandchild = `import {writeFileSync,writeSync} from 'node:fs';
                process.on('SIGTERM',()=>{});
                writeFileSync(${JSON.stringify(ready)},String(process.pid));
                setInterval(()=>writeSync(2,'descendant tick\\n'),20);`;
            const recorderScript = f.fake(`import {spawn} from 'node:child_process';
                import {copyFileSync,writeFileSync,existsSync} from 'node:fs';
                copyFileSync(process.argv[2],process.argv[3]);
                writeFileSync(${JSON.stringify(leader)},String(process.pid));
                spawn(process.execPath,['--input-type=module','-e',${JSON.stringify(grandchild)}],
                    {stdio:['ignore','ignore',2]});
                process.on('SIGTERM',()=>process.exit(0));
                ${cancelled ? '' : `const timer=setInterval(()=>{
                    if(existsSync(${JSON.stringify(ready)})){clearInterval(timer);process.exit(0);}
                },10);`}`);
            const helper = join(f.root, '.cache/wrapper-helper.mjs');
            writeFileSync(helper, `import {recordTaskAttempt} from ${JSON.stringify(new URL('./record-task-attempt.mjs', import.meta.url).href)};
                const result=await recordTaskAttempt(${JSON.stringify(f.options)},
                    {recorderScript:${JSON.stringify(recorderScript)}});
                console.log(JSON.stringify(result));`);
            const child = spawn(process.execPath, [helper], {stdio: ['ignore', 'pipe', 'pipe']});
            const closed = once(child, 'close');
            let output = '', errors = '';
            child.stdout.on('data', bytes => {output += bytes;});
            child.stderr.on('data', bytes => {errors += bytes;});
            t.after(() => {
                child.kill('SIGKILL');
                if (existsSync(leader)) {
                    try {process.kill(-Number(readFileSync(leader, 'utf8')), 'SIGKILL');}
                    catch (error) {if (error.code !== 'ESRCH') throw error;}
                }
            });
            await waitForFile(ready);
            if (cancelled) child.kill('SIGTERM');
            const [exitCode] = await closed;
            assert.equal(exitCode, 0, errors);
            const result = JSON.parse(output), receipt = JSON.parse(readFileSync(result.receipt));
            assert.notEqual(result.exitCode, 0);
            assert.equal(receipt.status, 'failed');
            assert.equal(receipt.child.exitCode, 0); // Leader cooperates; grandchild ignores TERM.
            if (cancelled) assert.equal(receipt.child.cancelledBy, 'SIGTERM');
            else assert.match(receipt.child.error, /live descendants/);
            const log = join(result.receipt, '../stderr.log'), bytes = readFileSync(log);
            assert.match(bytes.toString(), /descendant tick/);
            assert.equal(createHash('sha256').update(bytes).digest('hex'), receipt.files['stderr.log'].sha256);
            await delay(100);
            assert.deepEqual(readFileSync(log), bytes, 'no inherited descriptor writes after receipt freeze');
            const pid = readFileSync(ready, 'utf8');
            try {
                const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
                assert.match(stat.slice(stat.lastIndexOf(')') + 2), /^[ZX] /u);
            } catch (error) {if (error.code !== 'ENOENT') throw error;}
        });
}

test('unverified collection leaves started-only evidence without freezing mutable logs', async t => {
    const f = fixture(t);
    const result = await recordTaskAttempt(f.options, {launch: async () => ({exitCode: null,
        signal: null, collected: false, error: 'fixture cannot verify collection'})});
    assert.equal(result.exitCode, 1); assert.equal(result.receipt, null);
    assert.equal(JSON.parse(readFileSync(result.started)).status, 'started');
    assert.equal(existsSync(join(result.started, '../receipt.json')), false);
    assert.notEqual(statSync(join(result.started, '../stderr.log')).mode & 0o200, 0);
});
