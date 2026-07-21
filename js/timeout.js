// Timeout queue primitives.
// C ref: src/timeout.c start_timer(), stop_timer(), peek_timer(), and
// obj_stop_timers().
// Queue primitives take their source-owned state directly. Helpers which
// consume RNG take an `{ state, random }` environment so focused tests can
// verify every draw without replacing the queue representation. stop_timer()
// and obj_stop_timers() also accept cleanup integration through `{ hooks }`.

import {
    BURN_OBJECT,
    FIG_TRANSFORM,
    HATCH_EGG,
    MAX_EGG_HATCH_TIME,
    NUM_TIME_FUNCS,
    NUM_TIMER_KINDS,
    OBJ_INVENT,
    REVIVE_MON,
    ROT_AGE,
    ROT_CORPSE,
    SHRINK_GLOB,
    TAINT_AGE,
    TIMER_NONE,
    TIMER_OBJECT,
    TROLL_REVIVE_CHANCE,
    ZOMBIFY_MON,
} from './const.js';
import { game } from './gstate.js';
import { is_rider, zombie_form } from './mondata.js';
import {
    PM_DEATH,
    PM_LICHEN,
    PM_LIZARD,
    S_TROLL,
} from './monsters.js';
import { rn1, rn2, rnd, rnz } from './rng.js';

const NO_CLEANUP_ERROR = Symbol('no cleanup error');

// decl.c initializes these globals once for a fresh process. Each JS game is
// isolated in a fresh state object, so jsmain calls this at the same early
// initialization boundary.
export function timeout_globals_init(state = game) {
    state.gt ??= {};
    state.gt.timer_base = null;
    state.svt ??= {};
    state.svt.timer_id = 1;
}

function timerGlobals(state) {
    if (!state.gt || !Object.hasOwn(state.gt, 'timer_base')
        || !state.svt || !Number.isInteger(state.svt.timer_id)
        || state.svt.timer_id < 1) {
        throw new Error('timer queue requires timeout_globals_init()');
    }
    return state;
}

export class UnsupportedTimerCleanupError extends Error {
    constructor(operation, funcIndex) {
        super(`timer cleanup requires ${operation} for function ${funcIndex}`);
        this.name = 'UnsupportedTimerCleanupError';
        this.operation = operation;
        this.func_index = funcIndex;
    }
}

function timerCleanupEnv(state, env = {}) {
    return {
        ...env,
        state,
        hooks: env.hooks ?? {},
    };
}

// Cleanup hook contracts are deleteObjectLightSource(obj, env) and
// updateInventory(state). As a JS safety adaptation, all required hooks are
// resolved while the timer queue is intact, before any timer is removed; C's
// corresponding cleanup functions are always linked.
function requiredCleanupHook(env, operation, funcIndex) {
    const hook = env.hooks?.[operation];
    if (typeof hook !== 'function')
        throw new UnsupportedTimerCleanupError(operation, funcIndex);
    return hook;
}

// Keep this display boundary synchronized with invent.js update_inventory().
// Timers cannot import that object-owning module without creating the cycle
// timeout -> invent -> obj -> timeout. For a carried lit object, the optional
// window hook is used whenever display is active and unsuppressed; it becomes
// mandatory only for a permanent-inventory display.
function burnInventoryRefreshActive(state) {
    const programState = state.program_state;
    return Boolean(programState?.in_moveloop
        && !state.in_mklev
        && !programState.saving
        && !programState.restoring
        && !programState.done_hup);
}

// C ref: timeout.c cleanup_burn(). Light-source deletion remains behind the
// object lifecycle hook until light.c is ported. Resolve live integration
// seams before unlinking a timer so a missing seam cannot leave the queue,
// timed count, fuel, and light ownership partially updated.
function preflightTimerCleanup(timer, state, env = {}) {
    if (timer.func_index !== BURN_OBJECT) return null;

    const normalized = timerCleanupEnv(state, env);
    const obj = timer.arg;
    if (!obj.lamplit) {
        // cleanup_burn() reports an impossible condition and returns without
        // touching light or fuel state when a timed object is no longer lit.
        return { normalized, deleteLight: null, updateInventory: null };
    }

    const deleteLight = requiredCleanupHook(
        normalized,
        'deleteObjectLightSource',
        timer.func_index,
    );
    let updateInventory = null;
    if (obj.where === OBJ_INVENT && burnInventoryRefreshActive(state)) {
        updateInventory = typeof normalized.hooks.updateInventory === 'function'
            ? normalized.hooks.updateInventory : null;
        if (state.iflags?.perm_invent && !updateInventory) {
            updateInventory = requiredCleanupHook(
                normalized,
                'updateInventory',
                timer.func_index,
            );
        }
    }
    return { normalized, deleteLight, updateInventory };
}

