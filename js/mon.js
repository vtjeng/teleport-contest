// mon.js -- Runtime monster turn and inventory state.
// C refs: mon.c movemon(), mcalcmove(), curr_mon_load(), max_mon_load();
// mthrowu.c m_carrying().

import {
    MAX_CARR_CAP,
    MFAST,
    MSLOW,
    NORMAL_SPEED,
    WT_HUMAN,
} from './const.js';
import { game } from './gstate.js';
import { any_light_source } from './light.js';
import { dmonsfree } from './makemon_create.js';
import { strongmonst, throws_rocks } from './mondata.js';
import { MZ_MEDIUM } from './monsters.js';
import { clear_splitobjs } from './obj.js';
import { BOULDER } from './objects.js';
import { rn2 } from './rng.js';

function monsterTurnEnv(env = {}) {
    const state = env.state ?? game;
    const moveSingleMonster = env.moveSingleMonster;
    const clearBypasses = env.clearBypasses;
    const deferredGoto = env.deferredGoto;
    if (typeof moveSingleMonster !== 'function')
        throw new TypeError('movemon requires a moveSingleMonster operation');
    if (typeof clearBypasses !== 'function')
        throw new TypeError('movemon requires a clearBypasses operation');
    if (typeof deferredGoto !== 'function')
        throw new TypeError('movemon requires a deferredGoto operation');
    return {
        ...env,
        state,
        moveSingleMonster,
        clearBypasses,
        deferredGoto,
    };
}

// C ref: mon.c iter_mons_safe(). Snapshot identities before the first
// callback so deletion and insertion can safely mutate the live monlist.
export async function iter_mons_safe(callback, state = game) {
    if (typeof callback !== 'function')
        throw new TypeError('iter_mons_safe requires a callback');
    const monsters = [];
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        monsters.push(monster);
    }
    for (const monster of monsters) {
        if (await callback(monster)) break;
    }
}

// C ref: mon.c movemon(). moveSingleMonster owns movemon_singlemon(). Its
// Boolean result means "terminate traversal", not "monster moved"; like C, it
// separately maintains state.somebody_can_move for movemon()'s return value.
// The other two required operations own worn.c clear_bypasses() and do.c
// deferred_goto(). They are preflighted together so an unavailable later
// boundary cannot leave a partially processed monster list.
export async function movemon(env = {}) {
    const normalized = monsterTurnEnv(env);
    const { state } = normalized;

    state.somebody_can_move = false;
    await iter_mons_safe(
        (monster) => normalized.moveSingleMonster(monster, normalized),
        state,
    );

    if (any_light_source(state)) state.vision_full_recalc = 1;
    if (state.context?.bypasses)
        await normalized.clearBypasses(normalized);
    clear_splitobjs(state);
    dmonsfree(state);

    if (state.u?.utotype) {
        await normalized.deferredGoto(normalized);
        state.somebody_can_move = false;
    }
    return state.somebody_can_move;
}

// C ref: mthrowu.c m_carrying(). The hero-form case is retained because
// source callers can pass &youmonst even though ordinary movement passes a
// level monster.
export function m_carrying(monster, type, state = game) {
    const inventory = monster === state.youmonst
        ? state.invent
        : monster.minvent;
    for (let obj = inventory; obj; obj = obj.nobj) {
        if (obj.otyp === type) return obj;
    }
    return null;
}

// C ref: mon.c curr_mon_load(). Boulder throwers' boulders do not contribute
// to their current load, matching their unlimited-boulder carrying rule.
export function curr_mon_load(monster) {
    let currentLoad = 0;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.otyp !== BOULDER || !throws_rocks(monster.data))
            currentLoad += obj.owt;
    }
    return currentLoad;
}

// C ref: mon.c max_mon_load(). MZ_HUMAN is the source alias for MZ_MEDIUM.
// All operands are nonnegative, so Math.trunc reproduces C integer division.
export function max_mon_load(monster) {
    const species = monster.data;
    const strong = strongmonst(species);
    let maxLoad;

    if (!species.cwt) {
        maxLoad = Math.trunc(
            MAX_CARR_CAP * species.msize / MZ_MEDIUM,
        );
    } else if (!strong || (strong && species.cwt > WT_HUMAN)) {
        maxLoad = Math.trunc(MAX_CARR_CAP * species.cwt / WT_HUMAN);
    } else {
        maxLoad = MAX_CARR_CAP;
    }

    if (!strong) maxLoad = Math.trunc(maxLoad / 2);
    return Math.max(maxLoad, 1);
}

// C ref: mon.c mcalcmove(). Adjust a monster's base speed, then randomly
// round a moving monster to a multiple of NORMAL_SPEED. The rounding draw is
// unconditional, including when the adjusted speed already has no remainder.
export function mcalcmove(
    monster,
    monsterMoving,
    state = game,
    random = rn2,
) {
    let movement = monster.data.mmove;

    if (monster.mspeed === MSLOW) {
        movement = movement < NORMAL_SPEED
            ? Math.trunc((2 * movement + 1) / 3)
            : 4 + Math.trunc(movement / 3);
    } else if (monster.mspeed === MFAST) {
        movement = Math.trunc((4 * movement + 2) / 3);
    }

    if (monster === state.u?.usteed && state.u.ugallop
        && state.context?.mv) {
        movement = Math.trunc((random(2) ? 4 : 5) * movement / 3);
    }

    if (monsterMoving) {
        const adjustment = movement % NORMAL_SPEED;
        movement -= adjustment;
        if (random(NORMAL_SPEED) < adjustment)
            movement += NORMAL_SPEED;
    }
    return movement;
}
