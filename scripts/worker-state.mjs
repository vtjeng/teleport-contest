#!/usr/bin/env node
// Shared event log with worktree-scoped writes. Tasks and reservations are rebuilt
// from these events, so no second hand-maintained status table can drift.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
    readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { preflightDelivery, resolveEventCommits, submitDelivery, syncMain, verifyEvent } from './worker-delivery.mjs';

export const USAGE = `Usage (run from the coordinator or assigned worker checkout root):
  node scripts/worker-state.mjs init --run <run-id> [--file <ledger.json>]
  node scripts/worker-state.mjs event --json '<event>' [--file <ledger.json>]
  node scripts/worker-state.mjs status [--file <ledger.json>]
  node scripts/worker-state.mjs next [--file <ledger.json>]
  node scripts/worker-state.mjs submit --task <id> --context <task-context.json> \\
    --evidence <task-evidence.json> --checks <checks.json> [--base <revision>] \\
    [--head <revision>] [--dependencies <SHA,...|none>] --file <absolute-shared-ledger.json>
  node scripts/worker-state.mjs preflight --task <id> [--commit <revision>] \\
    [--previous-checkpoint <summary.json>] [--file <ledger.json>]
  node scripts/worker-state.mjs sync-main --commit <revision> [--file <ledger.json>]

The default file is .cache/worker-state.json. init never overwrites a ledger.
status is read-only and rebuilds current ownership after a restart. The old
pilot's manual JSON is not migrated: preserve it and reconcile its workers/WIP
before initializing a new ledger at a different --file path.

Every event needs a stable id and type. Retrying the exact same id and payload
is a no-op; reusing an id with different data fails. Timestamps are supplied
by this command, not the caller. Required fields by type:
  register: worker, worktree (absolute), branch, base (full SHA), handle
  observe: worker, handle (string or null), processes (array of live handles)
  connect: worker, handle (worker tests its connection to the shared inbox)
  connected: worker, handle (coordinator acknowledges that connection)
  turn: worker, state (active, idle or blocked), reason (text or null), processes
  coordinator: handle (string or null), processes (array of live handles)
  assign: task (unique id), worker, seed (string or null), base,
          reservations, allowedPaths; optional kind (implementation or
          challenge-preparation), goal (required for implementation), and
          span (accepted for historical tasks)
  scope: task, reservations, allowedPaths (expand working scope; include old entries)
  received: task, delivery (exact SHA being acknowledged)
  feedback: task, delivery, reason (queued correction, not an interrupt)
  integrating: task, integration (exact combined SHA)
  validated: task, passed (boolean), checkpoint (absolute summary file)
  accepted: task
  published: task, commit (published SHA, possibly a bookkeeping descendant)
             optional supplementalCheckpoint (passing summary for a validated descendant)
  park: task, reason
  resume: task

Workers pass --file with the shared ledger path. They may connect, record their
own turn, claim/expand/resume their own tasks and submit. All other event types
are coordinator-only. Up to three persistent workers may hold live ownership.
Git resolves revisions and checks registration, assignment, candidate and
checkpoint identity. Publication is recorded only after local and remote main
match the accepted commit. sync-main performs a safe local fast-forward only;
it does not push. No command starts, interrupts or resumes an agent process.
Publication may include checked investigation JSON and newly added challenge
evaluations after the tested commit. Source commits must be in tested history;
evaluations must name that tested commit and match its challenge manifest.
Reports must be regular non-executable files. Other input changes need validation.
This publication allowance does not broaden checkpoint reuse or rewrite receipts.

submit derives the ready event, commit list, parents and changed paths from Git.
It copies task evidence, context and check output into a hash-verified
immutable file in <ledger>.deliveries. That file remains valid input to
goal-log record-evidence for implementation tasks. checks.json is an array of
objects with kind (focused, lint or fresh), command (argument array),
exitCode (0), and log (absolute path). Implementation tasks include focused
and lint results, plus fresh results when recordings are needed. Challenge
preparation tasks include one fresh C replay check with caseId per case.
Their task evidence contains missionPlan and the prepared manifest.
Logs are preserved, not rerun; the coordinator still verifies the claims.
Raw ready events are not accepted by the CLI. Retry submit with the same inputs
and --head SHA to preserve its first submission time even after advancing HEAD.
Dependencies default to unaccepted ancestor deliveries. For a correction made
after another task, set --base to the commit before the correction and declare
its actual dependencies explicitly. Do not include unrelated task commits.
The queue retains the task's earlier commits as required parts of its correction.

next is a read-only work list: connections, unread deliveries, worker turn
actions, pending corrections and the next dependency-ready integration. Feed
actual completion observations into turn events; saved state is not proof of
liveness. Feedback waits for a safe task boundary. resume refuses to mix two
working tasks on one worker. preflight reads committed files, reports omissions,
direct-importer/changed/source-pinned tests and every prior checkpoint failure.
Its success is not a test pass or a source review; run the listed tests and lint.

Reservations use exact keys: source:<file.c>:<function>, source:<file.lua>,
contract:<shared-state-name>, or challenge-batch:<vN>. Use the same key for the
same source, contract, or prepared batch.
assign and resume reject another worker's reservations. ready frees the worker
to start another task but keeps that delivery's reservations through acceptance.
Parking releases only that task's active reservations. A batch identity cannot
be assigned again; resume a parked preparation task before preparing the next
version. Only one unaccepted preparation task may exist at a time. Resuming rechecks ownership;
a parked ready delivery returns to ready, and failed validation requires rework
and a new delivery SHA. Only one task can be integrating/validated at a time.
Validation events check the supplied summary; they do not run validation.

Example scope announcement (after register):
  {"id":"assign-A-1","type":"assign","worker":"A","task":"A-1",
   "kind":"implementation","goal":"sounds-port","seed":null,"base":"<full SHA>",
   "reservations":["source:sounds.c:domonnoise"],"allowedPaths":["js/sounds.js"]}

Writes are atomic and guarded by <ledger>.lock. A crash leaves the lock and its
PID for inspection. Never remove a lock until its writer is confirmed stopped.
No command discards a legacy ledger, parked task, or unfinished work.`;

