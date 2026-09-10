// Movement-adjacent world effects owned by hack.c.

import {
    ACCESSIBLE,
    A_CON,
    A_DEX,
    A_STR,
    ALTAR,
    BLINDED,
    COLD_RES,
    CONFUSION,
    CONFLICT,
    COLNO,
    CORR,
    DEAF,
    DB_ICE,
    DB_UNDER,
    DIED,
    DISINT_RES,
    DISMOUNT_FELL,
    DISMOUNT_GENERIC,
    DOOR,
    DO_MOVE,
    DRAWBRIDGE_UP,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    CQ_CANNED,
    CMDQ_EXTCMD,
    DIGTYP_UNDIGGABLE,
    ECMD_OK,
    ECMD_TIME,
    EXT_ENCUMBER,
    HVY_ENCUMBER,
    FAILEDUNTRAP,
    FAST,
    FIRE_RES,
    FLYING,
    FUMBLING,
    FROMFORM,
    FROMOUTSIDE,
    GOLD_SYM,
    GP_ALLOW_U,
    HALLUC,
    HALLUC_RES,
    HALF_PHDAM,
    HEADSTONE,
    ICE,
    IS_AIR,
    IS_ALTAR,
    IS_DOOR,
    IS_FOUNTAIN,
    IS_FURNITURE,
    IS_GRAVE,
    IS_OBSTRUCTED,
    IS_SINK,
    IS_STWALL,
    IS_THRONE,
    IS_TREE,
    IS_WALL,
    IS_WATERWALL,
    In_sokoban,
    Is_airlevel,
    Is_waterlevel,
    IRONBARS,
    I_SPECIAL,
    INTRINSIC,
    INVIS,
    LAVAWALL,
    LAVAPOOL,
    LEFT_SIDE,
    LEVITATION,
    MAX_CARR_CAP,
    MAGICAL_BREATHING,
    MAX_TYPE,
    MELT_ICE_AWAY,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    MOD_ENCUMBER,
    N_DIRS,
    NEUTRAL,
    NO_KILLER_PREFIX,
    PASSES_WALLS,
    PARANOID_CONFIRM,
    PARANOID_SWIM,
    PARANOID_TRAP,
    PICK_NONE,
    PLNMSG_BACK_ON_GROUND,
    POISON_RES,
    POOL,
    RIGHT_SIDE,
    ROWNO,
    ROOM,
    ROOMOFFSET,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_TPORT,
    SCORR,
    SDOOR,
    SEE_INVIS,
    SHOCK_RES,
    SHOPBASE,
    SLEEP_RES,
    SLT_ENCUMBER,
    STAIRS,
    STEALTH,
    STONE,
    STUNNED,
    SWIMMING,
    TELEPORT,
    TELEPORT_CONTROL,
    TEST_TRAV,
    TEST_TRAP,
    TEST_MOVE,
    TRAVP_TRAVEL,
    TRAVP_VALID,
    TIMER_OBJECT,
    TIMEOUT,
    TIP_ENHANCE,
    TIP_GETPOS,
    TIP_SWIM,
    TIP_UNTRAP_MON,
    TRAP_CLEARLY_IMMUNE,
    TRAPNUM,
    TT_BEARTRAP,
    Upolyd,
    VIBRATING_SQUARE,
    WATER,
    WEB,
    WOUNDED_LEGS,
    W_ARTI,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    WT_ELF,
    WT_SQUEEZABLE_INV,
    WT_HUMAN,
    WT_WEIGHTCAP_SPARE,
    WT_WEIGHTCAP_STRCON,
    WT_TOOMUCH_DIAGONAL,
    WT_WOUNDEDLEG_REDUCT,
    WWALKING,
    ZOMBIFY_MON,
    OVERLOADED,
    PROT_FROM_SHAPE_CHANGERS,
    helpless,
    is_pit,
    isok,
    u_at,
    xdir,
    ydir,
    UNCHANGING,
} from './const.js';
import { float_vs_flight, rehumanize } from './polyself.js';
import { acurrstr, acurr, exercise } from './attrib.js';
import {
    bot,
    classify_terrain,
    feel_location,
    flush_screen,
    glyph_at,
    glyph_is_cmap,
    glyph_is_invisible,
    glyph_is_warning,
    glyph_to_cmap,
    glyph_to_obj,
    map_invisible,
    map_object,
    newsym,
    back_to_glyph,
    unmap_invisible,
    unmap_object,
} from './display.js';
// cmd.c owns the command queue and js/cmd.js already imports this file, so
// this pair of modules forms an import cycle. Only the hoisted function
// declaration is used, and only at call time, so neither module reads the
// other during evaluation.
import {
    cmdq_clear,
    cmdq_peek,
    confdir,
    paranoid_query,
} from './cmd.js';
import {
    createCommandBindingModel,
    keyForCommand,
} from './command_bindings.js';
import { clear_kickedloc } from './dokick.js';
import { dig_typ } from './dig.js';
import {
    a_monnam,
    alwaysVisibleMonsterName,
    hliquid,
    m_monnam,
    mon_nam,
    y_monnam,
} from './do_name.js';
import {
    assign_level,
    Invocation_lev,
    on_level,
    surface,
    u_on_newpos,
} from './dungeon.js';
import { gethungry } from './eat.js';
import { done } from './end.js';
import { dist2, highc, ing_suffix, upstart, visctrl } from './hacklib.js';
import {
    can_reach_floor,
    engr_at,
    wipe_engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import { carrying, delobj } from './invent.js';
import { doopen_indir } from './lock.js';
import {
    amorphous,
    attacktype,
    bigmonst,
    is_flyer,
    is_floater,
    is_hider,
    is_clinger,
    hides_under,
    is_rider,
    is_whirly,
    needspick,
    locomotion,
    noattacks,
    noncorporeal,
    grounded,
    amphibious,
    breathless,
    is_swimmer,
    metallivorous,
    monster_resists_element,
    dmgtype,
    passes_bars,
    passes_walls,
    slithy,
    sticks,
    strongmonst,
    throws_rocks,
    tunnels,
    verysmall,
} from './mondata.js';
import {
    is_pick,
    is_weptool,
    obj_ice_effects,
    objectType,
    place_object,
    remove_object,
    sobj_at,
} from './obj.js';
import {
    an,
    assertObjectNameable,
    assertPricedObjectNameable,
    simple_typename,
    The,
    the,
    donameFresh,
    UnsupportedObjectNameError,
    xnameFresh,
} from './objnam.js';
import {
    BOULDER,
    COIN_CLASS,
    CORPSE,
    DWARVISH_MATTOCK,
    LEVITATION_BOOTS,
    NUM_OBJECTS,
    PICK_AXE,
    RIN_LEVITATION,
    SLIME_MOLD,
    STATUE,
    WATER_WALKING_BOOTS,
    WAN_DIGGING,
    WEAPON_CLASS,
} from './objects.js';
import {
    AD_CORR,
    AD_RUST,
    AT_EXPL,
    G_UNIQ,
    NUMMONS,
    PM_DISPLACER_BEAST,
    PM_ELF,
    PM_GRID_BUG,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_LONG_WORM_TAIL,
    PM_PONY,
    PM_VALKYRIE,
    PM_WIZARD,
    PM_WIZARD_OF_YENDOR,
    MZ_MEDIUM,
    S_EEL,
    S_NYMPH,
} from './monsters.js';
import { curr_mon_load, maybe_unhide_at, set_ustuck } from './mon.js';
import { m_next2u } from './mhitu.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    accessible,
    can_ooze,
    can_fog,
    closed_door,
    onscary,
    wormCross,
    youHear,
} from './monmove.js';
import {
    encumber_msg,
    pickup,
    preflight_describe_decor_at,
    preflight_projected_random_arrival_pickup,
    UnsupportedPickupError,
} from './pickup.js';
import {
    in_out_region,
    inside_region,
    visible_region_at,
} from './region.js';
import { CapitalMon } from './random_text.js';
import { rn1, rn2, rnd } from './rng.js';
import { water_friction } from './mkmaze.js';
import { waterbody_name } from './pager.js';
import { Cold_resistance } from './zap.js';
import { enexto, goodpos, rloc_to } from './teleport.js';
import { inside_room } from './room_coordinates.js';
import { check_special_room, in_rooms } from './rooms.js';
import {
    block_door,
    block_entry,
    costly_spot,
    preflight_shop_transition,
    shop_keeper,
    UnsupportedShopError,
} from './shk.js';
import {
    canSpotMonster,
    collectMonsterNoticeMessage,
    collectMonsterNoticeMessages,
    is_db_wall,
    messageAt,
    monsterVisible,
    sensesMonster,
} from './startup_a11y.js';
import { exercise_steed, stucksteed } from './steed.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import {
    S_hcdoor,
    S_stone,
    S_vcdoor,
    trap_to_defsym,
} from './symbols.js';
import {
    peek_timer,
    spot_stop_timers,
    spot_time_left,
    start_timer,
    stop_timer,
} from './timeout.js';
import {
    is_lava,
    is_pool,
    is_pool_or_lava,
    back_on_ground,
    drown,
    lava_effects,
    reset_utrap,
    t_at,
    trapname,
    into_vs_onto,
    immune_to_trap,
} from './trap.js';
import { dotrap, preflight_dotrap } from './trap_effects.js';
import {
    ttyNorep, ttyPline, ttyUrgentPline,
} from './tty_message.js';
import { tty_raw_print } from './tty_rawprint.js';
import { init_objects } from './o_init.js';
import { note_unported } from './unported.js';
import { select_menu } from './windows.js';
import { do_attack, is_safemon, stumble_onto_mimic } from './uhitm.js';
import {
    block_point,
    couldsee,
    recalc_block_point,
    vision_recalc,
} from './vision.js';

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);

function reset_tmp_anything(state) {
    state.tmp_anything ??= {};
    Object.assign(state.tmp_anything, {
        a_uint: 0,
        a_long: 0,
        a_monst: null,
        a_obj: null,
    });
    return state.tmp_anything;
}

// C ref: hack.c uint_to_any(), long_to_any(), monst_to_any(), and
// obj_to_any() (73-102). All four reuse gt.tmp_anything, so a later call
// overwrites a value returned by an earlier one.
export function uint_to_any(ui, state = game) {
    const value = reset_tmp_anything(state);
    value.a_uint = Number(ui) >>> 0;
    return value;
}

export function long_to_any(lng, state = game) {
    const value = reset_tmp_anything(state);
    value.a_long = Math.trunc(lng);
    return value;
}

export function monst_to_any(mtmp, state = game) {
    const value = reset_tmp_anything(state);
    value.a_monst = mtmp;
    return value;
}

export function obj_to_any(obj, state = game) {
    const value = reset_tmp_anything(state);
    value.a_obj = obj;
    return value;
}

// C ref: hack.c revive_nasty() (105-137). Save nexthere before revival because
// a successful revive_corpse() deletes the corpse from the floor chain.
export async function revive_nasty(x, y, msg, state = game) {
    let revived = false;
    for (let obj = state.level?.objects?.[x]?.[y] ?? null; obj;) {
        const next = obj.nexthere;
        if (obj.otyp !== CORPSE
            || (!is_rider(state.mons?.[obj.corpsenm])
                && obj.corpsenm !== PM_WIZARD_OF_YENDOR)) {
            obj = next;
            continue;
        }
        const occupant = m_at(x, y, state);
        if (occupant) {
            const adjacent = enexto(x, y, occupant.data, { state });
            if (adjacent)
                rloc_to(occupant, adjacent.x, adjacent.y, { state });
        }
        if (msg) await ttyNorep(msg, state);
        const { revive_corpse } = await import('./do.js');
        revived = await revive_corpse(obj, state);
        obj = next;
    }

    if (revived) {
        const monster = m_at(x, y, state);
        if (monster && !goodpos(x, y, monster, 0, { state })) {
            const adjacent = enexto(x, y, monster.data, { state });
            if (adjacent)
                rloc_to(monster, adjacent.x, adjacent.y, { state });
        }
    }
    return revived;
}

// Lua ref: dat/nhcore.lua show_getpos_tip() (108-123). nh.text() preserves
// blank lines in the literal and displays the result in an NHW_MENU window
// with PICK_NONE (nhlua.c nhl_text()).
export const GETPOS_TIP_LINES = Object.freeze([
    'Tip: Farlooking or selecting a map location',
    '',
    'You are now in a "farlook" mode - the movement keys move the cursor,',
    'not your character.  Game time does not advance.  This mode is used',
    'to look around the map, or to select a location on it.',
    '',
    'When in this mode, you can press ESC to return to normal game mode,',
    'and pressing ? will show the key help.',
]);

// C ref: hack.c handle_tip() (1852-1880). The bit is set before the selected
// message or Lua callback runs.
export async function handle_tip(tip, state = game, env = {}) {
    if (!state.flags?.tips) return false;
    state.context ??= {};
    const tips = Math.trunc(state.context.tips ?? 0);
    if (tip < 0 || tip >= 4 || (tips & (1 << tip))) return false;
    state.context.tips = tips | (1 << tip);
    if (tip === TIP_ENHANCE) {
        await ttyPline(
            '(Tip: use the #enhance command to advance them.)', state,
        );
    } else if (tip === TIP_SWIM) {
        state.commandBindings ??= createCommandBindingModel(state);
        const key = keyForCommand(state.commandBindings, 'reqmenu');
        await ttyPline(
            `(Tip: use '${visctrl(key)}' prefix to step in if you really want to.)`,
            state,
        );
    } else if (tip === TIP_UNTRAP_MON) {
        await ttyPline('(Tip: perhaps #untrap would help?)', state);
    } else if (tip === TIP_GETPOS) {
        const textWindow = env.textWindow ?? (async (lines) => select_menu(state, {
            how: PICK_NONE,
            items: lines,
            cancelValue: null,
            overlay: state.iflags?.menu_overlay !== false,
        }));
        await textWindow(GETPOS_TIP_LINES.map((text) => ({ text })));
    }
    return true;
}

// C ref: hack.c weight_cap() (4293-4351), for the live unpolymorphed,
// non-levitating repeated-command boundary. Unlike the former startup-only
// helper, this reads effective Strength on every call, so hunger weakness can
// change carrying capacity before the next monster/allocation cycle.
//
// The Boots_on/ELevitation deferral and its restore at 4337-4341 are absent
// because nothing reaches them.
//
// The Upolyd adjustment at 4313-4323 scales carrying capacity by the
// polymorphed form's corpse weight (cwt) relative to WT_HUMAN, matching
// mon.c can_carry(). A nymph gets MAX_CARR_CAP; a form with cwt 0 scales
// by msize/MZ_HUMAN; a non-strong form (or a strong form heavier than human)
// scales by cwt/WT_HUMAN.
//
// The steed arm at 4325-4327 is live, because riding a strong monster is one
// of the three ways C reaches MAX_CARR_CAP -- the other two, Levitation and
// the air level, remain out of reach.
//
// The EWounded_legs reduction at 4331-4336 is live too, and it is what turns a
// bear trap's set_wounded_legs() into the "Burdened" the status line shows: one
// wounded leg costs WT_WOUNDEDLEG_REDUCT, and both cost twice that. C guards it
// with !Flying, which is the only reader of Flying in this function.
export function weight_cap(state = game) {
    let capacity = WT_WEIGHTCAP_STRCON * (
        acurrstr(state) + acurr(state, A_CON)
    ) + WT_WEIGHTCAP_SPARE;
    // C ref: hack.c weight_cap() 4313-4323. Polymorphed carrying capacity
    // scales by the new form's corpse weight, consistent with can_carry().
    if (Upolyd(state.u) && state.youmonst?.data) {
        const mdat = state.youmonst.data;
        if (mdat.mlet === S_NYMPH) {
            capacity = MAX_CARR_CAP;
        } else if (!mdat.cwt) {
            capacity = Math.trunc(capacity * mdat.msize / MZ_MEDIUM);
        } else if (!strongmonst(mdat)
                   || (strongmonst(mdat) && mdat.cwt > WT_HUMAN)) {
            capacity = Math.trunc(capacity * mdat.cwt / WT_HUMAN);
        }
    }
    // hack.c:4330-4333. Levitation and the Plane of Air both provide the
    // full carrying capacity even when no equipment changes u.uprops.
    if (propertyActiveUnblocked(state, LEVITATION)
        || Is_airlevel(state.u.uz)
        || (state.u.usteed && strongmonst(state.u.usteed.data))) {
        capacity = MAX_CARR_CAP;
    } else {
        capacity = Math.min(capacity, MAX_CARR_CAP);
        if (!heroIsFlying(state)) {
            const sides = state.u?.uprops?.[WOUNDED_LEGS]?.extrinsic ?? 0;
            if (sides & LEFT_SIDE) capacity -= WT_WOUNDEDLEG_REDUCT;
            if (sides & RIGHT_SIDE) capacity -= WT_WOUNDEDLEG_REDUCT;
        }
    }
    return Math.max(Math.trunc(capacity), 1); /* never return 0 */
}

function inventory_weight(state) {
    let weight = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (object.oclass === COIN_CLASS) {
            weight += Math.trunc((Math.trunc(object.quan) + 50) / 100);
        } else if (object.otyp !== BOULDER
            || !throws_rocks(state.youmonst?.data)) {
            weight += Math.trunc(object.owt ?? 0);
        }
    }
    return weight;
}

function capacity_from_excess(excess, capacity) {
    if (excess <= 0) return 0;
    if (capacity <= 1) return OVERLOADED;
    return Math.min(
        Math.trunc(excess * 2 / capacity) + 1,
        OVERLOADED,
    );
}

// C ref: hack.c inv_weight(). The inventory is stable throughout the current
// repeated-command boundary, but its capacity component is deliberately live.
export function inv_weight(state = game) {
    state.gw ??= {};
    state.gw.wc = weight_cap(state);
    return inventory_weight(state) - state.gw.wc;
}

// C ref: hack.c inv_cnt() (4494-4507). Counts inventory slots, optionally
// including the gold one. C selects gold by invlet rather than by class, so a
// non-gold object that somehow carries '$' would be skipped too.
export function inv_cnt(incl_gold, state = game) {
    let count = 0;
    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (incl_gold || obj.invlet !== GOLD_SYM) count++;
    }
    return count;
}

// C ref: hack.c calc_capacity() and near_capacity().
export function calc_capacity(extraWeight = 0, state = game) {
    const excess = inv_weight(state) + Math.trunc(extraWeight);
    return capacity_from_excess(excess, state.gw.wc);
}

export function near_capacity(state = game) {
    return calc_capacity(0, state);
}

// C ref: hack.c check_capacity() (4398-4408). Answers whether the hero is too
// loaded to act, and says so first. C's `str` is a caller-supplied replacement
// line printed through pline1(); a null one takes the You_cant() default.
export async function check_capacity(str, state = game) {
    if (near_capacity(state) >= EXT_ENCUMBER) {
        await ttyPline(
            str ?? "You can't do that while carrying so much stuff.",
            state,
        );
        return true;
    }
    return false;
}

// C ref: hack.c overexert_hp() (3035-3047). What working while overloaded
// costs: one hit point, or consciousness when there is not one to spare.
//
// Upolyd is constantly false in this port, so C's `int *hp` is always
// &u.uhp. Only the `*hp <= 1` arm (3042-3046) stops, and no longer for want of
// the three statements it runs: You("pass out from exertion!"), attrib.c
// exercise(A_CON, FALSE) and timeout.c fall_asleep(-10, FALSE) are all ported.
// What stops it is the state it would leave behind. Both callers reach this
// only from HVY_ENCUMBER upward, so a hero who faints here is immobile and
// still overloaded, and js/allmain.js refuses that pair at its `burdened
// multi-cycle immobility countdown` boundary: a burdened turn is planned on a
// clone first, and the clone reaches that boundary in the same round the faint
// would run in. Running the arm would also spend exercise()'s rn2(2) here and
// make overexertion() below return `gm.multi < 0` for the first time, which
// uhitm.c do_attack() (533) reads to abandon the attack. It needs a fresh C
// case, not a comment change.
//
// `refuse` is the caller's own boundary, because hack.c overexertion() and
// allmain.c moveloop_core() reach this from different commands and stop at
// different classes.
export function overexert_hp(state, refuse) {
    if (typeof refuse !== 'function')
        throw new TypeError('overexert_hp requires a refusal');
    if (state.u.uhp > 1) {
        state.u.uhp -= 1;
        state.disp.botl = true;
    } else {
        refuse();
    }
}

// C ref: hack.c overexertion() (3051-3061). Combat increases metabolism:
// do_attack() calls this once per attempt, so a fight burns nutrition on top
// of the turn loop's own gethungry(). Its rn2(20) is the first random-number
// call any melee attempt makes.
//
// C's return value is `gm.multi < 0`, which is true only when overexert_hp()
// forced the hero to faint. Nothing reachable from here sets gm.multi:
// gethungry() never writes it, and the arm of overexert_hp() that would stops
// instead. So the return is always false.
export async function overexertion(state = game) {
    // The same four owners allmain.c's caller supplies at js/allmain.js:676.
    // gethungry() demands nearCapacity() always and the other three only when
    // the nutrition it is about to spend could move the hunger status.
    await gethungry(state, {
        nearCapacity: () => near_capacity(state),
        message: ttyPline,
        endRunning,
        statusRefresh: () => bot(),
    });
    if ((state.moves % 3) !== 0 && near_capacity(state) >= HVY_ENCUMBER) {
        overexert_hp(state, () => {
            throw new UnsupportedHeroMoveBoundaryError(
                'overexertion hit points',
            );
        });
    }
    return false;
}

// near_capacity() without the cache write. hack.c's inv_weight() assigns
// gw.wc as a side effect, and calc_capacity() then reads it, so calling
// near_capacity() early would refresh the live cache before the elapsed-turn
// admission pass has decided whether the turn may run at all. This returns the
// same number for the same state and leaves state.gw.wc untouched; the
// cache-writing call stays at allmain.c's source-ordered point, after monster
// actions are admitted. Use near_capacity() anywhere C calls it, and this only
// where the read must not be observable.
export function projected_capacity(state = game) {
    const capacity = weight_cap(state);
    return capacity_from_excess(
        inventory_weight(state) - capacity,
        capacity,
    );
}

export class UnsupportedHeroMoveBoundaryError extends Error {
    constructor(reason) {
        super(`unsupported hero move: ${reason}`);
        this.name = 'UnsupportedHeroMoveBoundaryError';
        this.reason = reason;
    }
}

function assertMovementFloorObjectNameable(object, withShopPrice, state) {
    try {
        if (withShopPrice)
            assertPricedObjectNameable(object, state);
        else
            assertObjectNameable(object, state);
    } catch (error) {
        if (!(error instanceof UnsupportedObjectNameError)
            && !(error instanceof UnsupportedShopError)) throw error;
        throw new UnsupportedHeroMoveBoundaryError(error.branch);
    }
}

// C ref: hack.c rounddiv() (4549-4573). Integer division that rounds a
// remainder of exactly half away from zero, and carries the sign of the
// quotient rather than C's truncation. eat.c doeat() divides a meal's
// remaining nutrition by its full nutrition through this.
export function rounddiv(x, y) {
    let divsgn = 1;
    if (y === 0) throw new RangeError('division by zero in rounddiv');
    if (y < 0) {
        divsgn = -divsgn;
        y = -y;
    }
    if (x < 0) {
        divsgn = -divsgn;
        x = -x;
    }
    let r = Math.trunc(x / y);
    const m = x % y;
    if (2 * m >= y) r++;
    return divsgn * r;
}

