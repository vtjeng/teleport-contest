#!/usr/bin/env node
// Coordinator-owned event log. Tasks, deliveries, and reservations are rebuilt
// from these events, so no second hand-maintained status table can drift.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
    readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

export const USAGE = `Usage (run from the coordinator checkout):
  node scripts/worker-state.mjs init --run <run-id> [--file <ledger.json>]
  node scripts/worker-state.mjs event --json '<event>' [--file <ledger.json>]
  node scripts/worker-state.mjs status [--file <ledger.json>]

The default file is .cache/worker-state.json. init never overwrites a ledger.
status is read-only and rebuilds current ownership after a restart. The old
pilot's manual JSON is not migrated: preserve it and reconcile its workers/WIP
before initializing a new ledger at a different --file path.

Every event needs a stable id and type. Retrying the exact same id and payload
is a no-op; reusing an id with different data fails. Timestamps are supplied
by this command, not the caller. Required fields by type:
  register: worker, worktree (absolute), branch, base (full SHA), handle
  observe: worker, handle (string or null), processes (array of live handles)
  coordinator: handle (string or null), processes (array of live handles)
  assign: task (unique id), worker, goal, span, seed (string or null), base,
          reservations, allowedPaths
  scope: task, reservations, allowedPaths (expand working scope; include old entries)
  ready: task, delivery (full SHA), base, commits (ordered full SHAs), paths,
         evidence (absolute delivery-specific file), dependencies (delivery SHAs)
  integrating: task, integration (exact combined SHA)
  validated: task, passed (boolean), checkpoint (absolute summary file)
  accepted: task
  published: task, commit (published SHA, possibly a bookkeeping descendant)
  park: task, reason
  resume: task

Reservations use exact keys: source:<file.c>:<function>, source:<file.lua>,
or contract:<shared-state-name>. Use the same key for the same source/contract.
assign and resume reject another worker's reservations. ready frees the worker
to start another task but keeps that delivery's reservations through acceptance.
Parking releases only that task's reservations. Resuming rechecks ownership;
a parked ready delivery returns to ready, and failed validation requires rework
and a new delivery SHA. Only one task can be integrating/validated at a time.
Validation/publication events record the orchestrator's observed results; they
do not run checks, merge Git commits, publish, or prove that a claim is true.

Example scope announcement (after register):
  {"id":"assign-A-1","type":"assign","worker":"A","task":"A-1",
   "goal":"sounds-port","span":"noise","seed":null,"base":"<full SHA>",
   "reservations":["source:sounds.c:domonnoise"],"allowedPaths":["js/sounds.js"]}

Writes are atomic and guarded by <ledger>.lock. A crash leaves the lock and its
PID for inspection. Never remove a lock until its writer is confirmed stopped.
No command discards a legacy ledger, parked task, or unfinished work.`;

const FIELDS = {
    register: ['worker', 'worktree', 'branch', 'base', 'handle'],
    observe: ['worker', 'handle', 'processes'],
    coordinator: ['handle', 'processes'],
    assign: ['task', 'worker', 'goal', 'span', 'seed', 'base', 'reservations', 'allowedPaths'],
    scope: ['task', 'reservations', 'allowedPaths'],
    ready: ['task', 'delivery', 'base', 'commits', 'paths', 'evidence', 'dependencies'],
    integrating: ['task', 'integration'],
    validated: ['task', 'passed', 'checkpoint'],
    accepted: ['task'], published: ['task', 'commit'], park: ['task', 'reason'], resume: ['task'],
};

