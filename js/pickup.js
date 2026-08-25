// Inventory burden feedback, floor-square inspection, the pickup itself, and
// the #loot container-looting dispatch, all owned by pickup.c. C refs:
// pickup.c encumber_msg(), pickup(), check_here(), query_objlist(),
// all_but_uchain(), pickup_object(), the three corpse-handling helpers at
// 272-313, doloot(), doloot_core(), container_at(), able_to_loot(),
// mon_beside(), and do_loot_cont().

import {
    AUTOSELECT_SINGLE,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_FORCE,
    AUTOUNLOCK_UNTRAP,
    BLINDED,
    BY_NEXTHERE,
    CONFUSION,
    ECMD_OK,
    ECMD_TIME,
    EXT_ENCUMBER,
    FEEL_COCKATRICE,
    FUMBLING,
    HAND,
    HVY_ENCUMBER,
    INCLUDE_HERO,
    INVORDER_SORT,
    IS_GRAVE,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    LOST_NONE,
    MENU_TRADITIONAL,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    OBJ_MINVENT,
    PICK_ANY,
    SIGNAL_NOMENU,
    SLT_ENCUMBER,
    STAIRS,
    STONE,
    STONE_RES,
    STUNNED,
    ROOM,
    SELL_NORMAL,
    CORR,
    W_WEP,
    is_pit,
    isok,
    st_all,
    st_corpse,
    st_gloves,
    st_petrifies,
    st_resists,
    u_at,
} from './const.js';
import { get_adjacent_loc, yn_function } from './cmd.js';
import { container_contents } from './end.js';
import { autokey } from './lock.js';
import { flush_screen, newsym } from './display.js';
import { hliquid } from './do_name.js';
import { ceiling } from './dungeon.js';
import { can_reach_floor, freehand, read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import {
    calc_capacity,
    check_capacity,
    inv_cnt,
    inv_weight,
    losehp,
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
    update_inventory,
} from './invent.js';
import { is_rider, nohands, nolimbs, notake, touch_petrifies } from './mondata.js';
import { m_at } from './monst.js';
import { hasContents, isContainer } from './obj.js';
import { observe_object } from './o_init.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    BAG_OF_HOLDING, BAG_OF_TRICKS, COIN_CLASS, CORPSE, LARGE_BOX,
    SCR_SCARE_MONSTER,
} from './objects.js';
import {
    Tobjnam, Yname2, Ysimple_name2, assertObjectNameable, donameFresh,
    safe_qbuf, the, The, xnameFresh, yname, ysimple_name,
} from './objnam.js';
import { body_part } from './polyself.js';
import { rn2, rnd } from './rng.js';
import { costly_spot, sellobj_state } from './shk.js';
import { stairway_at } from './stairs.js';
import { menuTitleStyle } from './tty_menu.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { select_menu } from './windows.js';

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
// boundary. It runs before reset_justpicked(), so an excluded object or
// terrain leaves inventory and decor memory unchanged. An engraving under the
// hero needs none: pickup.c:702-709's no-object arm ends in read_engr_at(),
// and pickup() below ports that arm whole.
export function preflight_initial_pickup(state = game) {
    const { u } = state;
    if (state.level?.objects?.[u.ux]?.[u.uy]) {
        throw new UnsupportedPickupError('initial floor object');
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

// C ref: pickup.c:56-58 FOLLOW(), whose BY_NEXTHERE bit is hack.h:1243. A
// floor pile is walked by nexthere; a monster's inventory, which this port
// refuses, by nobj.
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
    // pickup.c:1757-1758 is `if (prev_encumbr < flags.pickup_burden)`, the
    // max() below. options.c optfn_pickup_burden() writes that field and
    // initoptions_init() starts it at MOD_ENCUMBER, both ported in
    // js/options.js, so it always holds one of hack.h's encumbrance levels.
    const promptLimit = Math.max(
        near_capacity(state), state.flags.pickup_burden,
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
        // C's guard is `autopickup && gm.multi < 0 && unconscious()`
        // (pickup.c:685), whose arm sets iflags.prev_decor = STONE and returns
        // 0 without checking the square. This port refuses on the first term
        // alone, which over-approximates: js/trap.js unconscious() also wants
        // u.usleep or one of trap.c:6783-6785's three coming-round messages,
        // and the port's one negative-multi state -- js/pray.js dopray()'s
        // nomul(-3), whose nomovemsg is "You finish your prayer." -- has
        // neither, so C picks up where this stops. Nothing reaches the
        // difference: allmain.c moveloop_core() reads no key while the prayer
        // counts down, so no command calls pickup() then, and refusing costs a
        // segment its tail rather than a wrong screen. C's own two routes to
        // the arm are the random teleport and the levitation timeout that
        // pickup.c:680-684 names; port the arm with whichever lands first.
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
            // one object it reaches the same pickup_object() this arm does.
            // Startup parsing can now select this branch; porting that
            // traditional interface remains a separate behavior slice.
            throw new UnsupportedPickupError('pickup() traditional interface');
        }
        if (what < 0) {
            // pickup.c:763-772, "Pick %d of what?" with the n_or_more
            // selector. parse() collects the count whether or not a prefix
            // ran, so both `1,` and `m1,` arrive here with what == -1. This
            // refusal is reachable, and is what keeps C's counted-subset
            // selector from being silently skipped.
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

// ---- #loot command: doloot(), doloot_core(), container_at(),
//      able_to_loot(), mon_beside(), do_loot_cont() ----

// C ref: pickup.c container_at() (2024-2038). Counts containers on the floor
// at (x, y). When countem is false, returns 0 or 1 (stops after the first).
export function container_at(x, y, countem, state = game) {
    let container_count = 0;
    for (let cobj = state.level?.objects?.[x]?.[y] ?? null;
        cobj;
        cobj = cobj.nexthere) {
        if (isContainer(cobj)) {
            container_count++;
            if (!countem) break;
        }
    }
    return container_count;
}

// C ref: pickup.c able_to_loot() (2041-2069). Returns true when the hero can
// loot or tip at (x, y). The only call in this slice passes looting = true.
async function able_to_loot(x, y, looting, state) {
    const verb = looting ? 'loot' : 'tip';
    const trap = t_at(x, y, state);
    if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
        // C's two arms need rider_cant_reach() and cant_reach_floor(), neither
        // of which is exported. The hero must be levitating, riding, or in a
        // pit to reach this point, and none of those states appear in the
        // current witness.
        throw new UnsupportedPickupError(
            'able_to_loot: hero cannot reach the floor',
        );
    } else if ((is_pool(x, y, state) && (looting || !state.u.uinwater))
        || is_lava(x, y, state)) {
        await ttyPline(
            `You cannot ${verb} things that are deep in the `
            + `${hliquid(is_lava(x, y, state) ? 'lava' : 'water')}.`,
            state,
        );
        return false;
    } else if (nolimbs(state.youmonst.data)) {
        await ttyPline(
            `Without limbs, you cannot ${verb} anything.`,
            state,
        );
        return false;
    } else if (looting && !freehand(state)) {
        await ttyPline(
            `Without a free ${body_part(HAND, state.youmonst)}, `
            + 'you cannot loot anything.',
            state,
        );
        return false;
    }
    return true;
}

// C ref: pickup.c mon_beside() (2072-2085). Returns true when any monster
// occupies a square adjacent to or at (x, y).
function mon_beside(x, y, state) {
    for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
            const nx = x + i;
            const ny = y + j;
            if (isok(nx, ny) && m_at(nx, ny, state))
                return true;
        }
    }
    return false;
}