function propertyActiveUnblocked(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && !value?.blocked;
}

function propertyIntrinsic(state, property) {
    return Boolean(state.u?.uprops?.[property]?.intrinsic);
}

// C ref: hack.c u_maybe_impaired() (2417-2421). youprop.h:81 and :84 define
// both Stunned and Confusion as the bare intrinsic field, with no extrinsic or
// blocked term. rn2(5) is drawn only for a confused hero, so an unimpaired one
// costs no randomness.
export function u_maybe_impaired(state = game) {
    return Boolean(propertyIntrinsic(state, STUNNED)
        || (propertyIntrinsic(state, CONFUSION) && !rn2(5)));
}

// C ref: youprop.h's plain `HFoo || EFoo` property macros, such as
// Passes_walls and Fumbling, which carry no blocked term.
function propertyPresent(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function heroHallucinating(state) {
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return propertyIntrinsic(state, HALLUC)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: hack.c in_town() (3562-3585). A Mine Town level with subrooms uses
// the containing room as its town boundary. A variant without subrooms treats
// the whole level as town.
export function in_town(x, y, state = game) {
    if (!state.level?.flags?.has_town) return false;
    let hasSubrooms = false;
    for (const room of state.level.rooms ?? []) {
        if (!(room?.hx > 0)) break;
        if ((room.nsubrooms ?? room.sbrooms?.length ?? 0) > 0) {
            hasSubrooms = true;
            if (inside_room(room, x, y, state)) return true;
        }
    }
    return !hasSubrooms;
}

// C ref: hack.c monster_nearby(). This deliberately has stricter concealment,
// disposition, helplessness, and scare checks than canspotmon().
export function monster_nearby(state = game) {
    const { ux, uy } = state.u;
    const hallucinating = heroHallucinating(state);
    for (let x = ux - 1; x <= ux + 1; ++x) {
        for (let y = uy - 1; y <= uy + 1; ++y) {
            if (!isok(x, y) || (x === ux && y === uy)) continue;
            const monster = m_at(x, y, state);
            if (!monster) continue;
            const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
            if (appearance === M_AP_FURNITURE
                || appearance === M_AP_OBJECT) {
                continue;
            }
            if (!hallucinating
                && (monster.mpeaceful || noattacks(monster.data))) {
                continue;
            }
            if (is_hider(monster.data) && monster.mundetected) continue;
            if (helpless(monster)) continue;
            if (onscary(ux, uy, monster, state)) continue;
            if (canSpotMonster(monster, state)) return true;
        }
    }
    return false;
}

// Compatibility for operation objects and callers that predate the
// source-owned name. New direct C call sites use monster_nearby().
export const monsterNearby = monster_nearby;

// C ref: hack.c end_running(TRUE). Finite movement, hunger transitions, and
// safe-pet refusal share this owner for run, travel, movement-repeat, and count
// cancellation.
//
// The status catch-up belongs here and nowhere else. moveloop_core() suppresses
// the turn counter while context.run is set, and classify_terrain() suppresses
// its own disp.botl write for the same reason, so both have to be made up once
// the run ends. nomul() masks half of that by setting disp.botl itself, but the
// direct callers in js/uhitm.js and js/eat.js reach here without it.
//
// state.travelmap stands for gt.travelmap, the selection travel builds and
// every end_running() disposes of. C frees it here unconditionally, outside
// both the `context.run` block and the `and_travel` arm, so this clear carries
// no guard either. The adjacent findtravelpath() fast path passes FALSE: it
// must discard the old map while leaving the caller's travel intent intact so
// domove_core() can continue through the ordinary movement pipeline.
export function end_running(andTravel = true, state = game) {
    if (state.context.run) {
        state.context.run = 0;
        state.disp ??= {};
        if (state.flags?.time) state.disp.time_botl = true;
        if (state.flags?.terrainstatus) {
            state.iflags.terrain_typ = MAX_TYPE; /* "none of the above" */
            classify_terrain(state);
        }
    }
    if (andTravel) {
        state.context.travel = 0;
        state.context.travel1 = 0;
        state.context.mv = 0;
    }
    state.travelmap = null;
    if (state.multi > 0) state.multi = 0;
}

// Compatibility for injected operation objects, whose established contract
// takes state before the optional and_travel flag.
export const endRunning = (state = game, andTravel = true) =>
    end_running(andTravel, state);

// C ref: hack.c max_capacity() (4391-4396). inv_weight() refreshes gw.wc
// before this function applies the source's two-capacity overload threshold.
export function max_capacity(state = game) {
    const weight = inv_weight(state);
    return weight - (2 * state.gw.wc);
}

// C ref: hack.c dump_weights() (4421-4482). This developer command prints a
// source-formatted initializer ordered first by seven-digit weight and then by
// the displayed body or object name.
export function dump_weights(state = game, env = {}) {
    // decl_globals_init() and freedynamicdata() are void lifecycle calls. The
    // JS command-line path that would own them is not ported, so record both
    // gaps and operate on the caller's initialized catalogs.
    note_unported('decl.c decl_globals_init');
    const initializeObjects = env.initObjects ?? init_objects;
    initializeObjects(state, env.random ?? rn2);

    if (!Array.isArray(state.mons) || state.mons.length < NUMMONS) {
        throw new Error('dump_weights requires an initialized monster catalog');
    }
    if (!Array.isArray(state.objects)
        || !Array.isArray(state.obj_descr)
        || state.objects.length < NUM_OBJECTS) {
        throw new Error('dump_weights requires an initialized object catalog');
    }

    const weightlist = [];
    for (let index = 0; index < NUMMONS; ++index) {
        if (index === PM_LONG_WORM_TAIL) continue;
        const species = state.mons[index];
        const weight = Math.trunc(species.cwt);
        const name = species.pmnames[NEUTRAL];
        const unique = Boolean(species.geno & G_UNIQ);
        const body = CapitalMon(name, state)
            ? the(name, state) : unique ? name : an(name);
        weightlist.push({
            wtyp: 1,
            wt: weight,
            idx: index,
            unique,
            nm: `${String(weight).padStart(7, '0')}the body of ${body}`,
        });
    }

    for (let index = 0; index < NUM_OBJECTS; ++index) {
        const name = index === SLIME_MOLD
            ? 'slime mold' : state.obj_descr[index]?.oc_name;
        const objectClass = state.objects[index];
        const weight = Math.trunc(objectClass.oc_weight);
        if (!weight || !name) continue;
        const unique = Boolean(objectClass.oc_unique);
        objectClass.oc_name_known = 1;
        const base = simple_typename(index, state);
        const displayName = unique ? the(base, state) : an(base);
        weightlist.push({
            wtyp: 2,
            wt: weight,
            idx: index,
            unique,
            nm: `${String(weight).padStart(7, '0')}${displayName}`,
        });
    }

    weightlist.sort(cmp_weights);
    const rawPrint = env.rawPrint
        ?? ((line) => tty_raw_print(state, line));
    rawPrint('int all_weights[] = {');
    for (let index = 0; index < weightlist.length; ++index) {
        const entry = weightlist[index];
        const comma = index === weightlist.length - 1 ? ' ' : ',';
        const name = entry.nm.slice(7).padEnd(49, ' ');
        rawPrint(`    ${String(entry.wt).padStart(7, ' ')}${comma} /* ${name} */`);
    }
    rawPrint('};');
    rawPrint('');
    note_unported('decl.c freedynamicdata');
}

// C ref: hack.c cmp_weights() (4486-4493). strcmp() only promises a negative,
// zero, or positive result, which is exactly what Array.sort() consumes.
export function cmp_weights(first, second) {
    const left = first.nm;
    const right = second.nm;
    return left < right ? -1 : left > right ? 1 : 0;
}

// C ref: hack.c spot_checks() (4525-4546). When ice disappears, cancel its
// level timer before updating timed floor objects for their new temperature.
export function spot_checks(x, y, oldTyp, state = game, env = {}) {
    const location = state.level.at(x, y);
    const newTyp = location.typ;
    let drawbridgeIceNow = false;

    switch (oldTyp) {
    case DRAWBRIDGE_UP:
        drawbridgeIceNow = (((location.flags || location.drawbridgemask || 0)
            & DB_UNDER) === DB_ICE);
        // FALLTHROUGH
    case ICE:
        if (newTyp !== oldTyp
            || (oldTyp === DRAWBRIDGE_UP && !drawbridgeIceNow)) {
            const timeLeft = env.spotTimeLeft ?? spot_time_left;
            const stopTimers = env.spotStopTimers ?? spot_stop_timers;
            const iceEffects = env.objIceEffects ?? obj_ice_effects;
            if (timeLeft(x, y, MELT_ICE_AWAY, state))
                stopTimers(x, y, MELT_ICE_AWAY, state);
            iceEffects(x, y, false, { ...env, state });
        }
        break;
    default:
        break;
    }
}

// C ref: hack.c nomul() (4160-4173). Interrupts a multi-turn action: a run, a
// travel, or a counted repeat. Its trailing cmdq_clear(CQ_CANNED) is what
// hack.h:174 means by "the queue will get cleared if hero is interrupted",
// and it runs for every nval, not only a positive one: a canned sequence that
// spans a turn is abandoned the moment anything interrupts the hero. That is
// why wield.c doswapweapon() zeroes gm.multi by assignment rather than
// through this function.
//
// gm.multi_reason and gm.multireasonbuf have no ported reader. They are
// written anyway because they are the reason string for the interrupted
// action, and losing the clear would leave the previous action's reason
// standing for the next one that sets it -- the same stale-string defect
// dropping done_eating()'s nomovemsg reset produces. C zeroes them together
// and only for nval 0, so both stay under that one guard.
export function nomul(nval, state = game) {
    const multi = state.multi ?? 0;
    if (multi < nval) return; /* This is a bug fix by ab@unido */
    state.disp ??= {};
    if (multi >= 0) state.disp.botl = true;
    state.u.uinvulnerable = false;
    state.u.usleep = 0;
    state.multi = nval;
    if (nval === 0) {
        state.multi_reason = null;
        state.multireasonbuf = '';
    }
    end_running(true, state);
    cmdq_clear(CQ_CANNED, state);
}

// C ref: decl.c:47 c_common_strings.c_You_can_move_again, which hack.h:271
// names You_can_move_again. unmul() below falls back to it, and timeout.c
// fall_asleep() picks it for a sleep that ends without announcing itself.
export const You_can_move_again = 'You can move again.';

// C ref: hack.c unmul() (4176-4208). "called when a non-movement, multi-turn
// action has completed". allmain.c moveloop_core():382 is the only caller the
// port reaches: it counts a negative gm.multi up and calls this on the turn the
// count runs out. What nomul()'s negative caller left behind -- the message and
// the ga.afternmv callback -- is spent here and then cleared, so the next
// immobilizing action starts from nothing.
//
// C follows the message with a second one for a hero who was life-saved out of
// green slime, gated on `Upolyd && !strncmpi(gn.nomovemsg, "You survived that
// ", 18)`. Both halves are unreachable: js/u_init.js is the port's only writer
// of u.umonnum and sets it equal to u.umonster, and the one C writer of that
// message is done()'s life-saving arm, which is not ported. It is left out
// rather than refused because no ported state can reach it to be refused.
export async function unmul(msg_override, state = game) {
    state.disp ??= {};
    state.disp.botl = true;
    state.multi = 0; /* caller will usually have done this already */
    // C's two guards are pointer tests and its third is a character test, so
    // the empty string travels through the first two and is silenced by the
    // third. That is a real distinction, not a hypothetical one: do_wear.c:2401
    // and polyself.c:225 call unmul("") precisely to run the callback without
    // a message, and dothrow.c, detect.c, apply.c, pickup.c and artifact.c all
    // leave an empty gn.nomovemsg behind for the same reason. Reading either
    // guard as a truthiness test would print You_can_move_again for all of
    // them, so both compare against null.
    if (msg_override != null) state.nomovemsg = msg_override;
    else if (state.nomovemsg == null) state.nomovemsg = You_can_move_again;
    if (state.nomovemsg) await ttyPline(state.nomovemsg, state);
    state.nomovemsg = null;
    state.u.usleep = 0;
    state.multi_reason = null;
    state.multireasonbuf = '';

    if (state.afternmv) {
        const f = state.afternmv;

        /* clear afternmv before calling it (to override the
           encumbrance hack for levitation--see weight_cap()) */
        state.afternmv = null;
        await f(state);
    }
}

// C ref: hack.c u_rooted() (1693-1705). TRUE for a hero whose current form
// cannot move at all, which do.c dodown() and doup() and sit.c dosit() test
// before anything else. mmove is the permonst speed field, so only a
// polymorphed hero can answer TRUE; js/u_init.js is the port's only writer of
// u.umonnum and it sets u.umonnum === u.umonster, so no admitted path reaches
// the message.
export async function u_rooted(state = game) {
    const species = state.youmonst?.data;
    if (!species?.mmove) {
        const inPlace = propertyActiveUnblocked(state, LEVITATION)
            || Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz);
        await ttyPline(
            `You are rooted ${inPlace ? 'in place' : 'to the ground'}.`,
            state,
        );
        nomul(0, state);
        return true;
    }
    return false;
}

// youprop.h:372 Unchanging, intrinsic or extrinsic; losehp() reads it to
// decide whether a polymorphed hero wails at low hit points.
function Unchanging(state) {
    const unchanging = state.u?.uprops?.[UNCHANGING];
    return Boolean(unchanging?.intrinsic || unchanging?.extrinsic);
}

// C ref: hack.c maybe_wail() (4210-4243). svm.moves is the turn counter and
// gw.wailmsg the turn the last wail was printed on, so the first 50 turns of a
// game are silent and the message repeats at most once every 51 turns.
//
// The powers[] tally reads the intrinsic field alone, not the property macros:
// an extrinsic granted by worn equipment does not count.
const WAIL_POWERS = Object.freeze([
    TELEPORT, SEE_INVIS, POISON_RES, COLD_RES, SHOCK_RES, FIRE_RES,
    SLEEP_RES, DISINT_RES, TELEPORT_CONTROL, STEALTH, FAST, INVIS,
]);

async function maybe_wail(state, env = {}) {
    if (state.moves <= (state.wailmsg ?? 0) + 50) return;
    const message = env.message ?? ttyPline;

    state.wailmsg = state.moves;
    const role = state.urole?.mnum;
    if (role === PM_WIZARD || state.urace?.mnum === PM_ELF
        || role === PM_VALKYRIE) {
        const who = (role === PM_WIZARD || role === PM_VALKYRIE)
            ? state.urole.name.m : 'Elf';

        if (state.u.uhp === 1) {
            await message(`${who} is about to die.`, state);
        } else {
            let powercnt = 0;
            for (const power of WAIL_POWERS) {
                if (state.u.uprops?.[power]?.intrinsic & INTRINSIC)
                    ++powercnt;
            }
            await message(
                powercnt >= 4
                    ? `${who}, all your powers will be lost...`
                    : `${who}, your life force is running out.`,
                state,
            );
        }
    } else {
        // Soundeffect() is a no-op without a sound library, which the tty
        // build this port matches is.
        const line = youHear(
            state.u.uhp === 1
                ? 'the wailing of the Banshee...'
                : 'the howling of the CwnAnnwn...',
            state,
        );
        if (line !== null) await message(line, state);
    }
}

// C ref: hack.c showdamage() (4245-4253). options.c leaves iflags.showdamage
// off, so an ordinary game prints nothing here.
//
// `message` exists because mhitu.c mdamageu() calls this from inside a monster
// turn, and js/unported_monster_actions.js runs every monster turn twice: once
// against a clone, to find out whether it can be replayed, and then live. With
// `showdamage` on, the default would write the clone's line to the live
// terminal. losehp() takes the same seam for its one monster-turn caller,
// potion.c potionhit(); every other caller runs on the hero's own turn and
// leaves it unset.
export async function showdamage(dmg, state, env = {}) {
    if (!state.iflags?.showdamage || !dmg) return;
    const message = env.message ?? ttyPline;

    await message(`[HP ${-dmg}, ${Upolyd(state.u) ? state.u.mh : state.u.uhp}`
        + ' left]', state);
}

// C ref: hack.c losehp() (4255-4292). `knam` and `k_format` describe the
// killer; only the death branch records them, and only end.c done() reads them
// back.
//
// `env.message` reaches showdamage() and maybe_wail(), the two lines this
// prints short of death. The death branch keeps its urgent_pline(): the one
// monster-turn caller refuses a fatal loss before calling here.
export async function losehp(n, knam, k_format, state = game, env = {}) {
    state.disp ??= {};
    state.disp.botl = true; /* u.uhp or u.mh is changing */
    end_running(true, state);
    if (Upolyd(state.u)) {
        state.u.mh -= n;
        await showdamage(n, state, env);
        if (state.u.mhmax < state.u.mh)
            state.u.mhmax = state.u.mh;
        if (state.u.mh < 1)
            await rehumanize(state);
        else if (n > 0 && state.u.mh * 10 < state.u.mhmax && Unchanging(state))
            await maybe_wail(state, env);
        return;
    }

    state.u.uhp -= n;
    await showdamage(n, state, env);
    // Widening this comparison to >= would assign u.uhpmax to itself, so no
    // test can tell the two apart.
    if (state.u.uhp > state.u.uhpmax)
        state.u.uhpmax = state.u.uhp; /* perhaps n was negative */
    if (state.u.uhp < 1) {
        // C ref: decl.h:1151 `struct kinfo killer` inside svk. Nothing reads
        // it back until done() names the death by it, so this is where the
        // whole record lives and dies.
        state.killer ??= {};
        state.killer.format = k_format;
        // C guards the copy with `svk.killer.name != knam`, a pointer test
        // that spares Strcpy() a self-copy for the callers that hand it
        // svk.killer.name itself. Assigning the same string is that same
        // no-op here.
        state.killer.name = knam ?? '';
        // urgent_pline() rather than pline(): win/tty/topl.c update_topl():265
        // refuses to let a line starting "You die" share the top line with the
        // message before it, so this is the --More-- the player answers before
        // the death is even drawn.
        await ttyUrgentPline('You die...', state);
        // done() is asynchronous because cmd.c paranoid_query() is: its
        // "Die?" prompt waits for a key. Dropping the await would let this
        // function return while that prompt is still unanswered, and the
        // caller would spend the rest of its turn behind the query C stops
        // at.
        await done(DIED, state);
    } else if (n > 0 && state.u.uhp * 10 < state.u.uhpmax) {
        await maybe_wail(state, env);
    }
}

function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean(
        (blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked,
    );
}

// youprop.h:125 Deaf is (HDeaf || EDeaf || u.uroleplay.deaf). Unlike Blind it
// has no blocked term, so a source of deafness is never suppressed.
//
// This is the raw property. pline.c You_hear() applies its own wider test --
// deafness that an unaware hero still dreams through, plus flags.acoustics --
// which is why moverock_core() cannot infer `!Deaf` from youHear() printing.
function heroIsDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF];
    return Boolean(
        deafness?.intrinsic || deafness?.extrinsic
        || state.u?.uroleplay?.deaf,
    );
}

// C ref: hack.c test_move()'s IS_OBSTRUCTED entry test, narrowed to the wall
// and rock destinations the ported half of test_move() refuses. It answers
// TRUE exactly where test_move() gives up without changing the game, which is
// why the command admission seam can skip its destination checks there and
// leave the refusal to domove().
//
// It used to carry a `loc.doormask & (D_CLOSED | D_LOCKED)` term as well. The
// term was dead rather than wrong in general: js/mklev.js dosdoor() (2545)
// writes only `loc.flags` for an ordinary dungeon door, so it answered FALSE
// for those, though create_door() (2731) and the special-level door path (951)
// do write `doormask` and would have satisfied it. Either way it is
// unreachable now for the one caller there is. blocksMove() is called only
// from preflightDomoveDestination(), whose else-if chain claims every closed
// or locked door in its closed_door() arm before reaching here, so the deleted
// term could never have fired. test_move() is not a second caller: it refuses
// stone and walls through its own inline test, and additionally does not share
// blocksMove()'s TRUE answer for a missing location.
function blocksMove(x, y, state) {
    const loc = state.level?.at(x, y);
    return !loc || IS_OBSTRUCTED(loc.typ) || loc.typ === IRONBARS;
}

// C ref: hack.c:1140-1141, the condition on test_move()'s testdiag arm. A
// doorway that still has its door refuses a diagonal entry.
//
// block_door() and block_entry() own the shopkeeper refusal now. Their
// remaining dependency is inside shk.c:5815's final term, `debit || billct ||
// robbed`: js/shknam.js:319-326 and js/makemon_create.js:468-480 initialize
// all three to zero and nothing in this port writes any of them, so an unpaid
// shopkeeper case still cannot be source-backed by this admission helper.
function blocksDiagonalDoorwayEntry(ux, uy, x, y, state) {
    return Boolean((x - ux) && (y - uy)
        && !propertyPresent(state, PASSES_WALLS)
        && !doorless_door(state.level?.at(x, y), state));
}

// C ref: hack.c:1208-1209. The mirror rule: a doorway that still has its door
// refuses a diagonal exit, whatever the destination is.
function blocksDiagonalDoorwayExit(ux, uy, x, y, state) {
    const source = state.level?.at(ux, uy);
    return Boolean((x - ux) && (y - uy)
        && !propertyPresent(state, PASSES_WALLS)
        && IS_DOOR(source?.typ) && !doorless_door(source, state));
}

// TRUE where test_move() refuses the step through one of its two diagonal
// doorway rules. Neither refusal spends time -- both return FALSE, which
// domove_core():2843-2849 answers with `svc.context.move = 0; nomul(0)` -- so
// the admission seam admits the command and leaves the refusal to domove().
// Neither is a no-op, though: the entry rule still feels the square for a
// blind hero (hack.c:1144-1145), writing seenv and the remembered glyph. The
// wall branch blocksMove() reports is the right precedent for that too, since
// the wall arm feels the square as well (hack.c:1012-1013).
//
// The two arms C reaches before either rule decide nothing here: its obstacle
// arm (1011) and its closed-door arm (1075) either return or skip testdiag
// entirely, and the seam has its own branches for both.
function refusedDiagonalDoorway(x, y, state) {
    const { ux, uy } = state.u;
    const destination = state.level?.at(x, y);
    // No test can tell this answer from TRUE, and none should be written to
    // try. The caller's two arms for a square off the map are both no-ops: the
    // TRUE arm is empty, and on FALSE closed_door() answers FALSE and
    // blocksMove() answers TRUE for a missing location, so the else-if chain
    // falls off its end. The guard is here to keep the reads below defined.
    if (!destination) return false;
    if (IS_OBSTRUCTED(destination.typ) || destination.typ === IRONBARS)
        return false;
    if (IS_DOOR(destination.typ)) {
        if (closed_door(x, y, state)) return false;
        if (blocksDiagonalDoorwayEntry(ux, uy, x, y, state)) return true;
    }
    return blocksDiagonalDoorwayExit(ux, uy, x, y, state);
}

