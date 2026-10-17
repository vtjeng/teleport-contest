import assert from 'node:assert/strict';
import test from 'node:test';
import {createLedger, nextActions, recordEvent, summarizeLedger} from './worker-state.mjs';
import {authorizeQueueEvent, publicQueue, queueWork} from './assignment-queue.mjs';
import {activityFromLedger} from './dashboard-snapshot.mjs';
import {activityTimeline, activityUtilization} from './dashboard-activity.mjs';
import {SOURCE_TRIAL, SOURCE_TRIAL_PATHS, SOURCE_TRIAL_UNITS} from './port-evidence.mjs';

const BASE = 'a'.repeat(40), REV = 'b'.repeat(40), DIGEST = 'c'.repeat(64);
function fixture({legacyCollision = false} = {}) {
    let ledger = createLedger('loop-20261015', '/tmp/queue-main');
    let count = 0;
    const send = payload => {
        ledger = recordEvent(ledger, {id: `event-${++count}`, ...payload},
            new Date(Date.UTC(2026, 9, 15, 12, 0, count)).toISOString());
        return summarizeLedger(ledger);
    };
    for (const worker of ['Prep', 'Worker-1', 'Worker-2', 'Worker-3']) send({type: 'register', worker,
        worktree: `/tmp/queue-${worker}`, branch: `initial/${worker}`, base: BASE, handle: `private-${worker}`});
    if (legacyCollision) {
        send({type: 'assign', task: 'delivery:new-fix', worker: 'Worker-1', goal: 'old-goal',
            seed: 'old-case', base: BASE, reservations: ['source:fixture.c:old'], allowedPaths: ['js/old.js']});
        send({type: 'park', task: 'delivery:new-fix', reason: 'Preserve legacy work.'});
    }
    send({type: 'queue-enable', prepRoot: '/tmp/queue-Prep', base: BASE});
    const refresh = sessions => send({type: 'queue-refresh', base: BASE, digest: DIGEST, sessions});
    refresh([]);
    const assignment = (name, output = 'exploration', patch = {}) => ({id: name, type: output, output,
        producer: output === 'exploration' ? 'Prep' : 'Main', recipient: output === 'exploration' ? 'Prep' : 'Main',
        question: 'Trace the source behavior.', stop: 'Return evidence or a bounded blocker.', base: BASE,
        dependencies: [], sessions: output === 'exploration' ? [] : [name],
        reservations: [output === 'exploration' ? `source:fixture.c:${name}` : `session:${name}`],
        allowedPaths: output === 'exploration' ? ['challenges/cases/v2/'] : [`investigations/${name}.json`, '.cache/'],
        checks: [], artifacts: [], ...(output === 'exploration' ? {batch: 'v2'} : {}), ...patch});
    const enqueue = (name, output, patch) => send({type: 'queue-enqueue', assignment: assignment(name, output, patch)});
    const claim = (name, worker = 'Worker-1') => send({type: 'queue-claim', task: name, worker, branch: `queue/${name}`});
    const result = (name, worker = 'Worker-1') => send({type: 'queue-result', task: name, worker,
        commit: REV, packet: '/tmp/immutable-result.json', digest: DIGEST, outcome: 'failure'});
    return {send, refresh, enqueue, claim, result, state: () => summarizeLedger(ledger), ledger: () => ledger};
}

test('queue claims prefer exploration below five ready sessions and implementation at five', () => {
    for (const count of [0, 4, 5]) {
        const f = fixture(), names = Array.from({length: count}, (_, n) => `case${n}`);
        f.refresh(names);
        f.enqueue('explore');
        for (const name of names) f.enqueue(name, 'implementation');
        const view = queueWork(f.state());
        assert.equal(view.readySessions, count);
        assert.equal(view.preferred, count < 5 ? 'exploration' : 'implementation');
        assert.equal(view.ready[0], count < 5 ? 'explore' : 'case0');
        const other = count < 5 ? 'case0' : 'explore';
        if (count) assert.throws(() => f.claim(other), /prioritized/);
    }
});

