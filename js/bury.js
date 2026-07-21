// Object burial primitives.
// C refs: src/dig.c bury_an_obj(); src/zap.c obj_resists().

import {
    OBJ_BURIED,
    OBJ_FREE,
    OBJ_FLOOR,
    ROT_ORGANIC,
    TIMER_OBJECT,
    TT_BURIEDBALL,
    W_BALL,
    W_CHAIN,
} from './const.js';
import { game } from './gstate.js';
import {
    add_to_buried,
    obfree,
    preflight_obfree,
    preflight_update_inventory,
    update_inventory,
} from './invent.js';
import { is_rider } from './mondata.js';
import { objectType, remove_object } from './obj.js';
import {
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    BOULDER,
    CANDELABRUM_OF_INVOCATION,
    CORPSE,
    LEASH,
    POTION_CLASS,
    POT_OIL,
    ROCK,
    SPE_BOOK_OF_THE_DEAD,
    WOOD,
} from './objects.js';
import { rn1, rn2, rnd } from './rng.js';
import { is_ice } from './terrain.js';
import {
    end_burn,
    preflight_end_burn,
    start_timer,
} from './timeout.js';

const SOURCE_RANDOM = Object.freeze({ rn1, rn2, rnd });

export class UnsupportedBurialError extends Error {
    constructor(operation, obj) {
        super(`bury_an_obj requires ${operation} for otyp ${obj?.otyp}`);
        this.name = 'UnsupportedBurialError';
        this.operation = operation;
        this.otyp = obj?.otyp;
    }
}

function burialEnvironment(rawEnv = {}, randomNames = ['rn2']) {
    const random = rawEnv.random ?? SOURCE_RANDOM;
    for (const name of randomNames) {
        if (typeof random[name] !== 'function')
            throw new TypeError(`burial random injection requires ${name}()`);
    }
    return {
        ...rawEnv,
        state: rawEnv.state ?? game,
        random,
    };
}

function protectedObject(obj, state) {
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING) {
        return true;
    }
    if (obj.otyp !== CORPSE) return false;
    const monster = state.mons?.[obj.corpsenm];
    if (!monster) {
        throw new Error(
            `obj_resists requires monster ${obj.corpsenm} for a corpse`,
        );
    }
    return is_rider(monster);
}

// zap.c obj_resists() deliberately calls rn2(100) for ordinary objects even
// when both percentages are zero. Protected objects return before that draw.
export function obj_resists(
    obj,
    ordinaryChance,
    artifactChance,
    rawEnv = {},
) {
    const env = burialEnvironment(rawEnv);
    if (!obj || typeof obj !== 'object')
        throw new TypeError('obj_resists requires an object');
    if (!Number.isInteger(ordinaryChance)
        || !Number.isInteger(artifactChance)) {
        throw new TypeError('obj_resists chances must be integers');
    }
    if (protectedObject(obj, env.state)) return true;
    const chance = obj.oartifact ? artifactChance : ordinaryChance;
    return env.random.rn2(100) < chance;
}

function validateBuriedChain(state) {
    if (!state.level
        || !Object.hasOwn(state.level, 'buriedobjlist')) {
        throw new Error('burial requires initialized level state');
    }
    const seen = new Set();
    for (let current = state.level.buriedobjlist;
        current;
        current = current.nobj) {
        if (typeof current !== 'object' || seen.has(current))
            throw new Error('buried object chain is corrupt');
        seen.add(current);
        if (current.where !== OBJ_BURIED || current.nexthere)
            throw new Error('buried object chain has invalid ownership');
    }
}

function requireTimerQueue(state) {
    if (!state.gt || !Object.hasOwn(state.gt, 'timer_base')
        || !state.svt || !Number.isInteger(state.svt.timer_id)
        || state.svt.timer_id < 1) {
        throw new Error('burial timers require timeout_globals_init()');
    }
}

function isOrganic(obj, state) {
    return objectType(obj, state).oc_material <= WOOD;
}

function punishedObject(state, name) {
    return state[name] ?? state.go?.[name] ?? null;
}

function clearPunishedObject(state, name, object) {
    if (state[name] === object) state[name] = null;
    if (state.go?.[name] === object) state.go[name] = null;
}

function requireHook(env, name, obj) {
    const hook = env.hooks?.[name];
    if (typeof hook !== 'function')
        throw new UnsupportedBurialError(name, obj);
    return hook;
}

function buriedBallMessage(env, ball) {
    const hook = env.hooks?.plineThe;
    if (typeof hook === 'function') return hook;
    if (typeof env.state.nhDisplay?.putstr_message === 'function') {
        return () => env.state.nhDisplay.putstr_message(
            'The iron ball gets buried!',
        );
    }
    throw new UnsupportedBurialError('pline_The', ball);
}

function preflightUnpunish(state, env) {
    const chain = punishedObject(state, 'uchain');
    if (!chain) return null;
    if (chain.where !== OBJ_FLOOR && chain.where !== OBJ_FREE) {
        throw new UnsupportedBurialError('a floor or free iron chain', chain);
    }
    // setworn(NULL, W_CHAIN) runs before delobj(), so validate obfree() using
    // the ownership mask it will see at its own source boundary.
    preflight_obfree({ ...chain, owornmask: chain.owornmask & ~W_CHAIN }, null, env);
    if (chain.where === OBJ_FLOOR) {
        requireHook(env, 'maybeUnhideAt', chain);
        requireHook(env, 'newsym', chain);
    }
    return chain;
}