function cleanupTimer(timer, state, cleanup) {
    if (timer.func_index !== BURN_OBJECT) return;

    const obj = timer.arg;
    if (!obj.lamplit) return;
    let firstError = NO_CLEANUP_ERROR;
    try {
        cleanup.deleteLight(obj, cleanup.normalized);
    } catch (error) {
        firstError = error;
    }
    obj.age = Math.trunc(obj.age ?? 0)
        + timer.timeout - currentMove(state);
    obj.lamplit = false;
    if (cleanup.updateInventory) {
        state.iflags ??= {};
        const savedSuppressPrice = state.iflags.suppress_price;
        state.iflags.suppress_price = 0;
        try {
            cleanup.updateInventory(state);
        } catch (error) {
            if (firstError === NO_CLEANUP_ERROR) {
                firstError = error;
            }
        } finally {
            state.iflags.suppress_price = savedSuppressPrice;
        }
    }
    if (firstError !== NO_CLEANUP_ERROR) throw firstError;
}

function validateTimer(kind, funcIndex) {
    if (!Number.isInteger(kind) || kind <= TIMER_NONE
        || kind >= NUM_TIMER_KINDS) {
        throw new RangeError(`invalid timer kind ${kind}`);
    }
    if (!Number.isInteger(funcIndex) || funcIndex < 0
        || funcIndex >= NUM_TIME_FUNCS) {
        throw new RangeError(`invalid timer function ${funcIndex}`);
    }
}

function currentMove(state) {
    return Math.trunc(state.moves ?? 0);
}

// C inserts before the first timer whose expiry is greater than or equal to
// the new expiry. Equal-expiry timers therefore run newest first.
function insert_timer(timer, state) {
    let previous = null;
    let current = state.gt.timer_base;
    while (current && current.timeout < timer.timeout) {
        previous = current;
        current = current.next;
    }
    timer.next = current;
    if (previous) previous.next = timer;
    else state.gt.timer_base = timer;
}

export function start_timer(
    when,
    kind,
    funcIndex,
    arg,
    state = game,
) {
    timerGlobals(state);
    validateTimer(kind, funcIndex);

    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        if (timer.kind === kind
            && timer.func_index === funcIndex
            && timer.arg === arg) {
            return false;
        }
    }

    const timer = {
        next: null,
        timeout: currentMove(state) + Math.trunc(when),
        tid: state.svt.timer_id++,
        kind,
        func_index: funcIndex,
        arg,
        needs_fixup: false,
    };
    insert_timer(timer, state);
    if (kind === TIMER_OBJECT) arg.timed = Math.trunc(arg.timed ?? 0) + 1;
    return true;
}

// Like remove_timer(), matching intentionally ignores kind because the C API
// assumes each (function, argument) pair is unique.
function remove_timer(funcIndex, arg, state) {
    let previous = null;
    let current = state.gt.timer_base;
    while (current
           && (current.func_index !== funcIndex || current.arg !== arg)) {
        previous = current;
        current = current.next;
    }
    if (!current) return null;
    if (previous) previous.next = current.next;
    else state.gt.timer_base = current.next;
    current.next = null;
    return current;
}

export function stop_timer(funcIndex, arg, state = game, env = {}) {
    timerGlobals(state);
    let matched = null;
    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        if (timer.func_index === funcIndex && timer.arg === arg) {
            matched = timer;
            break;
        }
    }
    const cleanup = matched
        ? preflightTimerCleanup(matched, state, env)
        : null;
    const timer = remove_timer(funcIndex, arg, state);
    if (!timer) return 0;
    if (timer.kind === TIMER_OBJECT)
        arg.timed = Math.trunc(arg.timed ?? 0) - 1;
    cleanupTimer(timer, state, cleanup);
    return timer.timeout - currentMove(state);
}

export function peek_timer(funcIndex, arg, state = game) {
    timerGlobals(state);
    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        if (timer.func_index === funcIndex && timer.arg === arg)
            return timer.timeout;
    }
    return 0;
}

export function obj_stop_timers(obj, state = game, env = {}) {
    timerGlobals(state);
    const cleanupByTimer = new Map();
    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        if (timer.kind === TIMER_OBJECT && timer.arg === obj)
            cleanupByTimer.set(
                timer,
                preflightTimerCleanup(timer, state, env),
            );
    }
    let previous = null;
    let current = state.gt.timer_base;
    let firstError = NO_CLEANUP_ERROR;
    while (current) {
        const next = current.next;
        if (current.kind === TIMER_OBJECT && current.arg === obj) {
            if (previous) previous.next = next;
            else state.gt.timer_base = next;
            current.next = null;
            try {
                cleanupTimer(current, state, cleanupByTimer.get(current));
            } catch (error) {
                if (firstError === NO_CLEANUP_ERROR) {
                    firstError = error;
                }
            }
        } else {
            previous = current;
        }
        current = next;
    }
    obj.timed = 0;
    if (firstError !== NO_CLEANUP_ERROR) throw firstError;
}

