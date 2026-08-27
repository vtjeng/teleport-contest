// do.js -- Commands that drop, dig into, or descend through the floor, and
// the up command.
// C refs: do.c -- dodrop(), flooreffects(), canletgo(), drop(), dropx(),
// dropy(), dropz(), trycall(), u_stuck_cannot_go(), dodown(), doup(),
// goto_level(), u_collide_m(), temperature_change_msg() and
// set_wounded_legs(); dokick.c obj_delivery(); mon.c
// kill_genocided_monsters(); questpgr.c deliver_splev_message().

import {
    ACH_BGRM,
    A_DEX,
    BOTH_SIDES,
    CORR,
    DIR_DOWN,
    DIR_UP,
    DOOR,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    FLYING,
    FUMBLING,
    GETOBJ_ALLOWCNT,
    GETOBJ_PROMPT,
    G_GENOD,
    HAND,
    IS_ALTAR,
    IS_SINK,
    In_endgame,
    In_quest,
    In_tutorial,
    LADDER,
    LEG,
    LEVITATION,
    LFILE_EXISTS,
    LOST_DROPPED,
    OBJ_INVENT,
    OBJ_FREE,
    ROOM,
    RLOC_NOMSG,
    SLT_ENCUMBER,
    STAIRS,
    TIMEOUT,
    TT_BURIEDBALL,
    TT_PIT,
    UNENCUMBERED,
    UTOTYPE_NONE,
    UTOTYPE_ATSTAIRS,
    UTOTYPE_DEFERRED,
    UTOTYPE_FALLING,
    UTOTYPE_PORTAL,
    UTOTYPE_RMPORTAL,
    Upolyd,
    VIBRATING_SQUARE,
    VISITED,
    WOUNDED_LEGS,
    W_ACCESSORY,
    W_ARMOR,
    W_SADDLE,
    HALLUC,
    HALLUC_RES,
    is_hole,
    plur,
    something,
    st_all,
} from './const.js';
import { reset_trapset } from './apply.js';
import { next_to_u } from './apply_next_to_u.js';
import { reset_occupations, set_move_cmd } from './cmd.js';
import { docrt, flush_screen, newsym } from './display.js';
import { docall } from './do_name.js';
import { setwornEnv } from './do_wear.js';
import { keepdogs, losedogs, update_mlstmv } from './dog.js';
import { can_reach_floor, engr_at } from './engrave.js';
import { makeplural } from './fruit.js';
import {
    Can_fall_thru,
    In_hell,
    In_W_tower,
    assign_level,
    at_dgn_entrance,
    builds_up,
    depth,
    dunlev,
    dunlev_reached,
    dunlevs_in_dungeon,
    ledger_no,
    level_difficulty,
    level_info,
    next_level,
    on_level,
    prev_level,
    recalc_mapseen,
    set_dunlev_reached,
    u_on_newpos,
    u_on_rndspot,
} from './dungeon.js';
import { more_experienced, newexplevel } from './exper.js';
import { record_achievement } from './insight.js';
import { game } from './gstate.js';
import { dist2 } from './hacklib.js';
import {
    near_capacity,
    notice_all_mons,
    notice_mon_off,
    notice_mon_on,
    set_uinwater,
    switch_terrain,
    u_locomotion,
    u_rooted,
} from './hack.js';
import {
    any_obj_ok,
    freeinv,
    getobj,
    mergable,
    preflight_update_inventory,
    stackobj,
} from './invent.js';
import { maybe_reset_pick } from './lock.js';
import { mklev } from './mklev.js';
import { set_ustuck } from './mon.js';
import { m_at } from './monst.js';
import { PM_ROGUE, PM_TOURIST } from './monsters.js';
import {
    is_pick, objectType, place_object, remove_object, set_bknown,
} from './obj.js';
import { oinit } from './o_init.js';
import { donameFresh, vtense } from './objnam.js';
import {
    BOULDER,
    CORPSE,
    LEASH,
    LOADSTONE,
    MEAT_RING,
    POTION_CLASS,
    RING_CLASS,
} from './objects.js';
import { body_part } from './polyself.js';
import {
    encumber_msg,
    pickup,
    preflight_projected_random_arrival_pickup,
    u_safe_from_fatal_corpse,
} from './pickup.js';
import { com_pager } from './questpgr.js';
import { in_out_region, visible_region_at } from './region.js';
import { getlev } from './restore.js';
import { cloneIsaacContext, createCoreRandom, rn2 } from './rng.js';
import { check_special_room, move_update } from './rooms.js';
import { savelev } from './save.js';
import { preflight_shop_arrival } from './shk.js';
import {
    stairway_at,
    stairway_find_from,
    stairway_free_all,
    u_on_dnstairs,
    u_on_upstairs,
} from './stairs.js';
import { Punished, stucksteed } from './steed.js';
import { enexto, mnexto } from './teleport.js';
import { run_timers } from './timeout.js';
import {
    fill_pit,
    is_lava,
    is_pool,
    reset_utrap,
    t_at,
    uescaped_shaft,
    uteetering_at_seen_pit,
} from './trap.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { cansee, vision_recalc, vision_reset } from './vision.js';
import { welded } from './wield.js';
import { bimanual, setuqwep, setuswapwep, setuwep } from './worn.js';

// A fail-closed boundary for goto_level() branches outside the ordinary
// staircase descent and positive-decimal level teleport ports.
export class UnsupportedLevelChangeError extends Error {
    constructor(reason) {
        super(`unsupported level change: ${reason}`);
        this.name = 'UnsupportedLevelChangeError';
        this.reason = reason;
    }
}

// do.c goto_level() receives earth_sense()'s synchronous pline before
// u_on_rndspot() reaches switch_terrain().  The display port is asynchronous,
// so keep those two effects together at their source-ordered await boundary.
export async function finish_random_arrival_effects(
    earthSenseMessages,
    state = game,
    { message = ttyPline, switchTerrain = switch_terrain } = {},
) {
    for (const line of earthSenseMessages) await message(line, state);
    switchTerrain(state);
}

// Async integration seam for do.c goto_level()'s random-arrival arm. `place`,
// its earthSenseMessage collector, and `switchTerrain` are synchronous like
// their C owners; only terminal message delivery is awaited. Keeping the
// deferral flag and its matching completion together makes the C order
// (earth_sense(), then switch_terrain()) independently testable.
export async function place_random_arrival(
    upflag,
    state = game,
    {
        message = ttyPline,
        switchTerrain = switch_terrain,
        place = u_on_rndspot,
        // The default placement operation is called first in planning mode
        // and then live. It must honor planPositionOnly without live effects;
        // inject a distinct planPlace when an alternate place operation cannot.
        planPlace = place,
    } = {},
) {
    const earthSenseMessages = [];
    const preflightArrival = (x, y, liveState) => {
        preflight_shop_arrival(x, y, liveState);
        // This is a write-set clone, not a general deep clone. move_update()
        // writes u and its room buffers, and projected pickup writes gw.wc;
        // the admission helpers currently only read context, gp, and iflags.
        // The shared level, inventory, and object graph stays read-only. Extend
        // this list before an operation on the projection gains another nested
        // write owner. preflight_shop_arrival() runs on liveState before this
        // clone and must remain mutation-free.
        const projected = {
            ...liveState,
            context: { ...(liveState.context ?? {}) },
            gp: { ...(liveState.gp ?? {}) },
            gw: { ...(liveState.gw ?? {}) },
            iflags: { ...(liveState.iflags ?? {}) },
            u: { ...liveState.u, ux: x, uy: y },
        };
        for (const field of [
            'urooms',
            'urooms0',
            'uentered',
            'ushops',
            'ushops0',
            'ushops_entered',
            'ushops_left',
        ]) projected.u[field] = [...(liveState.u[field] ?? [])];
        move_update(false, projected);
        // Pickup admission refreshes the weight cache, so its API accepts only
        // this projected state and cannot default to the live game.
        preflight_projected_random_arrival_pickup(projected);
    };
    // Atomic arrival admission is a lockstep dry-run/replay protocol. The dry
    // pass must follow exactly the candidate-selection control flow of the
    // live pass, using only the cloned core RNG and mutation-free preflight.
    // Its callbacks must not change any live selection input. Only after that
    // pass succeeds may the identical traversal consume the live RNG and
    // commit its selected coordinate.
    if (planPlace) {
        const plannedRandom = createCoreRandom(
            cloneIsaacContext(state.coreCtx ?? game.coreCtx),
            state,
        );
        planPlace(upflag, state, {
            planPositionOnly: true,
            randomOneBased: plannedRandom.rn1,
            preflightPosition: preflightArrival,
        });
    }
    place(upflag, state, {
        earthSenseMessage: (line) => earthSenseMessages.push(line),
        deferSwitchTerrain: true,
        preflightPosition: preflightArrival,
    });
    await finish_random_arrival_effects(earthSenseMessages, state, {
        message,
        switchTerrain,
    });
}

