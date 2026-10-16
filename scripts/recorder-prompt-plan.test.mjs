import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import {createPromptController, digest} from './recorder-prompt-plan.mjs';
import {recordSegment, replayWithinDeadline} from './record-session.mjs';

const predicate = screen => ({screen, cursor: [0, 0, 1]});
const source = 'nethack-c/upstream/src/read.c';
async function plan() {
    return {schemaVersion: 1, sources: [{path: source, sha256: digest(await readFile(source)),
        reason: 'Synthetic boundary fixture; not a gameplay plan'}],
    normalBoundaryProof: 'Fixture normal frame is emitted only by the fake command loop',
    maxMs: 10000, maxKeys: 8, maxFrames: 10,
    targets: [predicate('target--More--')], observers: [predicate('inventory')],
    rules: [
        {id: 'page', kind: 'more', match: predicate('target--More--'), proof: 'Fixture pager'},
        {id: 'call', kind: 'scroll-call', match: predicate('Call a scroll labeled TEST:'),
            proof: 'read.c trycall; do_name.c name_from_player Escape is neutral'},
        {id: 'command', kind: 'normal', match: predicate('normal'), proof: 'Fixture command loop'},
    ]};
}

test('finite completion handles variable pages, neutral call and exactly one observer', async () => {
    const p = await plan(), controller = createPromptController(p, 0);
    p.rules[0].match.screen = 'hot-reload';
    for (const [screen, key] of [['target--More--', ' '], ['target--More--', ' '],
        ['Call a scroll labeled TEST:', '\x1b'], ['normal', 'i']])
        assert.equal(controller.decide(predicate(screen), 1).key, key);
    assert.equal(controller.decide(predicate('inventory'), 1).stop, 'success');
    assert.throws(() => controller.decide(predicate('normal'), 1), /already stopped/u);
});

test('unknown, overlapping, target-missing and repeated-observer boundaries fail closed', async () => {
    const p = await plan();
    assert.equal(createPromptController(p, 0).decide(predicate('nothing proves command input'), 1).stop,
        'unknown-boundary');
    assert.equal(createPromptController(p, 0).decide(predicate('normal'), 1).stop,
        'normal-before-target-or-repeated-observer');
    p.rules.push({...p.rules[0], id: 'ambiguous'});
    assert.equal(createPromptController(p, 0).decide(predicate('target--More--'), 1).stop, 'ambiguous-boundary');
    p.rules.pop();
    p.observers.push(predicate('normal'));
    assert.equal(createPromptController(p, 0).decide(predicate('normal'), 1).stop, 'ambiguous-boundary');
    p.observers.pop();
    const controller = createPromptController(p, 0);
    controller.decide(predicate('target--More--'), 1);
    controller.decide(predicate('normal'), 1);
    assert.equal(controller.decide(predicate('normal'), 1).stop, 'normal-before-target-or-repeated-observer');
});

test('cursor differences and finite key/frame/deadline caps stop without another key', async () => {
    const p = await plan();
    assert.equal(createPromptController(p, 0).decide({screen: 'target--More--', cursor: [1, 0, 1]}, 1).stop,
        'unknown-boundary');
    assert.equal(createPromptController(p, 0).decide(predicate('target--More--'), p.maxMs).stop, 'time-cap');
    p.maxKeys = 1;
    const keys = createPromptController(p, 0);
    keys.decide(predicate('target--More--'), 1);
    assert.equal(keys.decide(predicate('target--More--'), 1).stop, 'key-cap');
    p.maxFrames = 1;
    const frames = createPromptController(p, 0);
    frames.decide(predicate('target--More--'), 1);
    assert.equal(frames.decide(predicate('target--More--'), 1).stop, 'frame-cap');
});

test('policy cannot select gameplay keys or replace positive normal proof with a heuristic', async () => {
    for (const mutate of [p => p.rules[0].kind = 'wish', p => p.normalBoundaryProof = '',
        p => p.rules[0].match = {contains: '--More--'}, p => p.maxKeys = 100,
        p => p.rules[0].match.screen = 'not a page', p => p.sources[0].path = '../outside']) {
        const p = await plan(); mutate(p);
        assert.throws(() => createPromptController(p), /prompt plan/u);
    }
});

