// Timeout queue primitives.
// C ref: src/timeout.c start_timer(), stop_timer(), peek_timer(), and
// obj_stop_timers().
// Queue primitives take their source-owned state directly. Helpers which
// consume RNG take an `{ state, random }` environment so focused tests can
// verify every draw without replacing the queue representation. stop_timer()
// and obj_stop_timers() also accept cleanup integration through `{ hooks }`.

import {
    ACID_RES,
    A_CON,
    BURN_OBJECT,
    BURIED_TOO,
    BLINDED,
    CONFUSION,
    CONTAINED_TOO,
    DB_ICE,
    DB_UNDER,
    DEAF,
    DETECT_MONSTERS,
    DISPLACED,
    DRAWBRIDGE_UP,
    FIG_TRANSFORM,
    FIRE_RES,
    FOOT,
    FULL_MOON,
    FLYING,
    FROMOUTSIDE,
    FUMBLING,
    FAST,
    FAINTED,
    HATCH_EGG,
    HALLUC,
    HALLUC_RES,
    GLIB,
    ICE,
    INTRINSIC,
    INVIS,
    I_SPECIAL,
    Is_waterlevel,
    isok,
    LEVITATION,
    KILLED_BY,
    KILLED_BY_AN,
    MAGICAL_BREATHING,
    NEUTRAL,
    MAX_EGG_HATCH_TIME,
    NUM_TIME_FUNCS,
    NUM_TIMER_KINDS,
    NO_KILLER_PREFIX,
    LS_OBJECT,
    OBJ_BURIED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MIGRATING,
    OBJ_MINVENT,
    RANGE_LEVEL,
    PASSES_WALLS,
    POISON_RES,
    PROT_FROM_SHAPE_CHANGERS,
    REVIVE_MON,
    ROT_AGE,
    ROT_CORPSE,
    SHRINK_GLOB,
    SLIMED,
    SICK,
    SICK_NONVOMITABLE,
    SLEEP_RES,
    SLEEPY,
    SEE_INVIS,
    STONED,
    STONE_RES,
    STRANGLED,
    STUNNED,
    TAINT_AGE,
    TIMEOUT,
    TIMER_NONE,
    TIMER_GLOBAL,
    TIMER_LEVEL,
    TIMER_MONSTER,
    TIMER_OBJECT,
    TROLL_REVIVE_CHANCE,
    UNCHANGING,
    Upolyd,
    VOMITING,
    WARN_OF_MON,
    WT_NOISY_INV,
    WOUNDED_LEGS,
    WWALKING,
    ZOMBIFY_MON,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { artifact_light } from './artifacts.js';
import { acurr, adjattrib, exercise, stone_luck } from './attrib.js';
import { newsym, see_monsters } from './display.js';
import { hcolor, Monnam } from './do_name.js';
import { toggle_displacement } from './do_wear.js';
import { eating_dangerous_corpse } from './eat.js';
import { find_delayed_killer } from './end.js';
import { rot_corpse, unportedRotCorpseReason } from './dig.js';
import { heal_legs } from './do.js';
import { makeplural } from './fruit.js';
import { carrying, useup } from './invent.js';
import { game } from './gstate.js';
import { inv_weight, You_can_move_again, nomul, spoteffects } from './hack.js';
import {
    incr_itimeout, make_blinded, make_confused, make_deaf, make_glib,
    make_hallucinated, set_itimeout,
} from './potion.js';
import { deferred_decor, encumber_msg } from './pickup.js';
import { stuck_in_wall } from './pray.js';
import { region_danger } from './region.js';
import { the } from './objnam.js';
import {
    candle_light_range,
    get_obj_location,
    new_light_source,
} from './light.js';
import {
    breathless, is_flyer, is_rider, is_were, name_to_mon, type_is_pname,
    zombie_form,
} from './mondata.js';
import { body_part, rehumanize } from './polyself.js';
import { restartcham, wake_nearby } from './mon.js';
import { note_unported } from './unported.js';
import { float_down, unconscious } from './trap.js';
import { find_ac } from './u_init_inventory_attrs.js';
import {
    PM_DEATH,
    PM_ARCHEOLOGIST,
    PM_LICHEN,
    PM_LIZARD,
    S_TROLL,
    G_UNIQ,
    LOW_PM,
    NON_PM,
} from './monsters.js';
import {
    AMULET_OF_STRANGULATION,
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
import {
    remove_object, shrink_glob, unportedShrinkGlobReason,
} from './obj.js';
import {
    createCoreRandom, rn1, rn2, rn2_on_display_rng, rnd, rnz,
} from './rng.js';
import { ttyNorep, ttyPline, ttyUrgentPline } from './tty_message.js';

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
    { name: 'shrink_glob', f: shrinkGlobCallback, unported: unportedShrinkGlobReason },
    { name: 'melt_ice_away' },
];
if (timeout_funcs.length !== NUM_TIME_FUNCS)
    throw new Error('timeout_funcs must cover every timeout_types row');

// C ref: mkobj.c shrink_glob(). Build the full env for the timer callback,
// injecting the extractExternalObject hook for floor-object removal and
// stopObjectTimers for obfree()'s food-class cleanup. obj_stop_timers() is
// already available in this module; remove_object is the owner of the
// OBJ_FLOOR extraction.
function shrinkGlobCallback(arg, timeout, env) {
    const shrinkEnv = {
        ...env,
        hooks: {
            extractExternalObject: remove_object,
            stopObjectTimers: (obj, hookEnv) => {
                obj_stop_timers(obj, hookEnv.state ?? env.state, hookEnv);
            },
            ...env.hooks,
        },
    };
    return shrink_glob(arg, timeout, shrinkEnv);
}

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

function heroPropertyActive(state, propertyIndex) {
    const property = state.u?.uprops?.[propertyIndex];
    return Boolean(property?.intrinsic || property?.extrinsic)
        && !property?.blocked;
}

// C ref: dbridge.c is_ice(). Keep its drawbridge-under-ice arm beside the
// timeout preflight so an expiring Fumbling property is admitted only when the
// plain on-foot branch of slip_or_trip() is certain to run.
function heroIsOnIce(state) {
    const u = state.u ?? {};
    const location = isok(u.ux, u.uy)
        ? state.level?.at?.(u.ux, u.uy)
        : null;
    return location?.typ === ICE
        || (location?.typ === DRAWBRIDGE_UP
            && ((location.flags ?? 0) & DB_UNDER) === DB_ICE);
}

// timeout.c::slip_or_trip() has several source-heavy branches. This span admits
// the four-way plain on-foot switch after a move and the no-move expiry arm,
// whose movement effects are skipped by nh_timeout(); object, ice and mounted
// slip_or_trip calls remain recorded gaps. FROMOUTSIDE is safe on the
// no-move arm because slip_or_trip() is not called, but a moved hero with that
// bit reaches its unported ice branch.
function plainOnFootFumbleAdmitted(state) {
    const u = state.u ?? {};
    const fumbling = u.uprops?.[FUMBLING];
    const fromOutside = Boolean((fumbling?.intrinsic ?? 0) & FROMOUTSIDE);
    return !u.usteed
        && !heroPropertyActive(state, LEVITATION)
        && !heroPropertyActive(state, FLYING)
        && (!u.umoved || !fromOutside)
        && !heroIsOnIce(state)
        && !state.level?.objects?.[u.ux]?.[u.uy];
}

function hallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

function deaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(
        deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf,
    );
}