test('completed exploration frees its persistent worker and retains immutable results and history', () => {
    const f = fixture();
    f.enqueue('first'); f.claim('first'); f.result('first');
    const first = structuredClone(f.state().queue.tasks.first);
    f.enqueue('second'); f.claim('second');
    assert.equal(f.state().workers['Worker-1'].assignment, 'second');
    assert.deepEqual(f.state().queue.tasks.first, first);
    assert.equal(f.state().workers['Worker-1'].worktree, '/tmp/queue-Worker-1');
    assert.equal(first.status, 'completed');
});

test('worker reasons retain their original task and time and never carry into another assignment', () => {
    for (const ending of ['result', 'block']) {
        const f = fixture();
        f.enqueue('first'); f.claim('first');
        f.send({type: 'turn', worker: 'Worker-1', state: 'active',
            reason: 'First capture collected.', processes: []});
        const worker = f.state().workers['Worker-1'];
        const row = nextActions(f.state()).workers.find(w => w.worker === 'Worker-1');
        assert.equal(row.reason, 'First capture collected.');
        assert.equal(row.reasonAt, worker.turnAt);
        assert.equal(row.reasonTask, 'first');
        if (ending === 'result') f.result('first');
        else f.send({type: 'queue-block', task: 'first', worker: 'Worker-1',
            reason: 'Receipt missing.', base: REV, packet: '/tmp/handoff.json'});
        let idle = nextActions(f.state()).workers.find(w => w.worker === 'Worker-1');
        assert.equal(idle.reason, null);
        assert.equal(idle.reasonAt, null);
        assert.equal(idle.reasonTask, null);
        f.send({type: 'turn', worker: 'Worker-1', state: 'idle',
            reason: 'Waiting for another task.', processes: []});
        f.enqueue('second'); f.claim('second');
        idle = nextActions(f.state()).workers.find(w => w.worker === 'Worker-1');
        assert.equal(idle.task, 'second');
        assert.equal(idle.reason, null);
        assert.equal(idle.reasonAt, null);
        assert.equal(idle.reasonTask, null);
    }
});

test('coordination uses execution assignments for exploration and invites idle workers to claim queued work', () => {
    const f = fixture();
    f.enqueue('first'); f.enqueue('second');
    assert.equal(nextActions(f.state()).workers.find(row => row.worker === 'Worker-1').action, 'claim-next');
    f.claim('first');
    const next = nextActions(f.state());
    assert.equal(next.workers.find(row => row.worker === 'Worker-1').task, 'first');
    assert.equal(next.workerWork.workersNeedingWork, 2);
    assert.equal(next.workerWork.allocation.readySessions, 0);
    assert.equal(next.workerWork.unstartedSessions, undefined, 'legacy count must not compete with unified priority');
});

test('Main can enqueue bounded read-only support without claiming a Prep batch or creating another agent', () => {
    const f = fixture();
    f.enqueue('survey', 'exploration', {producer: 'Main', recipient: 'Main', purpose: 'support',
        batch: undefined, allowedPaths: ['.cache/']});
    f.claim('survey');
    assert.equal(f.state().queue.tasks.survey.recipient, 'Main');
    assert.throws(() => f.enqueue('bad-support', 'exploration', {producer: 'Prep', recipient: 'Main',
        purpose: 'support', batch: undefined, allowedPaths: ['.cache/']}));
});