// This repeated-command boundary owns entry into a ROOM, CORR, or
// IS_FURNITURE square, or a doorway whose mask is exactly D_NODOOR,
// D_BROKEN, or D_ISOPEN. With autopickup disabled, it also admits the sighted
// object descriptions and, now that js/dungeon.js surface() names every
// terrain look_here() can feel underfoot, the blind paths with no object or
// one object. Blind paths that would describe an object pile remain refused.
// These checks are a temporary admission seam in front
// of hack.c:domove_core(); each rejected branch will move to its upstream owner
// when that behavior is ported.
//
// It says nothing about a monster standing on the square. Both callers in this
// file reach it only when m_at() answered null -- preflightDomoveDestination()
// through the else-if chain below a destination monster, and domove() through
// an explicit `!destinationMonster` -- because uhitm.c do_attack() claims an
// occupied destination before test_move() ever sees it. teleport.c teleds() is
// the caller that can arrive on an occupied square, and it makes that test
// itself.
//
// `pushesBoulder` says whether the step arrives through hack.c test_move(),
// which runs moverock() and pushes a boulder off the square before the hero
// lands on it. The two walking callers pass true. teleport.c teleds() does not
// and keeps the default: a teleport lands on the boulder's square with the
// boulder still on it, which is a separate boundary from a push.
export function requireSimpleHeroDestination(
    x,
    y,
    state,
    pushesBoulder = false,
) {
    const location = state.level?.at(x, y);
    // hack.c domove_core():2843-2856 admits liquid through test_move(), then
    // asks swim_move_danger() before moving the hero or applying any arrival
    // effect.  A warning which is certain to stop the step therefore needs no
    // ordinary-destination preflight.  Keep this walking-only: teleport.c
    // teleds() also calls this seam but never calls swim_move_danger().
    if (pushesBoulder && is_pool(x, y, state)
        && swim_move_danger_result(x, y, state) === SWIM_DANGER_AVOID) {
        return;
    }
    // hack.c test_move() admits every IS_FURNITURE type untouched -- stairs,
    // ladder, fountain, throne, sink, grave and altar. Its obstacle chain never
    // claims the square: `IS_OBSTRUCTED` is `typ < POOL` (rm.h:119) and
    // `IS_DOOR` is `typ == DOOR`, so neither hack.c:1011's arm nor
    // hack.c:1074's matches and control leaves the chain entirely, resuming at
    // hack.c:1153's diagonal `bad_rock()` test and then hack.c:1207's rule
    // against moving diagonally out of an intact doorway. `testdiag` is not
    // reached; it sits at hack.c:1139, inside the IS_DOOR arm.
    // domove_core() then ends a run on the square through hack.c:2936-2941,
    // ported below, and spoteffects() reaches only its IS_SINK arm, refused
    // there.
    //
    // A DOOR that is not closed_door() reaches only test_move()'s testdiag
    // arm, which refuses a diagonal entry and allows an orthogonal one; the
    // diagonal case never arrives here, because preflightDomoveDestination()
    // admits it for test_move() to refuse.
    // The three exact masks below are the non-closed doorway states that this
    // boundary owns. In particular, hack.c test_move():1074-1150 sends
    // D_BROKEN through testdiag, where doorless_door() admits it off the Rogue
    // level. D_TRAPPED combinations remain excluded: the trap bit makes them
    // distinct C states whose later behavior is not traced here.
    const mask = doorMask(location);
    const doorway = location?.typ === DOOR
        && (mask === D_NODOOR || mask === D_BROKEN || mask === D_ISOPEN);
    const ordinaryDestination = location
        && (location.typ === ROOM
            || location.typ === CORR
            || IS_FURNITURE(location.typ)
            || doorway);
    if (!ordinaryDestination) {
        throw new UnsupportedHeroMoveBoundaryError(
            'test_move() door or special terrain movement',
        );
    }
    // pickup.c pickup() returns before look_here() when the square holds no
    // object, running describe_decor() and read_engr_at(); check_here() calls
    // describe_decor() before counting when the square holds one. The port
    // owns the two silent ROOM/CORR results. Every furniture and doorway result
    // remains outside the boundary because it can print or suppress a feature.
    if (state.flags?.mention_decor
        && (IS_FURNITURE(location.typ) || doorway)) {
        throw new UnsupportedHeroMoveBoundaryError('decor description');
    }
    // cmd.c set_move_cmd() copies a pending reqmenu prefix to context.nopick
    // before domove(). executeMovement() runs this temporary admission seam
    // first, so read the pending prefix as the same movement intent here.
    const noPickMove = Boolean(
        state.context?.nopick || state.iflags?.menu_requested,
    );
    // moverock() runs inside test_move(), above everything spoteffects() and
    // pickup() do after the move, so a pushed boulder has already cleared its
    // square by the time this post-move seam reads objects.
    const floorObject = state.level?.objects?.[x]?.[y] ?? null;
    if (state.flags?.mention_decor && noPickMove) {
        throw new UnsupportedHeroMoveBoundaryError(
            'reqmenu with decor description',
        );
    }
    if (state.flags?.mention_decor) {
        try {
            preflight_describe_decor_at(x, y, state);
        } catch (error) {
            if (!(error instanceof UnsupportedPickupError)) throw error;
            throw new UnsupportedHeroMoveBoundaryError(
                error.reason,
            );
        }
    }
    if (floorObject && state.flags?.pickup && !noPickMove) {
        // pickup.c pickup() runs after domove_core() commits the hero
        // position. A late refusal there would leave room-entry writes
        // behind, so dry-run the complete automatic-pickup transaction at
        // the projected destination before the move spends its rng calls.
        const projected = {
            ...state,
            gw: { ...(state.gw ?? {}) },
            u: { ...state.u, ux: x, uy: y },
        };
        try {
            preflight_projected_random_arrival_pickup(projected);
        } catch (error) {
            if (!(error instanceof UnsupportedPickupError)) throw error;
            throw new UnsupportedHeroMoveBoundaryError(error.reason);
        }
    }
    if (floorObject && !noPickMove && !floorObject.nexthere
        && state.flags?.pile_limit > 0
        && state.flags.pile_limit <= 1) {
        throw new UnsupportedHeroMoveBoundaryError(
            'single-object skipped-pile count',
        );
    }
    if (floorObject?.nexthere && !noPickMove) {
        let pileCount = 0;
        for (let object = floorObject; object; object = object.nexthere)
            ++pileCount;
        const skipObjects = state.flags?.pile_limit > 0
            && pileCount >= state.flags.pile_limit;
        // The count arm deliberately bypasses look_here()'s region line.  A
        // visible region therefore remains outside this slice even when both
        // endpoints are already inside it and in_out_region() has no crossing
        // to report.
        if (visible_region_at(x, y, state)) {
            throw new UnsupportedHeroMoveBoundaryError(
                skipObjects
                    ? 'visible region over skipped-pile count'
                    : 'visible region over object-pile menu',
            );
        }
        if (pileCount < 2 || (!skipObjects && pileCount > 4)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'object pile outside the two-to-four-item window',
            );
        }
        if (state.flags?.mention_decor && skipObjects) {
            throw new UnsupportedHeroMoveBoundaryError(
                'mention-decor pile-limit count',
            );
        }
        if (heroIsBlind(state)) {
            throw new UnsupportedHeroMoveBoundaryError('blind object pile');
        }
        // invent.c look_here() never calls doname_with_price() when the
        // threshold selects its count line. Keep nameability as a menu-only
        // preflight so the message path admits every ordinary pile count.
        if (!skipObjects) {
            const withShopPrice = costly_spot(x, y, state);
            for (let object = floorObject; object; object = object.nexthere) {
                assertMovementFloorObjectNameable(
                    object,
                    withShopPrice,
                    state,
                );
            }
        }
    }
    if (floorObject && !floorObject.nexthere && !noPickMove) {
        if (visible_region_at(x, y, state)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'visible region over single-object description',
            );
        }
        assertMovementFloorObjectNameable(
            floorObject,
            costly_spot(x, y, state),
            state,
        );
    }
    // invent.c look_here() computes dfeature_at() unconditionally and prints
    // it before "You see here" when the square holds exactly one object. Both
    // dfeature_at() and stairs_description() are ported, so every admitted
    // terrain but one reaches its own owner. ALTAR has no answer yet:
    // dfeature_at() throws for a_gname() rather than diverging, and that class
    // is refused here rather than left to escape. js/cmd.js runs domove()
    // inside failClosedCommand(), so the class ends the segment on its last
    // matching screen instead of aborting the run.
    if (floorObject && !noPickMove && location.typ === ALTAR) {
        throw new UnsupportedHeroMoveBoundaryError(
            'terrain feature description',
        );
    }
    // spoteffects() triggers the trap under the hero after the move commits,
    // so everything trap.c dotrap() cannot answer has to be asked here, while
    // refusing still costs nothing. preflight_dotrap() is that question and
    // raises this same class; the bear trap is the one type it lets through.
    const destinationTrap = t_at(x, y, state);
    if (destinationTrap) preflight_dotrap(destinationTrap, state);

    for (const region of state.level?.regions ?? []) {
        if (region.attach_2_u) continue;
        if (Boolean(region.hero_inside) !== inside_region(region, x, y))
            throw new UnsupportedHeroMoveBoundaryError('region crossing');
    }
    try {
        preflight_shop_transition(state.u.ux, state.u.uy, x, y, state);
    } catch (error) {
        if (!(error instanceof UnsupportedShopError)) throw error;
        throw new UnsupportedHeroMoveBoundaryError(error.branch);
    }
}

function doorMask(location) {
    return location?.flags || location?.doormask || 0;
}

// C ref: hack.c doorless_door(). A doorway lacks its door when no mask bit
// outside D_NODOOR and D_BROKEN is set. Rogue-level doorways are the exception:
// Rogue has no doors but disallows diagonal access, so C treats them as intact.
// Both of test_move()'s diagonal rules use this predicate.
export function doorless_door(location, state = game) {
    return location?.typ === DOOR
        && !on_level(state.u?.uz, state.rogue_level)
        && (doorMask(location) & ~(D_NODOOR | D_BROKEN)) === 0;
}

// C ref: hack.c domove_attackmon_at() (1954-1992). What the hero has to know
// about the target before uhitm.c do_attack() can run.
//
// C's displacer-beast swap at 1972-1985 short-circuits on the species before
// its !rn2(2), so every other target reaches do_attack() with no draw spent
// and only that one species stops here.
//
// The gate at 1968-1970 admits a hidden target when it hides under something
// or is an eel (S_EEL), and is not a safe pet. attack_checks() then handles
// the reveal message and refuses the attack. Targets hidden another way
// (ceiling hiders, for example) are not handled in do_attack() and stop here.
function requireOrdinaryHostileMelee(monster, state) {
    if (monster.mundetected
        && !sensesMonster(monster, state)
        && !(hides_under(monster.data) || monster.data?.mlet === S_EEL)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'attacking a hidden monster (ceiling hider or other)',
        );
    }
}

// The destination-monster seam. C splits by `is_safemon(mtmp) &&
// !svc.context.forcefight` inside do_attack() (uhitm.c:462); this splits the
// same way, because the two arms have nothing in common below that test. The
// forcefight conjunct is what sends `F` at a pet down the attack arm instead
// of down the displacement arm, so the prefix swings at the pet rather than
// swapping places with it. A miss runs the whole swing, including wakeup(),
// whose setmangry() returns early on mtame so the pet is not angered; a landed
// blow runs js/uhitm.js hmon_hitmon_pet(), which spends the pet's tameness
// through abuse_dog() and then its monflee() rnd().
function requireSupportedDestinationMonster(monster, x, y, state) {
    if (!is_safemon(monster, state) || state.context?.forcefight) {
        requireOrdinaryHostileMelee(monster, state);
        return;
    }
    requireOrdinaryStartingPetSwap(monster, x, y, state);
}

function requireOrdinaryStartingPetSwap(monster, x, y, state) {
    const startingPet = monster
        && monster.m_id === state.context?.startingpet_mid
        && STARTING_PETS.has(monster.data?.pmidx)
        && monster.mtame
        && monster.mpeaceful;
    if (!startingPet) {
        throw new UnsupportedHeroMoveBoundaryError(
            'peaceful monster displacement',
        );
    }
    const ordinaryTimedFlee = !monster.mflee
        || (Number.isInteger(monster.mfleetim)
            && monster.mfleetim >= 1
            && monster.mfleetim <= 127);
    const specialState = monster.mhp < 1
        || !monster.mcanmove
        || monster.mfrozen
        || monster.msleeping
        || monster.mtrapped
        || !ordinaryTimedFlee
        || monster.meating
        || monster.wormno;
    if (specialState) {
        throw new UnsupportedHeroMoveBoundaryError(
            'hero combat or exceptional pet displacement',
        );
    }

    // hack.c domove_swap_with_pet() (2098-2180) never reads this square. Each
    // of its six refusal arms is about the pet or about the square the pet
    // moves into: the pit-and-boulder pin, NODIAG on a diagonal, a boulder on
    // the hero's square, bad_rock() through an opening, a trapped peaceful,
    // and goodpos(u.ux0, u.uy0, mtmp, 0). So this list only has to name the
    // terrain whose *arrival* consequences are ported, which is the same set
    // requireSimpleHeroDestination() admits above, less the doorway masks: a
    // D_ISOPEN swap has no recording behind it and this seam has never carried
    // one, so it keeps the mask-0 test it was written with.
    const destination = state.level?.at(x, y);
    const ordinaryDestination = destination
        && (destination.typ === ROOM
            || destination.typ === CORR
            || IS_FURNITURE(destination.typ)
            || (destination.typ === DOOR && doorMask(destination) === 0));
    if (!ordinaryDestination) {
        throw new UnsupportedHeroMoveBoundaryError(
            'domove_swap_with_pet() door or special terrain movement',
        );
    }
    // The furniture arrival's own consequences. domove_core()'s run stop at
    // hack.c:2936-2941 reads levl[x][y] after the swap and is ported below;
    // spoteffects() reaches only its IS_SINK && Levitation arm, refused there;
    // and C's pickup(1) returns at pickup.c:702-707 without look_here(),
    // because this seam refuses an object on the square. What is left on that
    // return is describe_decor() (pickup.c:376-425), which pickup.c:392's
    // `ltyp == prev_decor` shortcut cannot silence on furniture -- the test
    // carries `&& !IS_FURNITURE(ltyp)` -- so with mention_decor set it always
    // speaks a line this port cannot produce.
    //
    // ROOM and CORR share the walking seam's silent owner. Furniture and
    // doorways can print or suppress feature feedback and remain refused.
    if (state.flags?.mention_decor
        && (IS_FURNITURE(destination.typ) || destination.typ === DOOR)) {
        throw new UnsupportedHeroMoveBoundaryError('decor description');
    }
    if (state.flags?.mention_decor) {
        try {
            preflight_describe_decor_at(x, y, state);
        } catch (error) {
            if (!(error instanceof UnsupportedPickupError)) throw error;
            throw new UnsupportedHeroMoveBoundaryError(error.reason);
        }
    }

    const source = state.level?.at(state.u.ux, state.u.uy);
    const sourceAccessible = source
        && ACCESSIBLE(source.typ)
        && !(source.typ === DOOR
            && (doorMask(source) & (D_CLOSED | D_LOCKED)));
    if (!sourceAccessible) {
        throw new UnsupportedHeroMoveBoundaryError(
            'exceptional pet displacement terrain',
        );
    }
    if (t_at(x, y, state)
        || t_at(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap trap interaction',
        );
    }
    if (state.level?.objects?.[x]?.[y]) {
        // pickup.c pickup() runs only after domove_swap_with_pet() has moved
        // both actors and domove_core() has committed the hero position. A
        // late refusal there would leave those writes behind, so dry-run the
        // complete automatic-pickup transaction at the projected destination
        // before do_attack() spends its source-ordered rn2(7). The pickup
        // planner refreshes gw.wc; clone that write owner and the projected
        // hero coordinates while sharing the read-only level and inventory.
        const projected = {
            ...state,
            gw: { ...(state.gw ?? {}) },
            u: { ...state.u, ux: x, uy: y },
        };
        try {
            preflight_projected_random_arrival_pickup(projected);
        } catch (error) {
            if (!(error instanceof UnsupportedPickupError)) throw error;
            throw new UnsupportedHeroMoveBoundaryError(error.reason);
        }
    }
    if (state.level?.regions?.length) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap region crossing',
        );
    }
    if (engr_at(x, y, state)
        || engr_at(state.u.ux, state.u.uy, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'pet swap engraving interaction',
        );
    }
}

// C ref: hack.c domove_core():2830-2841, which hands the step to trapmove()
// and returns before test_move() at 2843 unless the hero got free and moved.
// trapmove()'s TT_BEARTRAP arm (1565-1579) always falls through to its
// `return FALSE` at 1690 -- the hero that works loose still stands where it
// was -- so a bear trap makes every neighbour unreadable, whatever it holds.
// The admission seam has to agree, or it refuses a struggle C never declines.
//
// The test is on the trap type rather than on u.utrap because the other arms
// differ: TT_PIT returns TRUE for an adjacent seen pit (1583) and
// TT_BURIEDBALL for a step inside the chain's reach (1648), and both of those
// do reach test_move(). Neither is ported; trapmove() stops on the type.
function heldStepIgnoresDestination(state) {
    return Boolean(state.u?.utrap) && state.u.utraptype === TT_BEARTRAP;
}

// The one thing domove_core() does read about the square a held hero pushes
// against. C ref: hack.c avoid_trap_andor_region() (2513-2581), called at
// 2822-2825 -- above the u.utrap block at 2830, so it runs whether or not the
// step can ever commit. Its first arm asks before stepping into a visible gas
// cloud, its second before stepping onto a trap the hero has already seen, and
// each blocks on paranoid_query()'s y/n read. Admitting such a step would
// print the struggle line and then take the answer key as the next command,
// which is a silent divergence rather than a stop.
//
// The whole function is unported (`grep -rn "avoid_trap_andor_region" js/`
// finds only this comment), so both destinations stop here. The refusal is
// wider than C in four ways, each of them a stop where C carries on:
//   ParanoidTrap -- options.c:7173 sets PARANOID_TRAP in the default
//     paranoia_bits and js/options.js:365 reproduces that default, but a
//     nethackrc that cleared the bit would silence both prompts;
//   `!svc.context.nopick || svc.context.run` -- an 'm'-prefixed step skips
//     both prompts;
//   test_move(..., TEST_MOVE) -- C asks neither question about a square the
//     hero could not enter anyway;
//   immune_to_trap() != TRAP_CLEARLY_IMMUNE, and the region arm's reg_damg()
//     comparison against the region the hero is leaving -- both suppress the
//     prompt for a hazard that cannot touch this hero.
function requireHeldStepDestination(x, y, state) {
    if (visible_region_at(x, y, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'paranoid region confirmation',
        );
    }
    if (t_at(x, y, state)?.tseen) {
        throw new UnsupportedHeroMoveBoundaryError(
            'paranoid trap confirmation',
        );
    }
}

// cmd.c establishes movement intent only after this hack.c admission seam has
// shown that the destination is inside the currently ported domove() subset.
export function preflightDomoveDestination(x, y, state = game, run = 0) {
    // C's domove_core() never uses the requested adjacent destination while
    // swallowed: it replaces the direction with (0, 0), repositions to
    // u.ustuck->mx,my, and attacks that monster. Let that source-order branch
    // run before this ordinary-destination admission seam examines x,y.
    if (state.u?.uswallow) return;

    // The destination monster comes first, because domove_core() does: it
    // takes m_at() at hack.c:2763, runs its run-stop, then domove_bump_mon()
    // and domove_attackmon_at() at 2794-2799, and only reaches test_move() at
    // 2843. So a monster on the destination claims the step whatever the
    // terrain rules below would have said about the square, and the diagonal
    // doorway arms never see it: uhitm.c do_attack() has no doorway test at
    // all, and test_move() runs after it.
    const destinationMonster = m_at(x, y, state);
    if (destinationMonster) {
        // domove_core()'s run arm stops in front of a monster the hero can
        // make out, without attacking it and without spending the move. That
        // arm is ported, so admit the command and let domove() run it; the
        // pet-displacement seam below owns every other destination monster.
        if (runStopsBeforeMonster(destinationMonster, run, state)) return;
        // Note that this admits steps test_move() then declines, which is the
        // point: uhitm.c:474 evaluates `foo = (Punished || !rn2(7) || ...)`
        // inside do_attack()'s is_safemon branch, so a pet displacement off an
        // intact doorway spends that draw before test_move()'s exit rule
        // refuses the step and no time elapses.
        //
        // The swap-consequence gates inside requireOrdinaryStartingPetSwap()
        // are therefore wider than C on such a step: C declines it at
        // test_move() without ever consulting them, where this seam refuses a
        // trap, object, region or engraving on the destination first. Both
        // stop the port; the seam simply stops it one call earlier.
        requireSupportedDestinationMonster(destinationMonster, x, y, state);
    } else if (state.context?.forcefight) {
        // C ref: domove_core():2805-2810. A force-fight step at a square with
        // no monster on it is answered by domove_fight_ironbars(),
        // domove_fight_web() and domove_fight_empty(), all three of them above
        // the u.utrap block at 2830 and above test_move() at 2843, so none of
        // the arms below can decide it. The three fight functions carry their
        // own refusals inside domove(); this arm is here to let them.
    } else if (heldStepIgnoresDestination(state)) {
        // The step never reaches the terrain rules at all, so this seam must
        // not consult them either. See heldStepIgnoresDestination() above.
        // avoid_trap_andor_region() is the exception C makes, and the only
        // one: it runs above the u.utrap block.
        requireHeldStepDestination(x, y, state);
    } else if (refusedDiagonalDoorway(x, y, state)) {
        // test_move() owns both diagonal doorway refusals on an empty square.
    } else if (closed_door(x, y, state)) {
        // test_move() owns the source-order closed-door arm, including its
        // pass-wall, ooze, tunnel, autoopen, bump, and TEST_TRAV/TEST_TRAP
        // branches. Admit the command so it can make the source-order choice.
    } else if (sobj_at(BOULDER, x, y, state)) {
        // test_move() owns the boulder run, travel, chew, and push branches.
    } else if (!blocksMove(x, y, state)) {
        requireSimpleHeroDestination(x, y, state, true);
    }
}

// Each pline() test_move() reaches is injected rather than imported, so a test
// can read the line without a terminal. Resolving through one helper turns a
// missing or misspelled operation into a failure instead of a silent no-op.
function requiredMessageOperation(env, arm) {
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError(`${arm} requires a message operation`);
    return message;
}

// C ref: hack.c could_move_onto_boulder() (144-162), "can hero move onto a
// spot containing one or more boulders?". C reads u.dx and u.dy for the giant
// arm's diagonal squeeze; both are parameters here, because the command
// admission seam asks this question before cmd.c set_move_cmd() writes them.
//
// squeezeablylightinvent() (139-140) is inlined as its own two terms.
function could_move_onto_boulder(sx, sy, dx, dy, state) {
    const u = state.u;
    /* can if able to phaze through rock (must be poly'd, so not riding) */
    if (propertyPresent(state, PASSES_WALLS)) return true;
    /* can't when riding */
    if (u.usteed) return false;
    /* can if a giant, unless doing so allows hero to pass into a
       diagonal squeeze at the same time */
    if (throws_rocks(state.youmonst?.data)) {
        return !dx || !dy
            || !(IS_OBSTRUCTED(state.level.at(u.ux, sy).typ)
                && IS_OBSTRUCTED(state.level.at(sx, u.uy).typ));
    }
    /* can if tiny (implies carrying very little else couldn't move at all) */
    if (verysmall(state.youmonst?.data)) return true;
    /* can squeeze to spot if carrying extremely little, otherwise can't */
    return !state.invent || inv_weight(state) <= WT_SQUEEZABLE_INV * -1;
}

