// Inventory burden feedback, floor-square inspection and the pickup itself,
// all owned by pickup.c. C refs: pickup.c encumber_msg(), pickup(),
// check_here(), query_objlist(), all_but_uchain(), pickup_object() and the
// three corpse-handling helpers at 272-313.

import {
    AUTOSELECT_SINGLE,
    BLINDED,
    BY_NEXTHERE,
    EXT_ENCUMBER,
    FEEL_COCKATRICE,
    FUMBLING,
    HVY_ENCUMBER,
    INCLUDE_HERO,
    INVORDER_SORT,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    LOST_NONE,
    MENU_TRADITIONAL,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    OBJ_MINVENT,
    SIGNAL_NOMENU,
    SLT_ENCUMBER,
    STAIRS,
    STONE,
    STONE_RES,
    ROOM,
    CORR,
    W_WEP,
    is_pit,
    st_all,
    st_corpse,
    st_gloves,
    st_petrifies,
    st_resists,
} from './const.js';
import { flush_screen, newsym } from './display.js';
import { can_reach_floor, engr_at, read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    calc_capacity,
    inv_cnt,
    inv_weight,
    near_capacity,
    nomul,
    weight_cap,
} from './hack.js';
import {
    addinv_runtime,
    dfeature_at,
    look_here,
    money_cnt,
    obj_extract_self,
    preflight_addinv_sequence,
    preflight_look_here,
    prinv,
} from './invent.js';
import { is_rider, notake, touch_petrifies } from './mondata.js';
import { observe_object } from './o_init.js';
import { objectGenerationEnv } from './object_generation.js';
import { COIN_CLASS, CORPSE, SCR_SCARE_MONSTER } from './objects.js';
import { assertObjectNameable } from './objnam.js';
import { costly_spot } from './shk.js';
import { stairway_at } from './stairs.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';

const INCREASED_BURDEN_MESSAGES = Object.freeze([
    null,
    'Your movements are slowed slightly because of your load.',
    'You rebalance your load.  Movement is difficult.',
    'You stagger under your heavy load.  Movement is very hard.',
    'You can barely move a handspan with this load!',
    "You can't even move a handspan with this load!",
]);

const DECREASED_BURDEN_MESSAGES = Object.freeze([
    'Your movements are now unencumbered.',
    'Your movements are only slowed slightly by your load.',
    'You rebalance your load.  Movement is still difficult.',
    'You stagger under your load.  Movement is still very hard.',
]);

// pickup.c's local GOLD_WT macro deliberately has no minimum-one clamp.
// Floor object weight supplies that clamp; carry_count subtracts the overlap
// between separately rounded carried, picked, and combined coin quantities.
function pickupGoldWeight(quantity) {
    return Math.trunc((Math.trunc(quantity) + 50) / 100);
}

export async function encumber_msg(
    state = game,
    { message = ttyPline } = {},
) {
    state.go ??= {};
    const oldCapacity = Math.trunc(state.go.oldcap ?? 0);
    const newCapacity = near_capacity(state);
    let text = null;
    if (oldCapacity < newCapacity)
        text = INCREASED_BURDEN_MESSAGES[newCapacity] ?? null;
    else if (oldCapacity > newCapacity)
        text = DECREASED_BURDEN_MESSAGES[newCapacity] ?? null;

    if (text) {
        await message(text, state);
        state.disp ??= {};
        state.disp.botl = true;
    }
    state.go.oldcap = newCapacity;
    return newCapacity;
}

// A floor square this port cannot answer for yet.
export class UnsupportedPickupError extends Error {
    constructor(reason) {
        super(`unsupported pickup: ${reason}`);
        this.name = 'UnsupportedPickupError';
        this.reason = reason;
    }
}

function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean((blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked);
}

// C ref: pickup.c pickup_object()'s sight-gated observe_object() call. Keep
// this source boundary independently testable because later object naming can
// also set dknown and would otherwise mask a wrong early Blind predicate.
export function observe_pickup_object(obj, state = game) {
    if (!heroIsBlind(state)) observe_object(obj, state);
    return obj;
}

// C ref: pickup.c reset_justpicked().  Regular pickup owns this direct reset;
// gl.loot_reset_justpicked is the separate doloot() handoff consumed by
// addinv_core0() and must not be used to delay this mutation.
export function reset_justpicked(head) {
    for (let obj = head; obj; obj = obj.nobj) obj.pickup_prev = false;
}

function heroHasProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// This is the bounded branch of pickup.c describe_decor() reached by
// allmain.c moveloop_preamble(FALSE): a new hero stands on the traversed D:1
// staircase before the first command. Later terrain and repeated descriptions
// remain fail-closed at their existing callers.
function startupStairDecor(state) {
    const { u } = state;
    const cell = state.level?.at(u.ux, u.uy);
    const stair = stairway_at(u.ux, u.uy, state);
    const ordinaryExit = cell?.typ === STAIRS
        && stair?.up === true
        && stair.isladder === false
        && stair.u_traversed === true
        && u.uz?.dnum === 0
        && u.uz?.dlevel === 1
        && !u.uhave?.amulet
        && dfeature_at(u.ux, u.uy, state)
            === 'staircase up out of the dungeon';
    if (!ordinaryExit) {
        throw new UnsupportedPickupError(
            'mention_decor outside the initial D:1 staircase',
        );
    }
    if (u.uinwater || heroHasProperty(state, FUMBLING)
        || state.iflags?.defer_decor
        || state.decor_fumble_override
        || state.decor_levitate_override) {
        throw new UnsupportedPickupError(
            'exceptional initial decor description',
        );
    }
    if (state.iflags?.prev_decor !== STONE) {
        throw new UnsupportedPickupError(
            'repeated initial decor description',
        );
    }
    return 'staircase up out of the dungeon';
}

// This source-bounded plan covers describe_decor()'s two silent ordinary
// terrain results. The first step from the remembered startup staircase
// returns TRUE and stores ROOM or CORR. A following step on the same ordinary
// terrain returns FALSE and stores the same value. Other prior terrain can
// invoke back_on_ground(), and every feature-bearing or exceptional state can
// print, defer, or suppress feedback, so those states remain outside this
// owner.
function ordinaryDecorPlan(x, y, state) {
    const typ = state.level?.at(x, y)?.typ;
    if (typ !== ROOM && typ !== CORR) return null;
    if (!state.flags?.mention_decor) {
        throw new UnsupportedPickupError(
            'ordinary describe_decor without mention_decor',
        );
    }
    if (state.u.uinwater || heroHasProperty(state, FUMBLING)
        || state.iflags?.defer_decor
        || state.decor_fumble_override
        || state.decor_levitate_override) {
        throw new UnsupportedPickupError(
            'exceptional ordinary decor description',
        );
    }
    if (dfeature_at(x, y, state)) {
        throw new UnsupportedPickupError(
            'feature-bearing ordinary decor description',
        );
    }
    const previous = state.iflags?.prev_decor;
    if (previous !== STAIRS && previous !== typ) {
        throw new UnsupportedPickupError(
            'ordinary decor after unowned prior terrain',
        );
    }
    return { typ, result: previous !== typ };
}

// Admission calls this before movement so an excluded describe_decor() branch
// cannot move the hero and then fail. The function reads the destination and
// returns C's boolean result without changing terrain memory or output.
export function preflight_describe_decor_at(x, y, state = game) {
    const ordinary = ordinaryDecorPlan(x, y, state);
    if (ordinary) return ordinary.result;
    if (x !== state.u.ux || y !== state.u.uy) {
        throw new UnsupportedPickupError(
            'mention_decor outside silent ordinary terrain',
        );
    }
    startupStairDecor(state);
    return true;
}

// Temporary startup admission for the portion of pickup(1) selected by this
// boundary. It runs before reset_justpicked(), so an excluded object,
// engraving, or terrain leaves inventory and decor memory unchanged.
export function preflight_initial_pickup(state = game) {
    const { u } = state;
    if (state.level?.objects?.[u.ux]?.[u.uy]) {
        throw new UnsupportedPickupError('initial floor object');
    }
    if (engr_at(u.ux, u.uy, state)) {
        throw new UnsupportedPickupError('initial engraving');
    }
    if (state.flags?.mention_decor) startupStairDecor(state);
}

// C ref: pickup.c describe_decor(). This owns the startup staircase output and
// the silent STAIRS-to-ROOM/CORR and equal-ROOM/CORR branches described above.
export async function describe_decor(state) {
    const ordinary = ordinaryDecorPlan(state.u.ux, state.u.uy, state);
    if (ordinary) {
        state.iflags.prev_decor = ordinary.typ;
        return ordinary.result;
    }
    const feature = startupStairDecor(state);
    await ttyPline(state.flags?.verbose === true
        ? `There is a ${feature} here.`
        : `A ${feature}.`, state);
    state.iflags.prev_decor = STAIRS;
    return true;
}