// A synthetic marker producer, not NetHack: these tests execute NO C game.
async function fixture(t, scenario = 'success') {
    const dir = await mkdtemp(path.join(tmpdir(), 'nh-prompt-test-'));
    t.after(() => rm(dir, {recursive: true, force: true}));
    await mkdir(path.join(dir, 'install'));
    const binary = path.join(dir, 'fake.mjs');
    await writeFile(binary, `#!/usr/bin/env node
import {appendFileSync, existsSync, writeFileSync, rmSync} from 'node:fs';
const mode=${JSON.stringify(scenario)};
// Keep the deliberate exit observable if the recorder terminates on the
// observer frame before this process reaches its synchronous exit(7).
if(mode==='crash-after-observer') process.on('SIGTERM',()=>{});
const runfile=${JSON.stringify(path.join(dir, 'runs'))};
const replay=existsSync(runfile); appendFileSync(runfile,'run\\n');
let n=0;
function emit(screen) {
 const payload=Buffer.from(screen);
 process.stdout.write('\\x1b]7777;KIND=input;SEQ='+ (++n) +';CX=0;CY=0;LEN='+payload.length+'\\x07');
 process.stdout.write(payload);
}
emit('boot');
process.stdin.on('data', data => {
 for(const key of data.toString()) {
  appendFileSync(${JSON.stringify(path.join(dir, 'keys'))},key);
  if(mode==='crash') process.exit(7);
  if(mode==='timeout') continue;
  const states=['target--More--','Call a scroll labeled TEST:','normal','inventory'];
  let screen=states[n-1] || 'unexpected extra key';
  if(mode==='unknown') screen='unrecognized prompt';
  if(mode==='replay-mismatch' && replay && n===4) screen='different inventory';
  emit(screen);
  if(mode==='replay-setup-failure' && n===5 && !replay) {
   rmSync(process.env.HOME,{recursive:true,force:true}); writeFileSync(process.env.HOME,'not a directory');
  }
  if(mode==='crash-after-observer' && n===5) process.exit(7);
 }
});
`, {mode: 0o700});
    const input = path.join(dir, 'input.json'), policy = path.join(dir, 'plan.json');
    const output = path.join(dir, 'capture.json'), receipt = path.join(dir, 'receipt.json');
    const recipe = path.join(dir, 'recipe.json');
    const p = await plan();
    if (scenario === 'timeout') p.maxMs = 1000;
    await writeFile(input, JSON.stringify({version: 5, segments: [{seed: 1, datetime: '20000110090000',
        nethackrc: 'OPTIONS=name:Fixture', moves: '\r'}]}));
    await writeFile(policy, JSON.stringify(p));
    const run = (args = []) => spawnSync(process.execPath, ['scripts/record-session.mjs', input, output,
        '--prompt-plan', policy, '--prompt-receipt', receipt, '--emitted-recipe', recipe, ...args],
    {env: {...process.env, NETHACK_BINARY: binary, NETHACK_INSTALL: path.join(dir, 'install')},
        encoding: 'utf8', timeout: 15000});
    return {dir, run, output, receipt, recipe, input, policy, binary};
}

