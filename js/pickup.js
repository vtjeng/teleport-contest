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
    ALL_TYPES,
    ALL_TYPES_SELECTED,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_FORCE,
    AUTOUNLOCK_UNTRAP,
    BUC_BLESSED,
    BUC_CURSED,
    BUC_UNCURSED,
    BUC_UNKNOWN,
    BUCX_TYPES,
    BLINDED,
    BY_NEXTHERE,
    CHOOSE_ALL,
    CONFUSION,
    ECMD_OK,
    ECMD_TIME,
    EXT_ENCUMBER,
    FOOT,
    HALLUC,
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
    ICE,
    INCLUDE_HERO,
    INCLUDE_VENOM,
    INVORDER_SORT,
    IS_GRAVE,
    LOOKHERE_NOFLAGS,
    LOOKHERE_PICKED_SOME,
    LOOKHERE_SKIP_DFEATURE,
    LOST_DROPPED,
    LOST_EXPLODING,
    LOST_STOLEN,
    LOST_THROWN,
    MENU_FULL,
    MENU_PARTIAL,
    MENU_TRADITIONAL,
    MOD_ENCUMBER,
    MM_ADJACENTOK,
    MM_NOMSG,
    NO_MINVENT,
    nothing_seems_to_happen,
    OBJ_FLOOR,
    OBJ_MINVENT,
    ONAME_NO_FLAGS,
    PICK_ANY,
    PICK_ONE,
    JUSTPICKED,
    PARANOID_AUTOALL,
    PLNMSG_BACK_ON_GROUND,
    PLNMSG_OBJNAM_ONLY,
    SIGNAL_NOMENU,
    SIGNAL_ESCAPE,
    SHOPBASE,
    SLT_ENCUMBER,
    STONE,
    STONE_RES,
    STUNNED,
    TIMEOUT,
    SELL_NORMAL,
    SORTLOOT_INVLET,
    SORTLOOT_LOOT,
    SORTLOOT_PACK,
    SORTLOOT_PETRIFY,
    USE_INVLET,
    UNPAID_TYPES,
    IS_FURNITURE,
    IS_LAVA,
    IS_POOL,
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
import { ceiling, surface, surface_typ } from './dungeon.js';
import { dropy } from './do.js';
import { can_reach_floor, freehand, read_engr_at } from './engrave.js';
import { makesingular } from './fruit.js';
import { christen_monst, Monnam, oname, rndmonnam } from './do_name.js';
import { more_experienced, newexplevel } from './exper.js';
import { game } from './gstate.js';
import { upstart } from './hacklib.js';
import {
    calc_capacity,
    check_capacity,
    inv_cnt,
    inv_weight,
    max_capacity,
    near_capacity,
    nomul,
    weight_cap,
} from './hack.js';
import {
    INVLET_BASIC,
    add_to_container,
    addinv_runtime,
    freeinv,
    carrying,
    currency,
    count_unpaid,
    tally_BUCX,
    dfeature_at,
    getobj,
    merge_choice,
    let_to_name,
    look_here,
    money_cnt,
    nxtobj,
    obj_extract_self,
    preflight_addinv_sequence,
    preflight_look_here,
    prinv,
    sortloot,
    ckvalidcat,
    askchain,
    update_inventory,
    will_feel_cockatrice,
} from './invent.js';
import {
    bigmonst, is_rider, nohands, nolimbs, notake, throws_rocks,
    hides_under, touch_petrifies,
} from './mondata.js';
import { m_at } from './monst.js';
import {
    carried, hasContents, hornoplenty, isBox, isContainer, obj_no_longer_held,
    remove_object, set_bknown, set_corpsenm, splitobj, unsplitobj, weight,
} from './obj.js';
import { canSpotMonster } from './startup_a11y.js';
import { get_obj_location } from './light.js';
import { bagotricks, set_malign } from './makemon.js';
import { makemon } from './makemon_create.js';
import { observe_object } from './o_init.js';
import { objectGenerationEnv } from './object_generation.js';
import { regex_match } from './posixregex.js';
import { in_rooms } from './rooms.js';
import { rn2 } from './rng.js';
import {
    AMULET_OF_YENDOR, BAG_OF_HOLDING, BAG_OF_TRICKS, BELL_OF_OPENING, BOULDER,
    CANDELABRUM_OF_INVOCATION, COIN_CLASS, CORPSE, GOLD_PIECE,
    HORN_OF_PLENTY, ICE_BOX, LARGE_BOX, LEASH, LOADSTONE,
    SCR_SCARE_MONSTER, SPE_BOOK_OF_THE_DEAD, STATUE, VENOM_CLASS,
} from './objects.js';
import { PM_HOUSECAT } from './monsters.js';
import {
    an, ansimpleoname, Tobjnam, Yname2, Ysimple_name2, assertObjectNameable,
    donameFresh, doname_with_price, otense, safe_qbuf, the, The, thesimpleoname,
    xnameFresh, yname, ysimple_name,
} from './objnam.js';
import { body_part } from './polyself.js';
import {
    addtobill, check_unpaid_usage, costly_spot, pick_pick, remote_burglary,
    sellobj_state,
} from './shk.js';
import { menuTitleStyle } from './tty_menu.js';
import { waterbody_name } from './pager.js';
import {
    back_on_ground, is_lava, is_pool, t_at, chest_trap, unconscious,
    uescaped_shaft, uteetering_at_seen_pit,
} from './trap.js';
import { clearTtyMessageWindow, ttyNorep, ttyPline } from './tty_message.js';
import {
    add_menu, add_menu_heading, getlin, select_menu,
} from './windows.js';
import { touch_artifact } from './artifacts.js';
import { setwornEnv } from './do_wear.js';
import { welded } from './wield.js';
import { setuqwep, setuswapwep, setuwep } from './worn.js';
import { note_unported } from './unported.js';

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

// C ref: pickup.c count_justpicked() (635-645). Counts objects in a list
// whose pickup_prev flag is set, indicating they were just picked up.
function count_justpicked(olist) {
    let cnt = 0;
    for (let obj = olist; obj; obj = obj.nobj)
        if (obj.pickup_prev) cnt++;
    return cnt;
}

// C ref: pickup.c find_justpicked() (647-657). Returns the first object in
// a list whose pickup_prev flag is set, or null.
function find_justpicked(olist) {
    for (let obj = olist; obj; obj = obj.nobj)
        if (obj.pickup_prev) return obj;
    return null;
}

function heroHasProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// C ref: pickup.c deferred_decor() (337-350). The flag is deliberately stored
// beside prev_decor, so a timeout can defer one terrain message and the next
// pickup or movement can catch it up in source order.
export async function deferred_decor(setup, state = game) {
    state.iflags ??= {};
    if (!state.flags?.mention_decor) {
        state.iflags.defer_decor = false;
    } else if (setup) {
        state.iflags.defer_decor = true;
    } else {
        await describe_decor(state);
        state.iflags.defer_decor = false;
    }
}

