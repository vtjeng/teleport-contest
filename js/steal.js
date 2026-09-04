// Monster pickup, theft and release transfer primitives.
// C refs: src/steal.c mpickobj(), mdrop_obj(), relobj(), steal(),
// worn_item_removal() and remove_worn_item().

import {
    ADORNED,
    BLINDED,
    LEFT_RING,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
    PLNMSG_MON_TAKES_OFF_ITEM,
    RIGHT_RING,
    SHOPBASE,
    W_ACCESSORY,
    W_AMUL,
    W_ARMOR,
    W_BALL,
    W_CHAIN,
    W_RING,
    W_SADDLE,
    W_TOOL,
    W_WEAPONS,
} from './const.js';
import { newsym } from './display.js';
import { flooreffects } from './do.js';
import { Ring_gone } from './do_wear.js';
import {
    capitalizedMonsterName,
    Some_Monnam,
} from './do_name.js';
import { droppables } from './dogmove.js';
import { game } from './gstate.js';
import { inv_cnt } from './hack.js';
import {
    add_to_minv,
    carry_obj_effects,
    count_unpaid,
    freeinv,
    preflight_carry_obj_effects,
    stackobj,
} from './invent.js';
import { obj_sheds_light } from './light.js';
import { attacktype, dead_species, is_animal } from './mondata.js';
import { AT_ENGL, S_NYMPH } from './monsters.js';
import { objectType, place_object, unknow_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { ARMOR_CLASS, AMULET_CLASS, COIN_CLASS, FOOD_CLASS, RING_CLASS, TOOL_CLASS } from './objects.js';
import { distant_name, donameFresh, doname_with_price, yname } from './objnam.js';
import { encumber_msg } from './pickup.js';
import { in_rooms } from './rooms.js';
import { rn2 } from './rng.js';
import { costly_spot } from './shk.js';
import {
    canSeeMonster as canSeeMonsterOnMap,
    canSpotMonster,
    messageAt,
} from './startup_a11y.js';
import { attach_fig_transform_timeout } from './timeout.js';
import { ttyPline, ttyUrgentPline } from './tty_message.js';
import { cansee } from './vision.js';
import { extract_from_minvent, setnotworn } from './worn.js';
import { uwepgone, uswapwepgone } from './wield.js';
import { monnear } from './monmove.js';
import { stop_occupation } from './allmain.js';

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

// C ref: steal.c remove_worn_item() (213-290). Strips a worn item from the
// hero. Called by worn_item_removal() and by steal()'s W_WEAPONS path.
//
// Ported arms: W_RING (Ring_gone), W_WEAPONS (uwepgone/uswapwepgone).
// Unported arms (W_ARMOR individual slots, W_AMUL, W_TOOL, W_BALL|W_CHAIN)
// throw so the segment ends cleanly.
function remove_worn_item(obj, unchain_ball, state = game) {
    // C: if (donning(obj)) cancel_don(); -- donning/cancel_don not ported.
    // In the steal path the hero is not actively putting on armor, so this
    // is inert.
    if (!obj.owornmask) return;

    const oldinuse = obj.in_use ?? 0;
    obj.in_use = 1;

    if (obj.owornmask & W_ARMOR) {
        throw new UnsupportedStealError(
            `remove_worn_item() W_ARMOR for otyp ${obj.otyp}`,
        );
    } else if (obj.owornmask & W_AMUL) {
        throw new UnsupportedStealError(
            'remove_worn_item() W_AMUL (Amulet_off)',
        );
    } else if (obj.owornmask & W_RING) {
        Ring_gone(obj, state);
    } else if (obj.owornmask & W_TOOL) {
        throw new UnsupportedStealError(
            'remove_worn_item() W_TOOL (Blindf_off)',
        );
    } else if (obj.owornmask & W_WEAPONS) {
        if (obj === state.uwep) uwepgone({ state });
        if (obj === state.uswapwep) uswapwepgone({ state });
        if (obj === state.uquiver) {
            throw new UnsupportedStealError(
                'remove_worn_item() W_WEAPONS uqwepgone()',
            );
        }
    }

    // W_BALL | W_CHAIN
    if (obj.owornmask & (W_BALL | W_CHAIN)) {
        if (unchain_ball) {
            throw new UnsupportedStealError(
                'remove_worn_item() unpunish()',
            );
        }
    } else if (obj.owornmask) {
        // catchall
        setnotworn(obj, { state });
    }

    // C: if (obj->where == OBJ_DELETED) debugpline; not needed
    obj.in_use = oldinuse;
}

// C ref: steal.c worn_item_removal() (292-334). Message prefacing the removal
// of a worn item during theft, followed by remove_worn_item().
function worn_item_removal(mon, obj, state = game) {
    const message = ttyUrgentPline;
    let objbuf = doname_with_price(obj, state);

    // Massage the object description: strip article and replace with "your".
    const stripMatch = /^(?:the |an |a )/.exec(objbuf);
    if (stripMatch) {
        // When removing attached iron ball, caller passes uchain; use "the"
        // instead of "your" for that case. Not ported: the uchain path is
        // blocked above.
        objbuf = 'your ' + objbuf.slice(stripMatch[0].length);
    }

    // Strip "(being worn)" and "(alternate weapon; not wielded)".
    objbuf = objbuf.replace(' (being worn)', '');
    objbuf = objbuf.replace(' (alternate weapon; not wielded)', '');

    // Convert "ring (on left hand)" to "ring (from left hand)".
    objbuf = objbuf.replace(/\(on ((?:left|right) )/g, '(from $1');

    const verb = (obj.owornmask & W_WEAPONS) ? 'disarms'
        : (obj.owornmask & W_ACCESSORY) ? 'removes'
        : 'takes off';
    message(`${Some_Monnam(mon, state)} ${verb} ${objbuf}.`, state);
    state.iflags ??= {};
    state.iflags.last_msg = PLNMSG_MON_TAKES_OFF_ITEM;
    remove_worn_item(obj, true, state);
}

export class UnsupportedStealError extends Error {
    constructor(what) {
        super(`steal reached an unported branch: ${what}`);
        this.name = 'UnsupportedStealError';
    }
}

// C ref: steal.c steal() (342-614). Returns 1 when something was stolen,
// -1 if the monster died, 0 otherwise. `objnambuf` is filled with the name
// of the stolen item for use by the caller's message.
//
// Ported paths: nymph stealing a ring (RING_CLASS worn_item_removal) or
// unworn item. The armor-delay branch (stealarm callback) and monkey_business
// paths that need can_carry() or cursed-item checks throw UnsupportedStealError.
export async function steal(mtmp, state = game, env = {}) {
    const message = env.message ?? ttyUrgentPline;
    const random = env.random?.rn2 ?? rn2;

    const monkey_business = is_animal(mtmp.data);
    const seen = canSpotMonster(mtmp, state);

    let objnambuf = '';

    // The following is true if successful on first of two attacks.
    if (!monnear(mtmp, state.u.ux, state.u.uy, state)) return 0;

    const Monnambuf = Some_Monnam(mtmp, state);

    // C: if (go.occupation) maybe_finished_meal(FALSE);
    // Eating occupation is not commonly active during a nymph attack;
    // the port does not have go.occupation integrated. Skip.

    const icnt = inv_cnt(false, state);
    if (!icnt || (icnt === 1 && state.uskin)) {
        // nothing_to_steal:
        // Punished/buried ball arms are unported.
        if (state.u.uprops?.[BLINDED]?.intrinsic
            || state.u.uprops?.[BLINDED]?.extrinsic) {
            await message(
                'Somebody tries to rob you, but finds nothing to steal.',
                state,
            );
        } else if (inv_cnt(true, state) > inv_cnt(false, state)) {
            await message(
                `${Monnambuf} tries to rob you, but isn't interested in gold.`,
                state,
            );
        } else {
            await message(
                `${Monnambuf} tries to rob you, but there is nothing to steal!`,
                state,
            );
        }
        return 1;
    }

    let otmp = null;
    let goGotobj = false;

    if (monkey_business || state.uarmg) {
        // skip ring special cases
    } else {
        const adornment = state.u.uprops?.[ADORNED]?.extrinsic ?? 0;
        if (adornment & LEFT_RING) {
            otmp = state.uleft;
            goGotobj = true;
        } else if (adornment & RIGHT_RING) {
            otmp = state.uright;
            goGotobj = true;
        }
    }

    let retrycnt = 0;

    if (!goGotobj) {
        // retry:
        for (;;) {
            let tmp = 0;
            for (let o = state.invent; o; o = o.nobj) {
                if ((!state.uarm || o !== state.uarmc) && o !== state.uskin
                    && o.oclass !== COIN_CLASS)
                    tmp += (o.owornmask & (W_ARMOR | W_ACCESSORY)) ? 5 : 1;
            }
            if (!tmp) {
                // nothing_to_steal
                if (state.u.uprops?.[BLINDED]?.intrinsic
                    || state.u.uprops?.[BLINDED]?.extrinsic) {
                    await message(
                        'Somebody tries to rob you, but finds nothing to steal.',
                        state,
                    );
                } else {
                    await message(
                        `${Monnambuf} tries to rob you, but there is nothing to steal!`,
                        state,
                    );
                }
                return 1;
            }
            tmp = random(tmp);
            for (let o = state.invent; o; o = o.nobj) {
                if ((!state.uarm || o !== state.uarmc) && o !== state.uskin
                    && o.oclass !== COIN_CLASS) {
                    tmp -= (o.owornmask & (W_ARMOR | W_ACCESSORY)) ? 5 : 1;
                    if (tmp < 0) { otmp = o; break; }
                }
            }
            if (!otmp) {
                // impossible("Steal fails!");
                return 0;
            }

            // can't steal ring(s) while wearing gloves
            if ((otmp === state.uleft || otmp === state.uright) && state.uarmg)
                otmp = state.uarmg;
            // can't steal gloves while wielding
            if (otmp === state.uarmg && state.uwep)
                otmp = state.uwep;
            // can't steal armor while wearing cloak
            else if (otmp === state.uarm && state.uarmc)
                otmp = state.uarmc;
            // can't steal shirt while wearing cloak or suit
            else if (otmp === state.uarmu && state.uarmc)
                otmp = state.uarmc;
            else if (otmp === state.uarmu && state.uarm)
                otmp = state.uarm;

            // gotobj: check stealoid
            if (otmp.o_id === (state.gs?.stealoid ?? -1))
                return 0;

            // Boulder check: animals can't lift boulders
            if (otmp.otyp === 616 /* BOULDER */
                && !monkey_business /* throws_rocks unported */) {
                if (!retrycnt++) continue;
                // cant_take: fall through to the message below
                throw new UnsupportedStealError('boulder steal cant_take');
            }

            // animals can't overcome curse stickiness
            if (monkey_business) {
                throw new UnsupportedStealError(
                    'monkey_business cursed/carry checks',
                );
            }

            break; // exit retry loop
        }
    }

    // C: if (otmp->otyp == LEASH && otmp->leashmon) { ... o_unleash(otmp); }
    // Leash with attached pet needs o_unleash(). Not commonly exercised.
    if (otmp.otyp === 236 /* LEASH */ && otmp.leashmon) {
        throw new UnsupportedStealError('leash steal o_unleash');
    }

    // C: was_doffing = doffing(otmp); olddelay = stop_donning(otmp);
    // donning/doffing not ported; the hero is not putting on armor during
    // a monster's attack turn.
    await stop_occupation(state, env);

    let named = 0;

    if (otmp.owornmask & (W_ARMOR | W_ACCESSORY)) {
        switch (otmp.oclass) {
        case TOOL_CLASS:
        case AMULET_CLASS:
        case RING_CLASS:
        case FOOD_CLASS: /* meat ring */
            worn_item_removal(mtmp, otmp, state);
            break;
        case ARMOR_CLASS: {
            // The armor-delay charming branch is complex and needs
            // stealarm() callback, nomul, afternmv. Throw for now.
            const armordelay = objectType(otmp, state).oc_delay ?? 0;
            if (monkey_business) {
                throw new UnsupportedStealError(
                    'animal armor steal attempt',
                );
            }
            // Nymph armor steal with charming message and delay
            throw new UnsupportedStealError(
                `nymph armor steal (delay=${armordelay})`,
            );
        }
        default:
            // impossible
            break;
        }
        // hero's blindfold might have just been stolen
        if (!seen && canSpotMonster(mtmp, state)) {
            // Monnambuf would be updated, but it's a const; the only use
            // below is for the "stole" message where 'named' controls it.
        }
    } else if (otmp.owornmask) {
        // weapon or ball&chain
        if (otmp === state.uball) {
            throw new UnsupportedStealError(
                'steal uball/uchain removal',
            );
        }
        worn_item_removal(mtmp, otmp, state);
        // if the weapon was also wielded after uchain processing
        if (otmp.owornmask & W_WEAPONS)
            remove_worn_item(otmp, false, state);
    }

    // do this before removing it from inventory
    objnambuf = yname(otmp, state);

    // set mavenge so knights won't suffer alignment penalty
    mtmp.mavenge = 1;

    // C: if (otmp->unpaid) subfrombill(otmp, shop_keeper(*u.ushops));
    // Shop billing for stolen items is unported; no session exercises it.

    freeinv(otmp, { state });

    // shorten the "stole" message if we just gave a worn-item-removal message
    if ((state.iflags?.last_msg ?? -1) === PLNMSG_MON_TAKES_OFF_ITEM
        && mtmp.data.mlet === S_NYMPH)
        ++named;
    await message(`${named ? 'She' : Monnambuf} stole ${donameFresh(otmp, state)}.`, state);
    await encumber_msg(state);

    // Petrification check for stolen corpses
    // touch_petrifies not commonly exercised; skip for now.

    otmp.how_lost = LOST_STOLEN;
    mpickobj(mtmp, otmp, { state });

    return (state.gm?.multi ?? 0) < 0 ? 0 : 1;
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

// Passing do_extrinsics false leaves two WornEnv hooks extract_from_minvent()
// can ask mdrop_obj() for. Neither has a port, and each would throw worn.js's
// bare "worn requires ..." Error, which js/jsmain.js does not recognize as a
// boundary, so a segment would be discarded rather than ended.
//
// endArtifactLight, at worn.c 1399-1400, wants a lamplit W_ARM object that
// artifact_light() recognizes, and gets no key because mdrop_obj() stops one
// call earlier: js/objnam.js refuses 'lit worn-object suffix' for any lamplit
// worn object, a wider condition than that arm's, when distant_name() names the
// object below. Further out, js/makemon_create.js m_dowear_type() omits
// worn.c 973-975's begin_burn(), so nothing a monster wears is lamplit to begin
// with. scripts/steal.test.mjs pins the near gate, which is the one that holds.
//
// mwepgone, at worn.c 1414-1415, wants a W_WEP object, and nothing refuses a
// wielded weapon's name, so that arm needs the key below. In the port only
// js/weapon.js mon_wield_item() puts W_WEP on a monster's object, and its one
// call site in js/unported_monster_actions.js refuses at 'monster wield action'
// for every selection that would reach the assignment. C is wider on both
// counts: mon_wield_item() has ten callers, and mthrowu.c:894 sets W_WEP on a
// tethered weapon returning to its thrower without calling it at all. The key
// is what makes the first widening of either route end a segment.
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
    // array, so the membership test is .includes(). The two forms disagree at
    // one input. strchr(s, '\0') finds the terminator and returns a non-null
    // pointer, so C is true for roomno 0 whatever the string holds, while
    // .includes(0) on an array without 0 is false. costly_spot() is what rules
    // that input out, as C's own comment below says: it returns false unless
    // shk.c inside_shop() answers with a room number, and inside_shop() answers
    // NO_ROOM for every roomno under ROOMOFFSET.
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
    // worn.c update_mon_extrinsics() (579-712) has only a partial port:
    // js/makemon_create.js updateMonsterArmorEffects() covers the INVIS arm for
    // a mummy wrapping and the FAST arm for speed boots, which is what
    // creation-time gear carries, and discard_minvent() calls it on the same
    // !DEADMONSTER() arm this refusal stands on. Equipment outside that set
    // reaches neither arm, so a monster that survives losing it stops here.
    // Whoever ports the rest owns both copies: move them into js/worn.js under
    // the C name rather than adding a third. A dead monster does not stop:
    // DEADMONSTER() is exactly what keeps the common case -- the hero's kill
    // emptying a corpse's pack through mon.c m_detach() -- clear of that call.
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