// C ref: pickup.c u_safe_from_fatal_corpse() (272-281). The tests are ORed in
// source order, so which term answers depends on the hero: a Monk starts in
// leather gloves (u_init.c:102) and stops at st_gloves, while a bare-handed
// Valkyrie reaches st_petrifies and passes on the species.
export function u_safe_from_fatal_corpse(obj, tests, state = game) {
    return Boolean(
        ((tests & st_gloves) && state.uarmg)
        || ((tests & st_corpse) && obj.otyp !== CORPSE)
        || ((tests & st_petrifies)
            && !touch_petrifies(state.mons[obj.corpsenm]))
        || ((tests & st_resists) && heroHasProperty(state, STONE_RES)),
    );
}

// C ref: pickup.c fatal_corpse_mistake() (284-299). Only the FALSE result is
// ported. Its other arm polymorphs a stone-golem-capable hero or runs
// instapetrify(), neither of which has an owner, so a bare-handed touch of a
// petrifying corpse refuses instead of returning TRUE.
function fatal_corpse_mistake(obj, remotely, state) {
    if (u_safe_from_fatal_corpse(obj, st_all, state) || remotely) return false;
    throw new UnsupportedPickupError(
        'bare-handed touch of a petrifying corpse',
    );
}

// C ref: pickup.c rider_corpse_revival() (302-313). Only the FALSE result is
// ported; the TRUE arm reaches revive_corpse(), which has no owner. No Rider
// dies on D:1, so the refusal stands in for a corpse that cannot be generated
// within reach of this command. It names which of C's two phrasings the
// unported pline() would have used, because `remotely` decides nothing else.
export function rider_corpse_revival(obj, remotely, state = game) {
    if (!obj || obj.otyp !== CORPSE || !is_rider(state.mons[obj.corpsenm]))
        return false;
    throw new UnsupportedPickupError(
        "a Rider's corpse reviving at your "
        + `${remotely ? 'attempted acquisition' : 'touch'}`,
    );
}

// C ref: hack.h:1243 FOLLOW(). A floor pile is walked by nexthere; a monster's
// inventory, which this port refuses, by nobj.
function FOLLOW(obj, qflags) {
    return (qflags & BY_NEXTHERE) ? obj.nexthere : obj.nobj;
}

// C ref: pickup.c all_but_uchain() (508-512), the query_objlist() callback
// that dopickup() passes. state.uchain holds the ball and chain only while the
// hero is punished, which nothing ported does, so this rejects nothing today
// and every object on the square is counted.
function all_but_uchain(obj, state) {
    return obj !== (state.uchain ?? null);
}

// C ref: pickup.c query_objlist() (1046-1077): the counting loop and both of
// its early returns. Everything from sortloot() at 1079 onwards -- the sort,
// the FEEL_COCKATRICE loop and the menu window itself -- is refused, so this
// answers only the two questions a square holding one object asks: is anything
// allowed here, and is there exactly one of it.
//
// C's `qstr`, `pick_list` and `how` arguments are not parameters. The prompt
// string and the PICK_ONE/PICK_ANY mode are read only by the menu, and the
// caller receives the selection as this function's result instead.
export function query_objlist(olist, qflags, allow, state = game) {
    if (qflags & INCLUDE_HERO) {
        // 1063-1067 adds the swallowed hero as a fake extra entry.
        throw new UnsupportedPickupError(
            'query_objlist() showing the engulfed hero',
        );
    }
    const pick_list = [];
    if (!olist) return { n: 0, pick_list };

    /* count the number of items allowed */
    let n = 0;
    let last = null;
    for (let curr = olist; curr; curr = FOLLOW(curr, qflags)) {
        if (allow(curr, state)) {
            last = curr;
            ++n;
        }
    }
    if (olist.where === OBJ_MINVENT) {
        // 1058-1062 clears AUTOSELECT_SINGLE for an engulfer's worn item.
        throw new UnsupportedPickupError(
            "query_objlist() over an engulfer's inventory",
        );
    }

    if (n === 0) /* nothing to pick here */
        return { n: (qflags & SIGNAL_NOMENU) ? -1 : 0, pick_list };

    if (n === 1 && (qflags & AUTOSELECT_SINGLE)) {
        pick_list.push({ obj: last, count: last.quan });
        return { n: 1, pick_list };
    }
    throw new UnsupportedPickupError('query_objlist() menu');
}

