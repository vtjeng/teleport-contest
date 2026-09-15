// Run explicitly with TELEPORT_TEST_SYSTEMD=1 node --test this-file, outside
// the sandbox. The observer stays outside the services whose failure it tests.
// Ordinary suites skip these deliberate OOM and timeout probes.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const SCRIPT = fileURLToPath(new URL('./run-bounded.mjs', import.meta.url));
const enabled = process.env.TELEPORT_TEST_SYSTEMD === '1';
const runPattern = /bounded (run-[A-Za-z0-9]{6}):/u;
const state = `/tmp/teleport-validation-${process.getuid?.()}`;
function receipt(id) {
    return JSON.parse(readFileSync(join(state, id, 'receipt.json'), 'utf8'));
}
function cli(args, options = {}) {
    const child = spawnSync(process.execPath, [SCRIPT, ...args], {
        encoding: 'utf8', timeout: 20_000, ...options,
    }); // Twenty seconds bounds the test harness, not the tested service.
    if (child.error) throw child.error;
    return { ...child, id: runPattern.exec(child.stderr)?.[1] };
}
function command(code, extra = []) {
    // The 128 MiB cap is deliberately small for cheap failure probes. Short
    // happy-path commands use five seconds to allow ordinary process startup.
    return ['focused', '--memory-mib', '128', '--seconds', '5', ...extra,
        '--', process.execPath, '-e', code];
}
async function start(t, args) {
    const child = spawn(process.execPath, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr += data; });
    child.stdout.resume();
    const done = once(child, 'close');
    let id;
    // Wait for the saved service identity, not just a spawned launcher PID.
    for (let tries = 0; tries < 100; tries++) {
        id = runPattern.exec(stderr)?.[1];
        if (id && receipt(id).startedAt) break;
        if (child.exitCode !== null) throw new Error(stderr);
        await delay(50);
    }
    assert.ok(id && receipt(id).startedAt, stderr);
    t.after(async () => {
        cli(['stop', id]);
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        await done;
    });
    return { child, id, done };
}

test('systemd preserves cwd, arguments, environment and ordinary failure codes', { skip: !enabled }, (t) => {
    const cwd = mkdtempSync('/tmp/bounded-arguments-');
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const value = 'spaces $HOME %s "quotes"'; // Exercise both shell and systemd expansion hazards.
    const args = command('console.log(JSON.stringify([process.cwd(), process.argv[1], process.env.BOUNDED_FIXTURE])); console.error("err"); process.exitCode=7');
    args.push(value);
    const result = cli(args, { cwd, env: { ...process.env, BOUNDED_FIXTURE: value } });
    assert.equal(result.status, 7); // Nonzero payload exit is preserved, not flattened to 1.
    assert.deepEqual(JSON.parse(result.stdout), [cwd, value, value]);
    assert.match(result.stderr, /err/u);
    const saved = receipt(result.id);
    assert.equal(saved.result.reason, 'exit-code');
    assert.ok(saved.reapedAt);
    assert.equal(existsSync(join(state, result.id, 'environment.json')), false);
    assert.equal(saved.observed.MemoryMax, String(128 * 1024 ** 2));
    assert.equal(saved.observed.MemorySwapMax, '0');
    assert.equal(saved.observed.KillMode, 'control-group');
    assert.equal(saved.observed.OOMPolicy, 'kill');
});

test('a child allocation exceeding the cgroup cap does not kill the observer', { skip: !enabled }, () => {
    const before = process.pid;
    // Each filled buffer commits 8 MiB. Buffers are outside V8's old-space
    // budget, so this specifically tests the process-tree memory limit.
    const result = cli(command('const buffers=[]; for (;;) buffers.push(Buffer.alloc(8*1024*1024, 1))'));
    assert.equal(result.status, 137); // cgroup OOM, not timeout or V8 heap exhaustion.
    assert.equal(receipt(result.id).result.reason, 'oom-kill');
    assert.equal(process.pid, before);
});

test('OOM before helper startup still removes its private environment snapshot', { skip: !enabled }, () => {
    // One MiB is below Node's startup footprint, so execute() cannot consume
    // and delete the snapshot itself. The reaper must perform that cleanup.
    const result = cli(command('console.log("must not run")', ['--memory-mib', '1']));
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.ok(receipt(result.id).reapedAt);
    assert.equal(existsSync(join(state, result.id, 'environment.json')), false);
});

test('timeout kills a SIGTERM-resistant descendant and releases the reservation', { skip: !enabled }, () => {
    const result = cli(command('process.on("SIGTERM",()=>{}); for (;;) {}', ['--seconds', '1']));
    assert.equal(result.status, 124); // Runtime timeout, including forced stop after the grace period.
    const saved = receipt(result.id);
    assert.equal(saved.result.reason, 'timeout');
    assert.ok(saved.reapedAt);
    assert.equal(saved.observed.MainPID, '0');
});