// remove_object() and place_object() reach vision.c recalc_block_point() and
// block_point() through the object lifecycle's hook table rather than by
// importing them, so that js/obj.js needs no import from js/vision.js. A
// boulder is the only object type that asks for either.
function boulderVisionEnv(state) {
    return {
        state,
        // Both hooks take the lifecycle env as their third argument, not a
        // state; passing block_point itself would hand vision_reset() an
        // object with no `level` on it, which it answers by doing nothing.
        hooks: {
            blockPoint: (x, y, env) => block_point(x, y, env.state),
            recalcBlockPoint:
                (x, y, env) => recalc_block_point(x, y, env.state),
        },
    };
}

// C ref: hack.c cannot_push_msg() (247-256). This is the ordinary unmounted
// arm: name the boulder, report the failed push, and feel its square only when
// blind. The mounted result-producing arm remains an explicit boundary.
async function cannot_push_msg(otmp, sx, sy, state, env) {
    const what = the(xnameFresh(otmp, state), state);
    if (state.u.usteed) {
        throw new UnsupportedHeroMoveBoundaryError(
            'mounted boulder push failure',
        );
    }
    const message = requiredMessageOperation(env, 'failed boulder push');
    await message(`You try to move ${what}, but in vain.`, state);
    if (heroIsBlind(state)) feel_location(sx, sy, state);
}

// C ref: hack.c cannot_push() (262-310). The selected normal-sized, unmounted
// hero is not a giant and cannot squeeze onto the boulder square, so C returns
// -1 without a message, movement, or randomness. Other result-producing arms
// remain deferred with the boundaries that predate this slice.
function cannot_push(otmp, sx, sy, state) {
    if (throws_rocks(state.youmonst?.data)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'giant boulder push failure',
        );
    }
    if (could_move_onto_boulder(
        sx, sy, state.u.dx, state.u.dy, state,
    )) {
        throw new UnsupportedHeroMoveBoundaryError(
            'boulder squeeze after failed push',
        );
    }
    return -1;
}

// C ref: hack.c rock_disappear_msg() (315-324).
export async function rock_disappear_msg(otmp, state = game) {
    const objectName = the(xnameFresh(otmp, state), state);
    if (state.u.usteed) {
        const steed = upstart(y_monnam(state.u.usteed, state));
        await ttyPline(
            `${steed} pushes ${objectName} and suddenly it disappears!`, state,
        );
    } else {
        await ttyPline(
            `You push ${objectName} and suddenly it disappears!`, state,
        );
    }
}

function reset_digging(state) {
    state.context.digging = {
        down: false,
        chew: false,
        warned: false,
        pos: { x: 0, y: 0 },
        level: { dnum: 0, dlevel: 0 },
        effort: 0,
    };
    return state.context.digging;
}

// C ref: hack.c still_chewing() (647-822).
export async function still_chewing(x, y, state = game) {
    const lev = state.level.at(x, y);
    let boulder = sobj_at(BOULDER, x, y, state);
    let digtxt = null;
    let dmgtxt = null;
    let digging = state.context.digging ?? reset_digging(state);
    if (digging.down) digging = reset_digging(state);

    if (!boulder && ((IS_OBSTRUCTED(lev.typ) && !may_dig(x, y, state))
        || (lev.typ === IRONBARS && (lev.wall_info & W_NONDIGGABLE)))) {
        const what = lev.typ === IRONBARS ? 'bars'
            : IS_TREE(lev.typ) ? 'tree' : 'hard stone';
        await ttyPline(`You hurt your teeth on the ${what}.`, state);
        nomul(0, state);
        return 1;
    }
    if (lev.typ === IRONBARS && metallivorous(state.youmonst.data)
        && state.u.uhunger > 1500) {
        await ttyPline('You are too full to eat the bars.', state);
        nomul(0, state);
        return 1;
    }
    if (!digging.chew || digging.pos?.x !== x || digging.pos?.y !== y
        || !on_level(digging.level, state.u.uz)) {
        digging.down = false;
        digging.chew = true;
        digging.warned = false;
        digging.pos = { x, y };
        digging.level ??= {};
        assign_level(digging.level, state.u.uz);
        digging.effort = (IS_OBSTRUCTED(lev.typ) && !IS_TREE(lev.typ)
            ? 30 : 60) + Math.trunc(state.u.udaminc ?? 0);
        const prep = boulder || IS_TREE(lev.typ) || lev.typ === IRONBARS
            ? 'on a' : 'a hole in the';
        const target = boulder ? 'boulder'
            : IS_TREE(lev.typ) ? 'tree'
                : IS_OBSTRUCTED(lev.typ) ? 'rock'
                    : lev.typ === IRONBARS ? 'bar' : 'door';
        await ttyPline(`You start chewing ${prep} ${target}.`, state);
        note_unported('mon.c watch_dig');
        return 1;
    }
    digging.effort += 30 + Math.trunc(state.u.udaminc ?? 0);
    if (digging.effort <= 100) {
        if (state.flags?.verbose) {
            const target = boulder ? 'boulder'
                : IS_TREE(lev.typ) ? 'tree'
                    : IS_OBSTRUCTED(lev.typ) ? 'rock'
                        : lev.typ === IRONBARS ? 'bars' : 'door';
            await ttyPline(`You continue chewing on the ${target}.`, state);
        }
        digging.chew = true;
        note_unported('mon.c watch_dig');
        return 1;
    }

    state.u.uconduct ??= {};
    if (!(state.u.uconduct.food ?? 0))
        note_unported('pline.c livelog_printf');
    state.u.uconduct.food = Math.trunc(state.u.uconduct.food ?? 0) + 1;
    state.u.uhunger += rnd(20);

    if (boulder) {
        delobj(boulder, { state });
        await ttyPline('You eat the boulder.', state);
        boulder = sobj_at(BOULDER, x, y, state);
        if (IS_OBSTRUCTED(lev.typ) || closed_door(x, y, state) || boulder) {
            block_point(x, y, state);
            reset_digging(state);
            return 1;
        }
    } else if (IS_WALL(lev.typ)) {
        if (in_rooms(x, y, SHOPBASE, state)[0]) {
            note_unported('shk.c add_damage');
            dmgtxt = 'damage';
        }
        digtxt = 'You chew a hole in the wall.';
        if (state.level.flags?.is_maze_lev) lev.typ = ROOM;
        else if (state.level.flags?.is_cavernous_lev
            && !in_town(x, y, state)) lev.typ = CORR;
        else {
            lev.typ = DOOR;
            lev.doormask = D_NODOOR;
            lev.flags = D_NODOOR;
        }
    } else if (IS_TREE(lev.typ)) {
        digtxt = 'You chew through the tree.';
        lev.typ = ROOM;
    } else if (lev.typ === IRONBARS) {
        if (metallivorous(state.youmonst.data))
            note_unported('eat.c morehungry');
        digtxt = u_at(x, y, state)
            ? 'You devour the iron bars.' : 'You eat through the bars.';
        note_unported('trap.c dissolve_bars');
    } else if (lev.typ === SDOOR) {
        if ((lev.doormask ?? lev.flags ?? 0) & D_TRAPPED) {
            lev.doormask = D_NODOOR;
            lev.flags = D_NODOOR;
            note_unported('trap.c b_trapped');
        } else {
            digtxt = 'You chew through the secret door.';
            lev.doormask = D_BROKEN;
            lev.flags = D_BROKEN;
        }
        lev.typ = DOOR;
    } else if (IS_DOOR(lev.typ)) {
        if (in_rooms(x, y, SHOPBASE, state)[0]) {
            note_unported('shk.c add_damage');
            dmgtxt = 'break';
        }
        if ((lev.doormask ?? lev.flags ?? 0) & D_TRAPPED) {
            lev.doormask = D_NODOOR;
            lev.flags = D_NODOOR;
            note_unported('trap.c b_trapped');
        } else {
            digtxt = 'You chew through the door.';
            lev.doormask = D_BROKEN;
            lev.flags = D_BROKEN;
        }
    } else {
        digtxt = 'You chew a passage through the rock.';
        lev.typ = CORR;
    }

    recalc_block_point(x, y, state);
    newsym(x, y);
    if (digtxt) await ttyPline(digtxt, state);
    if (dmgtxt) note_unported('shk.c pay_for_damage');
    reset_digging(state);
    return 0;
}

// C ref: hack.c movobj() (824-833). Unlink the object, tell the square it
// left, relink it, tell the square it landed on.
//
// maybe_unhide_at() uncovers a monster or the hero that was hiding under the
// object and throws for either. It cannot fire on the push path: moverock()'s
// callers reach it only with no monster on the boulder's square, and the hero
// is still one square back when the boulder leaves.
export function movobj(obj, ox, oy, state = game) {
    /* optimize by leaving on the fobj chain? */
    remove_object(obj, boulderVisionEnv(state));
    maybe_unhide_at(obj.ox, obj.oy, state);
    newsym(obj.ox, obj.oy);
    place_object(obj, ox, oy, boulderVisionEnv(state));
    newsym(ox, oy);
}

function maybe_half_phys(damage, state) {
    return propertyPresent(state, HALF_PHDAM)
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: hack.c dosinkfall() (836-922). Equipment callbacks that remove
// levitation rings or boots are still owned by unported do_wear.c arms; those
// discarded calls are recorded while this function preserves hack.c's own
// property-mask and fall-damage updates.
export async function dosinkfall(state = game) {
    const u = state.u;
    const levitation = u.uprops[LEVITATION];
    const flying = u.uprops[FLYING];
    const levBoots = state.uarmf?.otyp === LEVITATION_BOOTS;
    const innateLev = Boolean(levitation.intrinsic
        & (FROMOUTSIDE | FROMFORM));
    const blockedLev = levitation.blocked === I_SPECIAL;
    const ufall = !innateLev && !blockedLev
        && !(flying.intrinsic || flying.extrinsic);

    if (!ufall) {
        await ttyPline(innateLev || blockedLev
            ? 'You wobble unsteadily for a moment.'
            : 'You gain control of your flight.', state);
    } else {
        const saveExtrinsic = levitation.extrinsic;
        const saveIntrinsic = levitation.intrinsic;
        levitation.extrinsic = 0;
        levitation.intrinsic = 0;
        await ttyPline('You crash to the floor!', state);
        const damage = rn1(8, 25 - acurr(state, A_CON));
        await losehp(
            maybe_half_phys(damage, state),
            'fell onto a sink', NO_KILLER_PREFIX, state,
        );
        await exercise(A_DEX, false, state);
        note_unported('polyself.c selftouch');
        for (let obj = state.level?.objects?.[u.ux]?.[u.uy] ?? null;
            obj;
            obj = obj.nexthere) {
            if (obj.oclass !== WEAPON_CLASS && !is_weptool(obj, state))
                continue;
            await ttyPline(`You fell on ${donameFresh(obj, state)}.`, state);
            await losehp(
                maybe_half_phys(rnd(3), state),
                'fell onto a sink', NO_KILLER_PREFIX, state,
            );
            await exercise(A_CON, false, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
        }
        levitation.extrinsic = saveExtrinsic;
        levitation.intrinsic = saveIntrinsic;
    }

    if (ufall || levBoots) note_unported('do_wear.c stop_donning');
    levitation.extrinsic &= ~W_ARTI;
    levitation.intrinsic &= ~(I_SPECIAL | TIMEOUT);
    levitation.intrinsic++;
    if (state.uleft?.otyp === RIN_LEVITATION) {
        note_unported('do_wear.c Ring_off');
        note_unported('do_wear.c off_msg');
    }
    if (state.uright?.otyp === RIN_LEVITATION) {
        note_unported('do_wear.c Ring_off');
        note_unported('do_wear.c off_msg');
    }
    if (levBoots) {
        note_unported('do_wear.c Boots_off');
        note_unported('do_wear.c off_msg');
    }
    levitation.intrinsic--;
    float_vs_flight(state);
}

// C ref: hack.c dopush() (165-241). The feedback is throttled by two globals
// rather than by Norep(): gb.bldrpush_oid remembers which boulder was pushed
// last and gb.bldrpushtime the turn it was announced, so a run of pushes
// against the same boulder says nothing after the first while still exercising
// Strength and moving the rock. decl.c:224-225 starts both at 0.
async function dopush(sx, sy, rx, ry, otmp, state, env) {
    env ??= {};
    state.gb ??= {};
    const moves = Math.trunc(state.moves ?? 0);
    /* give boulder pushing feedback if this is a different
       boulder than the last one pushed or if it's been at
       least 2 turns since we last pushed this boulder;
       unlike with Norep(), intervening messages don't cause
       it to repeat, only doing something else in the meantime */
    if (otmp.o_id !== (state.gb.bldrpush_oid ?? 0)) {
        state.gb.bldrpushtime = moves + 1;
        state.gb.bldrpush_oid = otmp.o_id;
    }
    const bldrpushtime = Math.trunc(state.gb.bldrpushtime ?? 0);
    const givemesg = moves > bldrpushtime + 2 || moves < bldrpushtime;
    // 188. C evaluates the(xname(otmp)) only when it is about to print, and
    // xname() is not a passive read: it observes the object and clears
    // next_boulder (objnam.c:814-823, js/objnam.js:437-438), so naming a
    // boulder whose push says nothing would diverge.
    const what = givemesg ? the(xnameFresh(otmp, state), state) : null;
    const easypush = throws_rocks(state.youmonst?.data);
    const message = requiredMessageOperation(env, 'boulder push');
    if (state.u.usteed) {
        if (givemesg) {
            await message(
                `${upstart(y_monnam(state.u.usteed, state))} moves ${what}.`,
                state,
            );
        }
    } else {
        if (givemesg) {
            await message(
                `With ${easypush ? 'little' : 'great'} effort you move ${what}.`,
                state,
            );
        }
        if (!easypush) {
            await exercise(A_STR, true, state, env.random ?? { rn2 }, {
                encumberMessage: env.encumberMessage ?? encumber_msg,
            });
        }
    }
    state.gb.bldrpushtime = moves;

    /* Move the boulder *after* the message. */
    // 206-207. unmap_object() has its own explicit map-memory boundary when
    // the remembered square also contains an unsupported engraving/sensed
    // monster; the call itself remains in source order.
    if (glyph_is_invisible(glyph_at(rx, ry, state)))
        unmap_object(rx, ry, state);
    otmp.next_boulder = 0;
    movobj(otmp, rx, ry, state); /* does newsym(rx,ry) */
    // 210-215.
    if (heroIsBlind(state)) {
        // The local display port currently exposes feel_location() only for
        // adjacent squares; C also asks it to feel the boulder's two-step
        // destination here. Keep the source call's gap explicit while still
        // preserving the adjacent-square memory update.
        note_unported('display.c feel_location boulder destination');
        feel_location(sx, sy, state);
    } else {
        newsym(sx, sy);
    }
    // 217-240. These calls have no return value, so they are recorded as
    // allowed gaps until the shop billing owner lands.
    if (env.costly && !costly_spot(rx, ry, state)) {
        note_unported('shk.c addtobill');
    } else if (!env.costly && costly_spot(rx, ry, state) && otmp.unpaid) {
        note_unported('shk.c onshopbill/subfrombill');
    } else if (otmp.unpaid) {
        note_unported('shk.c find_objowner/stolen_value');
    }
}

// C ref: hack.c moverock_done() (326-333). xname() formats the second and
// later boulders of one square as "next boulder"; this puts every boulder
// still standing at <sx,sy> back to its ordinary name.
function moverock_done(sx, sy, state) {
    for (let otmp = state.level?.objects?.[sx]?.[sy] ?? null;
        otmp;
        otmp = otmp.nexthere) {
        if (otmp.otyp === BOULDER) otmp.next_boulder = 0;
    }
}

// C ref: hack.c moverock() (335-345). u.dx and u.dy are read here as C reads
// them, because test_move() runs after cmd.c set_move_cmd() has written them.
async function moverock(state, env) {
    const sx = state.u.ux + state.u.dx; /* boulder starting position */
    const sy = state.u.uy + state.u.dy;
    const ret = await moverock_core(sx, sy, state, env);
    moverock_done(sx, sy, state);
    return ret;
}

// C ref: hack.c moverock_core() (347-638). Its while loop walks every boulder
// on <sx,sy>. The source-order trap, pool/lava, shop, and several special
// mobility branches remain partial; their return-valued result is therefore
// not completion evidence for test_move().
//
// The return value is C's: 0 lets the hero advance onto <sx,sy>, -1 refuses
// the step. The selected failed-destination arm returns -1 after its message.
async function moverock_core(sx, sy, state, env) {
    const u = state.u;
    let firstboulder = true;
    let otmp;

    while ((otmp = sobj_at(BOULDER, sx, sy, state)) !== null) {
        // 355-363. C identifies an unseen boulder by its remembered glyph,
        // then maps the live object before refusing the push.
        if (heroIsBlind(state)
            && glyph_to_obj(glyph_at(sx, sy, state)) !== BOULDER) {
            const message = requiredMessageOperation(
                env, 'unseen boulder feedback',
            );
            await message('That feels like a boulder.', state);
            map_object(otmp, true, state);
            nomul(0, state);
            return -1;
        }

        /* when otmp->next_boulder is 1, xname() will format it as
           "next boulder" instead of just "boulder" */
        otmp.next_boulder = firstboulder ? 0 : 1;
        firstboulder = false;

        /* make sure that this boulder is visible as the top object */
        if (otmp !== state.level.objects[sx][sy]) movobj(otmp, sx, sy, state);

        const rx = u.ux + 2 * u.dx; /* boulder destination position */
        const ry = u.uy + 2 * u.dy;
        nomul(0, state);

        // 384-410. The 'm' prefix steps onto or squeezes past a boulder;
        // moverock_core() has not ported sokoban_guilt() and its companion
        // state writes, so keep this return-valued branch explicit.
        if (state.context?.nopick) {
            throw new UnsupportedHeroMoveBoundaryError(
                'a boulder step without a push',
            );
        }
        // 412-421. Levitation and the air level have distinct source feedback
        // and are not interchangeable with the ordinary push transaction.
        if (propertyActiveUnblocked(state, LEVITATION)
            || Is_airlevel(state.u?.uz)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'a boulder push without leverage',
            );
        }
        // 422-427. The tiny-hero message and return are owned by this C
        // function, but their successful squeeze path is not yet ported.
        if (verysmall(state.youmonst?.data) && !u.usteed) {
            throw new UnsupportedHeroMoveBoundaryError(
                'a boulder push by a tiny hero',
            );
        }
        const destination = isok(rx, ry) ? state.level?.at(rx, ry) : null;
        if (!destination
            || IS_OBSTRUCTED(destination.typ)
            || destination.typ === IRONBARS
            || (IS_DOOR(destination.typ) && u.dx && u.dy
                && !doorless_door(destination, state))
            || sobj_at(BOULDER, rx, ry, state)) {
            // hack.c:486-487. nomul(0) and next_boulder bookkeeping precede
            // this failed-destination check. No trap, monster, or push-side
            // effect is reached when the boulder's destination is blocked.
            await cannot_push_msg(otmp, sx, sy, state, env);
            return cannot_push(otmp, sx, sy, state);
        }

        const ttmp = t_at(rx, ry, state);

        // 437-443. Sokoban's diagonal rule is local to moverock_core(); the
        // result of cannot_push() remains the source return value.
        if (In_sokoban(state.u?.uz) && u.dx && u.dy) {
            if (heroIsBlind(state)) feel_location(sx, sy, state);
            const message = requiredMessageOperation(
                env, 'diagonal Sokoban boulder push',
            );
            await message(
                `${The(xnameFresh(otmp, state), state)} won't roll diagonally `
                + `on this ${surface(sx, sy, state)}.`,
                state,
            );
            return cannot_push(otmp, sx, sy, state);
        }
        if (await revive_nasty(
            rx, ry, 'You sense movement on the other side.', state,
        )) return -1;
        const mtmp = m_at(rx, ry, state);

        // 455-483, a corporeal monster standing where the boulder would land,
        // unless it is already trapped in the pit under it. C reports the
        // monster, then gives the push up through cannot_push().
        if (mtmp && !noncorporeal(mtmp.data)
            && (!mtmp.mtrapped || !(ttmp && is_pit(ttmp.ttyp)))) {
            let deliver_part1 = false;
            const message = requiredMessageOperation(
                env, 'monster behind the boulder',
            );

            // 459-460, the Blind arm, remains a source-backed map-memory gap.
            if (canSpotMonster(mtmp, state)) {
                await message(
                    `There's ${a_monnam(mtmp, { state })} on the other side.`,
                    state,
                );
                deliver_part1 = true;
            } else {
                // Soundeffect() is a no-op without a sound library, which the
                // tty build this port matches is.
                //
                // C evaluates the(xname(otmp)) as You_hear()'s argument, so
                // xname() observes the boulder even when a deaf hero prints
                // nothing; keep the call outside the printing test.
                const heard = the(xnameFresh(otmp, state), state);
                const line = youHear(`a monster behind ${heard}.`, state);
                if (line !== null) await message(line, state);
                if (!heroIsDeaf(state)) deliver_part1 = true;
                map_invisible(rx, ry, state);
            }
            if (state.flags?.verbose) {
                // 474-475. C names the steed when mounted; dopush() below
                // carries the same distinction for a successful push.
                const you_or_steed = state.u.usteed
                    ? upstart(y_monnam(state.u.usteed, state)) : 'you';
                const who = deliver_part1
                    ? you_or_steed : upstart(you_or_steed);
                const what = deliver_part1
                    ? 'it' : the(xnameFresh(otmp, state), state);
                await message(
                    `${deliver_part1 ? "Perhaps that's why " : ''}`
                    + `${who} cannot move ${what}.`,
                    state,
                );
            }
            return cannot_push(otmp, sx, sy, state);
        }

        // 485-488. A closed destination door blocks the push after the
        // monster check, including the orthogonal case omitted by the
        // destination-shape conjunction above.
        if (closed_door(rx, ry, state)) {
            await cannot_push_msg(otmp, sx, sy, state, env);
            return cannot_push(otmp, sx, sy, state);
        }

        // 496-618 and 620-621 are return-valued effects. The local trap and
        // liquid owners are not complete, so do not silently move a boulder
        // through them or claim test_move() completion.
        if (ttmp) {
            throw new UnsupportedHeroMoveBoundaryError(
                'hack.c moverock_core boulder trap effect',
            );
        }
        if (is_pool_or_lava(rx, ry, state)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'do.c boulder_hits_pool',
            );
        }

        /* rumbling disturbs buried zombies */
        disturb_buried_zombies(sx, sy, state);

        /*
         * Re-link at top of fobj chain so that pile order is preserved
         * when level is restored.
         */
        if (otmp !== state.level.objlist) {
            remove_object(otmp, boulderVisionEnv(state));
            place_object(otmp, otmp.ox, otmp.oy, boulderVisionEnv(state));
        }
        const costly = Boolean(
            costly_spot(sx, sy, state)
            && shop_keeper(in_rooms(sx, sy, SHOPBASE, state)[0] ?? 0, state),
        );
        await dopush(sx, sy, rx, ry, otmp, state, {
            ...env,
            costly,
        });
    }
    return 0;
}

