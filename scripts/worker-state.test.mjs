import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createLedger, nextActions, recordEvent, summarizeLedger, updateLedger } from './worker-state.mjs';

// Distinct synthetic commits identify a base, two deliveries, and integration.
const BASE = 'a'.repeat(40);
const FIRST = 'b'.repeat(40);
const SECOND = 'c'.repeat(40);
const INTEGRATION = 'd'.repeat(40);
const ROOT = '/tmp/worker-state-fixture';
const RESERVATION = 'source:sounds.c:domonnoise';

function fixture() {
    let ledger = createLedger('test-run', ROOT);
    let sequence = 0;
    const send = (event) => {
        ledger = recordEvent(ledger, { id: `event-${++sequence}`, ...event });
        return summarizeLedger(ledger);
    };
    for (const worker of ['A', 'B']) send({ type: 'register', worker,
        worktree: `${ROOT}/${worker}`, branch: `worker/${worker}`, base: BASE,
        handle: `handle-${worker}` });
    const assign = (task = 'one', worker = 'A', reservations = [RESERVATION]) => send({
        type: 'assign', task, worker, goal: 'sounds-port', span: 'noise',
        seed: 'independent-case', base: BASE, reservations, allowedPaths: ['js/sounds.js'],
    });
    const ready = (task = 'one', delivery = FIRST) => send({ type: 'ready', task,
        delivery, base: BASE, commits: [delivery], paths: ['js/sounds.js'],
        evidence: `${ROOT}/evidence-${delivery}.json`, dependencies: [],
    });
    const accept = (task = 'one') => {
        send({ type: 'integrating', task, integration: INTEGRATION });
        send({ type: 'validated', task, passed: true, checkpoint: `${ROOT}/summary.json` });
        return send({ type: 'accepted', task });
    };
    return { send, assign, ready, accept, ledger: () => ledger };
}

test('events supply timestamps and exact duplicate notifications preserve them', () => {
    const f = fixture();
    const event = { id: 'scope-one', type: 'assign', task: 'one', worker: 'A',
        goal: 'sounds', span: 'noise', seed: null, base: BASE,
        reservations: [RESERVATION], allowedPaths: ['js/sounds.js'] };
    const once = recordEvent(f.ledger(), event);
    assert.deepEqual(recordEvent(once, event), once); // A retry cannot extend work time.
    assert.ok(Number.isFinite(Date.parse(once.events.at(-1).at)));
    assert.throws(() => recordEvent(once, { ...event, worker: 'B' }), /event id/);
    assert.throws(() => recordEvent(once, { ...event, id: 'backdate', at: 'yesterday' }), /unexpected/);
});

test('accepting an older delivery preserves the same worker’s next reservation', () => {
    const f = fixture();
    f.assign();
    f.ready();
    f.assign('two'); // Continuation may use the same function on the same worker.
    const state = f.accept();
    assert.deepEqual(state.reservations[RESERVATION], { worker: 'A', tasks: ['two'] });
    assert.equal(state.tasks.two.status, 'working');
    assert.throws(() => f.assign('three', 'B'), /reserved/);
    assert.equal(f.send({ type: 'park', task: 'two', reason: 'bounded stop' })
        .reservations[RESERVATION], undefined);
    f.assign('three', 'B'); // Parking explicitly releases only the parked task.
});

test('pending deliveries reserve functions without blocking independent workers', () => {
    const f = fixture();
    f.assign();
    f.ready();
    assert.throws(() => f.assign('overlap', 'B'), /reserved/);
    f.assign('independent', 'B', ['source:dig.c:zap_dig']);
    f.ready('independent', SECOND);
    f.send({ type: 'integrating', task: 'one', integration: INTEGRATION });
    assert.throws(() => f.send({ type: 'integrating', task: 'independent', integration: INTEGRATION }), /integration slot/);
    const state = f.send({ type: 'assign', task: 'next-b', worker: 'B',
        goal: 'movement', span: 'move', seed: null, base: BASE,
        reservations: ['source:hack.c:test_move'], allowedPaths: ['js/hack.js'] });
    assert.equal(state.tasks['next-b'].status, 'working');
    assert.equal(state.tasks.one.status, 'integrating');
});

test('the coordinator can update an unvalidated integration without replacing its delivery', () => {
    const f = fixture();
    f.assign(); f.ready();
    f.send({ type: 'integrating', task: 'one', integration: INTEGRATION });
    const state = f.send({ type: 'integrating', task: 'one', integration: SECOND });
    assert.equal(state.tasks.one.status, 'integrating');
    assert.deepEqual(state.tasks.one.deliveries, [FIRST]);
    assert.equal(state.deliveries[FIRST].integration, SECOND);
    assert.equal(state.deliveries[FIRST].checkpoint, undefined);
    f.send({ type: 'validated', task: 'one', passed: true, checkpoint: `${ROOT}/passed.json` });
    assert.throws(() => f.send({ type: 'integrating', task: 'one', integration: INTEGRATION }), /requires/);
});

