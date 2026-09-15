#!/usr/bin/env node
// Non-interactive validation runs in a user service, outside the agent's tmux
// scope. systemd owns the process tree even if this launcher is killed.
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, mkdtempSync, openSync,
    readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export const PROFILES = Object.freeze({
    focused: Object.freeze({ memory: 2 * 1024 ** 3, seconds: 120 }),
    full: Object.freeze({ memory: 6 * 1024 ** 3, seconds: 900 }),
});
const SLICE = 'teleport-validation.slice';
const TOTAL_MEMORY = 10 * 1024 ** 3;
const STOP_SECONDS = 2;
const SCRIPT = fileURLToPath(import.meta.url);
// Do not use TMPDIR: worktrees with different temporary-directory settings
// must still share the full-validation slot and total memory limit.
const STATE = `/tmp/teleport-validation-${process.getuid?.()}`;
const DESCRIPTION = 'teleport validation ';
const USAGE = `Usage:
  node scripts/run-bounded.mjs focused [--memory-mib N] [--seconds N] -- command [args...]
  node scripts/run-bounded.mjs full [--memory-mib N] [--seconds N] -- command [args...]
  node scripts/run-bounded.mjs status <run-id>
  node scripts/run-bounded.mjs wait <run-id>
  node scripts/run-bounded.mjs stop <run-id>

focused: 2 GiB / 120 seconds. full: 6 GiB / 900 seconds; one full run at a time.
All runs share a 10 GiB slice, with no swap and a two-second stop grace.
Options may lower limits, never raise them. Commands receive the caller's cwd,
arguments and environment, but no interactive stdin. stdout/stderr are retained
separately and streamed while waiting. Receipts and logs live in ${STATE}.
A duplicate launch fails with the existing run ID; wait reattaches without rerunning.
SIGINT/SIGTERM stop the service; losing the launcher does not remove its limits.
Requires Linux, cgroup v2, systemd 254+ and a working user manager. Run outside
the Codex sandbox; there is no unbounded fallback in this command.`;

export function parseOptions(args) {
    const [profile, ...rest] = args;
    if (!Object.hasOwn(PROFILES, profile)) throw new Error(`unknown profile; ${USAGE}`);
    const options = { profile, ...PROFILES[profile] };
    let i = 0;
    for (; i < rest.length && rest[i] !== '--'; i += 2) {
        const key = rest[i];
        const value = Number(rest[i + 1]);
        if (!['--memory-mib', '--seconds'].includes(key)
            || !Number.isInteger(value) || value <= 0)
            throw new Error('invalid limit; use --memory-mib or --seconds with a positive integer');
        const field = key === '--seconds' ? 'seconds' : 'memory';
        options[field] = key === '--seconds' ? value : value * 1024 ** 2;
        if (options[field] > PROFILES[profile][field]) throw new Error('limit exceeds profile maximum');
    }
    if (rest[i] !== '--' || !rest[i + 1]) throw new Error(USAGE);
    return { ...options, command: rest.slice(i + 1) };
}

export function serviceName({ profile, cwd, command }) {
    const key = createHash('sha256').update(JSON.stringify([cwd, command])).digest('hex').slice(0, 24);
    return `teleport-validation-${profile === 'full' ? 'full' : key}.service`;
}

function invoke(command, args) {
    const result = spawnSync(command, args, { encoding: 'utf8', timeout: 15_000,
        maxBuffer: 1024 * 1024 });
    if (result.error || result.status !== 0)
        throw new Error(`${command}: ${result.error?.message || result.stderr?.trim() || `exit ${result.status}`}`);
    return result.stdout;
}

function prepareState() {
    if (process.platform !== 'linux') throw new Error('bounded validation requires Linux and systemd');
    mkdirSync(STATE, { recursive: true, mode: 0o700 });
    const info = lstatSync(STATE);
    if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077))
        throw new Error(`unsafe validation state directory: ${STATE}`);
}