// C ref: pickup.c describe_decor() (353-425). This plan performs only the
// side-effect-free reads needed by movement admission. In particular, C's
// dfeature_at() call remains in describe_decor() below: its ICE description
// updates ice_rating and may consume display RNG, and must happen once on the
// committed square rather than during an admission probe.
function describeDecorPlan(x, y, state = game) {
    const location = state.level?.at(x, y);
    const ltyp = surface_typ(location);
    const previous = state.iflags?.prev_decor ?? STONE;
    const fumbling = Number(state.u?.uprops?.[FUMBLING]?.intrinsic ?? 0);
    if ((fumbling & TIMEOUT) === 1
        && !state.iflags?.defer_decor
        && !state.decor_fumble_override) {
        return { result: false, deferred: true };
    }

    const underwater = Boolean(state.u?.uinwater);
    return {
        result: ltyp !== previous || IS_FURNITURE(ltyp),
        ltyp,
        previous,
        underwater,
        groundTransition: !underwater
            && (IS_POOL(previous) || IS_LAVA(previous) || previous === ICE),
    };
}

// Admission calls this before movement. It mirrors describe_decor()'s
// boolean result without changing terrain memory, output, or coordinates.
export function preflight_describe_decor_at(x, y, state = game) {
    return describeDecorPlan(x, y, state).result;
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
    if (state.flags?.mention_decor)
        preflight_describe_decor_at(u.ux, u.uy, state);
}

// C ref: pickup.c describe_decor(). This owns terrain transitions, furniture
// and liquid wording, ICE's Norep path, Fumbling deferral, and back_on_ground.
// The source ltyp is stored only after its message/transition is complete.
export async function describe_decor(state = game, env = {}) {
    state.iflags ??= {};
    const { u } = state;
    const plan = describeDecorPlan(u.ux, u.uy, state);
    if (plan.deferred) {
        await deferred_decor(true, state);
        return false;
    }

    const message = env.message ?? ttyPline;
    const norepMessage = env.norepMessage ?? ttyNorep;
    // C calls dfeature_at() before its unchanged non-furniture arm, even when
    // that arm suppresses output. Keep that live side effect (ICE's rating
    // and display-RNG description) out of describeDecorPlan(), which is also
    // used by movement admission.
    let dfeature = dfeature_at(u.ux, u.uy, state);
    const doorhere = dfeature === 'open door' || dfeature === 'doorway';
    const waterhere = dfeature === 'pool of water';
    if (doorhere || plan.underwater
        || (plan.ltyp === ICE && IS_POOL(plan.previous))) {
        dfeature = null;
    }
    // C's unchanged non-furniture arm (pickup.c:392-394) precedes both the
    // dfeature and ground-transition arms. dfeature_at() can still describe
    // a feature on that square (for example a broken door), but C suppresses
    // it when ltyp == prev_decor; the final terrain-memory store still runs.
    if (plan.result) {
        if (dfeature) {
            let feature = dfeature;
            if (waterhere)
                feature = waterbody_name(u.ux, u.uy, state, env);
            if (feature !== 'swamp' && plan.ltyp !== ICE)
                feature = an(feature);

            const text = state.flags?.verbose === true
                ? `There is ${feature} here.`
                : `${upstart(feature)}.`;
            if (plan.ltyp === ICE && state.flags?.mention_decor)
                await norepMessage(text, state);
            else
                await message(text, state);
        } else if (plan.groundTransition) {
            if (state.iflags.last_msg !== PLNMSG_BACK_ON_GROUND)
                await back_on_ground(false, state);
        }
    }

    state.iflags.prev_decor = state.flags?.mention_decor
        ? plan.ltyp : STONE;
    return plan.result;
}

// C ref: pickup.c force_decor(). Probing and blind look_here() must bypass
// one-turn Fumbling deferral, force describe_decor() to see a transition, and
// then refresh lastseentyp at the source square. The caller supplies the
// message owner so isolated look_here tests do not need a live TTY.
export async function force_decor(
    viaProbing = false,
    state = game,
    env = {},
) {
    state.iflags ??= {};
    state.gd ??= {};
    const { ux, uy } = state.u;
    state.decor_fumble_override = true;
    state.gd.decor_levitate_override = viaProbing;
    state.iflags.prev_decor = STONE;
    try {
        await describe_decor(state, env);
    } finally {
        // pickup.c force_decor() always clears both temporary overrides after
        // describe_decor(), rather than restoring a caller's stale values.
        state.decor_fumble_override = false;
        state.gd.decor_levitate_override = false;
    }
    state.level.lastseentyp ??= [];
    state.level.lastseentyp[ux] ??= [];
    state.level.lastseentyp[ux][uy] = state.level.at(ux, uy)?.typ ?? STONE;
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
// floor pile is walked by nexthere; a swallowed monster's inventory is walked
// by nobj.
function FOLLOW(obj, qflags) {
    return (qflags & BY_NEXTHERE) ? obj.nexthere : obj.nobj;
}

// C ref: pickup.c all_but_uchain() (508-512), the query_objlist() callback
// that dopickup() passes. state.uchain holds the ball and chain while the
// hero is punished; pickup_object() still owns the traditional interface's
// tried-but-not-picked return for that object.
function all_but_uchain(obj, state) {
    return obj !== (state.uchain ?? null);
}

// C ref: pickup.c n_or_more() (458-465).  The callback uses the caller's
// current count threshold and still excludes the punishment chain.
function n_or_more(obj, state) {
    return obj !== (state.uchain ?? null)
        && obj.quan >= Math.trunc(state.gv?.val_for_n_or_more ?? 0);
}

// C ref: pickup.c query_objlist() (1025-1215). The counting loop and both of
// its early returns are followed by the bounded full-menu branch: sort the
// floor pile, group rows by inventory order, and return whole-stack choices
// from the TTY menu. INCLUDE_HERO remains a separate look-here fake-object
// caller, while OBJ_MINVENT is walked by pickup()'s swallowed branch.
//
// C's `pick_list` and `how` arguments are not parameters. The caller receives
// the selection as this function's result instead. `title` preserves the
// source qstr for the two full-menu callers while retaining pickup()'s
// established default.
export async function query_objlist(
    olist, qflags, allow, state = game, title = 'Pick up what?',
    how = PICK_ANY,
) {
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
    // pickup.c:1058-1062 clears AUTOSELECT_SINGLE for one worn item in an
    // engulfer's inventory.  The list still proceeds through the same menu;
    // the selected worn object is rejected after the menu is answered.
    const engulferMinvent = Boolean(
        olist.where === OBJ_MINVENT && state.u?.uswallow,
    );
    if (engulferMinvent && n === 1 && (olist.owornmask ?? 0))
        qflags &= ~AUTOSELECT_SINGLE;

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
                // pickup.c destroys the partial menu, calls look_here(0,
                // LOOKHERE_NOFLAGS), and returns before selection. The
                // source look_here() owns the warning and any engraving read;
                // keep those effects in its canonical caller order.
                await look_here(0, LOOKHERE_NOFLAGS, state, {
                    message: ttyPline,
                    readEngraving: () => read_engr_at(
                        state.u.ux,
                        state.u.uy,
                        state,
                        { pline: ttyPline, canReachFloor: can_reach_floor },
                    ),
                });
                return { n: 0, pick_list };
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
                // C passes a zero selector for ordinary rows, allowing the
                // TTY menu to assign a,b,c... after headings; gold is the
                // one non-inventory-letter row with its explicit '$'.
                selector: (qflags & USE_INVLET)
                    ? curr.invlet
                    : (first && curr.oclass === COIN_CLASS ? '$' : undefined),
                groupSelector,
                // C uses doname_with_price(). Outside a shop (or for coins
                // and punishment objects), get_cost_of_shop_item returns 0
                // with nochrg=-1, so the ordinary name/remembered quote is
                // identical. Keep the existing priced-name callee boundary
                // for live shop stock, including its unsupported variants.
                label: state.u.ushops?.[0] && curr.oclass !== COIN_CLASS
                    && curr !== state.uball && curr !== state.uchain
                    && curr.where === OBJ_FLOOR
                    && in_rooms(curr.ox, curr.oy, SHOPBASE, state)[0]
                        === state.u.ushops[0]
                    ? doname_with_price(curr, state, { currencyName: currency })
                    : donameFresh(curr, state),
                value: curr,
                glyphInfo,
            });
            first = false;
        }
    }

    const selected = await select_menu(state, {
        title,
        ...menuTitleStyle(state),
        items,
        how,
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
        if (engulferMinvent && (curr.owornmask ?? 0)) {
            await ttyPline(
                `You can't pick ${ysimple_name(curr, state)} up.`, state,
            );
            continue;
        }
        const count = choice.count === -1 || choice.count > curr.quan
            ? curr.quan : choice.count;
        pick_list.push({ obj: curr, count });
    }
    return { n: pick_list.length, pick_list };
}