test('a detached grandchild cannot outlive the command deadline', { skip: !enabled }, () => {
    // The direct child exits immediately after detaching. ExitType=cgroup must
    // keep the service running until its looping grandchild is killed.
    const result = cli(command('require("node:child_process").spawn(process.execPath, ["-e", "for (;;) {}"], {detached:true, stdio:"ignore"}).unref()',
        ['--seconds', '1']));
    assert.equal(result.status, 124);
    assert.equal(receipt(result.id).result.reason, 'timeout');
});

test('missing user-manager access fails before executing the payload', { skip: !enabled }, () => {
    const result = cli(command('console.log("must not run")'), {
        env: { ...process.env, DBUS_SESSION_BUS_ADDRESS: 'unix:path=/nonexistent/teleport-test-bus',
            XDG_RUNTIME_DIR: '/nonexistent/teleport-test-runtime' },
    }); // Block both the bus and systemctl's direct private-socket connection.
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.equal(existsSync(join(state, result.id, 'environment.json')), false);
});

test('a lost launcher can be reattached without duplicating the command', { skip: !enabled }, async (t) => {
    // Three seconds leaves time to kill the launcher and attempt a duplicate.
    const args = command('setTimeout(()=>console.log("finished once"), 3000)');
    const original = await start(t, args);
    original.child.kill('SIGKILL');
    await original.done;
    const duplicate = cli(args);
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, new RegExp(`slot occupied by ${original.id}`, 'u'));
    const recovered = cli(['wait', original.id]);
    assert.equal(recovered.status, 0, recovered.stderr);
    assert.equal(recovered.stdout.trim(), 'finished once');
    assert.equal(receipt(original.id).result.reason, 'success');
});

test('independent focused services can overlap and share the same bounded slice', { skip: !enabled }, async (t) => {
    // Ten seconds permits observing both live services; explicit stop ends them early.
    const a = await start(t, command('setTimeout(()=>{}, 10000)', ['--seconds', '15']));
    const b = await start(t, command('setTimeout(()=>{}, 10001)', ['--seconds', '15']));
    const observe = id => JSON.parse(cli(['status', id]).stdout);
    const first = observe(a.id), second = observe(b.id);
    assert.equal(first.observed.SubState, 'running');
    assert.equal(second.observed.SubState, 'running');
    assert.notEqual(first.unit, second.unit);
    assert.equal(first.observed.ControlGroup.slice(0, first.observed.ControlGroup.lastIndexOf('/')),
        second.observed.ControlGroup.slice(0, second.observed.ControlGroup.lastIndexOf('/')));
    const total = readFileSync(join('/sys/fs/cgroup', first.observed.ControlGroup,
        '..', 'memory.max'), 'utf8').trim();
    assert.equal(total, String(10 * 1024 ** 3)); // The approved shared 10 GiB ceiling.
    assert.equal(cli(['stop', a.id]).status, 0);
    assert.equal(cli(['stop', b.id]).status, 0);
    await Promise.all([a.done, b.done]);
});

test('different full commands contend for one slot across working directories', { skip: !enabled }, async (t) => {
    // Do not interfere with an existing checkpoint while running this probe.
    // An unrelated owner could finish between observation and the probe; only
    // a service this test owns can establish a stable exclusion schedule.
    const existing = spawnSync('systemctl', ['--user', 'show', 'teleport-validation-full.service',
        '--property=Description', '--value'], { encoding: 'utf8', timeout: 15_000 });
    assert.equal(existing.status, 0, existing.stderr);
    const existingId = /^teleport validation (run-[A-Za-z0-9]{6})/u.exec(existing.stdout)?.[1];
    if (existingId) {
        t.skip(`Full slot owned by ${existingId}; rerun this probe after its owner finishes.`);
        return;
    }
    const a = await start(t, ['full', '--seconds', '15', '--', process.execPath, '-e', 'setTimeout(()=>{},10000)']);
    const second = cli(['full', '--', process.execPath, '-e', 'console.log("must not run")'], { cwd: '/tmp' });
    assert.notEqual(second.status, 0);
    assert.equal(second.stdout, '');
    assert.match(second.stderr, new RegExp(`slot occupied by ${a.id}`, 'u'));
    assert.equal(cli(['stop', a.id]).status, 0);
    await a.done;
});

test('SIGTERM to the waiting launcher stops and reaps its service', { skip: !enabled }, async (t) => {
    const running = await start(t, command('setTimeout(()=>{},10000)', ['--seconds', '15']));
    running.child.kill('SIGTERM');
    const [code] = await running.done;
    assert.equal(code, 143); // The interrupted CLI fails instead of leaving an unowned run.
    assert.equal(receipt(running.id).result.reason, 'stopped');
    assert.ok(receipt(running.id).reapedAt);
});

test('two waiters collect one outcome without racing service cleanup', { skip: !enabled }, async (t) => {
    const running = await start(t, command('setTimeout(()=>{},500)'));
    const other = spawn(process.execPath, [SCRIPT, 'wait', running.id], { stdio: 'ignore' });
    const done = once(other, 'close');
    const [[first], [second]] = await Promise.all([running.done, done]);
    assert.equal(first, 0); // Both clients see the same successful command.
    assert.equal(second, 0);
    assert.ok(receipt(running.id).reapedAt);
});
