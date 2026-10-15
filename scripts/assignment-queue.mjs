// Unified execution assignments share the legacy ledger's atomic event log.
// Legacy state.tasks/deliveries are transport/acceptance records, not dispatch.
import assert from 'node:assert/strict';
import {isAbsolute} from 'node:path';

const ensure = (condition, message) => assert.ok(condition, message);
const text = value => typeof value === 'string' && value.trim().length > 0;
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/u.test(value);
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u.test(value)
    && !Object.hasOwn(Object.prototype, value);
const path = value => text(value) && !isAbsolute(value)
    && !value.replace(/\/$/u, '').split('/').some(part => !part || part === '.' || part === '..' || part === '.git');
const strings = value => Array.isArray(value) && value.every(text) && new Set(value).size === value.length;
const workerIds = new Set(['Worker-1', 'Worker-2', 'Worker-3']);
const sessionId = value => typeof value === 'string' && !value.includes('..')
    && /^(?:(?:holdout\/)?[A-Za-z0-9][A-Za-z0-9_.-]*|synthetic\/v[1-9]\d*\/[a-z0-9][a-z0-9-]*)$/u.test(value);
export const isQueueEvent = type => typeof type === 'string' && type.startsWith('queue-');

function dependenciesReady(state, task) {
    return task.dependencies.every(key => state.queue.tasks[key]?.status === 'completed'
        || Boolean(state.deliveries[key]?.acceptedAt));
}

function reserved(state, task) {
    const keys = new Set([...task.reservations, ...(task.sourceReservations ?? [])]);
    // Transport reservations survive execution completion until acceptance.
    const transport = Object.values(state.tasks).some(other => other.id !== task.transport
        && !['accepted', 'parked'].includes(other.status)
        && other.reservations.some(key => keys.has(key)));
    return transport || Object.values(state.queue.tasks).some(other => other.id !== task.id
        && other.status === 'claimed' && [...other.reservations, ...(other.sourceReservations ?? [])].some(key => keys.has(key)));
}

export function queueBase(state) {
    return [...(state.toolingPublications ?? []),
        ...Object.values(state.deliveries).filter(row => row.acceptedAt)
            .map(row => ({commit: row.publishedCommit ?? row.integration,
                acceptedAt: row.publishedAt ?? row.acceptedAt}))]
        .sort((a, b) => a.acceptedAt.localeCompare(b.acceptedAt)).at(-1)?.commit ?? state.queue?.initialBase;
}

export function queueWork(state) {
    if (!state.queue) return null;
    const tasks = Object.values(state.queue.tasks);
    const currentBase = queueBase(state);
    const ready = tasks.filter(task => task.status === 'ready' && dependenciesReady(state, task)
        && !reserved(state, task) && (task.type === 'rework' || task.base === currentBase));
    const fresh = state.queue.evidence?.base === currentBase;
    const sessions = new Set(ready.filter(task => task.output === 'implementation'
        && task.type !== 'rework').flatMap(task => task.sessions));
    const count = fresh ? sessions.size : null;
    const preferred = count === null ? null : count < 5 ? 'exploration' : 'implementation';
    const priority = task => task.urgent || task.type === 'rework' ? 0
        : task.output === preferred ? 1 : 2;
    const ordered = ready.filter(task => fresh || task.urgent || task.type === 'rework')
        .sort((a, b) => priority(a) - priority(b) || a.readyAt.localeCompare(b.readyAt)
            || a.id.localeCompare(b.id));
    const allocationReason = fresh ? `${count} ready implementation sessions; threshold 5; prefer ${preferred}`
        : 'Queue evidence is stale or missing; refresh before ordinary claims.';
    return {readySessions: count, threshold: 5, preferred,
        reason: ordered[0]?.urgent || ordered[0]?.type === 'rework'
            ? `Prioritize urgent rework or an unblocker. ${allocationReason}` : allocationReason,
        ready: ordered.map(task => task.id),
        blocked: tasks.filter(task => task.status === 'blocked'
            || (task.status === 'ready' && (!dependenciesReady(state, task) || reserved(state, task)
                || (task.type !== 'rework' && task.base !== currentBase))))
            .map(task => ({task: task.id, reason: task.reason ?? (task.base !== currentBase
                ? 'Reassess assignment at accepted Main base.' : 'Waiting for dependencies or reservations.')})),
        claimed: tasks.filter(task => task.status === 'claimed').map(task => ({task: task.id, worker: task.worker})),
        counts: Object.fromEntries(['ready', 'claimed', 'blocked', 'completed', 'superseded']
            .map(status => [status, tasks.filter(task => task.status === status).length])),
    };
}