function check(condition, message) {
    if (!condition) throw new Error(message);
}
function string(value, name) {
    check(typeof value === 'string' && value.trim() === value && value.length > 0, `${name} must be a nonempty string`);
}
function identifier(value, name) {
    string(value, name);
    check(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value), `invalid ${name}`);
    check(!Object.hasOwn(Object.prototype, value), `reserved ${name}`);
}
function sha(value, name) {
    check(typeof value === 'string' && /^[0-9a-f]{40}$/u.test(value), `${name} must be a full SHA`);
}
function absolute(value, name) {
    string(value, name);
    check(isAbsolute(value) && resolve(value) === value, `${name} must be an absolute normalized path`);
}
function list(value, name, validate = string, empty = false) {
    check(Array.isArray(value) && (empty || value.length > 0), `${name} must be an array${empty ? '' : ' with at least one item'}`);
    for (const item of value) validate(item, name);
    check(new Set(value).size === value.length, `${name} contains duplicates`);
}
function sourceReservation(value) {
    check(typeof value === 'string' && /^(?:source:[A-Za-z0-9_-]+\.c:[A-Za-z_][A-Za-z0-9_]*|source:[A-Za-z0-9_-]+\.lua|contract:[A-Za-z0-9_.:-]+)$/u.test(value),
        'reservation must use source:<file.c>:<function>, source:<file.lua>, or contract:<name>');
    check(!value.includes('..') && !value.includes('//'), 'reservation must use a canonical source path');
}
function repoPath(value, name) {
    string(value, name);
    check(!isAbsolute(value) && !value.split('/').some(part => part === '..' || part === '.')
        && !value.includes('//') && !value.startsWith('.git'), `${name} must be a canonical repository-relative path`);
}

export function createLedger(runId, coordinatorRoot, at = new Date().toISOString()) {
    identifier(runId, 'runId'); absolute(coordinatorRoot, 'coordinatorRoot');
    return { version: 1, runId, coordinatorRoot, createdAt: at, events: [] };
}

function validateLedger(ledger) {
    check(ledger?.version === 1 && Array.isArray(ledger.events),
        'Unsupported worker ledger; preserve the existing record and reconcile ownership before initializing a new file');
    identifier(ledger.runId, 'runId'); absolute(ledger.coordinatorRoot, 'coordinatorRoot');
}

function holdsReservation(task) {
    return !['accepted', 'parked'].includes(task.status);
}

function checkOwnership(state, task) {
    for (const other of Object.values(state.tasks)) {
        if (other.id === task.id) continue;
        check(!(other.worker === task.worker && other.status === 'working' && task.status === 'working'),
            `worker ${task.worker} is already working on ${other.id}`);
        if (other.worker === task.worker || !holdsReservation(other)) continue;
        for (const key of task.reservations) check(!other.reservations.includes(key),
            `${key} is reserved by worker ${other.worker} task ${other.id}`);
    }
}