// C ref: pickup.c:1510-1541. count_categories().  The menu-loot category
// query only supplies a container list, so FOLLOW() traverses nobj here just
// as it does in the source.
function count_categories(olist, qflags, state = game) {
    let count = 0;
    for (const objectClass of state.flags?.inv_order ?? []) {
        for (let obj = olist; obj; obj = FOLLOW(obj, qflags)) {
            if (obj.oclass === objectClass) {
                count++;
                break;
            }
        }
    }
    return count;
}

// C ref: pickup.c:1225-1508. This is the PICK_ANY category menu used by
// menu_loot() for an unlocked, untrapped container. Worn, billed, and
// paranoid-confirmation variants are outside this out-only slice; ordinary
// class and BUC filters are source-shaped because the next item menu reads
// the filter state through allow_category().
export async function query_category(
    title, olist, qflags, state = game,
) {
    if (!olist) return { n: 0, pick_list: [] };

    const do_unpaid = Boolean((qflags & UNPAID_TYPES)
        && count_unpaid(olist));
    const bucx = tally_BUCX(olist, Boolean(qflags & BY_NEXTHERE), state);
    const do_blessed = Boolean((qflags & BUC_BLESSED) && bucx.bcnt);
    const do_cursed = Boolean((qflags & BUC_CURSED) && bucx.ccnt);
    const do_uncursed = Boolean((qflags & BUC_UNCURSED) && bucx.ucnt);
    const do_buc_unknown = Boolean((qflags & BUC_UNKNOWN) && bucx.xcnt);
    const num_buc_types = [
        do_blessed, do_cursed, do_uncursed, do_buc_unknown,
    ].filter(Boolean).length;
    const num_justpicked = (qflags & JUSTPICKED) ? bucx.jcnt : 0;
    const categoryCount = count_categories(olist, qflags, state);

    // C's single-category early return is observable when a caller requests
    // one class and at most one BUC category; no menu is drawn in that case.
    if (categoryCount === 1 && !do_unpaid && num_buc_types <= 1) {
        for (let obj = olist; obj; obj = FOLLOW(obj, qflags))
            return { n: 1, pick_list: [{ value: obj.oclass, count: -1 }] };
        return { n: 0, pick_list: [] };
    }

    const items = [];
    if (qflags & CHOOSE_ALL) {
        items.push({
            selector: 'A',
            value: 'A',
            label: 'Auto-select every relevant item',
            skipinvert: true,
        });
        if (!(state.flags?.paranoia_bits & PARANOID_AUTOALL)) {
            items.push({
                text: '    (ignored unless some other choices are also picked)',
            });
        }
        items.push({ text: '' });
    }

    const showAll = Boolean((qflags & ALL_TYPES) && categoryCount > 1);
    let selectorCode = 'a'.charCodeAt(0);
    if (showAll) {
        items.push({
            selector: 'a',
            value: ALL_TYPES_SELECTED,
            label: 'All types',
            skipinvert: true,
        });
        selectorCode++;
    }

    const invOrder = [...(state.flags?.inv_order ?? [])];
    if (qflags & INCLUDE_VENOM) invOrder.push(VENOM_CLASS);
    for (const objectClass of invOrder) {
        let hasClass = false;
        for (let obj = olist; obj; obj = FOLLOW(obj, qflags)) {
            if (obj.oclass !== objectClass) continue;
            hasClass = true;
            break;
        }
        if (!hasClass) continue;
        const selector = String.fromCharCode(selectorCode++);
        items.push({
            selector,
            value: objectClass,
            groupSelector: String.fromCharCode(
                DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_O + objectClass],
            ),
            label: let_to_name(
                objectClass,
                false,
                Boolean(state.iflags?.menu_head_objsym),
            ),
        });
    }

    if (do_unpaid || do_blessed || do_cursed || do_uncursed
        || do_buc_unknown || num_justpicked) {
        items.push({ text: '' });
    }
    if (do_unpaid) {
        items.push({ selector: 'u', value: 'u',
            label: 'Unpaid items', skipinvert: true });
    }
    if (do_blessed) {
        items.push({ selector: 'B', value: 'B',
            label: 'Items known to be Blessed', skipinvert: true });
    }
    if (do_cursed) {
        items.push({ selector: 'C', value: 'C',
            label: 'Items known to be Cursed', skipinvert: true });
    }
    if (do_uncursed) {
        items.push({ selector: 'U', value: 'U',
            label: 'Items known to be Uncursed', skipinvert: true });
    }
    if (do_buc_unknown) {
        items.push({ selector: 'X', value: 'X',
            label: 'Items of unknown Bless/Curse status', skipinvert: true });
    }
    if (num_justpicked) {
        let label = 'Items you just picked up';
        if (num_justpicked === 1) {
            for (let obj = olist; obj; obj = FOLLOW(obj, qflags)) {
                if (obj.pickup_prev) {
                    label = `Just picked up: ${donameFresh(obj, state)}`;
                    break;
                }
            }
        }
        items.push({ selector: 'P', value: 'P',
            label, skipinvert: true });
    }

    const selected = await select_menu(state, {
        title,
        ...menuTitleStyle(state),
        items,
        how: PICK_ANY,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    });
    if (selected === null) return { n: 0, pick_list: [] };
    if (selected.length === 1 && selected[0].value === 'A'
        && !(state.flags?.paranoia_bits & PARANOID_AUTOALL)) {
        await ttyPline('No relevant items selected.', state);
        return { n: 0, pick_list: [] };
    }
    return {
        n: selected.length,
        pick_list: selected.map((choice) => ({
            value: choice.value,
            count: choice.count,
        })),
    };
}