// Everything C decides inside pickup_object(), lift_object(), pick_obj() and
// addinv() that can refuse, gathered before observe_object() runs or the first
// object leaves the floor. This is the narrow fail-closed boundary for special
// pickup behavior and it keeps floor indexes and discovery state atomic.
function preflightPickupObjects(selected, state) {
    let addedWeight = 0;
    let projectedGold = money_cnt(state.invent);
    for (const { obj, count } of selected) {
        if (obj.where !== OBJ_FLOOR || !Number.isInteger(count) || count < 1)
            throw new UnsupportedPickupError('pickup() malformed floor object');
        // pickup.c:1826 and :1832, the two type arms of pickup_object() that
        // stay refused. touch_artifact() prints and can blast the hero, and
        // the scare-scroll arm rewrites obj->spe or turns the stack to dust.
        if (obj.oartifact)
            throw new UnsupportedPickupError('pickup() of an artifact');
        if (obj.otyp === SCR_SCARE_MONSTER) {
            throw new UnsupportedPickupError(
                'pickup() of a scroll of scare monster',
            );
        }
        // pickup.c:1828-1831. Both helpers answer FALSE here or refuse; the
        // runtime calls them again where C does.
        if (obj.otyp === CORPSE) {
            fatal_corpse_mistake(obj, false, state);
            rider_corpse_revival(obj, false, state);
        }
        assertObjectNameable(obj, state);
        let objectWeight = Math.trunc(obj.owt);
        if (obj.oclass === COIN_CLASS) {
            const combinedGold = projectedGold + count;
            objectWeight -= pickupGoldWeight(projectedGold)
                + pickupGoldWeight(count)
                - pickupGoldWeight(combinedGold);
            projectedGold = combinedGold;
        }
        addedWeight += objectWeight;
    }
    if (inv_weight(state) + addedWeight >= 2 * weight_cap(state)) {
        throw new UnsupportedPickupError(
            'pickup() requiring a partial or failed lift',
        );
    }
    const promptLimit = Math.max(
        near_capacity(state),
        state.flags?.pickup_burden ?? MOD_ENCUMBER,
    );
    if (calc_capacity(addedWeight, state) > promptLimit) {
        throw new UnsupportedPickupError('pickup() requiring a burden prompt');
    }

    const env = objectGenerationEnv({
        state,
        hooks: {
            message: ttyPline,
            inventoryComparisonDiscovered: () => ttyPline(
                'You learn more about your items by comparing them.',
                state,
            ),
        },
    });
    const addPlans = preflight_addinv_sequence(
        selected.map(({ obj }) => obj),
        env,
        { observeObjects: !heroIsBlind(state) },
    );
    // pickup.c lift_object() checks the 52-letter limit in floor order after
    // merge_choice().  Gold consumes no ordinary slot, and a later floor
    // object can merge with an earlier projected pickup.  Reject atomically
    // only at the first projected non-merge addition which C would refuse.
    let projectedSlots = inv_cnt(false, state);
    for (const plan of addPlans) {
        if (!plan.addedOrdinarySlot) continue;
        if (projectedSlots >= 52)
            throw new UnsupportedPickupError('pickup() with a full pack');
        ++projectedSlots;
    }
    for (const plan of addPlans) {
        // pickup.c:1881-1882 raises gm.mrg_to_wielded across pickup_prinv()
        // when the lifted stack merged into the wielded weapon, and
        // objnam.c:1561 reads it to drop the "(weapon in hand)" suffix that
        // would otherwise describe the whole merged stack. Nothing owns that
        // flag here, so a merge into the wielded slot refuses instead.
        if ((plan.projectedResult.owornmask ?? 0) & W_WEP) {
            throw new UnsupportedPickupError(
                'pickup() merging into the wielded weapon',
            );
        }
        assertObjectNameable(plan.projectedResult, state);
    }
    return { addPlans, env };
}