function applyEvent(state, event, at) {
    const { type } = event;
    check(Object.hasOwn(FIELDS, type), `unknown event type: ${type}`);
    const allowed = ['id', 'type', ...FIELDS[type]];
    for (const key of Object.keys(event)) check(allowed.includes(key), `unexpected event field: ${key}`);
    for (const key of allowed) check(Object.hasOwn(event, key), `missing event field: ${key}`);
    identifier(event.id, 'event id');
    if (type === 'register') {
        identifier(event.worker, 'worker'); absolute(event.worktree, 'worktree');
        string(event.branch, 'branch'); sha(event.base, 'base'); string(event.handle, 'handle');
        check(!state.workers[event.worker], `worker ${event.worker} already exists`);
        check(!Object.values(state.workers).some(w => w.worktree === event.worktree || w.branch === event.branch || w.handle === event.handle),
            'worker worktree, branch and handle must each have one owner');
        state.workers[event.worker] = { worker: event.worker, worktree: event.worktree,
            branch: event.branch, base: event.base, handle: event.handle, processes: [], registeredAt: at };
        return;
    }
    if (type === 'observe' || type === 'coordinator') {
        if (type === 'observe') check(Object.hasOwn(state.workers, event.worker), 'unknown worker');
        if (event.handle !== null) string(event.handle, 'handle');
        list(event.processes, 'processes', string, true);
        check(!Object.values(state.workers).some(w => w.worker !== event.worker && event.handle !== null && w.handle === event.handle), 'handle already belongs to another worker');
        Object.assign(type === 'coordinator' ? state.coordinator : state.workers[event.worker],
            { handle: event.handle, processes: [...event.processes], observedAt: at });
        return;
    }
    identifier(event.task, 'task');
    if (type === 'assign') {
        check(Object.hasOwn(state.workers, event.worker), 'unknown worker');
        check(!Object.hasOwn(state.tasks, event.task), 'task already exists');
        string(event.goal, 'goal'); string(event.span, 'span'); sha(event.base, 'base');
        if (event.seed !== null) string(event.seed, 'seed');
        list(event.reservations, 'reservations', sourceReservation);
        list(event.allowedPaths, 'allowedPaths', repoPath);
        const task = { ...event, id: event.task, status: 'working', assignedAt: at, deliveries: [] };
        delete task.type;
        checkOwnership(state, task);
        state.tasks[event.task] = task;
        return;
    }
    const task = state.tasks[event.task];
    check(task, `unknown task: ${event.task}`);
    const requireStatus = (...statuses) => check(statuses.includes(task.status),
        `${type} requires ${statuses.join(' or ')} task; ${task.id} is ${task.status}`);
    const delivery = state.deliveries[task.deliveries.at(-1)];
    if (type === 'scope') {
        requireStatus('working');
        list(event.reservations, 'reservations', sourceReservation);
        list(event.allowedPaths, 'allowedPaths', repoPath);
        check(task.reservations.every(key => event.reservations.includes(key))
            && task.allowedPaths.every(path => event.allowedPaths.includes(path)),
        'scope may expand; accept or park the task before releasing existing reservations');
        checkOwnership(state, { ...task, reservations: event.reservations });
        Object.assign(task, { reservations: [...event.reservations], allowedPaths: [...event.allowedPaths], scopeUpdatedAt: at });
    } else if (type === 'ready') {
        requireStatus('working');
        sha(event.delivery, 'delivery'); sha(event.base, 'base');
        check(!Object.hasOwn(state.deliveries, event.delivery), 'delivery SHA already exists; corrections need a new SHA');
        list(event.commits, 'commits', sha); list(event.paths, 'paths', repoPath);
        for (const path of event.paths) check(task.allowedPaths.some(allowed => path === allowed
            || (allowed.endsWith('/') && path.startsWith(allowed))), `delivery path is outside assigned scope: ${path}`);
        check(event.commits.at(-1) === event.delivery, 'commits must end at delivery SHA');
        absolute(event.evidence, 'evidence'); list(event.dependencies, 'dependencies', sha, true);
        for (const dependency of event.dependencies) check(state.deliveries[dependency], `unknown dependency: ${dependency}`);
        state.deliveries[event.delivery] = { ...event, readyAt: at };
        task.deliveries.push(event.delivery);
        task.status = 'ready';
    } else if (type === 'integrating') {
        requireStatus('ready'); sha(event.integration, 'integration');
        check(!Object.values(state.tasks).some(t => ['integrating', 'validated'].includes(t.status)), 'integration slot is occupied');
        for (const dependency of delivery.dependencies) check(state.deliveries[dependency].acceptedAt, `dependency is not accepted: ${dependency}`);
        Object.assign(delivery, { integratingAt: at, integration: event.integration });
        task.status = 'integrating';
    } else if (type === 'validated') {
        requireStatus('integrating');
        check(typeof event.passed === 'boolean', 'passed must be boolean');
        absolute(event.checkpoint, 'checkpoint');
        Object.assign(delivery, { validatedAt: at, passed: event.passed, checkpoint: event.checkpoint });
        task.status = event.passed ? 'validated' : 'changes-required';
    } else if (type === 'accepted') {
        requireStatus('validated');
        delivery.acceptedAt = at;
        task.status = 'accepted';
    } else if (type === 'published') {
        requireStatus('accepted'); sha(event.commit, 'commit');
        check(!delivery.publishedAt, 'delivery already published');
        Object.assign(delivery, { publishedAt: at, publishedCommit: event.commit });
    } else if (type === 'park') {
        requireStatus('working', 'ready', 'validated', 'changes-required');
        string(event.reason, 'reason');
        task.parkedFrom = task.status;
        Object.assign(task, { status: 'parked', parkedAt: at, reason: event.reason });
    } else if (type === 'resume') {
        requireStatus('parked', 'changes-required');
        // A parked passing candidate goes through combined validation again.
        const status = task.status === 'parked' && ['ready', 'validated'].includes(task.parkedFrom) ? 'ready' : 'working';
        checkOwnership(state, { ...task, status });
        Object.assign(task, { status, resumedAt: at });
        delete task.parkedFrom; delete task.reason;
    }
}

