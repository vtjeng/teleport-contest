// Standard monster action phases around m_move().
// C ref: monmove.c dochug(), ordinary-monster path.

import {
    HALLUC,
    HALLUC_RES,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    STRAT_ARRIVE,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
} from './const.js';
import { newsym } from './display.js';
import { wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { is_wanderer } from './mondata.js';
import {
    distfleeck,
    disturb,
    set_apparxy,
} from './monmove.js';
import { rn2 } from './rng.js';

function activeProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`dochug requires a ${name} operation`);
    return operation;
}

// Cover the source phases reached by ordinary new-game monsters. Special
// actions and unsupported attacks remain callbacks owned by their subsystems.
export async function dochug_fresh_monster(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const preflightMonster = requiredOperation(rawEnv, 'preflightMonster');
    const usePreMoveItems = requiredOperation(rawEnv, 'usePreMoveItems');
    const moveMonster = requiredOperation(rawEnv, 'moveMonster');
    const attackHero = requiredOperation(rawEnv, 'attackHero');
    const wakeMessage = requiredOperation(rawEnv, 'wakeMessage');
    const monFlee = requiredOperation(rawEnv, 'monFlee');
    const monsterCanSeeHero = requiredOperation(
        rawEnv,
        'monsterCanSeeHero',
    );
    const distanceAndFear = rawEnv.distanceAndFear ?? distfleeck;
    const disturbMonster = rawEnv.disturbMonster ?? disturb;
    const setApparentHero = rawEnv.setApparentHero ?? set_apparxy;
    const wipeEngraving = rawEnv.wipeEngraving ?? wipe_engr_at;
    const redraw = rawEnv.redraw ?? newsym;
    const env = { ...rawEnv, state, random };

    preflightMonster(monster, state);
    monster.mstrategy &= ~STRAT_ARRIVE;
    if ((monster.mstrategy & STRAT_WAITFORU)
        && (monsterCanSeeHero(monster, state)
            || monster.mhp < monster.mhpmax)) {
        monster.mstrategy &= ~STRAT_WAITFORU;
    }
    if (!monster.mcanmove || (monster.mstrategy & STRAT_WAITMASK)) {
        if (activeProperty(state, HALLUC)
            && !activeProperty(state, HALLUC_RES)) {
            redraw(monster.mx, monster.my);
        }
        return 0;
    }
    if (monster.msleeping) {
        if (!await disturbMonster(monster, { ...env, wakeMessage })) {
            if (activeProperty(state, HALLUC)
                && !activeProperty(state, HALLUC_RES)) {
                redraw(monster.mx, monster.my);
            }
            return 0;
        }
    }

    wipeEngraving(monster.mx, monster.my, 1, false, env);
    setApparentHero(monster, env);
    let range = await distanceAndFear(monster, { ...env, monFlee });
    if (await usePreMoveItems(monster, env)) return 1;

    const mayMove = !range.nearby
        || monster.mflee
        || range.scared
        || monster.mconf
        || monster.mstun
        || (monster.minvis && !random.rn2(3))
        || (is_wanderer(monster.data) && !random.rn2(4))
        || (!monster.mcansee && !random.rn2(4))
        || monster.mpeaceful;
    let status = MMOVE_NOTHING;
    if (mayMove) {
        status = await moveMonster(monster, env);
        if (status !== MMOVE_DIED) {
            range = await distanceAndFear(monster, {
                ...env,
                monFlee,
            });
        }
        if (status === MMOVE_DIED) return 1;
        if (status === MMOVE_MOVED) return 0;
    }
    if (status !== MMOVE_DONE && !monster.mpeaceful && range.nearby)
        await attackHero(monster, env);
    return 0;
}
