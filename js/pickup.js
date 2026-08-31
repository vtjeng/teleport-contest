// Inventory burden feedback, floor-square inspection, the pickup itself, and
// the #loot container-looting dispatch, all owned by pickup.c. C refs:
// pickup.c encumber_msg(), pickup(), check_here(), query_objlist(),
// all_but_uchain(), pickup_object(), the three corpse-handling helpers at
// 272-313, doloot(), doloot_core(), container_at(), able_to_loot(),
// mon_beside(), do_loot_cont(), use_container(), traditional_loot(),
// query_classes(), collect_obj_classes(), out_container(), lift_object(),
// carry_count(), pickup_prinv(), container_gone(), ck_bag(), and delta_cwt().

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
    IS_ALTAR,
    GETOBJ_ALLOWCNT,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    FEEL_COCKATRICE,
    FUMBLING,
    HAND,
    HVY_ENCUMBER,
    INCLUDE_HERO,
    INCLUDE_VENOM,
    INVORDER_SORT,
    IS_GRAVE,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    LOST_DROPPED,
    LOST_NONE,
    MENU_FULL,
    MENU_PARTIAL,
    MENU_TRADITIONAL,
    MOD_ENCUMBER,
    OBJ_FLOOR,
    OBJ_MINVENT,
    PICK_ANY,
    PICK_ONE,
    PLNMSG_OBJNAM_ONLY,
    SIGNAL_NOMENU,
    SIGNAL_ESCAPE,
    SLT_ENCUMBER,
    STAIRS,
    STONE,
    STONE_RES,
    STUNNED,
    ROOM,
    SELL_NORMAL,
    SORTLOOT_INVLET,
    SORTLOOT_LOOT,
    SORTLOOT_PACK,
    SORTLOOT_PETRIFY,
    USE_INVLET,
    CORR,
    W_ACCESSORY,
    W_ARMOR,
    W_WEP,
    plur,
    something,
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
import { def_char_to_objclass } from './drawing.js';
import { DEFAULT_PRIMARY_SYMBOLS, SYM_OFF_O } from './symbol_data.js';
import { container_contents } from './end.js';
import { autokey, pick_lock } from './lock.js';
import { bot, flush_screen, newsym, obj_to_glyph } from './display.js';
import { hliquid } from './do_name.js';
import { ceiling, surface } from './dungeon.js';
import { dropy } from './do.js';
import { can_reach_floor, freehand, read_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { upstart } from './hacklib.js';
import {
    calc_capacity,
    check_capacity,
    inv_cnt,
    inv_weight,
    near_capacity,
    nomul,
    weight_cap,
} from './hack.js';
import {
    INVLET_BASIC,
    NOINVSYM,
    add_to_container,
    addinv_runtime,
    freeinv,
    carrying,
    count_unpaid,
    dfeature_at,
    getobj,
    let_to_name,
    look_here,
    money_cnt,
    nxtobj,
    obj_extract_self,
    preflight_addinv_sequence,
    preflight_look_here,
    prinv,
    sortloot,
    update_inventory,
    will_feel_cockatrice,
    xprname,
} from './invent.js';
import {
    bigmonst, is_rider, nohands, nolimbs, notake, throws_rocks,
    touch_petrifies,
} from './mondata.js';
import { m_at } from './monst.js';
import {
    carried, hasContents, isBox, isContainer, obj_no_longer_held,
    remove_object, set_bknown, splitobj, weight,
} from './obj.js';
import { get_obj_location } from './light.js';
import { observe_object } from './o_init.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    AMULET_OF_YENDOR, BAG_OF_HOLDING, BAG_OF_TRICKS, BELL_OF_OPENING, BOULDER,
    CANDELABRUM_OF_INVOCATION, COIN_CLASS, CORPSE, GOLD_PIECE,
    HORN_OF_PLENTY, ICE_BOX, LARGE_BOX, LEASH, LOADSTONE,
    SCR_SCARE_MONSTER, SPE_BOOK_OF_THE_DEAD, STATUE, VENOM_CLASS,
} from './objects.js';
import {
    Tobjnam, Yname2, Ysimple_name2, assertObjectNameable, donameFresh,
    otense, safe_qbuf, the, The, thesimpleoname, xnameFresh, yname,
    ysimple_name,
} from './objnam.js';
import { body_part } from './polyself.js';
import { costly_spot, sellobj_state } from './shk.js';
import { stairway_at } from './stairs.js';
import { menuTitleStyle } from './tty_menu.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { clearTtyMessageWindow, ttyNorep, ttyPline } from './tty_message.js';
import {
    add_menu, add_menu_heading, getlin, select_menu,
} from './windows.js';
import { touch_artifact } from './artifacts.js';
import { setwornEnv } from './do_wear.js';
import { welded } from './wield.js';
import { setuqwep, setuswapwep, setuwep } from './worn.js';

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

