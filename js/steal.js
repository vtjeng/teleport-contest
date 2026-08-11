// Monster pickup, theft and release transfer primitives.
// C refs: src/steal.c mpickobj(), mdrop_obj() and relobj().

import {
    BLINDED,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
    SHOPBASE,
    W_SADDLE,
} from './const.js';
import { newsym } from './display.js';
import { flooreffects } from './do.js';
import { capitalizedMonsterName } from './do_name.js';
import { droppables } from './dogmove.js';
import { game } from './gstate.js';
import {
    add_to_minv,
    carry_obj_effects,
    count_unpaid,
    preflight_carry_obj_effects,
    stackobj,
} from './invent.js';
import { obj_sheds_light } from './light.js';
import { attacktype, dead_species } from './mondata.js';
import { AT_ENGL } from './monsters.js';
import { place_object, unknow_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { distant_name, donameFresh } from './objnam.js';
import { in_rooms } from './rooms.js';
import { costly_spot } from './shk.js';
import {
    canSeeMonster as canSeeMonsterOnMap,
    messageAt,
} from './startup_a11y.js';
import { attach_fig_transform_timeout } from './timeout.js';
import { ttyPline } from './tty_message.js';
import { cansee } from './vision.js';
import { extract_from_minvent } from './worn.js';

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

function dropEnv(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (typeof rawEnv.unsupported !== 'function') {
        throw new TypeError(
            'monster object release requires an unsupported operation',
        );
    }
    return { ...rawEnv, state };
}

// The one WornEnv hook extract_from_minvent() can ask mdrop_obj() for.
// weapon.c mwepgone() has no port, and nothing in the running game can reach
// it from here: owornmask gains W_WEP only in weapon.c mon_wield_item(), whose
// two callers both stop first, at 'monster wield action' and 'pet weapon
// selection' in js/unported_monster_actions.js. Without this key the W_WEP
// tail would throw worn.js's bare "worn requires mwepgone" Error the first
// time that boundary widens, discarding a segment instead of ending it.
//
// Composed at the call site rather than in dropEnv(), as the stackobj()
// comment below does, so every other call in this function keeps running on
// the caller's own environment.
function extractionEnv(env) {
    return {
        ...env,
        hooks: {
            mwepgone: () => env.unsupported(
                'a monster dropping the weapon it wields',
            ),
            ...(env.hooks ?? {}),
        },
    };
}

// C ref: steal.c mdrop_obj() (812-846). Drop one object taken from a
// (possibly dead) monster's inventory onto the square the monster stands on.
export async function mdrop_obj(mon, obj, verbosely, rawEnv = {}) {
    const env = dropEnv(rawEnv);
    const { state, unsupported } = env;
    const message = env.message ?? ttyPline;
    const omx = mon.mx;
    const omy = mon.my;
    const unwornmask = obj.owornmask;

    // call distant_name() for its possible side-effects even if the result
    // might not be printed, and do it before extracting obj from minvent
    const objName = distant_name(obj, donameFresh, state);

    // C's own arguments: do_extrinsics FALSE so that removing a steed's saddle
    // cannot throw its rider before the object reaches the floor, and silently
    // TRUE for the update_mon_extrinsics() call that FALSE just suppressed.
    // Passing FALSE is what defers the extrinsics to this function's own tail,
    // so no drop can reach extract_from_minvent()'s copy of that call and no
    // test through here can tell `silently` from its opposite.
    // scripts/worn.test.mjs drives both directly instead.
    extract_from_minvent(mon, obj, false, true, extractionEnv(env));
    /* don't charge for an owned saddle on dead steed (provided
        that the hero is within the same shop at the time) */
    // Untested: reaching it needs a tame steed wearing a saddle to die inside
    // a shop the hero is standing in too, which no recorded session and no
    // cheap fresh case produces. It is straight-line body of the function
    // rather than a helper, so it is ported with the rest.
    //
    // Seam: C's last conjunct is strchr() over the room-number C string
    // in_rooms() returns. The port's in_rooms() returns those numbers as an
    // array, so the membership test is .includes().
    if (unwornmask && mon.mtame && (unwornmask & W_SADDLE) !== 0
        && !obj.unpaid && costly_spot(omx, omy, state)
        /* being at costly_spot guarantees lev->roomno is not 0 */
        && in_rooms(state.u.ux, state.u.uy, SHOPBASE, state)
            .includes(state.level.at(omx, omy).roomno)) {
        obj.no_charge = true;
    }
    // obj_no_longer_held(obj); -- done by place_object
    if (verbosely && cansee(omx, omy, state)) {
        await message(
            messageAt(
                `${capitalizedMonsterName(mon, state)} drops ${objName}.`,
                omx,
                omy,
                state,
            ),
            state,
        );
    }
    if (!flooreffects(obj, omx, omy, 'fall', env)) {
        place_object(obj, omx, omy, env);
        // A drop is the inverse of dog_invent()'s pickup and needs the same
        // object-lifecycle owners that arm composes: merged() unlinks the
        // older pile member through remove_object() and frees it, and a
        // lamplit or timed member releases its light source and its timers on
        // the way out. Composing them here rather than in dropEnv() keeps
        // every other call in this function on the caller's own environment.
        stackobj(obj, objectGenerationEnv(env));
    }
    /* do this last, after placing obj on floor; removing steed's saddle
       throws rider, possibly inflicting fatal damage and producing bones; this
       is why we had to call extract_from_minvent() with do_intrinsics=FALSE */
    // worn.c update_mon_extrinsics() (579-710) has no port, so a monster that
    // survives losing equipment stops here. A dead one does not: DEADMONSTER()
    // is exactly what keeps the common case -- the hero's kill emptying a
    // corpse's pack through mon.c m_detach() -- clear of the unported call.
    if (!(mon.mhp < 1) /* !DEADMONSTER() */ && unwornmask)
        unsupported('a surviving monster losing gear it had equipped');
}

// C ref: steal.c relobj() (873-899). Release the objects a creature carries.
// `show` redraws the square afterwards; `is_pet` restricts the release to what
// droppables() offers, which is what keeps a pet's wielded weapon and its one
// useful tool in its inventory.
//
// C's vault-guard arm is gated on `isgd && findgold(minvent)`. findgold() is
// not ported, so the whole arm stops on `isgd` alone.
export async function relobj(mtmp, show, is_pet, rawEnv = {}) {
    const env = dropEnv(rawEnv);
    const { state, unsupported } = env;
    // dog_move() normalizes droppables() into its own environment, so taking
    // it from there keeps this loop and dog_invent()'s gate on one selector.
    const findDroppable = env.droppables ?? droppables;
    const redraw = env.redraw ?? newsym;
    const omx = mtmp.mx;
    const omy = mtmp.my;

    if (mtmp.isgd) unsupported("a vault guard's gold vanishing");

    for (;;) {
        const otmp = is_pet ? findDroppable(mtmp, env) : mtmp.minvent;
        if (!otmp) break;
        await mdrop_obj(
            mtmp,
            otmp,
            Boolean(is_pet && state.flags?.verbose),
            env,
        );
    }

    if (show && cansee(omx, omy, state)) redraw(omx, omy, state);
}