function directory(id) {
    if (!/^run-[A-Za-z0-9]{6}$/u.test(id)) throw new Error('invalid run ID');
    return join(STATE, id);
}
function readReceipt(id) {
    return JSON.parse(readFileSync(join(directory(id), 'receipt.json'), 'utf8'));
}
function saveReceipt(receipt) {
    const path = join(directory(receipt.id), 'receipt.json');
    const temporary = `${path}.${process.pid}`;
    writeFileSync(temporary, JSON.stringify(receipt, null, 2) + '\n', { mode: 0o600 });
    renameSync(temporary, path);
}
function showUnit(unit) {
    const fields = ['LoadState', 'ActiveState', 'SubState', 'Result', 'Description',
        'ExecMainCode', 'ExecMainStatus', 'MainPID', 'ControlGroup', 'InvocationID',
        'MemoryMax', 'MemorySwapMax', 'RuntimeMaxUSec', 'TimeoutStopUSec', 'KillMode', 'OOMPolicy'];
    const output = invoke('systemctl', ['--user', 'show', unit,
        ...fields.map(field => `--property=${field}`)]);
    return Object.fromEntries(output.trim().split('\n').map(line => {
        const equal = line.indexOf('=');
        return [line.slice(0, equal), line.slice(equal + 1)];
    }));
}

export function terminalResult(unit) {
    if (unit.LoadState === 'not-found') return { reason: 'unit-lost', exitCode: 1 };
    if (!['failed', 'inactive'].includes(unit.ActiveState) && unit.SubState !== 'exited') return null;
    if (unit.Result === 'timeout') return { reason: 'timeout', exitCode: 124 };
    if (unit.Result === 'oom-kill') return { reason: 'oom-kill', exitCode: 137 };
    if (unit.Result === 'success' && unit.ExecMainCode === '1' && unit.ExecMainStatus === '0')
        return { reason: 'success', exitCode: 0 };
    if (unit.ExecMainCode === '1' && Number(unit.ExecMainStatus) > 0)
        return { reason: 'exit-code', exitCode: Number(unit.ExecMainStatus) };
    if (['2', '3'].includes(unit.ExecMainCode))
        return { reason: unit.Result || 'signal', exitCode: 128 + Number(unit.ExecMainStatus) };
    return { reason: unit.Result === 'success' ? 'incomplete' : (unit.Result || 'unknown'), exitCode: 1 };
}

function snapshot(id) {
    const receipt = readReceipt(id);
    if (receipt.finishedAt) return receipt;
    const unit = showUnit(receipt.unit);
    if (unit.LoadState !== 'not-found' && unit.Description !== DESCRIPTION + id)
        throw new Error('service belongs to another run; refusing to inspect or stop it');
    return { ...receipt, observed: unit, result: terminalResult(unit) };
}

function configureSlice() {
    if (!existsSync('/sys/fs/cgroup/cgroup.controllers')) throw new Error('cgroup v2 is required');
    invoke('systemctl', ['--user', 'set-property', '--runtime', SLICE,
        `MemoryMax=${TOTAL_MEMORY}`, 'MemorySwapMax=0']);
}

// Launch and reap are short transactions under flock. A killed client releases
// this lock automatically; the service remains the long-lived reservation.
function transaction(action, id) {
    return JSON.parse(invoke('flock', ['--wait', '20', join(STATE, 'manager.lock'),
        process.execPath, SCRIPT, action, id]));
}

function launch(id) {
    const receipt = readReceipt(id);
    configureSlice();
    const existing = showUnit(receipt.unit);
    if (existing.LoadState !== 'not-found') {
        const owner = existing.Description?.startsWith(DESCRIPTION)
            ? existing.Description.slice(DESCRIPTION.length) : receipt.unit;
        saveReceipt({ ...receipt, finishedAt: new Date().toISOString(),
            reapedAt: new Date().toISOString(), blockingRun: owner,
            result: { reason: 'slot-occupied', exitCode: 75 } });
        throw new Error(`validation slot occupied by ${owner}; use run-bounded.mjs wait ${owner}`);
    }
    const dir = directory(id);
    invoke('systemd-run', ['--user', '--quiet', '--service-type=exec', '--remain-after-exit',
        '--expand-environment=no', `--unit=${receipt.unit}`, `--slice=${SLICE}`,
        `--description=${DESCRIPTION}${id}`, `--working-directory=${receipt.cwd}`,
        `--property=MemoryMax=${receipt.memory}`, '--property=MemorySwapMax=0',
        `--property=RuntimeMaxSec=${receipt.seconds}s`, `--property=TimeoutStopSec=${STOP_SECONDS}s`,
        '--property=KillMode=control-group', '--property=OOMPolicy=kill',
        '--property=ExitType=cgroup', '--property=LimitCORE=0',
        `--property=StandardOutput=append:${join(dir, 'stdout.log')}`,
        `--property=StandardError=append:${join(dir, 'stderr.log')}`,
        '--setenv=NODE_OPTIONS=', process.execPath, SCRIPT, '--exec', id]);
    receipt.startedAt = new Date().toISOString();
    saveReceipt(receipt);
    return receipt;
}