const FIELDS = {
    register: ['worker', 'worktree', 'branch', 'base', 'handle'],
    observe: ['worker', 'handle', 'processes'],
    connect: ['worker', 'handle'], connected: ['worker', 'handle'],
    turn: ['worker', 'state', 'reason', 'processes'],
    coordinator: ['handle', 'processes'],
    assign: ['task', 'worker', 'seed', 'base', 'reservations', 'allowedPaths'],
    scope: ['task', 'reservations', 'allowedPaths'],
    ready: ['task', 'delivery', 'base', 'commits', 'paths', 'evidence', 'dependencies'],
    received: ['task', 'delivery'],
    feedback: ['task', 'delivery', 'reason'],
    integrating: ['task', 'integration'],
    validated: ['task', 'passed', 'checkpoint'],
    accepted: ['task'], published: ['task', 'commit'], park: ['task', 'reason'], resume: ['task'],
};
const OPTIONAL_FIELDS = { assign: ['kind', 'goal', 'span'], published: ['supplementalCheckpoint'] };

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
    check(typeof value === 'string' && /^(?:source:[A-Za-z0-9_-]+\.c:[A-Za-z_][A-Za-z0-9_]*|source:[A-Za-z0-9_-]+\.lua|contract:[A-Za-z0-9_.:-]+|challenge-batch:v(?:[2-9]|[1-9][0-9]+))$/u.test(value),
        'reservation must use source:<file.c>:<function>, source:<file.lua>, contract:<name>, or challenge-batch:<vN>');
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
        if (task.kind === 'challenge-preparation' && other.kind === 'challenge-preparation') {
            check(task.reservations[0] !== other.reservations[0],
                `batch identity already used by task ${other.id}`);
            check(other.status === 'accepted', `preparation task ${other.id} is still pending`);
        }
        if (other.worker === task.worker || !holdsReservation(other)) continue;
        for (const key of task.reservations) check(!other.reservations.includes(key),
            `${key} is reserved by worker ${other.worker} task ${other.id}`);
    }
}

export function acceptedDependency(state, sha) {
    const delivery = state.deliveries[sha];
    if (!delivery) return false;
    // A corrected task is accepted as a whole. Its failed original snapshot is
    // not relabelled as a pass; dependants validate against the accepted repair.
    const latest = state.tasks[delivery.task]?.deliveries.at(-1);
    return Boolean(delivery.acceptedAt || state.deliveries[latest]?.acceptedAt);
}

function dependsOnTask(state, deliverySha, taskId, seen = new Set()) {
    if (seen.has(deliverySha)) return false;
    seen.add(deliverySha);
    const delivery = state.deliveries[deliverySha];
    return delivery.task === taskId || delivery.dependencies.some(sha => dependsOnTask(state, sha, taskId, seen));
}