// C ref: pickup.c autopick() (975-1003) reduced to the option settings
// pickup() admits, fused with the preflight above. flags.pickup_types and the
// autopickup exception list are refused by the caller, so autopick_testobj()
// keeps every object that is not shop stock.
function planAutomaticFloorPickupAndRefreshCapacityCache(state) {
    const { u } = state;
    const costly = costly_spot(u.ux, u.uy, state);
    const selected = [];
    const remaining = [];
    for (let obj = state.level.objects[u.ux][u.uy];
        obj;
        obj = obj.nexthere) {
        if (costly && !obj.no_charge) {
            remaining.push(obj);
            continue;
        }
        if ((obj.how_lost ?? LOST_NONE) !== LOST_NONE) {
            throw new UnsupportedPickupError(
                'pickup() with a lost-object option override',
            );
        }
        selected.push({ obj, count: obj.quan });
    }
    return {
        ...preflightPickupObjects(selected, state),
        remaining,
        selected,
    };
}

// Random arrival commits placement, room entry and its display before
// goto_level() reaches pickup(1). Validate the complete supported floor
// transaction against the projected destination first, so a later naming or
// pricing refusal cannot leave those earlier writes behind. Burden calculation
// writes `state.gw.wc`; callers must supply an isolated projection whose `gw`
// owner is cloned from live state.
export function preflight_projected_random_arrival_pickup(state) {
    if (state === undefined) {
        throw new TypeError(
            'preflight_projected_random_arrival_pickup requires projected state',
        );
    }
    const { u } = state;
    if (u.uswallow)
        throw new UnsupportedPickupError('pickup() inside a monster');
    if (Math.trunc(state.multi) < 0)
        throw new UnsupportedPickupError('pickup() while helpless');

    const head = state.level?.objects?.[u.ux]?.[u.uy] ?? null;
    const inaccessibleLiquid = [
        is_pool(u.ux, u.uy, state) && !u.uinwater,
        is_lava(u.ux, u.uy, state),
    ].some(Boolean);
    if (state.context?.nopick || !head || inaccessibleLiquid) {
        if (state.flags?.mention_decor)
            preflight_describe_decor_at(u.ux, u.uy, state);
        return;
    }

    const trap = t_at(u.ux, u.uy, state);
    if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot reach the floor',
        );
    }
    if (notake(state.youmonst?.data)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot take objects',
        );
    }

    let remaining;
    let pickedSome;
    if ((Math.trunc(state.multi) && !state.context?.run)
        || !state.flags?.pickup) {
        remaining = [];
        for (let obj = head; obj; obj = obj.nexthere) remaining.push(obj);
    } else {
        if (state.ga?.apelist) {
            throw new UnsupportedPickupError(
                'pickup() with autopickup exceptions',
            );
        }
        if (state.flags?.pickup_types?.length)
            throw new UnsupportedPickupError('pickup() with pickup_types');
        const plan = planAutomaticFloorPickupAndRefreshCapacityCache(state);
        remaining = plan.remaining;
        pickedSome = Boolean(plan.selected.length);
    }

    if (state.flags?.mention_decor)
        preflight_describe_decor_at(u.ux, u.uy, state);
    // pickup.c check_here() calls look_here() only while something remains on
    // the floor.  Its zero-count arm reads the engraving instead, so a visible
    // region cannot reject an arrival whose complete pile will be picked up.
    if (remaining.length) {
        const lookhereFlags = pickedSome
            ? LOOKHERE_PICKED_SOME : LOOKHERE_NOFLAGS;
        preflight_look_here(remaining.length, lookhereFlags, state, {
            objects: remaining,
            decorTerrain: state.flags?.mention_decor
                ? state.level.at(u.ux, u.uy)?.typ : null,
        });
    }
}