// C ref: do.c maybe_lvltport_feedback() (2031-2040). goto_level() calls this
// after repainting the destination but before any special-level arrival text,
// so the level-teleport message becomes the top line of the arrival screen.
export async function maybe_lvltport_feedback(state = game) {
    const postMessage = state.gd?.dfr_post_msg;
    if (postMessage
        && postMessage.slice(0, 15).toLowerCase() === 'you materialize') {
        await ttyPline(postMessage, state);
        state.gd.dfr_post_msg = null;
    }
}

// C ref: do.c schedule_goto() (2056-2070). The deferred bit is deliberately
// present even for UTOTYPE_NONE: allmain.c keys off the nonzero field after
// the command stack has unwound.
export function schedule_goto(
    tolev,
    utotype_flags,
    pre_msg,
    post_msg,
    state = game,
) {
    state.u.utotype = utotype_flags | UTOTYPE_DEFERRED;
    assign_level(state.u.utolev, tolev);
    state.gd ??= {};
    if (pre_msg) state.gd.dfr_pre_msg = String(pre_msg);
    if (post_msg) state.gd.dfr_post_msg = String(post_msg);
}

// C ref: do.c deferred_goto() (2074-2102). This is async only because the
// port's messages and goto_level() are async; their order is C's order.
export async function deferred_goto(state = game) {
    const u = state.u;
    state.gd ??= {};
    if (!on_level(u.uz, u.utolev)) {
        const dest = { ...u.utolev };
        const oldlev = { ...u.uz };
        const typmask = u.utotype;

        if (state.gd.dfr_pre_msg)
            await ttyPline(state.gd.dfr_pre_msg, state);
        await goto_level(
            dest,
            Boolean(typmask & UTOTYPE_ATSTAIRS),
            Boolean(typmask & UTOTYPE_FALLING),
            Boolean(typmask & UTOTYPE_PORTAL),
            state,
        );
        if (typmask & UTOTYPE_RMPORTAL) {
            // trap.c deltrap() is not ported. No level-teleport transition
            // carries this flag; portal ejection owns the first live use.
            throw new UnsupportedLevelChangeError(
                'deferred_goto() removing a destination portal',
            );
        }
        if (state.gd.dfr_post_msg) {
            if (!on_level(u.uz, oldlev))
                await ttyPline(state.gd.dfr_post_msg, state);
        }
    }
    u.utotype = UTOTYPE_NONE;
    state.gd.dfr_pre_msg = null;
    state.gd.dfr_post_msg = null;
}

// Renders youprop.h's `(HProperty || EProperty)` shape only. That is not what
// every property macro says, so a caller must read the macro it wants before
// reusing this: Flying (youprop.h:253-255) is
// `((HFlying || EFlying || (u.usteed && is_flyer(u.usteed->data))) && !BFlying)`,
// with a steed term and a blocker this helper models neither.
// js/worn.js setworn() is the port's only writer of an extrinsic property.
function heroPropertyActive(hero, index) {
    const property = hero?.uprops?.[index];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: you.h next2u(), which is `distu(px, py) <= 2`.
function next2u(x, y, state) {
    return dist2(x, y, state.u.ux, state.u.uy) <= 2;
}

// C ref: do.c flooreffects() (161-357). Answers whether an object landing on
// <x,y> is consumed there, and runs whatever the landing does to the square.
//
// Only the answer for an ordinary square is ported: FALSE, with nothing
// written and nothing drawn. Every arm that would destroy, damage, move, merge
// or announce the object stops through the caller's `unsupported` operation
// instead, named for the square or object that reached it.
//
// The arms are tested in C's order, but they are independent `if` statements
// rather than C's if/else-if ladder, so nothing structural stops a later arm
// once an earlier one has fired. What holds C's hiding here is `unsupported`:
// it must not return. A caller that supplies a recording or logging operation
// instead gets every later arm as well, and a FALSE answer that lets the
// caller place an object C would have destroyed. Porting an arm for real ends
// that arrangement -- C's hot-ground potion arm, for one, ends with
// `res = TRUE` -- and the chain has to become `else if` at that point.
//
// C's gb.bhitpos save, set and restore is not modelled. Only erode_obj(),
// reached from the water and lava arms, reads it, and both of those arms stop;
// C restores the saved value on every return, so the pair is invisible to a
// caller that reaches the end.
//
// `verb` is unread while every arm that prints stops. It is kept so a call
// site reads like its C counterpart, and so the message arms can use it
// unchanged when they are ported.
export function flooreffects(obj, x, y, verb, env = {}) {
    const state = env.state ?? game;
    const unsupported = env.unsupported;
    if (typeof unsupported !== 'function')
        throw new TypeError('flooreffects requires an unsupported operation');
    if (obj.where !== OBJ_FREE)
        throw new Error('flooreffects: obj not free');

    // C's own first statement after the panic: water_damage() and its kin walk
    // whatever these point at, so they are cleared before any arm runs.
    obj.nobj = null;
    obj.nexthere = null;

    const location = state.level?.at(x, y);
    const trap = t_at(x, y, state);
    // boulder_hits_pool() decides the first arm and is not ported, so a
    // boulder cannot be told apart from one that lands on ordinary ground.
    if (obj.otyp === BOULDER)
        unsupported(`a boulder landing at <${x},${y}>`);
    if (is_lava(x, y, state)) unsupported('an object landing on lava');
    if (is_pool(x, y, state)) unsupported('an object landing in water');
    if (state.u?.ux === x && state.u?.uy === y && trap
        && (uteetering_at_seen_pit(trap, state)
            || uescaped_shaft(trap, state))) {
        unsupported('an object landing in the pit or shaft the hero is in');
    }
    if (obj.globby) unsupported('a glob landing on the floor');
    if (state.context?.mon_moving && IS_ALTAR(location?.typ)
        && cansee(x, y, state)) {
        unsupported('an object landing on an altar while a monster moves');
    }
    if (obj.oclass === POTION_CLASS
        && Math.trunc(state.level?.flags?.temperature ?? 0) > 0
        && (location?.typ === ROOM || location?.typ === CORR)) {
        unsupported('a potion landing on the hot ground of a hot level');
    }
    return false;
}

// C ref: do.c trycall() (393-400), translated whole. "If obj is neither
// formally identified nor informally called something already, prompt the
// player to call its object type."
//
// Both terms read the shared objects[] row rather than the object: a hero who
// has identified one potion of oil is never asked to name another. That is why
// potion.c potionbreathe()'s tail is silent for a starting inventory, whose
// types u_init.c ini_inv_use_obj() discovered as it handed them over.
export function trycall(obj, state = game) {
    const type = objectType(obj, state);
    if (!type.oc_name_known && !type.oc_uname)
        docall(obj);
}

// Every branch of the drop chain -- dodrop(), drop() and the
// dropx()/dropy()/dropz() tail -- that this port has not translated raises
// this. js/cmd.js failClosedCommandRefusals() lists it, so the segment keeps
// every frame the command already matched instead of failing hard. Callers
// other than the `d` command reach the tail with their own messages, billing,
// equipment, migration and impact behavior still unported.
export class UnsupportedDropError extends Error {
    constructor(reason) {
        super(`unsupported drop: ${reason}`);
        this.name = 'UnsupportedDropError';
        this.reason = reason;
    }
}

function dropEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        hooks: env.hooks ?? {},
    };
}

function requiredDropHook(env, name) {
    const hook = env.hooks[name];
    if (typeof hook !== 'function')
        throw new UnsupportedDropError(`missing ${name} operation`);
    return hook;
}