test('the one source trial retains frozen scope and allows only one correction', () => {
    const f = fixture();
    const trial = {goal: SOURCE_TRIAL.id, sessions: [], allowedPaths: [...SOURCE_TRIAL_PATHS],
        reservations: SOURCE_TRIAL_UNITS.map(unit => `source:${unit}`), checks: ['focused', 'lint'],
        sourceTrial: {...SOURCE_TRIAL, assignmentBase: BASE}};
    f.enqueue(SOURCE_TRIAL.id, 'implementation', trial);
    assert.throws(() => f.send({type: 'queue-reassess', task: SOURCE_TRIAL.id, base: BASE, reason: 'No base change anyway.'}), /frozen/);
    f.claim(SOURCE_TRIAL.id);
    const transport = f.state().queue.tasks[SOURCE_TRIAL.id].transport;
    const ready = (delivery, base) => f.send({type: 'ready', task: transport, delivery, base, commits: [delivery],
        paths: ['js/detect.js'], evidence: `/tmp/${delivery}.json`, dependencies: []});
    ready(REV, BASE);
    f.send({type: 'feedback', task: transport, delivery: REV, reason: 'One scoped correction.'});
    const correction = queueWork(f.state()).ready[0];
    assert.deepEqual(f.state().queue.tasks[correction].sourceTrial, trial.sourceTrial);
    f.claim(correction, 'Worker-2');
    const corrected = 'd'.repeat(40);
    ready(corrected, REV);
    f.send({type: 'feedback', task: transport, delivery: corrected, reason: 'Stop; correction did not suffice.'});
    assert.deepEqual(queueWork(f.state()).ready, []);
    assert.equal(f.state().tasks[transport].deliveries.length, 2);
    assert.throws(() => f.enqueue('second-correction', 'implementation', {...trial, type: 'rework',
        target: corrected, base: corrected, findings: 'No second correction allowed.'}), /at most one/);
});

test('reservations, dependencies, process ownership and stale evidence prevent invalid claims', () => {
    const f = fixture();
    f.enqueue('one');
    f.enqueue('overlap', 'exploration', {reservations: ['source:fixture.c:one']});
    f.enqueue('dependent', 'exploration', {dependencies: ['one']});
    f.claim('one');
    assert.deepEqual(queueWork(f.state()).ready, []);
    f.send({type: 'queue-processes', task: 'one', worker: 'Worker-1', processes: ['live-command']});
    assert.throws(() => f.result('one'), /finish processes/);
    assert.throws(() => f.send({type: 'observe', worker: 'Worker-1', handle: null, processes: []}), /finish or explicitly block/);
    f.send({type: 'queue-processes', task: 'one', worker: 'Worker-1', processes: []});
    f.result('one');
    assert.equal(queueWork(f.state()).ready.length, 2);
    f.send({type: 'queue-refresh', base: REV, digest: DIGEST, sessions: []});
    assert.equal(queueWork(f.state()).readySessions, null);
    assert.equal(queueWork(f.state()).ready.length, 0);
});

test('blocked recovery preserves commits, original age and the old branch without duplicate execution', () => {
    const f = fixture();
    f.enqueue('one'); const age = f.state().queue.tasks.one.readyAt;
    f.claim('one');
    f.send({type: 'queue-block', task: 'one', worker: 'Worker-1', reason: 'Dependency missing.',
        base: REV, packet: '/tmp/handoff.json'});
    assert.equal(f.state().queue.tasks.one.status, 'blocked');
    f.send({type: 'queue-unblock', task: 'one', reason: 'Dependency provided.'});
    f.claim('one', 'Worker-2');
    assert.equal(f.state().queue.tasks.one.base, BASE);
    assert.equal(f.state().queue.tasks.one.attempts.at(-1).base, REV);
    assert.equal(f.state().queue.tasks.one.readyAt, age);
    assert.deepEqual(f.state().queue.tasks.one.attempts.map(row => row.worker), ['Worker-1', 'Worker-2']);
});

test('producer permissions do not give Prep or workers a private dispatch channel', () => {
    const f = fixture();
    const state = f.state();
    assert.doesNotThrow(() => authorizeQueueEvent(state, '/tmp/queue-Prep', {type: 'queue-enqueue',
        assignment: {producer: 'Prep', output: 'exploration'}}));
    assert.throws(() => authorizeQueueEvent(state, '/tmp/queue-Prep', {type: 'queue-claim', worker: 'Worker-1'}));
    assert.throws(() => authorizeQueueEvent(state, '/tmp/queue-Worker-1', {type: 'queue-unblock', worker: 'Worker-1'}));
    assert.throws(() => f.send({type: 'queue-enqueue', assignment: {id: 'bad', producer: 'Prep', output: 'implementation'}}));
    assert.throws(() => f.send({type: 'assign', task: 'private-task', worker: 'Worker-1'}), /claim through/);
});