test('failed validation retains ownership and a correction has its own immutable delivery', () => {
    const f = fixture();
    f.assign(); f.ready();
    f.send({ type: 'integrating', task: 'one', integration: INTEGRATION });
    f.send({ type: 'validated', task: 'one', passed: false, checkpoint: `${ROOT}/failure.json` });
    assert.throws(() => f.send({ type: 'accepted', task: 'one' }), /validated/);
    assert.throws(() => f.assign('overlap', 'B'), /reserved/);
    f.send({ type: 'resume', task: 'one' });
    assert.throws(() => f.ready(), /delivery.*exists/);
    f.ready('one', SECOND);
    const state = f.accept();
    assert.equal(state.deliveries[FIRST].passed, false);
    assert.equal(state.deliveries[SECOND].passed, true);
    assert.equal(state.reservations[RESERVATION], undefined);
    assert.ok(f.send({ type: 'published', task: 'one', commit: INTEGRATION })
        .deliveries[SECOND].publishedAt);
});

test('focused integration feedback releases the slot and preserves delivery ownership', () => {
    const f = fixture();
    f.assign(); f.ready();
    f.assign('next-a', 'A', ['source:monmove.c:postmov']);
    f.send({ type: 'integrating', task: 'one', integration: INTEGRATION });
    const state = f.send({ type: 'feedback', task: 'one', delivery: FIRST,
        reason: 'An affected focused test still expects the removed callback.' });
    assert.equal(state.tasks.one.status, 'changes-required');
    assert.equal(nextActions(state).integration, null);
    assert.equal(nextActions(state).corrections[0].afterTask, 'next-a');
    assert.deepEqual(state.reservations[RESERVATION], { worker: 'A', tasks: ['one'] });
    assert.equal(state.deliveries[FIRST].checkpoint, undefined);
    assert.throws(() => f.send({ type: 'accepted', task: 'one' }), /validated/);
    assert.throws(() => f.assign('overlap', 'B'), /reserved/);
    f.send({ type: 'park', task: 'next-a', reason: 'clean task boundary' });
    f.send({ type: 'resume', task: 'one' });
    assert.throws(() => f.ready(), /delivery.*exists/);
    f.ready('one', SECOND);
    assert.equal(f.accept().tasks.one.status, 'accepted');
});

test('out-of-order events and silent replacement of a current assignment fail', () => {
    const f = fixture();
    f.assign();
    assert.throws(() => f.assign('two'), /already working/);
    assert.throws(() => f.send({ type: 'accepted', task: 'one' }), /validated/);
    assert.throws(() => f.send({ type: 'published', task: 'one', commit: INTEGRATION }), /accepted/);
    assert.throws(() => f.send({ type: 'park', task: 'one', reason: '' }), /reason/);
});

test('scope expansions check conflicts and cannot silently release existing work', () => {
    const f = fixture();
    f.assign();
    f.assign('other', 'B', ['source:dig.c:zap_dig']);
    const scope = { type: 'scope', task: 'one',
        reservations: [RESERVATION, 'contract:tty-window'], allowedPaths: ['js/sounds.js', 'js/tty_menu.js'] };
    f.send(scope);
    assert.throws(() => f.send({ ...scope, reservations: ['contract:tty-window'] }), /scope may expand/);
    assert.throws(() => f.send({ ...scope, reservations: [...scope.reservations, 'source:dig.c:zap_dig'] }), /reserved/);
    assert.throws(() => f.send({ type: 'ready', task: 'one', delivery: FIRST, base: BASE,
        commits: [FIRST], paths: ['js/unreserved.js'], evidence: `${ROOT}/evidence.json`, dependencies: [] }), /outside assigned scope/);
    assert.equal(summarizeLedger(f.ledger()).reservations['contract:tty-window'].worker, 'A');
});

test('restart reconstructs reservations and reopening parked work checks ownership', () => {
    const f = fixture();
    f.assign(); f.ready();
    f.send({ type: 'park', task: 'one', reason: 'pause pending delivery' });
    f.assign('two', 'B');
    const recovered = JSON.parse(JSON.stringify(f.ledger()));
    assert.deepEqual(summarizeLedger(recovered), summarizeLedger(f.ledger()));
    assert.throws(() => recordEvent(recovered, { id: 'resume-one', type: 'resume', task: 'one' }), /reserved/);
});

test('restart retains coordinator and worker process handles until explicitly reaped', () => {
    const f = fixture();
    f.send({ type: 'coordinator', handle: 'coordinator-session', processes: ['checkpoint-session'] });
    f.send({ type: 'observe', worker: 'A', handle: 'handle-A', processes: ['focused-test-session'] });
    const recovered = summarizeLedger(JSON.parse(JSON.stringify(f.ledger())));
    assert.deepEqual(recovered.coordinator.processes, ['checkpoint-session']);
    assert.deepEqual(recovered.workers.A.processes, ['focused-test-session']);
    const stopped = f.send({ type: 'coordinator', handle: 'coordinator-session', processes: [] });
    assert.deepEqual(stopped.coordinator.processes, []); // An explicit observation releases the handle.
    assert.deepEqual(stopped.workers.A.processes, ['focused-test-session']);
});

