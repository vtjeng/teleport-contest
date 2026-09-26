// Monster pickup, theft and release transfer primitives.
// C refs: src/steal.c mpickobj(), mdrop_obj(), relobj(), steal(),
// worn_item_removal() and remove_worn_item().

import {
    ADORNED,
    BLINDED,
    CONFLICT,
    LEFT_HANDED,
    LEFT_RING,
    LOST_DROPPED,
    LOST_NONE,
    LOST_STOLEN,
    LOST_THROWN,
    OBJ_DELETED,
    PLNMSG_MON_TAKES_OFF_ITEM,
    RLOC_MSG,
    RIGHT_RING,
    SHOPBASE,
    TT_BURIEDBALL,
    W_ACCESSORY,
    W_AMUL,
    W_ARMOR,
    W_ARMG,
    W_BALL,
    W_CHAIN,
    W_RING,
    W_SADDLE,
    W_TOOL,
    W_WEAPONS,
} from './const.js';
import { newsym } from './display.js';
import { flooreffects } from './do.js';
import {
    Armor_off,
    Blindf_off,
    Boots_off,
    cancel_don,
    Cloak_off,
    doffing,
    donning,
    Gloves_off,
    Helmet_off,
    Ring_gone,
    Shirt_off,
    Shield_off,
    stop_donning,
    setwornEnv,
} from './do_wear.js';
import {
    Adjmonnam,
    capitalizedMonsterName,
    Monnam,
    Some_Monnam,
} from './do_name.js';
import { droppables } from './dogmove.js';
import { game } from './gstate.js';
import { inv_cnt, nomul } from './hack.js';
import { dist2 } from './hacklib.js';
import {
    add_to_minv,
    carry_obj_effects,
    count_unpaid,
    freeinv,
    preflight_carry_obj_effects,
    stackobj,
} from './invent.js';
import { obj_sheds_light } from './light.js';
import {
    attacktype,
    dead_species,
    dmgtype,
    is_animal,
    touch_petrifies,
    throws_rocks,
} from './mondata.js';
import { AD_SITM, AT_ENGL, S_NYMPH } from './monsters.js';
import { can_carry } from './moncarry.js';
import { objectType, place_object, unknow_object } from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    ARMOR_CLASS,
    AMULET_CLASS,
    BOULDER,
    COIN_CLASS,
    CORPSE,
    FOOD_CLASS,
    GOLD_PIECE,
    LEASH,
    RING_CLASS,
    TOOL_CLASS,
} from './objects.js';
import {
    armor_simple_name,
    distant_name,
    donameFresh,
    doname_with_price,
    yname,
} from './objnam.js';
import { encumber_msg } from './pickup.js';
import { in_rooms } from './rooms.js';
import { rn2, rnd } from './rng.js';
import { costly_spot, find_objowner, shop_keeper, subfrombill } from './shk.js';
import {
    canSeeMonster as canSeeMonsterOnMap,
    canSpotMonster,
    messageAt,
} from './startup_a11y.js';
import { attach_fig_transform_timeout } from './timeout.js';
import { ttyPline, ttyUrgentPline } from './tty_message.js';
import { cansee } from './vision.js';
import { openholdingtrap, unconscious } from './trap.js';
import { is_fainted, maybe_finished_meal } from './eat.js';
import {
    extract_from_minvent,
    setnotworn,
    setworn,
    bimanual,
    update_mon_extrinsics,
} from './worn.js';
import { uqwepgone, uwepgone, uswapwepgone, welded } from './wield.js';
import {
    monflee,
    monnear,
    onscary,
    set_apparxy,
} from './monmove.js';
import { stop_occupation } from './allmain.js';
import { mwepgone } from './weapon.js';
import { rloc, tele_restrict } from './teleport.js';
import { note_unported } from './unported.js';

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
        findObjectOwner: (obj, x, y, env) => find_objowner(obj, x, y, env.state),
        subFromBill: (obj, owner, env) => subfrombill(obj, owner, env.state, env),
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
// hero. The callback operations that can print or trigger landing effects are
// awaited so they finish before the caller transfers or destroys the object.
export async function remove_worn_item(obj, unchain_ball, state = game, env = {}) {
    if (donning(obj, state)) cancel_don(state);
    if (!obj.owornmask) return;

    const oldinuse = obj.in_use ?? 0;
    obj.in_use = 1;
    try {
        if (obj.owornmask & W_ARMOR) {
            if (obj === state.uskin) {
                note_unported('pline.c impossible');
                const { skinback } = await import('./polyself.js');
                await skinback(true, state);
            }
            if (obj === state.uarm)
                await Armor_off(state);
            else if (obj === state.uarmc)
                await Cloak_off(state, { ...env, state });
            else if (obj === state.uarmf)
                await Boots_off(state);
            else if (obj === state.uarmg)
                await Gloves_off(state);
            else if (obj === state.uarmh)
                await Helmet_off(state);
            else if (obj === state.uarms)
                await Shield_off(state);
            else if (obj === state.uarmu)
                await Shirt_off(state);
            else
                setworn(null, obj.owornmask & W_ARMOR, setwornEnv(state));
        } else if (obj.owornmask & W_AMUL) {
            // do_wear.c Amulet_off() has no port yet; C discards its result.
            note_unported('do_wear.c Amulet_off');
        } else if (obj.owornmask & W_RING) {
            await Ring_gone(obj, state);
        } else if (obj.owornmask & W_TOOL) {
            await Blindf_off(obj, state);
        } else if (obj.owornmask & W_WEAPONS) {
            if (obj === state.uwep) uwepgone({ state });
            if (obj === state.uswapwep) uswapwepgone({ state });
            if (obj === state.uquiver) uqwepgone({ state });
        }

        if (obj.owornmask & (W_BALL | W_CHAIN)) {
            if (unchain_ball)
                note_unported('ball.c unpunish');
        } else if (obj.owornmask) {
            setnotworn(obj, { state });
        }

        if (obj.where === OBJ_DELETED)
            note_unported('pline.c debugpline1');
    } finally {
        obj.in_use = oldinuse;
    }
}