function validateTask(state, event) {
    const task = event.assignment && structuredClone(event.assignment);
    ensure(task && id(task.id) && !state.queue.tasks[task.id], 'assignment needs a new immutable ID');
    ensure(!/^(?:session|rework|delivery):/u.test(task.id), 'assignment ID prefix is reserved for generated identities');
    ensure(task.transport === undefined, 'transport identities are derived by the queue, not assigned by producers');
    ensure(['exploration', 'implementation', 'rework'].includes(task.type), 'invalid assignment type');
    ensure(['exploration', 'implementation'].includes(task.output), 'assignment needs its output type');
    ensure(task.type === 'rework' || task.type === task.output, 'assignment type/output differ');
    ensure(['Main', 'Prep'].includes(task.producer) && ['Main', 'Prep'].includes(task.recipient), 'invalid producer/recipient');
    ensure(task.producer === 'Main' || task.output === 'exploration', 'Prep may enqueue exploration only');
    ensure(text(task.question) && text(task.stop), 'assignment needs a question and stopping condition');
    ensure(sha(task.base), 'assignment base must be a full SHA');
    for (const key of ['sessions', 'dependencies', 'reservations', 'allowedPaths', 'checks', 'artifacts'])
        ensure(strings(task[key]), `assignment ${key} must be a unique string array`);
    ensure(task.reservations.length > 0 && task.allowedPaths.length > 0
        && task.allowedPaths.every(path), 'assignment needs canonical write scope and reservations');
    ensure(task.sessions.every(sessionId),
        'sessions must use canonical corpus/batch IDs');
    ensure(task.dependencies.every(key => state.queue.tasks[key] || state.deliveries[key]), 'unknown assignment dependency');
    ensure(task.output !== 'implementation' || (task.sessions.length > 0 && task.recipient === 'Main'),
        'implementation needs session provenance and Main as recipient');
    if (task.output === 'exploration') {
        const support = task.purpose === 'support';
        ensure(support ? task.producer === 'Main' && task.recipient === 'Main' && task.batch === undefined
            : /^v[1-9]\d*$/u.test(task.batch) && task.recipient === 'Prep',
        'exploration needs a Prep batch or a Main-owned support assignment');
        ensure(task.allowedPaths.every(value => value === '.cache/'
            || (!support && value.startsWith(`challenges/cases/${task.batch}/`))),
        'exploration writes must stay in its batch or scratch');
    }
    if (task.type === 'rework') {
        ensure(sha(task.target) && text(task.findings), 'rework needs an exact revision and findings');
        ensure(state.deliveries[task.target] || Object.values(state.queue.tasks).some(item => item.result?.commit === task.target),
            'rework must name a known deliverable revision');
        if (!state.deliveries[task.target]) ensure(state.queue.tasks[task.targetTask]?.result?.commit === task.target,
            'exploration rework needs the exact targetTask as well as its commit');
        if (task.output === 'implementation') {
            const prior = state.tasks[state.deliveries[task.target]?.task];
            ensure(prior?.kind === 'implementation' && prior.status === 'changes-required',
                'implementation rework needs a rejected implementation deliverable');
            ensure(prior.deliveries.at(-1) === task.target, 'rework must target the latest rejected delivery');
            ensure(!Object.values(state.queue.tasks).some(other => other.output === 'implementation'
                && other.transport === prior.id && ['ready', 'blocked', 'claimed'].includes(other.status)),
            'implementation correction is already queued; use the existing rework assignment');
            ensure(prior.reservations.every(key => task.reservations.includes(key))
                && prior.allowedPaths.every(path => task.allowedPaths.includes(path)), 'rework must retain rejected delivery scope');
            task.goal ??= prior.goal;
        }
    }
    if (task.urgent !== undefined) ensure(typeof task.urgent === 'boolean', 'urgent must be boolean');
    if (task.sourceReservations !== undefined) ensure(strings(task.sourceReservations)
        && task.sourceReservations.every(key => key.startsWith('source:')), 'invalid source reservations');
    return task;
}

