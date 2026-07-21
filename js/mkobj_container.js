// Random container contents.
// C ref: mkobj.c mkbox_cnts(). obj.js selects mkbox_cnts()'s `n` before
// entering this hook; mksobj() recalculates the container weight afterward.

import {
    REVIVE_MON,
    ROT_CORPSE,
    SHRINK_GLOB,
} from './const.js';
import { level_difficulty } from './dungeon.js';
import { game } from './gstate.js';
import { add_to_container } from './invent.js';
import { is_reviver } from './mondata.js';
import {
    mkobj,
    mksobj,
    obj_no_longer_held,
    rnd_class,
    weight,
} from './obj.js';
import {
    AMULET_CLASS,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    CHEST,
    COIN_CLASS,
    CORPSE,
    DILITHIUM_CRYSTAL,
    FOOD_CLASS,
    GEM_CLASS,
    ICE_BOX,
    LARGE_BOX,
    LOADSTONE,
    OILSKIN_SACK,
    POTION_CLASS,
    RING_CLASS,
    ROCK,
    SACK,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    WAN_CANCELLATION,
    WAN_LIGHT,
    WAN_LIGHTNING,
    WAND_CLASS,
} from './objects.js';
import { rn1, rn2, rnd, rne, rnz } from './rng.js';
import { obj_stop_timers, stop_timer } from './timeout.js';

const BOX_ITEM_PROBABILITIES = Object.freeze([
    [18, GEM_CLASS],
    [15, FOOD_CLASS],
    [18, POTION_CLASS],
    [18, SCROLL_CLASS],
    [12, SPBOOK_CLASS],
    [7, COIN_CLASS],
    [6, WAND_CLASS],
    [5, RING_CLASS],
    [1, AMULET_CLASS],
]);

const POPULATED_CONTAINERS = new Set([
    ICE_BOX,
    CHEST,
    LARGE_BOX,
    SACK,
    OILSKIN_SACK,
    BAG_OF_HOLDING,
]);

function sourceIsReviver(mnum, env) {
    const monster = env.state.mons?.[mnum];
    if (!monster)
        throw new Error('container corpse merging requires a monster catalog');
    return is_reviver(monster);
}

function containerEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn1, rn2, rnd, rne, rnz };
    for (const name of ['rn1', 'rn2', 'rnd', 'rne', 'rnz']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `container random injection requires ${name}`,
            );
        }
    }

    const hooks = { ...(env.hooks ?? {}) };
    hooks.populateContainer ??= populateContainer;
    hooks.objectNoLongerHeld ??= (obj, hookEnv) => {
        obj_no_longer_held(obj, hookEnv);
    };
    hooks.stopObjectTimers ??= (obj, hookEnv) => {
        obj_stop_timers(obj, hookEnv.state, hookEnv);
    };
    hooks.isReviver ??= sourceIsReviver;
    return { ...env, state, random, hooks };
}

function randomBoxObjectClass(random) {
    let probability = random.rnd(100);
    for (const [weight, objectClass] of BOX_ITEM_PROBABILITIES) {
        probability -= weight;
        if (probability <= 0) return objectClass;
    }
    throw new RangeError('mkbox_cnts probabilities did not total 100');
}

function freezeIceBoxCorpse(corpse, env) {
    // Ice-box age is elapsed refrigeration time, not the creation move.
    corpse.age = 0;
    if (!corpse.timed) return;

    // Preserve mkbox_cnts()'s three named stops. In particular, a separate
    // zombification timer is intentionally outside this source list.
    stop_timer(ROT_CORPSE, corpse, env.state, env);
    stop_timer(REVIVE_MON, corpse, env.state, env);
    stop_timer(SHRINK_GLOB, corpse, env.state, env);
}

function adjustOrdinaryBoxItem(item, box, env) {
    const { random, state } = env;
    if (item.oclass === COIN_CLASS) {
        item.quan = random.rnd(level_difficulty(state) + 2)
            * random.rnd(75);
        item.owt = weight(item, env);
    } else {
        while (item.otyp === ROCK) {
            item.otyp = rnd_class(
                DILITHIUM_CRYSTAL,
                LOADSTONE,
                env,
            );
            if (item.quan > 2) item.quan = 1;
            item.owt = weight(item, env);
        }
    }

    if (box.otyp !== BAG_OF_HOLDING) return;
    if (item.otyp === BAG_OF_HOLDING || item.otyp === BAG_OF_TRICKS) {
        item.otyp = SACK;
        item.spe = 0;
        item.owt = weight(item, env);
    } else {
        while (item.otyp === WAN_CANCELLATION) {
            item.otyp = rnd_class(WAN_LIGHT, WAN_LIGHTNING, env);
        }
    }
}

// Hook implementation for obj.js initializeContainer(). `count` is the
// source `rn2(n + 1)` result which obj.js has already consumed.
export function populateContainer(box, count, rawEnv = {}) {
    if (!POPULATED_CONTAINERS.has(box?.otyp)) {
        throw new RangeError(
            `populateContainer: unsupported container ${box?.otyp}`,
        );
    }
    if (!Number.isInteger(count) || count < 0) {
        throw new RangeError(
            `populateContainer: invalid content count ${count}`,
        );
    }
    if (box.cobj) {
        throw new Error('populateContainer requires an empty container');
    }

    const env = containerEnv(rawEnv);
    for (let remaining = count; remaining > 0; --remaining) {
        let item;
        if (box.otyp === ICE_BOX) {
            item = mksobj(CORPSE, true, false, env);
            freezeIceBoxCorpse(item, env);
        } else {
            item = mkobj(randomBoxObjectClass(env.random), false, env);
            adjustOrdinaryBoxItem(item, box, env);
        }
        add_to_container(box, item, env);
    }
}
