// Object burial primitives.
// C refs: src/dig.c bury_an_obj(); src/zap.c obj_resists().

import {
    OBJ_BURIED,
    OBJ_FLOOR,
    ROT_ORGANIC,
    TIMER_OBJECT,
} from './const.js';
import { game } from './gstate.js';
import { add_to_buried } from './invent.js';
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
import { rn2, rnd } from './rng.js';
import { is_ice } from './terrain.js';
import { start_timer } from './timeout.js';

const SOURCE_RANDOM = Object.freeze({ rn2, rnd });

export class UnsupportedBurialError extends Error {
    constructor(operation, obj) {
        super(`bury_an_obj requires ${operation} for otyp ${obj?.otyp}`);
        this.name = 'UnsupportedBurialError';
        this.operation = operation;
        this.otyp = obj?.otyp;
    }
}

function burialEnvironment(rawEnv = {}) {
    const random = rawEnv.random ?? SOURCE_RANDOM;
    for (const name of ['rn2', 'rnd']) {
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

// The returned next pointer and deallocation flag are the C return value and
// out-parameter. Deallocation of rocks and boulders is intentionally rejected
// until obfree() and its vision side effects have a complete integration.
export function bury_an_obj(obj, rawEnv = {}) {
    const env = burialEnvironment(rawEnv);
    const { random, state } = env;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('bury_an_obj requires an object');
    if (obj.where !== OBJ_FLOOR) {
        throw new UnsupportedBurialError('a floor object', obj);
    }
    validateBuriedChain(state);

    if (obj === punishedObject(state, 'uball'))
        throw new UnsupportedBurialError('buried-ball punishment', obj);

    const next = obj.nexthere;
    if (obj === punishedObject(state, 'uchain')
        || obj_resists(obj, 0, 0, env)) {
        return { next, deallocated: false };
    }

    if (obj.otyp === LEASH && obj.leashmon !== 0)
        throw new UnsupportedBurialError('o_unleash', obj);
    if (obj.lamplit && obj.otyp !== POT_OIL)
        throw new UnsupportedBurialError('end_burn', obj);

    const underIce = is_ice(obj.ox, obj.oy, state);
    if ((obj.otyp === ROCK && !underIce) || obj.otyp === BOULDER)
        throw new UnsupportedBurialError('object deallocation', obj);

    const startsOrganicTimer = obj.otyp !== CORPSE
        && (underIce ? obj.oclass === POTION_CLASS : isOrganic(obj, state));
    if (startsOrganicTimer || (obj.timed && obj.on_ice))
        requireTimerQueue(state);

    remove_object(obj, env);

    if (startsOrganicTimer && !obj_resists(obj, 5, 95, env)) {
        const delay = (underIce ? 0 : 250) + random.rnd(250);
        start_timer(delay, TIMER_OBJECT, ROT_ORGANIC, obj, state);
    }
    add_to_buried(obj, env);
    return { next, deallocated: false };
}
