import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOptions, runBounded, serviceName, terminalResult, PROFILES } from './run-bounded.mjs';

test('resource profiles cover the approved focused and full budgets', () => {
    // Bytes and seconds match the approved 2 GiB/2 min and 6 GiB/15 min limits.
    assert.deepEqual(PROFILES.focused, { memory: 2 * 1024 ** 3, seconds: 120 });
    assert.deepEqual(PROFILES.full, { memory: 6 * 1024 ** 3, seconds: 900 });
});

test('the CLI preserves command arguments without shell interpretation', () => {
    const command = ['node', '-e', 'console.log("$HOME", "%s")', 'a b'];
    assert.deepEqual(parseOptions(['focused', '--', ...command]), {
        profile: 'focused', ...PROFILES.focused, command,
    });
    // Smaller budgets make containment tests cheap; callers cannot raise a cap.
    const small = parseOptions(['focused', '--memory-mib', '128', '--seconds', '2', '--', 'true']);
    assert.equal(small.memory, 128 * 1024 ** 2);
    assert.equal(small.seconds, 2);
    for (const args of [[], ['focused', '--'], ['unknown', '--', 'true'],
        ['focused', '--seconds', '121', '--', 'true'],
        ['focused', '--memory-mib', '2049', '--', 'true'],
        ['focused', '--seconds', 'NaN', '--', 'true']]) {
        assert.throws(() => parseOptions(args), /usage|limit|profile/i);
    }
});

test('all full commands share a slot; focused identity includes cwd and argv', () => {
    const first = { profile: 'focused', cwd: '/one', command: ['node', '--test', 'a.mjs'] };
    assert.equal(serviceName(first), serviceName({ ...first, seconds: 1 }));
    assert.notEqual(serviceName(first), serviceName({ ...first, cwd: '/two' }));
    assert.notEqual(serviceName(first), serviceName({ ...first, command: ['node', '--test', 'b.mjs'] }));
    assert.equal(serviceName({ ...first, profile: 'full' }),
        serviceName({ ...first, profile: 'full', cwd: '/two', command: ['npm', 'test'] }));
});

test('programmatic callers cannot raise the profile limits either', async () => {
    // One byte over the full cap must fail before creating a directory or service.
    await assert.rejects(runBounded({ profile: 'full', memory: PROFILES.full.memory + 1,
        seconds: PROFILES.full.seconds, command: ['true'] }), /resource limit/u);
});

test('only a completed successful service is a pass', () => {
    // systemd CLD_EXITED=1, CLD_KILLED=2; SIGKILL=9 and exit 7 exercise failure propagation.
    const success = { ActiveState: 'active', SubState: 'exited', Result: 'success',
        ExecMainCode: '1', ExecMainStatus: '0' };
    assert.equal(terminalResult(success).exitCode, 0);
    assert.equal(terminalResult({ ...success, Result: 'exit-code', ExecMainStatus: '7' }).exitCode, 7);
    assert.equal(terminalResult({ ...success, Result: 'oom-kill', ExecMainCode: '2', ExecMainStatus: '9' }).exitCode, 137);
    assert.equal(terminalResult({ ...success, Result: 'timeout' }).exitCode, 124);
    assert.equal(terminalResult({ ...success, Result: 'signal', ExecMainCode: '2', ExecMainStatus: '9' }).exitCode, 137);
    assert.equal(terminalResult({ ...success, SubState: 'running' }), null);
    assert.notEqual(terminalResult({ LoadState: 'not-found' }).exitCode, 0);
    assert.notEqual(terminalResult({ ActiveState: 'inactive', Result: 'success' }).exitCode, 0);
});