// C ref: apply.c o_unleash().
function preflightUnleash(obj, env) {
    if (obj.otyp !== LEASH || !obj.leashmon) return;
    preflight_update_inventory(env);
}

function o_unleash(obj, env) {
    for (let monster = env.state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.m_id === obj.leashmon) {
            monster.mleashed = false;
            break;
        }
    }
    obj.leashmon = 0;
    update_inventory(env);
}

// C ref: read.c unpunish() -> invent.c delobj_core(). Punishment chains have
// no object properties, so clearing their worn mask directly is the
// source-equivalent setworn effect.
function unpunish(chain, ball, env) {
    const { state } = env;
    if (chain) {
        chain.owornmask &= ~W_CHAIN;
        clearPunishedObject(state, 'uchain', chain);
        const { ox, oy } = chain;
        const onFloor = chain.where === OBJ_FLOOR;
        // delobj_core() calls obj_resists(chain, 0, 0) even though an iron
        // chain cannot resist.  Preserve that visible rn2(100) boundary.
        if (!obj_resists(chain, 0, 0, env)) {
            if (onFloor) remove_object(chain, env);
            if (onFloor) {
                env.hooks.maybeUnhideAt(ox, oy, env);
                env.hooks.newsym(ox, oy, env);
            }
            obfree(chain, null, env);
        }
    }
    ball.owornmask &= ~W_BALL;
    clearPunishedObject(state, 'uball', ball);
}

// C ref: trap.c set_utrap().
function setBuriedBallTrap(turns, env) {
    const { state } = env;
    if (!state.u || !Number.isInteger(turns) || turns <= 0)
        throw new Error('buried-ball trap requires initialized hero state');
    if (Boolean(state.u.utrap) !== Boolean(turns)) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    state.u.utrap = turns;
    state.u.utraptype = TT_BURIEDBALL;
    env.hooks.floatVsFlight(env);
}

// The returned next pointer and deallocation flag are the C return value and
// out-parameter.  Boulder extraction delegates its visibility update to the
// same recalcBlockPoint lifecycle owner used by remove_object().
export function bury_an_obj(obj, rawEnv = {}) {
    const env = burialEnvironment(rawEnv);
    const { random, state } = env;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('bury_an_obj requires an object');
    if (obj.where !== OBJ_FLOOR) {
        throw new UnsupportedBurialError('a floor object', obj);
    }
    validateBuriedChain(state);

    const isPunishmentBall = obj === punishedObject(state, 'uball');
    const punishmentChain = isPunishmentBall
        ? preflightUnpunish(state, env)
        : null;
    const plineThe = isPunishmentBall ? buriedBallMessage(env, obj) : null;
    if (isPunishmentBall) {
        burialEnvironment(rawEnv, ['rn1', 'rn2']);
        if (!state.u)
            throw new Error('buried-ball trap requires initialized hero state');
        requireHook(env, 'floatVsFlight', obj);
    }

    if (isPunishmentBall) {
        unpunish(punishmentChain, obj, env);
        setBuriedBallTrap(random.rn1(50, 20), env);
        plineThe('iron ball gets buried!', env);
    }

    const next = obj.nexthere;
    if (obj === punishedObject(state, 'uchain')
        || obj_resists(obj, 0, 0, env)) {
        return { next, deallocated: false };
    }

    // Everything below the zero-percent resistance check is unreachable for
    // Riders and invocation objects. Preserve that source boundary before
    // requiring later lifecycle owners or their operation-specific RNG.
    preflightUnleash(obj, env);
    if (obj.lamplit && obj.otyp !== POT_OIL)
        preflight_end_burn(obj, true, env);

    const underIce = is_ice(obj.ox, obj.oy, state);
    const deallocates = (obj.otyp === ROCK && !underIce)
        || obj.otyp === BOULDER;
    if (obj.otyp === BOULDER)
        requireHook(env, 'recalcBlockPoint', obj);
    if (deallocates) preflight_obfree(obj, null, env);

    const startsOrganicTimer = obj.otyp !== CORPSE
        && (underIce ? obj.oclass === POTION_CLASS : isOrganic(obj, state));
    if (startsOrganicTimer) burialEnvironment(rawEnv, ['rn2', 'rnd']);
    if (startsOrganicTimer || (obj.timed && obj.on_ice))
        requireTimerQueue(state);

    if (obj.otyp === LEASH && obj.leashmon !== 0) o_unleash(obj, env);
    if (obj.lamplit && obj.otyp !== POT_OIL) end_burn(obj, true, env);

    remove_object(obj, env);

    if (deallocates) {
        obfree(obj, null, env);
        return { next, deallocated: true };
    }

    if (startsOrganicTimer && !obj_resists(obj, 5, 95, env)) {
        const delay = (underIce ? 0 : 250) + random.rnd(250);
        start_timer(delay, TIMER_OBJECT, ROT_ORGANIC, obj, state);
    }
    add_to_buried(obj, env);
    return { next, deallocated: false };
}
