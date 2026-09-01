// Timeout queue primitives.
// C ref: src/timeout.c start_timer(), stop_timer(), peek_timer(), and
// obj_stop_timers().
// Queue primitives take their source-owned state directly. Helpers which
// consume RNG take an `{ state, random }` environment so focused tests can
// verify every draw without replacing the queue representation. stop_timer()
// and obj_stop_timers() also accept cleanup integration through `{ hooks }`.

import {
    BURN_OBJECT,
    BURIED_TOO,
    BLINDED,
    CONFUSION,
    CONTAINED_TOO,
    FIG_TRANSFORM,
    FULL_MOON,
    HATCH_EGG,
    HALLUC,
    MAX_EGG_HATCH_TIME,
    NUM_TIME_FUNCS,
    NUM_TIMER_KINDS,
    LS_OBJECT,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MIGRATING,
    OBJ_MINVENT,
    RANGE_LEVEL,
    REVIVE_MON,
    ROT_AGE,
    ROT_CORPSE,
    SHRINK_GLOB,
    SLIMED,
    SLEEPY,
    TAINT_AGE,
    TIMEOUT,
    TIMER_NONE,
    TIMER_GLOBAL,
    TIMER_LEVEL,
    TIMER_MONSTER,
    TIMER_OBJECT,
    TROLL_REVIVE_CHANCE,
    WOUNDED_LEGS,
    ZOMBIFY_MON,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { artifact_light } from './artifacts.js';
import { stone_luck } from './attrib.js';
import { rot_corpse, unportedRotCorpseReason } from './dig.js';
import { heal_legs, wipeoff } from './do.js';
import { carrying } from './invent.js';
import { game } from './gstate.js';
import { You_can_move_again, nomul } from './hack.js';
import {
    candle_light_range,
    get_obj_location,
    new_light_source,
} from './light.js';
import { is_rider, zombie_form } from './mondata.js';
import {
    PM_DEATH,
    PM_ARCHEOLOGIST,
    PM_LICHEN,
    PM_LIZARD,
    S_TROLL,
} from './monsters.js';
import {
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    FEDORA,
    LUCKSTONE,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
    TALLOW_CANDLE,
    WAX_CANDLE,
} from './objects.js';
import { rn1, rn2, rnd, rnz } from './rng.js';
import { ttyPline } from './tty_message.js';

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

export class UnsupportedBurnObjectError extends Error {
    constructor(obj) {
        super(`begin_burn is not available for otyp ${obj?.otyp}`);
        this.name = 'UnsupportedBurnObjectError';
        this.otyp = obj?.otyp;
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
// It is spelled out here rather than imported so a timer's display decision
// stays readable beside the timers, not because an import is impossible: this
// file already sits inside that cycle through './dig.js' and './do.js', both
// of which import invent.js, and it imports carrying() from invent.js
// directly. For a carried lit object, the optional window hook is used
// whenever display is active and unsuppressed; it becomes mandatory only for
// a permanent-inventory display.
function burnInventoryRefreshActive(state) {
    const programState = state.program_state;
    return Boolean(programState?.in_moveloop
        && !state.in_mklev
        && !programState.saving
        && !programState.restoring
        && !programState.done_hup);
}

function preflightBurnInventoryRefresh(obj, state, env) {
    if (obj.where !== OBJ_INVENT || !burnInventoryRefreshActive(state))
        return null;
    const updateInventory = env.hooks?.updateInventory;
    if (state.iflags?.perm_invent && typeof updateInventory !== 'function') {
        throw new UnsupportedTimerCleanupError('updateInventory', BURN_OBJECT);
    }
    return typeof updateInventory === 'function' ? updateInventory : null;
}

function runBurnInventoryRefresh(updateInventory, state) {
    if (!updateInventory) return;
    state.iflags ??= {};
    const savedSuppressPrice = state.iflags.suppress_price;
    state.iflags.suppress_price = 0;
    try {
        updateInventory(state);
    } finally {
        state.iflags.suppress_price = savedSuppressPrice;
    }
}

// C ref: timeout.c cleanup_burn(). Light-source deletion remains an injected
// object-lifecycle operation so timer cleanup can be composed with whichever
// subsystem owns the object. Resolve live integration seams before unlinking
// a timer so a missing seam cannot leave the queue, timed count, fuel, and
// light ownership partially updated.
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
    const updateInventory = preflightBurnInventoryRefresh(
        obj,
        state,
        normalized,
    );
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
    try {
        runBurnInventoryRefresh(cleanup.updateInventory, state);
    } catch (error) {
        if (firstError === NO_CLEANUP_ERROR) {
            firstError = error;
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

// The site is part of the message because two callers raise this class over
// the same field. preflight_nh_timeout_elapsed_turn() guards an elapsed turn;
// run_timers() guards the drain itself, which goto_level() reaches on arrival
// and nh_timeout() reaches at its tail. A log line naming only the timer would
// not say which of the three stopped, and boundary triage reads that line.
export class UnsupportedHeroTimeoutBoundaryError extends Error {
    constructor(reason, site = 'elapsed-turn nh_timeout') {
        super(`${site} requires ${reason}`);
        this.name = 'UnsupportedHeroTimeoutBoundaryError';
        this.reason = reason;
        this.site = site;
    }
}

// C ref: timeout.c timeout_funcs[] (1978-1990), "Table of timeout functions,
// listed in order of enum timeout_types". Each row keeps the VERBOSE_TIMER
// name C prints so a stop can say which function it refused. `f` is the ported
// timeout_proc and `unported` the reason it cannot run yet; a row with neither
// names a function this port has not reached.
//
// C's second TTAB field, `cleanup`, is not here. Only BURN_OBJECT has one, and
// stop_timer() already owns it through preflightTimerCleanup() above; nothing
// run_timers() does consults it.
const timeout_funcs = [
    { name: 'rot_organic' },
    { name: 'rot_corpse', f: rot_corpse, unported: unportedRotCorpseReason },
    { name: 'revive_mon' },
    { name: 'zombify_mon' },
    { name: 'burn_object' },
    { name: 'hatch_egg' },
    { name: 'fig_transform' },
    { name: 'shrink_glob' },
    { name: 'melt_ice_away' },
];
if (timeout_funcs.length !== NUM_TIME_FUNCS)
    throw new Error('timeout_funcs must cover every timeout_types row');

// The environment run_timers() hands a timeout function. dig.c rot_corpse()
// reaches invent.c obfree() and mkobj.c remove_object(), which take their
// integration seams under `hooks`, while nh_timeout()'s own callees take theirs
// flat. Lift the one seam the table passes down rather than making either
// convention follow the other.
function timerFireEnv(state, env) {
    return { ...env, state, hooks: { ...env.hooks, newsym: env.newsym } };
}

// The reason run_timers() cannot drain the queue's due prefix, or null when it
// can.
//
// C ref: timeout.c run_timers() (2216-2240), read as a predicate over the same
// prefix its `while (gt.timer_base && gt.timer_base->timeout <= svm.moves)`
// walks. C cannot fail partway through that drain; this port can, because a
// row of timeout_funcs[] may be unported or a ported one may meet a branch it
// has not reached. Deciding the whole prefix first keeps the refusal atomic,
// so a stopped turn leaves the queue as C would have left it.
//
// Walking ahead is sound only because firing an admitted element cannot change
// the prefix: rot_corpse() over a floor corpse starts no timer and stops none.
// It reaches stop_timer() through neither remove_object()'s obj_timer_checks()
// nor dealloc_obj(), because run_timers() has already decremented the corpse's
// only `timed` count to zero, and each admitted element names a distinct
// object, since start_timer() rejects a duplicate (kind, function, argument).
function unportedDueTimerReason(state, env) {
    for (let timer = state.gt?.timer_base;
        timer && Math.trunc(timer.timeout) <= currentMove(state);
        timer = timer.next) {
        if (timer.kind !== TIMER_OBJECT) {
            // timeout.h:52-59 timer_is_obj(): every ported row takes an
            // object.
            return 'every due timer to be an object timer, but kind '
                + `${timer.kind} is due`;
        }
        const entry = timeout_funcs[timer.func_index];
        if (!entry.f)
            return `a ported timeout function, but ${entry.name}() is due`;
        // A corpse still carrying a second timer would reach obj_timer_checks()
        // from remove_object() with a nonzero `timed`, and that can stop and
        // restart a timer on ice, which is exactly the prefix change the walk
        // above assumes away.
        if (Math.trunc(timer.arg?.timed ?? 0) !== 1)
            return 'the due object to hold only its own timer';
        const reason = entry.unported(timer.arg, env);
        if (reason) return reason;
    }
    return null;
}

// C ref: timeout.c nh_timeout() and timer.c run_timers(), specialized to the
// source-inert timeout state admitted by the current repeated-command
// boundary. Validate those invariants rather than silently skipping a newly
// reachable timeout branch.
//
// `env` carries the newsym() seam the due timers will draw through, so a turn
// whose timer cannot fire refuses before the turn starts rather than partway
// into it.
export function preflight_nh_timeout_elapsed_turn(state = game, env = {}) {
    const u = state.u ?? {};
    // timeout.c:621-622 returns for an invulnerable hero, and everything this
    // function validates sits below that return: the mtimedone, ucreamed,
    // usptime and ugallop arms at 641-667, the property countdown at 670-671,
    // and run_timers() at 947, nh_timeout()'s last statement. So none of that
    // state is read on such a turn and none of it needs to be admitted.
    // nh_timeout_elapsed_turn() makes the same return, in C's position.
    if (u.uinvulnerable) return;
    const wipeOccupation = state.go?.occupation === wipeoff;
    const ordinaryWipe = u.ucreamed === 3
        && u.uprops?.[BLINDED]?.intrinsic === 3
        && !u.uprops[BLINDED].extrinsic
        && !u.uprops[BLINDED].blocked
        && wipeOccupation;
    for (const [name, value] of [
        ['ucreamed', u.ucreamed],
        ['usptime', u.usptime],
        ['ugallop', u.ugallop],
    ]) {
        if (name === 'ucreamed' && ordinaryWipe) continue;
        if (Math.trunc(value ?? 0) !== 0) {
            throw new UnsupportedHeroTimeoutBoundaryError(
                name === 'ucreamed' && wipeOccupation
                    ? 'ordinary wipe occupation with matching three-turn blindness'
                    : `zero ${name}`,
            );
        }
    }
    for (let index = 0; index < (u.uprops?.length ?? 0); ++index) {
        const timeout = Math.trunc(u.uprops[index]?.intrinsic ?? 0) & TIMEOUT;
        if (timeout === 0) continue;
        // WOUNDED_LEGS is fully ported, including expiry through heal_legs().
        // CONFUSION is admitted only while this decrement remains nonzero;
        // timeout 1 would reach make_confused(), which remains unported here.
        if (index === WOUNDED_LEGS) continue;
        if (index === CONFUSION && timeout > 1) continue;
        // HALLUC's timeout expiry still needs make_hallucinated(), but its
        // ordinary decrement is source-inert while more than one turn remains.
        if (index === HALLUC && timeout > 1) continue;
        // timeout.c:784's SLEEPY case has no effect while its timeout remains
        // above one, regardless of whether the source is a worn amulet or an
        // intrinsic flag.  At expiry, the source-bearing and extrinsic cases
        // can fall asleep or extend the timeout, so only a plain worn-amulet
        // timeout may enter that final no-op arm.
        if (index === SLEEPY
            && (timeout > 1
                || ((Math.trunc(u.uprops[index]?.intrinsic ?? 0) & ~TIMEOUT)
                    === 0
                    && !(u.uprops[index]?.extrinsic ?? 0)))) continue;
        if (index === BLINDED && ordinaryWipe) continue;
        throw new UnsupportedHeroTimeoutBoundaryError(
            `no active property timeout at index ${index}`,
        );
    }
    const reason = unportedDueTimerReason(state, timerFireEnv(state, env));
    if (reason) throw new UnsupportedHeroTimeoutBoundaryError(reason);
}

// C ref: timeout.c burn_away_slime() (446-453). Fire cures green slime, and
// zap.c zhitu()'s ZT_FIRE arm calls this before it burns any armor.
//
// youprop.h:113 Slimed is u.uprops[SLIMED].intrinsic, a countdown to turning
// into a green slime. Nothing ported raises it -- AD_SLIM comes from a green
// slime's attack or from eating its corpse, and neither is ported -- so the
// arm below has never run. make_slimed() is what it needs: it clears the
// timer, prints the message and repaints the hero's own glyph.
export function burn_away_slime(state = game) {
    if (state.u?.uprops?.[SLIMED]?.intrinsic) {
        throw new UnsupportedHeroTimeoutBoundaryError(
            'make_slimed() to burn the slime away', 'burn_away_slime',
        );
    }
}

// C ref: timeout.c nh_timeout(), through its always-live basal-luck prefix.
// This precedes invulnerability and every property/timer branch.
export function adjust_timeout_luck(state = game) {
    let baseline = state.flags?.moonphase === FULL_MOON ? 1 : 0;
    if (state.flags?.friday13) baseline -= 1;
    if (state.svq?.quest_status?.killed_leader) baseline -= 4;
    if (state.urole?.mnum === PM_ARCHEOLOGIST
        && state.uarmh?.otyp === FEDORA) {
        baseline += 1;
    }

    const u = state.u;
    const cadence = u.uhave?.amulet || u.ugangr ? 300 : 600;
    if (u.uluck === baseline
        || currentMove(state) % cadence !== 0) {
        return false;
    }
    const timedLuck = stone_luck(false, state);
    const noStone = !carrying(LUCKSTONE, state)
        && !stone_luck(true, state);
    if (u.uluck > baseline && (noStone || timedLuck < 0))
        --u.uluck;
    else if (u.uluck < baseline && (noStone || timedLuck > 0))
        ++u.uluck;
    else
        return false;
    return true;
}

// C ref: timeout.c sleep_dialogue() (268-274). This is before nh_timeout()'s
// per-property decrement, so a four-turn SLEEPY timeout says "You yawn."
// before its countdown changes. The live elapsed-turn owner supplies the
// message seam; the planning clone supplies a silent one.
async function sleep_dialogue(state, env = {}) {
    const timeout = Math.trunc(
        state.u?.uprops?.[SLEEPY]?.intrinsic ?? 0,
    ) & TIMEOUT;
    if (timeout === 4)
        await (env.message ?? ttyPline)('You yawn.', state);
}

// C ref: timeout.c nh_timeout() (669-945), the per-property countdown and the
// expiry switch under it. C decrements every property whose TIMEOUT field is
// nonzero and runs the switch on each one that reaches zero. An invulnerable
// hero never arrives, because the caller returns first exactly as
// timeout.c:621 does; every other hero has been through the preflight. The
// admitted rows here are WOUNDED_LEGS, source-inert SLEEPY, and the
// non-expiring CONFUSION/HALLUC countdowns.
//
// C reads find_delayed_killer() at 672 before switching, but only its STONED,
// SLIMED and SICK cases use the result and none of the three is admitted here.
async function decrement_property_timeouts(state, env) {
    for (let index = 0; index < (state.u?.uprops?.length ?? 0); ++index) {
        const property = state.u.uprops[index];
        if ((Math.trunc(property?.intrinsic ?? 0) & TIMEOUT) === 0) continue;
        if ((--property.intrinsic & TIMEOUT) !== 0) continue;
        if (index === SLEEPY) {
            // C's case SLEEPY (timeout.c:784-793) sees Sleepy as false here
            // when the property had only the worn amulet's timeout bit. The
            // other source-bearing forms were rejected by preflight because
            // their expiry can consume RNG or make the hero fall asleep.
            continue;
        }
        // C ref: timeout.c:774-777.
        await heal_legs(state, env);
        await stop_occupation(state, env);
    }
}

// Source-ordered elapsed-turn owner. The remaining admitted timeout state is
// source-inert after the live luck prefix and the property countdown.
//
// `env` carries the message() that heal_legs() writes its line through, the
// statusRefresh() stop_occupation() may need, and the newsym() a rotting floor
// corpse redraws its square with, because the elapsed turn is dry run on a
// cloned state first and that pass has to stay silent.
export async function nh_timeout_elapsed_turn(state = game, env = {}) {
    preflight_nh_timeout_elapsed_turn(state, env);
    adjust_timeout_luck(state);
    /* "things past this point could kill you" -- timeout.c:621-622, below the
       basal-luck block and above every branch nh_timeout() has left. */
    if (state.u?.uinvulnerable) return;
    await sleep_dialogue(state, env);
    // C ref: timeout.c:641-648. Decrement the polymorph timer each turn.
    // When it reaches zero, the hero reverts: Unchanging extends it,
    // is_were() calls you_unwere(), otherwise rehumanize(). None of those
    // are ported, so reaching zero is a boundary error. In the current
    // witness session mtimedone starts at 500-999 with ~180 steps left,
    // so the zero case is unreachable.
    if (state.u.mtimedone) {
        if (--state.u.mtimedone === 0) {
            throw new UnsupportedHeroTimeoutBoundaryError(
                'rehumanize/you_unwere/Unchanging extension when mtimedone reaches zero',
            );
        }
    }
    if (state.u.ucreamed) --state.u.ucreamed;
    await decrement_property_timeouts(state, env);
    /* timeout.c:947, nh_timeout()'s last statement. */
    run_timers(state, { ...env, site: "nh_timeout()'s run_timers()" });
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

// C ref: timeout.c spot_stop_timers(). Positional timer arguments use the
// packed absolute map coordinate `(x << 16) | y`.
export function spot_stop_timers(x, y, funcIndex, state = game) {
    timerGlobals(state);
    validateTimer(TIMER_LEVEL, funcIndex);
    const coordinate = x * 0x10000 + y;
    let previous = null;
    let current = state.gt.timer_base;
    while (current) {
        const next = current.next;
        if (current.kind === TIMER_LEVEL
            && current.func_index === funcIndex
            && current.arg === coordinate) {
            if (previous) previous.next = next;
            else state.gt.timer_base = next;
            current.next = null;
        } else {
            previous = current;
        }
        current = next;
    }
}

export function stop_timer(funcIndex, arg, state = game, env = {}) {
    timerGlobals(state);
    // C assumes each (function, argument) pair is unique, so matching
    // intentionally ignores kind.
    let previous = null;
    let matched = null;
    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        if (timer.func_index === funcIndex && timer.arg === arg) {
            matched = timer;
            break;
        }
        previous = timer;
    }
    if (!matched) return 0;
    const cleanup = preflightTimerCleanup(matched, state, env);
    if (previous) previous.next = matched.next;
    else state.gt.timer_base = matched.next;
    matched.next = null;
    if (matched.kind === TIMER_OBJECT)
        arg.timed = Math.trunc(arg.timed ?? 0) - 1;
    cleanupTimer(matched, state, cleanup);
    return matched.timeout - currentMove(state);
}

// Dependency-only half of timeout.c end_burn().  Burial needs to establish
// that light deletion and the burn timer are both available before it changes
// punishment, leash, or floor ownership state.
export function preflight_end_burn(
    obj,
    timerAttached = true,
    env = {},
) {
    const state = env.state ?? game;
    const normalized = timerCleanupEnv(state, env);
    if (!obj?.lamplit) return { mode: 'none', normalized };

    const attached = Boolean(timerAttached)
        && obj.otyp !== MAGIC_LAMP
        && !artifact_light(obj);
    if (!attached) {
        const deleteLight = requiredCleanupHook(
            normalized,
            'deleteObjectLightSource',
            BURN_OBJECT,
        );
        const updateInventory = preflightBurnInventoryRefresh(
            obj,
            state,
            normalized,
        );
        return {
            mode: 'direct',
            normalized,
            deleteLight,
            updateInventory,
        };
    }

    let timer = state.gt?.timer_base ?? null;
    while (timer
           && !(timer.func_index === BURN_OBJECT && timer.arg === obj)) {
        timer = timer.next;
    }
    if (!timer)
        throw new Error('end_burn: lit object has no burn timer');
    preflightTimerCleanup(timer, state, normalized);
    return { mode: 'timer', normalized };
}

// C ref: timeout.c end_burn().  Returns whether a lit source was stopped.
export function end_burn(obj, timerAttached = true, env = {}) {
    const plan = preflight_end_burn(obj, timerAttached, env);
    if (plan.mode === 'none') return false;
    if (plan.mode === 'direct') {
        plan.deleteLight(obj, plan.normalized);
        obj.lamplit = false;
        runBurnInventoryRefresh(
            plan.updateInventory,
            plan.normalized.state,
        );
        return true;
    }
    stop_timer(BURN_OBJECT, obj, plan.normalized.state, plan.normalized);
    return true;
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

// C ref: timeout.c mon_is_local(). A monster is local to the level it stands
// on; one waiting on gm.migrating_mons or gm.mydogs belongs to no level and
// travels with the global save instead.
//
// light.c defines a *different* mon_is_local, the macro `(mon)->mx > 0` at
// light.c:373. The two agree for every monster this port creates, because
// dog.c relmon() zeroes mx as it moves a monster onto either list, but they
// are separate source definitions and js/light.js keeps its own.
export function mon_is_local(monster, state = game) {
    for (let mtmp = state.gm?.migrating_mons; mtmp; mtmp = mtmp.nmon)
        if (mtmp === monster) return false;
    for (let mtmp = state.gm?.mydogs; mtmp; mtmp = mtmp.nmon)
        if (mtmp === monster) return false;
    return true;
}

// C ref: timeout.c obj_is_local().
export function obj_is_local(obj, state = game) {
    switch (obj.where) {
    case OBJ_INVENT:
    case OBJ_MIGRATING:
        return false;
    case OBJ_FLOOR:
    case OBJ_BURIED:
        return true;
    case OBJ_CONTAINED:
        return obj_is_local(obj.ocontainer, state);
    case OBJ_MINVENT:
        return mon_is_local(obj.ocarry, state);
    default:
        throw new Error(`obj_is_local: object where=${obj.where}`);
    }
}

// C ref: timeout.c timer_is_local().
function timer_is_local(timer, state) {
    switch (timer.kind) {
    case TIMER_LEVEL:
        return true;
    case TIMER_GLOBAL:
        return false;
    case TIMER_OBJECT:
        return obj_is_local(timer.arg, state);
    case TIMER_MONSTER:
        return mon_is_local(timer.arg, state);
    default:
        throw new Error(`timer_is_local: timer kind ${timer.kind}`);
    }
}

// C ref: timeout.c save_timers(), its release_data() half alone. The port
// writes no level file, so the surviving obligation is that a level's timers
// leave the queue with the level; a rotting corpse left on D:1 must not still
// be scheduled once the hero stands on D:2.
//
// `range` is RANGE_LEVEL or RANGE_GLOBAL exactly as in C, and the retained
// timers are the ones whose locality disagrees with the range being released.
export function save_timers(range, state = game) {
    timerGlobals(state);
    let previous = null;
    let current = state.gt.timer_base;
    while (current) {
        const next = current.next;
        if ((range === RANGE_LEVEL) === timer_is_local(current, state)) {
            if (previous) previous.next = next;
            else state.gt.timer_base = next;
            current.next = null;
        } else {
            previous = current;
        }
        current = next;
    }
}

// C ref: timeout.c run_timers() (2216-2240). "Pick off timeout elements from
// the global queue and call their functions. Do this until their time is less
// than or equal to the move count." nh_timeout() runs it as its last statement
// and do.c goto_level() runs it once migrating monsters and objects have
// arrived.
//
// The queue is ordered, so C always takes the head and stops at the first
// element still in the future. Three orderings inside the loop are what make
// an element fire exactly once, and all three are C's:
//
// - the head is unlinked before the call, so a function that schedules a new
//   timer cannot be handed the element it is already running;
// - a TIMER_OBJECT's `timed` count is decremented before the call, which is
//   what lets obfree() and dealloc_obj() free a corpse without demanding that
//   its timer be stopped first;
// - the element is released after the call. C memsets and frees it; the port
//   drops the last reference and clears the link the same way stop_timer()
//   and save_timers() above do.
//
// The refusal is decided over the whole due prefix before the loop starts, so
// a turn the port cannot finish leaves the queue untouched.
export function run_timers(state = game, env = {}) {
    timerGlobals(state);
    const fireEnv = timerFireEnv(state, env);
    const reason = unportedDueTimerReason(state, fireEnv);
    if (reason) {
        throw new UnsupportedHeroTimeoutBoundaryError(
            reason, env.site ?? 'run_timers()',
        );
    }

    while (state.gt.timer_base
           && Math.trunc(state.gt.timer_base.timeout) <= currentMove(state)) {
        const curr = state.gt.timer_base;
        state.gt.timer_base = curr.next;

        if (curr.kind === TIMER_OBJECT)
            curr.arg.timed = Math.trunc(curr.arg.timed ?? 0) - 1;
        timeout_funcs[curr.func_index].f(curr.arg, curr.timeout, fireEnv);
        curr.next = null;
    }
}

// C ref: timeout.c begin_burn(). age is fuel remaining before this segment;
// after scheduling it stores the fuel remaining when the segment expires.
export function begin_burn(obj, alreadyLit = false, env = {}) {
    const state = env.state ?? game;
    const normalized = { ...env, state, hooks: env.hooks ?? {} };
    const isCandle = obj?.otyp === TALLOW_CANDLE || obj?.otyp === WAX_CANDLE;
    const isLamp = obj?.otyp === BRASS_LANTERN || obj?.otyp === OIL_LAMP;
    const isCandelabrum = obj?.otyp === CANDELABRUM_OF_INVOCATION;
    const isMagicLamp = obj?.otyp === MAGIC_LAMP;
    const isOilPotion = obj?.otyp === POT_OIL;
    if (!isCandle && !isLamp && !isCandelabrum
        && !isMagicLamp && !isOilPotion) {
        throw new UnsupportedBurnObjectError(obj);
    }

    const age = Math.trunc(obj.age ?? 0);
    if (age === 0 && !isMagicLamp) return;
    if (age < 0)
        throw new RangeError(`begin_burn: invalid candle age ${obj.age}`);

    let turns = 0;
    let radius = 3;
    let usesTimer = true;
    if (isMagicLamp) {
        usesTimer = false;
    } else if (isOilPotion) {
        turns = obj.odiluted
            ? Math.trunc((3 * age + 2) / 4)
            : age;
        radius = 1;
    } else if (isLamp) {
        if (age > 150) turns = age - 150;
        else if (age > 100) turns = age - 100;
        else if (age > 50) turns = age - 50;
        else if (age > 25) turns = age - 25;
        else turns = age;
    } else if (isCandle || isCandelabrum) {
        if (age > 75) turns = age - 75;
        else if (age > 15) turns = age - 15;
        else turns = age;
        radius = candle_light_range(obj);
    }
    let updateInventory = null;
    let position = null;

    // C cannot fail at these linked subsystem boundaries. The JS port can
    // have an integration hook or light owner missing, so resolve both before
    // start_timer() claims ownership and adjusts the candle's remaining fuel.
    if (!alreadyLit) {
        updateInventory = preflightBurnInventoryRefresh(
            obj,
            state,
            normalized,
        );
        position = get_obj_location(
            obj,
            CONTAINED_TOO | BURIED_TOO,
            state,
        );
        if (!position)
            throw new Error("begin_burn: can't get object position");
        if (!state.gl || !Object.hasOwn(state.gl, 'light_base'))
            throw new Error('light sources require light_globals_init()');
    }

    if (usesTimer) {
        if (start_timer(turns, TIMER_OBJECT, BURN_OBJECT, obj, state)) {
            obj.lamplit = true;
            obj.age = age - turns;
            runBurnInventoryRefresh(updateInventory, state);
        } else {
            obj.lamplit = false;
        }
    } else {
        obj.lamplit = true;
        runBurnInventoryRefresh(updateInventory, state);
    }

    if (obj.lamplit && !alreadyLit) {
        new_light_source(
            position.x,
            position.y,
            radius,
            LS_OBJECT,
            obj,
            state,
        );
    }
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

// C ref: timeout.c fall_asleep() (950-974). Puts the hero out for `how_long`
// turns, which every caller passes as a negative count because that is what
// hack.c nomul() reads as "immobile until the count reaches zero".
//
// Three orderings inside these five statements are load-bearing, and none of
// them shows in a session where nothing is occupying the hero:
//
// - stop_occupation() runs first and calls nomul(0) itself. nomul()'s
//   `if (multi < nval) return;` guard would otherwise silently drop that
//   inner call, leaving the interrupted occupation's bookkeeping half done.
// - gm.multi_reason is written after nomul(), because nomul() clears the
//   reason when its argument is 0 -- which is exactly the call
//   stop_occupation() just made.
// - u.usleep is written after nomul() too, because nomul() zeroes it. This is
//   what trap.c unconscious() reads, so writing it first would leave the
//   sleeping hero registering as awake and eat.c gethungry() would burn
//   nutrition at the waking rate for every turn of the sleep.
//
// C's `#if 0` block between nomul() and u.usleep is disabled deafness
// bookkeeping its own comment calls broken, so nothing of it is ported.
//
// `env` carries stop_occupation()'s message() and statusRefresh(), which it
// needs only when an occupation is actually running.
export async function fall_asleep(how_long, wakeup_msg, state = game,
                                  env = {}) {
    await stop_occupation(state, env);
    nomul(how_long, state);
    state.multi_reason = 'sleeping';
    /* early wakeup from combat won't be possible until next monster turn */
    state.u.usleep = state.moves;
    state.nomovemsg = wakeup_msg ? 'You wake up.' : You_can_move_again;
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