function activeTask(state, event) {
    const task = state.queue.tasks[event.task];
    ensure(task?.status === 'claimed' && task.worker === event.worker, 'worker does not own this claimed assignment');
    return task;
}

function importSession(state, session, base, at, {blocked = false, urgent = false, sourceReservations = []} = {}) {
    const existing = Object.values(state.queue.tasks).some(task => task.output === 'implementation'
        && task.sessions.includes(session) && task.status !== 'superseded'
        && (task.status !== 'completed' || !state.deliveries[task.result?.commit]?.acceptedAt));
    if (existing) return;
    const key = `session:${session.replaceAll('/', ':')}:${base.slice(0, 12)}`;
    const prior = state.queue.tasks[key];
    if (prior) {
        ensure(prior.fromEvidence && prior.originBase === base && prior.output === 'implementation'
            && prior.sessions.length === 1 && prior.sessions[0] === session,
        'generated session assignment ID collides with a different assignment');
        return;
    }
    ensure(!state.tasks[`delivery:${key}`], 'generated session transport collides with a legacy task');
    state.queue.tasks[key] = {id: key, type: 'implementation', output: 'implementation',
        producer: 'Main', recipient: 'Main', question: `Resolve the current mismatch in ${session}.`,
        stop: 'Submit a source-traced implementation and required runtime evidence, or a concrete blocker.',
        base, dependencies: [], sessions: [session], reservations: [`session:${session}`],
        allowedPaths: [`investigations/${session}.json`, '.cache/'], checks: ['focused', 'lint'],
        artifacts: [], fromEvidence: true, originBase: base, urgent, sourceReservations,
        status: blocked ? 'blocked' : 'ready', ...(blocked ? {reason: 'Awaiting current accepted-Main queue refresh.'} : {}),
        readyAt: at, attempts: [], transport: `delivery:${key}`};
}