// C ref: pickup.c query_objlist() (1025-1215). The counting loop and both of
// its early returns are followed by the bounded full-menu branch: sort the
// floor pile, group rows by inventory order, and return whole-stack choices
// from the TTY PICK_ANY menu. The INCLUDE_HERO and engulfer-inventory lists
// remain refused above because this slice owns only pickup()'s floor caller.
//
// C's `qstr`, `pick_list` and `how` arguments are not parameters. The prompt
// string and the PICK_ONE/PICK_ANY mode are read only by the menu, and the
// caller receives the selection as this function's result instead.
export async function query_objlist(olist, qflags, allow, state = game) {
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

    const sorted = (qflags & INVORDER_SORT) !== 0;
    const sortflags = (
        (state.flags.sortloot === 'f'
            || (state.flags.sortloot === 'l' && !(qflags & USE_INVLET)))
            ? SORTLOOT_LOOT
            : ((qflags & USE_INVLET) ? SORTLOOT_INVLET : 0)
    )
        | (state.flags.sortpack ? SORTLOOT_PACK : 0)
        | ((qflags & FEEL_COCKATRICE) ? SORTLOOT_PETRIFY : 0);
    // C's sortloot() calls allow() while it builds the temporary Loot array.
    // Bind the state here because the running caller's all_but_uchain() reads
    // state.uchain, while invent.js keeps the callback's source signature to
    // one object argument.
    const sortedObjects = sortloot(
        olist,
        sortflags,
        Boolean(qflags & BY_NEXTHERE),
        (obj) => allow(obj, state),
        state,
    );

    const items = [];
    const packOrder = [...(state.flags.inv_order ?? [])];
    if (qflags & INCLUDE_VENOM) packOrder.push(VENOM_CLASS);
    const menuOrder = sorted ? packOrder : [null];
    let first = true;
    for (const packClass of menuOrder) {
        let printedTypeName = false;
        for (const entry of sortedObjects) {
            const curr = entry.obj;
            if (sorted && curr.oclass !== packClass) continue;
            if ((qflags & FEEL_COCKATRICE)
                && curr.otyp === CORPSE
                && will_feel_cockatrice(curr, false, state)) {
                // pickup.c destroys the partially built menu, redraws the
                // square through look_here(), and returns before selection.
                // The resulting petrifying-corpse path is outside this
                // ordinary floor-pile slice, so preserve its fail-closed
                // boundary rather than selecting a dangerous corpse.
                throw new UnsupportedPickupError(
                    'query_objlist() touching a petrifying corpse',
                );
            }
            if (!allow(curr, state)) continue;

            const objectClass = state.objects[curr.otyp].oc_class;
            if (sorted && !printedTypeName) {
                items.push(add_menu_heading(
                    let_to_name(
                        packClass,
                        false,
                        Boolean(state.iflags?.menu_head_objsym),
                    ),
                    state,
                ));
                printedTypeName = true;
            }

            // C computes obj_to_glyph() before doname_with_price(). This
            // order matters when a future caller enables hallucination, since
            // both operations can consume display-RNG draws.
            const glyphInfo = obj_to_glyph(curr, state);
            const groupSelector = (qflags & USE_INVLET)
                ? curr.invlet
                : (first && curr.oclass === COIN_CLASS)
                    ? '$'
                    : String.fromCharCode(
                        DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + objectClass],
                    );
            items.push({
                groupSelector,
                // pickup() rejects live shop squares before this branch, so
                // the source's doname_with_price() has the same text as
                // doname() here under the default pricequotes setting. The
                // price-quote and shop-price variants remain outside scope.
                label: donameFresh(curr, state),
                value: curr,
                glyphInfo,
            });
            first = false;
        }
    }

    const selected = await select_menu(state, {
        title: 'Pick up what?',
        ...menuTitleStyle(state),
        items,
        how: PICK_ANY,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (selected === null) {
        // select_menu() uses null for C's select_menu() == -1. The caller
        // currently omits SIGNAL_ESCAPE, but query_objlist() preserves the
        // source's -2 answer for any future caller that supplies that flag.
        return {
            n: (qflags & SIGNAL_ESCAPE) ? -2 : 0,
            pick_list,
        };
    }

    for (const choice of selected) {
        const curr = choice.value;
        const count = choice.count === -1 || choice.count > curr.quan
            ? curr.quan : choice.count;
        pick_list.push({ obj: curr, count });
    }
    return { n: pick_list.length, pick_list };
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
// pickup() admits, fused with the preflight above. The autopickup exception
// list is refused by the caller, so autopick_testobj() applies only the
// costly-spot and pickup_types filters.
function planAutomaticFloorPickupAndRefreshCapacityCache(state) {
    const { u } = state;
    const costly = costly_spot(u.ux, u.uy, state);
    const pickupTypes = state.flags?.pickup_types ?? [];
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
        // C ref: pickup.c autopick_testobj():956-957.  When pickup_types is
        // non-empty, objects whose oclass is not listed go to remaining.
        if (pickupTypes.length && !pickupTypes.includes(obj.oclass)) {
            remaining.push(obj);
            continue;
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
        ({ pick_list: selected } = await query_objlist(
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
// Covered: the ordinary AUTOUNLOCK_APPLY_KEY lock-pick arm, which delegates
// the box to lock.c pick_lock().
//
// Not covered: AUTOUNLOCK_UNTRAP, AUTOUNLOCK_FORCE, and BAG_OF_TRICKS bite.
async function do_loot_cont(cobj, cindex, ccount, state) {
    if (!cobj) return ECMD_OK;

    if (cobj.olocked) {
        let res = ECMD_OK;
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
            state.u.dz = 0;
            let unlocktool = null;
            if (((autounlock & AUTOUNLOCK_APPLY_KEY)
                && (unlocktool = autokey(true, state)))
                || (autounlock & AUTOUNLOCK_UNTRAP)) {
                // pickup.c:2128-2135. Passing ox, oy and cobj makes this the
                // autounlock container path, so pick_lock() does not ask for
                // a direction and only considers the discovered container.
                const pickResult = await pick_lock(
                    unlocktool, cobj.ox, cobj.oy, cobj, state,
                );
                if (pickResult) res = ECMD_TIME;

                return res;
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
// C ref: pickup.c in_or_out_menu() (3397-3476). Builds a PICK_ONE menu for
// the MENU_PARTIAL/MENU_FULL container-action prompt.
async function in_or_out_menu(
    prompt, obj, outokay, inokay, alreadyused, more_containers, state,
) {
    const lootchars = '_:oibrsnq';
    const abc_chars = '_:abcdenq';
    const sel = state.flags?.lootabc ? abc_chars : lootchars;
    const items = [];
    items.push(add_menu(state, {
        selector: sel[1],
        label: `Look inside ${thesimpleoname(obj, state)}`,
        value: ':',
    }));
    if (outokay) {
        items.push(add_menu(state, {
            selector: sel[2],
            label: `take ${something} out`,
            value: 'o',
        }));
    }
    if (inokay) {
        items.push(add_menu(state, {
            selector: sel[3],
            label: `put ${something} in`,
            value: 'i',
        }));
    }
    if (outokay) {
        items.push(add_menu(state, {
            selector: sel[4],
            label: `${inokay ? 'both; ' : ''}take out, then put in`,
            value: 'b',
        }));
    }
    if (inokay) {
        items.push(add_menu(state, {
            selector: sel[5],
            label: `${outokay ? 'both reversed; ' : ''}put in, then take out`,
            value: 'r',
        }));
        items.push(add_menu(state, {
            selector: sel[6],
            label: `stash one item into ${thesimpleoname(obj, state)}`,
            value: 's',
        }));
    }
    items.push({ text: '' });
    if (more_containers) {
        items.push(add_menu(state, {
            selector: sel[7],
            label: 'loot next container',
            value: 'n',
            selected: true,
        }));
    }
    items.push(add_menu(state, {
        selector: sel[8],
        label: alreadyused ? 'done' : 'do nothing',
        value: 'q',
        selected: !more_containers,
    }));
    const defaultChoice = more_containers ? 'n' : 'q';
    const choice = await select_menu(state, {
        title: prompt,
        ...menuTitleStyle(state),
        items,
        how: PICK_ONE,
        preselected: defaultChoice,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    return choice ?? defaultChoice;
}

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
    let inokay = Boolean(state.invent
        && (state.invent !== state.gc.current_container
            || state.invent.nobj));
    // Might take something out if container is not empty.
    const outokay = hasContents(state.gc.current_container);
    // C ref: pickup.c:3042-3045.  Preformat the empty-container message when
    // the container has nothing inside.  quantum_cat and cursed_mbag have
    // already thrown, so the "now " qualifier never applies here.
    const emptymsg = !outokay
        ? `${Ysimple_name2(state.gc.current_container, state)} is empty.`
        : '';
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
        // C ref: pickup.c:3084-3115. MENU_PARTIAL and MENU_FULL show a
        // popup menu; TRADITIONAL and COMBINATION use yn_function().
        let ch;
        if (state.flags?.menu_style === MENU_PARTIAL
            || state.flags?.menu_style === MENU_FULL) {
            if (!inokay && !outmaybe) {
                ch = 'b';
            } else {
                ch = await in_or_out_menu(
                    qbuf, state.gc.current_container,
                    outmaybe, inokay,
                    used !== ECMD_OK,
                    more_containers, state,
                );
            }
        } else {
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
            ch = String.fromCharCode(c);
        }

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
        // C ref: pickup.c:3131-3206.  Item transfer dispatch.
        let loot_out = (c === 'o' || c === 'b' || c === 'r');
        let loot_in  = (c === 'i' || c === 'b' || c === 'r');
        const loot_in_first = (c === 'r');
        let stash_one = (c === 's');

        // out-only or out before in (C: 3137-3155)
        if (loot_out && !loot_in_first) {
            if (!hasContents(state.gc.current_container)) {
                await ttyPline(emptymsg, state);
                if (!state.gc.current_container.cknown)
                    used = ECMD_TIME;
                state.gc.current_container.cknown = 1;
            } else {
                add_valid_menu_class(0, state);
                if (state.flags?.menu_style === MENU_TRADITIONAL) {
                    used |= await traditional_loot(false, state);
                } else {
                    throw new UnsupportedPickupError(
                        'use_container: menu_loot(0, false)',
                    );
                }
                add_valid_menu_class(0, state);
            }
            // Recalculate inokay (C: 3153-3155).
            inokay = Boolean(state.invent
                && (state.invent !== state.gc.current_container
                    || state.invent.nobj));
        }

        // C: 3157-3161.
        if ((loot_in || stash_one) && !inokay) {
            await ttyPline(
                `You don't have anything${state.invent ? ' else' : ''} to `
                + `${stash_one ? 'stash' : 'put in'}.`,
                state,
            );
            loot_in = false;
            stash_one = false;
        }

        // C: 3167-3173. put-in path.
        if (loot_in) {
            add_valid_menu_class(0, state);
            if (state.flags?.menu_style === MENU_TRADITIONAL) {
                used |= await traditional_loot(true, state);
            } else {
                throw new UnsupportedPickupError(
                    'use_container: menu_loot(0, true)',
                );
            }
            add_valid_menu_class(0, state);
        } else if (stash_one) {
            // C: 3174-3186. Put one item into container via getobj prompt.
            const otmp = await getobj('stash', stash_ok,
                GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state);
            if (otmp) {
                if (await in_container(otmp, state)) {
                    used = 1;
                } else {
                    // in_container rejected the item; C calls unsplitobj()
                    // here to undo a count-based split, but getobj throws
                    // on count entry (get_count not ported), so no split
                    // can have occurred.
                }
            }
        }

        // Putting something in might have triggered magic bag explosion
        // (C: 3188-3189).
        if (!state.gc.current_container)
            loot_out = false;

        // out after in (C: 3192-3206)
        if (loot_out && loot_in_first) {
            if (!hasContents(state.gc.current_container)) {
                await ttyPline(emptymsg, state);
                if (!state.gc.current_container.cknown)
                    used = ECMD_TIME;
                state.gc.current_container.cknown = 1;
            } else {
                add_valid_menu_class(0, state);
                if (state.flags?.menu_style === MENU_TRADITIONAL) {
                    used |= await traditional_loot(false, state);
                } else {
                    throw new UnsupportedPickupError(
                        'use_container: menu_loot(0, false) out-after-in',
                    );
                }
                add_valid_menu_class(0, state);
            }
        }
    }

    // containerdone: (C: 3208-3222)
    if (used) {
        if (state.gc.current_container)
            state.gc.current_container.cknown = 1;
        update_inventory({ state });
    }

    sellobj_state(SELL_NORMAL, state);
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

// C ref: pickup.c:67-70.  Encumbrance feedback prefixes used by
// lift_object() and pickup_prinv().
const slightloadpfx = 'You have a little trouble';
const moderateloadpfx = 'You have trouble';
const nearloadpfx = 'You have much trouble';
const overloadpfx = 'You have extreme difficulty';

// ---------------------------------------------------------------
// Menu class filter state
// C ref: pickup.c:467-504. query_classes() writes these filters and
// askchain() reads them through menu_class_present() and ckvalidcat().
// ---------------------------------------------------------------

// C ref: pickup.c:469-471. menu_class_present().
function menu_class_present(c, state) {
    return Boolean(c && state.gv?.valid_menu_classes?.includes(String(c)));
}

// C ref: pickup.c:475-504. add_valid_menu_class().
function add_valid_menu_class(c, state) {
    state.gv ??= {};
    state.gc ??= {};
    state.gb ??= {};
    state.gs ??= {};
    state.gp ??= {};
    if (c === 0) {
        state.gv.valid_menu_classes = '';
        state.gc.class_filter = false;
        state.gb.bucx_filter = false;
        state.gs.shop_filter = false;
        state.gp.picked_filter = false;
    } else {
        const ch = String(c);
        if (!menu_class_present(c, state)) {
            state.gv.valid_menu_classes =
                (state.gv.valid_menu_classes ?? '') + ch;
            if ('BUCX'.includes(ch)) {
                state.gb.bucx_filter = true;
            } else if (ch === 'P') {
                state.gp.picked_filter = true;
            } else if (ch === 'u') {
                state.gs.shop_filter = true;
            } else {
                state.gc.class_filter = true;
            }
        }
    }
}

// C ref: invent.c:2136-2139.  ckvalidcat() delegates to pickup.c
// allow_category() (522-592).  For the take-out path the filter state is
// set by query_classes(); askchain() checks it when bycat is true.
function ckvalidcat(otmp, state) {
    // allow_category(): if no filters are active, reject (the
    // ParanoidAutoAll arm is not ported).
    if (!state.gc?.class_filter && !state.gs?.shop_filter
        && !state.gb?.bucx_filter && !state.gp?.picked_filter)
        return false;
    // Coins with an explicit class filter (C: 535-536).
    if (otmp.oclass === COIN_CLASS && state.gc?.class_filter)
        return (state.gv?.valid_menu_classes ?? '').includes(
            String.fromCharCode(COIN_CLASS));
    // BUC: class filter (C: 560-562).
    if (state.gc?.class_filter
        && !(state.gv?.valid_menu_classes ?? '').includes(
            String.fromCharCode(otmp.oclass)))
        return false;
    // Unpaid filter (C: 565-567).
    if (state.gs?.shop_filter && !otmp.unpaid
        && !(hasContents(otmp) && count_unpaid(otmp.cobj) > 0))
        return false;
    // BUC filter (C: 569-586).
    if (state.gb?.bucx_filter) {
        let bucx;
        if (otmp.oclass === COIN_CLASS) {
            bucx = state.flags?.goldX ? 'X' : 'U';
        } else {
            bucx = !otmp.bknown ? 'X'
                : otmp.blessed ? 'B'
                    : otmp.cursed ? 'C'
                        : 'U';
        }
        if (!(state.gv?.valid_menu_classes ?? '').includes(bucx))
            return false;
    }
    // Picked filter (C: 588-589).
    if (state.gp?.picked_filter && !otmp.pickup_prev)
        return false;
    return true;
}

// ---------------------------------------------------------------
// collect_obj_classes / query_classes / tally_BUCX
// ---------------------------------------------------------------

// C ref: pickup.c:100-118. collect_obj_classes().
function collect_obj_classes(objs, here, filter) {
    const ilets = [];
    let itemcount = 0;
    let otmp = objs;
    while (otmp) {
        const c = String.fromCharCode(
            DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + otmp.oclass]);
        if (!ilets.includes(c) && (!filter || filter(otmp)))
            ilets.push(c);
        itemcount++;
        otmp = here ? otmp.nexthere : otmp.nobj;
    }
    return { ilets, itemcount };
}

// C ref: invent.c:3580-3616. tally_BUCX().
function tally_BUCX(list, by_nexthere, state) {
    let bcnt = 0, ucnt = 0, ccnt = 0, xcnt = 0, ocnt = 0, jcnt = 0;
    for (let obj = list; obj; obj = by_nexthere ? obj.nexthere : obj.nobj) {
        // Role_if(PM_CLERIC) bknown assignment is not ported.
        if (obj.pickup_prev) jcnt++;
        if (obj.oclass === COIN_CLASS) {
            if (state.flags?.goldX) xcnt++;
            else ucnt++;
            continue;
        }
        if (!obj.bknown) xcnt++;
        else if (obj.blessed) bcnt++;
        else if (obj.cursed) ccnt++;
        else ucnt++;
    }
    return { bcnt, ucnt, ccnt, xcnt, ocnt, jcnt };
}

// C ref: pickup.c:140-261. query_classes().
// Returns { ok, selection, one_by_one, allflag } where ok indicates
// whether the caller should proceed with askchain().
async function query_classes(action, objs, here, state) {
    const result = { ok: false, selection: '', one_by_one: false,
        allflag: false, menu_on_request: 0 };

    const { ilets: iletArr, itemcount } =
        collect_obj_classes(objs, here, null);
    const iletct_base = iletArr.length;
    if (iletct_base === 0)
        return result;

    if (iletct_base === 1) {
        // Single class: auto-select it (C: 166-168).
        result.selection =
            String.fromCharCode(def_char_to_objclass(iletArr[0]));
    } else {
        // More than one base choice: append fixed letters (C: 170-174).
        iletArr.push(' ', 'a', 'A');
        iletArr.push(objs === state.invent ? 'i' : ':');
    }
    // Filter characters appended regardless of iletct_base (C: 176-191).
    if (itemcount) iletArr.push('m');
    if (count_unpaid(objs) > 0) iletArr.push('u');
    const bucx = tally_BUCX(objs, here, state);
    if (bucx.bcnt) iletArr.push('B');
    if (bucx.ucnt) iletArr.push('U');
    if (bucx.ccnt) iletArr.push('C');
    if (bucx.xcnt) iletArr.push('X');
    if (bucx.jcnt) iletArr.push('P');

    const ilets = iletArr.join('');

    // C: 194-260. Prompt loop — entered when iletct > 1.
    if (iletArr.length > 1) {
    for (;;) {
        let oclasses = '';
        result.one_by_one = false;
        result.allflag = false;
        let not_everything = false;
        let filtered = false;
        let m_seen = false;

        const qbuf =
            `What kinds of thing do you want to ${action}? [${ilets}]`;
        const inbuf = await getlin(qbuf, state);
        if (inbuf.startsWith('\x1b'))
            return result;

        let where_msg = null;
        for (const sym of inbuf) {
            if (sym === ' ') continue;
            else if (sym === 'A') result.one_by_one = true;
            else if (sym === 'a') result.allflag = true;
            else if (sym === ':') {
                // simple_look is not ported; ':' inside the container
                // shows container contents in C.  Refuse for now.
                throw new UnsupportedPickupError(
                    'query_classes: simple_look (:)');
            } else if (sym === 'i') {
                // display_inventory inside query_classes.
                throw new UnsupportedPickupError(
                    'query_classes: display_inventory (i)');
            } else if (sym === 'm') {
                m_seen = true;
            } else if ('uBUCXP'.includes(sym)) {
                add_valid_menu_class(sym, state);
                filtered = true;
            } else {
                const oc_of_sym = def_char_to_objclass(sym);
                if (ilets.includes(sym)) {
                    add_valid_menu_class(oc_of_sym, state);
                    oclasses += String.fromCharCode(oc_of_sym);
                } else {
                    if (where_msg === null) {
                        where_msg = action === 'pick up' ? 'here'
                            : action === 'take out' ? 'inside' : '';
                    }
                    if (where_msg)
                        await ttyPline(
                            `There are no ${sym}'s ${where_msg}.`, state);
                    else
                        await ttyPline(`You have no ${sym}'s.`, state);
                    not_everything = true;
                }
            }
        }

        if (m_seen) {
            result.menu_on_request = -2;
            return result;
        } else if (result.one_by_one || result.allflag || oclasses.length
            || filtered) {
            result.selection = oclasses;
            result.ok = !not_everything || oclasses.length;
            return result;
        } else {
            // No valid input -- re-prompt (goto ask_again in C).
            continue;
        }
    }
    }
    // C: 261. Return TRUE when selection is set (single class or prompt).
    result.ok = true;
    return result;
}

// ---------------------------------------------------------------
// delta_cwt / carry_count / lift_object
// ---------------------------------------------------------------

// C ref: pickup.c:1544-1566. delta_cwt().
// Calculates the change in a container's weight when obj is removed.
// For a bag of holding, temporarily removes the object and recalculates.
function delta_cwt(container, obj, state) {
    if (container.otyp !== BAG_OF_HOLDING)
        return obj.owt;
    const owt = container.owt;
    // Temporarily remove obj from container's content chain.
    let prev = null;
    for (let cur = container.cobj; cur; cur = cur.nobj) {
        if (cur === obj) break;
        prev = cur;
    }
    if (prev) prev.nobj = obj.nobj;
    else container.cobj = obj.nobj;
    const nwt = weight(container, { state });
    // Restore the chain.
    if (prev) prev.nobj = obj;
    else container.cobj = obj;
    return owt - nwt;
}

// C ref: pickup.c:1568-1701. carry_count().
// Returns how many of obj can be picked up.  Writes wt_before and
// wt_after through the returned object.
function carry_count(obj, container, count, telekinesis, state) {
    const adjust_wt = Boolean(container && carried(container));
    const is_gold = obj.oclass === COIN_CLASS;
    const savequan = obj.quan;
    const saveowt = obj.owt;
    const umoney = money_cnt(state.invent);
    const iw_base = inv_weight(state) - 2 * (state.gw?.wc ?? 0);

    let wt;
    if (count !== savequan) {
        obj.quan = count;
        obj.owt = weight(obj, { state });
    }
    wt = iw_base + obj.owt;
    if (adjust_wt)
        wt -= delta_cwt(container, obj, state);
    if (is_gold)
        wt -= (pickupGoldWeight(umoney) + pickupGoldWeight(count)
            - pickupGoldWeight(umoney + count));
    if (count !== savequan) {
        obj.quan = savequan;
        obj.owt = saveowt;
    }
    const result = { wt_before: iw_base, wt_after: wt, count };

    if (wt < 0)
        return result;

    // Determine how many we can lift (C: 1610-1657).
    let iw = iw_base;
    let qq;
    if (is_gold) {
        iw -= pickupGoldWeight(umoney);
        if (!adjust_wt) {
            qq = Math.trunc((-iw * 100) - (umoney + 50) - 1);
        } else {
            let oow = 0;
            qq = 50 - ((umoney % 100) || 0) - 1;
            if (qq < 0) qq += 100;
            for (; qq <= count; qq += 100) {
                obj.quan = qq;
                obj.owt = pickupGoldWeight(qq);
                let ow = pickupGoldWeight(umoney + qq);
                ow -= delta_cwt(container, obj, state);
                if (iw + ow >= 0) break;
                oow = ow;
            }
            iw -= oow;
            qq -= 100;
        }
        if (qq < 0) qq = 0;
        else if (qq > count) qq = count;
        wt = iw + pickupGoldWeight(umoney + qq);
    } else if (count > 1 || count < obj.quan) {
        for (qq = 1; qq <= count; qq++) {
            obj.quan = qq;
            let ow;
            obj.owt = ow = weight(obj, { state });
            if (adjust_wt)
                ow -= delta_cwt(container, obj, state);
            if (iw + ow >= 0) break;
            wt = iw + ow;
        }
        qq--;
    } else {
        qq = 0;
    }
    obj.quan = savequan;
    obj.owt = saveowt;

    // C: 1661-1700.  Messages when qq < count.
    if (qq < count) {
        const obj_nambuf = donameFresh(obj, state);
        const where_str = container
            ? `in ${the(xnameFresh(container, state), state)}`
            : 'lying here';
        const verb = container ? 'carry'
            : telekinesis ? 'acquire' : 'lift';
        if (qq > 0) {
            // "You can only carry some of the ..." -- not printed yet,
            // but counted.
            result.wt_after = wt;
            result.count = qq;
            return result;
        }
        // Cannot lift any (C: 1685-1700).
        const where2 = container ? where_str : 'here';
        let prefx1, prefx2, suffx;
        if (state.invent || umoney) {
            prefx1 = 'you cannot ';
            prefx2 = '';
            suffx = ' any more';
        } else {
            prefx1 = obj.quan === 1 ? 'it ' : 'even one ';
            prefx2 = 'is too heavy for you to ';
            suffx = '';
        }
        // "There are ... lying here, but you cannot lift any more."
        // This is a pline(); the caller interprets cnt_p < 1 as failure.
    }
    result.wt_after = wt;
    result.count = qq;
    return result;
}

// C ref: pickup.c:1704-1794. lift_object().
// Returns > 0 to lift, 0 to skip, < 0 to stop.
async function lift_object(obj, container, cnt_p, telekinesis, state) {
    if (obj.otyp === BOULDER && state.Sokoban) {
        await ttyPline(
            `You cannot get your ${body_part(HAND, state)} around this `
            + `${xnameFresh(obj, state)}.`,
            state,
        );
        return { result: -1, count: cnt_p };
    }
    // Loadstone and boulder-by-giant override (C: 1721-1734).
    if (obj.otyp === LOADSTONE
        || (obj.otyp === BOULDER && throws_rocks(state.youmonst?.data))) {
        if (inv_cnt(false, state) < INVLET_BASIC || !carrying(obj.otyp, state))
            return { result: 1, count: cnt_p };
        await ttyPline(
            `You are carrying too much stuff to pick up `
            + `${obj.quan === 1 ? 'another' : 'more'} ${xnameFresh(obj, state)}.`,
            state,
        );
        return { result: -1, count: cnt_p };
    }

    const cc = carry_count(obj, container, cnt_p, telekinesis, state);
    let count = cc.count;

    let result;
    if (count < 1) {
        result = -1;
    } else if (obj.oclass !== COIN_CLASS
        && inv_cnt(false, state) >= INVLET_BASIC) {
        // Knapsack full (C: 1740-1753).
        const goldHint = nxtobj(obj, GOLD_PIECE,
            obj.where === OBJ_FLOOR);
        await ttyPline(
            `Your knapsack cannot accommodate any more items`
            + `${goldHint ? ' (except gold)' : ''}.`,
            state,
        );
        result = -1;
    } else {
        result = 1;
        const prev_encumbr = Math.max(
            near_capacity(state), state.flags?.pickup_burden ?? MOD_ENCUMBER);
        const next_encumbr = calc_capacity(cc.wt_after - cc.wt_before, state);
        if (next_encumbr > prev_encumbr) {
            if (telekinesis) {
                result = 0;
            } else {
                // Encumbrance prompt (C: 1764-1787).
                const pfx = next_encumbr >= EXT_ENCUMBER ? overloadpfx
                    : next_encumbr >= HVY_ENCUMBER ? nearloadpfx
                        : next_encumbr >= MOD_ENCUMBER ? moderateloadpfx
                            : slightloadpfx;
                const savequan = obj.quan;
                obj.quan = count;
                const qbuf = `${pfx} `
                    + `${!container ? 'lifting' : 'removing'} `
                    + `${donameFresh(obj, state)}.  Continue?`;
                obj.quan = savequan;
                const sym = await yn_function(
                    qbuf, 'ynq', 'n', false, state);
                const ch = String.fromCharCode(sym);
                if (ch === 'q') result = -1;
                else if (ch === 'n') result = 0;
                clearTtyMessageWindow(state);
            }
        }
    }

    if (obj.otyp === SCR_SCARE_MONSTER && result <= 0 && !container)
        obj.spe = 0;
    return { result, count };
}

// ---------------------------------------------------------------
// in_container / out_container / pickup_prinv / container_gone / ck_bag
// ---------------------------------------------------------------

// C ref: pickup.c:2558-2712. in_container().
// Returns: 1 item was put in, 0 item was not put in, -1 stop.
// Unported sub-paths guarded fail-closed: obj_is_burning/snuff_lit,
// shop-floor billing (sellobj), icebox age handling, bag-of-holding
// explosion (mbag_explodes/do_boh_explosion).
async function in_container(obj, state) {
    if (!state.gc.current_container) {
        throw new Error('<in> no gc.current_container?');
    }

    const floor_container = !carried(state.gc.current_container);
    const Icebox = state.gc.current_container.otyp === ICE_BOX;

    if (obj === state.uball || obj === state.uchain) {
        await ttyPline('You must be kidding.', state);
        return 0;
    } else if (obj === state.gc.current_container) {
        await ttyPline(
            'That would be an interesting topological exercise.', state);
        return 0;
    } else if ((obj.owornmask ?? 0) & (W_ARMOR | W_ACCESSORY)) {
        await ttyNorep(
            `You cannot ${Icebox ? 'refrigerate' : 'stash'} ${something}`
            + ' you are wearing.', state);
        return 0;
    } else if (obj.otyp === LOADSTONE && obj.cursed) {
        set_bknown(obj, 1, { state });
        await ttyPline(
            `The stone${plur(obj.quan)} won't leave your person.`, state);
        return 0;
    } else if (obj.otyp === AMULET_OF_YENDOR
            || obj.otyp === CANDELABRUM_OF_INVOCATION
            || obj.otyp === BELL_OF_OPENING
            || obj.otyp === SPE_BOOK_OF_THE_DEAD) {
        // Prohibit Amulets in containers; if you allow it, monsters can't
        // steal them.  Ditto for the Candelabrum, the Bell and the Book.
        await ttyPline(
            `${The(xnameFresh(obj, state))} cannot be confined in such`
            + ' trappings.', state);
        return 0;
    } else if (obj.otyp === LEASH && obj.leashmon !== 0) {
        await ttyPline(
            `${Tobjnam(obj, 'are', state)} attached to your pet.`, state);
        return 0;
    } else if (obj === state.uwep) {
        if (welded(obj, state)) {
            // weldmsg() is not ported; refuse the welded weapon.
            throw new UnsupportedPickupError(
                'in_container: welded weapon (weldmsg)');
        }
        setuwep(null, setwornEnv(state));
        // Obsolete uwep check from 3.0: life-saving could rewield.
        if (state.uwep)
            return 0; /* unwielded, died, rewielded */
    } else if (obj === state.uswapwep) {
        setuswapwep(null, setwornEnv(state));
    } else if (obj === state.uquiver) {
        setuqwep(null, setwornEnv(state));
    }

    if (fatal_corpse_mistake(obj, false, state))
        return -1;

    // boxes, boulders, and big statues can't fit into any container
    if (obj.otyp === ICE_BOX || isBox(obj) || obj.otyp === BOULDER
        || (obj.otyp === STATUE
            && bigmonst(state.mons[obj.corpsenm]))) {
        const objName = the(xnameFresh(obj, state));
        const contName = the(xnameFresh(state.gc.current_container, state));
        await ttyPline(
            `You cannot fit ${objName} into ${contName}.`, state);
        return 0;
    }

    // --- Fail-closed guards for unported sub-paths ---
    // These guards are placed before freeinv() so the item stays in
    // inventory on an unported path.
    if (obj.lamplit) {
        // obj_is_burning / snuff_lit (C: 2626-2627).
        throw new UnsupportedPickupError(
            'in_container: obj_is_burning/snuff_lit');
    }
    if (floor_container && costly_spot(state.u.ux, state.u.uy, state)) {
        // Shop-floor billing via sellobj (C: 2629-2643).
        throw new UnsupportedPickupError(
            'in_container: shop floor billing (sellobj)');
    }
    if (Icebox) {
        // Icebox age handling (C: 2644-2657).
        throw new UnsupportedPickupError(
            'in_container: icebox age handling');
    }
    if (isMbag(state.gc.current_container)) {
        // Bag-of-holding explosion (C: 2658-2694).
        throw new UnsupportedPickupError(
            'in_container: bag of holding (mbag_explodes)');
    }

    freeinv(obj, { state });

    // gc.current_container is always intact here: the bag-of-holding
    // explosion path (the only one that clears it) is guarded above.
    const contName = the(xnameFresh(state.gc.current_container, state));
    await ttyPline(
        `You put ${donameFresh(obj, state)} into ${contName}.`, state);

    // Gold in container always needs to be added to credit (C: 2701-2702).
    if (floor_container && obj.oclass === COIN_CLASS) {
        // sellobj for gold on container's square; guarded above for
        // non-gold items in shops, but gold is handled after the message.
        throw new UnsupportedPickupError(
            'in_container: gold in floor container (sellobj)');
    }
    add_to_container(state.gc.current_container, obj, {
        state,
        hooks: { objectNoLongerHeld: obj_no_longer_held },
    });
    state.gc.current_container.owt = weight(
        state.gc.current_container, { state });

    // Gold needs this, and freeinv() may cause the encumbrance to disappear
    // from the status, so always update immediately (C: 2710).
    await bot();
    return state.gc.current_container ? 1 : -1;
}

// C ref: pickup.c:2719-2723. ck_bag().
function ck_bag(obj, state) {
    return Boolean(state.gc?.current_container
        && obj !== state.gc.current_container);
}

// C ref: pickup.c:2957-2969. stash_ok().
// getobj callback for the stash-one ('s') answer in use_container().
// Excludes the container being stashed into via ck_bag(); suggests everything
// else.
function stash_ok(obj, state) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    // Downplay the container being stashed into.
    if (!ck_bag(obj, state))
        return GETOBJ_EXCLUDE_SELECTABLE;

    return GETOBJ_SUGGEST;
}

// C ref: pickup.c:2902-2908. container_gone().
function container_gone(fn, state) {
    return ((fn === out_container || fn === in_container)
        && !state.gc?.current_container);
}

// C ref: pickup.c:1948-1972. pickup_prinv().
async function pickup_prinv(otmp, count, verb, state) {
    let pbuf = '';
    const nearload = near_capacity(state);
    let prefix = null;
    if (nearload === (state.gp?.pickup_encumbrance ?? 0)) {
        prefix = null;
    } else {
        prefix = nearload >= EXT_ENCUMBER ? overloadpfx
            : nearload >= HVY_ENCUMBER ? nearloadpfx
                : nearload >= MOD_ENCUMBER ? moderateloadpfx
                    : nearload >= SLT_ENCUMBER ? slightloadpfx
                        : null;
        state.gp ??= {};
        state.gp.pickup_encumbrance = nearload;
    }
    if (prefix)
        pbuf = `${prefix} ${verb}`;
    await prinv(pbuf || null, otmp, count, { state });
}

// C ref: pickup.c:2725-2777. out_container().
// Returns: -1 to stop, 1 item was removed, 0 item was not removed.
async function out_container(obj, state) {
    if (!state.gc?.current_container) {
        throw new Error('<out> no gc.current_container?');
    }
    const is_gold = obj.oclass === COIN_CLASS;
    if (is_gold) {
        obj.owt = weight(obj, { state });
    }

    if (obj.oartifact && !touch_artifact(obj, state.youmonst, { state }))
        return 0;

    if (fatal_corpse_mistake(obj, false, state))
        return -1;

    let count = obj.quan;
    const lo = await lift_object(
        obj, state.gc.current_container, count, false, state);
    if (lo.result <= 0) return lo.result;
    count = lo.count;

    let otmp = obj;
    if (obj.quan !== count && obj.otyp !== LOADSTONE)
        otmp = splitobj(obj, count, { state });

    // Remove the object from the container.
    obj_extract_self(otmp, { state });
    state.gc.current_container.owt =
        weight(state.gc.current_container, { state });

    // Icebox removal is not ported (age_is_relative, removed_from_icebox).
    // Shop billing for floor containers is not ported (addtobill).
    // pick_pick() shopkeeper feedback is not ported.

    const result = await addinv_runtime(otmp, { state });
    await pickup_prinv(result, count, 'removing', state);

    if (is_gold) {
        await bot();
    }
    return 1;
}

// ---------------------------------------------------------------
// askchain
// C ref: invent.c:2377-2541.
// ---------------------------------------------------------------

async function askchain(objchn, olets, allflag, fn, ckfn, mx, word, state) {
    const take_out = (word === 'take out');
    const put_in   = (word === 'put in');
    const nodot    = (word === 'nodot' || word === 'drop'
        || word === 'identify' || word === 'take out' || word === 'put in');
    const ininv    = (objchn === 'invent'); // see caller convention below
    const bycat    = menu_class_present('u', state)
        || menu_class_present('B', state) || menu_class_present('U', state)
        || menu_class_present('C', state) || menu_class_present('X', state)
        || menu_class_present('P', state);

    // C uses objchn as a pointer to the list head; we pass an accessor
    // string ('invent' or 'cobj') and read the live head each iteration
    // because the list can change under us (e.g., addinv moves items).
    function getListHead() {
        if (ininv) return state.invent;
        return state.gc?.current_container?.cobj ?? null;
    }

    // sortloot() on the list (C: 2407-2408).
    const sorted = sortloot(
        getListHead(), SORTLOOT_INVLET, false, null, state);

    let cnt = 0, dud = 0;
    let first = true;
    let oletIdx = 0; // index into olets string
    const oletStr = olets ?? '';

    // nextclass loop (C: 2416-2528).
    for (;;) {
        let ilet = 'a'.charCodeAt(0) - 1;
        const listHead = getListHead();
        if (listHead && listHead.oclass === COIN_CLASS)
            ilet--;

        // Walk sorted array, skip already-processed objects.
        // C uses bypass bits; JS uses a Set of processed object identities.
        const processed = new Set();

        for (const entry of sorted) {
            const otmp_candidate = entry.obj;
            if (processed.has(otmp_candidate)) continue;
            // Verify the object is still in the list.
            let found = false;
            for (let cur = getListHead(); cur; cur = cur.nobj) {
                if (cur === otmp_candidate) { found = true; break; }
            }
            if (!found) continue;

            processed.add(otmp_candidate);
            let otmp = otmp_candidate;

            if (ilet === 'z'.charCodeAt(0))
                ilet = 'A'.charCodeAt(0);
            else if (ilet === 'Z'.charCodeAt(0))
                ilet = NOINVSYM.charCodeAt(0);
            else
                ilet++;

            // Class filter (C: 2440-2441).
            if (oletStr.length > 0 && oletIdx < oletStr.length
                && otmp.oclass !== oletStr.charCodeAt(oletIdx))
                continue;
            // Takeoff/identify filters are not relevant for take-out.
            // ckfn filter (C: 2446-2447).
            if (ckfn && !ckfn(otmp, state))
                continue;
            // BUC/category filter (C: 2448-2449).
            if (bycat && !ckvalidcat(otmp, state))
                continue;

            let sym;
            if (!allflag) {
                // Build prompt (C: 2450-2470).
                let qpfx = '';
                if (first) {
                    if (take_out || put_in) {
                        qpfx = word.charAt(0).toUpperCase()
                            + word.slice(1) + ': ';
                    }
                    first = false;
                }
                const namefn = ininv
                    ? (o) => xprname(
                        o, null, String.fromCharCode(ilet), !nodot,
                        0, 0, state)
                    : (o) => donameFresh(o, state);
                const qbuf = safe_qbuf(
                    qpfx, '?', otmp, namefn,
                    (o) => donameFresh(o, state), 'item', state);
                // Prompt: yn with possible count ('#') (C: 2467-2470).
                const resp = await yn_function(
                    qbuf,
                    otmp.quan < 2 ? 'ynaq' : 'ynNaq',
                    'n', false, state,
                );
                sym = String.fromCharCode(resp);
            } else {
                sym = 'y';
            }

            const otmpo = otmp;
            if (sym === '#') {
                // Count entry not ported for this slice.
                throw new UnsupportedPickupError(
                    'askchain: count (#) entry');
            }

            switch (sym) {
            case 'a':
                allflag = 1;
                // fall through
            case 'y': {
                const tmp = await fn(otmp, state);
                if (tmp <= 0) {
                    if (container_gone(fn, state)) {
                        otmp = null;
                    } else if (otmp && otmp !== otmpo) {
                        // splitobj happened but action rejected; unsplitobj
                        // is not ported for this path.
                    }
                    if (tmp < 0) {
                        // goto ret
                        return cnt;
                    }
                }
                cnt += tmp;
                if (mx > 0 && --mx === 0) return cnt;
                // C FALLTHROUGH to 'n' — dud counts items offered.
            }
            // falls through
            case 'n':
                if (nodot) dud++;
                break;
            case 'q':
                return cnt;
            default:
                break;
            }
        }

        // Advance to next class letter (C: 2527-2528).
        if (oletStr.length > 0 && oletIdx < oletStr.length) {
            oletIdx++;
            if (oletIdx < oletStr.length) continue;
        }
        break;
    }

    if (dud || cnt)
        await ttyPline('That was all.', state);
    else if (!dud && !cnt)
        await ttyPline('No applicable objects.', state);

    return cnt;
}

// ---------------------------------------------------------------
// traditional_loot
// C ref: pickup.c:3228-3261.
// ---------------------------------------------------------------

async function traditional_loot(put_in, state) {
    let action, actionfunc, checkfunc;

    if (put_in) {
        // C: 3239-3243. put_in arm.
        action = 'put in';
        actionfunc = in_container;
        checkfunc = ck_bag;
    } else {
        // C: 3244-3249. take-out arm.
        action = 'take out';
        actionfunc = out_container;
        checkfunc = null;
        state.gp ??= {};
        state.gp.pickup_encumbrance = 0;
    }

    // C: 3251-3254. For take-out the object list is the container's
    // contents; for put-in it is the hero's inventory.
    const objlist_head = put_in
        ? state.invent
        : state.gc.current_container.cobj;
    const objchn_key = put_in ? 'invent' : 'cobj';

    const qc = await query_classes(action, objlist_head, false, state);
    if (qc.ok) {
        const olets = qc.one_by_one ? null : (qc.selection || null);
        const cnt = await askchain(
            objchn_key, olets, qc.allflag ? 1 : 0,
            actionfunc, checkfunc, 0, action, state);
        if (cnt) return ECMD_TIME;
    } else if (qc.menu_on_request < 0) {
        throw new UnsupportedPickupError(
            'traditional_loot: menu_loot(menu_on_request, put_in)');
    }
    return ECMD_OK;
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
    let c = null;
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

// -----------------------------------------------------------------------
// #tip: tipcontainer and its helpers
// -----------------------------------------------------------------------

const TIPCHECK_OK = 0;
const TIPCHECK_LOCKED = 1;
// const TIPCHECK_TRAPPED = 2;
// const TIPCHECK_CANNOT = 3;
const TIPCHECK_EMPTY = 4;

// Sentinel returned by tipcontainer_gettarget() when the user chooses
// "on the floor" in the target-selection menu.
const FLOOR_TARGET = Symbol('tipcontainer_floor');

// C ref: pickup.c tipcontainer_gettarget() (3870-3948). Asks the player
// where to tip the container contents: on the floor (preselected) or into
// a carried container.
//
// Returns { target, cancelled }. target is null for "on the floor" or an
// object for a carried container; cancelled is true when the user pressed
// Escape.
async function tipcontainer_gettarget(box, state) {
    const items = [];

    // pickup.c:3903-3905. "on the floor", preselected.
    items.push({
        selector: '-',
        label: 'on the floor',
        value: FLOOR_TARGET,
        selected: true,
    });

    // pickup.c:3906. Blank separator.
    items.push('');

    // pickup.c:3908-3928. Inventory containers, excluding the box itself
    // and known bags of tricks.
    let n_conts = 0;
    let hands_available = true;
    for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
        if (otmp === box) continue;
        if (!isContainer(otmp)) continue;
        if (otmp.otyp === BAG_OF_TRICKS && otmp.dknown
            && state.objects[otmp.otyp].oc_name_known) continue;
        if (!n_conts++) hands_available = await u_handsy(state);
        const exclude_it = !hands_available
            || (otmp.olocked && otmp.lknown);
        if (exclude_it) {
            // pickup.c:3924-3927. Indented, no selector, unselectable.
            items.push({
                label: `    ${donameFresh(otmp, state)}`,
            });
        } else {
            items.push({
                selector: otmp.invlet,
                label: donameFresh(otmp, state),
                value: otmp,
            });
        }
    }

    // pickup.c:3930-3933. Present the menu.
    const title =
        `Where to tip the contents of ${donameFresh(box, state)}`;
    const result = await select_menu(state, {
        title,
        ...menuTitleStyle(state),
        items,
        how: PICK_ONE,
        preselected: FLOOR_TARGET,
        overlay: state.iflags?.menu_overlay !== false,
    });

    // pickup.c:3936-3947. Interpret the result.
    if (result === null) {
        return { target: null, cancelled: true };
    }
    if (result === FLOOR_TARGET) {
        return { target: null, cancelled: false };
    }
    return { target: result, cancelled: false };
}

// C ref: pickup.c tipcontainer_checks() (3953-4055). Returns TIPCHECK_OK
// when the box can be tipped, a non-zero TIPCHECK code otherwise.
//
// Handles: lknown discovery (3972-3976), locked message (3978-3980), and
// empty container message (4047-4050). Locked, trapped, bag-of-tricks,
// horn-of-plenty, and Schrodinger branches throw because their helpers
// are unported.
async function tipcontainer_checks(box, targetbox, allowempty, state) {
    // pickup.c:3962-3967. Undiscovered bag of tricks as destination.
    if (targetbox && targetbox.otyp === BAG_OF_TRICKS) {
        throw new UnsupportedPickupError(
            'tipcontainer_checks: bag-of-tricks target (bagotricks)',
        );
    }

    // pickup.c:3972-3976. Discover lock status.
    if (!box.lknown) {
        box.lknown = 1;
        if (carried(box)) update_inventory({ state });
    }

    // pickup.c:3978-3980.
    if (box.olocked) {
        await ttyPline(
            `${upstart(thesimpleoname(box, state))} is locked.`,
            state,
        );
        return TIPCHECK_LOCKED;
    }

    // pickup.c:3982-3991. Trapped container.
    if (box.otrapped) {
        throw new UnsupportedPickupError(
            'tipcontainer_checks: trapped container (chest_trap)',
        );
    }

    // pickup.c:3993-4032. Bag of tricks or horn of plenty.
    if (box.otyp === BAG_OF_TRICKS || box.otyp === HORN_OF_PLENTY) {
        throw new UnsupportedPickupError(
            'tipcontainer_checks: bag of tricks / horn of plenty',
        );
    }

    // pickup.c:4034-4045. Schrodinger's box.
    if (box.otyp === LARGE_BOX && box.spe === 1) {
        throw new UnsupportedPickupError(
            'tipcontainer_checks: Schrodinger box (observe_quantum_cat)',
        );
    }

    // pickup.c:4047-4050. Empty container.
    if (!allowempty && !hasContents(box)) {
        box.cknown = 1;
        await ttyPline(
            `${upstart(thesimpleoname(box, state))} is empty.`,
            state,
        );
        return TIPCHECK_EMPTY;
    }

    return TIPCHECK_OK;
}

// C ref: pickup.c tipcontainer() (3688-3841). Tips the contents of a
// container onto the floor (or into another container).
//
// Covers the floor-spill path with terse and non-terse formatting.
// Container-to-container tipping, ICE_BOX handling (removed_from_icebox),
// cursed bag of holding item loss, shop billing (addtobill), hitfloor(),
// and doaltarobj() throw because their helpers are unported.
async function tipcontainer(box, state) {
    let ox = state.u.ux;
    let oy = state.u.uy;

    // pickup.c:3698-3699. Update box coordinates.
    const location = get_obj_location(box, 0, state);
    if (location) {
        ox = location.x;
        oy = location.y;
        box.ox = ox;
        box.oy = oy;
    }

    // pickup.c:3706-3708. Ask where to tip.
    const { target: targetbox, cancelled } =
        await tipcontainer_gettarget(box, state);
    if (cancelled) return;

    if (targetbox) {
        // Container-to-container tipping requires add_to_container with
        // bag-of-holding explosion handling, which is unported.
        throw new UnsupportedPickupError(
            'tipcontainer: container-to-container tipping',
        );
    }

    // pickup.c:3722. Shop goods flag.
    const srcheld = carried(box);
    const maybeshopgoods = !srcheld
        && costly_spot(box.ox, box.oy, state);

    // pickup.c:3724-3728. Run checks on the source box.
    if ((await tipcontainer_checks(box, targetbox, false, state))
        !== TIPCHECK_OK) {
        return;
    }
    // targetbox is null (floor), so the second check at 3726-3728 is
    // skipped.

    // pickup.c:3730-3741. Determine formatting flags.
    const highdrop = !can_reach_floor(true, state);
    const altarizing = IS_ALTAR(state.level.at(ox, oy).typ);
    const cursed_mbag =
        (box.otyp === BAG_OF_HOLDING || box.otyp === BAG_OF_TRICKS)
        && box.cursed;

    if (state.u?.uswallow) {
        throw new UnsupportedPickupError(
            'tipcontainer: hero is swallowed',
        );
    }

    let terse = !(highdrop || altarizing
        || costly_spot(box.ox, box.oy, state));
    box.cknown = 1;

    // pickup.c:3752-3755. Spill header.
    const multipleItems = Boolean(box.cobj?.nobj);
    await ttyPline(
        `${multipleItems ? 'Objects spill' : 'An object spills'}`
        + ` out${terse ? ':' : '.'}`,
        state,
    );

    // Build the drop-chain environment for dropy(). The hooks match
    // do.c dropCommandEnv(): newsym for map updates, encumber_msg for
    // burden, and extractExternalObject for stackobj() merge absorption.
    const tipDropEnv = {
        state,
        hooks: {
            encumberMessage: encumber_msg,
            extractExternalObject: remove_object,
            newsym,
        },
    };

    // pickup.c:3757-3829. Spill each item.
    let nobj;
    for (let otmp = box.cobj; otmp; otmp = nobj) {
        nobj = otmp.nobj;
        obj_extract_self(otmp, { state });
        otmp.ox = box.ox;
        otmp.oy = box.oy;

        // pickup.c:3762-3763. ICE_BOX corpse thawing.
        if (box.otyp === ICE_BOX) {
            throw new UnsupportedPickupError(
                'tipcontainer: ICE_BOX (removed_from_icebox)',
            );
        }
        // pickup.c:3764-3769. Cursed bag of holding item loss.
        if (cursed_mbag) {
            throw new UnsupportedPickupError(
                'tipcontainer: cursed bag of holding item loss',
            );
        }
        // pickup.c:3770-3773. Shop billing.
        if (maybeshopgoods) {
            throw new UnsupportedPickupError(
                'tipcontainer: shop goods (addtobill)',
            );
        }

        // pickup.c:3807-3811. Unreachable floor.
        if (highdrop) {
            throw new UnsupportedPickupError(
                'tipcontainer: hitfloor() from unreachable floor',
            );
        }
        // pickup.c:3812-3813. Altar.
        if (altarizing) {
            throw new UnsupportedPickupError(
                'tipcontainer: doaltarobj()',
            );
        }

        // pickup.c:3814-3825. Print the item and drop it.
        if (!terse) {
            // pickup.c:3815-3816. Verbose per-item message.
            await ttyPline(
                `${upstart(donameFresh(otmp, state))} `
                + `${otense(otmp, 'drop')} to the `
                + `${surface(ox, oy, state)}.`,
                state,
            );
        } else {
            // pickup.c:3818-3819. Terse comma-separated list.
            await ttyPline(
                `${donameFresh(otmp, state)}${nobj ? ',' : '.'}`,
                state,
            );
            state.iflags.last_msg = PLNMSG_OBJNAM_ONLY;
        }
        otmp.how_lost = LOST_DROPPED;
        await dropy(otmp, tipDropEnv);
        // pickup.c:3823-3824. Detect if dropy() interrupted terse
        // formatting by emitting its own message.
        if (state.iflags.last_msg !== PLNMSG_OBJNAM_ONLY)
            terse = false;
    }

    // pickup.c:3832-3837. Update weights and encumbrance.
    box.owt = weight(box);
    if (srcheld) {
        await encumber_msg(state);
        update_inventory({ state });
    }
}

// C ref: hack.h:1330.  ynq(query) = yn_function(query, ynqchars, 'q', TRUE).
// The addcmdq TRUE tells C to push the answer onto CQ_REPEAT so that a
// repeated command replays it; CQ_REPEAT is not ported, so passing false is
// safe. Used by dotip() below; lock.js carries its own copy for doforce().
const YNQCHARS = 'ynq';
async function ynq(query, state) {
    const KEY_Q = 'q'.charCodeAt(0);
    const KEY_Y = 'y'.charCodeAt(0);
    const c = await yn_function(query, YNQCHARS, 'q', false, state);
    if (c === KEY_Y) return 'y';
    if (c === KEY_Q) return 'q';
    return 'n';
}

// C ref: pickup.c dotip() (3562-3677). The #tip extended command.
// Covers the single-floor-container ynq prompt and the 'y' branch that calls
// tipcontainer(). The 'q' and 'n' branches cancel without tipping.
// The inventory-item tipping path (getobj -> tip_ok, pickup.c:3624-3677) and
// the multi-container menu path (choose_tip_container_menu) are unported.
export async function dotip(state = game) {
    const cc = { x: state.u.ux, y: state.u.uy };

    // pickup.c:3586. Count floor containers.
    const boxes = container_at(cc.x, cc.y, true, state);

    // pickup.c:3589-3619. Floor-container block.
    if (boxes > 0
        && (!state.iflags?.menu_requested
            || (state.flags?.menu_style === MENU_TRADITIONAL && boxes > 1))
    ) {
        const buf = "You can't tip "
            + (!state.flags?.verbose ? 'a container'
                : (boxes > 1) ? 'one' : 'it')
            + ' while carrying so much.';
        if (!(await check_capacity(buf, state))
            && (await able_to_loot(cc.x, cc.y, false, state))
        ) {
            if (boxes > 1) {
                // pickup.c:3596-3599. Multi-container menu (unported).
                throw new UnsupportedPickupError(
                    'dotip: multi-container choose_tip_container_menu',
                );
            } else {
                // pickup.c:3601-3617. Single-container for-loop.
                for (let cobj = state.level.objects[cc.x][cc.y]; cobj;
                    cobj = cobj.nexthere) {
                    if (!isContainer(cobj))
                        continue;
                    const qbuf = safe_qbuf(
                        'There is ', ' here, tip it?', cobj,
                        (o, s) => donameFresh(o, s), null, 'container',
                        state,
                    );
                    const c = await ynq(qbuf, state);
                    if (c === 'q')
                        return ECMD_OK;
                    if (c === 'n')
                        continue;
                    // pickup.c:3614-3616. Tip accepted.
                    await tipcontainer(cobj, state);
                    return ECMD_TIME;
                }
            }
        }
    }

    // pickup.c:3624-3677. Inventory-item tipping (unported).
    throw new UnsupportedPickupError(
        'dotip: inventory tipping path (getobj -> tip_ok)',
    );
}