// C ref: steal.c thiefdead() (120-129). mon.c:m_detach() calls this when the
// monster identified by gs.stealmid goes away during a delayed armor theft.
export function thiefdead(state = game) {
    state.gs ??= {};
    state.gs.stealmid = 0;
    if (state.afternmv === stealarm) {
        state.afternmv = unstolenarm;
        state.nomovemsg = null;
    }
}

// C ref: steal.c unresponsive() (132-142). The message-prefix tests match the
// first bytes C compares and are intentionally independent of the cause of a
// negative multi-turn count.
export function unresponsive(state = game) {
    if ((state.multi ?? 0) >= 0) return false;
    const reason = state.multi_reason ?? '';
    return Boolean(unconscious(state)
        || is_fainted(state)
        || reason.startsWith('frozen')
        || reason.startsWith('paralyzed'));
}

// C ref: steal.c unstolenarm() (146-161). Called when the delayed thief has
// died before the hero finishes removing the item.
async function unstolenarm(state = game) {
    let obj = state.invent;
    const stealoid = state.gs?.stealoid ?? 0;
    while (obj && obj.o_id !== stealoid) obj = obj.nobj;
    state.gs ??= {};
    state.gs.stealoid = 0;
    if (obj)
        await ttyPline(
            `You finish taking off your ${armor_simple_name(obj, state)}.`,
            state,
        );
    return 0;
}