test('CLI same-process capture emits wire-canonical static recipe and performs ONE unchanged replay', async t => {
    const f = await fixture(t), result = f.run();
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(await readFile(f.receipt));
    const input = JSON.parse(await readFile(f.recipe));
    assert.equal(input.segments[0].moves, '\n \x1bi');
    assert.equal(Object.hasOwn(input.segments[0], 'steps'), false);
    assert.equal(receipt.captureComplete, true);
    assert.equal(receipt.replay.status, 'matched');
    assert.equal(await readFile(path.join(f.dir, 'runs'), 'utf8'), 'run\nrun\n');
    assert.equal(await readFile(path.join(f.dir, 'keys'), 'utf8'), '\n \x1bi\n \x1bi');
    const events = (await readFile(`${f.receipt}.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse);
    for (const run of ['capture', 'replay']) {
        assert.equal(events.filter(e => e.run === run && e.kind === 'frame').length, 5);
        assert.deepEqual(events.filter(e => e.run === run && e.kind === 'key-intent').map(e => e.bytes),
            ['0a', '20', '1b', '69']);
    }
    assert.equal(events[0].kind, 'frozen-plan');
    assert.equal(events.at(-1).kind, 'static-replay-outcome');
    const rerun = f.run();
    assert.notEqual(rerun.status, 0);
    assert.match(rerun.stderr, /artifact already exists/u);
    assert.equal(await readFile(path.join(f.dir, 'runs'), 'utf8'), 'run\nrun\n');
});

for (const mode of ['unknown', 'crash', 'timeout', 'crash-after-observer', 'replay-mismatch', 'replay-setup-failure']) {
    test(`CLI ${mode} retains partial evidence, reports incomplete and never retries`, async t => {
        const f = await fixture(t, mode), result = f.run();
        assert.equal(result.status, 2, result.stderr);
        const receipt = JSON.parse(await readFile(f.receipt));
        assert.equal(receipt.captureComplete, false);
        assert.ok(JSON.parse(await readFile(f.output)).segments[0].steps.length >= 1);
        assert.ok(JSON.parse(await readFile(f.recipe)).segments[0].moves.startsWith('\n'));
        const runs = (await readFile(path.join(f.dir, 'runs'), 'utf8')).trim().split('\n');
        assert.equal(runs.length, mode === 'replay-mismatch' ? 2 : 1);
        if (mode === 'replay-mismatch') assert.equal(receipt.replay.status, 'mismatched');
        else if (mode === 'replay-setup-failure') {
            assert.equal(receipt.replay.status, 'failed');
            assert.equal(receipt.replay.physicalRuns, 1);
        }
        else assert.equal(receipt.replay.status, 'not-required');
        if (mode === 'crash-after-observer') {
            assert.equal(receipt.status, 'process-failure');
            assert.equal(receipt.command.exitCode, 7);
            assert.equal(receipt.command.signal, null);
            assert.equal(receipt.observerSuccess, false);
            assert.equal(receipt.replay.physicalRuns, 1);
            const events = (await readFile(`${f.receipt}.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse);
            assert.equal(events.filter(e => e.kind === 'frame').length, 5);
            assert.equal(events.filter(e => e.kind === 'decision').at(-1).stop, 'success');
        }
        assert.match(await readFile(`${f.receipt}.jsonl`, 'utf8'), /command-outcome/u);
        if (mode === 'replay-mismatch') {
            const events = (await readFile(`${f.receipt}.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse);
            assert.equal(events.filter(e => e.run === 'replay' && e.kind === 'key-intent').length, 4);
        }
    });
}

test('default static recording remains static, creates no policy artifacts and does not replay', async t => {
    const f = await fixture(t);
    await writeFile(f.input, JSON.stringify({version: 5, segments: [{moves: '\n \x1bi'}]}));
    const result = spawnSync(process.execPath, ['scripts/record-session.mjs', f.input, f.output],
        {env: {...process.env, NETHACK_BINARY: f.binary, NETHACK_INSTALL: path.join(f.dir, 'install')},
            encoding: 'utf8', timeout: 10000});
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(path.join(f.dir, 'runs'), 'utf8'), 'run\n');
    assert.equal(JSON.parse(await readFile(f.output)).segments[0].moves, '\n \x1bi');
    await assert.rejects(readFile(f.receipt), /ENOENT/u);
});

test('changed source proof rejects before any physical child invocation', async t => {
    const f = await fixture(t), p = await plan();
    p.sources[0].sha256 = '0'.repeat(64);
    await writeFile(f.policy, JSON.stringify(p));
    const result = f.run();
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source binding changed/u);
    await assert.rejects(readFile(path.join(f.dir, 'runs')), /ENOENT/u);
});

test('early process failure never puts unsent prefix keys in the emitted recipe', async t => {
    const f = await fixture(t, 'crash');
    await writeFile(f.input, JSON.stringify({version: 5, segments: [{moves: 'abc'}]}));
    assert.equal(f.run().status, 2);
    assert.equal(JSON.parse(await readFile(f.recipe)).segments[0].moves, 'a');
});

test('capture finalization exhausting deadline cannot launch an independent replay', async t => {
    const f = await fixture(t), p = await plan();
    let now = 0;
    const result = await recordSegment({seg: {moves: 't'}, isFirstSegment: true,
        binary: f.binary, installDir: path.join(f.dir, 'install'), rngLogPath: path.join(f.dir, 'rng'),
        homeDir: path.join(f.dir, 'home'), tz: 'America/New_York', prompt: p,
        onReceipt: async event => { if (event.kind === 'command-outcome') now = 100; }});
    assert.equal(result.promptResult.observerSuccess, true);
    const replay = await replayWithinDeadline(100, () => { throw new Error('must not launch'); }, () => now);
    assert.equal(replay, null);
    assert.equal(await readFile(path.join(f.dir, 'runs'), 'utf8'), 'run\n');
});

test('deadline check immediately before spawn also catches setup or replay-start I/O expiry', async t => {
    const f = await fixture(t);
    const result = await recordSegment({seg: {moves: 't'}, isFirstSegment: true,
        binary: f.binary, installDir: path.join(f.dir, 'install'), rngLogPath: path.join(f.dir, 'rng'),
        homeDir: path.join(f.dir, 'home'), tz: 'America/New_York', deadline: Date.now() - 1,
        preserveFailure: true});
    assert.equal(result.promptResult.status, 'deadline-exhausted');
    assert.equal(result.promptResult.command.launched, false);
    await assert.rejects(readFile(path.join(f.dir, 'runs')), /ENOENT/u);
});