// The three operations the dropz() tail needs. C calls newsym() and
// encumber_msg() from inside dropz() itself, at do.c:840 and :842, and reaches
// remove_object() through stackobj() -> merged() -> obj_extract_self() when
// the landing object absorbs a pile member. All three are injected because
// display.c, pickup.c and mkobj.c own them.
function dropCommandEnv(state) {
    return {
        state,
        hooks: {
            encumberMessage: encumber_msg,
            extractExternalObject: remove_object,
            newsym,
        },
    };
}

// C ref: do.c dodrop() (28-42), the 'd' command.
export async function dodrop(state = game) {
    let result;

    // C's `*u.ushops` is the first entry of the room list naming the shops the
    // hero stands in; hack.c move_update() maintains it and js/rooms.js stores
    // it as a fixed five-entry array, so an empty list reads as a zero here
    // exactly as an empty string does there.
    if (state.u?.ushops?.[0]) {
        // shk.c sellobj_state() switches the shopkeeper's billing mode either
        // side of the drop, which is what makes a deliberate drop an offer to
        // sell. Both calls stop together, because the drop between them is
        // what they bracket.
        throw new UnsupportedDropError('sellobj_state() inside a shop');
    }
    result = await drop(
        await getobj(
            'drop', any_obj_ok, GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
        ),
        state,
    );
    // do.c:37-38's second `if (*u.ushops)` reads the same value, which the
    // drop cannot change; the arm above has already stopped every hero it
    // would be true for.
    if (result)
        reset_occupations(state);

    return result;
}

// C ref: do.c canletgo() (664-711). Answers whether the hero can let go of an
// object and says why when she cannot. `word` is the verb the message uses;
// C's callers pass "" to ask the question without a message, and every test on
// it is written out here even though the one ported caller passes "drop".
export async function canletgo(obj, word, state = game) {
    if (obj.owornmask & (W_ARMOR | W_ACCESSORY)) {
        if (word) {
            await ttyNorep(
                `You cannot ${word} ${something} you are wearing.`, state,
            );
        }
        return false;
    }
    if (obj === state.uwep && welded(state.uwep, state)) {
        /* no weldmsg(), so uwep->bknown might become set silently
           if word is "" */
        if (word) {
            let hand = body_part(HAND, state.youmonst);

            if (bimanual(state.uwep, state))
                hand = makeplural(hand);
            await ttyNorep(
                `You cannot ${word} ${something} welded to your ${hand}.`,
                state,
            );
        }
        return false;
    }
    if (obj.otyp === LOADSTONE && obj.cursed) {
        /* getobj() kludge sets corpsenm to user's specified count
           when refusing to split a stack of cursed loadstones */
        if (word) {
            /* getobj() ignores a count for throwing since that is
               implicitly forced to be 1; replicate its kludge... */
            if (word === 'throw' && obj.quan > 1)
                obj.corpsenm = 1;
            await ttyPline(
                `For some reason, you cannot ${word}`
                + `${obj.corpsenm ? ' any of' : ''}`
                + ` the stone${plur(obj.quan)}!`,
                state,
            );
        }
        obj.corpsenm = 0; /* reset */
        set_bknown(obj, 1, { state });
        return false;
    }
    if (obj.otyp === LEASH && obj.leashmon !== 0) {
        if (word) {
            await ttyPline(
                `The leash is tied around your ${body_part(HAND, state.youmonst)}.`,
                state,
            );
        }
        return false;
    }
    if (obj.owornmask & W_SADDLE) {
        if (word) {
            await ttyPline(
                `You cannot ${word} ${something} you are sitting on.`, state,
            );
        }
        return false;
    }
    return true;
}

// C ref: do.c drop() (713-780), staticfn. Five of its arms stop rather than
// run, each named at the throw. Four of them can be reached; the weldmsg() one
// is dead in C as well and says so where it stands. What remains is the hero
// who is standing on reachable ordinary floor and lets one object go.
//
// C's altar arm is not a stop of its own. do.c:774 only suppresses the message
// there and falls through to dropx(), whose doaltarobj() is unported, so
// preflight_dropx() below refuses the square and this function reproduces the
// suppressed message either way.
async function drop(obj, state = game) {
    if (!obj)
        return ECMD_FAIL;
    if (!await canletgo(obj, 'drop', state))
        return ECMD_FAIL;
    if (obj.otyp === CORPSE
        && !u_safe_from_fatal_corpse(obj, st_all, state)) {
        // do.c:720-721 better_not_try_to_drop_that() (946-962), which asks
        // paranoid_ynq() to confirm before a bare-handed hero drops a corpse
        // that could petrify her.  u_safe_from_fatal_corpse() owns the source
        // predicate; harmless or safely handled corpses return true and follow
        // the ordinary drop path, while an unsafe corpse reaches the unported
        // prompt and still stops here.
        throw new UnsupportedDropError('better_not_try_to_drop_that()');
    }
    if (obj === state.uwep) {
        if (welded(state.uwep, state)) {
            // do.c:724 weldmsg() (wield.c:1061-1074), which names the weapon
            // with objnam.c Yobjnam2(); yname() under it is not ported.
            //
            // Unreachable, in C too: canletgo() at :715 tests the identical
            // `obj == uwep && welded(uwep)` pair one branch earlier and
            // returns FALSE, so drop() has already answered ECMD_FAIL with the
            // Norep at do.c:677. The dead test is written out because the port
            // keeps C's structure; deleting it changes nothing.
            throw new UnsupportedDropError('weldmsg()');
        }
        setuwep(null, setwornEnv(state));
    }
    if (obj === state.uquiver) {
        setuqwep(null, setwornEnv(state));
    }
    if (obj === state.uswapwep) {
        setuswapwep(null, setwornEnv(state));
    }

    if (state.u.uswallow) {
        // do.c:736-751, the engulfer's barrier: the message needs
        // do_name.c mon_nam() and mondata.c digests(), and dropz() then puts
        // the object into the engulfer's inventory through mpickobj().
        throw new UnsupportedDropError('a swallowed hero');
    } else {
        const here = state.level.at(state.u.ux, state.u.uy);
        if ((obj.oclass === RING_CLASS || obj.otyp === MEAT_RING)
            && IS_SINK(here.typ)) {
            // do.c:755 dosinkring() (do.c:534-661), which identifies the ring
            // by what the sink does and then buries, drops or uses it up.
            throw new UnsupportedDropError('dosinkring()');
        }
        if (!can_reach_floor(true, state)) {
            // do.c:758-773, the levitating or trapped hero: finesse_ahriman(),
            // hitfloor() and float_down() are all unported.
            throw new UnsupportedDropError(
                'hitfloor() from an unreachable floor',
            );
        }
        if (!IS_ALTAR(here.typ) && state.flags.verbose)
            await ttyPline(`You drop ${donameFresh(obj, state)}.`, state);
    }
    obj.how_lost = LOST_DROPPED;
    await dropx(obj, dropCommandEnv(state));
    return ECMD_TIME;
}

// drop() is staticfn in do.c and its two terrain arms -- the sink at :753-757
// and the unreachable floor at :758-773 -- refuse rather than run. Neither is
// reachable from a recorded case: no ported input walks the hero onto a sink,
// and none leaves her standing on a seen pit or shaft, because js/hack.js
// ports dotrap()'s bear-trap arm alone and nothing else writes u.utrap. It is
// exported so a test can hand it those two squares directly.
export const _dropInternals = Object.freeze({ drop });

