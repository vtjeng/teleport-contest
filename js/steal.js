// Monster pickup and theft transfer primitives.
// C ref: src/steal.c mpickobj().

import {
    BLINDED,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
} from './const.js';
import { game } from './gstate.js';
import {
    add_to_minv,
    carry_obj_effects,
    count_unpaid,
    preflight_carry_obj_effects,
} from './invent.js';
import { obj_sheds_light } from './light.js';
import { attacktype, dead_species } from './mondata.js';
import { AT_ENGL } from './monsters.js';
import { unknow_object } from './obj.js';
import { canSeeMonster as canSeeMonsterOnMap } from './startup_a11y.js';
import { attach_fig_transform_timeout } from './timeout.js';

export class UnsupportedMonsterPickupOperationError extends Error {
    constructor(operation, obj = null) {
        super(`monster pickup requires ${operation}`);
        this.name = 'UnsupportedMonsterPickupOperationError';
        this.operation = operation;
        this.object = obj;
    }
}

function pickupEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const hooks = {
        isDeadSpecies: (species, includeGone, env) =>
            dead_species(species, includeGone, env),
        attachFigurineTimer: (obj, env) =>
            attach_fig_transform_timeout(obj, env),
        ...(rawEnv.hooks ?? {}),
    };
    const suppliedVisibility = rawEnv.canSeeMonster
        ?? hooks.canSeeMonster;
    const canSeeMonster = suppliedVisibility
        ? (monster, env) => suppliedVisibility(monster, env)
        : (monster) => canSeeMonsterOnMap(monster, state);
    return { ...rawEnv, state, hooks, canSeeMonster };
}

function requiredPickupOperation(env, operation, obj) {
    const callback = env.hooks?.[operation];
    if (typeof callback !== 'function') {
        throw new UnsupportedMonsterPickupOperationError(operation, obj);
    }
    return callback;
}

function heroIsBlind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    return Boolean((blinded?.intrinsic || blinded?.extrinsic)
        && !blinded?.blocked);
}

function reportImpossible(env, message, monster, obj) {
    if (typeof env.hooks?.impossible === 'function')
        env.hooks.impossible(message, monster, obj, env);
}

// Resolve every missing JavaScript subsystem boundary before a caller unlinks
// the object from the floor. Pure source predicates may run here; all state
// changes and output remain in mpickobj() order.
export function preflight_mpickobj(monster, obj, rawEnv = {}) {
    const env = pickupEnv(rawEnv);
    if (!obj) return { env, monster, obj, outcome: 'missing' };
    if (obj === env.state.uball || obj === env.state.uchain)
        return { env, monster, obj, outcome: 'attached' };

    const billed = Boolean(obj.unpaid) || count_unpaid(obj.cobj) > 0;
    const findObjectOwner = billed
        ? requiredPickupOperation(env, 'findObjectOwner', obj)
        : null;
    const subFromBill = billed
        ? requiredPickupOperation(env, 'subFromBill', obj)
        : null;

    const snuff = obj_sheds_light(obj)
        && attacktype(monster?.data, AT_ENGL);
    const snuffLightSource = snuff
        ? requiredPickupOperation(env, 'snuffLightSource', obj)
        : null;
    const reportObjectGoesOut = snuff
        && env.state.u?.uswallow
        && env.state.u?.ustuck === monster
        && !heroIsBlind(env.state)
        ? requiredPickupOperation(env, 'reportObjectGoesOut', obj)
        : null;

    const canSeeMonster = monster?.mtame
        ? null
        : env.canSeeMonster;
    if (!monster?.mtame && typeof canSeeMonster !== 'function') {
        throw new UnsupportedMonsterPickupOperationError(
            'canSeeMonster',
            obj,
        );
    }

    const carryEffects = preflight_carry_obj_effects(obj, env);
    return {
        env,
        monster,
        obj,
        outcome: 'pickup',
        billed,
        findObjectOwner,
        subFromBill,
        snuff,
        snuffLightSource,
        reportObjectGoesOut,
        canSeeMonster,
        carryEffects,
    };
}

function checkedPickupPlan(monster, obj, rawEnv, prepared) {
    const plan = prepared ?? preflight_mpickobj(monster, obj, rawEnv);
    if (plan.monster !== monster || plan.obj !== obj) {
        throw new TypeError(
            'mpickobj preflight plan belongs to another monster or object',
        );
    }
    return plan;
}

// Returns true when add_to_minv() merged and freed obj, false when obj itself
// became the monster's inventory head. The missing-object case follows C's
// "already freed" return value.
export function mpickobj(monster, obj, rawEnv = {}, prepared = null) {
    const plan = checkedPickupPlan(monster, obj, rawEnv, prepared);
    const { env } = plan;
    if (plan.outcome === 'missing') {
        reportImpossible(
            env,
            'monster taking or picking up nothing',
            monster,
            obj,
        );
        return true;
    }
    if (plan.outcome === 'attached') {
        reportImpossible(
            env,
            'monster taking or picking up attached punishment object',
            monster,
            obj,
        );
        return false;
    }

    if (env.state.gt?.thrownobj === obj) {
        env.state.gt.thrownobj = null;
    } else if (env.state.gk?.kickedobj === obj) {
        env.state.gk.kickedobj = null;
    }

    if (plan.billed) {
        const owner = plan.findObjectOwner(obj, obj.ox, obj.oy, env);
        plan.subFromBill(obj, owner, env);
    }

    if (plan.reportObjectGoesOut)
        plan.reportObjectGoesOut(obj, env);

    obj.no_charge = false;
    if (!monster.mtame) {
        if (!plan.canSeeMonster(monster, env)
            && monster !== env.state.u?.ustuck) {
            unknow_object(obj, env.state);
        }
        if (obj.how_lost === LOST_THROWN)
            obj.how_lost = LOST_STOLEN;
        else if (obj.how_lost === LOST_DROPPED)
            obj.how_lost = LOST_NONE;
    }

    carry_obj_effects(obj, env, plan.carryEffects);
    const freed = add_to_minv(monster, obj, env);
    if (plan.snuff)
        plan.snuffLightSource(monster.mx, monster.my, env);
    return freed;
}