export function obj_has_timer(obj, funcIndex, state = game) {
    return peek_timer(funcIndex, obj, state) !== 0;
}

function timeoutEnv(env = {}) {
    const random = env.random ?? { rn2, rnd };
    if (typeof random.rn2 !== 'function' || typeof random.rnd !== 'function')
        throw new TypeError('timeout random injection requires rn2 and rnd');
    return { state: env.state ?? game, random };
}

function corpseTimerEnv(env = {}) {
    const random = env.random ?? { rn1, rn2, rnd, rnz };
    for (const name of ['rn1', 'rn2', 'rnz']) {
        if (typeof random[name] !== 'function')
            throw new TypeError(`corpse timer random injection requires ${name}`);
    }
    return { state: env.state ?? game, random };
}

// C ref: timeout.c attach_egg_hatch_timeout(). The repeated, differently
// bounded rnd() calls are intentional and recorder-visible.
export function attach_egg_hatch_timeout(egg, when = 0, env = {}) {
    const { random, state } = timeoutEnv(env);
    stop_timer(HATCH_EGG, egg, state);
    let delay = Math.trunc(when);
    if (!delay) {
        for (let age = MAX_EGG_HATCH_TIME - 50 + 1;
            age <= MAX_EGG_HATCH_TIME; ++age) {
            if (random.rnd(age) > 150) {
                delay = age;
                break;
            }
        }
    }
    if (delay)
        start_timer(delay, TIMER_OBJECT, HATCH_EGG, egg, state);
}

// C ref: timeout.c attach_fig_transform_timeout().
export function attach_fig_transform_timeout(figurine, env = {}) {
    const { random, state } = timeoutEnv(env);
    stop_timer(FIG_TRANSFORM, figurine, state);
    start_timer(random.rnd(9000) + 200, TIMER_OBJECT, FIG_TRANSFORM,
        figurine, state);
}

// C ref: mkobj.c start_glob_timeout(). A non-glob is rejected without draws
// or queue mutation, matching the source's impossible()+return path.
export function start_glob_timeout(obj, when = 0, env = {}) {
    const { random, state } = timeoutEnv(env);
    if (!obj.globby) return false;
    if (obj.timed) stop_timer(SHRINK_GLOB, obj, state);
    let delay = Math.trunc(when);
    if (delay < 1) delay = 25 + random.rn2(5) - 2;
    start_timer(delay, TIMER_OBJECT, SHRINK_GLOB, obj, state);
    return true;
}

// C ref: mkobj.c rider_revival_time().
export function rider_revival_time(body, retry = false, env = {}) {
    const { random } = corpseTimerEnv(env);
    const minimum = retry ? 3 : body.corpsenm === PM_DEATH ? 6 : 12;
    let when;
    for (when = minimum; when < 67; ++when) {
        if (!random.rn2(3)) break;
    }
    return when;
}

// C ref: mkobj.c start_corpse_timeout(). The ordinary rnz() calculation
// precedes and is still consumed by Rider, troll, and zombification overrides.
export function start_corpse_timeout(body, env = {}) {
    const normalized = corpseTimerEnv(env);
    const { random, state } = normalized;
    if (body.corpsenm === PM_LIZARD || body.corpsenm === PM_LICHEN) return;

    const monster = state.mons?.[body.corpsenm];
    if (!monster)
        throw new Error('start_corpse_timeout requires a complete monster catalog');

    let action = ROT_CORPSE;
    const rotAdjust = state.in_mklev ? 25 : 10;
    const age = Math.max(Math.trunc(state.moves ?? 0), 1)
        - Math.trunc(body.age ?? 0);
    let when = age > ROT_AGE ? rotAdjust : ROT_AGE - age;
    when += random.rnz(rotAdjust) - rotAdjust;

    if (is_rider(monster)) {
        action = REVIVE_MON;
        when = rider_revival_time(body, false, normalized);
    } else if (monster.mlet === S_TROLL) {
        for (let reviveAge = 2; reviveAge <= TAINT_AGE; ++reviveAge) {
            if (!random.rn2(TROLL_REVIVE_CHANCE)) {
                action = REVIVE_MON;
                when = reviveAge;
                break;
            }
        }
    } else if (state.gz?.zombify
               && zombie_form(monster) >= 0
               && !body.norevive) {
        action = ZOMBIFY_MON;
        when = random.rn1(15, 5);
    }
    start_timer(when, TIMER_OBJECT, action, body, state);
}