// C ref: hack.c test_move() (991-1265). This is the source-order movement
// admission implementation. Its callers are domove_core() for DO_MOVE, the
// steed landing checks and monster knockback for TEST_MOVE, and the
// travel/trap probes for TEST_TRAV and TEST_TRAP. Calls whose return values C
// discards are recorded at the call site; return-valued dependencies remain
// explicit boundaries in their owning source files, so this is not completion
// evidence for the whole function.
export async function test_move(
    ux,
    uy,
    dx,
    dy,
    mode,
    state = game,
    env = {},
) {
    state.context ??= {};
    state.context.door_opened = false;
    const x = ux + dx;
    const y = uy + dy;
    if (!isok(x, y)) return false;

    const location = state.level?.at?.(x, y);
    if (!location) return false;
    const species = state.youmonst?.data;
    const passesWalls = propertyPresent(state, PASSES_WALLS);
    const run = state.context.run ?? 0;
    const message = env.message ?? ttyPline;
    const chewBoulder = env.stillChewing
        ?? ((targetX, targetY) => still_chewing(targetX, targetY, state));
    const pushBoulder = env.moverock
        ?? (() => moverock(state, env));

    // hack.c:1011-1072, physical obstacles. The feel happens before every
    // branch, and the pass-wall and tunnelling forms deliberately fall through
    // instead of being treated as ordinary refusals.
    if (IS_OBSTRUCTED(location.typ) || location.typ === IRONBARS) {
        if (heroIsBlind(state) && mode === DO_MOVE)
            feel_location(x, y, state);
        if (passesWalls && may_passwall(x, y, state)) {
            // The source intentionally continues into the common checks.
        } else if (state.u?.uinwater) {
            if (mode === DO_MOVE)
                await message('There is an obstacle there.', state);
            return false;
        } else if (location.typ === IRONBARS) {
            if (mode === DO_MOVE
                && (dmgtype(species, AD_RUST)
                    || dmgtype(species, AD_CORR)
                    || metallivorous(species))
                && await still_chewing(x, y, state)) {
                return false;
            }
            if (!(passesWalls || passes_bars(species))) {
                if (mode === DO_MOVE && state.flags?.mention_walls)
                    await message('You cannot pass through the bars.', state);
                return false;
            }
        } else if (tunnels(species) && !needspick(species)) {
            if (mode === DO_MOVE && await still_chewing(x, y, state))
                return false;
        } else if (state.flags?.autodig && !run
            && !state.context?.nopick && state.uwep
            && is_pick(state.uwep, state)) {
            if (mode === DO_MOVE) note_unported('dig.c use_pick_axe2');
            return false;
        } else {
            if (mode === DO_MOVE) {
                if (is_db_wall(x, y, state)) {
                    await message('That drawbridge is up!', state);
                } else if (passesWalls && !may_passwall(x, y, state)
                    && In_sokoban(state.u?.uz)) {
                    await message('The Sokoban walls resist your ability.', state);
                } else if (state.flags?.mention_walls) {
                    const glyph = back_to_glyph(x, y, state);
                    const symbol = glyph_is_cmap(glyph)
                        ? glyph_to_cmap(glyph) : -1;
                    const description = symbol === S_stone
                        ? 'solid stone'
                        : symbol >= 0
                            ? an(CMAP_EXPLANATIONS[symbol])
                            : 'impossible [background glyph=' + glyph + ']';
                    await message(
                        messageAt("It's " + description + '.', x, y, state),
                        state,
                    );
                }
            }
            return false;
        }
    } else if (IS_DOOR(location.typ) && closed_door(x, y, state)) {
        // hack.c:1074-1137. TEST_TRAV and TEST_TRAP jump to testdiag;
        // TEST_MOVE and DO_MOVE return after this closed-door arm.
        if (heroIsBlind(state) && mode === DO_MOVE)
            feel_location(x, y, state);
        if (passesWalls) {
            // The source falls through to the common checks.
        } else if (can_ooze(state.youmonst, state)) {
            if (mode === DO_MOVE)
                await message('You ooze under the door.', state);
        } else if (state.u?.uinwater) {
            if (mode === DO_MOVE)
                await message('There is an obstacle there.', state);
            return false;
        } else if (tunnels(species) && !needspick(species)) {
            if (mode === DO_MOVE && await still_chewing(x, y, state))
                return false;
        } else {
            if (mode === DO_MOVE) {
                if (amorphous(species)) {
                    await message(
                        "You try to ooze under the door, but can't squeeze your possessions through.",
                        state,
                    );
                }
                if (state.flags?.autoopen && !run
                    && !propertyIntrinsic(state, CONFUSION)
                    && !propertyIntrinsic(state, STUNNED)
                    && !propertyPresent(state, FUMBLING)) {
                    const openEnv = { message };
                    if (env.random) openEnv.random = env.random;
                    const result = await doopen_indir(x, y, state, openEnv);
                    // cmdq_peek(CQ_CANNED) can contain a queued kick after
                    // doopen_indir(). That lock.c AUTOUNLOCK_KICK arm remains
                    // an owning-file dependency and throws there when reached;
                    // ordinary open/locked-door results use this source arm.
                    const queued = cmdq_peek(CQ_CANNED, state);
                    const queuedKick = result === ECMD_OK
                        && queued?.typ === CMDQ_EXTCMD
                        && queued.ec_entry?.ef_funct === 'dokick';
                    state.context.door_opened = queuedKick
                        || !closed_door(x, y, state);
                    state.context.move = (ux !== state.u.ux || uy !== state.u.uy)
                        ? 1 : 0;
                } else if (x === ux || y === uy) {
                    if (heroIsBlind(state)
                        || propertyIntrinsic(state, STUNNED)
                        || acurr(state, A_DEX) < 10
                        || propertyPresent(state, FUMBLING)) {
                        if (state.u.usteed) {
                            await message(
                                "You can't lead "
                                + upstart(y_monnam(state.u.usteed, state))
                                + ' through that closed door.',
                                state,
                            );
                        } else {
                            await message('Ouch!  You bump into a door.', state);
                            await exercise(
                                A_DEX,
                                false,
                                state,
                                env.random ?? { rn2 },
                            );
                        }
                        state.context.door_opened = true;
                        state.context.move = 1;
                        nomul(0, state);
                    } else {
                        await message('That door is closed.', state);
                    }
                }
            } else if (mode !== TEST_TRAV && mode !== TEST_TRAP) {
                return false;
            }
            // C: the TEST_TRAV/TEST_TRAP arms jump to testdiag from the
            // closed-door branch.  That label still rejects a diagonal move
            // through the intact doorway; it is not only the non-closed-door
            // arm below.
            if ((mode === TEST_TRAV || mode === TEST_TRAP)
                && dx && dy && !passesWalls
                && (!doorless_door(location, state)
                    || await block_door(x, y, state, { message }))) {
                return false;
            }
            if (mode === DO_MOVE) return false;
        }
    } else if (IS_DOOR(location.typ)) {
        // hack.c:1138-1151, the testdiag label for a non-closed door.
        if (dx && dy && !passesWalls
            && (!doorless_door(location, state)
                || await block_door(x, y, state, { message }))) {
            if (mode === DO_MOVE) {
                if (heroIsBlind(state)) feel_location(x, y, state);
                if (state.u?.uinwater || state.flags?.mention_walls) {
                    await message(
                        "You can't move diagonally into an intact doorway.",
                        state,
                    );
                }
            }
            return false;
        }
    }

    // hack.c:1153-1177, tight diagonal passage and worm crossing.
    if (dx && dy && bad_rock(species, ux, y, state)
        && bad_rock(species, x, uy, state)) {
        switch (cant_squeeze_thru(state.youmonst, state)) {
        case 3:
            if (mode === DO_MOVE)
                await message('You cannot pass that way.', state);
            return false;
        case 2:
            if (mode === DO_MOVE)
                await message('You are carrying too much to get through.', state);
            return false;
        case 1:
            if (mode === DO_MOVE)
                await message('Your body is too large to fit through.', state);
            return false;
        default:
            break;
        }
    } else if (dx && dy && await wormCross(ux, uy, x, y, state)) {
        if (mode === DO_MOVE) {
            const worm = m_at(ux, y, state);
            await message(
                upstart(y_monnam(worm, state)) + ' is in your way.', state,
            );
        }
        return false;
    }

    // hack.c:1181-1203, travel's remembered-trap and known-liquid filter.
    if (run === 8 && mode !== DO_MOVE && !u_at(x, y, state)) {
        const trap = t_at(x, y, state);
        if (trap && trap.tseen && trap.ttyp !== VIBRATING_SQUARE)
            return mode === TEST_TRAP;
        const seen = Boolean(location.seenv);
        const knownLiquid = seen && is_pool_or_lava(x, y, state);
        const inAir = propertyActiveUnblocked(state, LEVITATION)
            || heroIsFlying(state);
        const safeLiquid = is_pool(x, y, state)
            ? known_wwalking(state)
            : known_lwalking(state)
                && is_lava(state.u.ux, state.u.uy, state);
        if (knownLiquid
            && ((IS_WATERWALL(location.typ) || location.typ === LAVAWALL)
                || !(inAir || safeLiquid))) {
            return mode === TEST_TRAP;
        }
    }
    if (mode === TEST_TRAP) return false;

    // hack.c:1205-1214, the intact doorway at the square being left.
    const source = state.level?.at(ux, uy);
    if (dx && dy && !passesWalls && IS_DOOR(source?.typ)
        && (!doorless_door(source, state)
            || await block_entry(x, y, state, { message }))) {
        if (mode === DO_MOVE && state.flags?.mention_walls) {
            await message(
                "You can't move diagonally out of an intact doorway.", state,
            );
        }
        return false;
    }

    // hack.c:1216-1252, boulders. moverock() is the source owner of the
    // return-valued push transaction; its unsupported trap/liquid/pile arms
    // remain named in hack.js rather than being replaced with a guessed result.
    if (sobj_at(BOULDER, x, y, state)
        && (In_sokoban(state.u?.uz) || !passesWalls)) {
        if (mode !== TEST_TRAV && run >= 2
            && !(heroIsBlind(state) || heroHallucinating(state))
            && !could_move_onto_boulder(
                x,
                y,
                state.u.dx ?? dx,
                state.u.dy ?? dy,
                state,
            )) {
            if (mode === DO_MOVE && state.flags?.mention_walls) {
                await message(
                    messageAt('A boulder blocks your path.', x, y, state),
                    state,
                );
            }
            return false;
        }
        if (mode === TEST_TRAV) {
            if (In_sokoban(state.u?.uz)) return false;
            if (sobj_at(BOULDER, ux, uy, state)
                && !passesWalls
                && !could_move_onto_boulder(
                    ux,
                    uy,
                    state.u.dx ?? dx,
                    state.u.dy ?? dy,
                    state,
                )
                && !(tunnels(species) && !needspick(species))
                && !carrying(PICK_AXE, state)
                && !carrying(DWARVISH_MATTOCK, state)) {
                const diggingWand = carrying(WAN_DIGGING, state);
                if (!diggingWand
                    || !objectType(diggingWand, state).oc_name_known) {
                    return false;
                }
            }
        }
        if (mode === DO_MOVE) {
            if (tunnels(species) && !needspick(species)
                && !In_sokoban(state.u?.uz)) {
                if (await chewBoulder(x, y)) return false;
            } else if (await pushBoulder() < 0) {
                return false;
            }
        }
    }
    return true;
}

// C ref: hack.c crawl_destination() (4079-4099). Travel's adjacent fast path
// uses the ordinary hero placement test, then applies the extra diagonal
// restrictions that crawling out of water uses. The current travel boundary
// reaches ordinary D:1 floors and stairs; the terrain and special-mobility
// branches below are represented by the same local movement predicates so a
// non-ordinary candidate is rejected rather than silently admitted.
export function crawl_destination(x, y, state = game) {
    if (!isok(x, y)) return false;
    const destination = state.level?.at(x, y);
    if (!destination || !accessible(x, y, state)
        || m_at(x, y, state)
        || sobj_at(BOULDER, x, y, state)) {
        return false;
    }

    /* orthogonal movement is unrestricted when destination is ok */
    if (x === state.u.ux || y === state.u.uy) return true;
    if (NODIAG(state.u.umonnum)) return false;
    if (propertyPresent(state, PASSES_WALLS)) return true;
    if (IS_DOOR(destination.typ)
        && blocksDiagonalDoorwayEntry(state.u.ux, state.u.uy, x, y, state)) {
        return false;
    }
    return !(bad_rock(state.youmonst?.data, state.u.ux, y, state)
        && bad_rock(state.youmonst?.data, x, state.u.uy, state)
        && cant_squeeze_thru(state.youmonst, state));
}

function travelMapIndex(x, y) {
    return y * COLNO + x;
}

function travelMapGet(state, x, y) {
    return state.travelmap instanceof Uint8Array
        && state.travelmap[travelMapIndex(x, y)] !== 0;
}

function travelMapSet(state, x, y) {
    if (state.travelmap instanceof Uint8Array)
        state.travelmap[travelMapIndex(x, y)] = 1;
}

function travelSquareVisible(x, y, state) {
    const location = state.level?.at(x, y);
    return Boolean(location?.seenv
        || (!heroIsBlind(state) && couldsee(x, y, state)));
}

    // C ref: hack.c findtravelpath() (1266-1459). TRAVP_TRAVEL grows a
    // shortest path backwards from the selected destination; TRAVP_VALID
    // reverses the endpoints while checking a proposed destination.
// Its frontier order is source-defined: cardinal directions first in W, N,
// E, S order, then NW, NE, SE, SW. That order is observable when two paths
// have the same length, so it is kept explicitly instead of relying on a
// generic path-finding helper.
export async function findtravelpath(mode = TRAVP_TRAVEL, state = game) {
    if (mode !== TRAVP_TRAVEL && mode !== TRAVP_VALID) {
        throw new UnsupportedHeroMoveBoundaryError(
            'non-ordinary travel path selection',
        );
    }

    if (!state.travelmap)
        state.travelmap = new Uint8Array(COLNO * ROWNO);

    // C ref: hack.c:1271-1290. A one-step target is handed back to normal
    // movement, after which end_running() has already disposed of travel-map
    // state and the caller continues through domove_core().
    if (state.context.travel1
        && dist2(state.u.ux, state.u.uy, state.u.tx, state.u.ty) <= 2
        && crawl_destination(state.u.tx, state.u.ty, state)) {
        end_running(false, state);
        if (await test_move(
            state.u.ux,
            state.u.uy,
            state.u.tx - state.u.ux,
            state.u.ty - state.u.uy,
            TEST_MOVE,
            state,
        )) {
            if (mode === TRAVP_TRAVEL) {
                state.u.dx = state.u.tx - state.u.ux;
                state.u.dy = state.u.ty - state.u.uy;
                nomul(0, state);
                state.iflags.travelcc.x = 0;
                state.iflags.travelcc.y = 0;
            }
            return true;
        }
        if (mode === TRAVP_TRAVEL) state.context.run = 8;
    }

    if (state.u.tx === state.u.ux && state.u.ty === state.u.uy)
        return false;

    const validTarget = mode === TRAVP_VALID;
    const startX = validTarget ? state.u.ux : state.u.tx;
    const startY = validTarget ? state.u.uy : state.u.ty;
    const goalX = validTarget ? state.u.tx : state.u.ux;
    const goalY = validTarget ? state.u.ty : state.u.uy;
    const travel = new Uint16Array(COLNO * ROWNO);
    const travelStepX = [[], []];
    const travelStepY = [[], []];
    const directionOrder = [0, 2, 4, 6, 1, 3, 5, 7];
    let n = 1;
    let set = 0;
    let radius = 1;
    travelStepX[0][0] = startX;
    travelStepY[0][0] = startY;

    while (n !== 0) {
        let nn = 0;
        const currentX = travelStepX[set];
        const currentY = travelStepY[set];
        const nextX = travelStepX[1 - set];
        const nextY = travelStepY[1 - set];
        nextX.length = 0;
        nextY.length = 0;

        for (let i = 0; i < n; ++i) {
            const x = currentX[i];
            const y = currentY[i];
            const dirmax = NODIAG(state.u.umonnum) ? 4 : N_DIRS;
            let alreadyRepeated = false;

            for (let dir = 0; dir < dirmax; ++dir) {
                const direction = directionOrder[dir];
                const nx = x + xdir[direction];
                const ny = y + ydir[direction];
                if (!isok(nx, ny)) continue;

                const delayed = Boolean(
                    (!propertyPresent(state, PASSES_WALLS)
                        && !amorphous(state.youmonst?.data)
                        && closed_door(x, y, state))
                    || (sobj_at(BOULDER, x, y, state)
                        && !could_move_onto_boulder(x, y, 0, 0, state))
                    || await test_move(
                        x,
                        y,
                        nx - x,
                        ny - y,
                        TEST_TRAP,
                        state,
                    )
                );
                if (delayed) {
                    if (travel[travelMapIndex(x, y)] > radius - 3) {
                        if (!alreadyRepeated) {
                            nextX[nn] = x;
                            nextY[nn] = y;
                            ++nn;
                            alreadyRepeated = true;
                        }
                    }
                    continue;
                }

                if (await test_move(
                    x,
                    y,
                    nx - x,
                    ny - y,
                    TEST_TRAV,
                    state,
                ) && travelSquareVisible(nx, ny, state)) {
                    if (nx === goalX && ny === goalY) {
                        const visited = travelMapGet(state, x, y);
                        state.u.dx = x - goalX;
                        state.u.dy = y - goalY;
                        if (!validTarget
                            && ((x === state.u.tx && y === state.u.ty)
                                || visited)) {
                            nomul(0, state);
                            state.context.run = 8;
                            if (visited) {
                                await ttyPline(
                                    'You stop, unsure which way to go.',
                                    state,
                                );
                            } else {
                                state.iflags.travelcc.x = 0;
                                state.iflags.travelcc.y = 0;
                            }
                        }
                        travelMapSet(state, state.u.ux, state.u.uy);
                        return true;
                    }

                    if (!travel[travelMapIndex(nx, ny)]) {
                        nextX[nn] = nx;
                        nextY[nn] = ny;
                        travel[travelMapIndex(nx, ny)] = radius;
                        ++nn;
                    }
                }
            }
        }

        n = nn;
        set = 1 - set;
        radius += 1;
    }

    state.u.dx = 0;
    state.u.dy = 0;
    nomul(0, state);
    return false;
}

// C ref: hack.c is_valid_travelpt() (1526-1542). getpos.c uses this while
// describing a selected travel destination; it temporarily makes that square
// the travel target and asks the same backwards path search used by travel.
export async function is_valid_travelpt(x, y, state = game) {
    if (u_at(x, y, state)) return true;
    const location = state.level?.at(x, y);
    const glyph = glyph_at(x, y, state);
    if (isok(x, y)
        && glyph_is_cmap(glyph)
        && glyph_to_cmap(glyph) === S_stone
        && !location?.seenv) {
        return false;
    }
    const oldTarget = { x: state.u.tx, y: state.u.ty };
    state.u.tx = x;
    state.u.ty = y;
    try {
        return await findtravelpath(TRAVP_VALID, state);
    } finally {
        state.u.tx = oldTarget.x;
        state.u.ty = oldTarget.y;
    }
}

// C ref: hack.c notice_mon() (1708-1732). startup_a11y.js owns the exact
// visibility and naming calculation; hack.c owns the option gate and emit.
export async function notice_mon(mtmp, state = game, env = {}) {
    const line = collectMonsterNoticeMessage(mtmp, state);
    if (line) await (env.message ?? ttyPline)(line, state);
}

// C ref: hack.c notice_mons_cmp() (1735-1742).
export function notice_mons_cmp(left, right, state = game) {
    return dist2(left.mx, left.my, state.u.ux, state.u.uy)
        - dist2(right.mx, right.my, state.u.ux, state.u.uy);
}

// C ref: hack.c u_simple_floortyp() (1833-1848). This deliberately collapses
// every ordinary solid or airborne destination to ROOM.
export function u_simple_floortyp(x, y, state = game) {
    const typ = state.level?.at(x, y)?.typ;
    const inAir = propertyActiveUnblocked(state, LEVITATION)
        || heroIsFlying(state) || !grounded(state.youmonst?.data, state);
    if (IS_WATERWALL(typ)) return WATER;
    if (typ === LAVAWALL) return LAVAWALL;
    if (!inAir) {
        if (is_pool(x, y, state)) return POOL;
        if (is_lava(x, y, state)) return LAVAPOOL;
    }
    return ROOM;
}

const SWIM_DANGER_CONTINUE = 0;
const SWIM_DANGER_FORCE = 1;
const SWIM_DANGER_AVOID = 2;

// Pure classification of hack.c swim_move_danger() (1885-1922).  The command
// admission seam uses only SWIM_DANGER_AVOID, the one result which guarantees
// that domove_core() returns before moving the hero.  SWIM_DANGER_FORCE is the
// m-prefix arm: it records TIP_SWIM but deliberately lets the move continue.
function swim_move_danger_result(x, y, state) {
    const newtyp = u_simple_floortyp(x, y, state);
    const liquidWall = IS_WATERWALL(newtyp) || newtyp === LAVAWALL;
    if (state.u.uinwater
        && (is_pool(x, y, state) || IS_WATERWALL(newtyp))) {
        return SWIM_DANGER_CONTINUE;
    }

    const stunned = propertyIntrinsic(state, STUNNED);
    const confused = propertyIntrinsic(state, CONFUSION);
    if (newtyp !== u_simple_floortyp(state.u.ux, state.u.uy, state)
        && !stunned && !confused && state.level.at(x, y).seenv
        && (is_pool(x, y, state) || is_lava(x, y, state) || liquidWall)
        && ((is_pool(x, y, state) && !known_wwalking(state))
            || (is_lava(x, y, state) && !known_lwalking(state)
                && !is_lava(state.u.ux, state.u.uy, state))
            || liquidWall)) {
        if (state.context.nopick) return SWIM_DANGER_FORCE;
        if ((state.flags?.paranoia_bits & PARANOID_SWIM) || liquidWall)
            return SWIM_DANGER_AVOID;
    }
    return SWIM_DANGER_CONTINUE;
}

// C ref: hack.c swim_move_danger() (1885-1922).
export async function swim_move_danger(x, y, state = game) {
    const result = swim_move_danger_result(x, y, state);
    if (result === SWIM_DANGER_FORCE) {
        state.context.tips = Math.trunc(state.context.tips ?? 0)
            | (1 << TIP_SWIM);
        return false;
    }
    if (result === SWIM_DANGER_AVOID) {
        await ttyPline(
            `You avoid ${ing_suffix(u_locomotion('step', state))} into the ${waterbody_name(x, y, state)}.`,
            state,
        );
        await handle_tip(TIP_SWIM, state);
        return true;
    }
    return false;
}

// C ref: hack.c domove_bump_mon() (1925-1948).
export async function domove_bump_mon(mtmp, glyph, state = game) {
    if (state.context.nopick && !state.context.travel
        && (canSpotMonster(mtmp, state) || glyph_is_invisible(glyph)
            || glyph_is_warning(glyph))) {
        if ((mtmp.m_ap_type ?? 0)
            && !propertyActiveUnblocked(state, PROT_FROM_SHAPE_CHANGERS)
            && !sensesMonster(mtmp, state)) {
            await stumble_onto_mimic(mtmp, state);
        } else if (mtmp.mpeaceful && !heroHallucinating(state)) {
            await ttyPline(`Pardon me, ${m_monnam(mtmp, state)}.`, state);
        } else {
            await ttyPline(`You move right into ${mon_nam(mtmp, state)}.`, state);
        }
        return true;
    }
    return false;
}