export function summarizeLedger(ledger) {
    validateLedger(ledger);
    const state = { runId: ledger.runId, coordinatorRoot: ledger.coordinatorRoot,
        coordinator: { handle: null, processes: [] }, workers: {}, tasks: {}, deliveries: {}, reservations: {} };
    const seen = new Set();
    for (const { at, ...event } of ledger.events) {
        check(!seen.has(event.id), 'duplicate event id in ledger'); seen.add(event.id);
        check(typeof at === 'string' && Number.isFinite(Date.parse(at)), 'invalid recorded timestamp');
        applyEvent(state, event, at);
    }
    for (const task of Object.values(state.tasks).filter(holdsReservation)) {
        for (const key of task.reservations) {
            state.reservations[key] ??= { worker: task.worker, tasks: [] };
            state.reservations[key].tasks.push(task.id);
        }
    }
    return state;
}

export function recordEvent(ledger, event, at = new Date().toISOString()) {
    check(event && typeof event === 'object' && !Array.isArray(event), 'event must be a JSON object');
    check(typeof at === 'string' && Number.isFinite(Date.parse(at)), 'invalid timestamp');
    const state = summarizeLedger(ledger);
    const previous = ledger.events.find(row => row.id === event.id);
    if (previous) {
        const { at: _at, ...payload } = previous;
        check(isDeepStrictEqual(payload, event), 'event id already has a different payload');
        return ledger;
    }
    applyEvent(state, event, at);
    return { ...ledger, events: [...ledger.events, { ...structuredClone(event), at }] };
}

export function updateLedger(file, coordinatorRoot, update) {
    mkdirSync(dirname(file), { recursive: true });
    const lock = `${file}.lock`;
    let fd;
    try { fd = openSync(lock, 'wx', 0o600); }
    catch (error) {
        if (error.code === 'EEXIST') throw new Error(`ledger is locked: ${lock}; inspect its writer before recovery`);
        throw error;
    }
    const temp = `${file}.${randomUUID()}.tmp`;
    try {
        writeFileSync(fd, JSON.stringify({ pid: process.pid, coordinatorRoot }));
        fsyncSync(fd);
        let ledger;
        if (existsSync(file)) {
            check(lstatSync(file).isFile(), 'ledger must be a regular file');
            ledger = JSON.parse(readFileSync(file, 'utf8'));
            validateLedger(ledger);
            check(ledger.coordinatorRoot === coordinatorRoot, `only coordinator ${ledger.coordinatorRoot} may update this ledger`);
        }
        const next = update(ledger);
        summarizeLedger(next);
        check(next.coordinatorRoot === coordinatorRoot, 'coordinator root cannot change');
        const out = openSync(temp, 'wx', 0o600);
        try { writeFileSync(out, JSON.stringify(next, null, 2) + '\n'); fsyncSync(out); }
        finally { closeSync(out); }
        renameSync(temp, file);
        const directory = openSync(dirname(file), 'r');
        try { fsyncSync(directory); }
        finally { closeSync(directory); }
        return next;
    } finally {
        closeSync(fd);
        if (existsSync(temp)) unlinkSync(temp);
        unlinkSync(lock);
    }
}

export function main(argv = process.argv.slice(2)) {
    if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return console.log(USAGE);
    const [command, ...args] = argv;
    check(['init', 'event', 'status'].includes(command), USAGE);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        check(['--run', '--json', '--file'].includes(key) && !Object.hasOwn(options, key) && args[i + 1] && !args[i + 1].startsWith('--'), USAGE);
        options[key] = args[i + 1];
    }
    check(!options['--run'] || command === 'init', USAGE);
    check(!options['--json'] || command === 'event', USAGE);
    const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    check(git.status === 0, git.error?.message || git.stderr || 'not in a Git checkout');
    const root = realpathSync(git.stdout.trim());
    const file = resolve(root, options['--file'] || '.cache/worker-state.json');
    const ledger = command === 'status' ? JSON.parse(readFileSync(file, 'utf8')) : updateLedger(file, root, (current) => {
        if (command === 'init') {
            check(!current, 'ledger already exists; use status to recover it');
            return createLedger(options['--run'], root);
        }
        check(current, 'initialize the ledger first');
        return recordEvent(current, JSON.parse(options['--json'] || 'null'));
    });
    // status may read an explicitly selected coordinator ledger from a worker.
    console.log(JSON.stringify({ file: relative(root, file), ...summarizeLedger(ledger) }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