function finish(id, stop) {
    let receipt = snapshot(id);
    if (receipt.reapedAt) return receipt;
    if (stop && !receipt.result) {
        invoke('systemctl', ['--user', 'stop', receipt.unit]);
        receipt = snapshot(id);
        receipt.result = { reason: 'stopped', exitCode: 143 };
    }
    if (!receipt.result) return receipt;
    receipt.finishedAt ||= new Date().toISOString();
    // Save the outcome before releasing the reservation. Other waiters take
    // the same flock and read this receipt instead of touching a reused unit.
    saveReceipt(receipt);
    const current = showUnit(receipt.unit);
    // If an earlier reaper died after releasing the unit, a later launch may
    // already own that name. Its description prevents recovery stopping it.
    if (current.LoadState !== 'not-found' && current.Description === DESCRIPTION + id) {
        if (current.ActiveState === 'failed')
            invoke('systemctl', ['--user', 'reset-failed', receipt.unit]);
        else invoke('systemctl', ['--user', 'stop', receipt.unit]);
    }
    receipt.reapedAt = new Date().toISOString();
    saveReceipt(receipt);
    return receipt;
}

function ownCgroup() {
    return readFileSync('/proc/self/cgroup', 'utf8').trim().split('\n')
        .find(line => line.startsWith('0::'))?.slice(3);
}
function verifyCgroup(memory) {
    const group = ownCgroup();
    if (!group?.includes(`/${SLICE}/teleport-validation-`) || !group.endsWith('.service'))
        throw new Error('validation command is not in its bounded service');
    const limit = readFileSync(join('/sys/fs/cgroup', group, 'memory.max'), 'utf8').trim();
    const swap = readFileSync(join('/sys/fs/cgroup', group, 'memory.swap.max'), 'utf8').trim();
    const slice = group.slice(0, group.lastIndexOf('/'));
    const total = readFileSync(join('/sys/fs/cgroup', slice, 'memory.max'), 'utf8').trim();
    const totalSwap = readFileSync(join('/sys/fs/cgroup', slice, 'memory.swap.max'), 'utf8').trim();
    if (!(Number(limit) > 0 && Number(limit) <= memory) || swap !== '0'
        || !(Number(total) > 0 && Number(total) <= TOTAL_MEMORY) || totalSwap !== '0')
        throw new Error('validation memory or swap limits are missing');
    return true;
}

async function execute(id) {
    const receipt = readReceipt(id);
    const input = join(directory(id), 'environment.json');
    const env = JSON.parse(readFileSync(input, 'utf8'));
    unlinkSync(input); // Never leave the caller's environment in retained evidence.
    verifyCgroup(receipt.memory);
    const [command, ...args] = receipt.command;
    return await new Promise((resolveExit) => {
        const child = spawn(command, args, { cwd: receipt.cwd, env, stdio: 'inherit' });
        child.once('error', error => { console.error(error.message); resolveExit(127); });
        child.once('exit', (code, signal) => resolveExit(signal
            ? 128 + (constants.signals[signal] ?? 1) : (code ?? 1)));
    });
}

function logReader(id) {
    const offsets = new Map();
    return async () => {
        for (const [name, stream] of [['stdout', process.stdout], ['stderr', process.stderr]]) {
            const path = join(directory(id), `${name}.log`);
            if (!existsSync(path)) continue;
            let offset = offsets.get(name) || 0;
            const size = statSync(path).size;
            const fd = openSync(path, 'r');
            try {
                const buffer = Buffer.alloc(64 * 1024);
                while (offset < size) {
                    const read = readSync(fd, buffer, 0, Math.min(buffer.length, size - offset), offset);
                    if (!read) break;
                    // Wait for the write before reusing this buffer. A slow
                    // reader must not turn log streaming into an unbounded
                    // allocation in the launcher outside the cgroup.
                    await new Promise((done, reject) => stream.write(buffer.subarray(0, read),
                        error => error ? reject(error) : done()));
                    offset += read;
                }
            } finally { closeSync(fd); }
            offsets.set(name, offset);
        }
    };
}