// C ref: hack.c domove_attackmon_at() (1955-1992). The returned displace
// field is the C output parameter.
export async function domove_attackmon_at(
    mtmp, x, y, state = game, env = {},
) {
    let displace = false;
    if (state.context.forcefight || !mtmp.mundetected
        || sensesMonster(mtmp, state)
        || ((hides_under(mtmp.data) || mtmp.data?.mlet === S_EEL)
            && !is_safemon(mtmp, state))) {
        displace = mtmp.data?.pmidx === PM_DISPLACER_BEAST && !rn2(2)
            && mtmp.mux === state.u.ux0 && mtmp.muy === state.u.uy0
            && !helpless(mtmp) && !mtmp.meating && !mtmp.mtrapped
            && !state.u.utrap && !state.u.ustuck && !state.u.usteed
            && !(state.u.dx && state.u.dy
                && (NODIAG(state.u.umonnum)
                    || (bad_rock(mtmp.data, x, state.u.uy0, state)
                        && bad_rock(mtmp.data, state.u.ux0, y, state))
                    || (bad_rock(state.youmonst.data, state.u.ux0, y, state)
                        && bad_rock(state.youmonst.data, x, state.u.uy0, state))))
            && goodpos(state.u.ux0, state.u.uy0, mtmp, GP_ALLOW_U, { state });
        if (!displace && await do_attack(mtmp, state, env))
            return { used: true, displace: false };
    }
    return { used: false, displace };
}

// C ref: hack.c air_turbulence() (2342-2362).
export async function air_turbulence(state = game) {
    if (Is_airlevel(state.u.uz) && rn2(4)
        && !propertyActiveUnblocked(state, LEVITATION)
        && !heroIsFlying(state)) {
        switch (rn2(3)) {
        case 0:
            await ttyPline('You tumble in place.', state);
            await exercise(A_DEX, false, state);
            break;
        case 1:
            await ttyPline("You can't control your movements very well.", state);
            break;
        default:
            await ttyPline("It's hard to walk in thin air.", state);
            await exercise(A_DEX, true, state);
            break;
        }
        return true;
    }
    return false;
}

// C ref: hack.c water_turbulence() (2365-2393). Coordinates are returned in
// an object because C mutates its two pointer parameters.
export async function water_turbulence(x, y, state = game) {
    if (state.u.uinwater) {
        const wtmod = propertyPresent(state, SWIMMING)
            ? MOD_ENCUMBER : SLT_ENCUMBER;
        await water_friction(state);
        if (!state.u.dx && !state.u.dy) {
            nomul(0, state);
            return { stopped: true, x, y };
        }
        x = state.u.ux + state.u.dx;
        y = state.u.uy + state.u.dy;
        if (isok(x, y) && !is_pool(x, y, state)
            && !Is_waterlevel(state.u.uz) && near_capacity(state) > wtmod) {
            await ttyPline(
                'You are carrying too much to climb out of the water.', state,
            );
            nomul(0, state);
            return { stopped: true, x, y };
        }
    }
    return { stopped: false, x, y };
}

// C ref: hack.c slippery_ice_fumbling() (2396-2413).
export function slippery_ice_fumbling(state = game) {
    state.u.uprops[FUMBLING] ??= {
        intrinsic: 0, extrinsic: 0, blocked: 0,
    };
    let onIce = !propertyActiveUnblocked(state, LEVITATION)
        && state.level?.at(state.u.ux, state.u.uy)?.typ === ICE;
    const skater = state.u.usteed ?? state.youmonst;
    if (onIce) {
        if ((state.uarmf && objdescr_is(state.uarmf, 'snow boots', state))
            || monster_resists_element(skater, COLD_RES, state)
            || heroIsFlying(state) || is_floater(skater.data)
            || is_clinger(skater.data) || is_whirly(skater.data)) {
            onIce = false;
        } else if (!rn2(Cold_resistance(state) ? 3 : 2)) {
            const fumbling = state.u.uprops[FUMBLING];
            fumbling.intrinsic |= FROMOUTSIDE;
            fumbling.intrinsic &= ~TIMEOUT;
            fumbling.intrinsic += 1;
        }
    }
    if (!onIce && (state.u.uprops[FUMBLING].intrinsic & FROMOUTSIDE))
        state.u.uprops[FUMBLING].intrinsic &= ~FROMOUTSIDE;
}

// C ref: hack.c impaired_movement() (2425-2443).
export function impaired_movement(x, y, state = game) {
    if (u_maybe_impaired(state)) {
        let tries = 0;
        do {
            if (tries++ > 50) {
                nomul(0, state);
                return { stopped: true, x, y };
            }
            confdir(true, state);
            x = state.u.ux + state.u.dx;
            y = state.u.uy + state.u.dy;
        } while (!isok(x, y)
            || bad_rock(state.youmonst.data, x, y, state));
    }
    return { stopped: false, x, y };
}

// C ref: hack.c move_out_of_bounds() (2584-2612). domove_core() calls this
// ahead of every terrain branch, so a step off the edge of the map ends the run
// and spends no time before test_move() runs. Until this was ported the refusal
// happened by accident, through an admission seam that answered "blocked" for a
// square outside the map.
//
// The force-fight arm at 2589-2590 returns before the flags.mention_walls block
// at 2592-2606, so a force-fight off the edge never reaches that line whatever
// the option is set to, and needs nothing from it. It also returns above
// nomul(0) and `context.move = 0`, so the turn-cost claim above is about the
// ordinary arm alone: a force-fight off the edge spends the turn, which is
// what C's own comment calls "specifying 'F' with no monster wastes a turn". That line needs cmd.c
// directionname() (4312-4323), which has no port, so an ordinary step off the
// edge refuses while mention_walls is on.
async function move_out_of_bounds(x, y, state) {
    if (isok(x, y)) return false;
    if (state.context.forcefight) return domove_fight_empty(x, y, state);
    if (state.flags?.mention_walls) {
        throw new UnsupportedHeroMoveBoundaryError('move out of bounds');
    }
    nomul(0, state);
    state.context.move = 0;
    return true;
}

// C ref: hack.c Known_wwalking. Water walking boots are the only source, and
// the hero has to have identified them.
function known_wwalking(state) {
    const boots = state.uarmf;
    return Boolean(boots
        && boots.otyp === WATER_WALKING_BOOTS
        && objectType(boots, state).oc_name_known
        && !state.u.usteed);
}

// C ref: hack.c Known_lwalking.
function known_lwalking(state) {
    return known_wwalking(state)
        && (propertyIntrinsic(state, FIRE_RES)
            || Boolean(state.u?.uprops?.[FIRE_RES]?.extrinsic))
        && Boolean(state.uarmf.oerodeproof)
        && Boolean(state.uarmf.rknown);
}

// C ref: hack.c avoid_moving_on_trap().
async function avoid_moving_on_trap(x, y, msg, state) {
    const trap = t_at(x, y, state);
    if (trap && trap.tseen && trap.ttyp !== VIBRATING_SQUARE) {
        if (msg && state.flags?.mention_walls) {
            await ttyPline(
                messageAt(
                    `You stop in front of ${an(trapname(trap.ttyp))}.`,
                    x,
                    y,
                    state,
                ),
                state,
            );
        }
        return true;
    }
    return false;
}

// C ref: hack.c avoid_moving_on_liquid(). The clinging-polyform case the
// source marks XXX is absent there too.
async function avoid_moving_on_liquid(x, y, msg, state) {
    const inAir = propertyActiveUnblocked(state, LEVITATION)
        || heroIsFlying(state);
    const destination = state.level?.at(x, y);
    const here = state.level?.at(state.u.ux, state.u.uy);
    const pool = is_pool(x, y, state);
    if ((destination?.typ === here?.typ
        || ((state.context.run ?? 0) < 2 && (!is_lava(x, y, state) || inAir))
        || state.context.travel)
        && (inAir || known_lwalking(state) || (pool && known_wwalking(state)))
        && !(IS_WATERWALL(destination.typ)
            || destination.typ === LAVAWALL)) {
        return false; /* liquid is safe to traverse */
    }
    if ((pool || is_lava(x, y, state)) && destination?.seenv) {
        if (msg && state.flags?.mention_walls) {
            await ttyPline(
                messageAt(
                    `You stop at the edge of the ${hliquid(
                        pool ? 'water' : 'lava',
                        { state },
                    )}.`,
                    x,
                    y,
                    state,
                ),
                state,
            );
        }
        return true;
    }
    return false;
}

// C ref: hack.c avoid_running_into_trap_or_liquid() (2495-2510).
export async function avoid_running_into_trap_or_liquid(
    x, y, state = game,
) {
    const wouldStop = (state.context.run ?? 0) >= 2;
    if (!state.context.run) return false;
    if (await avoid_moving_on_trap(x, y, wouldStop, state)
        || (heroIsBlind(state)
            && await avoid_moving_on_liquid(x, y, wouldStop, state))) {
        nomul(0, state);
        if (wouldStop) state.context.move = 0;
        return wouldStop;
    }
    return false;
}

function region_damage(region) {
    return (!region?.visible || region.ttl === -2)
        ? 0 : Math.trunc(region.arg ?? 0);
}

// C ref: hack.c avoid_trap_andor_region() (2515-2581).
export async function avoid_trap_andor_region(x, y, state = game) {
    const paranoia = Math.trunc(state.flags?.paranoia_bits ?? 0);
    const paranoidTrap = Boolean(paranoia & PARANOID_TRAP);
    const impaired = propertyIntrinsic(state, STUNNED)
        || propertyIntrinsic(state, CONFUSION);
    if (paranoidTrap && !heroIsBlind(state) && !impaired
        && !heroHallucinating(state)
        && (!state.context.nopick || state.context.run)) {
        const newreg = visible_region_at(x, y, state);
        const oldreg = visible_region_at(state.u.ux, state.u.uy, state);
        if (newreg && (!oldreg
            || (region_damage(newreg) > 0 && region_damage(oldreg) === 0))
            && await test_move(
                state.u.ux, state.u.uy, state.u.dx, state.u.dy,
                TEST_MOVE, state,
            )) {
            const qbuf = upstart(
                `${u_locomotion('step', state)} into that ${
                    region_damage(newreg) > 0 ? 'poison gas' : 'vapor'
                } cloud?`,
            );
            if (!await paranoid_query(
                Boolean(paranoia & PARANOID_CONFIRM), qbuf, state,
            )) {
                nomul(0, state);
                state.context.move = 0;
                return true;
            }
        }
    }

    const trap = t_at(x, y, state);
    if (paranoidTrap && !impaired
        && (!state.context.nopick || state.context.run)
        && trap?.tseen
        && await test_move(
            state.u.ux, state.u.uy, state.u.dx, state.u.dy,
            TEST_MOVE, state,
        )
        && (immune_to_trap(state.youmonst, trap.ttyp, state)
            !== TRAP_CLEARLY_IMMUNE || heroHallucinating(state))) {
        const traptype = heroHallucinating(state)
            ? rnd(TRAPNUM - 1) : Math.trunc(trap.ttyp);
        const prompt = `Really ${u_locomotion('step', state)} ${
            into_vs_onto(traptype) ? 'into' : 'onto'
        } that ${CMAP_EXPLANATIONS[trap_to_defsym(traptype)]}?`;
        if (!await paranoid_query(
            Boolean(paranoia & PARANOID_CONFIRM), prompt, state,
        )) {
            nomul(0, state);
            state.context.move = 0;
            return true;
        }
    }
    return false;
}

// C ref: hack.c carrying_too_much() (2616-2636).
export async function carrying_too_much(state = game) {
    const wtcap = near_capacity(state);
    const lowHitPoints = Upolyd(state.u)
        ? state.u.mh < 5 && state.u.mh !== state.u.mhmax
        : state.u.uhp < 10 && state.u.uhp !== state.u.uhpmax;
    if ((wtcap >= OVERLOADED || (wtcap > SLT_ENCUMBER && lowHitPoints))
        && !Is_airlevel(state.u.uz)) {
        if (wtcap < OVERLOADED) {
            await ttyPline("You don't have enough stamina to move.", state);
            await exercise(A_CON, false, state, { rn2 }, {
                encumberMessage: encumber_msg,
            });
        } else {
            await ttyPline('You collapse under your load.', state);
        }
        nomul(0, state);
        return true;
    }
    return false;
}

// C ref: hack.c escape_from_sticky_mon() (2639-2690).
export async function escape_from_sticky_mon(x, y, state = game) {
    const u = state.u;
    if (!u.ustuck || (x === u.ustuck.mx && y === u.ustuck.my)) return false;
    if (!m_next2u(u.ustuck, state)) {
        set_ustuck(null, state);
    } else if (sticks(state.youmonst.data)) {
        const mtmp = u.ustuck;
        set_ustuck(null, state);
        await ttyPline(`You release ${y_monnam(mtmp, state)}.`, state);
    } else {
        const roll = rn2(!u.ustuck.mcanmove ? 8 : 40);
        if (roll === 3 && !u.ustuck.mcanmove) {
            u.ustuck.mfrozen = 1;
            u.ustuck.msleeping = 0;
        }
        if (roll >= 3
            && (propertyPresent(state, CONFLICT)
                || u.ustuck.mconf || !u.ustuck.mtame)) {
            await ttyPline(
                `You cannot escape from ${y_monnam(u.ustuck, state)}!`, state,
            );
            nomul(0, state);
            return true;
        }
        const mtmp = u.ustuck;
        set_ustuck(null, state);
        await ttyPline(`You pull free from ${y_monnam(mtmp, state)}.`, state);
    }
    return false;
}

// C ref: hack.c domove_core()'s "Don't attack if you're running" arm. The
// hero stops without spending the move; the destination monster is left
// alone.
// C ref: hack.c domove_core()'s don't-attack-while-running condition at 2764,
// `svc.context.run && ((!Blind && mon_visible(mtmp) && (...)) || sensemon(mtmp))`.
// Exported so each of its three terms can be pinned on its own: the live path
// reaches it only through domove(), where a hostile in front is also being
// attacked, which hides which term decided the stop.
export function runStopsBeforeMonster(monster, run, state) {
    if (!run || !monster || is_safemon(monster, state))
        return false;
    const appearance = (monster.m_ap_type ?? 0) & M_AP_TYPMASK;
    const seen = !heroIsBlind(state)
        && monsterVisible(monster, state)
        && ((appearance !== M_AP_FURNITURE && appearance !== M_AP_OBJECT)
            || propertyActiveUnblocked(state, PROT_FROM_SHAPE_CHANGERS));
    return seen || sensesMonster(monster, state);
}

// C ref: hack.c domove_fight_ironbars() (1993-2016). Its whole body is the
// TRUE arm: a force-fight at iron bars swings the wielded weapon at them
// through hit_bars(), which can break the weapon, unwield it and free it from
// inventory. None of that is ported, so the guard that selects the arm is what
// stops here; every other square falls through as C's `return FALSE`.
function domove_fight_ironbars(x, y, state) {
    if (state.context.forcefight
        && state.level?.at(x, y)?.typ === IRONBARS
        && state.uwep) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight against iron bars',
        );
    }
}

// C ref: hack.c domove_fight_web() (2018-2113). Its whole body is the TRUE
// arm: a force-fight at a seen web cuts or burns at it, choosing among four
// messages by weapon skill and artifact, and drawing rn2() before any of them.
// Nothing of that is ported, so the guard that selects the arm stops here.
//
// C reads the trap unconditionally and tests it inside the condition; the
// order matters no more than it does in C, because t_at() has no side effect.
function domove_fight_web(x, y, state) {
    const trap = t_at(x, y, state);
    if (state.context.forcefight && trap && trap.ttyp === WEB && trap.tseen) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight against a spider web',
        );
    }
}

// C ref: hack.c domove_fight_empty() (2227-2338). The hero has swung the 'F'
// prefix at a square with nothing on it to fight. The turn is spent, one line
// names what was there instead, and the map forgets whatever it was showing.
// TRUE means the step is over; FALSE hands the square back to domove_core().
//
// C's entry condition is
//     svc.context.forcefight
//     || (glyph_is_invisible(glyph) && !m_at(x, y) && !svc.context.nopick)
// Its second disjunct is a remembered 'I' the hero walked into without the
// prefix: C spends the turn swinging at it and forgets it, rather than walking
// on. mhitm.c pre_mm_attack() is the ported writer of that marker, so the
// disjunct is live and is carried below.
//
// C reads the drawn glyph there (glyph_at() at 2232, the display buffer) where
// this reads map memory. The two agree wherever the marker exists: display.c
// map_invisible() writes both together, newsym()'s marker arm re-asserts both,
// and nothing else writes either. show_glyph_cell() keeps no glyph number on
// the drawn cell, which is why the memory is the one that can be read.
//
// Three message arms are live. The off-edge arm at 2252-2256 answers the one
// caller that is not domove_core(): move_out_of_bounds() hands a force-fight
// aimed off the map straight here. The solid arm at 2298-2313 names terrain
// with a remembered appearance, and the thin-air arm at 2314-2316 names
// nothing. Every other arm stops, each named below.
async function domove_fight_empty(x, y, state) {
    // C computes `off_edge` and the glyph above the entry test, and an
    // off-edge square takes GLYPH_UNEXPLORED, which is not the marker. So the
    // disjunct needs isok() where the forcefight half does not.
    const remembersUnseenMonster = isok(x, y)
        && glyph_is_invisible(state.level.at(x, y).remembered_glyph?.glyph)
        && !m_at(x, y, state)
        && !state.context.nopick;
    if (!state.context.forcefight && !remembersUnseenMonster) return false;

    // 2247 explo, whose consequences are the tail at 2324-2334: wake_nearto(),
    // explum(), u.mh = -1 and rehumanize(). Nothing in this port polymorphs the
    // hero, and none of those four is ported. C reads it above the off-edge arm
    // below and spends it at 2319-2321, so a swing off the edge in an exploding
    // form stops here rather than printing.
    if (Upolyd(state.u) && attacktype(state.youmonst?.data, AT_EXPL)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight while polymorphed into an exploding form',
        );
    }
    // 2252-2256. `solid` at 2248 is true from `off_edge` alone and `boulder` is
    // still the 0 it was given at 2246, so the adverb at 2320 is "harmlessly ";
    // `explo`, its third input, is refused above. The jump to `futile` skips
    // every test below along with unmap_object() and newsym(), so this arm
    // reads no square at all -- which is why C's pinning of x,y to <0,1> at
    // 2235-2239, there to keep the reads it skips inside the array, has no
    // counterpart here.
    if (!isok(x, y)) {
        /* treat as if solid rock, even on planes' levels */
        await ttyPline('You harmlessly attack an unknown obstacle.', state);
        nomul(0, state);
        return true;
    }

    const location = state.level.at(x, y);
    // 2253 and 2306-2312. Underwater skips the boulder and digging tests and
    // then takes a message arm of its own, which names an air bubble or
    // nothing at all rather than the terrain.
    if (state.u.uinwater) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight while underwater',
        );
    }
    // 2254-2260. A boulder on the square, or a statue the map is showing, is
    // what the hero attacks instead, and 2314 names it with objnam.c
    // ansimpleoname(), which has no port. C finds the statue through
    // glyph_is_statue(), a question about the glyph number in map memory that
    // this port's presentation records cannot answer; asking sobj_at() instead
    // refuses a statue C would have ignored because something else covers it.
    // Both are stops.
    if (sobj_at(BOULDER, x, y, state) || sobj_at(STATUE, x, y, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight against a boulder or statue',
        );
    }
    // 2267-2276. A hero who force-fights while wielding a digging tool starts
    // digging instead, through dig.c use_pick_axe2(), but only when dig_typ()
    // answers something other than DIGTYP_UNDIGGABLE. use_pick_axe2() is not
    // ported, so a digging answer stops the command; an undiggable one falls
    // through to the message arms below, where C swings and spends the turn.
    // An axe reaches that fall-through at every wall, rock, pool and furniture
    // square, and a pick at ROOM, CORR and a tree.
    //
    // C's block is `if (svc.context.forcefight && uwep && dig_typ(...) &&
    // !glyph_is_invisible(glyph) && !glyph_is_monster(glyph))`. The forcefight
    // conjunct is written below because the entry test now admits a second
    // way in: a hero walking into a remembered 'I' arrives here with
    // context.forcefight clear, and that is a path on which C skips the dig
    // block outright and swings.
    //
    // C's two remaining conjuncts, !glyph_is_invisible(glyph) and
    // !glyph_is_monster(glyph), are the "should we dig?" half and both make C
    // swing rather than dig. Neither is ported, so this refusal is wider than
    // C on a force-fought square whose map memory holds an unseen-monster
    // marker or a monster that has since left it. It is fail-closed.
    if (state.context.forcefight && state.uwep
        && dig_typ(state.uwep, x, y, state) !== DIGTYP_UNDIGGABLE) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight that digs instead of swinging',
        );
    }

    // 2246-2247. `solid` is misleadingly named, as C's own comment at 2316
    // says: it catches water, lava and furniture as well as rock and walls.
    const solid = !accessible(x, y, state) || IS_FURNITURE(location.typ);

    // 2302-2305 decides this, below, but the test has to be read here. Blind
    // or not, C does not reveal terrain the hero has never seen; it names such
    // a square "an unknown obstacle" instead, which is a message arm this port
    // leaves unported. C reaches that arm after unmap_object() and newsym()
    // have run, so putting the port's refusal where C puts the test would let
    // it fire after map memory and the display buffer had already been
    // rewritten -- a stop that has changed state, which ends the segment on a
    // screen the port has already diverged from. It is hoisted instead, which
    // is the one place the port deliberately departs from C's order, and only
    // on the arm it refuses.
    if (solid
        && !(location.seenv || IS_STWALL(location.typ)
             || location.typ === SDOOR || location.typ === SCORR)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'force-fight against terrain with no remembered appearance',
        );
    }

    /* about to become known empty -- remove 'I' if present */
    unmap_object(x, y, state);
    newsym(x, y);
    // C re-reads glyph_at() here and marks it nhUse(); nothing reads it back.

    let buf;
    if (solid) {
        buf = the(CMAP_EXPLANATIONS[
            glyph_to_cmap(back_to_glyph(x, y, state))
        ], state);
    } else {
        // 2314-2316. Everything accessible that is not furniture is thin air,
        // which is ordinary floor, a corridor, ice, and a doorway with no
        // closed door in it.
        buf = 'thin air';
    }

    // 2318-2321, C's `futile` label, which the off-edge arm above jumps to and
    // this arm falls into. C's adverb is
    //     !(boulder || solid) ? "" : !explo ? "harmlessly " : "futilely "
    // `boulder` and `explo` are refused above, so `solid` alone chooses
    // between the first two and no case can reach "futilely ".
    await ttyPline(`You ${solid ? 'harmlessly ' : ''}attack ${buf}.`, state);

    nomul(0, state);
    return true;
}

