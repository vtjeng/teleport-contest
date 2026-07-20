import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RECORD_SCRIPT = path.join(SCRIPT_DIR, 'record-session.mjs');
// This seed and clock are arbitrary fresh inputs; recorder lifecycle behavior
// under test does not depend on NetHack's generated game state.
const SYNTHETIC_SEED = 123;
const SYNTHETIC_DATETIME = '20260719120000';
// Five seconds catches a hung fake while leaving ample time for process startup.
const CHILD_TIMEOUT_MS = 5000;

async function runWithFakeRecorder(t, fakeSource, { moves = 'a', stepKeys = [null, 'a'] } = {}) {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'record-session-test-'));
    t.after(() => fs.rm(tmpDir, { recursive: true, force: true }));

    const binary = path.join(tmpDir, 'fake-recorder');
    const installDir = path.join(tmpDir, 'install');
    const inputPath = path.join(tmpDir, 'input.session.json');
    const outputPath = path.join(tmpDir, 'output.session.json');
    const pidPath = path.join(tmpDir, 'fake.pid');
    await fs.mkdir(installDir);
    await fs.writeFile(binary, `#!/usr/bin/env node\n${fakeSource}`, { mode: 0o755 });
    await fs.chmod(binary, 0o755);

    // Two expected steps exercise the initial input boundary and the boundary
    // after the one supplied key.  The test recorder never reads a fixture.
    const session = {
        version: 5,
        segments: [{
            seed: SYNTHETIC_SEED,
            datetime: SYNTHETIC_DATETIME,
            nethackrc: 'OPTIONS=name:synthetic',
            moves,
            steps: stepKeys.map((key) => ({ key })),
        }],
    };
    await fs.writeFile(inputPath, JSON.stringify(session));

    const result = spawnSync(process.execPath, [RECORD_SCRIPT, inputPath, outputPath], {
        env: {
            ...process.env,
            NETHACK_BINARY: binary,
            NETHACK_INSTALL: installDir,
            FAKE_PID_PATH: pidPath,
        },
        encoding: 'utf8',
        timeout: CHILD_TIMEOUT_MS,
    });
    return { ...result, outputPath, pidPath };
}

test('fails when the recorder exits cleanly before any input boundary', async (t) => {
    const result = await runWithFakeRecorder(t, 'process.exit(0);\n');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /got 0, expected 2 \(exit code 0\)/u);
    await assert.rejects(fs.access(result.outputPath));
});

test('fails when the recorder exits cleanly with an incomplete trace', async (t) => {
    const fakeSource = String.raw`
const marker = '\x1b]7777;KIND=input;SEQ=1;ANIM=0;CX=0;CY=0;LEN=0\x07';
process.stdout.write(marker, () => process.exit(0));
`;
    const result = await runWithFakeRecorder(t, fakeSource);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /got 1, expected 2 \(exit code 0\)/u);
    await assert.rejects(fs.access(result.outputPath));
});

test('fails on a nonzero recorder exit', async (t) => {
    // Exit status 7 is an arbitrary nonzero status used to exercise the child
    // failure path rather than a particular NetHack error.
    const result = await runWithFakeRecorder(t, 'process.exit(7);\n');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /exit code 7 after 0\/2 input boundaries/u);
    await assert.rejects(fs.access(result.outputPath));
});

test('fails when a complete marker stream ends with an unexpected signal', async (t) => {
    const fakeSource = String.raw`
const fs = require('node:fs');
const marker = '\x1b]7777;KIND=input;SEQ=1;ANIM=0;CX=0;CY=0;LEN=0\x07';
fs.writeSync(1, marker);
process.kill(process.pid, 'SIGUSR2');
`;
    const result = await runWithFakeRecorder(t, fakeSource, {
        moves: '',
        stepKeys: [null],
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /unexpectedly with signal SIGUSR2/u);
    await assert.rejects(fs.access(result.outputPath));
});

test('waits for an uncooperative recorder to be killed after failure', async (t) => {
    const fakeSource = String.raw`
const fs = require('node:fs');
fs.writeFileSync(process.env.FAKE_PID_PATH, String(process.pid));
process.on('SIGTERM', () => {});
const malformed = '\x1b]7777;KIND=input;SEQ=1;ANIM=0;CX=0;CY=0;LEN=-1\x07';
fs.writeSync(1, malformed);
// Keep the fake alive until record-session's forced-kill path runs.
setInterval(() => {}, 1000);
`;
    const result = await runWithFakeRecorder(t, fakeSource);
    const fakePid = Number(await fs.readFile(result.pidPath, 'utf8'));

    assert.equal(result.status, 1);
    assert.equal(result.error, undefined);
    let stillAlive = true;
    try {
        process.kill(fakePid, 0);
    } catch (error) {
        if (error.code === 'ESRCH') stillAlive = false;
        else throw error;
    }
    // Clean up even if this assertion regresses, so the test never leaves its
    // deliberately SIGTERM-resistant child behind.
    if (stillAlive) process.kill(fakePid, 'SIGKILL');
    assert.equal(stillAlive, false);
    await assert.rejects(fs.access(result.outputPath));
});

test('accepts the recipe step count when a game consumes only part of moves', async (t) => {
    const fakeSource = String.raw`
function marker(seq) {
    return '\x1b]7777;KIND=input;SEQ=' + seq
        + ';ANIM=0;CX=0;CY=0;LEN=0\x07';
}
process.stdout.write(marker(1));
process.stdin.once('data', () => process.stdout.write(marker(2)));
// Stay alive until record-session intentionally terminates the recorder after
// collecting the expected second boundary.
setInterval(() => {}, 1000);
`;
    // Three planned keys but two canonical boundaries model a game which
    // terminates after the first key and never consumes the remaining input.
    const result = await runWithFakeRecorder(t, fakeSource, {
        moves: 'abc',
        stepKeys: [null, 'a'],
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(await fs.readFile(result.outputPath, 'utf8'));
    assert.equal(output.segments[0].steps.length, 2);
});