// Complete admission check for the source-inert ground subset below: what
// dropx()'s ship_object() and doaltarobj(), and dropz()'s flooreffects(),
// container impact, zombie disturbance, ball, shop and blind-levitation arms
// would each need. drop() above reaches it with the message already printed,
// which is where C's own dropx() call sits; the wish path calls it earlier,
// while the object is still OBJ_FREE and before observe_object(), its failure
// message, or addinv() can change visible state. The returned one-shot
// admission lets that caller execute the approved tail after addinv() without
// repeating checks against state changed by the admitted transaction.
export function preflight_dropx(obj, env = {}) {
    const normalized = dropEnv(env);
    const { state } = normalized;
    const u = state.u;
    if (!obj || typeof obj !== 'object')
        throw new TypeError('preflight_dropx requires an object');
    if (obj.where !== OBJ_FREE && obj.where !== OBJ_INVENT)
        throw new UnsupportedDropError(`object ownership ${obj.where}`);
    // stackobj() preserves the newly dropped object and absorbs an older pile
    // member into it.  A light or glob on the survivor has merge effects that
    // are not ported.  A timer does not: it remains attached to the survivor,
    // exactly as a corpse timer follows an ordinary drop.  The pile walk below
    // still refuses a timed member that merged() would absorb and free.
    if (obj.lamplit || obj.globby)
        throw new UnsupportedDropError('a lit or globby object');
    // obfree()'s remaining operations are reached by an object the drop chain
    // already stops: canletgo() refuses a leash tied to a pet, the unpaid test
    // below refuses a billed object and the shop-level test refuses an unpaid
    // merge target. Only the box whose lock the hero is picking is left.
    if (state.xlock?.box === obj)
        throw new UnsupportedDropError('the box whose lock is being picked');
    if (!u || u.uswallow)
        throw new UnsupportedDropError('a swallowed hero');
    // do.c dropz():836 maps an object specially only for Blind && Levitation.
    // can_reach_floor(TRUE) below already refuses that pair; grounded blindness
    // reaches the ordinary place_object()/stackobj()/newsym() tail unchanged.
    // Hallucination still changes newsym()'s display draws and remains outside
    // this admission.
    const hallucinating = heroPropertyActive(u, HALLUC)
        && !heroPropertyActive(u, HALLUC_RES);
    if (hallucinating)
        throw new UnsupportedDropError('hallucinated display');
    if (u.uinwater || on_level(u.uz, state.air_level)
        || on_level(u.uz, state.water_level)) {
        throw new UnsupportedDropError('underwater or special-level display');
    }
    if (!can_reach_floor(true, state))
        throw new UnsupportedDropError('an unreachable floor');
    if (obj.owornmask || state.uwep === obj || state.uquiver === obj
        || state.uswapwep === obj || state.uball === obj) {
        throw new UnsupportedDropError('a worn or attached object');
    }
    if (obj.unpaid)
        throw new UnsupportedDropError('an unpaid object');

    const { ux: x, uy: y } = u;
    const location = state.level?.at(x, y);
    if (!location)
        throw new UnsupportedDropError('non-ordinary terrain');
    // dropx() runs ship_object() before its altar arm. dokick.c down_gate()
    // selects only a down staircase or ladder; an up stairway returns
    // MIGR_NOWHERE and reaches the ordinary drop tail.
    const stway = stairway_at(x, y, state);
    if (stway && !stway.up)
        throw new UnsupportedDropError('shipping down stairs or a ladder');
    if (IS_ALTAR(location.typ))
        throw new UnsupportedDropError('an altar');
    // sellobj() is square-specific, but its location and billing effects are
    // not ported. Conservatively exclude the whole level when any shop exists.
    if (state.level.flags?.has_shop)
        throw new UnsupportedDropError('a shop level');
    // The remaining square effects are reached from dropz()'s flooreffects().
    if (t_at(x, y, state))
        throw new UnsupportedDropError('shipping or floor effects at a trap');
    if (is_lava(x, y, state) || is_pool(x, y, state))
        throw new UnsupportedDropError('liquid terrain');
    // flooreffects()'s first arm reads the object rather than the square, and
    // it sits past freeinv() in dropx(): without it here, a caller that has
    // admitted the drop prints its message and empties the inventory slot
    // before discovering the stop. A wished boulder is how that is reached.
    // The one other object-reading arm, the potion on hot ground at :399-403,
    // needs level.flags.temperature above 0, which only a Lua level
    // description sets and js/mklev.js:271 leaves at 0, so it stays where
    // flooreffects() has it.
    if (obj.otyp === BOULDER)
        throw new UnsupportedDropError('a boulder landing on the floor');
    // A doorway and an up stairway add no flooreffects() branch. They are
    // admitted for the live decorated-pile differential, while every other
    // special terrain remains at this boundary.
    if (location.typ !== ROOM && location.typ !== CORR
        && location.typ !== DOOR && !stway?.up) {
        throw new UnsupportedDropError('non-ordinary terrain');
    }
    if (engr_at(x, y, state))
        throw new UnsupportedDropError('an engraving under the drop');
    if (visible_region_at(x, y, state))
        throw new UnsupportedDropError('a visible region over the drop');
    for (let buried = state.level.buriedobjlist; buried; buried = buried.nobj) {
        // hack.c impact_disturbs_zombies() only changes a timed corpse within
        // one square. A matching timer still needs peek_timer(), so
        // conservatively refuse every nearby timed corpse; unrelated buried
        // objects make the loop inert.
        if (buried.otyp === CORPSE && buried.timed
            && buried.ox >= x - 1 && buried.ox <= x + 1
            && buried.oy >= y - 1 && buried.oy <= y + 1) {
            throw new UnsupportedDropError(
                'impact disturbing a nearby buried corpse',
            );
        }
    }
    if (!Array.isArray(state.level.objects?.[x]))
        throw new UnsupportedDropError('a missing floor-object grid');
    // invent.c stackobj() (4366-4375) hands this object to merged() (814-948)
    // as the survivor and each pile member in turn as the object absorbed, and
    // merged() reads lamplit and timed on that member at 851-854 and globby at
    // 928. The test above answers for the wrong side of the merge on its own:
    // mergable() forces lamplit to match and returns early for a glob, but
    // rejects a timer mismatch only for EGG and a revivable CORPSE. mergable()
    // decides which members merged() can reach, so it is the gate here too.
    for (let member = state.level.objects[x][y] ?? null; member;
        member = member.nexthere) {
        if (!member.lamplit && !member.timed && !member.globby) continue;
        if (mergable(obj, member, normalized)) {
            throw new UnsupportedDropError(
                'a lit, timed, or globby object in the floor pile',
            );
        }
    }

    preflight_update_inventory(normalized);
    requiredDropHook(normalized, 'newsym');
    requiredDropHook(normalized, 'encumberMessage');
    // stackobj() reaches obj_extract_self() for the pile member it absorbs,
    // and that member is on the floor. Required unconditionally rather than
    // only for a non-empty pile, so that admitting the drop does not depend on
    // what another object happens to be lying there.
    requiredDropHook(normalized, 'extractExternalObject');
    return {
        consumed: false,
        initialWhere: obj.where,
        normalized,
        object: obj,
        state,
    };
}

function consumeDropAdmission(obj, env, admission) {
    const normalized = dropEnv(env);
    if (admission.object !== obj)
        throw new Error('drop admission belongs to another object');
    if (admission.state !== normalized.state)
        throw new Error('drop admission belongs to another state');
    if (admission.consumed)
        throw new Error('drop admission was already consumed');
    if (admission.normalized.hooks !== normalized.hooks)
        throw new Error('drop admission belongs to another hook set');
    if (obj.where !== OBJ_INVENT
        || (admission.initialWhere !== OBJ_FREE
            && admission.initialWhere !== OBJ_INVENT)) {
        throw new Error('drop admission is stale');
    }
    admission.consumed = true;
    return admission.normalized;
}

// C ref: do.c dropx() (785-797). ship_object() and doaltarobj() are absent
// because preflight_dropx() admits neither a down gate nor an altar. An up
// stairway makes down_gate() return MIGR_NOWHERE, so ship_object() is inert.
export async function dropx(obj, env = {}, prepared = null) {
    const admission = prepared ?? preflight_dropx(obj, env);
    const normalized = consumeDropAdmission(obj, env, admission);
    freeinv(obj, normalized);
    await dropzAdmitted(obj, normalized);
}

// C ref: do.c dropy() (799-804).
export async function dropy(obj, env = {}) {
    await dropz(obj, false, env);
}

async function dropzAdmitted(obj, normalized) {
    if (obj.where !== OBJ_FREE)
        throw new Error('dropz requires a free object');
    if (flooreffects(obj, normalized.state.u.ux, normalized.state.u.uy,
                     'drop', {
                         state: normalized.state,
                         unsupported: (reason) => {
                             throw new UnsupportedDropError(reason);
                         },
                     })) {
        return;
    }
    place_object(
        obj,
        normalized.state.u.ux,
        normalized.state.u.uy,
        normalized,
    );
    stackobj(obj, normalized);
    requiredDropHook(normalized, 'newsym')(
        normalized.state.u.ux,
        normalized.state.u.uy,
        normalized.state,
    );
    await requiredDropHook(normalized, 'encumberMessage')(normalized.state);
}