// C ref: pickup.c pickup_object() (1803-1888), with lift_object(), pick_obj()
// and pickup_prinv() folded in where the port already owns them:
// preflight_addinv_sequence() answers lift_object()'s weight and slot
// questions, obj_extract_self() plus addinv_runtime() are pick_obj(), and the
// encumbrance-prefix ladder plus prinv() are pickup_prinv().
//
// Four of C's five type arms refuse in preflightPickupObjects() before
// anything moves: uchain has no owner, an engulfer's inventory is rejected by
// where != OBJ_FLOOR, and artifacts and scare scrolls refuse by type. Only the
// CORPSE arm can be reached, and only with both helpers answering FALSE.
//
// The two lines pickup.c runs around pick_obj() that this port does not:
// disp.botl for gold, because invent.c addinv_core1() sets the same flag on
// the same object a moment later and js/invent.js addinvCore1() already
// carries it; and fix_ghostly_obj(), which needs an object read from a bones
// file, and getbones() never loads one.
async function pickup_object(obj, count, telekinesis, env, plan) {
    const state = env.state;
    if (obj.quan < count) {
        // C's impossible() reports and returns 0. Both callers pass the
        // object's own quantity, so a smaller one means the plan and the pile
        // have gone out of step.
        throw new Error(
            `pickup_object: count ${count} > quan ${obj.quan}`,
        );
    }
    observe_pickup_object(obj, state);
    if (obj.otyp === CORPSE
        && (fatal_corpse_mistake(obj, telekinesis, state)
            || rider_corpse_revival(obj, telekinesis, state)))
        return -1;

    obj_extract_self(obj, env);
    newsym(state.u.ux, state.u.uy);
    const carried = await addinv_runtime(obj, env, plan);

    const nearload = near_capacity(state);
    let prefix = null;
    if (nearload !== state.gp.pickup_encumbrance) {
        state.gp.pickup_encumbrance = nearload;
        if (nearload >= EXT_ENCUMBER)
            prefix = 'You have extreme difficulty lifting';
        else if (nearload >= HVY_ENCUMBER)
            prefix = 'You have much trouble lifting';
        else if (nearload >= MOD_ENCUMBER)
            prefix = 'You have trouble lifting';
        else if (nearload >= SLT_ENCUMBER)
            prefix = 'You have a little trouble lifting';
    }
    await prinv(prefix, carried, count, env);
    return 1;
}