// C ref: youprop.h Unaware. You_feel() changes its prefix when a negative
// multi-turn state leaves the hero unconscious or fainted.
function unaware(state) {
    return Math.trunc(state.multi ?? 0) < 0
        && (unconscious(state) || state.u?.uhs === FAINTED);
}

// C ref: timeout.c slip_or_trip() (1300-1317), the plain on-foot arm. The
// random choice precedes its message, as in C's switch (rn2(4)).
async function slipOrTripPlainOnFoot(state, random, message) {
    switch (random.rn2(4)) {
    case 1:
        await message(
            `You trip over your own ${hallucinating(state)
                ? 'elbow'
                : makeplural(body_part(FOOT, state.youmonst))}.`,
            state,
        );
        break;
    case 2:
        await message(
            `You slip ${hallucinating(state) ? 'on a banana peel' : 'and nearly fall'}.`,
            state,
        );
        break;
    case 3:
        await message('You flounder.', state);
        break;
    default:
        await message('You stumble.', state);
        break;
    }
}

// Object-timer admission remains owned by run_timers(). Hero clocks and
// property expiry are implemented by nh_timeout below, not by this preflight.
export function preflight_nh_timeout_elapsed_turn(state = game, env = {}) {
    const u = state.u ?? {};
    // timeout.c:621-622 returns for an invulnerable hero, and everything this
    // function validates sits below that return: the mtimedone, ucreamed,
    // usptime and ugallop arms at 641-667, the property countdown at 670-671,
    // and run_timers() at 947, nh_timeout()'s last statement. So none of that
    // state is read on such a turn and none of it needs to be admitted.
    // nh_timeout() makes the same return, in C's position.
    if (u.uinvulnerable) return;
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

// youprop.h: source-only properties do not consult their blocked field.
function propertySource(state, index) {
    const property = state.u?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function Flying(state) {
    return Boolean(propertySource(state, FLYING)
        || (state.u?.usteed && is_flyer(state.u.usteed.data)))
        && !state.u?.uprops?.[FLYING]?.blocked;
}

// These existing callees can draw, prompt, change maps or invoke arbitrary
// callbacks. The elapsed-turn planner stops before nh_timeout reaches one,
// runs this timeout live, then validates the remaining allocation from the
// resulting state. This is an execution handoff, not a refused source path.
export function nh_timeout_requires_live_state(state = game) {
    const u = state.u;
    if (u.uinvulnerable) return false;
    if (u.mtimedone === 1 && !propertySource(state, UNCHANGING)
        && !is_were(state.youmonst.data)) return true;
    for (const index of [
        STONED, SICK, BLINDED, INVIS, SEE_INVIS, HALLUC, LEVITATION,
        FLYING, STRANGLED, DETECT_MONSTERS, DISPLACED, GLIB,
        PROT_FROM_SHAPE_CHANGERS,
    ]) {
        if ((u.uprops?.[index]?.intrinsic & TIMEOUT) === 1) return true;
    }
    return false;
}

// C ref: timeout.c nh_timeout() (669-945). Every expiry follows the common
// decrement and delayed-killer lookup, including properties with no case.
async function decrement_property_timeouts(state, env) {
    const u = state.u;
    const random = env.random ?? { rn2, rnd };
    const message = env.message ?? ttyPline;
    const wasFlying = Flying(state);
    const encumberMessage = (subject) => encumber_msg(subject, { message });
    for (let index = 0; index < (u.uprops?.length ?? 0); ++index) {
        const property = u.uprops[index];
        if ((Math.trunc(property?.intrinsic ?? 0) & TIMEOUT) === 0) continue;
        if ((--property.intrinsic & TIMEOUT) !== 0) continue;
        const killer = find_delayed_killer(index, state);
        switch (index) {
        case STONED:
            state.killer ??= {};
            if (killer?.name) {
                state.killer.format = killer.format;
                state.killer.name = killer.name;
            } else {
                state.killer.format = NO_KILLER_PREFIX;
                state.killer.name = 'killed by petrification';
            }
            if (!env.planning) note_unported('end.c dealloc_killer');
            if (!env.planning) note_unported('timeout.c done_timeout');
            break;
        case SLIMED:
            if (!env.planning) note_unported('timeout.c slimed_to_death');
            break;
        case VOMITING:
            if (!env.planning) note_unported('potion.c make_vomiting');
            break;
        case SICK:
            if (!(u.usick_type & SICK_NONVOMITABLE)
                && random.rn2(100) < acurr(state, A_CON)) {
                await message('You have recovered from your illness.', state);
                if (!env.planning) note_unported('potion.c make_sick');
                await exercise(A_CON, false, state, random, { encumberMessage });
                await adjattrib(A_CON, -1, 1, state, { ...env, encumberMessage });
                break;
            }
            await (env.urgentMessage ?? ttyUrgentPline)(
                'You die from your illness.', state,
            );
            state.killer ??= {};
            if (killer?.name) {
                state.killer.format = killer.format;
                state.killer.name = killer.name;
            } else {
                state.killer.format = KILLED_BY_AN;
                state.killer.name = '';
            }
            if (!env.planning) note_unported('end.c dealloc_killer');
            {
                const speciesIndex = name_to_mon(state.killer.name, { state });
                if (speciesIndex >= LOW_PM) {
                    const species = state.mons[speciesIndex];
                    if (type_is_pname(species)) {
                        state.killer.format = KILLED_BY;
                    } else if (species.geno & G_UNIQ) {
                        state.killer.name = the(state.killer.name, state);
                        state.killer.format = KILLED_BY;
                    }
                }
            }
            if (!env.planning) note_unported('timeout.c done_timeout');
            u.usick_type = 0;
            break;
        case FAST:
            if (!((property.intrinsic & ~INTRINSIC) || property.extrinsic)) {
                await message(
                    `${unaware(state) ? 'You dream that you feel' : 'You feel'} `
                        + `yourself slow down${propertySource(state, FAST) ? ' a bit' : ''}.`,
                    state,
                );
            }
            break;
        case CONFUSION:
            set_itimeout(property, 1);
            await make_confused(0, true, state, env);
            if (!property.intrinsic) await stop_occupation(state, env);
            break;
        case STUNNED:
            set_itimeout(property, 1);
            if (!env.planning) note_unported('potion.c make_stunned');
            if (!property.intrinsic) await stop_occupation(state, env);
            break;
        case BLINDED: {
            const wasBlind = heroPropertyActive(state, BLINDED);
            set_itimeout(property, 1);
            await make_blinded(0, true, state, env);
            if (wasBlind && !heroPropertyActive(state, BLINDED))
                await stop_occupation(state, env);
            break;
        }
        case DEAF:
            set_itimeout(property, 1);
            await make_deaf(0, true, state, env);
            state.disp ??= {};
            state.disp.botl = true;
            if (!deaf(state)) await stop_occupation(state, env);
            break;
        case INVIS:
            (env.newsym ?? newsym)(u.ux, u.uy, state);
            if (!heroPropertyActive(state, INVIS) && !property.blocked
                && !heroPropertyActive(state, BLINDED)) {
                await message(!propertySource(state, SEE_INVIS)
                    ? 'You are no longer invisible.'
                    : 'You can no longer see through yourself.', state);
                await stop_occupation(state, env);
            }
            break;
        case SEE_INVIS:
            if (!env.planning) note_unported('display.c set_mimic_blocking');
            see_monsters(state);
            (env.newsym ?? newsym)(u.ux, u.uy, state);
            await stop_occupation(state, env);
            break;
        case WOUNDED_LEGS:
            await heal_legs(state, env);
            await stop_occupation(state, env);
            break;
        case HALLUC:
            set_itimeout(property, 1);
            await make_hallucinated(0, true, 0, state);
            if (!hallucinating(state)) await stop_occupation(state, env);
            break;
        case SLEEPY:
            if (unconscious(state) || propertySource(state, SLEEP_RES)) {
                incr_itimeout(property, random.rnd(100));
            } else if (propertySource(state, SLEEPY)) {
                await message('You fall asleep.', state);
                const duration = random.rnd(20);
                await fall_asleep(-duration, true, state, env);
                incr_itimeout(property, duration + random.rnd(100));
            }
            break;
        case LEVITATION:
            if ((u.uprops[FLYING].intrinsic & TIMEOUT) === 1)
                set_itimeout(u.uprops[FLYING], 0);
            await float_down(I_SPECIAL | TIMEOUT, 0, state);
            break;
        case FLYING:
            if (wasFlying && !Flying(state)) {
                state.disp ??= {};
                state.disp.botl = true;
                await message('You land.', state);
                await spoteffects(true, state);
            }
            break;
        case ACID_RES:
            if (!propertySource(state, ACID_RES)) {
                if (eating_dangerous_corpse(ACID_RES, state)) {
                    set_itimeout(property, 1);
                    break;
                }
                if (!unaware(state))
                    await message('You no longer feel safe from acid.', state);
            }
            break;
        case STONE_RES:
            if (!propertySource(state, STONE_RES)) {
                if (eating_dangerous_corpse(STONE_RES, state)) {
                    set_itimeout(property, 1);
                    break;
                }
                if (!unaware(state))
                    await message('You no longer feel secure from petrification.', state);
                if (!env.planning) note_unported('do_wear.c wielding_corpse');
                if (!env.planning) note_unported('do_wear.c wielding_corpse');
            }
            break;
        case FIRE_RES:
            if (!propertySource(state, FIRE_RES))
                await message('Your temporary ability to survive burning has ended.', state);
            break;
        case WWALKING:
            if (!(propertySource(state, WWALKING) && !Is_waterlevel(u.uz)))
                await message('Your temporary ability to walk on liquid has ended.', state);
            break;
        case DISPLACED:
            if (!propertySource(state, DISPLACED))
                await toggle_displacement(null, 0, false, state);
            break;
        case WARN_OF_MON:
            if (!propertySource(state, WARN_OF_MON)) {
                const species = state.context.warntype.species;
                state.context.warntype.species = null;
                state.context.warntype.speciesidx = NON_PM;
                if (species)
                    await message(`You are no longer warned about ${makeplural(species.pmnames[NEUTRAL])}.`, state);
            }
            break;
        case PASSES_WALLS:
            if (!propertySource(state, PASSES_WALLS)) {
                if (stuck_in_wall(state)) {
                    await message(
                        `${unaware(state) ? 'You dream that you feel' : 'You feel'} hemmed in again.`,
                        state,
                    );
                } else {
                    await message(`You're back to your ${!Upolyd(u) ? 'normal' : 'unusual'} self again.`, state);
                }
            }
            break;
        case MAGICAL_BREATHING:
            if (!(propertySource(state, MAGICAL_BREATHING)
                    || breathless(state.youmonst.data))
                && region_danger(state)) {
                await message(`You cough${propertySource(state, POISON_RES) ? '.' : ' and spit blood!'}`, state);
            }
            break;
        case STRANGLED:
            state.killer ??= {};
            state.killer.format = KILLED_BY;
            state.killer.name = u.uburied ? 'suffocation' : 'strangulation';
            if (!env.planning) note_unported('timeout.c done_timeout');
            if (state.uamul?.otyp === AMULET_OF_STRANGULATION) {
                await message('Your amulet vanishes!', state);
                useup(state.uamul, { ...env, state });
            }
            break;
        case FUMBLING:
            if (u.umoved && !(heroPropertyActive(state, LEVITATION) || Flying(state))) {
                if (plainOnFootFumbleAdmitted(state))
                    await slipOrTripPlainOnFoot(state, random, message);
                else if (!env.planning)
                    note_unported('timeout.c slip_or_trip');
                nomul(-2, state);
                state.multi_reason = 'fumbling';
                state.nomovemsg = '';
                if (inv_weight(state) > -WT_NOISY_INV) {
                    if (!deaf(state)) await message('You make a lot of noise!', state);
                    await wake_nearby(false, { ...env, state, random, message });
                }
            }
            property.intrinsic &= ~FROMOUTSIDE;
            if (propertySource(state, FUMBLING))
                incr_itimeout(property, random.rnd(20));
            // timeout.c calls deferred_decor(FALSE) after the Fumbling clock
            // has expired.  Planning clones cannot emit the catch-up line;
            // the live timeout owns the source message and clears the flag.
            if (state.iflags?.defer_decor && !env.planning)
                await deferred_decor(false, state);
            break;
        case DETECT_MONSTERS:
            see_monsters(state);
            break;
        case GLIB:
            make_glib(0, state, env);
            break;
        case PROT_FROM_SHAPE_CHANGERS:
            if (!propertySource(state, PROT_FROM_SHAPE_CHANGERS))
                restartcham(state, { ...env, state });
            break;
        }
        if (state.program_state?.gameover) return;
    }
}

// C ref: timeout.c nh_timeout() (588-948), the once-per-turn hero clocks.
// Each skipped discarded-return call records its source owner; no invented
// state or random draw stands in for those unported callees.
export async function nh_timeout(state = game, env = {}) {
    const random = env.random ?? { rn2, rnd };
    const message = env.message ?? ttyPline;
    const u = state.u;
    const displayEnv = {
        ...env,
        displayRandom: env.displayRandom ?? (state === game
            ? rn2_on_display_rng
            : createCoreRandom(state.displayCtx, state).rn2),
    };
    adjust_timeout_luck(state);
    if (u.uinvulnerable) return;
    if (u.uprops?.[STONED]?.intrinsic && !env.planning)
        note_unported('timeout.c stoned_dialogue');
    if (u.uprops?.[SLIMED]?.intrinsic && !env.planning)
        note_unported('timeout.c slime_dialogue');
    if (u.uprops?.[VOMITING]?.intrinsic && !env.planning)
        note_unported('timeout.c vomiting_dialogue');
    if (u.uprops?.[STRANGLED]?.intrinsic && !env.planning)
        note_unported('timeout.c choke_dialogue');
    if (u.uprops?.[SICK]?.intrinsic && !env.planning)
        note_unported('timeout.c sickness_dialogue');
    if ((u.uprops?.[LEVITATION]?.intrinsic & TIMEOUT) && !env.planning)
        note_unported('timeout.c levitation_dialogue');
    if ((u.uprops?.[PASSES_WALLS]?.intrinsic & TIMEOUT) && !env.planning)
        note_unported('timeout.c phaze_dialogue');
    if ((u.uprops?.[MAGICAL_BREATHING]?.intrinsic & TIMEOUT) && !env.planning)
        note_unported('timeout.c region_dialogue');
    if (u.uprops?.[SLEEPY]?.intrinsic & TIMEOUT)
        await sleep_dialogue(state, env);
    if (u.mtimedone && !--u.mtimedone) {
        if (propertySource(state, UNCHANGING))
            u.mtimedone = random.rnd(100 * state.youmonst.data.mlevel + 1);
        else if (is_were(state.youmonst.data)) {
            if (!env.planning) note_unported('were.c you_unwere');
        } else {
            await rehumanize(state);
            if (state.program_state?.gameover) return;
        }
    }
    if (u.ucreamed) --u.ucreamed;
    if (u.usptime && !--u.usptime && u.uspellprot) {
        u.usptime = u.uspmtime;
        --u.uspellprot;
        find_ac(state);
        if (!heroPropertyActive(state, BLINDED))
            await (env.norepMessage ?? ttyNorep)(
                `The ${hcolor('golden', state, displayEnv)} haze around you ${u.uspellprot ? 'becomes less dense' : 'disappears'}.`,
                state,
            );
    }
    if (u.ugallop && !--u.ugallop && u.usteed)
        await message(`${Monnam(u.usteed, state, displayEnv)} stops galloping.`, state);
    await decrement_property_timeouts(state, { ...env, random, message });
    if (state.program_state?.gameover) return;
    await run_timers(state, { ...env, site: "nh_timeout()'s run_timers()" });
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

// C ref: timeout.c spot_time_expires() (2443-2456). Level timers encode their
// map square as `(x << 16) | y`; object timers with the same function index do
// not match.
export function spot_time_expires(x, y, funcIndex, state = game) {
    timerGlobals(state);
    const coordinate = x * 0x10000 + y;
    for (let timer = state.gt.timer_base; timer; timer = timer.next) {
        if (timer.kind === TIMER_LEVEL
            && timer.func_index === funcIndex
            && timer.arg === coordinate) {
            return timer.timeout;
        }
    }
    return 0;
}

// C ref: timeout.c spot_time_left() (2459-2463). An absolute expiration of
// zero is the no-timer sentinel; otherwise C returns the signed difference.
export function spot_time_left(x, y, funcIndex, state = game) {
    const expires = spot_time_expires(x, y, funcIndex, state);
    return expires > 0 ? expires - currentMove(state) : 0;
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
export async function run_timers(state = game, env = {}) {
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
        // shrink_glob() is async (it calls pline for shrink/dissolve messages
        // and encumber_msg for capacity changes). Other callbacks are sync but
        // awaiting a non-thenable is a no-op, so the await is safe for all.
        await timeout_funcs[curr.func_index].f(curr.arg, curr.timeout, fireEnv);
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
