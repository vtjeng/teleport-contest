// js/end.js nh_terminate() and the segment termination state in js/rng.js:
// the final capture, suspension, the runtime guard on what runs after
// termination, the planning refusal, and how the entry points and reporters
// in js/jsmain.js treat a terminated segment.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { moveloop_core } from '../js/allmain.js';
import { DIED } from '../js/const.js';
import { done, nh_terminate } from '../js/end.js';
import { GameDisplay } from '../js/game_display.js';
import { game } from '../js/gstate.js';
import { nhgetch } from '../js/input.js';
import {
    runSegment,
    runSegmentStrict,
    setTerminationViolationReporter,
} from '../js/jsmain.js';
import {
    cloneIsaacContext,
    enableRngLog,
    getRngLog,
    initRng,
    isTerminated,
    markTerminated,
    oneMacrotask,
    pushRngLogEntry,
    raceTermination,
    resetTermination,
    rn2,
    settleTerminationNotice,
    terminationNotice,
    terminationViolations,
    withPlanningCoreContext,
} from '../js/rng.js';
import { expectTerminated } from './expect-terminated.mjs';

// A recording whose only segment ends in really_done() -> nh_terminate():
// a wizard-mode death with done_stopprint set, ten captured screens.
const DEATH = JSON.parse(readFileSync(new URL(
    '../recordings/end.c/really-done-stopprint-wizard.session.json', import.meta.url,
), 'utf8')).segments[0];

function storageHandle() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
    };
}

// Whether `promise` settles within one macrotask.
async function settlesSoon(promise) {
    let settled = false;
    promise.then(() => { settled = true; }, () => { settled = true; });
    await oneMacrotask();
    return settled;
}

test('nh_terminate marks the segment before its one capture, then suspends', async () => {
    resetTermination();
    const events = [];
    const state = {
        program_state: { in_moveloop: 1 },
        _preNhgetchHook: async () => {
            events.push(['capture', isTerminated(),
                state.program_state.in_moveloop, state.program_state.gameover]);
        },
    };
    let noticed = false;
    terminationNotice().then(() => { noticed = true; });
    await expectTerminated(() => nh_terminate(state));
    // C clears in_moveloop first; the port marks the segment terminated
    // before the capture and sets gameover only after it.
    assert.deepEqual(events, [['capture', true, 0, undefined]]);
    assert.equal(state.program_state.gameover, true);
    assert.equal(state.program_state.exiting, 1);
    assert.equal(noticed, true);
    // expectTerminated() leaves a live segment behind it.
    assert.equal(isTerminated(), false);
});

test('a call that terminates never resumes its caller', async () => {
    resetTermination();
    const state = { program_state: {} };
    let resumed = false;
    const caller = (async () => {
        await nh_terminate(state);
        resumed = true;
    })();
    const outcome = await raceTermination(caller);
    assert.deepEqual(outcome, { terminated: true });
    assert.equal(await settlesSoon(caller), false);
    assert.equal(resumed, false);
    resetTermination();
});

test('after termination an RNG append is dropped and recorded', () => {
    resetTermination();
    // An arbitrary seed; only the presence of each log entry matters.
    initRng(20261105);
    enableRngLog();
    rn2(6);
    assert.equal(getRngLog().length, 1);
    markTerminated();
    rn2(6);
    pushRngLogEntry('rnz(10)=12');
    assert.equal(getRngLog().length, 1, 'neither append reached the log');
    assert.deepEqual(terminationViolations().map(({ kind }) => kind), ['rng', 'rng']);
    assert.match(terminationViolations()[0].detail, /^rn2\(6\)=\d$/u);
    assert.equal(terminationViolations()[1].detail, 'rnz(10)=12');
    resetTermination();
});

test('after termination nhgetch records a violation and suspends before any capture', async () => {
    resetTermination();
    let captures = 0;
    const state = { _preNhgetchHook: async () => { captures++; } };
    markTerminated();
    assert.equal(await settlesSoon(nhgetch(state)), false);
    assert.equal(captures, 0);
    assert.deepEqual(terminationViolations().map(({ kind }) => kind), ['nhgetch']);
    resetTermination();
});

test('a second nh_terminate takes no second capture and records a violation', async () => {
    resetTermination();
    let captures = 0;
    const state = { program_state: {}, _preNhgetchHook: async () => { captures++; } };
    const first = raceTermination(nh_terminate(state));
    assert.deepEqual(await first, { terminated: true });
    assert.equal(await settlesSoon(nh_terminate(state)), false);
    assert.equal(captures, 1);
    assert.deepEqual(terminationViolations().map(({ kind }) => kind), ['nh_terminate']);
    resetTermination();
});

test('a body that rejects after the notice won is recorded as a violation', async () => {
    resetTermination();
    let fail;
    const body = new Promise((_, reject) => { fail = reject; });
    const race = raceTermination(body);
    markTerminated();
    settleTerminationNotice();
    assert.deepEqual(await race, { terminated: true });
    fail(new TypeError('stray body'));
    await oneMacrotask();
    assert.deepEqual(terminationViolations(),
        [{ kind: 'rejection', detail: 'TypeError: stray body' }]);
    resetTermination();
});