// C ref: do.c dropz() (806-842), source-inert shopless ground and with_impact
// FALSE. Its three equipment clears at 809-814 are inert here: preflight_dropx()
// refuses an object still in any of those slots, and do.c drop() has run the
// same three calls before reaching this point. So are drop_ball(), sellobj()
// and the blind-levitation map_object(), each refused by the admission above.
// stackobj() can merge, which is why the admission checks what a merge would
// ask for. ROOM, CORR, a doorway, and an up stairway therefore share the
// source calls from place_object() through newsym().
export async function dropz(obj, with_impact, env = {}) {
    const normalized = dropEnv(env);
    const { state } = normalized;
    if (with_impact)
        throw new UnsupportedDropError('container impact');
    if (obj.where !== OBJ_FREE)
        throw new Error('dropz requires a free object');
    // Recheck the post-freeinv state without requiring inventory ownership.
    preflight_dropx(obj, normalized);
    await dropzAdmitted(obj, normalized);
}

// C ref: do.c u_stuck_cannot_go() (1109-1128). Its release arm calls
// mon.c set_ustuck() and do_name.c mon_nam(); its holding arm needs
// mondata.c digests(). Neither is written out, because js/mon.js set_ustuck()
// has one caller in the port, js/teleport.js, and it passes null, so u.ustuck
// is null on every admitted path and this function always answers FALSE.
function u_stuck_cannot_go(updn, state = game) {
    if (state.u?.ustuck) {
        throw new UnsupportedLevelChangeError(
            `u_stuck_cannot_go("${updn}") with a hero who is held`,
        );
    }
    return false;
}