export async function waitForRun(id, signal) {
    const readLogs = logReader(id);
    let stopped = false;
    const stop = () => { stopped = true; };
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
    try {
        for (;;) {
            const observed = snapshot(id);
            await readLogs();
            if (stopped || signal?.aborted || observed.result || observed.finishedAt) {
                const receipt = transaction(stopped || signal?.aborted ? '--stop' : '--finish', id);
                await readLogs();
                if (receipt.finishedAt) {
                    console.error(`bounded ${id}: ${receipt.result.reason}; receipt ${join(directory(id), 'receipt.json')}`);
                    return receipt.result.exitCode;
                }
            }
            await delay(250);
        }
    } finally {
        process.removeListener('SIGINT', stop);
        process.removeListener('SIGTERM', stop);
    }
}

export async function runBounded(options) {
    const maximum = PROFILES[options.profile];
    if (!maximum || !['memory', 'seconds'].every(key => Number.isInteger(options[key])
        && options[key] > 0 && options[key] <= maximum[key])
        || !Array.isArray(options.command) || !options.command.length
        || !options.command.every(value => typeof value === 'string' && !value.includes('\0')))
        throw new Error('invalid command or resource limit');
    prepareState();
    const dir = mkdtempSync(join(STATE, 'run-'));
    const id = basename(dir);
    const receipt = { id, ...options, cwd: resolve(options.cwd || process.cwd()),
        createdAt: new Date().toISOString() };
    receipt.unit = serviceName(receipt);
    saveReceipt(receipt);
    const environment = join(dir, 'environment.json');
    writeFileSync(environment, JSON.stringify(process.env), { mode: 0o600 });
    console.error(`bounded ${id}: ${receipt.unit}; logs ${dir}`);
    // Install cancellation before starting the service, not after its receipt
    // says started. A signal during systemd-run must survive the handoff to wait.
    const interruption = new AbortController();
    const interrupt = () => interruption.abort();
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', interrupt);
    try {
        try {
            transaction('--launch', id);
        } catch (error) {
            // An ambiguous manager failure might have started the service. Do not
            // remove its reservation or assume the payload has exited.
            if (existsSync(environment)) unlinkSync(environment);
            console.error(`bounded ${id}: ${error.message}; inspect this run before retrying`);
            return readReceipt(id).result?.exitCode || 1;
        }
        return await waitForRun(id, interruption.signal);
    } finally {
        process.removeListener('SIGINT', interrupt);
        process.removeListener('SIGTERM', interrupt);
    }
}

// An existing bounded parent (for example checkpoint -> npm test) owns the
// budget and reservation. An environment variable alone cannot bypass this.
export async function boundedMain(profile, run) {
    // These entry points parse help before doing work. Keep their help usable
    // without a service manager, including invalid mixed-help syntax errors.
    if (process.argv.slice(2).includes('--help')) return await run();
    if (process.platform === 'linux' && ownCgroup()?.includes(`/${SLICE}/teleport-validation-`)) {
        verifyCgroup(PROFILES.full.memory);
        return await run();
    }
    // Hosted CI owns an isolated VM and has a job-level timeout. This explicit
    // opt-out is never available to the bounded CLI or an ordinary local run.
    if (process.env.GITHUB_ACTIONS === 'true' && process.env.TELEPORT_VALIDATION_EXTERNAL === '1') {
        console.error('validation: external CI isolation; local systemd limits are not applied');
        return await run();
    }
    return await runBounded({ profile, ...PROFILES[profile],
        command: [process.execPath, ...process.execArgv, ...process.argv.slice(1)] });
}

async function main(args) {
    if (args.length === 1 && args[0] === '--help') { console.log(USAGE); return 0; }
    prepareState();
    const [action, id] = args;
    if (action?.startsWith('--') && args.length === 2) {
        if (action === '--exec') return await execute(id);
        const receipt = action === '--launch' ? launch(id)
            : ['--finish', '--stop'].includes(action) ? finish(id, action === '--stop') : null;
        if (!receipt) throw new Error(USAGE);
        console.log(JSON.stringify(receipt));
        return 0;
    }
    if (['status', 'wait', 'stop'].includes(action) && args.length === 2) {
        if (action === 'wait') return await waitForRun(id);
        console.log(JSON.stringify(action === 'status' ? snapshot(id) : transaction('--stop', id), null, 2));
        return 0;
    }
    return await runBounded(parseOptions(args));
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT) {
    main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => {
        console.error(`run-bounded: ${error.message}`);
        process.exitCode = 1;
    });
}