test('done() and nh_terminate() refuse to end the game from a planning clone', async () => {
    resetTermination();
    initRng(20261105);
    const state = { program_state: {} };
    const context = cloneIsaacContext(game.coreCtx);
    await assert.rejects(withPlanningCoreContext(context, () => nh_terminate(state)),
        /nh_terminate\(\) reached while a planning context is installed/u);
    await assert.rejects(withPlanningCoreContext(context, () => done(DIED, state)),
        /done\(\) reached while a planning context is installed/u);
    assert.equal(isTerminated(), false);
    assert.deepEqual(state.program_state, {});
    assert.equal(await settlesSoon(terminationNotice()), false, 'the notice did not settle');
});

test('a stray chain through a first-time import finishes within the drain', async () => {
    // The drain that follows a won race is one macrotask. Under Node's default
    // loader a first-time dynamic import() of a js/ module outside jsmain.js's
    // static graph still completes before an already-due setTimeout(0), so a
    // stray body that imports and then reads a key has reached nhgetch()'s
    // guard by the time the race returns. A loader hook registered with
    // module.register would reverse that; no judge or local path registers
    // one. player_selection_tty.js and sokoban_levels.js are reached only by
    // import() and nothing above has imported them.
    resetTermination();
    const events = [];
    const state = { program_state: {} };
    const stray = (async () => {
        await import('../js/player_selection_tty.js');
        events.push('first import');
        await import('../js/sokoban_levels.js');
        events.push('second import');
        await nhgetch(state);
        events.push('read a key');
    })();
    assert.deepEqual(await raceTermination(nh_terminate(state)), { terminated: true });
    assert.deepEqual(events, ['first import', 'second import']);
    assert.deepEqual(terminationViolations().map(({ kind }) => kind), ['nhgetch']);
    assert.equal(await settlesSoon(stray), false);
    resetTermination();
});

test('a replayed death ends at nh_terminate with its final capture', async () => {
    const result = await runSegmentStrict({ ...DEATH, storage: storageHandle() });
    assert.equal(isTerminated(), true);
    assert.equal(game.program_state.gameover, true);
    assert.equal(result.getInputExhausted(), false);
    assert.equal(result.getScreens().length, DEATH.steps.filter((step) => step.screen).length);
    assert.deepEqual(result.terminationViolations, []);
});

test('after termination moveloop_core runs no game code and reads one raw key', async () => {
    const result = await runSegmentStrict({ ...DEATH, storage: storageHandle() });
    assert.equal(isTerminated(), true);
    const screens = result.getScreens().length;
    const rngCalls = getRngLog().length;
    const display = game.nhDisplay;
    // Two queued keys: one call drains exactly one, without a capture.
    display.pushKey('a'.charCodeAt(0));
    display.pushKey('b'.charCodeAt(0));
    await moveloop_core();
    assert.equal(display.inputQueueLength, 1);
    assert.equal(result.getScreens().length, screens);
    assert.equal(getRngLog().length, rngCalls);
    assert.deepEqual(terminationViolations(), []);
    // An empty queue reaches the display's own empty-queue handling, as the
    // frozen playability runner relies on to stop.
    await moveloop_core();
    await assert.rejects(moveloop_core(), /Input queue empty/u);
});

test('start() resets a terminated segment before it plays', async () => {
    resetTermination();
    markTerminated();
    pushRngLogEntry('rn2(2)=1'); // recorded as a violation of the old segment
    const result = await runSegmentStrict({ ...DEATH, moves: '' });
    assert.equal(isTerminated(), false);
    assert.deepEqual(result.terminationViolations, []);
    assert.equal(result.getRngSlices().length, 1);
});

test('runSegmentStrict throws on a violation; runSegment keeps the scores and reports it', async (t) => {
    // A chain that waits for this segment's notice and then draws, as a
    // promise some caller discarded could. nh_terminate()'s final capture
    // serializes the display after marking the segment terminated and before
    // settling the notice, so the stand-in attaches there.
    const serialize = GameDisplay.prototype.serialize;
    t.after(() => { GameDisplay.prototype.serialize = serialize; });
    let stray = false;
    GameDisplay.prototype.serialize = function (...args) {
        if (stray && isTerminated()) {
            stray = false;
            terminationNotice().then(() => rn2(9));
        }
        return serialize.apply(this, args);
    };
    const clean = await runSegmentStrict({ ...DEATH, storage: storageHandle() });

    stray = true;
    await assert.rejects(runSegmentStrict({ ...DEATH, storage: storageHandle() }), (error) => {
        assert.equal(error.name, 'TerminationViolationError');
        assert.match(error.message, /rng: rn2\(9\)=\d/u);
        assert.deepEqual(error.segmentGame.getScreens(), clean.getScreens());
        return true;
    });

    const reported = [];
    setTerminationViolationReporter((violations) => reported.push(violations));
    try {
        stray = true;
        const judged = await runSegment({ ...DEATH, storage: storageHandle() });
        assert.equal(judged.segmentError, null);
        assert.deepEqual(judged.getScreens(), clean.getScreens());
        assert.deepEqual(judged.getRngLog(), clean.getRngLog(),
            'the stray draw did not reach the scored log');
        assert.equal(reported.length, 1);
        assert.deepEqual(reported[0].map(({ kind }) => kind), ['rng']);
        assert.deepEqual(judged.terminationViolations, reported[0]);
    } finally {
        setTerminationViolationReporter(null);
    }
});