// C ref: steal.c stealarm() (164-208). The function runs as afternmv after
// the hero finishes taking off the selected armor.
async function stealarm(state = game, rawEnv = {}) {
    const gs = state.gs ?? {};
    let obj = state.invent;
    if (!gs.stealoid || !gs.stealmid) {
        gs.stealoid = 0;
        gs.stealmid = 0;
        state.gs = gs;
        return 0;
    }

    while (obj) {
        const nextObj = obj.nobj;
        if (obj.o_id === gs.stealoid) {
            let monster = state.level?.monlist ?? null;
            while (monster && monster.m_id !== gs.stealmid)
                monster = monster.nmon;
            if (monster) {
                if ((monster.mhp ?? 0) < 1) {
                    note_unported('pline.c impossible');
                } else if (!dmgtype(monster.data, AD_SITM)
                    || dist2(monster.mx, monster.my,
                        state.u.ux, state.u.uy) > 2) {
                    break;
                } else {
                    if (obj.unpaid)
                        subfrombill(
                            obj,
                            shop_keeper(state.u.ushops?.[0], state),
                            state,
                            rawEnv,
                        );
                    freeinv(obj, { state });
                    await ttyPline(
                        `${Monnam(monster, state)} steals `
                            + `${donameFresh(obj, state)}!`,
                        state,
                    );
                    // C discards mpickobj()'s freed-object result; its object
                    // transfer side effects still run in source order.
                    mpickobj(monster, obj, { state });
                    await monflee(monster, 0, false, false, {
                        ...rawEnv,
                        state,
                    });
                    if (!(await tele_restrict(monster, state, rawEnv))) {
                        const random = {
                            rn2,
                            rnd,
                            ...(rawEnv.random ?? {}),
                        };
                        await rloc(monster, RLOC_MSG, {
                            ...rawEnv,
                            state,
                            random,
                            newsym,
                            onscary: (x, y, mon, env) =>
                                onscary(x, y, mon, env.state),
                            setApparxy: set_apparxy,
                            message: rawEnv.message ?? ttyPline,
                        });
                    }
                    break;
                }
            }
            break;
        }
        obj = nextObj;
    }

    // C clears both ids even when one callback was interrupted independently.
    gs.stealoid = 0;
    gs.stealmid = 0;
    state.gs = gs;
    return 0;
}

// C ref: steal.c worn_item_removal() (292-334). Message prefacing the removal
// of a worn item during theft, followed by remove_worn_item().
async function worn_item_removal(mon, obj, state = game, message = ttyPline) {
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
    await message(`${Some_Monnam(mon, state)} ${verb} ${objbuf}.`, state);
    state.iflags ??= {};
    state.iflags.last_msg = PLNMSG_MON_TAKES_OFF_ITEM;
    await remove_worn_item(obj, true, state);
}