// C ref: hack.c trapmove() (1549-1691), the TT_BEARTRAP arm (1565-1579) and
// the wriggle_free: label it jumps to (1671-1680). TRUE means the hero may go
// on to test_move(); FALSE means the step is spent struggling and the turn
// still passes.
//
// Escaping costs one point of u.utrap per step, and a diagonal step always
// pays it while an orthogonal one pays it on a one-in-five rn2(5) -- C's own
// comment asks why diagonal movement gives the quickest escape. The
// short-circuit matters: a diagonal step draws no random number at all.
//
// The other five u.utraptype arms are TT_PIT (climb_pit()), TT_WEB
// (u_wield_art(ART_STING)), TT_LAVA, TT_INFLOOR and TT_BURIEDBALL
// (buried_ball() and buried_ball_to_punishment()); none of those owners is
// ported. `x`, `y` and `desttrap` are read by the TT_PIT arm alone, which is
// why they are unread here. `anchored` is TT_BURIEDBALL's, and it is what
// makes wriggle_free() say "wriggle" rather than "wrench the ball" below.
async function trapmove(_x, _y, _desttrap, state = game) {
    const u = state.u;

    if (!u.utrap) return true; /* sanity check */

    /*
     * Note: caller should call reset_utrap() when we set u.utrap to 0.
     */
    if (u.utraptype !== TT_BEARTRAP) {
        throw new UnsupportedHeroMoveBoundaryError('held hero movement');
    }
    // C ref: hack.c:1556 and 1569-1570. A mounted hero is named by
    // y_monnam(u.usteed) and reported instead of the hero, where the lines
    // below name the hero. This is now the only refusal on the path: the
    // steed gate above answers false for a healthy steed and falls through to
    // here, and what keeps u.utrap and u.usteed from being set together today
    // is js/trap.js's own mounted refusal in dotrap(). Delete this and a
    // mounted hero in a bear trap prints the unmounted lines instead of
    // stopping.
    if (u.usteed) {
        throw new UnsupportedHeroMoveBoundaryError('a steed in a bear trap');
    }
    if (state.flags?.verbose)
        await ttyNorep('You are caught in a bear trap.', state);
    if ((u.dx && u.dy) || !rn2(5)) --u.utrap;
    if (!u.utrap) await ttyPline('You finally wriggle free.', state);
    return false;
}

// C ref: hack.c domove() (2693-2709), the three-statement bracket around
// domove_core(). Only its last statement is here: C's maybe_smudge_engr() and
// `domove_attempting = 0` both sit inside domove_core() below, at the exits
// they belong to, because this port never tracked domove_succeeded. The
// kickedloc clear cannot be split that way -- C runs it on every exit
// domove_core() takes, including the ones that print a refusal and move
// nobody -- so it stays where C put it, above the one return this function
// has.
export async function domove(state = game) {
    await domove_core(state);
    clear_kickedloc(state);
}

// C ref: hack.c domove_core(). It requires
// established u.dx/u.dy and context.move = 1. Success updates the position and
// leaves that turn flag untouched; a blocked step sets it to 0 and cancels
// multi, context.mv, and context.run. moveloop_core() calls domove() directly
// only for already-established movement intent. Like hack.c, a changed hero
// position sets u.umoved for the subsequent turn effects.
async function domove_core(state = game) {
    const u = state.u;

    // C ref: hack.c domove_core():2724-2728. Travel chooses the direction
    // immediately before the ordinary movement pipeline. The selected
    // boundary reaches only a known reachable target, so TRAVP_GUESS remains
    // deliberately outside this slice if the ordinary search cannot find a
    // path.
    if (state.context.travel) {
        if (!await findtravelpath(TRAVP_TRAVEL, state)) {
            throw new UnsupportedHeroMoveBoundaryError(
                'unreachable travel target guessing',
            );
        }
        state.context.travel1 = 0;
    }

    if (await carrying_too_much(state)) {
        state.domoveAttempting = 0;
        return;
    }

    let newx;
    let newy;
    let destinationMonster;
    let displaceu = false;
    if (u.uswallow) {
        // C ref: hack.c domove_core():2739-2743. A swallowed hero does not
        // move in the requested direction. The swallower owns the hero's
        // position, and the rest of domove_core() handles it as the target of
        // this command so uhitm.c can deliver the guaranteed swallowed hit.
        if (!u.ustuck) {
            throw new UnsupportedHeroMoveBoundaryError(
                'swallowed hero without an engulfer',
            );
        }
        u.dx = 0;
        u.dy = 0;
        newx = u.ustuck.mx;
        newy = u.ustuck.my;
        u_on_newpos(newx, newy, state);
        destinationMonster = u.ustuck;
    } else {
        if (await air_turbulence(state)) {
            state.domoveAttempting = 0;
            return;
        }
        slippery_ice_fumbling(state);
        newx = u.ux + u.dx;
        newy = u.uy + u.dy;

        const impaired = impaired_movement(newx, newy, state);
        if (impaired.stopped) {
            state.domoveAttempting = 0;
            return;
        }
        newx = impaired.x;
        newy = impaired.y;

        const turbulent = await water_turbulence(newx, newy, state);
        if (turbulent.stopped) {
            state.domoveAttempting = 0;
            return;
        }
        newx = turbulent.x;
        newy = turbulent.y;

        if (await move_out_of_bounds(newx, newy, state)) {
            state.domoveAttempting = 0;
            return;
        }
        if (await avoid_running_into_trap_or_liquid(newx, newy, state)) {
            state.domoveAttempting = 0;
            return;
        }
        if (await escape_from_sticky_mon(newx, newy, state)) {
            state.domoveAttempting = 0;
            return;
        }
        // C ref: domove_core():2763-2777. The destination monster is read, and
        // the run stopped in front of it, before anything reads the terrain.
        destinationMonster = m_at(newx, newy, state);
        if (runStopsBeforeMonster(
            destinationMonster, state.context.run, state,
        )) {
            nomul(0, state);
            state.context.move = 0;
            state.domoveAttempting = 0;
            return;
        }
    }

    // C ref: domove_core():2780-2781, the square the hero is leaving. C writes
    // it here, above the monster block, so do_attack() and test_move() both
    // run with it already set.
    const oldx = u.ux;
    const oldy = u.uy;
    u.ux0 = oldx;
    u.uy0 = oldy;
    state.gb ??= {};
    state.gb.bhitpos = { x: newx, y: newy };
    const targetGlyph = glyph_at(newx, newy, state);

    // C ref: domove_core():2787-2800, which reaches domove_attackmon_at()
    // (1955-1992) at 2798 and test_move() only at 2843. The attack therefore
    // precedes the terrain rules: a step that test_move() goes on to decline
    // has still spent do_attack()'s rn2(7), and a refused pet displacement off
    // an intact doorway is where that is observable.
    //
    // C's `nomul(0)` at 2790-2792 ends a multi-turn action before the attack.
    // It is gated on `!is_safemon(mtmp) || svc.context.forcefight`, so a pet
    // displacement skips it, and a hostile target or the 'F' prefix takes it.
    if (destinationMonster) {
        if (!u.uswallow) {
            requireSupportedDestinationMonster(
                destinationMonster,
                newx,
                newy,
                state,
            );
        }
        if (!is_safemon(destinationMonster, state)
            || state.context.forcefight) {
            nomul(0, state);
        }
        if (await domove_bump_mon(
            destinationMonster, targetGlyph, state,
        )) {
            state.domoveAttempting = 0;
            return;
        }
        const attack = await domove_attackmon_at(
            destinationMonster, newx, newy, state,
            {
                checkCapacity: check_capacity,
                encumberMessage: encumber_msg,
                endRunning,
                message: ttyPline,
                nearCapacity: near_capacity,
                overexertion,
                unsupported: (reason) => {
                    throw new UnsupportedHeroMoveBoundaryError(reason);
                },
            },
        );
        if (attack.used) {
            state.domoveAttempting = 0;
            return;
        }
        displaceu = attack.displace;
    }

    // C ref: domove_core():2805-2810, inside its `if (!displaceu)` block. A
    // displacer-beast swap skips it. All three run before
    // the u.utrap block and before test_move(), so a force-fight answers the
    // square whatever else is true of the hero or the terrain.
    if (!displaceu) {
        domove_fight_ironbars(newx, newy, state);
        domove_fight_web(newx, newy, state);
        if (await domove_fight_empty(newx, newy, state)) {
            state.domoveAttempting = 0;
            return;
        }

    // C ref: domove_core():2812. The square the hero is about to step onto is
    // about to become known, so a marker left there by a monster that has
    // since moved away is cleared and the square repainted. It answers FALSE
    // and does nothing on every other step. domove_fight_empty() above has
    // already taken the marker away on the paths its own disjunct admits, so
    // this fires for the 'm' prefix, which that disjunct excludes.
        unmap_invisible(newx, newy, state);

    // C ref: domove_core():2815-2818, C's first line after unmap_invisible()
    // and its comment "not attacking an animal, so we try to move". A steed
    // that cannot move refuses the step, and the hero still spends the turn:
    // nomul(0) ends any multi-turn action, and svc.context.move is left at 1,
    // unlike the test_move() refusal further down, which clears it. C's
    // u_rooted() test follows this one and is left out for the reason
    // js/hack.js u_rooted() gives: no admitted path polymorphs the hero, so
    // gy.youmonst.data->mmove is never 0.
    //
    // Both of stucksteed()'s reporting arms refuse in js/steed.js, so FALSE is
    // the only answer this port produces and the body below never runs. This
    // call is the live seam for a helpless steed alone: it passes checkfeeding
    // FALSE, as hack.c:2815 does, so a steed that is still eating walks on
    // from here. Only do.c dodown() and doup() pass TRUE, and js/steed.js owns
    // that arm.
        if ((u.dx || u.dy) && u.usteed && stucksteed(false, state)) {
            nomul(0, state);
            state.domoveAttempting = 0;
            return;
        }

        if (await u_rooted(state)) {
            state.domoveAttempting = 0;
            return;
        }

        if (state.flags?.paranoia_bits & PARANOID_TRAP) {
            if (await avoid_trap_andor_region(newx, newy, state)) {
                state.domoveAttempting = 0;
                return;
            }
        }

    // C ref: domove_core():2830-2841. A held hero spends the step struggling
    // and never reaches test_move(). C passes NULL for desttrap here; the
    // adjacent-pit lookup that argument serves belongs to the other caller.
        if (u.utrap) {
        const moved = await trapmove(newx, newy, null, state);

        if (!u.utrap) {
            state.disp ??= {};
            state.disp.botl = true;
            reset_utrap(true, state); /* might resume levitation or flight */
        }
        /* might not have escaped, or did escape but remain in the same spot */
        if (!moved) {
            state.domoveAttempting = 0;
            return;
        }
        }

    // C ref: domove_core():2843-2849. The closed-door arm inside test_move()
    // sets context.door_opened when the pull succeeded, and that suppresses
    // the no-time refusal here even though the hero has not moved.
        if (!await test_move(u.ux, u.uy, u.dx, u.dy, DO_MOVE, state, {
        message: ttyPline,
        })) {
            if (!state.context.door_opened) {
                state.context.move = 0;
                nomul(0, state);
            }
            state.domoveAttempting = 0;
            return;
        }
        // test_move() has already run moverock() by now, so a boulder that was
        // on the destination has moved on and this reads the square it left.
        const movedDestination = state.level?.at(newx, newy);
        if (!destinationMonster
            && !IS_OBSTRUCTED(movedDestination?.typ)
            && movedDestination?.typ !== IRONBARS)
            requireSimpleHeroDestination(newx, newy, state, true);

        if (await swim_move_danger(newx, newy, state)) {
            state.context.move = 0;
            nomul(0, state);
            state.domoveAttempting = 0;
            return;
        }
    }

    if (!await in_out_region(newx, newy, { state })) return;
    u.ux = newx;
    u.uy = newy;

    // C ref: domove_core():2879-2884. A ridden steed rides along on the
    // tentative move. C's m_postmove_effect(&gy.youmonst) between the two is
    // unported and empty for the hero: monmove.c gives it a body only for a
    // hezrou or an uncancelled steam vortex, and no ported path polymorphs the
    // hero into either.
    if (u.usteed) {
        u.usteed.mx = u.ux;
        u.usteed.my = u.uy;
        /* [if move attempt ends up being blocked, should training count?] */
        exercise_steed(state); /* train riding skill */
    }

    if (destinationMonster) {
        // C ref: domove_core():2921-2926. A pet that declined the swap leaves
        // the hero where it started, and the steed with it. C's own comment
        // says the steed write "could skip this since we're about to call
        // u_on_newpos()", which js/dungeon.js u_on_newpos() ports.
        //
        // domove_swap_with_pet() below has a single `return true`. Not every
        // FALSE arm in C reports through do_name.c YMonnam() -- the first
        // prints nothing at all -- so the reason this restore is unreachable
        // is what refuses each arm, not what each arm says:
        // requireOrdinaryStartingPetSwap() above covers the pit-and-boulder
        // pin and the trapped-peaceful arm through its `monster.mtrapped`
        // term, NODIAG and bad_rock cannot fire for the three STARTING_PETS
        // species, and the source-square and trap checks exclude the
        // goodpos/mundisplaceable arm. js/hack.js:1247-1254 lists them.
        // Porting a FALSE arm of that helper is what would make this live.
        if (!await domove_swap_with_pet(
            destinationMonster,
            newx,
            newy,
            state,
            { message: ttyPline },
        )) {
            u.ux = u.ux0;
            u.uy = u.uy0;
            if (u.usteed) {
                u.usteed.mx = u.ux;
                u.usteed.my = u.uy;
            }
        }
    }

    // C ref: domove_core():2934. The writes above are C's tentative move; this
    // is its full re-position, possibly back to where the hero started when a
    // pet swap failed. On a same-level step its whole effect is
    // see_nearby_objects(), which turns a nearby generic potion or gem from
    // its class colour into its own.
    u_on_newpos(u.ux, u.uy, state);

    // C ref: domove_core()'s run arm after u_on_newpos(). A run that walks
    // onto a doorway or a furniture square such as a staircase ends there.
    // reset_occupations() precedes it in C and has no ported occupation to
    // reset. The run < 8 test excludes travel only.
    const destination = state.level?.at(newx, newy);
    if (state.context.run && state.context.run < 8
        && (IS_DOOR(destination.typ)
            || IS_OBSTRUCTED(destination.typ)
            || IS_FURNITURE(destination.typ))) {
        nomul(0, state);
    }

    u.umoved = true;

    if (hero_tread_disturbs_buried_zombies(state))
        disturb_buried_zombies(newx, newy, state);

    newsym(oldx, oldy);
    vision_recalc(1);
    newsym(newx, newy);
    // C ref: domove_core():2980 spoteffects(TRUE).
    await spoteffects(true, state);
    await runmode_delay_output(state);
    maybe_smudge_engr(oldx, oldy, newx, newy, state);
    state.domoveAttempting = 0;
}

// C ref: hack.c nh_delay_output()'s window-port entry. Recorder patch 006
// makes the patched tty capture one animation frame and return immediately
// whenever NETHACK_NO_DELAY is set, which is how every recording runs, so the
// frame capture is the whole of its observable behavior.
export async function nh_delay_output(state = game) {
    await state._animationFrameHook?.();
}

// C ref: display.c curs_on_u(). flush_screen() reads the module-global `game`,
// here and at every other call site in the port, so a caller threading some
// other state would write disp.time_botl into one object and have it read and
// cleared from another. The production path only ever runs on `game`; this
// refuses anything else rather than flushing the wrong game silently.
export async function curs_on_u(state) {
    if (state !== game) {
        throw new TypeError('curs_on_u() flushes the global game state');
    }
    await flush_screen(1);
}

// C ref: hack.c runmode_delay_output(). Called once per turn from
// moveloop_core() while a multi-turn action is running and once more at the
// end of each domove().
export async function runmode_delay_output(state = game) {
    if ((state.context.run || state.multi)
        && state.flags.runmode !== RUN_TPORT) {
        // For normal (leap) mode, update the display every 7th step relative
        // to the turn counter; walk and crawl update after every step.
        if (state.flags.runmode !== RUN_LEAP || !(state.moves % 7)) {
            state.disp ??= {};
            // moveloop_core() suppresses time_botl while running.
            state.disp.time_botl = Boolean(state.flags.time);
            await curs_on_u(state);
            await nh_delay_output(state);
            if (state.flags.runmode === RUN_CRAWL) {
                await nh_delay_output(state);
                await nh_delay_output(state);
                await nh_delay_output(state);
                await nh_delay_output(state);
            }
        }
    }
}

// C ref: hack.h NODIAG(). Only grid bugs are barred from diagonal movement.
export function NODIAG(monnum) {
    return monnum === PM_GRID_BUG;
}

// C ref: monst.h is_door_mappear().
function is_door_mappear(monster) {
    return ((monster.m_ap_type ?? 0) & M_AP_TYPMASK) === M_AP_FURNITURE
        && (monster.mappearance === S_hcdoor
            || monster.mappearance === S_vcdoor);
}

// C ref: hack.c pickup_checks() (3788-3871). Reports what dopickup() should
// do with the square the hero stands on: 0 to refuse without spending a turn,
// -1 to run a normal pickup. C's other two results come only from its
// swallowed arm, which this port refuses instead, so neither is returned here.
//
// Three of C's four refusal arms are refused rather than translated, each
// before its arm prints anything:
//   * the swallowed arm reads u.ustuck->minvent instead of the floor and ends
//     in loot_mon(), a whole second command's worth of source;
//   * the pool and lava arms turn on Wwalking, is_floater(), is_clinger(),
//     Flying, Breathless, Underwater and likes_lava(), and both fall through
//     to the rest of the function when none of those holds, so a refusal on
//     the terrain alone is the only conservative reading;
//   * the can_reach_floor() arm needs uteetering_at_seen_pit(),
//     rider_cant_reach() and surface().
// The !OBJ_AT arm below is the whole of what this port answers today.
export async function pickup_checks(state = game) {
    const u = state.u;

    /* uswallow case added by GAN 01/29/87 */
    if (u.uswallow) {
        throw new UnsupportedPickupError('pickup_checks() inside a monster');
    }
    if (is_pool(u.ux, u.uy, state)) {
        throw new UnsupportedPickupError('pickup_checks() over water');
    }
    if (is_lava(u.ux, u.uy, state)) {
        throw new UnsupportedPickupError('pickup_checks() over lava');
    }
    // C's OBJ_AT(u.ux, u.uy), read off the per-square pile chain the way
    // pickup.c pickup() reads it, so a supplied state rather than the module
    // global answers for it.
    if (!(state.level?.objects?.[u.ux]?.[u.uy] ?? null)) {
        const lev = state.level?.at(u.ux, u.uy);
        const typ = lev?.typ;

        if (IS_THRONE(typ)) {
            // rm.h:218 aliases `looted` onto the same field `doormask` names,
            // which is what doorMask() reads. Nothing ported loots a throne,
            // so the shorter line is the only one a game reaches.
            await ttyPline(
                `It must weigh${doorMask(lev) ? ' almost' : ''} a ton!`,
                state,
            );
        } else if (IS_SINK(typ)) {
            await ttyPline('The plumbing connects it to the floor.', state);
        } else if (IS_GRAVE(typ)) {
            await ttyPline("You don't need a gravestone.  Yet.", state);
        } else if (IS_FOUNTAIN(typ)) {
            await ttyPline(
                `You could drink the ${hliquid('water', { state })}...`,
                state,
            );
        } else if (IS_DOOR(typ) && (doorMask(lev) & D_ISOPEN)) {
            await ttyPline("It won't come off the hinges.", state);
        } else if (IS_ALTAR(typ)) {
            await ttyPline(
                'Moving the altar would be a very bad idea.', state,
            );
        } else if (typ === STAIRS) {
            await ttyPline('The stairs are solidly affixed.', state);
        } else {
            await ttyPline('There is nothing here to pick up.', state);
        }
        return 0;
    }
    const traphere = t_at(u.ux, u.uy, state);
    if (!can_reach_floor(Boolean(traphere && is_pit(traphere.ttyp)), state)) {
        throw new UnsupportedPickupError(
            'pickup_checks() by a hero who cannot reach the floor',
        );
    }
    return -1; /* can do normal pickup */
}

// C ref: hack.c dopickup() (3876-3891), whose own comment calls it "the
// #pickup command". The loot_mon() arm at 3884-3887 is not written out:
// pickup_checks() answers -2 only from its swallowed arm, which throws above.
export async function dopickup(state = game) {
    // C's gc.command_count. parse() collects it whether or not a prefix ran,
    // so both `1,` and `m1,` reach here with commandCount 1 and pickup(-count)
    // is not pickup(0). pickup()'s `what < 0` arm is the refusal that meets it.
    // A larger count cannot arrive: rhack() refuses one that left gm.multi
    // above 0.
    const count = Math.trunc(state.commandCount ?? 0);
    state.multi = 0; /* always reset */

    const ret = await pickup_checks(state);
    if (ret >= 0) {
        // C's `ret ? ECMD_TIME : ECMD_OK`. pickup_checks() answers 1 only
        // from the swallowed arm it refuses, so only ECMD_OK is reachable.
        return ret ? ECMD_TIME : ECMD_OK;
    }
    return await pickup(-count, state) ? ECMD_TIME : ECMD_OK;
}

const LOOKAROUND_CONTINUE = 0;
const LOOKAROUND_STOP = 1;