// Existing pickup/addinv admission before discovery and floor extraction.
// Shop billing runs later at pick_obj's source position; its independently
// implemented pricing callees can still refuse their unported variants.
function preflightPickupObjects(selected, state) {
    let addedWeight = 0;
    let projectedGold = money_cnt(state.invent);
    const actionable = selected.filter(({ obj }) =>
        obj !== state.uchain
        && !(obj.where === OBJ_MINVENT
            && obj.owornmask
            && state.u?.uswallow));
    for (const { obj, count } of actionable) {
        if ((obj.where !== OBJ_FLOOR && obj.where !== OBJ_MINVENT)
            || !Number.isInteger(count) || count < 1) {
            throw new UnsupportedPickupError(
                'pickup() malformed floor object or monster object',
            );
        }
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
    const computedPlans = preflight_addinv_sequence(
        actionable.map(({ obj }) => obj),
        env,
        { observeObjects: !heroIsBlind(state) },
    );
    const addPlans = [];
    let planIndex = 0;
    for (const { obj } of selected) {
        if (actionable.some((item) => item.obj === obj))
            addPlans.push(computedPlans[planIndex++]);
        else
            addPlans.push(null);
    }
    // pickup.c lift_object() checks the 52-letter limit in floor order after
    // merge_choice().  Gold consumes no ordinary slot, and a later floor
    // object can merge with an earlier projected pickup.  Reject atomically
    // only at the first projected non-merge addition which C would refuse.
    let projectedSlots = inv_cnt(false, state);
    // Billing changes mergeability after lift_object's decision. For a shop
    // floor, use the live source lift below, not this pre-billing projection.
    if (selected.every(({ obj }) => obj.where !== OBJ_FLOOR)
        || !costly_spot(state.u.ux, state.u.uy, state)) {
        for (const plan of computedPlans) {
            if (!plan.addedOrdinarySlot) continue;
            if (projectedSlots >= 52)
                throw new UnsupportedPickupError('pickup() with a full pack');
            ++projectedSlots;
        }
    }
    for (const plan of computedPlans) {
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

// C ref: pickup.c check_autopickup_exceptions() (913-927).  The exception
// list is kept in reverse configuration order, just as C's ga.apelist is.
// `doname()` is deliberately part of the match: besides producing the text
// that the user's regular expression sees, it performs the same object
// discovery writes before autopickup chooses an item.
export function check_autopickup_exceptions(obj, state = game) {
    let ape = state.ga?.apelist ?? null;
    if (ape) {
        const objdesc = makesingular(donameFresh(obj, state));
        while (ape && !regex_match(objdesc, ape.regex)) ape = ape.next;
    }
    return ape;
}

// C ref: pickup.c autopick_testobj() (930-965). The static costly value is
// refreshed by autopick() at the start of each operation; callers such as
// hack.c cannot_push() pass calc_costly=true for their own operation.
let autopickCostly = false;

export function autopick_testobj(otmp, calc_costly, state = game) {
    if (calc_costly) {
        autopickCostly = otmp.where === OBJ_FLOOR
            && costly_spot(otmp.ox, otmp.oy, state);
    }

    // An unpaid object on a costly square is never autopicked, including when
    // one of the lost-object options would otherwise override the filters.
    if (autopickCostly && !otmp.no_charge) return false;

    // pickup_thrown/pickup_stolen/nopick_dropped override pickup_types and
    // exceptions, in this order, exactly as pickup.c does.
    if ((state.flags?.pickup_thrown && otmp.how_lost === LOST_THROWN)
        || (state.flags?.pickup_stolen && otmp.how_lost === LOST_STOLEN))
        return true;
    if (state.flags?.nopick_dropped && otmp.how_lost === LOST_DROPPED)
        return false;
    if (otmp.how_lost === LOST_EXPLODING) return false;

    const pickupTypes = state.flags?.pickup_types ?? [];
    let pickit = !pickupTypes.length || pickupTypes.includes(otmp.oclass);
    const ape = check_autopickup_exceptions(otmp, state);
    if (ape) pickit = Boolean(ape.grab);
    return pickit;
}

function autopickTestObject(otmp, calc_costly, state, dryRun) {
    if (!dryRun) return autopick_testobj(otmp, calc_costly, state);
    // preflight_projected_random_arrival_pickup() runs before movement. The
    // source matcher calls doname(), which can set dknown; name a shallow copy
    // there so admission does not write through to the live floor object.
    const projected = {
        ...otmp,
        oextra: otmp.oextra ? { ...otmp.oextra } : otmp.oextra,
    };
    return autopick_testobj(projected, calc_costly, state);
}

// C ref: pickup.c autopick() (975-1003). Return the count and menu items
// together because JavaScript does not need C's out-parameter allocation.
export function autopick(olist, follow, state = game, { dryRun = false } = {}) {
    let n = 0;
    let check_costly = true;

    /* first count the number of eligible items */
    for (let curr = olist; curr; curr = FOLLOW(curr, follow)) {
        if (autopickTestObject(curr, check_costly, state, dryRun)) ++n;
        check_costly = false; /* only need to check once per autopickup */
    }

    const pick_list = [];
    if (n) {
        for (let curr = olist; curr; curr = FOLLOW(curr, follow)) {
            if (autopickTestObject(curr, false, state, dryRun)) {
                pick_list.push({ obj: curr, count: curr.quan });
            }
        }
    }
    return { n, pick_list };
}

// Keep the preflight's result in the same shape used by pickup()'s commit
// loop, while deriving eligibility through the complete source autopick path.
function planAutomaticPickupAndRefreshCapacityCache(
    state,
    { dryRun = false, head = undefined, follow = BY_NEXTHERE } = {},
) {
    const { u } = state;
    const sourceHead = head === undefined
        ? state.level.objects[u.ux][u.uy]
        : head;
    const { pick_list: selected } = autopick(
        sourceHead,
        follow,
        state,
        { dryRun },
    );
    const selectedObjects = new Set(selected.map(({ obj }) => obj));
    const remaining = [];
    for (let obj = sourceHead; obj; obj = FOLLOW(obj, follow)) {
        if (!selectedObjects.has(obj)) remaining.push(obj);
    }
    return {
        ...preflightPickupObjects(selected, state),
        remaining,
        selected,
    };
}

function planAutomaticFloorPickupAndRefreshCapacityCache(state, options = {}) {
    return planAutomaticPickupAndRefreshCapacityCache(state, options);
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
    // pickup.c:680-688 checks the unconscious random-arrival arm before it
    // selects either the floor chain or an engulfer's inventory.
    if (Math.trunc(state.multi) < 0 && unconscious(state)) return;
    if (u.uswallow) {
        // pickup.c:741-747 and :754-789.  A swallowed hero walks the
        // engulfer's minvent chain instead of the floor.  With no objects,
        // autopick()/query_objlist() select nothing, the post-pickup floor
        // work is skipped by the still-true u.uswallow, and pickup() returns
        // 0 without a message or random draw.  A nonempty stomach remains
        // refused below because its selection and object effects are a
        // separate behavior slice.
        const head = u.ustuck?.minvent ?? null;
        if (!head) return;
        const plan = planAutomaticPickupAndRefreshCapacityCache(state, {
            head,
            follow: 0,
            dryRun: true,
        });
        // pickup() has no floor redraw or check_here tail while swallowed;
        // this admission only needs to establish that its selected objects
        // can complete the same addinv preflight after the arrival commits.
        void plan;
        return;
    }
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
        // The live pickup call describes this square after the movement is
        // committed; admission must leave the projection output-free.
        return;
    }
    if (notake(state.youmonst?.data)) {
        // pickup.c routes this arm through check_here(FALSE) before returning;
        // validate its object-description admission on the isolated arrival
        // state so a later live look_here() cannot fail after movement.
        const decorShown = state.flags?.mention_decor
            && preflight_describe_decor_at(u.ux, u.uy, state);
        const remaining = [];
        for (let obj = head; obj; obj = obj.nexthere) {
            if (obj !== state.uchain) remaining.push(obj);
        }
        if (remaining.length) {
            preflight_look_here(
                remaining.length,
                decorShown ? LOOKHERE_SKIP_DFEATURE : LOOKHERE_NOFLAGS,
                state,
                {
                    objects: remaining,
                    decorTerrain: decorShown
                        ? state.level.at(u.ux, u.uy)?.typ : null,
                },
            );
        }
        return;
    }

    let remaining;
    let pickedSome;
    if ((Math.trunc(state.multi) && !state.context?.run)
        || !state.flags?.pickup) {
        remaining = [];
        for (let obj = head; obj; obj = obj.nexthere) {
            if (obj !== state.uchain) remaining.push(obj);
        }
    } else {
        const plan = planAutomaticFloorPickupAndRefreshCapacityCache(
            state,
            { dryRun: true },
        );
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

// C ref: pickup.c pickup_object() (1803-1888). lift_object() and pick_obj()
// run at their source sites; pickup_prinv()'s encumbrance-prefix ladder and
// prinv() remain folded into the final block below.
//
// The uchain and worn-engulfer arms return from pickup_object() without an
// inventory transfer. Artifact and scare-scroll behavior remains at its
// existing source-attributed preflight boundary; ordinary floor and corpse
// arms continue through lift_object()/pick_obj().
//
// The two lines pickup.c runs around pick_obj() that this port does not:
// disp.botl for gold, because invent.c addinv_core1() sets the same flag on
// the same object a moment later and js/invent.js addinv_core1() already
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
    // pickup.c:1824-1829. The attached punishment chain and an engulfer's
    // worn item are tried objects, but neither is transferred to inventory.
    if (obj === state.uchain) return 0;
    if (obj.where === OBJ_MINVENT && obj.owornmask && state.u.uswallow) {
        await ttyPline(`You can't pick ${ysimple_name(obj, state)} up.`, state);
        return 0;
    }
    if (obj.otyp === CORPSE
        && (fatal_corpse_mistake(obj, telekinesis, state)
            || rider_corpse_revival(obj, telekinesis, state)))
        return -1;

    const lifted = await lift_object(obj, null, count, telekinesis, state);
    if (lifted.result <= 0) return lifted.result;
    count = lifted.count;
    if (obj.quan !== count && obj.otyp !== LOADSTONE) {
        obj = splitobj(obj, count, env);
        plan = null;
    }
    const carried = await pick_obj(obj, state, env, plan);

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

// C ref: pickup.c pick_obj() (1897-1945). Billing must precede inventory
// merging; remote burglary must follow it so setpaid can find the object.
export async function pick_obj(otmp, state = game, env = {}, plan = null) {
    env = objectGenerationEnv({ ...env, state });
    const fromfloor = otmp.where === OBJ_FLOOR;
    // C initializes the output coordinates to (0,0) when an OBJ_MINVENT
    // object belongs to a migrating monster; get_obj_location() returns
    // FALSE in that case but pick_obj() still proceeds with billing disabled.
    const location = get_obj_location(otmp, 0, state) ?? { x: 0, y: 0 };
    const { x: ox, y: oy } = location;
    let robshop = !state.u.uswallow && otmp !== state.uball
        && costly_spot(ox, oy, state);
    obj_extract_self(otmp, env);
    if (fromfloor) (env.redraw ?? newsym)(ox, oy, state);
    if (robshop) {
        const savedShops = state.u.ushops;
        const shop = in_rooms(ox, oy, SHOPBASE, state)[0];
        state.u.ushops = [shop, 0, 0, 0, 0];
        try {
            await addtobill(otmp, true, false, false, state, env);
        } finally {
            state.u.ushops = savedShops;
        }
        robshop = otmp.unpaid && !savedShops.includes(shop);
    }
    const result = await addinv_runtime(otmp, env, plan);
    if (robshop) await remote_burglary(ox, oy, state, env);
    return result;
}

// C ref: pickup.c pickup() (672-910), including its swallowed, autopickup,
// menu, traditional, counted and cleanup paths.  The object-level helpers
// retain their own source names below, while this function preserves C's
// traversal and return semantics around them.
export async function pickup(what, state = game) {
    const u = state.u;
    const autopickup = what > 0;
    const swallowed = Boolean(u.uswallow);

    if (autopickup && Math.trunc(state.multi ?? 0) < 0
        && unconscious(state)) {
        // pickup.c:680-688 deliberately skips all square inspection when a
        // random arrival finds an unconscious hero.  The sentinel prevents a
        // second decor report when the hero wakes on a later turn.
        state.iflags ??= {};
        state.iflags.prev_decor = STONE;
        return 0;
    }
    state.gp ??= {};
    state.gp.pickup_encumbrance = 0;

    let objectHere = !swallowed && Boolean(
        state.level?.objects?.[u.ux]?.[u.uy] ?? null,
    );
    if (!swallowed) {
        if (autopickup
            && (state.context?.nopick || !objectHere
                || (is_pool(u.ux, u.uy, state) && !u.uinwater)
                || is_lava(u.ux, u.uy, state))) {
            if (state.flags?.mention_decor)
                await describe_decor(state);
            await read_engr_at(u.ux, u.uy, state, {
                pline: ttyPline,
                canReachFloor: can_reach_floor,
            });
            return 0;
        }

        const trap = t_at(u.ux, u.uy, state);
        if (!can_reach_floor(Boolean(trap && is_pit(trap.ttyp)), state)) {
            // C calls describe_decor() even with mention_decor disabled.  Its
            // conditional engraving read is the only additional output.
            await describe_decor(state);
            if ((Math.trunc(state.multi ?? 0) && !state.context?.run)
                || (autopickup && !state.flags?.pickup)
                || (trap && (uteetering_at_seen_pit(trap, state)
                    || uescaped_shaft(trap, state)))) {
                await read_engr_at(u.ux, u.uy, state, {
                    pline: ttyPline,
                    canReachFloor: can_reach_floor,
                });
            }
            return 0;
        }

        if (notake(state.youmonst?.data)) {
            // C performs check_here(FALSE) before testing the pile for the
            // incapacity message.  Keep that evaluation order after the
            // movement has committed the hero's location.
            await check_here(false, state);
            objectHere = Boolean(
                state.level?.objects?.[u.ux]?.[u.uy] ?? null,
            );
            if (objectHere && (autopickup || state.flags?.pickup)) {
                await ttyPline(
                    'You are physically incapable of picking anything up.',
                    state,
                );
            }
            return 0;
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
    }

    // C:740-747. The same loop walks nexthere on the floor and nobj inside
    // the engulfer, so all following selection paths consume the same list.
    add_valid_menu_class(0, state);
    const objchain = swallowed ? (u.ustuck?.minvent ?? null)
        : (state.level?.objects?.[u.ux]?.[u.uy] ?? null);
    const follow = swallowed ? 0 : BY_NEXTHERE;

    let selected = [];
    let addPlans = [];
    let env;
    let n_tried = 0;
    let n_picked = 0;
    let skipFloorTail = false;

    const commitSelection = async (items) => {
        if (items.length > 0) reset_justpicked(state.invent);
        const prepared = preflightPickupObjects(items, state);
        addPlans = prepared.addPlans;
        env = prepared.env;
        n_tried = items.length;
        for (let i = 0; i < items.length; ++i) {
            const res = await pickup_object(
                items[i].obj,
                items[i].count,
                false,
                env,
                addPlans[i],
            );
            if (res < 0) break;
            n_picked += res;
        }
    };

    if (autopickup) {
        const plan = planAutomaticPickupAndRefreshCapacityCache(state, {
            head: objchain,
            follow,
        });
        selected = plan.selected;
        // Preserve the source's single preflight before its commit loop.
        addPlans = plan.addPlans;
        env = plan.env;
        if (selected.length > 0) reset_justpicked(state.invent);
        n_tried = selected.length;
        for (let i = 0; i < selected.length; ++i) {
            const res = await pickup_object(
                selected[i].obj, selected[i].count, false, env, addPlans[i],
            );
            if (res < 0) break;
            n_picked += res;
        }
    } else if (state.flags?.menu_style !== MENU_TRADITIONAL
        || state.iflags?.menu_requested) {
        let qflags = follow | AUTOSELECT_SINGLE
            | (state.flags?.sortpack ? INVORDER_SORT : 0);
        if (what < 0) {
            state.gv ??= {};
            state.gv.val_for_n_or_more = -what;
            const result = await query_objlist(
                objchain,
                qflags,
                n_or_more,
                state,
                `Pick ${-what} of what?`,
                PICK_ONE,
            );
            selected = result.pick_list;
            for (const item of selected) item.count = -what;
        } else {
            const result = await query_objlist(
                objchain,
                qflags | FEEL_COCKATRICE,
                all_but_uchain,
                state,
            );
            selected = result.pick_list;
        }
        await commitSelection(selected);
    } else {
        // pickup.c:793-892, the traditional class/per-object interface.
        let count = what < 0 ? -what : 0;
        let allOfType = true;
        let selective = false;
        let classes = '';
        let query = null;
        let ct = 0;
        for (let obj = objchain; obj; obj = FOLLOW(obj, follow)) ++ct;

        if (ct === 1 && count) {
            const obj = objchain;
            const amount = Math.min(obj.quan, count);
            n_tried++;
            reset_justpicked(state.invent);
            const prepared = preflightPickupObjects(
                [{ obj, count: amount }], state,
            );
            const res = await pickup_object(
                obj, amount, false, prepared.env, prepared.addPlans[0],
            );
            if (res > 0) n_picked++;
        } else {
            if (ct >= 2) {
                await ttyPline(
                    `There are ${ct <= 10 ? 'several' : 'many'} objects here.`,
                    state,
                );
                query = await query_classes('pick up', objchain, !swallowed, state);
                if (!query.ok) {
                    if (!query.menu_on_request) {
                        // C's `goto pickupdone` bypasses the common floor
                        // hideunder/newsym/check_here tail on cancellation.
                        skipFloorTail = true;
                        query = null;
                    } else {
                        let menuFlags = follow;
                        if (query.one_by_one) menuFlags |= INVORDER_SORT;
                        const result = await query_objlist(
                            objchain,
                            menuFlags,
                            query.menu_on_request === -2
                                ? allow_all : allow_category,
                            state,
                        );
                        await commitSelection(result.pick_list);
                        query = null;
                    }
                }
            } else if (ct === 1) {
                // With one uncounted object C skips query_classes() and lets
                // the source loop take the whole object.
                query = {
                    ok: true,
                    one_by_one: false,
                    allflag: true,
                    selection: '',
                };
            }

            if (query) {
                selective = query.one_by_one;
                allOfType = query.allflag;
                classes = query.selection;
                const bycat = 'BUCX'.split('').some((sym) =>
                    state.gv?.valid_menu_classes?.includes(sym));
                for (let obj = objchain; obj;) {
                    const next = FOLLOW(obj, follow);
                    if (bycat ? !allow_category(obj, state)
                        : (!selective && classes
                            && !classes.includes(String.fromCharCode(obj.oclass)))) {
                        obj = next;
                        continue;
                    }

                    let amount = -1;
                    if (!allOfType) {
                        const qbuf = safe_qbuf(
                            'Pick up ', '?', obj,
                            (candidate) => donameFresh(candidate, state),
                            (candidate) => ansimpleoname(candidate, state),
                            something,
                            state,
                        );
                        const responses = obj.quan < 2 ? 'ynaq' : 'yn#aq';
                        const answer = String.fromCharCode(
                            await yn_function(qbuf, responses, 'y', true, state),
                        );
                        if (answer === 'q') break;
                        if (answer === 'n') {
                            obj = next;
                            continue;
                        }
                        if (answer === 'a') {
                            allOfType = true;
                            if (selective) {
                                selective = false;
                                classes = String.fromCharCode(obj.oclass);
                            }
                        } else if (answer === '#') {
                            amount = Math.min(
                                Math.trunc(state.yn_number ?? 0), obj.quan,
                            );
                            if (!amount) {
                                obj = next;
                                continue;
                            }
                        }
                    }
                    if (amount < 0) amount = obj.quan;
                    if (!n_tried) reset_justpicked(state.invent);
                    n_tried++;
                    const prepared = preflightPickupObjects(
                        [{ obj, count: amount }], state,
                    );
                    const res = await pickup_object(
                        obj,
                        amount,
                        false,
                        prepared.env,
                        prepared.addPlans[0],
                    );
                    if (res < 0) break;
                    n_picked += res;
                    obj = next;
                }
            }
        }
    }

    if (!swallowed && !skipFloorTail) {
        // C calls hideunder(&youmonst) for a discarded result.  The existing
        // hero-concealment owner is still an explicit source gap; keep that
        // call visible in game.unported rather than fabricating a redraw.
        if (hides_under(state.youmonst?.data))
            note_unported('mon.c hideunder');
        // newsym_force is newsym() plus dirty bookkeeping; the display owner
        // treats the ordinary redraw as the complete effect here.
        if (n_picked) newsym(u.ux, u.uy);
        if (autopickup) await check_here(n_picked > 0, state);
    }
    state.gp.pickup_encumbrance = 0;
    add_valid_menu_class(0, state);
    return n_tried > 0 ? 1 : 0;
}

// C ref: pickup.c check_here() (428-456), reached from domove() through
// spoteffects() and pickup(). The ball chain is restored before this call but
// does not count as an object for the look_here() decision.
export async function check_here(picked_some, state = game) {
    let lookhereFlags = picked_some
        ? LOOKHERE_PICKED_SOME : LOOKHERE_NOFLAGS;
    if (state.flags?.mention_decor && await describe_decor(state))
        lookhereFlags |= LOOKHERE_SKIP_DFEATURE;

    let count = 0;
    for (let obj = state.level?.objects?.[state.u.ux]?.[state.u.uy] ?? null;
        obj;
        obj = obj.nexthere) {
        if (obj !== state.uchain) ++count;
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

// C ref: pickup.c observe_quantum_cat() (2826-2897).  A large box made by
// makemon() carries a corpse and spe=1 until its first observation resolves
// the coin flip.  The final disclosure calls this with makecat=false, while
// opening and tipping a box may request a live cat and its source messages.
// Keep the random choice and object mutation in this canonical pickup.c owner.
export async function observe_quantum_cat(box, makecat, givemsg, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const sc = "Schroedinger's Cat";
    let deadcat = box?.cobj ?? null;
    let livecat = null;

    // C evaluates the coin flip before locating the box.  Keep that order
    // even though location normally has no random side effects.
    const itsalive = !random.rn2(2);
    const location = get_obj_location(box, 0, state);
    if (location) {
        box.ox = location.x;
        box.oy = location.y;
    }

    if (itsalive) {
        if (makecat) {
            livecat = makemon(
                state.mons?.[PM_HOUSECAT] ?? null,
                box.ox,
                box.oy,
                NO_MINVENT | MM_ADJACENTOK | MM_NOMSG,
                { ...rawEnv, state, random },
            );
        }
        if (livecat) {
            livecat.mpeaceful = true;
            set_malign(livecat, state);
            if (givemsg) {
                if (!canSpotMonster(livecat, state)) {
                    await ttyPline(
                        `You think ${something} brushed your ${body_part(FOOT, state.youmonst)}.`,
                        state,
                    );
                } else {
                    await ttyPline(
                        `${Monnam(livecat, state)} inside the box is still alive!`,
                        state,
                    );
                }
            }
            christen_monst(livecat, sc, { state });
            if (deadcat) {
                obj_extract_self(deadcat, { state });
                obfree(deadcat, null, { state });
                deadcat = null;
            }
            box.owt = weight(box, { state });
            box.spe = 0;
            if (!state.context?.mon_moving) {
                more_experienced(10, 20, state);
                await newexplevel(state);
            }
        }
    } else {
        box.spe = 0;
        if (givemsg) {
            const catName = (state.u?.uprops?.[HALLUC]?.intrinsic
                && !(state.u?.uprops?.[HALLUC + 1]?.intrinsic
                    || state.u?.uprops?.[HALLUC + 1]?.extrinsic))
                ? rndmonnam({ state, random }) : 'housecat';
            await ttyPline(
                `The ${catName} inside the box is dead!`,
                state,
            );
        }
        if (deadcat) {
            deadcat.age = state.moves;
            set_corpsenm(deadcat, PM_HOUSECAT, { state, random });
            oname(deadcat, sc, ONAME_NO_FLAGS, { state });
            if (!state.context?.mon_moving) {
                more_experienced(20, 10, state);
                await newexplevel(state);
            }
        }
    }
    return null;
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
export async function use_container(obj, held, more_containers, state) {
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
        if (held)
            await ttyPline(`You open ${the(xnameFresh(obj, state))}...`, state);
        await chest_trap(obj, HAND, false, state);
        // Even if the trap fails, you've used up this turn.
        if ((state.multi ?? 0) >= 0) {
            nomul(-1, state);
            state.multi_reason = 'opening a container';
            state.nomovemsg = '';
        }
        state.ga.abort_looting = true;
        return ECMD_TIME;
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
                    used |= (await menu_loot(0, false, state)) > 0;
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
                used |= (await menu_loot(0, true, state)) > 0;
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
                    // here to undo a count-based split. The current path does
                    // not yet wire that recovery helper, so the split context
                    // remains for the caller's existing boundary.
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
                    used |= (await menu_loot(0, false, state)) > 0;
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

// C stores object classes as bytes in valid_menu_classes, not as decimal
// strings.  Category rows pass numeric oclass values, while BUC rows pass
// their literal selectors, so normalize both forms at this boundary.
function menuClassCharacter(c) {
    return typeof c === 'number' ? String.fromCharCode(c) : String(c);
}

// C ref: pickup.c:469-471. menu_class_present().
function menu_class_present(c, state) {
    return Boolean(c && state.gv?.valid_menu_classes?.includes(
        menuClassCharacter(c),
    ));
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
        const ch = menuClassCharacter(c);
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

// C ref: pickup.c:522-592. Kept as a named callback because query_objlist()
// accepts the same source-shaped predicate as menu_loot().
function allow_category(otmp, state) {
    return ckvalidcat(otmp, state);
}

function allow_all() {
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
    const iw_base = max_capacity(state);

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
        if (inv_cnt(false, state) < INVLET_BASIC
            || !carrying(obj.otyp, state)
            || merge_choice(state.invent, obj, state))
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
        && inv_cnt(false, state) >= INVLET_BASIC
        && !merge_choice(state.invent, obj, state)) {
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
    await pick_pick(otmp, state);

    const result = await addinv_runtime(otmp, { state });
    await pickup_prinv(result, count, 'removing', state);

    if (is_gold) {
        await bot();
    }
    return 1;
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

// C ref: pickup.c:3265-3394. Full-menu interface for moving items into or out
// of the current container. When put_in is false, items are taken out; when
// true, items from inventory are put in.
//
// Three post-category branches: (1) autopick via 'A', (2) justpicked
// single-item shortcut when exactly one just-picked item exists, (3) manual
// query_objlist selection. The else branch (3) calls unsplitobj to merge
// back a count-split item when in_container/out_container rejects it.
export async function menu_loot(retry, put_in, state = game) {
    if (!state.gc?.current_container) {
        throw new Error('<menu_loot> no gc.current_container?');
    }

    const action = put_in ? 'Put in' : 'Take out';

    state.gp ??= {};
    state.gp.pickup_encumbrance = 0;
    let all_categories = true;
    let loot_everything = false;
    let autopick = false;
    let loot_justpicked = false;
    let count = 0;
    let n_looted = 0;

    // C: 3279-3312. Category selection.
    if (retry) {
        all_categories = retry === ALL_TYPES_SELECTED;
    } else if (state.flags?.menu_style === MENU_FULL) {
        all_categories = false;
        const title = `${action} what type of objects?`;
        const sourceList = put_in
            ? state.invent
            : state.gc.current_container.cobj;
        const category = await query_category(
            title,
            sourceList,
            ALL_TYPES | UNPAID_TYPES | BUCX_TYPES | CHOOSE_ALL | JUSTPICKED,
            state,
        );
        if (!category.n) return 0;

        for (const choice of category.pick_list) {
            if (choice.value === 'A') {
                loot_everything = true;
                autopick = true;
            } else if (put_in && choice.value === 'P') {
                // C: 3299-3303. 'P' (JUSTPICKED) category is put-in only.
                loot_justpicked = true;
                count = Math.max(0, choice.count);
                add_valid_menu_class(choice.value, state);
                loot_everything = false;
            } else if (choice.value === ALL_TYPES_SELECTED) {
                all_categories = true;
            } else {
                add_valid_menu_class(choice.value, state);
                loot_everything = false;
            }
        }
    }

    // C: 3314-3341. Autopick branch.
    if (autopick) {
        let inout_func, firstobj;
        if (!put_in) {
            state.gc.current_container.cknown = 1;
            inout_func = out_container;
            firstobj = state.gc.current_container.cobj;
        } else {
            inout_func = in_container;
            firstobj = state.invent;
        }
        let obj = firstobj;
        while (obj && state.gc.current_container) {
            const next = obj.nobj;
            if (loot_everything || all_categories
                || allow_category(obj, state)) {
                const res = await inout_func(obj, state);
                if (res < 0) break;
                n_looted += res;
            }
            obj = next;
        }
    } else if (put_in && loot_justpicked
               && count_justpicked(state.invent) === 1) {
        // C: 3342-3352. Single just-picked item shortcut.
        const otmp = find_justpicked(state.invent);
        if (otmp) {
            n_looted = 1;
            let toStash = otmp;
            if (count > 0 && count < otmp.quan)
                toStash = splitobj(otmp, count, { state });
            await in_container(toStash, state);
            // Return value does not matter; container may have exploded.
        }
    } else {
        // C: 3353-3391. Manual selection via query_objlist.
        let mflags = INVORDER_SORT | INCLUDE_VENOM;
        if (put_in && state.flags?.invlet_constant)
            mflags |= USE_INVLET;
        if (put_in && loot_justpicked)
            mflags |= JUSTPICKED;
        if (!put_in)
            state.gc.current_container.cknown = 1;

        const sourceList = put_in
            ? state.invent
            : state.gc.current_container.cobj;
        const result = await query_objlist(
            sourceList,
            mflags,
            all_categories ? allow_all : allow_category,
            state,
            `${action} what?`,
        );
        if (result.n) {
            n_looted = result.n;
            for (const choice of result.pick_list) {
                let obj = choice.obj;
                const origObj = obj;
                const cnt = choice.count;
                if (cnt > 0 && cnt < obj.quan)
                    obj = splitobj(obj, cnt, { state });
                const res = put_in
                    ? await in_container(obj, state)
                    : await out_container(obj, state);
                if (res <= 0) {
                    if (!state.gc.current_container) {
                        // Container exploded; both obj and container are gone.
                        break;
                    } else if (obj && obj !== origObj) {
                        // Split occurred but action rejected; merge back.
                        unsplitobj(obj, { state });
                    }
                    if (res < 0) break;
                }
            }
        }
    }

    return n_looted;
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
const TIPCHECK_TRAPPED = 2;
const TIPCHECK_CANNOT = 3;
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
// Handles: lknown discovery (3972-3976), locked message (3978-3980), the
// charged bag/horn loop (3993-4032), and empty container message
// (4047-4050). Locked, trapped, shop billing, and Schrodinger branches still
// stop at their own source subsystem boundaries.
async function tipcontainer_checks(box, targetbox, allowempty, state) {
    // pickup.c:3962-3967. Undiscovered bag of tricks as destination:
    // apply it once before trying to tip source box.
    if (targetbox && targetbox.otyp === BAG_OF_TRICKS) {
        await bagotricks(targetbox, false, state);
        return TIPCHECK_CANNOT;
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
        await chest_trap(box, HAND, false, state);
        // Even if the trap fails, you've used up this turn.
        if ((state.multi ?? 0) >= 0) {
            nomul(-1, state);
            state.multi_reason = 'tipping a container';
            state.nomovemsg = '';
        }
        return TIPCHECK_TRAPPED;
    }

    // pickup.c:3993-4032. Bag of tricks or horn of plenty tipping loop.
    // The source handles shop billing around this loop; leave that boundary
    // before mutating a floor-owned box while carried containers proceed.
    if (box.otyp === BAG_OF_TRICKS || box.otyp === HORN_OF_PLENTY) {
        if (targetbox
            && (await tipcontainer_checks(targetbox, null, true, state))
                !== TIPCHECK_OK) {
            return TIPCHECK_CANNOT;
        }
        const location = get_obj_location(box, 0, state);
        if (location) {
            box.ox = location.x;
            box.oy = location.y;
        }
        const maybeshopgoods = !carried(box)
            && costly_spot(box.ox, box.oy, state);
        if (maybeshopgoods && !box.no_charge) {
            throw new UnsupportedPickupError(
                'tipcontainer_checks: shop addtobill/subfrombill',
            );
        }

        const oldSpe = box.spe;
        let totalSeen = 0;
        do {
            if (box.otyp === BAG_OF_TRICKS) {
                const result = await bagotricks(box, true, state);
                totalSeen += result.seecount;
            } else {
                await hornoplenty(box, true, targetbox, { state });
            }
        } while (box.spe > 0);

        if (box.spe < oldSpe) {
            if (box.otyp === BAG_OF_TRICKS && !totalSeen)
                await ttyPline(nothing_seems_to_happen, state);
            // C restores the count while checking the eventual shop charge,
            // then marks the container empty.
            box.spe = oldSpe;
            check_unpaid_usage(box, true, state);
            box.spe = 0;
            box.cknown = 1;
        }
        return TIPCHECK_CANNOT;
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
