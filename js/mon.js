// mon.js -- Runtime monster turn state.
// C ref: mon.c mcalcmove().

import { MFAST, MSLOW, NORMAL_SPEED } from './const.js';
import { game } from './gstate.js';
import { any_light_source } from './light.js';
import { dmonsfree } from './makemon_create.js';
import { clear_splitobjs } from './obj.js';
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