function applyEvent(state, event, at) {
    const { type } = event;
    check(Object.hasOwn(FIELDS, type), `unknown event type: ${type}`);
    const allowed = ['id', 'type', ...FIELDS[type], ...(OPTIONAL_FIELDS[type] ?? [])];
    for (const key of Object.keys(event)) check(allowed.includes(key), `unexpected event field: ${key}`);
    for (const key of ['id', 'type', ...FIELDS[type]]) check(Object.hasOwn(event, key), `missing event field: ${key}`);
    identifier(event.id, 'event id');
    if (type === 'register') {
        identifier(event.worker, 'worker'); absolute(event.worktree, 'worktree');
        string(event.branch, 'branch'); sha(event.base, 'base'); string(event.handle, 'handle');
        check(!state.workers[event.worker], `worker ${event.worker} already exists`);
        check(Object.values(state.workers).filter(w => w.handle !== null || w.processes.length).length < 3,
            'at most three workers may have live ownership');
        check(!Object.values(state.workers).some(w => w.worktree === event.worktree || w.branch === event.branch || w.handle === event.handle),
            'worker worktree, branch and handle must each have one owner');
        state.workers[event.worker] = { worker: event.worker, worktree: event.worktree,
            branch: event.branch, base: event.base, handle: event.handle, processes: [], registeredAt: at };
        return;
    }
    if (['connect', 'connected', 'turn'].includes(type)) {
        check(Object.hasOwn(state.workers, event.worker), 'unknown worker');
        const worker = state.workers[event.worker];
        if (type === 'turn') {
            check(['active', 'idle', 'blocked'].includes(event.state), 'turn state must be active, idle or blocked');
            list(event.processes, 'processes', string, true);
            if (event.reason !== null) string(event.reason, 'reason');
            check(event.state !== 'blocked' || event.reason !== null, 'blocked turn needs a reason');
            check(event.state === 'active' || event.processes.length === 0, 'reap or hand off processes before ending a turn');
            Object.assign(worker, { turn: event.state, reason: event.reason,
                processes: [...event.processes], turnAt: at });
        } else {
            check(worker.handle === event.handle, 'connection handle differs from registered handle');
            if (type === 'connect') {
                worker.connectionRequestedAt = at;
                delete worker.connectedAt;
            } else {
                check(worker.connectionRequestedAt, 'worker must request a connection first');
                worker.connectedAt = at;
            }
        }
        return;
    }
    if (type === 'observe' || type === 'coordinator') {
        if (type === 'observe') check(Object.hasOwn(state.workers, event.worker), 'unknown worker');
        if (event.handle !== null) string(event.handle, 'handle');
        list(event.processes, 'processes', string, true);
        if (type === 'observe' && (event.handle !== null || event.processes.length)) {
            check(Object.values(state.workers).filter(w => w.worker !== event.worker
                && (w.handle !== null || w.processes.length)).length < 3,
            'at most three workers may have live ownership');
        }
        check(!Object.values(state.workers).some(w => w.worker !== event.worker && event.handle !== null && w.handle === event.handle), 'handle already belongs to another worker');
        if (type === 'observe' && state.workers[event.worker].handle !== event.handle) {
            const worker = state.workers[event.worker];
            delete worker.connectionRequestedAt; delete worker.connectedAt;
            delete worker.turn; delete worker.reason; delete worker.turnAt;
        }
        Object.assign(type === 'coordinator' ? state.coordinator : state.workers[event.worker],
            { handle: event.handle, processes: [...event.processes], observedAt: at });
        return;
    }
    identifier(event.task, 'task');
    if (type === 'assign') {
        check(Object.hasOwn(state.workers, event.worker), 'unknown worker');
        check(!Object.hasOwn(state.tasks, event.task), 'task already exists');
        sha(event.base, 'base');
        check(event.kind === undefined || ['implementation', 'challenge-preparation'].includes(event.kind),
            'task kind must be implementation or challenge-preparation');
        if (event.span !== undefined) string(event.span, 'span');
        if (event.seed !== null) string(event.seed, 'seed');
        list(event.reservations, 'reservations', sourceReservation);
        list(event.allowedPaths, 'allowedPaths', repoPath);
        if (event.kind === 'challenge-preparation') {
            check(event.reservations.length === 1 && /^challenge-batch:v(?:[2-9]|[1-9][0-9]+)$/u.test(event.reservations[0]),
                'challenge preparation must reserve exactly one future batch');
            check(event.goal === undefined, 'challenge preparation does not open a GOALS.json goal');
            check(event.span === undefined, 'challenge preparation does not have a span');
            const batch = event.reservations[0].split(':')[1];
            check(isDeepStrictEqual(event.allowedPaths, [`challenges/cases/${batch}/`]),
                'challenge preparation may edit only its batch case directory');
        } else {
            string(event.goal, 'goal');
            check(event.reservations.every(key => !key.startsWith('challenge-batch:')),
                'implementation tasks cannot reserve a challenge batch');
        }
        const task = { ...event, kind: event.kind ?? 'implementation', id: event.task,
            status: 'working', assignedAt: at, deliveries: [] };
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
        if (task.kind === 'challenge-preparation') {
            check(isDeepStrictEqual(event.reservations, task.reservations)
                && isDeepStrictEqual(event.allowedPaths, task.allowedPaths),
            'challenge preparation scope is fixed to its batch');
        }
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
        for (const dependency of event.dependencies) check(!dependsOnTask(state, dependency, task.id),
            'dependency cycle: exclude pending dependant work from the correction and declare its actual dependencies');
        state.deliveries[event.delivery] = { ...event, readyAt: at };
        task.deliveries.push(event.delivery);
        task.status = 'ready';
    } else if (type === 'integrating') {
        requireStatus('ready', 'integrating'); sha(event.integration, 'integration');
        check(!Object.values(state.tasks).some(t => t.id !== task.id
            && ['integrating', 'validated'].includes(t.status)), 'integration slot is occupied');
        for (const dependency of delivery.dependencies) check(acceptedDependency(state, dependency), `dependency is not accepted: ${dependency}`);
        Object.assign(delivery, { integratingAt: at, integration: event.integration });
        task.status = 'integrating';
    } else if (type === 'received') {
        sha(event.delivery, 'delivery');
        const received = state.deliveries[event.delivery];
        check(received?.task === task.id, 'receipt delivery must belong to the named task');
        check(!received.receivedAt, 'delivery already received');
        received.receivedAt = at;
    } else if (type === 'feedback') {
        // Focused integration checks can require a correction before a full
        // checkpoint exists. Keep that failure as feedback, not a fabricated
        // checkpoint result, and release the integration slot for rework.
        requireStatus('ready', 'integrating', 'changes-required');
        check(delivery?.delivery === event.delivery, 'feedback must identify the current delivery SHA');
        string(event.reason, 'reason');
        Object.assign(delivery, { feedbackAt: at, feedback: event.reason });
        task.status = 'changes-required';
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
        if (event.supplementalCheckpoint !== undefined) absolute(event.supplementalCheckpoint, 'supplementalCheckpoint');
        check(!delivery.publishedAt, 'delivery already published');
        Object.assign(delivery, { publishedAt: at, publishedCommit: event.commit,
            ...(event.supplementalCheckpoint ? { supplementalCheckpoint: event.supplementalCheckpoint } : {}) });
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

// This is a work list, not a claim about live processes. The orchestrator feeds
// observed turn completions into the ledger and uses its own collaboration tools.
export function nextActions(state) {
    const tasks = Object.values(state.tasks);
    const deliveries = Object.values(state.deliveries);
    const slot = tasks.find(task => ['integrating', 'validated'].includes(task.status));
    const ready = tasks.filter(task => task.status === 'ready')
        .map(task => state.deliveries[task.deliveries.at(-1)])
        .filter(delivery => delivery.dependencies.every(sha => acceptedDependency(state, sha)))
        .sort((a, b) => a.readyAt.localeCompare(b.readyAt));
    return {
        connections: Object.values(state.workers).filter(w => w.connectionRequestedAt && !w.connectedAt)
            .map(w => ({ worker: w.worker, handle: w.handle })),
        unread: deliveries.filter(d => !d.receivedAt && !d.acceptedAt)
            .map(d => ({ task: d.task, delivery: d.delivery, readyAt: d.readyAt })),
        corrections: tasks.filter(task => task.status === 'changes-required').map(task => ({
            task: task.id, worker: task.worker, delivery: task.deliveries.at(-1),
            reason: state.deliveries[task.deliveries.at(-1)].feedback ?? 'combined validation failed',
            afterTask: tasks.find(other => other.worker === task.worker && other.status === 'working')?.id ?? null,
        })),
        workers: Object.values(state.workers).map(w => ({ worker: w.worker, handle: w.handle,
            action: w.handle === null ? 'recover-owner' : w.turn === 'idle' ? 'resume'
                : w.turn === 'blocked' ? 'resolve-blocker' : w.turn === 'active' ? 'continue' : 'inspect-turn',
            reason: w.reason ?? null, processes: w.processes,
            task: tasks.find(t => t.worker === w.worker && t.status === 'working')?.id ?? null })),
        integration: slot ? { task: slot.id, status: slot.status } : ready[0]
            ? { task: ready[0].task, delivery: ready[0].delivery, status: 'ready' } : null,
    };
}

function authorizeWorker(state, root, event) {
    check(event && ['assign', 'scope', 'ready', 'connect', 'turn', 'resume'].includes(event.type),
        'only coordinator may record this event');
    const workerId = event.worker ?? state.tasks[event.task]?.worker;
    const worker = state.workers[workerId];
    check(worker && worker.worktree === root, 'event does not belong to this registered worker worktree');
    const branch = spawnSync('git', ['-C', root, 'branch', '--show-current'], { encoding: 'utf8' });
    check(branch.status === 0 && branch.stdout.trim() === worker.branch, 'worker branch differs from registration');
    check(worker.handle !== null, 'worker has no live owner; coordinator must recover ownership');
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

export function updateLedger(file, coordinatorRoot, update, workerEvent = null) {
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
            if (ledger.coordinatorRoot !== coordinatorRoot)
                authorizeWorker(summarizeLedger(ledger), coordinatorRoot, workerEvent);
        }
        const next = update(ledger);
        summarizeLedger(next);
        check(next.coordinatorRoot === (ledger?.coordinatorRoot ?? coordinatorRoot), 'coordinator root cannot change');
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
    const allowed = {
        init: ['--run'], event: ['--json'], status: [], next: [],
        submit: ['--task', '--context', '--evidence', '--checks', '--base', '--head', '--dependencies'],
        preflight: ['--task', '--commit', '--previous-checkpoint'], 'sync-main': ['--commit'],
    };
    check(Object.hasOwn(allowed, command), USAGE);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
        const key = args[i];
        check(['--file', ...allowed[command]].includes(key) && !Object.hasOwn(options, key) && args[i + 1] && !args[i + 1].startsWith('--'), USAGE);
        options[key] = args[i + 1];
    }
    const git = spawnSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' });
    check(git.status === 0, git.error?.message || git.stderr || 'not in a Git checkout');
    const root = realpathSync(git.stdout.trim());
    check(realpathSync(process.cwd()) === root, 'run worker-state from the actual worktree root');
    const file = resolve(root, options['--file'] || '.cache/worker-state.json');
    if (['status', 'next', 'preflight', 'sync-main'].includes(command)) {
        const state = summarizeLedger(JSON.parse(readFileSync(file, 'utf8')));
        let result = { file, ...state };
        if (command !== 'status') check(root === state.coordinatorRoot, 'only coordinator may run this command');
        if (command === 'next') result = nextActions(state);
        if (command === 'preflight') {
            result = preflightDelivery({ root, state, taskId: options['--task'],
                commit: options['--commit'], previousCheckpoint: options['--previous-checkpoint'] });
            if (!result.passed) process.exitCode = 1;
        }
        if (command === 'sync-main') result = syncMain(root, options['--commit']);
        return console.log(JSON.stringify(result, null, 2));
    }
    const input = command === 'event' ? JSON.parse(options['--json'] || 'null')
        : command === 'submit' ? { type: 'ready', task: options['--task'] } : null;
    check(command !== 'event' || (input && input.type !== 'ready'), 'use submit instead of a raw ready event');
    const ledger = updateLedger(file, root, (current) => {
        if (command === 'init') {
            check(!current, 'ledger already exists; use status to recover it');
            return createLedger(options['--run'], root);
        }
        check(current, 'initialize the ledger first');
        const state = summarizeLedger(current);
        const event = command === 'submit' ? submitDelivery({ root, file, state,
            taskId: options['--task'], contextPath: options['--context'], evidencePath: options['--evidence'],
            checksPath: options['--checks'], base: options['--base'], head: options['--head'],
            dependencies: options['--dependencies'] === 'none' ? [] : options['--dependencies']?.split(',') })
            : current.events.some(event => event.id === input.id)
                ? resolveEventCommits(root, input) : verifyEvent(root, state, input);
        return recordEvent(current, event);
    }, input);
    // status may read an explicitly selected coordinator ledger from a worker.
    console.log(JSON.stringify({ file: relative(root, file), ...summarizeLedger(ledger) }, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try { main(); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