// C ref: steal.c steal() (342-614). Returns 1 when something was stolen,
// -1 if the monster died, 0 otherwise. `objnambuf` is filled with the name
// of the stolen item for use by the caller's message.
export async function steal(mtmp, state = game, env = {}) {
    // C's worn_item_removal() uses ordinary pline(), while the final theft
    // line uses urgent_pline(). Keep the two display operations separate so
    // callers can silence both during planning without changing live message
    // attributes or the --More-- boundary.
    const message = env.message ?? ttyPline;
    const urgentMessage = env.urgentMessage ?? ttyUrgentPline;
    const random = env.random?.rn2 ?? rn2;

    const monkey_business = is_animal(mtmp.data);
    const seen = canSpotMonster(mtmp, state);
    const was_punished = Boolean(state.uball);

    let objnambuf = '';

    // The following is true if successful on first of two attacks.
    if (!monnear(mtmp, state.u.ux, state.u.uy, state)) return 0;

    let Monnambuf = Some_Monnam(mtmp, state);

    // C: if (go.occupation) maybe_finished_meal(FALSE);
    if (state.go?.occupation)
        await maybe_finished_meal(false, state, { ...env, message });

    const icnt = inv_cnt(false, state);
    const nothingToSteal = async () => {
        // C's attached chain is removed without giving an object to the thief.
        // remove_worn_item() records the still-unported void unpunish() call.
        if (state.uball && !monkey_business && random(4)) {
            await worn_item_removal(mtmp, state.uchain, state, message);
        } else if (state.u.utrap && state.u.utraptype === TT_BURIEDBALL
            && !monkey_business && !random(4)) {
            await message(`${Monnambuf} takes off your unseen chain.`, state);
            // C discards openholdingtrap()'s struct result; this ported owner
            // is awaited for its release and display effects.
            await openholdingtrap(state.youmonst, state);
        } else if (heroIsBlind(state)) {
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
    };
    const cantTake = async (obj) => {
        const how = ['steal', 'snatch', 'grab', 'take'];
        const verb = how[random(how.length)];
        const armor = (obj.owornmask & W_ARMOR) !== 0;
        await message(
            `${Monnambuf} tries to ${verb} `
                + `${armor ? 'your ' : ''}`
                + `${armor ? armor_simple_name(obj, state)
                    : yname(obj, state)} but gives up.`,
            state,
        );
        return random(Math.trunc(inv_cnt(false, state) / 5) + 2) === 0
            ? 1 : 0;
    };

    if (!icnt || (icnt === 1 && state.uskin)) {
        // nothing_to_steal:
        return await nothingToSteal();
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
                return await nothingToSteal();
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
            if (otmp.otyp === BOULDER && !throws_rocks(mtmp.data)) {
                if (!retrycnt++) continue;
                // cant_take: fall through to the message below
                return await cantTake(otmp);
            }

            // C's monkey_business arm checks both curse stickiness and the
            // monster's actual carrying capacity before it reaches cant_take.
            if (monkey_business) {
                const ringOnPrimary = state.u.uhandedness === LEFT_HANDED
                    ? state.uleft : state.uright;
                const ringOnSecondary = state.u.uhandedness === LEFT_HANDED
                    ? state.uright : state.uleft;
                let stuck;
                if (otmp === state.uball) {
                    stuck = true;
                } else if (otmp === state.uquiver
                    || (otmp === state.uswapwep && !state.u.twoweap)) {
                    stuck = false;
                } else {
                    stuck = Boolean((otmp.cursed && otmp.owornmask)
                        || (otmp === ringOnPrimary && welded(state.uwep, state))
                        || (otmp === ringOnSecondary && welded(state.uwep, state)
                            && bimanual(state.uwep, state)));
                }
                if (stuck || can_carry(mtmp, otmp, {
                    ...env,
                    state,
                    random: env.random ?? { rn2: random },
                }) === 0) {
                    return await cantTake(otmp);
                }
            }
            break; // exit retry loop
        }
    }

    if (otmp.otyp === LEASH && otmp.leashmon) {
        if (monkey_business && otmp.cursed) {
            return await cantTake(otmp);
        }
        // apply.c o_unleash() is void; leave its source gap explicit.
        note_unported('apply.c o_unleash');
    }

    const was_doffing = doffing(otmp, state);
    const olddelay = await stop_donning(otmp, state);
    await stop_occupation(state, { ...env, message });

    let named = 0;

    if (otmp.owornmask & (W_ARMOR | W_ACCESSORY)) {
        switch (otmp.oclass) {
        case TOOL_CLASS:
        case AMULET_CLASS:
        case RING_CLASS:
        case FOOD_CLASS: /* meat ring */
            await worn_item_removal(mtmp, otmp, state, message);
            break;
        case ARMOR_CLASS: {
            let armordelay = objectType(otmp, state).oc_delay ?? 0;
            if (olddelay > 0 && olddelay < armordelay)
                armordelay = olddelay;
            if (monkey_business || unresponsive(state)) {
                if (armordelay >= 1 && !olddelay && random(10)) {
                    return await cantTake(otmp);
                }
                await worn_item_removal(mtmp, otmp, state, message);
            } else {
                const curssv = otmp.cursed;
                let slowly;
                otmp.cursed = 0;
                slowly = armordelay >= 1 || (state.multi ?? 0) < 0;
                const armorName = armor_simple_name(otmp, state);
                if (state.flags?.female) {
                    const subject = !seen ? 'She' : Monnambuf;
                    const action = curssv ? 'let her take'
                        : !slowly ? 'hand over'
                            : was_doffing ? 'continue removing'
                                : 'start removing';
                    await urgentMessage(
                        `${subject} charms you.  You gladly ${action} `
                            + `your ${armorName}.`,
                        state,
                    );
                } else {
                    const subject = !seen
                        ? 'She' : Adjmonnam(mtmp, 'beautiful', state);
                    const action = curssv ? 'helps you to take'
                        : !slowly ? 'you take'
                            : was_doffing ? 'you continue taking'
                                : 'you start taking';
                    await urgentMessage(
                        `${subject} seduces you and ${action} off your `
                            + `${armorName}.`,
                        state,
                    );
                }
                named++;
                nomul(-armordelay, state);
                state.multi_reason = 'taking off clothes';
                state.nomovemsg = null;
                await remove_worn_item(otmp, true, state);
                otmp.cursed = curssv;
                if ((state.multi ?? 0) < 0) {
                    state.gs ??= {};
                    state.gs.stealoid = otmp.o_id;
                    state.gs.stealmid = mtmp.m_id;
                    state.afternmv = stealarm;
                    return 0;
                }
            }
            break;
        }
        default:
            // impossible
            break;
        }
        // hero's blindfold might have just been stolen
        if (!seen && canSpotMonster(mtmp, state))
            Monnambuf = Monnam(mtmp, state);
    } else if (otmp.owornmask) {
        // weapon or ball&chain
        const item = otmp === state.uball ? state.uchain : otmp;
        await worn_item_removal(mtmp, item, state, message);
        // if the weapon was also wielded after uchain processing
        if (otmp.owornmask & W_WEAPONS)
            await remove_worn_item(otmp, false, state);
    }

    // do this before removing it from inventory
    objnambuf = yname(otmp, state);

    // set mavenge so knights won't suffer alignment penalty
    const conflict = state.u.uprops?.[CONFLICT];
    const punished = Boolean(state.uball);
    if (!(conflict?.intrinsic || conflict?.extrinsic)
        && !(was_punished && !punished))
        mtmp.mavenge = 1;

    if (otmp.unpaid)
        subfrombill(otmp, shop_keeper(state.u.ushops[0], state), state, env);

    freeinv(otmp, { state });

    // shorten the "stole" message if we just gave a worn-item-removal message
    if ((state.iflags?.last_msg ?? -1) === PLNMSG_MON_TAKES_OFF_ITEM
        && mtmp.data.mlet === S_NYMPH)
        ++named;
    await urgentMessage(
        `${named ? 'She' : Monnambuf} stole ${donameFresh(otmp, state)}.`, state,
    );
    await encumber_msg(state, { message });

    // Petrification check for stolen corpses
    const couldPetrify = otmp.otyp === CORPSE
        && touch_petrifies(state.mons?.[otmp.corpsenm]);

    otmp.how_lost = LOST_STOLEN;
    mpickobj(mtmp, otmp, { state });

    if (couldPetrify && !(mtmp.misc_worn_check & W_ARMG)) {
        // mon.c minstapetrify() is void and remains unported; keep the call
        // boundary explicit while preserving steal()'s -1 result.
        note_unported('mon.c minstapetrify');
        return -1;
    }

    return (state.multi ?? 0) < 0 ? 0 : 1;
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

// Passing do_extrinsics false keeps the steed's saddle from dismounting its
// rider before the object reaches the floor. The extraction owner still
// handles source cleanup and mdrop_obj() invokes update_mon_extrinsics() at the
// required post-placement point below.
//
// endArtifactLight, at worn.c 1399-1400, uses the canonical timeout owner for
// a surviving drop's lit suit; an explicit hook remains available for a
// caller-owned cleanup integration.
//
// mwepgone, at worn.c 1414-1415, wants a W_WEP object, and nothing refuses a
// wielded weapon's name. extractionEnv() supplies the weapon.c implementation
// so the object can finish the drop after it is unwielded.
//
// Composed at the call site rather than in dropEnv(), as the stackobj()
// comment below does, so every other call in this function keeps running on
// the caller's own environment.
function extractionEnv(env) {
    return {
        ...env,
        hooks: {
            mwepgone: (mon, actionEnv) => mwepgone(mon, actionEnv),
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
    await extract_from_minvent(mon, obj, false, true, extractionEnv(env));
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
    if (!await flooreffects(obj, omx, omy, 'fall', env)) {
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
    // C calls the now-canonical worn.c owner after the object reaches the
    // floor.  It passes silently=TRUE, so speed changes update state without
    // adding the visible adjustment message at this source point.
    if (!(mon.mhp < 1) /* !DEADMONSTER() */ && unwornmask)
        await update_mon_extrinsics(mon, obj, false, {
            ...env,
            state,
            silent: true,
        });
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

// C ref: steal.c findgold() (45-52). Walk an object chain and return the
// first gold-piece stack, or null if none is found.
export function findgold(chain) {
    let obj = chain;
    while (obj && obj.otyp !== GOLD_PIECE)
        obj = obj.nobj;
    return obj ?? null;
}