test('producer IDs cannot shadow generated session, rework or delivery identities', () => {
    const f = fixture();
    for (const id of ['session:case:aaaaaaaaaaaa', 'rework:delivery:case:revision', 'delivery:case'])
        assert.throws(() => f.enqueue(id), /reserved for generated/);
    f.send({type: 'queue-refresh', base: BASE, digest: DIGEST, sessions: ['case'], populate: true});
    assert.equal(queueWork(f.state()).readySessions, 1);
});

test('new execution cannot inherit an unrelated parked legacy transport goal or scope', () => {
    const f = fixture({legacyCollision: true});
    f.refresh(['case']);
    assert.throws(() => f.enqueue('new-fix', 'implementation', {sessions: ['case'], goal: 'new-goal',
        allowedPaths: ['js/new.js'], reservations: ['session:case', 'source:fixture.c:new']}),
    /already belongs to a legacy task/);
    assert.equal(f.state().tasks['delivery:new-fix'].goal, 'old-goal');
    assert.deepEqual(f.state().tasks['delivery:new-fix'].allowedPaths, ['js/old.js']);
    assert.equal(f.state().queue.tasks['new-fix'], undefined);
});

test('delivery feedback queues rework for another worker without reopening completed execution', () => {
    const f = fixture();
    f.refresh(['case']);
    f.enqueue('case', 'implementation', {goal: 'fixture-port', allowedPaths: ['js/fixture.js'],
        reservations: ['session:case', 'source:fixture.c:fix']});
    f.claim('case');
    f.send({type: 'ready', task: 'delivery:case', delivery: REV, base: BASE,
        commits: [REV], paths: ['js/fixture.js'], evidence: '/tmp/preserved-evidence.json', dependencies: []});
    assert.equal(f.state().queue.tasks.case.status, 'completed');
    f.send({type: 'feedback', task: 'delivery:case', delivery: REV, reason: 'Fix the demonstrated failure.'});
    const correction = queueWork(f.state()).ready[0];
    assert.match(queueWork(f.state()).reason, /urgent rework/);
    assert.equal(f.state().queue.tasks[correction].type, 'rework');
    const manual = target => f.enqueue('manual-rework', 'implementation', {type: 'rework', target,
        findings: 'Correct the rejected function.', sessions: ['case'], goal: 'fixture-port',
        allowedPaths: ['js/fixture.js'], reservations: ['session:case', 'source:fixture.c:fix']});
    assert.throws(() => manual(REV), /correction is already queued/);
    f.send({type: 'queue-refresh', base: BASE, digest: DIGEST, sessions: ['case'], populate: true});
    assert.equal(f.state().queue.tasks[correction].base, REV, 'queue refresh cannot discard rejected commits');
    assert.equal(f.state().queue.tasks.case.result.commit, REV);
    f.claim(correction, 'Worker-2');
    assert.equal(f.state().tasks['delivery:case'].worker, 'Worker-2');
    assert.equal(f.state().queue.tasks.case.worker, 'Worker-1');
    assert.equal(f.state().queue.tasks.case.status, 'completed');
    assert.equal(f.state().queue.tasks[correction].target, REV);
    const next = 'd'.repeat(40);
    f.send({type: 'ready', task: 'delivery:case', delivery: next, base: REV,
        commits: [next], paths: ['js/fixture.js'], evidence: '/tmp/second-packet.json', dependencies: []});
    f.send({type: 'feedback', task: 'delivery:case', delivery: next, reason: 'Fix the remaining branch.'});
    assert.throws(() => manual(REV), /latest rejected delivery/);
});