// C ref: pickup.c do_loot_cont() (2088-2162). Handles a single container
// found on the floor. If locked, prints a message and sets lknown. If
// unlocked, delegates to use_container(), which is the current boundary.
//
// Covered: the locked-container message arm (both lknown true and false),
// the lknown=1 assignment, and the delegation to use_container().
//
// Not covered: flags.autounlock (key, untrap, force arms), BAG_OF_TRICKS
// bite. Both refuse with UnsupportedPickupError.
async function do_loot_cont(cobj, cindex, ccount, state) {
    if (!cobj) return ECMD_OK;

    if (cobj.olocked) {
        // pickup.c:2106-2109. The #if 0 block at 2100-2105 is dead code.
        if (cobj.lknown) {
            await ttyPline(
                `${The(xnameFresh(cobj, state), state)} is locked.`,
                state,
            );
        } else {
            await ttyPline(
                `Hmmm, ${the(xnameFresh(cobj, state), state)} `
                + 'turns out to be locked.',
                state,
            );
        }
        cobj.lknown = 1;

        // pickup.c:2112-2145. The autounlock block. When the hero has no
        // unlocking tool and AUTOUNLOCK_UNTRAP is not set, neither the
        // apply-key nor the untrap arm fires and the function returns
        // ECMD_OK, matching a hero without lockpicking tools.
        if (state.flags?.autounlock) {
            const autounlock = state.flags.autounlock;
            let unlocktool = null;
            if ((autounlock & AUTOUNLOCK_APPLY_KEY)
                && (unlocktool = autokey(true, state))) {
                // The hero has a key or lock pick. pick_lock() is the
                // handler, which is not ported for the container path.
                throw new UnsupportedPickupError(
                    'do_loot_cont: autounlock apply-key on container',
                );
            }
            if (autounlock & AUTOUNLOCK_UNTRAP) {
                throw new UnsupportedPickupError(
                    'do_loot_cont: autounlock untrap on container',
                );
            }
            if ((autounlock & AUTOUNLOCK_FORCE) && ccount === 1) {
                throw new UnsupportedPickupError(
                    'do_loot_cont: autounlock force on container',
                );
            }
        }
        return ECMD_OK;
    }
    cobj.lknown = 1; /* floor container, no update_inventory() needed */

    // pickup.c:2150-2159. The BAG_OF_TRICKS arm bites the hero and needs
    // makeknown(), which is not imported.
    if (cobj.otyp === BAG_OF_TRICKS) {
        throw new UnsupportedPickupError(
            'do_loot_cont: BAG_OF_TRICKS carnivorous bag',
        );
    }
    // pickup.c:2161. use_container(cobjp, FALSE, cindex < ccount).
    const more_containers = cindex < ccount;
    return use_container(cobj, false, more_containers, state);
}

