// Object burial primitives.
// C refs: src/dig.c bury_an_obj(); src/zap.c obj_resists().

import {
    OBJ_BURIED,
    ROT_ORGANIC,
    TIMER_OBJECT,
    TT_BURIEDBALL,
} from './const.js';
import { del_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    add_to_buried,
    obfree,
    obj_extract_self,
    stackobj,
} from './invent.js';
import { is_rider } from './mondata.js';
import {
    objectType,
    place_object,
} from './obj.js';
import {
    AMULET_OF_YENDOR,
    BELL_OF_OPENING,
    BOULDER,
    CANDELABRUM_OF_INVOCATION,
    CORPSE,
    HEAVY_IRON_BALL,
    LEASH,
    POTION_CLASS,
    POT_OIL,
    ROCK,
    SPE_BOOK_OF_THE_DEAD,
    WOOD,
} from './objects.js';
import { rn1, rn2, rnd } from './rng.js';

import { unpunish } from './read.js';
import { o_unleash } from './apply.js';
import { objectGenerationEnv } from './object_generation.js';
import { maybe_unhide_at } from './mon.js';
import { newsym } from './display.js';
import { recalc_block_point } from './vision.js';
import { set_utrap } from './trap.js';
import { ttyPline } from './tty_message.js';
import {
    end_burn,
    start_timer,
    stop_timer,
} from './timeout.js';
import {
    is_ice,
} from './dbridge.js';

const SOURCE_RANDOM = Object.freeze({ rn1, rn2, rnd });

export class UnsupportedBurialError extends Error {
    constructor(operation, obj) {
        super(`burial requires ${operation} for otyp ${obj?.otyp}`);
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

function isOrganic(obj, state) {
    return objectType(obj, state).oc_material <= WOOD;
}

function punishedObject(state, name) {
    return state[name] ?? null;
}

// The returned next pointer and deallocation flag are the C return value and
// out-parameter.  Boulder extraction delegates its visibility update to the
// same recalcBlockPoint lifecycle owner used by remove_object().
export async function bury_an_obj(obj, rawEnv = {}) {
    const base = burialEnvironment(rawEnv);
    const { random, state } = base;
    const redraw = base.planning ? (() => {})
        : (base.newsym ?? base.redraw
            ?? (base.hooks?.newsym
                ? ((x, y) => base.hooks.newsym(x, y, base))
                : ((x, y) => newsym(x, y, state))));
    const env = objectGenerationEnv({
        ...base,
        redraw,
        hooks: {
            maybeUnhideAt: (x, y) => maybe_unhide_at(x, y, state, base),
            newsym: (x, y) => redraw(x, y, state),
            recalcBlockPoint: (x, y) => recalc_block_point(x, y, state),
            ...base.hooks,
        },
    });
    if (!obj || typeof obj !== 'object')
        throw new TypeError('bury_an_obj requires an object');
    validateBuriedChain(state);

    if (obj === punishedObject(state, 'uball')) {
        unpunish(state, env);
        set_utrap(random.rn1(50, 20), TT_BURIEDBALL, state);
        if (!env.planning)
            await (env.message ?? ttyPline)('The iron ball gets buried!', state, env);
    }

    const next = obj.nexthere;
    if (obj === punishedObject(state, 'uchain')
        || obj_resists(obj, 0, 0, env)) {
        return { next, deallocated: false };
    }

    if (obj.otyp === LEASH && obj.leashmon !== 0) o_unleash(obj, env);
    if (obj.lamplit && obj.otyp !== POT_OIL) end_burn(obj, true, env);
    obj_extract_self(obj, env);
    const underIce = is_ice(obj.ox, obj.oy, state);
    if ((obj.otyp === ROCK && !underIce) || obj.otyp === BOULDER) {
        obfree(obj, null, env);
        return { next, deallocated: true };
    }

    if (obj.otyp !== CORPSE
        && (underIce ? obj.oclass === POTION_CLASS : isOrganic(obj, state))
        && !obj_resists(obj, 5, 95, env)) {
        const delay = (underIce ? 0 : 250) + random.rnd(250);
        start_timer(delay, TIMER_OBJECT, ROT_ORGANIC, obj, state);
    }
    add_to_buried(obj, env);
    return { next, deallocated: false };
}

// C ref: dig.c unearth_objs(). A pit or hole exposes every buried object at
// its square, cancels organic burial rot, returns each object to both floor
// indexes, and then applies ordinary floor-stack merging.
export function unearth_objs(x, y, rawEnv = {}) {
    const env = {
        ...rawEnv,
        state: rawEnv.state ?? game,
        hooks: rawEnv.hooks ?? {},
    };
    const { state } = env;
    validateBuriedChain(state);

    let buriedBall = null;
    if (!state.u?.utrap || state.u.utraptype === TT_BURIEDBALL) {
        for (let obj = state.level.buriedobjlist; obj; obj = obj.nobj) {
            if (obj.otyp === HEAVY_IRON_BALL
                && obj.ox === x && obj.oy === y) {
                buriedBall = obj;
                break;
            }
        }
    }
    const restorePunishment = buriedBall
        && state.u?.utrap
        && state.u.utraptype === TT_BURIEDBALL
        ? (env.buriedBallToPunishment
            ?? env.hooks.buriedBallToPunishment)
        : null;
    if (buriedBall && state.u?.utrap
        && state.u.utraptype === TT_BURIEDBALL
        && typeof restorePunishment !== 'function') {
        throw new UnsupportedBurialError(
            'buried_ball_to_punishment',
            buriedBall,
        );
    }

    for (let obj = state.level.buriedobjlist, next; obj; obj = next) {
        next = obj.nobj;
        if (obj.ox !== x || obj.oy !== y) continue;
        if (obj === buriedBall && state.u?.utrap
            && state.u.utraptype === TT_BURIEDBALL) {
            restorePunishment(env);
            continue;
        }
        obj_extract_self(obj, env);
        if (obj.timed) stop_timer(ROT_ORGANIC, obj, state, env);
        place_object(obj, x, y, env);
        stackobj(obj, env);
    }
    del_engr_at(x, y, state);
    env.hooks.newsym?.(x, y, env);
}