test('superseding unclaimed rework releases its transport reservations without rewriting the rejected delivery', () => {
    const f = fixture();
    f.refresh(['case']);
    f.enqueue('case', 'implementation', {goal: 'fixture-port', allowedPaths: ['js/fixture.js'],
        reservations: ['session:case', 'source:fixture.c:fix']});
    f.claim('case');
    f.send({type: 'ready', task: 'delivery:case', delivery: REV, base: BASE,
        commits: [REV], paths: ['js/fixture.js'], evidence: '/tmp/packet.json', dependencies: []});
    f.send({type: 'feedback', task: 'delivery:case', delivery: REV, reason: 'Fix the demonstrated failure.'});
    const correction = queueWork(f.state()).ready[0];
    f.enqueue('replacement', 'exploration', {reservations: ['source:fixture.c:fix']});
    assert.ok(!queueWork(f.state()).ready.includes('replacement'));
    f.send({type: 'queue-supersede', task: correction, reason: 'A different bounded task replaces this correction.'});
    assert.ok(queueWork(f.state()).ready.includes('replacement'));
    assert.equal(f.state().tasks['delivery:case'].status, 'parked');
    assert.equal(f.state().queue.tasks.case.result.commit, REV);
    assert.equal(f.state().deliveries[REV].acceptedAt, undefined);
});

test('admission creates blocked implementation work until a current accepted-base refresh', () => {
    const f = fixture();
    const session = 'synthetic/v2/new-case';
    f.send({type: 'queue-admission', base: BASE, receipt: '/tmp/verified-admission', sessions: [session]});
    assert.equal(Object.values(f.state().queue.tasks)[0].status, 'blocked');
    assert.equal(queueWork(f.state()).readySessions, 0);
    f.send({type: 'queue-refresh', base: BASE, digest: DIGEST, sessions: [session], populate: true});
    assert.equal(queueWork(f.state()).readySessions, 1);
    f.send({type: 'queue-refresh', base: BASE, digest: DIGEST, sessions: [session], populate: true});
    assert.equal(Object.keys(f.state().queue.tasks).length, 1, 'refresh is idempotent');
    f.send({type: 'queue-refresh', base: BASE, digest: DIGEST, sessions: [], populate: true});
    assert.equal(Object.values(f.state().queue.tasks)[0].status, 'superseded');
});

test('dashboard keeps one stable worker lane across exploration and implementation and closes execution on submission', () => {
    const f = fixture();
    f.enqueue('explore', 'exploration', {question: 'Private source plan /private/worktree'});
    f.claim('explore'); f.result('explore');
    f.refresh(['case']);
    f.enqueue('case', 'implementation', {goal: 'fixture-port', allowedPaths: ['js/fixture.js'],
        reservations: ['session:case', 'source:fixture.c:fix']});
    f.claim('case');
    const revision = 'd'.repeat(40);
    f.send({type: 'ready', task: 'delivery:case', delivery: revision, base: BASE, commits: [revision],
        paths: ['js/fixture.js'], evidence: '/private/packet.json', dependencies: []});
    const snapshot = publicQueue(f.state()), activity = activityFromLedger(f.ledger());
    assert.doesNotMatch(JSON.stringify({snapshot, activity}), /private-|\/private\/|worktree|processes/u);
    const timeline = activityTimeline(activity, '2026-10-15T12:02:00.000Z');
    const execution = timeline.tasks.filter(task => task.kind === 'queue-execution');
    assert.deepEqual(execution.map(task => task.assignmentType), ['exploration', 'implementation']);
    assert.ok(execution.every(task => task.status === 'completed'));
    const work = timeline.stages.filter(stage => stage.lane === 'Worker-1' && stage.phase === 'working');
    assert.deepEqual(new Set(work.filter(stage => stage.end > stage.start).map(stage => stage.assignmentType)),
        new Set(['exploration', 'implementation']));
    assert.ok(work.every(stage => !stage.ongoing || stage.start === stage.end));
    assert.equal(snapshot.workers.find(worker => worker.worker === 'Worker-1').assignment, null);
    assert.ok(activityUtilization(timeline.stages, Date.parse('2026-10-15T12:00:00.000Z'),
        Date.parse('2026-10-15T12:02:00.000Z')).some(row => row.role === 'Workers' && row.work > 0));
});