// C ref: hack.c lookaround(). Stop running if something interesting is next
// to the hero; turn around a corner if that is the only way to proceed; never
// turn left or right twice. The two labels the source jumps to become the
// bcorr() closure and the LOOKAROUND_STOP result of examine().
export async function lookaround(state = game) {
    const u = state.u;
    let i = 0;
    let x0 = 0;
    let y0 = 0;
    let m0 = 1;
    let i0 = 9;
    let corrct = 0;
    let noturn = 0;

    // Grid bugs stop if trying to move diagonal, even if blind. Maybe they
    // polymorphed while in the middle of a long move.
    if (NODIAG(u.umonnum) && u.dx && u.dy) {
        await ttyPline('You cannot move diagonally.', state);
        nomul(0, state);
        return;
    }

    if (heroIsBlind(state) || state.context.run === 0) return;

    const here = state.level.at(u.ux, u.uy);

    // C ref: lookaround()'s bcorr label. Its body counts corridor squares
    // around the hero and picks the one a corner turn would follow. A hero
    // standing in a room skips the count entirely, which is why a run that
    // starts and ends inside one room can neither widen-stop nor turn a
    // corner.
    const bcorr = (x, y, mtmp) => {
        if (here.typ !== ROOM) {
            const run = state.context.run;
            /* running or traveling */
            if (run === 1 || run === 3 || run === 8) {
                /* distance from x,y to the location we're moving to */
                i = dist2(x, y, u.ux + u.dx, u.uy + u.dy);
                /* ignore if not on or directly adjacent to it */
                if (i > 2) return LOOKAROUND_CONTINUE;
                /* x,y is (adjacent to) the location we're moving to; if we've
                   seen one corridor, and x,y is not directly orthogonally
                   next to it, mark noturn */
                if (corrct === 1 && dist2(x, y, x0, y0) !== 1) noturn = 1;
                /* if previous x,y was diagonal, now x,y is orthogonal (or
                   this is the first time we're here) */
                if (i < i0) {
                    i0 = i;
                    x0 = x;
                    y0 = y;
                    m0 = mtmp ? 1 : 0;
                }
            }
            corrct++;
        }
        return LOOKAROUND_CONTINUE;
    };

    const examine = async (x, y) => {
        const infront = (x === u.ux + u.dx && y === u.uy + u.dy);

        /* ignore out of bounds, and our own location */
        if (!isok(x, y) || (x === u.ux && y === u.uy))
            return LOOKAROUND_CONTINUE;
        /* (grid bugs) ignore diagonals */
        if (NODIAG(u.umonnum) && x !== u.ux && y !== u.uy)
            return LOOKAROUND_CONTINUE;

        const mtmp = m_at(x, y, state);
        const location = state.level.at(x, y);

        /* can we see a monster there? */
        if (mtmp) {
            const appearance = (mtmp.m_ap_type ?? 0) & M_AP_TYPMASK;
            if (appearance !== M_AP_FURNITURE
                && appearance !== M_AP_OBJECT
                && monsterVisible(mtmp, state)) {
                /* running movement and not a hostile monster, OR it blocks
                   our move direction and we're not traveling */
                if ((state.context.run !== 1 && !is_safemon(mtmp, state))
                    || (infront && !state.context.travel)) {
                    if (state.flags?.mention_walls) {
                        // "%s blocks your path." needs a_monnam(), which has
                        // no ported owner.
                        throw new UnsupportedHeroMoveBoundaryError(
                            'a blocked-path message',
                        );
                    }
                    return LOOKAROUND_STOP;
                }
            }
        }

        /* stone is never interesting */
        if (location.typ === STONE) return LOOKAROUND_CONTINUE;
        /* ignore the square we're moving away from */
        if (x === u.ux - u.dx && y === u.uy - u.dy)
            return LOOKAROUND_CONTINUE;

        /* stop for traps, sometimes */
        if (await avoid_moving_on_trap(
            x, y, infront && state.context.run > 1, state,
        )) {
            if (state.context.run === 1) return bcorr(x, y, mtmp);
            if (infront) return LOOKAROUND_STOP;
        }

        /* more uninteresting terrain */
        if (IS_OBSTRUCTED(location.typ) || location.typ === ROOM
            || IS_AIR(location.typ) || location.typ === ICE) {
            return LOOKAROUND_CONTINUE;
        } else if (closed_door(x, y, state)
            || (mtmp && is_door_mappear(mtmp))) {
            /* a closed door? ignore if diagonal */
            if (x !== u.ux && y !== u.uy) return LOOKAROUND_CONTINUE;
            if (state.context.run !== 1 && !state.context.travel) {
                if (state.flags?.mention_walls) {
                    await ttyPline(
                        messageAt(
                            'You stop in front of the door.', x, y, state,
                        ),
                        state,
                    );
                }
                return LOOKAROUND_STOP;
            }
            /* orthogonal to a closed door, consider it a corridor */
            return bcorr(x, y, mtmp);
        } else if (location.typ === CORR) {
            return bcorr(x, y, mtmp);
        } else if (is_pool(x, y, state) || is_lava(x, y, state)) {
            if (infront && await avoid_moving_on_liquid(x, y, true, state))
                return LOOKAROUND_STOP;
            return LOOKAROUND_CONTINUE;
        }
        /* e.g. objects or trap or stairs */
        if (state.context.run === 1) return bcorr(x, y, mtmp);
        if (state.context.run === 8) return LOOKAROUND_CONTINUE;
        if (mtmp) return LOOKAROUND_CONTINUE; /* d */
        if (((x === u.ux - u.dx) && (y !== u.uy + u.dy))
            || ((y === u.uy - u.dy) && (x !== u.ux + u.dx)))
            return LOOKAROUND_CONTINUE;
        return LOOKAROUND_STOP;
    };

    for (let x = u.ux - 1; x <= u.ux + 1; ++x) {
        for (let y = u.uy - 1; y <= u.uy + 1; ++y) {
            if (await examine(x, y) === LOOKAROUND_STOP) {
                nomul(0, state);
                return;
            }
        }
    }

    if (corrct > 1 && state.context.run === 2) {
        if (state.flags?.mention_walls)
            await ttyPline('The corridor widens here.', state);
        nomul(0, state);
        return;
    }
    if ((state.context.run === 1 || state.context.run === 3
        || state.context.run === 8)
        && !noturn && !m0 && i0
        && (corrct === 1 || (corrct === 2 && i0 === 1))) {
        /* make sure that we do not turn too far */
        if (i0 === 2) {
            if (u.dx === y0 - u.uy && u.dy === u.ux - x0)
                i = 2; /* straight turn right */
            else
                i = -2; /* straight turn left */
        } else if (u.dx && u.dy) {
            if ((u.dx === u.dy && y0 === u.uy)
                || (u.dx !== u.dy && y0 !== u.uy))
                i = -1; /* half turn left */
            else
                i = 1; /* half turn right */
        } else {
            if ((x0 - u.ux === y0 - u.uy && !u.dy)
                || (x0 - u.ux !== y0 - u.uy && u.dy))
                i = 1; /* half turn right */
            else
                i = -1; /* half turn left */
        }

        i += u.last_str_turn;
        if (i <= 2 && i >= -2) {
            u.last_str_turn = i;
            u.dx = x0 - u.ux;
            u.dy = y0 - u.uy;
        }
    }
}

// C ref: hack.c domove_swap_with_pet(), successful ordinary starting-pet
// branch. domove() reaches this helper only after its admission seam has
// accepted ordinary terrain, a preflighted automatic-pickup transaction, no
// source or destination trap, an accessible source square, and ordinary pet
// state.
export async function domove_swap_with_pet(
    monster,
    x,
    y,
    state = game,
    env = {},
) {
    const message = env.message;
    if (typeof message !== 'function')
        throw new TypeError('pet swap requires a message operation');
    const { u } = state;
    const oldX = u.ux0;
    const oldY = u.uy0;

    monster.mundetected = false;
    monster.mtrapped = false;
    remove_monster(x, y, state);
    place_monster(monster, oldX, oldY, state);
    newsym(x, y);
    newsym(oldX, oldY);
    await message(
        `You swap places with ${alwaysVisibleMonsterName(monster, state)}.`,
        state,
    );
    return true;
}

// C ref: youprop.h Flying, which counts a flying steed as carrying the hero.
function heroIsFlying(state) {
    const flyingProperty = state.u?.uprops?.[FLYING] ?? {};
    return Boolean(
        (flyingProperty.intrinsic
            || flyingProperty.extrinsic
            || (state.u?.usteed && is_flyer(state.u.usteed.data)))
        && !flyingProperty.blocked,
    );
}

// C ref: hack.c domove(), the heavy-tread branch immediately after the hero
// position update.
export function hero_tread_disturbs_buried_zombies(state = game) {
    return !propertyActiveUnblocked(state, LEVITATION)
        && !heroIsFlying(state)
        && !propertyActiveUnblocked(state, STEALTH)
        && (state.youmonst?.data?.cwt ?? 0) >= (WT_ELF / 2);
}

// C ref: hack.c switch_terrain() (3178-3217). Terrain that blocks levitation
// blocks flight as well, and both of those arms refuse here. The first is out
// of reach because every ported caller admits its destination through
// requireSimpleHeroDestination() first, which lets no square satisfy
// `blocklev` through. The second refuses on any nonzero blocked mask, matching
// C's `else if (BLevitation)` and `else if (BFlying)`; the only writers of
// those two masks in this port are polyself.c float_vs_flight()'s I_SPECIAL
// assignments, which need a hero who already has Levitation or Flying, and
// nothing grants either yet. What is left reachable is the flags.terrainstatus
// tail.
export function switch_terrain(state = game) {
    const { u } = state;
    const lev = state.level?.at(u.ux, u.uy);
    const blocklev = Boolean(lev)
        && (IS_OBSTRUCTED(lev.typ) || closed_door(u.ux, u.uy, state)
            || IS_WATERWALL(lev.typ) || lev.typ === LAVAWALL);
    if (blocklev) {
        throw new UnsupportedHeroMoveBoundaryError(
            'switch_terrain() onto terrain that blocks levitation',
        );
    }
    if (state.u.uprops[LEVITATION].blocked
        || state.u.uprops[FLYING].blocked) {
        throw new UnsupportedHeroMoveBoundaryError(
            'switch_terrain() unblocking levitation or flight',
        );
    }
    // Neither Levitation nor Flying can have changed above, so the
    // disp.botl update at 3212-3213 cannot fire either.
    if (state.flags?.terrainstatus) classify_terrain(state);
}

// C ref: hack.c set_uinwater() (3220-3227), the single owner of u.uinwater.
// The switch_terrain() call fires only when the flag actually changes, so
// do.c goto_level()'s set_uinwater(0) for a hero who is not in water is inert.
// js/u_init.js stores u.uinwater as a boolean where C stores a one-bit field,
// so compare and assign booleans here rather than C's 0 and 1.
export function set_uinwater(in_out, state = game) {
    const value = Boolean(in_out);
    if (value !== Boolean(state.u.uinwater)) {
        state.u.uinwater = value;
        switch_terrain(state);
    }
}

// C ref: hack.c pooleffects() (3233-3311). This is the shared liquid
// transition owner for spoteffects() and for a hero who spends a turn without
// moving. It returns true only when dismounting, drowning, or burning moves
// the hero and the caller must skip the rest of its square effects.
export async function pooleffects(newspot, state = game) {
    const { u } = state;
    const levitating = propertyActiveUnblocked(state, LEVITATION);
    const flying = heroIsFlying(state);
    const waterWalking = propertyActiveUnblocked(state, WWALKING);
    const swimming = propertyActiveUnblocked(state, SWIMMING)
        || Boolean(u.usteed && is_swimmer(u.usteed.data));
    const breathlessHero = propertyActiveUnblocked(
        state,
        MAGICAL_BREATHING,
    ) || breathless(state.youmonst?.data);
    const amphibiousHero = breathlessHero || amphibious(state.youmonst?.data);

    if (u.uinwater) {
        let stillInWater = false;
        if (!is_pool(u.ux, u.uy, state)) {
            if (Is_waterlevel(u.uz)) {
                await ttyPline('You pop into an air bubble.', state);
                state.iflags.last_msg = PLNMSG_BACK_ON_GROUND;
            } else if (is_lava(u.ux, u.uy, state)) {
                await ttyPline(
                    `You leave the ${hliquid('water', { state })}...`,
                    state,
                );
            } else {
                await back_on_ground(false, state);
            }
        } else if (Is_waterlevel(u.uz)) {
            stillInWater = true;
        } else if (levitating) {
            await ttyPline(
                `You pop out of the ${hliquid('water', { state })} like a cork!`,
                state,
            );
        } else if (flying) {
            await ttyPline(
                `You fly out of the ${hliquid('water', { state })}.`,
                state,
            );
        } else if (waterWalking) {
            await ttyPline('You slowly rise above the surface.', state);
        } else {
            stillInWater = true;
        }
        if (!stillInWater) {
            const wasUnderwater = Boolean(
                u.uinwater && !Is_waterlevel(u.uz),
            );
            set_uinwater(false, state);
            if (wasUnderwater) {
                await docrt({ state });
                state.vision_full_recalc = 1;
            }
        }
    }

    if (!u.ustuck && !levitating && !flying
        && is_pool_or_lava(u.ux, u.uy, state)) {
        if (u.usteed && !grounded(u.usteed.data, state)) {
            return false;
        }
        if (u.usteed) {
            const { dismount_steed } = await import('./steed.js');
            await dismount_steed(
                u.uinwater ? DISMOUNT_FELL : DISMOUNT_GENERIC,
                state,
            );
            if (Is_airlevel(u.uz) || Is_waterlevel(u.uz)) return false;
            if (newspot) await check_special_room(false, state);
            return true;
        }
        if (Upolyd(u) && ceiling_hider(state.mons?.[u.umonnum])
            && u.uundetected) {
            return false;
        }
        if (is_lava(u.ux, u.uy, state)) {
            if (await lava_effects(state)) return true;
        } else {
            const isWaterWall = IS_WATERWALL(
                state.level?.at(u.ux, u.uy)?.typ,
            );
            if ((!waterWalking || isWaterWall)
                && (newspot || !u.uinwater
                    || !(swimming || amphibiousHero || breathlessHero))) {
                if (await drown(state)) return true;
            }
        }
    }
    return false;
}

// C ref: hack.c spoteffects():3345-3347, the terrain test that guards
// switch_terrain(). teleport.c teleds():551-552 has a test of its own with the
// same call, so this one is written where spoteffects() has it rather than
// folded into switch_terrain().
export function terrain_changed_under_hero(state = game) {
    const { u } = state;
    const current = state.level?.at(u.ux, u.uy);
    const previous = state.level?.at(u.ux0, u.uy0);
    if (!current || !previous) return false;
    return current.typ !== previous.typ
        || state.iflags?.terrain_typ === MAX_TYPE;
}

// C ref: hack.c spoteffects() (3312-3462), the arms an ordinary ROOM, CORR,
// IS_FURNITURE or open doorway square reaches, plus the trap arm at 3373-3398.
// Its two ported callers, domove() and teleport.c teleds(), each admit their
// destination through requireSimpleHeroDestination() first, which refuses
// every square that could reach the pool, lava or ice-warning arms and hands
// the trap arm's admission to preflight_dotrap(); the recursion guard and the
// iflags.in_lava_effects return are unreachable for the same reason. The
// resident-monster arm at 3417-3455 is kept out by the callers instead:
// domove() reaches this seam only when m_at() answered null, and teleds()
// makes that test itself. The sink arm is the one an admitted destination can
// now reach, so it is refused here rather than ahead of the move.
//
// gi.in_steed_dismounting is C's kludge for the one caller that needs the
// pickup deferred: steed.c dismount_steed() sets it around its teleds() call
// and then lets float_down() run pickup(1) exactly once.
export async function spoteffects(pick, state = game) {
    const trap = t_at(state.u.ux, state.u.uy, state);
    // C ref: hack.c:3322. untrap.c is not ported and nothing sets the flag, so
    // FAILEDUNTRAP never reaches dotrap() -- but the read belongs here, where
    // C makes it, rather than being written out as the constant 0.
    const trapflag = state.iflags?.failing_untrap ? FAILEDUNTRAP : 0;
    if (await pooleffects(true, state)) return;
    if (terrain_changed_under_hero(state)) switch_terrain(state);
    await check_special_room(false, state);
    // C ref: hack.c:3353-3354, spoteffects()'s only IS_FURNITURE arm. Nothing
    // in this port grants levitation, so the arm is unreachable today, but
    // admitting a sink as a destination is what makes it reachable in
    // principle; sit.c dosinkfall() has no owner.
    if (IS_SINK(state.level?.at(state.u.ux, state.u.uy)?.typ)
        && propertyActiveUnblocked(state, LEVITATION)) {
        await dosinkfall(state);
    }
    if (!state.in_steed_dismounting) {
        // C ref: hack.c:3362-3372. A levitation about to time out at the end
        // of this turn would let the trap fire twice, so C spends an rn2(2) to
        // move the timeout out of the way. No ported source grants timed
        // levitation -- js/timeout.js refuses any property timeout it does not
        // own -- so HLevitation's timeout field is never 1 and the draw is
        // unreachable rather than skipped.
        //
        // C ref: hack.c:3379-3398. Which of pickup(1) and dotrap() goes first
        // is decided by is_pit() alone: the hero picks up what is lying on an
        // ordinary trap before it fires, and falls into a pit before picking
        // anything up from its floor. A bear trap is not a pit, which is why
        // the object pile is described first and the trap line arrives on the
        // next screen.
        const pit = Boolean(trap && is_pit(trap.ttyp));
        if (pick && !pit) await pickup(1, state);
        // C's spottrap/spottraptyp statics at 3388-3396 guard against a fire
        // trap re-entering spoteffects() through melt_ice(); no ported trap
        // effect recurses, so the guard has nothing to suppress.
        if (trap) await dotrap(trap, trapflag, state);
        if (pick && pit) await pickup(1, state);
    }
}

// C ref: hack.c monstinroom() (3466-3481). Monster species objects model C's
// `struct permonst *`, so identity comparison preserves the source test.
export function monstinroom(mdat, roomno, state = game) {
    for (let mtmp = state.level?.monlist ?? null;
        mtmp;
        mtmp = mtmp.nmon) {
        if ((mtmp.mhp ?? 0) < 1) continue;
        if (mtmp.data === mdat
            && in_rooms(mtmp.mx, mtmp.my, 0, state).includes(
                roomno + ROOMOFFSET,
            )) {
            return mtmp;
        }
    }
    return null;
}

// C ref: hack.c furniture_present() (3482-3497). The inclusive bounds and
// inside_room() test both matter for edge furniture and irregular rooms.
export function furniture_present(furniture, roomno, state = game) {
    const sroom = state.level?.rooms?.[roomno];
    if (!sroom) return false;
    for (let y = sroom.ly; y <= sroom.hy; ++y) {
        for (let x = sroom.lx; x <= sroom.hx; ++x) {
            if (state.level.at(x, y)?.typ === furniture
                && inside_room(sroom, x, y, state)) {
                return true;
            }
        }
    }
    return false;
}

// C ref: flag.h:233 notice_mon_off(). Suspends the accessibility monster
// notices while a caller emits messages of its own.
export function notice_mon_off(state = game) {
    state.a11y ??= {};
    state.a11y.mon_notices_blocked
        = (state.a11y.mon_notices_blocked ?? 0) + 1;
}

// C ref: flag.h:234-237 notice_mon_on(). C reports an unpaired resume through
// impossible() and clamps to zero; this throws instead, because a negative
// count means a caller lost its notice_mon_off() and would silently start
// noticing monsters again mid-message.
export function notice_mon_on(state = game) {
    state.a11y ??= {};
    const blocked = (state.a11y.mon_notices_blocked ?? 0) - 1;
    if (blocked < 0) throw new Error('mon_notices_blocked<0');
    state.a11y.mon_notices_blocked = blocked;
}

// C ref: hack.c notice_all_mons() (1744-1782). Announces every monster the
// hero can now spot, nearest first, after a notice_mon_off()/notice_mon_on()
// pair suspended the per-monster notices.
export async function notice_all_mons(reset, state = game, env = {}) {
    if (!reset) {
        // reset differs from TRUE only when nothing is spottable, where it
        // leaves each monster's mspotted alone instead of clearing it.
        // teleds() is the only ported caller and passes TRUE.
        throw new UnsupportedHeroMoveBoundaryError('notice_all_mons(FALSE)');
    }
    if (!state.a11y?.mon_notices || state.a11y?.mon_notices_blocked) return;
    const message = env.message ?? ttyPline;
    for (const line of collectMonsterNoticeMessages(
        state,
        (left, right) => notice_mons_cmp(left, right, state),
    ))
        await message(line, state);
}

// C ref: hack.c u_locomotion() (1817-1829). The hero's own movement verb.
// mondata.c locomotion() cannot answer it, because its is_flyer() and
// is_floater() tests read a monster form rather than the hero's properties.
export function u_locomotion(def, state = game) {
    if (propertyActiveUnblocked(state, LEVITATION))
        return def[0] === highc(def[0]) ? 'Float' : 'float';
    if (heroIsFlying(state))
        return def[0] === highc(def[0]) ? 'Fly' : 'fly';
    return locomotion(state.youmonst.data, def);
}

// C ref: hack.c invocation_message() (3064-3085). invocation_pos() first
// checks Invocation_lev(), so non-Invocation levels return without touching
// movement or message state. The clue-producing Invocation-level branch stays
// fail-closed until its fixed vibrating-square behavior is ported.
export function invocation_message(state = game) {
    if (!Invocation_lev(state.u.uz, state)) return;
    throw new UnsupportedHeroMoveBoundaryError(
        'invocation_message() on the Invocation level',
    );
}

// C ref: hack.c maybe_smudge_engr(). Each eligible engraving consumes rnd(5)
// before wipe_engr_at() applies its type-specific erosion draws.
export function maybe_smudge_engr(
    x1,
    y1,
    x2,
    y2,
    state = game,
    random = { rn2, rnd },
) {
    if (!can_reach_floor(true, state)) return false;
    let smudged = false;
    const smudge = (x, y) => {
        const engraving = engr_at(x, y, state);
        if (!engraving || engraving.engr_type === HEADSTONE) return;
        wipe_engr_at(x, y, random.rnd(5), false, { state, random });
        smudged = true;
    };
    smudge(x1, y1);
    if (x2 !== x1 || y2 !== y1) smudge(x2, y2);
    return smudged;
}

// C ref: hack.c disturb_buried_zombies(). Nearby noise shortens only active
// zombification timers; other corpse timers and distant burials are untouched.
export function disturb_buried_zombies(x, y, state = game) {
    for (let obj = state.level?.buriedobjlist ?? null;
        obj;
        obj = obj.nobj) {
        if (obj.otyp !== CORPSE
            || !obj.timed
            || obj.ox < x - 1
            || obj.ox > x + 1
            || obj.oy < y - 1
            || obj.oy > y + 1
            || peek_timer(ZOMBIFY_MON, obj, state) <= 0) {
            continue;
        }
        const remaining = stop_timer(ZOMBIFY_MON, obj, state);
        start_timer(
            Math.max(1, Math.trunc(remaining * 2 / 3)),
            TIMER_OBJECT,
            ZOMBIFY_MON,
            obj,
            state,
        );
    }
}

// C refs: hack.c may_dig() and may_passwall().
export function may_dig(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !((IS_STWALL(location.typ) || IS_TREE(location.typ, state))
        && ((location.wall_info ?? 0) & W_NONDIGGABLE));
}

export function may_passwall(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !(IS_STWALL(location.typ)
        && ((location.wall_info ?? 0) & W_NONPASSWALL));
}

// C ref: hack.c bad_rock(), specialized only by its supplied monster species.
export function bad_rock(species, x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return true;
    return Boolean(
        (state.level?.flags?.sokoban_rules && sobj_at(BOULDER, x, y, state))
        || (IS_OBSTRUCTED(location.typ)
            && (!tunnels(species) || needspick(species)
                || !may_dig(x, y, state))
            && !(passes_walls(species) && may_passwall(x, y, state))),
    );
}

// C ref: hack.c cant_squeeze_thru(). The caller has already decided that the
// diagonal is tight; this reports why the mover cannot fit through it -- 1:
// too big, 2: possessions too heavy, 3: Sokoban -- or 0 when it can squeeze.
//
// C's `mon == &gy.youmonst` tests are what separate its hero and monster
// callers -- hack.c:1156 and 4100 for the hero, mon.c:2346 for a monster --
// so both branches live here rather than in two files. The hero reads the Passes_walls property
// and inv_weight() + weight_cap(), which is the plain inventory weight because
// inv_weight() returns that same total minus that same capacity; a monster
// reads its species and curr_mon_load(). Only the hero is stopped by Sokoban.
export function cant_squeeze_thru(mon, state = game) {
    const hero = mon === state.youmonst;
    const species = mon?.data;
    if (hero ? propertyPresent(state, PASSES_WALLS) : passes_walls(species))
        return 0;

    /* too big? */
    if (bigmonst(species)
        && !(amorphous(species) || is_whirly(species)
            || noncorporeal(species) || slithy(species)
            || can_fog(mon, state))) {
        return 1;
    }

    /* lugging too much junk? */
    // inv_weight() refreshes gw.wc as C's does; that write belongs wherever C
    // calls the function, which includes here.
    const amt = hero
        ? inv_weight(state) + weight_cap(state)
        : curr_mon_load(mon);
    if (amt > WT_TOOMUCH_DIAGONAL) return 2;

    /* Sokoban restriction applies to hero only */
    if (hero && state.level?.flags?.sokoban_rules) return 3;

    return 0;
}
