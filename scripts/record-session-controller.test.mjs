// recordSegment() with a caller's controller choosing each key from the
// screen, as the closed-loop bots that generate synthetic batches do. A
// synthetic marker producer stands in for NetHack: no C game runs.
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {recordSegment} from './record-session.mjs';

// The fake game shows 'boot', then for each byte it reads appends the
// byte's hex to a log and shows 'got <hex>'. In 'close-input' mode it closes
// its input after 'boot' and exits 500 ms later, so the recorder's next
// write meets a closed pipe (EPIPE).
async function fixture(t, mode = 'echo') {
    const dir = await mkdtemp(path.join(tmpdir(), 'nh-controller-test-'));
    t.after(() => rm(dir, {recursive: true, force: true}));
    await mkdir(path.join(dir, 'install'));
    const binary = path.join(dir, 'fake.mjs');
    const log = path.join(dir, 'bytes');
    await writeFile(binary, `#!/usr/bin/env node
import {appendFileSync, closeSync} from 'node:fs';
let n = 0;
function emit(screen) {
    const payload = Buffer.from(screen);
    process.stdout.write('\\x1b]7777;KIND=input;SEQ=' + (++n) + ';CX=0;CY=0;LEN=' + payload.length + '\\x07');
    process.stdout.write(payload);
}
emit('boot');
if (${JSON.stringify(mode)} === 'close-input') {
    closeSync(0);
    setTimeout(() => process.exit(0), 500);
} else {
    process.stdin.on('data', data => {
        for (const byte of data) {
            appendFileSync(${JSON.stringify(log)}, byte.toString(16).padStart(2, '0') + ' ');
            emit('got ' + byte.toString(16));
        }
    });
}
`, {mode: 0o700});
    const record = controller => recordSegment({seg: {moves: 'a'}, isFirstSegment: true,
        binary, installDir: path.join(dir, 'install'), rngLogPath: path.join(dir, 'rng'),
        homeDir: path.join(dir, 'home'), tz: 'America/New_York', controller});
    return {record, log};
}

// A controller that sends `keys` in turn, then stops with 'done'.
function scripted(keys) {
    const seen = [];
    return {
        seen,
        plan: {maxMs: 10000},
        decisions: [],
        decide(step) {
            seen.push([step.frameIndex, step.screen]);
            return seen.length <= keys.length ? {key: keys[seen.length - 1]} : {stop: 'done'};
        },
    };
}

test('a controller chooses each key after the prefix, one byte per key', async t => {
    const f = await fixture(t);
    // 'a' is the prefix in seg.moves. 'é' (U+00E9) must reach the game as
    // the single byte 0xE9, as the judge's sessions give it; 'z' is an
    // ordinary key after it.
    const controller = scripted(['é', 'z']);
    const result = await f.record(controller);
    assert.equal(result.promptResult.status, 'done');
    assert.equal(await readFile(f.log, 'utf8'), '61 e9 7a ');
    assert.equal(result.moves, 'aéz');
    assert.deepEqual(result.steps.map(s => s.key), [null, 'a', 'é', 'z']);
    // decide() is asked only after the prefix key, with each new screen.
    assert.deepEqual(controller.seen.map(([i]) => i), [1, 2, 3]);
    assert.match(controller.seen[1][1], /got e9/u);
});

test('a controller key above U+00FF fails without reaching the game', async t => {
    const f = await fixture(t);
    // U+20AC ('€') has no one-byte form; keyByte() refuses it.
    const result = await f.record(scripted(['€']));
    assert.equal(result.promptResult.status, 'recorder-failure');
    assert.match(result.promptResult.command.error, /above U\+00FF/u);
    assert.equal(await readFile(f.log, 'utf8'), '61 ');
});

test('a game that closes its input is reported by how it exited, not as EPIPE', async t => {
    const f = await fixture(t, 'close-input');
    // The prefix key 'a' meets the closed pipe; the fake game then exits 0.
    const result = await f.record(scripted([]));
    assert.equal(result.promptResult.status, 'premature-exit');
    assert.equal(result.promptResult.command.exitCode, 0);
    assert.equal(result.promptResult.command.error, null);
});

test('a prompt plan and a controller cannot both be given', async () => {
    // The refusal comes before any file is written, so the paths are unused.
    await assert.rejects(recordSegment({seg: {moves: ''}, isFirstSegment: true,
        binary: 'unused', installDir: 'unused', rngLogPath: 'unused', homeDir: 'unused',
        tz: 'America/New_York', prompt: {}, controller: scripted([])}), /not both/u);
});
