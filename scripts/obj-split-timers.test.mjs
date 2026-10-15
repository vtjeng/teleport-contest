import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    BURN_OBJECT,
    HATCH_EGG,
    MELT_ICE_AWAY,
    ROT_CORPSE,
    TIMER_LEVEL,
    TIMER_OBJECT,
} from '../js/const.js';
import {
    obj_split_timers,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

const C_MKOBJ = readFileSync('nethack-c/upstream/src/mkobj.c', 'utf8');
const C_TIMEOUT = readFileSync('nethack-c/upstream/src/timeout.c', 'utf8');
const JS_OBJ = readFileSync('js/obj.js', 'utf8');
const JS_TIMEOUT = readFileSync('js/timeout.js', 'utf8');

function sourceFunction(source, signature) {
    const start = source.indexOf(signature);
    assert.notEqual(start, -1, `${signature} is present`);
    const end = source.indexOf('\n}', start) + 2;
    assert.ok(end > start, `${signature} has a complete definition`);
    return source.slice(start, end);
}

function timerState(moves = 20) {
    const state = { moves, gt: {}, svt: {} };
    timeout_globals_init(state);
    return state;
}

function timers(state) {
    const result = [];
    for (let timer = state.gt.timer_base; timer; timer = timer.next)
        result.push(timer);
    return result;
}

test('splitobj copies source object timers before checking light', () => {
    const cSplitobj = sourceFunction(C_MKOBJ, 'splitobj(struct obj *obj, long num)\n{');
    const cTimerCopy = sourceFunction(
        C_TIMEOUT,
        'obj_split_timers(struct obj *src, struct obj *dest)\n{',
    );
    assert.match(cSplitobj,
        /if \(obj->timed\)\s+obj_split_timers\(obj, otmp\);\s+if \(obj_sheds_light\(obj\)\)/u);
    assert.match(cTimerCopy,
        /next_timer = curr->next;[\s\S]*?curr->kind == TIMER_OBJECT\s*&& curr->arg\.a_obj == src[\s\S]*?start_timer\(curr->timeout - svm\.moves, TIMER_OBJECT,\s*curr->func_index, obj_to_any\(dest\)\)/u);

    const jsSplitobj = sourceFunction(
        JS_OBJ,
        'export function splitobj(obj, quantity, env = {}) {',
    );
    assert.match(jsSplitobj,
        /if \(obj\.timed\) \{[\s\S]*?normalized\.hooks\.splitObjectTimers\(obj, child, normalized\);\s*else obj_split_timers\(obj, child, normalized\.state\);\s*\}[\s\S]*?if \(obj_sheds_light\(obj\)\)/u);

    const jsTimerCopy = sourceFunction(
        JS_TIMEOUT,
        'export function obj_split_timers(src, dest, state = game) {',
    );
    const jsTimerCalls = [
        'const next = timer.next;',
        'if (timer.kind === TIMER_OBJECT && timer.arg === src)',
        'start_timer(',
        'timer.timeout - currentMove(state),',
        'timer.func_index,',
        'dest,',
        'timer = next;',
    ];
    let previous = -1;
    for (const call of jsTimerCalls) {
        const index = jsTimerCopy.indexOf(call, previous + 1);
        assert.ok(index > previous, `${call} remains in source order`);
        previous = index;
    }
});

test('obj_split_timers duplicates every object timer at its original expiry', () => {
    const state = timerState();
    const source = { timed: 0 };
    const child = { timed: 0 };
    const other = { timed: 0 };

    start_timer(9, TIMER_OBJECT, BURN_OBJECT, source, state);
    start_timer(4, TIMER_OBJECT, HATCH_EGG, source, state);
    start_timer(6, TIMER_OBJECT, ROT_CORPSE, other, state);
    // A timer with the same object argument but another timer kind is not
    // attached to the source object and must remain untouched.
    start_timer(5, TIMER_LEVEL, MELT_ICE_AWAY, source, state);
    const originals = timers(state).filter(timer => timer.arg === source
        && timer.kind === TIMER_OBJECT);
    const levelTimer = timers(state).find(timer => timer.kind === TIMER_LEVEL);

    assert.equal(obj_split_timers(source, child, state), undefined);

    const copied = timers(state).filter(timer => timer.arg === child);
    assert.equal(copied.length, originals.length);
    assert.deepEqual(
        copied.map(timer => [timer.kind, timer.func_index, timer.timeout])
            .sort((left, right) => left[1] - right[1]),
        originals.map(timer => [timer.kind, timer.func_index, timer.timeout])
            .sort((left, right) => left[1] - right[1]),
    );
    assert.equal(source.timed, 2);
    assert.equal(child.timed, 2);
    assert.equal(other.timed, 1);
    assert.equal(timers(state).includes(levelTimer), true,
        'non-object timers remain in the queue');
});