test('atomic updates preserve old data on failure, refuse concurrent writers and foreign owners', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'worker-state-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = join(root, 'state.json');
    updateLedger(file, root, () => createLedger('test-run', root));
    const original = readFileSync(file, 'utf8');
    assert.throws(() => updateLedger(file, root, () => { throw new Error('invalid event'); }), /invalid event/);
    assert.equal(readFileSync(file, 'utf8'), original);
    assert.throws(() => updateLedger(file, `${root}/worker`, (value) => value), /coordinator/);
    writeFileSync(`${file}.lock`, 'a retained writer handle');
    assert.throws(() => updateLedger(file, root, (value) => value), /locked/);
    assert.equal(readFileSync(file, 'utf8'), original);
});

test('legacy pilot records are rejected without being overwritten', (t) => {
    const root = mkdtempSync(join(tmpdir(), 'worker-state-legacy-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const file = join(root, 'state.json');
    const legacy = '{"phase":"finished","preservedWip":["js/hack.js"]}\n';
    writeFileSync(file, legacy);
    assert.throws(() => updateLedger(file, root, () => createLedger('new-run', root)), /unsupported.*preserve/i);
    assert.equal(readFileSync(file, 'utf8'), legacy);
});

test('unread deliveries and ended turns remain actionable while the other worker runs', () => {
    const f = fixture();
    f.assign(); f.ready();
    f.assign('next-a', 'A', ['source:hack.c:test_move']);
    f.assign('long-b', 'B', ['source:dig.c:zap_dig']);
    f.send({ type: 'turn', worker: 'A', state: 'idle', reason: null, processes: [] });
    f.send({ type: 'turn', worker: 'B', state: 'active', reason: null, processes: [] });
    const state = f.send({ type: 'received', task: 'one', delivery: FIRST });
    assert.ok(state.deliveries[FIRST].receivedAt);
    assert.equal(state.tasks['next-a'].status, 'working');
    const next = nextActions(state);
    assert.equal(next.workers.find(w => w.worker === 'A').action, 'resume');
    assert.equal(next.workers.find(w => w.worker === 'B').action, 'continue');
    assert.equal(next.integration.task, 'one'); // B's unfinished higher-priority work does not hold the slot.
    assert.deepEqual(next.unread, []);
    assert.throws(() => f.send({ type: 'received', task: 'one', delivery: SECOND }), /delivery/);
});

test('connection acknowledgement identifies the current worker handle', () => {
    const f = fixture();
    f.send({ type: 'connect', worker: 'A', handle: 'handle-A' });
    const state = f.send({ type: 'connected', worker: 'A', handle: 'handle-A' });
    assert.ok(state.workers.A.connectedAt);
    assert.throws(() => f.send({ type: 'connect', worker: 'A', handle: 'old-handle' }), /handle/);
    assert.throws(() => f.send({ type: 'connected', worker: 'B', handle: 'handle-B' }), /connection/);
});

test('receipts drain superseded deliveries without changing the accepted repair', () => {
    const f = fixture(); f.assign(); f.ready();
    f.send({ type: 'feedback', task: 'one', delivery: FIRST, reason: 'Correct the caller.' });
    f.send({ type: 'resume', task: 'one' }); f.ready('one', SECOND);
    f.send({ type: 'received', task: 'one', delivery: SECOND });
    const accepted = f.accept();
    f.assign('next', 'A'); // Receiving old work must not affect this reservation.
    const state = f.send({ type: 'received', task: 'one', delivery: FIRST });
    assert.deepEqual(nextActions(state).unread, []);
    assert.deepEqual(state.deliveries[SECOND], accepted.deliveries[SECOND]);
    assert.equal(state.tasks.one.status, 'accepted');
    assert.equal(state.tasks.next.status, 'working');
    assert.deepEqual(state.reservations[RESERVATION].tasks, ['next']);
    assert.throws(() => f.send({ type: 'received', task: 'next', delivery: FIRST }), /belong/);
    assert.throws(() => f.send({ type: 'received', task: 'one', delivery: FIRST }), /already received/);
});

test('a third implementation worker cannot register while two owners remain', () => {
    const f = fixture();
    assert.throws(() => f.send({ type: 'register', worker: 'C', worktree: `${ROOT}/C`,
        branch: 'worker/C', base: BASE, handle: 'handle-C' }), /two implementation workers/);
});

test('recovery cannot reactivate a third owner or inherit another handle’s connection', () => {
    const f = fixture();
    f.send({ type: 'connect', worker: 'A', handle: 'handle-A' });
    f.send({ type: 'connected', worker: 'A', handle: 'handle-A' });
    const released = f.send({ type: 'observe', worker: 'A', handle: null, processes: [] });
    assert.equal(released.workers.A.connectedAt, undefined);
    f.send({ type: 'register', worker: 'C', worktree: `${ROOT}/C`, branch: 'worker/C', base: BASE, handle: 'handle-C' });
    assert.throws(() => f.send({ type: 'observe', worker: 'A', handle: 'handle-A', processes: [] }), /two implementation workers/);
    assert.throws(() => f.send({ type: 'turn', worker: '__proto__', state: 'idle', reason: null, processes: [] }), /unknown worker/);
});