export function applyQueueEvent(state, event, at, legacy) {
    ensure(id(event.id), 'invalid queue event ID');
    if (event.type === 'queue-enable') {
        ensure(!state.queue && sha(event.base) && isAbsolute(event.prepRoot), 'queue already enabled or invalid setup');
        ensure(!Object.values(state.tasks).some(task => task.status === 'working')
            && !Object.values(state.probes).some(probe => probe.state !== 'done'),
        'finish or preserve legacy execution claims before enabling the queue');
        ensure(Object.values(state.workers).every(worker => !worker.handle || worker.worker === 'Prep'
            || workerIds.has(worker.worker)), 'release legacy worker handles before enabling the queue');
        state.queue = {version: 1, initialBase: event.base, prepRoot: event.prepRoot,
            enabledAt: at, tasks: {}, evidence: null};
        return;
    }
    ensure(state.queue, 'enable the unified queue first');
    if (event.type === 'queue-prep-branch') {
        const worker = state.workers.Prep;
        ensure(worker?.worktree === state.queue.prepRoot && !worker.processes.length && sha(event.base)
            && text(event.branch), 'Prep branch change needs its private worktree and no live commands');
        ensure(!Object.values(state.tasks).some(task => task.worker === 'Prep' && task.status === 'working'),
            'finish the current batch before changing Prep branches');
        Object.assign(worker, {branch: event.branch, base: event.base});
        if (event.resume) {
            const task = state.tasks[event.resume];
            ensure(task?.worker === 'Prep' && task.status === 'changes-required'
                && task.deliveries.at(-1) === event.base, 'batch rework must start from the exact rejected revision');
            task.base = event.base;
            legacy(state, {id: `${event.id}:resume`, type: 'resume', task: task.id}, at);
        }
    } else if (event.type === 'queue-refresh') {
        ensure(sha(event.base) && digest(event.digest) && strings(event.sessions)
            && event.sessions.every(sessionId), 'invalid queue evidence');
        state.queue.evidence = {base: event.base, digest: event.digest, sessions: [...event.sessions], at};
        if (event.populate) {
            for (const task of Object.values(state.queue.tasks).filter(task => task.fromEvidence && task.type !== 'rework'
                && ['ready', 'blocked'].includes(task.status))) {
                if (!task.sessions.every(session => event.sessions.includes(session))) {
                    Object.assign(task, {status: 'superseded', supersededAt: at, reason: 'Current evidence no longer lists this mismatch.'});
                } else if ((task.status === 'ready' || task.reason === 'Awaiting current accepted-Main queue refresh.')
                    && (!task.resumeFrom || task.base === event.base)) {
                    Object.assign(task, {base: event.base, status: 'ready',
                        sourceReservations: [...new Set(task.sessions.flatMap(session => event.sources?.[session] ?? []))]});
                    delete task.reason;
                }
            }
            for (const session of event.sessions) importSession(state, session, event.base, at,
                {urgent: (event.regressions ?? []).includes(session), sourceReservations: event.sources?.[session] ?? []});
        }
    } else if (event.type === 'queue-admission') {
        ensure(sha(event.base) && strings(event.sessions) && event.sessions.every(sessionId)
            && text(event.receipt), 'invalid admission evidence');
        for (const session of event.sessions) importSession(state, session, event.base, at, {blocked: true});
    } else if (event.type === 'queue-enqueue') {
        const task = validateTask(state, event);
        if (task.type !== 'rework') ensure(!state.tasks[`delivery:${task.id}`],
            'derived delivery transport already belongs to a legacy task; choose a new assignment ID');
        if (task.output === 'implementation' && task.type !== 'rework')
            ensure(task.sessions.every(session => state.queue.evidence?.sessions.includes(session)),
                'implementation sessions require imported current mismatch evidence');
        state.queue.tasks[task.id] = {...task, status: 'ready', readyAt: at, attempts: [],
            transport: task.type === 'rework' && task.output === 'implementation'
                ? state.deliveries[task.target].task : `delivery:${task.id}`};
    } else if (event.type === 'queue-claim') {
        ensure(workerIds.has(event.worker), 'only Worker-1..Worker-3 claim execution tasks');
        const worker = state.workers[event.worker];
        ensure(worker?.handle && !worker.assignment && !worker.processes.length, 'worker unavailable or has live commands');
        const view = queueWork(state);
        ensure(view.ready[0] === event.task, 'claim must select the next prioritized eligible assignment');
        ensure(event.selectionReason === undefined || event.selectionReason === view.reason, 'claim reason differs from queue priority');
        ensure(text(event.branch) && !event.branch.startsWith('-'), 'claim needs an assignment branch');
        const task = state.queue.tasks[event.task];
        Object.assign(task, {status: 'claimed', worker: event.worker, branch: event.branch,
            worktree: worker.worktree, claimedAt: at, selectionReason: view.reason, processes: []});
        task.attempts.push({worker: event.worker, branch: event.branch, base: task.resumeFrom ?? task.base, at});
        Object.assign(worker, {assignment: task.id, branch: event.branch, base: task.base,
            turn: 'active', turnAt: at});
        if (task.output === 'implementation') {
            const previous = state.tasks[task.transport];
            if (previous) {
                ensure(task.type === 'rework' ? previous.deliveries.at(-1) === task.target
                    && state.deliveries[task.target]?.task === previous.id : previous.execution === task.id,
                'existing transport does not belong to this execution or its exact rework target');
                ensure(['changes-required', 'parked'].includes(previous.status), 'transport is not awaiting rework');
                previous.worker = task.worker;
                previous.base = task.base;
                legacy(state, {id: `${event.id}:resume`, type: 'resume', task: previous.id}, at);
            } else {
                ensure(task.type !== 'rework', 'rework transport is missing');
                legacy(state, {id: `${event.id}:assign`, type: 'assign', task: task.transport,
                    worker: task.worker, kind: task.goal ? 'implementation' : 'investigation',
                    ...(task.goal ? {goal: task.goal} : {}), seed: task.sessions[0], base: task.base,
                    reservations: task.reservations, allowedPaths: task.allowedPaths}, at);
                state.tasks[task.transport].execution = task.id;
            }
        }
    } else if (event.type === 'queue-processes') {
        const task = activeTask(state, event);
        ensure(strings(event.processes), 'process handles must be unique strings');
        task.processes = [...event.processes];
        state.workers[event.worker].processes = [...event.processes];
    } else if (event.type === 'queue-result') {
        const task = activeTask(state, event);
        ensure(task.output === 'exploration', 'implementation completes through verified delivery submission');
        ensure(!task.processes.length && !state.workers[event.worker].processes.length
            && sha(event.commit) && digest(event.digest) && isAbsolute(event.packet),
            'finish processes and preserve a hashed immutable result packet');
        ensure(['failure', 'match', 'duplicate', 'miss', 'deferred'].includes(event.outcome), 'invalid exploration outcome');
        task.result = {commit: event.commit, digest: event.digest, packet: event.packet, outcome: event.outcome};
        finish(state, task, at);
    } else if (event.type === 'queue-block') {
        const task = activeTask(state, event);
        ensure(!task.processes.length && !state.workers[event.worker].processes.length
            && text(event.reason) && sha(event.base) && isAbsolute(event.packet),
            'blocking requires no live commands and a saved recovery packet/commit');
        if (state.tasks[task.transport]?.status === 'working')
            legacy(state, {id: `${event.id}:park`, type: 'park', task: task.transport, reason: event.reason}, at);
        Object.assign(task, {status: 'blocked', reason: event.reason, resumeFrom: event.base, recovery: event.packet});
        delete state.workers[event.worker].assignment;
        state.workers[event.worker].turn = 'idle';
    } else if (event.type === 'queue-unblock') {
        const task = state.queue.tasks[event.task];
        ensure(task?.status === 'blocked' && text(event.reason), 'unblock requires a blocked task and new evidence');
        task.status = 'ready';
        delete task.reason;
    } else if (event.type === 'queue-reassess') {
        const task = state.queue.tasks[event.task];
        ensure(task && ['ready', 'blocked'].includes(task.status) && text(event.reason)
            && task.type !== 'rework' && event.base === state.queue.evidence?.base,
            'reassessment needs a ready/blocked ordinary task and current evidence');
        if (task.output === 'implementation') ensure(task.sessions.every(session => state.queue.evidence.sessions.includes(session)),
            'reassessment cannot revive resolved sessions');
        Object.assign(task, {base: event.base, status: 'ready', reassessedAt: at});
        delete task.reason;
    } else if (event.type === 'queue-supersede') {
        const task = state.queue.tasks[event.task];
        ensure(task && ['ready', 'blocked'].includes(task.status) && text(event.reason),
            'only unclaimed assignments can be superseded');
        if (state.tasks[task.transport]?.status === 'changes-required')
            legacy(state, {id: `${event.id}:park`, type: 'park', task: task.transport, reason: event.reason}, at);
        Object.assign(task, {status: 'superseded', reason: event.reason, supersededAt: at});
    } else throw new Error(`unknown queue event: ${event.type}`);
}