// C ref: pickup.c pickup() (672-910), autopick(), query_objlist(),
// pickup_object(), pick_obj() and pickup_prinv(). Beyond the no-object and
// no-autopickup arms this covers two selections that share one pickup loop:
// autopick()'s, used by a level teleport arrival, and the `,` command's, for a
// square holding exactly one object it is allowed to take. Option filters,
// shop stock, burden prompts, partial stacks, full packs and every square with
// a second object stop before ownership changes.
export async function pickup(what, state = game) {
    const u = state.u;
    const autopickup = what > 0;

    if (u.uswallow) {
        // The engulfed arm picks from u.ustuck->minvent rather than the floor.
        throw new UnsupportedPickupError('pickup() inside a monster');
    }
    if (autopickup && Math.trunc(state.multi ?? 0) < 0) {
        // unconscious() is HERO_FAINTED || u.usleep || ...; the elapsed-turn
        // boundary refuses every state that sets it.
        throw new UnsupportedPickupError('pickup() while helpless');
    }
    state.gp ??= {};
    state.gp.pickup_encumbrance = 0;

    const objectHere = Boolean(
        state.level?.objects?.[u.ux]?.[u.uy] ?? null,
    );
    if (autopickup
        && (state.context?.nopick || !objectHere
            || (is_pool(u.ux, u.uy, state) && !u.uinwater)
            || is_lava(u.ux, u.uy, state))) {
        if (state.flags?.mention_decor) {
            await describe_decor(state);
        }
        await read_engr_at(u.ux, u.uy, state, {
            pline: ttyPline,
            canReachFloor: can_reach_floor,
        });
        return 0;
    }

    const trap = t_at(u.ux, u.uy, state);
    if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
        // The unconditional describe_decor() on this arm has no owner, and
        // reaching the arm at all needs levitation, a steed or a pit.
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot reach the floor',
        );
    }

    if (notake(state.youmonst?.data)) {
        throw new UnsupportedPickupError(
            'pickup() by a hero who cannot take objects',
        );
    }
    if ((Math.trunc(state.multi ?? 0) && !state.context?.run)
        || (autopickup && !state.flags?.pickup)) {
        await check_here(false, state);
        return 0;
    }

    if (objectHere && state.context?.run && state.context.run !== 8
        && !state.context.nopick) {
        nomul(0, state);
    }

    // C ref: pickup.c:740-747. add_valid_menu_class(0) resets the five menu
    // filters query_classes() sets; nothing ported writes them, and the port
    // reaches no menu that would read them. The swallowed arm has already
    // refused, so BY_NEXTHERE over the floor pile is the only traversal left.

    // pickup.c:754-777, where autopick() and the interactive selection part
    // company. Both fill pick_list and both then run the loop at 779-789.
    let selected;
    let addPlans;
    let env;
    if (autopickup) {
        if (state.ga?.apelist) {
            throw new UnsupportedPickupError(
                'pickup() with autopickup exceptions',
            );
        }
        if (state.flags?.pickup_types?.length) {
            throw new UnsupportedPickupError('pickup() with pickup_types');
        }
        ({ addPlans, env, selected }
            = planAutomaticFloorPickupAndRefreshCapacityCache(state));
    } else {
        if (state.flags?.menu_style === MENU_TRADITIONAL
            && !state.iflags?.menu_requested) {
            // pickup.c:793-892, the "old style interface": a class query, a
            // per-object ynaq() and the counted single-object shortcut. For
            // one object it reaches the same pickup_object() this arm does,
            // but nothing here parses menustyle, so flags.menu_style is always
            // MENU_FULL and this refusal is what a future parser would meet.
            throw new UnsupportedPickupError('pickup() traditional interface');
        }
        if (what < 0) {
            // pickup.c:763-772, "Pick %d of what?" with the n_or_more
            // selector. js/cmd.js parses no count, so dopickup() always calls
            // pickup(-0) and C's `count` is 0.
            throw new UnsupportedPickupError('pickup() of a counted subset');
        }
        if (costly_spot(u.ux, u.uy, state)) {
            // all_but_uchain() allows shop stock, and pick_obj() then bills it
            // through addtobill() and remote_burglary().
            throw new UnsupportedPickupError('pickup() from a shop floor');
        }
        const traverse_how = BY_NEXTHERE | AUTOSELECT_SINGLE
            | (state.flags?.sortpack ? INVORDER_SORT : 0);
        ({ pick_list: selected } = query_objlist(
            state.level.objects[u.ux][u.uy],
            traverse_how | FEEL_COCKATRICE,
            all_but_uchain,
            state,
        ));
        ({ addPlans, env } = preflightPickupObjects(selected, state));
    }

    /* menu_pickup: */
    const n = selected.length;
    if (n > 0) reset_justpicked(state.invent);
    const n_tried = n;
    let n_picked = 0;
    for (let i = 0; i < n; ++i) {
        const res = await pickup_object(
            selected[i].obj, selected[i].count, false, env, addPlans[i],
        );
        if (res < 0) break; /* can't continue */
        n_picked += res;
    }

    // pickup.c:894-908. hides_under(youmonst.data) at 895 is M1_CONCEAL, which
    // no role's starting form carries, so hideunder() is unreachable for an
    // unpolymorphed hero. C's newsym_force() at 900 is newsym() plus glyph
    // buffer bookkeeping that js/display.js flush_screen() does not consult.
    if (n_picked) newsym(u.ux, u.uy);
    /* check if there's anything else here after auto-pickup is done */
    if (autopickup) await check_here(n_picked > 0, state);
    /* pickupdone: */
    state.gp.pickup_encumbrance = 0;
    return n_tried > 0 ? 1 : 0;
}

// C ref: pickup.c check_here(), reached from domove() through spoteffects()
// and pickup(). uchain has no ported owner, so every object on the square
// counts, as it does for an unpunished hero.
export async function check_here(picked_some, state = game) {
    let lookhereFlags = picked_some
        ? LOOKHERE_PICKED_SOME : LOOKHERE_NOFLAGS;
    if (state.flags?.mention_decor && await describe_decor(state))
        lookhereFlags |= LOOKHERE_SKIP_DFEATURE;

    let count = 0;
    for (let obj = state.level?.objects?.[state.u.ux]?.[state.u.uy] ?? null;
        obj;
        obj = obj.nexthere) {
        ++count;
    }

    if (count) {
        // Stepping onto objects ends a run before their description prints.
        if (state.context.run) nomul(0, state);
        await flush_screen(1);
        await look_here(
            count,
            lookhereFlags,
            state,
            {
                message: ttyPline,
                readEngraving: () => read_engr_at(
                    state.u.ux,
                    state.u.uy,
                    state,
                    { pline: ttyPline, canReachFloor: can_reach_floor },
                ),
            },
        );
    } else {
        await read_engr_at(state.u.ux, state.u.uy, state, {
            pline: ttyPline,
            canReachFloor: can_reach_floor,
        });
    }
}