// C ref: do.c dodown() (1129-1294), the '>' command.
//
// Five of its arms stop rather than run, each named at the throw. What remains
// is the ordinary answer for a hero standing where there is no way down:
// "You can't go down here." with no turn spent.
export async function dodown(state = game) {
    const u = state.u;
    let trap = null;

    set_move_cmd(DIR_DOWN, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    if (stucksteed(true, state)) return ECMD_OK;

    let stairs_down = false;
    let ladder_down = false;
    const stway = stairway_at(u.ux, u.uy, state);
    if (stway && !stway.up) {
        stairs_down = !stway.isladder;
        ladder_down = !stairs_down;
    }

    // do.c:1154-1201. The whole levitation arm, which ends controlled
    // levitation through float_down() and rnz(), and otherwise reports what
    // the hero is floating above through surface() and floating_above().
    // Nothing is ported. js/worn.js setworn() is the port's only writer of an
    // extrinsic property and no starting inventory grants LEVITATION, and
    // js/u_init_inventory_attrs.js grants only JUMPING intrinsically, so
    // neither field can be nonzero here.
    const levitation = u.uprops?.[LEVITATION];
    if (levitation?.intrinsic || levitation?.extrinsic) {
        throw new UnsupportedLevelChangeError(
            'dodown() with a levitating hero',
        );
    }

    // do.c:1204-1218, the arm that drops a hiding polymorphed hero out of the
    // ceiling. It needs mondata.c ceiling_hider(), and its piercer branch
    // reaches pooleffects(), pickup() and dotrap(). The guard is wider than
    // C's three-term test on purpose: js/u_init.js is the port's only writer
    // of u.umonnum and it sets u.umonnum === u.umonster, so Upolyd() is false
    // for every hero the port can build and the extra terms would only make
    // the stop harder to reach.
    if (Upolyd(u)) {
        throw new UnsupportedLevelChangeError(
            'dodown() with a polymorphed hero',
        );
    }

    if (u_stuck_cannot_go('down', state)) return ECMD_TIME;

    if (!stairs_down && !ladder_down) {
        trap = t_at(u.ux, u.uy, state);
        if (trap && (uteetering_at_seen_pit(trap, state)
                     || uescaped_shaft(trap, state))) {
            // do.c:1227. dotrap(trap, TOOKPLUNGE) drops the hero down a pit
            // she is teetering on or through a hole she is standing over;
            // both end in a level change or a trap effect this slice excludes.
            throw new UnsupportedLevelChangeError(
                'dodown() plunging into a pit, hole or trap door',
            );
        } else if (!trap || !is_hole(trap.ttyp)
                   || !Can_fall_thru(u.uz, state) || !trap.tseen) {
            if (state.flags?.autodig && !state.context?.nopick
                && state.uwep && is_pick(state.uwep, state)) {
                // do.c:1233. dig.c use_pick_axe2() digs down through the
                // floor, which digging owns.
                throw new UnsupportedLevelChangeError(
                    'dodown() digging down with a wielded pick-axe',
                );
            }
            await ttyPline(
                'You can\'t go down here'
                + (trap && trap.ttyp === VIBRATING_SQUARE ? ' yet' : '')
                + '.',
                state,
            );
            return ECMD_OK;
        }
    }

    // do.c:1242-1249. The Valley is the gate to Gehennom and asks for
    // confirmation through y_n(); no level this port generates is the Valley.
    if (state.valley_level && on_level(state.valley_level, u.uz)
        && !u.uevent?.gehennom_entered) {
        throw new UnsupportedLevelChangeError(
            'dodown() at the gate to Gehennom',
        );
    }

    if (!next_to_u(state)) {
        await ttyPline('You are held back by your pet!', state);
        return ECMD_OK;
    }

    if (trap) {
        // do.c:1256-1280. A hole or trap door prints "You jump through the
        // trap door." through u_locomotion(), and asks a huge hero to squeeze
        // through with y_n(), rn2(3) and losehp(). None of that is ported, and
        // do.c:1281-1287's goto_hell() and clamp_hole_destination() arms sit
        // behind the same trap.
        throw new UnsupportedLevelChangeError(
            'dodown() through a hole or trap door',
        );
    }

    // do.c:1288-1291. `trap` is null on every admitted path above, so this is
    // the arm that runs and next_level() is called with at_stairs TRUE.
    state.ga ??= {};
    state.ga.at_ladder = state.level?.at(u.ux, u.uy)?.typ === LADDER;
    await next_level(!trap, state, { gotoLevel: goto_level });
    state.ga.at_ladder = false;
    return ECMD_TIME;
}

// C ref: do.c doup() (1298-1344). The '<' command's staircase ascent.
// Precondition checks mirror dodown(). The pit arm calls climb_pit(), which
// is not ported; the witness hero is not in a pit.
export async function doup(state = game) {
    const u = state.u;
    const stway = stairway_at(u.ux, u.uy, state);

    set_move_cmd(DIR_UP, 0, state);

    if (await u_rooted(state)) return ECMD_TIME;

    // do.c:1308-1311. "up" to get out of a pit.
    if (u.utrap && u.utraptype === TT_PIT) {
        // climb_pit() is not ported. Defer.
        throw new UnsupportedLevelChangeError(
            'doup() climbing out of a pit',
        );
    }

    if (!stway || (stway && !stway.up)) {
        await ttyPline('You can\'t go up here.', state);
        return ECMD_OK;
    }
    if (stucksteed(true, state)) {
        return ECMD_OK;
    }

    if (u_stuck_cannot_go('up', state)) return ECMD_TIME;

    if (near_capacity(state) > SLT_ENCUMBER) {
        /* No levitation check; inv_weight() already allows for it */
        await ttyPline(
            `Your load is too heavy to climb the ${
                state.level?.at(u.ux, u.uy)?.typ === STAIRS
                    ? 'stairs' : 'ladder'
            }.`,
            state,
        );
        return ECMD_TIME;
    }
    if (ledger_no(u.uz, state) === 1) {
        // do.c:1331-1335. Leaving the dungeon. y_n("Beware, there will be
        // no return! Still climb?"). The debug fuzzer returns ECMD_OK; the
        // y_n answer is unported.
        throw new UnsupportedLevelChangeError(
            'doup() at ledger 1 (leaving the dungeon)',
        );
    }
    if (!next_to_u(state)) {
        await ttyPline('You are held back by your pet!', state);
        return ECMD_OK;
    }
    state.ga ??= {};
    state.ga.at_ladder = state.level?.at(u.ux, u.uy)?.typ === LADDER;
    await prev_level(true, state, { gotoLevel: goto_level });
    state.ga.at_ladder = false;
    return ECMD_TIME;
}

// C ref: do.c goto_level() (1478-1998), for first-time arrival on an ordinary
// main-dungeon level through stairs or positive-decimal level teleport.
//
// Covered: the destination clamp and dungeon-change guards at 1501-1519, the
// mysterious force at 1541-1573, the quest guard at 1578-1581, the
// same-level return at 1583, the tether at 1594, the context discard at
// 1601-1622, keepdogs() at 1624, vision_recalc(2) at 1631, the level teardown
// at 1634-1664, the level-identity update at 1665-1690, mklev() at 1699, the
// hero placement and transit message at 1766-1800, the deliveries at
// 1812-1825, the repaint at 1835-1839, the arrival messages at 1843-1965 and
// the arrival tail at 1967-1993.
//
// Not covered, each named at its site: the endgame, tutorial, portal, falling,
// punished, Gehennom, Knox, Mines, Sokoban and Rogue-level arms. The getlev()
// reload at 1704-1711 and the ascending-at-stairs placement and message at
// 1747-1764 are now ported. Common Quest-entrance, shop-entry, object pickup,
// and dwarf earth-sense arrival effects are included below.
//
// One caution about `state`: In_endgame() and In_tutorial() are js/const.js's
// renderings of the dungeon.h macros and read the module-level game. They
// ignore the state passed here, as every other caller of those two does. On
// the live path the two are the same object.
export async function goto_level(
    newlevel,
    at_stairs,
    falling,
    portal,
    state = game,
) {
    const u = state.u;
    const up = depth(newlevel, state) < depth(u.uz, state);
    const newdungeon = u.uz.dnum !== newlevel.dnum;
    // C captures this before anything runs, so it reads the level being left.
    const prev_temperature = state.level.flags.temperature;
    const was_in_W_tower = In_W_tower(u.ux, u.uy, u.uz, state);

    if (dunlev(newlevel) > dunlevs_in_dungeon(newlevel, state))
        newlevel.dlevel = dunlevs_in_dungeon(newlevel, state);
    if (newdungeon) {
        // do.c:1504-1515. The endgame arm needs the Amulet; both tutorial
        // arms need the tutorial dungeon, which js/tutorial_startup.js can
        // enter only from the startup menu. Each of the three would rewrite
        // `newlevel`, `up` or the tutorial flag before the rest runs.
        if (In_endgame(newlevel)
            || In_tutorial(newlevel)
            || In_tutorial(u.uz)) {
            throw new UnsupportedLevelChangeError(
                'goto_level() entering the endgame or the tutorial',
            );
        }
    }
    if (ledger_no(newlevel, state) <= 0) {
        // do.c:1518-1519, done(ESCAPED). C's comment says a negative ledger
        // number is impossible; zero means leaving the dungeon entirely.
        throw new UnsupportedLevelChangeError(
            'goto_level() escaping the dungeon',
        );
    }

    // do.c:1541-1573, the "mysterious force" that drags an Amulet-carrying
    // hero back down through Gehennom. Its body makes four random-number
    // calls, so the guard is written out in full: assuming it dead would hide
    // the day a dungeon state satisfies it.
    if (In_hell(u.uz, state) && up && u.uhave?.amulet && !newdungeon && !portal
        && dunlev(u.uz) < dunlevs_in_dungeon(u.uz, state) - 3) {
        throw new UnsupportedLevelChangeError(
            'goto_level() meeting the mysterious force',
        );
    }

    // do.c:1578-1581. quest.c ok_to_quest() is unported, and so is the
    // "A mysterious force prevents you from descending." message it gates.
    if (state.qstart_level && on_level(u.uz, state.qstart_level)
        && !newdungeon) {
        throw new UnsupportedLevelChangeError(
            'goto_level() leaving the first quest level',
        );
    }

    if (on_level(newlevel, u.uz)) return; /* this can happen */

    // do.c:1586-1591 runs the NHCB_LVL_LEAVE Lua callback. No file under
    // nethack-c/upstream/dat/ registers one, so nhcb_counts[] is zero for
    // every level this port loads and the block is dead.

    // do.c:1593-1595, tethered movement.
    if (u.utrap && u.utraptype === TT_BURIEDBALL) {
        throw new UnsupportedLevelChangeError(
            'goto_level() with the hero tethered to a buried ball',
        );
    }

    // do.c:1597-1599 calls currentlevel_rewrite(), whose two operations have
    // no port counterpart: mark_synch() is tty_mark_synch(), an fflush() of
    // stdout that changes no cell, and create_levelfile() opens the level file
    // this port does not write, because its levels stay in memory.
    //
    // create_levelfile() also sets LFILE_EXISTS on this level's ledger, which
    // is the flag goto_level() reads at 1692 to choose getlev() over mklev().
    // Nothing writes it here, so every descent generates; the restore path
    // owns both the flag and the reload it selects.

    // The context discard, do.c:1601-1622. It drops what belongs to the level
    // being left and keeps what travels with the hero.
    maybe_reset_pick(null, state);
    reset_trapset(state);
    // do.c:1607 clears iflags.travelcc, the travel command's destination
    // cache. The travel command is not ported and neither is that field.
    if (state.context) {
        state.context.polearm ??= {};
        state.context.polearm.hitmon = null;
    }
    // do.c:1609-1610 is a comment, not code: the digging context is level
    // aware and is deliberately left intact.

    if (falling) {
        // do.c:1612-1613 impact_drop(), which drops what was resting on the
        // trap door down with the hero. Only a fall reaches it.
        throw new UnsupportedLevelChangeError(
            'goto_level() falling to the level below',
        );
    }

    await check_special_room(true, state);
    if (Punished(state)) {
        // do.c:1616-1617, Punished -> ball.c unplacebc().
        throw new UnsupportedLevelChangeError(
            'goto_level() with a punished hero',
        );
    }
    reset_utrap(false, state);
    fill_pit(u.ux, u.uy, state);
    set_ustuck(null, state);
    set_uinwater(false, state);
    u.uundetected = false;
    if (!state.iflags?.nofollowers) keepdogs(false, { state });

    // do.c:1625 refreshes the departing level's overview before savelev()
    // stores the level itself.
    recalc_mapseen(state);

    vision_recalc(2, { state });

    // do.c:1652. `cant_go_back` needs the endgame or the tutorial, both
    // refused above, so the level being left is saved rather than discarded
    // and its monsters are aged first.
    update_mlstmv(state);
    savelev(ledger_no(u.uz, state), state);

    // do.c:1665. assign_graphics() swaps the whole symbol set for a Rogue
    // level. dat/dungeon.lua puts that level in the main dungeon between
    // depths 15 and 18, so no descent from D:1 reaches it.
    // do.c:1667 check_gold_symbol() writes iflags.invis_goldsym from
    // gs.showsyms[COIN_CLASS]. Neither the flag nor a reader of it exists in
    // the port, and the symbol set does not change across a level change, so
    // the value it would compute is the one startup already computed.
    // do.c:1668-1672 recbranch_mapseen() records a branch crossing; this
    // descent keeps u.uz.dnum, which is the test C applies.

    // dungeon.c assign_level() copies the two fields into the destination
    // struct rather than replacing it, so anything holding a reference to
    // u.uz, u.uz0 or u.utolev keeps seeing the live value.
    assign_level(u.uz0, u.uz);
    assign_level(u.uz, newlevel);
    assign_level(u.utolev, newlevel);
    u.utotype = UTOTYPE_NONE;
    if (!builds_up(u.uz, state)) { /* usual case */
        if (dunlev(u.uz) > dunlev_reached(u.uz, state))
            set_dunlev_reached(u.uz, dunlev(u.uz), state);
    } else {
        // The up-building arm serves Sokoban and the endgame, which a
        // staircase from D:1 cannot reach; taking it would need a dungeon
        // whose entry level is its deepest.
        throw new UnsupportedLevelChangeError(
            'goto_level() into an up-building dungeon',
        );
    }

    stairway_free_all(state);
    // do.c:1688-1690 clears the default arrival areas a special level may
    // override. js/teleport.js reads both through teleJumpOk().
    state.updest = {};
    state.dndest = {};

    const new_ledger = ledger_no(newlevel, state);
    let isNew = false;
    if (!(level_info(new_ledger, state).flags & LFILE_EXISTS)) {
        if (level_info(new_ledger, state).flags & VISITED) {
            // C's impossible() clears the flag and carries on; a level marked
            // visited with no file behind it means the port lost a level.
            throw new Error('goto_level: returning to discarded level?');
        }
        await mklev();
        isNew = true;
        // do.c:1701 familiar = bones_include_name(svp.plname). The port loads
        // no bones file -- js/mklev.js getbones() always answers FALSE -- so
        // svl.level.bonesinfo is empty and no name can match.
    } else {
        // do.c:1704-1711, the reload: open_levelfile(), two reseed_random()
        // calls, getlev() and oinit().
        //
        // The two reseed_random() calls are no-ops in the patched C build
        // (has_strong_rngseed is false), so they produce no RNG draws.
        // getlev() restores the level from the in-memory snapshot that
        // savelev() saved. oinit() reassigns gem probabilities for the new
        // depth.
        getlev(new_ledger, state);
        oinit(state);
    }

    // do.c:1713 reglyph_darkroom() rewrites the remembered glyph of every
    // square that changed lit-corridor or dark-room appearance. mklev() has
    // just replaced the map, so every square is unexplored and no arm of its
    // double loop matches. Its closing gs.showsyms[S_darkroom] assignment
    // depends only on flags.dark_room and iflags.use_color, neither of which a
    // level change alters.
    set_uinwater(false, state);
    vision_reset(state);
    state.vision_full_recalc = 0;
    await flush_screen(-1); /* ensure all map flushes are postponed */

    // do.c:1720-1745 places the hero at the destination portal, and
    // do.c:1802-1810 at a random spot after a fall or a level teleport.
    if (!at_stairs) {
        await place_random_arrival(
            (up ? 1 : 0) | (was_in_W_tower ? 2 : 0),
            state,
        );
    } else if (at_stairs && up) {
        // do.c:1747-1764. Ascending at stairs: place the hero on the
        // downstair of the destination level (the stairway that connects
        // back to the level she came from).
        const stway = stairway_find_from(u.uz0, state.ga?.at_ladder, state);
        if (stway) {
            u_on_newpos(stway.sx, stway.sy, state);
            stway.u_traversed = true;
        } else if (newdungeon) {
            // u_on_sstairs(1) places the hero on a branch staircase whose
            // direction is "up" (ascending implies the branch connects
            // upward).
            throw new UnsupportedLevelChangeError(
                'goto_level() ascending into a new dungeon',
            );
        } else {
            u_on_dnstairs(state);
        }
        // do.c:1758-1764. Transit message for ascending at stairs.
        // great_effort = (Punished && !Levitation) -- the punished arm is
        // refused at do.c:1616 above, so great_effort is always false here.
        if (Punished(state)) {
            throw new UnsupportedLevelChangeError(
                'goto_level() ascending while punished',
            );
        }
        if (state.flags?.verbose) {
            await ttyPline(
                `You ${u_locomotion('climb', state)} up the ${
                    state.ga?.at_ladder ? 'ladder' : 'stairs'
                }.`,
                state,
            );
        }
    } else if (at_stairs) {
        // do.c:1765-1800. Descending at stairs.
        const stway = stairway_find_from(u.uz0, state.ga?.at_ladder, state);
        if (stway) {
            u_on_newpos(stway.sx, stway.sy, state);
            stway.u_traversed = true;
        } else if (newdungeon) {
            // u_on_sstairs(0) places the hero on a branch staircase. A
            // same-dungeon descent always makes an up staircase instead.
            throw new UnsupportedLevelChangeError(
                'goto_level() arriving in a new dungeon',
            );
        } else {
            u_on_upstairs(state);
        }
        if (!u.dz) {
            /* stayed on same level? (no transit effects) */
        } else if (heroPropertyActive(u, FLYING)) {
            // do.c:1776. "You fly down the stairs." This tests only Flying's
            // (HFlying || EFlying) half: the steed term cannot fire because
            // stucksteed() refuses a mounted hero above, and no port path
            // writes BFlying. Widen it to the whole macro when either becomes
            // reachable. No hero the port builds can fly.
            throw new UnsupportedLevelChangeError(
                'goto_level() with a flying hero',
            );
        } else if (near_capacity(state) > UNENCUMBERED
                   || Punished(state) || heroPropertyActive(u, FUMBLING)) {
            // do.c:1783-1795, the fall. It calls rnd(3) through losehp() and
            // drag_down()/ballrelease() for a punished hero. Ordinary pickup
            // can now make the burdened arm reachable, but the complete
            // stair-fall behavior remains excluded; the punished arm is
            // already refused at do.c:1616 above.
            throw new UnsupportedLevelChangeError(
                'goto_level() falling down the stairs',
            );
        } else if (state.flags?.verbose) { /* ordinary descent */
            await ttyPline(
                state.ga?.at_ladder
                    ? 'You climb down the ladder.'
                    : 'You descend the stairs.',
                state,
            );
        }
    }

    // do.c:1812 placebc() puts a punished hero's ball and chain down; u.uball
    // is refused at do.c:1616.
    obj_delivery(false, state);
    losedogs({ state });
    kill_genocided_monsters(state);
    // "Expire all timers that have gone off while away. Must be after
    // migrating monsters and objects are delivered."
    // The arrival is never a dry run, so a rotting floor corpse draws through
    // the live newsym().
    run_timers(state, {
        newsym,
        site: "goto_level()'s run_timers()",
    });

    const arrivalOccupant = m_at(u.ux, u.uy, state);
    if (arrivalOccupant) u_collide_m(arrivalOccupant, state);

    // do.c:1829-1832 moves the water level's bubbles and the fumaroles of a
    // level whose Lua sets that flag. Neither exists in the main dungeon above
    // the Plane of Water.

    /* Reset the screen. */
    vision_reset(state);
    // do.c:1836 reset_glyphmap(gm_levelchange) recomputes the glyph-to-symbol
    // table and its per-level Rogue flag. The port maps each glyph as it draws
    // it rather than keeping the table, and Is_rogue_level is false either
    // side of this descent, so the table it would rebuild is unchanged.
    notice_mon_off(state);
    // display.c docrt() brackets its repaint with vision_recalc(2) and
    // vision_recalc(0); js/display.js docrt() leaves both to its callers, as
    // allmain.c newgame() and moveloop() already do here. This is the pair
    // that gives the hero a map of a level she has never seen.
    vision_recalc(2, { state });
    vision_recalc(0, { state });
    await docrt(); /* does a full vision recalc */
    await flush_screen(-1);

    if (state.gd?.dfr_post_msg)
        await maybe_lvltport_feedback(state);
    deliver_splev_message(state);

    // do.c:1858-1872, entering Gehennom. Both arms need In_hell, and
    // dat/dungeon.lua puts the Valley below depth 25.
    // do.c:1874-1875 familiar_level_msg() needs a bones file.

    // The arrival arms at do.c:1877-1932 are keyed on the destination
    // dungeon. In_endgame, In_quest, Is_knox, In_mines and In_sokoban are all
    // false for D:2 of the main dungeon, so the `else` arm runs.
    if (isNew && state.bigroom_level
        && on_level(u.uz, state.bigroom_level)) {
        // C ref: do.c:1907. dat/dungeon.lua puts the big room between
        // depths 10 and 12.
        record_achievement(ACH_BGRM, state);
    }
    if (!In_quest(u.uz0)
        && at_dgn_entrance('The Quest', state)
        && !(u.uevent?.qcompleted || u.uevent?.qexpelled
             || state.svq?.quest_status?.leader_is_dead)) {
        u.uevent ??= {};
        if (!u.uevent.qcalled) {
            u.uevent.qcalled = 1;
            await com_pager('quest_portal', state);
        } else {
            await com_pager(
                state.urole?.mnum === PM_ROGUE
                    ? 'quest_portal_demand'
                    : 'quest_portal_again',
                state,
            );
        }
    }

    temperature_change_msg(prev_temperature, state);

    if (isNew) {
        // do.c:1944-1953 describe_level() and livelog_printf(). The livelog is
        // a file the port does not write, and describe_level()'s buffer has no
        // other reader here, so neither reaches the screen.
        if (state.urole?.mnum === PM_TOURIST) {
            // do.c:1961-1964. A Tourist alone is paid for sightseeing. Both
            // calls run after docrt() and flush_screen(-1) above, so neither
            // draws: more_experienced() only asks for a status redraw, which
            // the next flush_screen() or the command loop's own bot() serves.
            more_experienced(level_difficulty(state), 0, state);
            await newexplevel(state, { message: ttyPline });
        }
    }

    assign_level(u.uz0, u.uz); /* reset u.uz0 */
    notice_mon_on(state);
    await notice_all_mons(true, state);

    // do.c:1974 print_level_annotation() prints the hero's own #annotate note.
    // The canonical mapseen chain exists, but annotation input and rendering
    // remain outside this ordinary descent slice.
    await check_special_room(false, state); /* give room entrance message */
    obj_delivery(true, state); /* deliver objects traveling with player */

    /* assume this will always return TRUE when changing level */
    await in_out_region(u.ux, u.uy, { state });

    // do.c:1984-1987 fix_shop_damage() catches a shopkeeper up on repairs;
    // it runs only when `new` is false, and this arm always generated.
    // do.c:1989-1992 charges fall damage, which needs `falling`.

    await pickup(1, state);
}

// C ref: dokick.c obj_delivery(), which do.c goto_level() calls twice: once
// for the objects that were sent ahead and once for the ones that travel with
// the hero.
//
// gm.migrating_objs is empty on every path the port reaches. Its writers are
// dokick.c's ship_object(), the shopkeeper's stolen-goods handling and the
// object half of a level change, none of which is ported, and js/dog.js
// migrate_to_level() moves monsters rather than objects.
function obj_delivery(near_hero, state = game) {
    if (state.gm?.migrating_objs) {
        throw new UnsupportedLevelChangeError(
            `obj_delivery(${near_hero}) with objects in migration`,
        );
    }
}

// C ref: mon.c kill_genocided_monsters(), which goto_level() calls so that a
// monster of a genocided species that was migrating dies as it arrives.
//
// Nothing genocides a species in this port: svm.mvitals[].mvflags gains
// G_GENOD only in read.c do_genocide(), which no ported command reaches. The
// kill_eggs() sweep at the end of C's function selects on the same flag.
function kill_genocided_monsters(state = game) {
    for (let index = 0; index < (state.mvitals?.length ?? 0); ++index) {
        if (state.mvitals[index].mvflags & G_GENOD) {
            throw new UnsupportedLevelChangeError(
                'kill_genocided_monsters() with a genocided species',
            );
        }
    }
}

// C ref: do.c u_collide_m() (1410-1445). The hero has arrived on a square a
// monster already holds -- one that came down with her, or one mklev() put on
// the up staircase -- and one of the two has to move.
function u_collide_m(mtmp, state = game) {
    if (!mtmp || mtmp === state.u.usteed
        || mtmp !== m_at(state.u.ux, state.u.uy, state)) {
        // C's impossible() returns without moving anybody.
        throw new Error('level arrival collision: monster not co-located');
    }

    const cc = !rn2(2)
        ? enexto(state.u.ux, state.u.uy, state.youmonst?.data, { state })
        : null;
    if (cc && next2u(cc.x, cc.y, state)) {
        u_on_newpos(cc.x, cc.y, state);
    } else {
        mnexto(mtmp, RLOC_NOMSG, { state });
    }

    if (m_at(state.u.ux, state.u.uy, state)) {
        // C tries rloc() and then m_into_limbo(), which sends the monster off
        // the level to return later. Neither the wizard-mode message nor
        // m_into_limbo() is ported.
        throw new UnsupportedLevelChangeError(
            'u_collide_m() with a monster still in the hero\'s way',
        );
    }
}

// C ref: questpgr.c deliver_splev_message(), the custom arrival message a
// special level may carry. gl.lev_message is written by sp_lev.c alone, from a
// Lua level description; no level the port generates sets one.
function deliver_splev_message(state = game) {
    if (state.gl?.lev_message) {
        throw new UnsupportedLevelChangeError(
            'deliver_splev_message() on a level with an arrival message',
        );
    }
}

// C ref: do.c temperature_change_msg(). Its three arms report entering or
// leaving a hot or cold level; svl.level.flags.temperature is set by a Lua
// level description, and every level the port generates leaves it zero.
function temperature_change_msg(prev_temperature, state = game) {
    if (prev_temperature !== state.level.flags.temperature) {
        throw new UnsupportedLevelChangeError(
            'temperature_change_msg() for a change of level temperature',
        );
    }
}

// C ref: do.c set_wounded_legs() (2425-2446). youprop.h:136-138 splits the
// condition across one property: HWounded_legs, the intrinsic field, holds the
// recovery timeout, and EWounded_legs, the extrinsic field, holds worn-ring
// side bits saying which leg. Wounded_legs is their plain OR, with no blocked
// term, so `already` below is that macro.
//
// Three consequences follow the write and belong to other owners, which is why
// this function looks smaller than its effect: hack.c weight_cap() subtracts
// WT_WOUNDEDLEG_REDUCT per side bit, attrib.c exerchk() exercises Dexterity
// down while the condition lasts, and timeout.c nh_timeout() counts the
// intrinsic down and calls heal_legs() below at zero.
//
// C's comment notes that a mounted hero's steed takes the wound instead and
// that the caller adjusts its own messages; the hit-point loss is likewise the
// caller's, not this function's.
export async function set_wounded_legs(side, timex, state = game) {
    const u = state.u;
    const wounded = u.uprops[WOUNDED_LEGS];
    const already = Boolean(wounded.intrinsic || wounded.extrinsic);

    state.disp ??= {};
    state.disp.botl = true;
    if (!already) --u.atemp[A_DEX];

    if (!already || (wounded.intrinsic & TIMEOUT) < timex) {
        // prop.h set_itimeout(): overwrite the timeout field and keep the
        // source bits above it.
        wounded.intrinsic = (wounded.intrinsic & ~TIMEOUT) | timex;
    }
    // C ref: do.c:2442-2445. Bitwise-OR rather than assignment, so a second
    // wound to the other leg does not heal the first.
    wounded.extrinsic |= side;
    await encumber_msg(state);
}

// C ref: do.c heal_legs() (2448-2486), the how == 0 arm. C's argument picks
// between an ordinary recovery (0), a dismount (1) and the petrification
// countdown (2), and it is read at C 2461 and 2483 to suppress the message and
// the encumbrance feedback. Only timeout.c nh_timeout()'s WOUNDED_LEGS case is
// ported and it passes 0, so both tests are resolved here in the direction 0
// takes; steed.c dismount_steed()'s heal_legs(1) stays refused at js/steed.js.
//
// The caller has already counted HWounded_legs down to zero, so youprop.h:138
// Wounded_legs is true here only through the side bits EWounded_legs holds.
// Both fields are cleared together because 5.0 heals both legs at once.
//
// C's two halves of the temporary-Dexterity ledger are guarded differently,
// and neither is unconditional. set_wounded_legs() spends a point only when no
// wound was already live (do.c:2427-2428, `if (!Wounded_legs) ATEMP(A_DEX)--`),
// so a second wound taken before the first expires costs nothing and merely
// extends the timeout. This function gives one back only while the temporary
// total is still negative (do.c:2453-2454), so a hero whose Dexterity was
// raised in between keeps the gain. Across one wound the two cancel exactly.
export async function heal_legs(state = game, { message = ttyPline } = {}) {
    const u = state.u;
    const wounded = u.uprops[WOUNDED_LEGS];
    if (!wounded.intrinsic && !wounded.extrinsic) return;

    state.disp ??= {};
    state.disp.botl = true;
    if (u.atemp[A_DEX] < 0) ++u.atemp[A_DEX];

    // C ref: do.c:2461-2469. A mounted hero's wound belongs to the steed, so
    // nothing is said about the hero's own legs.
    if (!u.usteed) {
        let legs = body_part(LEG, state.youmonst);
        if ((wounded.extrinsic & BOTH_SIDES) === BOTH_SIDES)
            legs = makeplural(legs);
        await message(`Your ${legs} ${vtense(legs, 'feel')} better.`, state);
    }

    wounded.intrinsic = 0;
    wounded.extrinsic = 0;

    // C ref: do.c:2473-2484. Wounded legs cost carrying capacity, so healing
    // them can lift an encumbrance the hero has been carrying.
    await encumber_msg(state, { message });
}