function finish(state, task, at) {
    Object.assign(task, {status: 'completed', completedAt: at});
    const worker = state.workers[task.worker];
    delete worker.assignment;
    Object.assign(worker, {turn: 'idle', turnAt: at, processes: []});
}

// Acceptance helpers keep their proven transport identities. Execution has its
// own immutable assignment ID, so feedback never reopens a completed assignment.
export function queueDeliveryEvent(state, event, at) {
    if (!state.queue) return;
    const task = Object.values(state.queue.tasks).find(item => item.transport === event.task
        && item.status === 'claimed');
    if (task && ['scope', 'implement'].includes(event.type)) {
        const transport = state.tasks[task.transport];
        Object.assign(task, {reservations: [...transport.reservations], allowedPaths: [...transport.allowedPaths],
            sourceReservations: transport.reservations.filter(key => key.startsWith('source:')),
            ...(transport.goal ? {goal: transport.goal} : {})});
    }
    if (event.type === 'ready' && task) {
        ensure(!task.processes.length && !state.workers[task.worker].processes.length, 'finish commands before delivery submission');
        task.result = {commit: event.delivery, packet: event.evidence};
        finish(state, task, at);
    }
    if (event.type === 'feedback') {
        const original = Object.values(state.queue.tasks).find(item => item.result?.commit === event.delivery);
        if (!original) return; // Historical batch corrections can be enqueued explicitly by Main.
        const key = `rework:${original.transport}:${event.delivery}`;
        if (state.queue.tasks[key]) {
            ensure(state.queue.tasks[key].type === 'rework' && state.queue.tasks[key].target === event.delivery
                && state.queue.tasks[key].targetTask === original.id && state.queue.tasks[key].transport === original.transport,
            'generated rework assignment ID collides with a different assignment');
            return;
        }
        state.queue.tasks[key] = {...structuredClone(original), id: key, type: 'rework',
            producer: 'Main', target: event.delivery, targetTask: original.id, findings: event.reason, urgent: true,
            fromEvidence: false,
            base: event.delivery, status: 'ready', readyAt: at, attempts: [], result: undefined,
            worker: undefined, branch: undefined, claimedAt: undefined, completedAt: undefined,
            resumeFrom: undefined, recovery: undefined, processes: [], dependencies: []};
    }
}