// C ref: pickup.c u_handsy() (2943-2953). Checks whether the hero has free
// hands to manipulate a container.
async function u_handsy(state) {
    if (nohands(state.youmonst.data)) {
        await ttyPline('You have no hands!', state);
        return false;
    } else if (!freehand(state)) {
        await ttyPline(
            `You have no free ${body_part(HAND, state.youmonst)}.`,
            state,
        );
        return false;
    }
    return true;
}

// C ref: pickup.c use_container() (2972-3226). Handles one container: entry
// checks (u_handsy, lknown, olocked, otrapped), the for(;;) prompt loop
// ("Do what with <container>?"), the ':' path (container_contents), the
// 'q'/Escape exit, and cleanup (cknown, update_inventory, sellobj_state,
// null out current_container).
//
// Covered: the ':' (view) and 'q'/'n' (quit/next) paths, the
// SchroedingersBox FALSE stub for ordinary containers, the cknown and
// sellobj_state containerdone cleanup.
//
// Not covered: 'o'/'i'/'b'/'r'/'s' (item transfer), otrapped/chest_trap,
// cursed bag of holding loss, SchroedingersBox/observe_quantum_cat. All
// refuse with UnsupportedPickupError.
async function use_container(obj, held, more_containers, state) {
    state.ga ??= {};
    state.ga.abort_looting = false;
    state.gs ??= {};
    state.gs.sellobj_first = true;

    if (!(await u_handsy(state)))
        return ECMD_OK;

    if (!obj.lknown) {
        obj.lknown = 1;
        if (held) update_inventory({ state });
    }
    if (obj.olocked) {
        await ttyPline(
            `${Tobjnam(obj, 'are', state)} locked.`,
            state,
        );
        if (held)
            await ttyPline('You must put it down to unlock.', state);
        return ECMD_OK;
    } else if (obj.otrapped) {
        throw new UnsupportedPickupError(
            'use_container: otrapped container (chest_trap)',
        );
    }

    state.gc ??= {};
    state.gc.current_container = obj;
    let used = ECMD_OK;

    // SchroedingersBox: spe === 1 on a LARGE_BOX.
    const quantum_cat = (obj.otyp === LARGE_BOX && obj.spe === 1);
    if (quantum_cat) {
        throw new UnsupportedPickupError(
            'use_container: SchroedingersBox (observe_quantum_cat)',
        );
    }

    // Cursed bag of holding.
    const cursed_mbag = isMbag(obj) && obj.cursed && hasContents(obj);
    if (cursed_mbag) {
        throw new UnsupportedPickupError(
            'use_container: cursed bag of holding (boh_loss)',
        );
    }

    // Might put something in if carrying anything besides the container.
    const inokay = Boolean(state.invent
        && (state.invent !== state.gc.current_container
            || state.invent.nobj));
    // Might take something out if container is not empty.
    const outokay = hasContents(state.gc.current_container);
    let emptymsg = '';
    if (!outokay) {
        emptymsg = `${Ysimple_name2(state.gc.current_container, state)} is empty.`;
    }

    // The for(;;) prompt loop.
    let c;
    for (;;) {
        const outmaybe = outokay || !state.gc.current_container.cknown;
        let qbuf;
        if (!outmaybe) {
            qbuf = safe_qbuf(
                null,
                ' is empty.  Do what with it?',
                state.gc.current_container,
                (o, s) => Yname2(o, s),
                (o, s) => Ysimple_name2(o, s),
                'This',
                state,
            );
        } else {
            qbuf = safe_qbuf(
                'Do what with ',
                '?',
                state.gc.current_container,
                (o, s) => yname(o, s),
                (o, s) => ysimple_name(o, s),
                'it',
                state,
            );
        }
        // Build the response string and call yn_function.
        // C builds pbuf with allowed and hidden characters. The JS port
        // builds the visible prompt and accepted characters similarly.
        const xbuf = [];
        let pbuf = ':';
        if (outmaybe) pbuf += 'o'; else xbuf.push('o');
        if (inokay) pbuf += 'i'; else xbuf.push('i');
        if (outmaybe) pbuf += 'b'; else xbuf.push('b');
        if (inokay) { pbuf += 'rs'; } else { xbuf.push('r'); xbuf.push('s'); }
        pbuf += ' ';
        if (more_containers) pbuf += 'n'; else xbuf.push('n');
        pbuf += 'q';
        if (state.iflags?.cmdassist) {
            pbuf += ' or ?';
        } else {
            xbuf.push('?');
        }
        if (xbuf.length > 0)
            pbuf += '\x1b' + xbuf.join('');

        c = await yn_function(
            qbuf, pbuf, more_containers ? 'n' : 'q', false, state,
        );
        // yn_function returns a key code (number). Convert to character
        // for the comparisons below.
        const ch = String.fromCharCode(c);

        if (ch === '?') {
            // explain_container_prompt is a text window listing actions.
            // For this slice, refuse it rather than porting the text window.
            throw new UnsupportedPickupError(
                'use_container: explain_container_prompt (?)',
            );
        } else if (ch === ':') {
            if (!state.gc.current_container.cknown)
                used = ECMD_TIME;
            await container_contents(
                state.gc.current_container,
                false, false, true, state,
            );
        } else {
            c = ch;
            break;
        }
    }

    if (c === 'q')
        state.ga.abort_looting = true;
    if (c === 'n' || c === 'q') {
        // goto containerdone
    } else {
        // Item transfer paths: o, i, b, r, s.
        throw new UnsupportedPickupError(
            `use_container: item transfer '${c}'`,
        );
    }

    // containerdone:
    if (used) {
        if (state.gc.current_container)
            state.gc.current_container.cknown = 1;
        update_inventory({ state });
    }

    sellobj_state(SELL_NORMAL, state);
    const result_obj = state.gc.current_container;
    if (state.gc.current_container)
        state.gc.current_container = null;
    else
        state.ga.abort_looting = true;

    return used;
}

