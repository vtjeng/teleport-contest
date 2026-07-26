// Standard monster action phases around m_move().
// C ref: monmove.c dochug(), ordinary-monster path.

import {
    CONFLICT,
    HALLUC,
    HALLUC_RES,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOTHING,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    P_PICK_AXE,
    STRAT_ARRIVE,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
} from './const.js';
import { newsym } from './display.js';
import { wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import { attacktype, is_wanderer } from './mondata.js';
import { AT_WEAP } from './monsters.js';
import {
    distfleeck,
    disturb,
    set_apparxy,
} from './monmove.js';
import { objectType } from './obj.js';
import { TOOL_CLASS, WEAPON_CLASS } from './objects.js';
import { rn2 } from './rng.js';

function activeProperty(state, property, blockedMatters = true) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && (!blockedMatters || !value?.blocked);
}

function requiredOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`dochug requires a ${name} operation`);
    return operation;
}

// C ref: monmove.c dochug(), pre-move AT_WEAP gate. Weapon selection and
// wield state remain owned by weapon.js through the injected operation.
export async function wield_pre_move_weapon(monster, range, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if ((monster.mpeaceful && !activeProperty(state, CONFLICT, false))
        || !range.inrange
        || dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) > 8
        || !attacktype(monster.data, AT_WEAP)) {
        return false;
    }

    const current = monster.mw;
    const currentIsPick = current
        && (current.oclass === WEAPON_CLASS
            || current.oclass === TOOL_CLASS)
        && objectType(current, state).oc_skill === P_PICK_AXE;
    if ((range.scared && currentIsPick)
        || monster.weapon_check !== NEED_WEAPON) {
        return false;
    }
    if (monster.mtrapped && !range.nearby) {
        const selectRangedWeapon = requiredOperation(
            rawEnv,
            'selectRangedWeapon',
        );
        if (await selectRangedWeapon(monster, rawEnv)) return false;
    }

    monster.weapon_check = NEED_HTH_WEAPON;
    const wieldMonsterItem = requiredOperation(rawEnv, 'wieldMonsterItem');
    return Boolean(await wieldMonsterItem(monster, rawEnv));
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
    const wieldPreMoveWeapon = rawEnv.wieldPreMoveWeapon
        ?? wield_pre_move_weapon;
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
    if (await wieldPreMoveWeapon(monster, range, env)) return 0;

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