export function authorizeQueueEvent(state, root, event) {
    ensure(state.queue, 'only Main can enable the queue');
    if (root === state.coordinatorRoot) return;
    if (root === state.queue.prepRoot) {
        if (event.type === 'queue-prep-branch') return;
        ensure(event.type === 'queue-enqueue' && event.assignment?.producer === 'Prep'
            && event.assignment.output === 'exploration', 'Prep may only enqueue exploration and its rework');
        return;
    }
    const worker = state.workers[event.worker];
    ensure(workerIds.has(event.worker) && worker?.worktree === root && worker.handle,
        'queue event must come from the registered worker worktree');
    ensure(['queue-claim', 'queue-processes', 'queue-result', 'queue-block'].includes(event.type),
        'workers may only claim and report their own execution');
}

export function publicQueue(state) {
    const view = queueWork(state);
    if (!view) return null;
    return {...view, blocked: view.blocked.map(row => ({task: row.task, reason: 'Waiting for producer or dependencies.'})),
        workers: Object.values(state.workers).filter(worker => workerIds.has(worker.worker))
            .map(worker => ({worker: worker.worker, assignment: worker.assignment ?? null,
                state: worker.assignment ? 'active' : worker.handle ? 'idle' : 'offline'})),
        tasks: Object.values(state.queue.tasks).map(task => ({id: task.id, type: task.type, output: task.output,
            status: view.blocked.some(row => row.task === task.id) ? 'blocked' : task.status,
            producer: task.producer, recipient: task.recipient,
            sessions: task.sessions, batch: task.batch ?? null, worker: task.worker ?? null,
            target: task.target ?? null, readyAt: task.readyAt, claimedAt: task.claimedAt ?? null,
            completedAt: task.completedAt ?? null}))};
}