// C ref: obj.h Is_mbag(). True for a bag of holding (the only magic bag).
function isMbag(obj) {
    return obj.otyp === BAG_OF_HOLDING;
}

// C ref: pickup.c:2202-2209. The Confusion branch calls reverse_loot(),
// which has unported inventory and shop interactions.
function ConfusionProp(state) {
    return Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
}
function StunnedProp(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

// C ref: pickup.c doloot_core() (2178-2346). The main body of the #loot
// command. Finds containers at the hero's location and interacts with them
// through do_loot_cont(). Falls through to directional looting when no
// container is found directly underfoot.
//
// Covered: the container-at-hero path (single and multi-container), the
// grave message, the directional looting direction prompt through
// get_adjacent_loc(), the underfoot redirect, the u.dz < 0 ceiling arm, and
// the no-container messages.
//
// Not covered: Confusion/reverse_loot() (refuses), loot_mon() (refuses),
// cockatrice blind-no-glove arm (refuses).
async function doloot_core(state) {
    let c = -1;
    let timepassed = 0;
    const cc = { x: state.u.ux, y: state.u.uy };
    let underfoot = true;

    state.ga ??= {};
    state.ga.abort_looting = false;

    // pickup.c:2194-2197.
    if (await check_capacity(null, state)) return ECMD_OK;

    // pickup.c:2198-2200.
    if (nohands(state.youmonst.data)) {
        await ttyPline('You have no hands!', state);
        return ECMD_OK;
    }

    // pickup.c:2202-2209. Confusion causes random reverse looting or a
    // wasted turn. reverse_loot() interacts with inventory and shops, which
    // this slice does not own.
    if (ConfusionProp(state)) {
        throw new UnsupportedPickupError(
            'doloot_core: confused looting',
        );
    }

    // pickup.c:2210-2211. cc is already set to hero's position.

    // pickup.c:2213-2214.
    if (state.iflags?.menu_requested)
        return doloot_core_lootmon(
            state, cc, c, timepassed, underfoot,
        );

    // pickup.c lootcont: 2217-2290.
    const num_conts = container_at(cc.x, cc.y, true, state);
    if (num_conts > 0) {
        if (!(await able_to_loot(cc.x, cc.y, true, state)))
            return ECMD_OK;

        // pickup.c:2223-2235. Blind cockatrice corpse handling.
        if (heroIsBlind(state) && !state.uarmg) {
            for (let nobj = state.level.objects[cc.x][cc.y]; nobj;
                nobj = nobj.nexthere) {
                if (nobj.otyp === CORPSE
                    && touch_petrifies(state.mons[nobj.corpsenm])) {
                    throw new UnsupportedPickupError(
                        'doloot_core: blind cockatrice corpse on floor',
                    );
                }
            }
        }

        if (num_conts > 1) {
            // pickup.c:2237-2270. Multi-container menu.
            const items = [];
            for (let cobj = state.level.objects[cc.x][cc.y]; cobj;
                cobj = cobj.nexthere) {
                if (isContainer(cobj)) {
                    items.push({
                        label: donameFresh(cobj, state),
                        value: cobj,
                    });
                }
            }
            const result = await select_menu(state, {
                title: 'Loot which containers?',
                ...menuTitleStyle(state),
                items,
                how: PICK_ANY,
                cancelValue: null,
                overlay: state.iflags?.menu_overlay !== false,
            });
            const n = result ? result.length : 0;
            if (n > 0) {
                for (let i = 0; i < n; i++) {
                    const cobj = result[i].value;
                    timepassed |= await do_loot_cont(
                        cobj, i + 1, n, state,
                    );
                    if (state.ga.abort_looting) {
                        return timepassed ? ECMD_TIME : ECMD_OK;
                    }
                }
            }
            if (n !== 0) c = 'y';
        } else {
            // pickup.c:2273-2287. Single-container path.
            let anyfound = false;
            for (let cobj = state.level.objects[cc.x][cc.y]; cobj;
                cobj = cobj.nexthere) {
                if (isContainer(cobj)) {
                    anyfound = true;
                    timepassed |= await do_loot_cont(
                        cobj, 1, 1, state,
                    );
                    if (state.ga?.abort_looting)
                        return timepassed ? ECMD_TIME : ECMD_OK;
                }
            }
            if (anyfound) c = 'y';
        }
    } else if (IS_GRAVE(state.level.at(cc.x, cc.y)?.typ)) {
        await ttyPline(
            'You need to dig up the grave to effectively loot it...',
            state,
        );
    }

    // pickup.c lootmon: 2296-2344.
    return doloot_core_lootmon(
        state, cc, c, timepassed, underfoot,
    );
}

// The lootmon label section of doloot_core() (pickup.c:2296-2344), split out
// so that the iflags.menu_requested goto can reach it without a goto.
async function doloot_core_lootmon(
    state, cc, c, timepassed, underfoot,
) {
    const dont_find_anything = "don't find anything";
    // pickup.c:2296.
    if (c !== 'y'
        && (mon_beside(state.u.ux, state.u.uy, state)
            || state.iflags?.menu_requested)) {
        const result = await get_adjacent_loc(
            'Loot in what direction?',
            'Invalid loot location',
            state.u.ux, state.u.uy, cc, state,
        );
        if (!result) return ECMD_OK;
        underfoot = u_at(cc.x, cc.y, state);
        if (underfoot && container_at(cc.x, cc.y, false, state)) {
            // goto lootcont: re-run the container path at the hero's
            // location. The direction pointed back at the hero, so cc is
            // still (u.ux, u.uy).
            if (!(await able_to_loot(cc.x, cc.y, true, state)))
                return ECMD_OK;
            for (let cobj = state.level.objects[cc.x][cc.y]; cobj;
                cobj = cobj.nexthere) {
                if (isContainer(cobj)) {
                    timepassed |= await do_loot_cont(
                        cobj, 1, 1, state,
                    );
                    if (state.ga?.abort_looting)
                        return timepassed ? ECMD_TIME : ECMD_OK;
                }
            }
            return timepassed ? ECMD_TIME : ECMD_OK;
        }
        // pickup.c:2304-2308.
        if (state.u.dz < 0) {
            await ttyPline(
                `You ${dont_find_anything} to loot on the `
                + `${ceiling(cc.x, cc.y, state)}.`,
                state,
            );
            return ECMD_TIME;
        }
        // pickup.c:2309-2313. loot_mon() is unported.
        const mtmp = m_at(cc.x, cc.y, state);
        if (mtmp) {
            throw new UnsupportedPickupError(
                'doloot_core: loot_mon() is unported',
            );
        }
        // pickup.c:2318-2319.
        if (ConfusionProp(state) || StunnedProp(state))
            timepassed = 1;
        // pickup.c:2325-2340.
        if (!underfoot && container_at(cc.x, cc.y, false, state)) {
            await ttyPline(
                'You have to be at a container to loot it.',
                state,
            );
        } else {
            await ttyPline(
                `You ${dont_find_anything} `
                + `${!underfoot ? 't' : ''}here to loot.`,
                state,
            );
            return timepassed ? ECMD_TIME : ECMD_OK;
        }
    } else if (c !== 'y' && c !== 'n') {
        // pickup.c:2341-2343.
        await ttyPline(
            `You ${dont_find_anything} `
            + `${underfoot ? 'here' : 'there'} to loot.`,
            state,
        );
    }
    return timepassed ? ECMD_TIME : ECMD_OK;
}

// C ref: pickup.c doloot() (2166-2174). The #loot extended command.
export async function doloot(state = game) {
    state.loot_reset_justpicked = true;
    let res;
    try {
        res = await doloot_core(state);
    } finally {
        state.loot_reset_justpicked = false;
    }
    return res;
}
