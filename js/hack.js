// Movement-adjacent world effects owned by hack.c.

import {
    ACCESSIBLE,
    A_CON,
    A_DEX,
    A_STR,
    ALTAR,
    AUTOUNLOCK_APPLY_KEY,
    AUTOUNLOCK_KICK,
    BLINDED,
    COLD_RES,
    CONFUSION,
    COLNO,
    CORR,
    DIED,
    DISINT_RES,
    DOOR,
    DO_MOVE,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    CQ_CANNED,
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
    GOLD_SYM,
    HALLUC,
    HALLUC_RES,
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
    INTRINSIC,
    INVIS,
    LAVAWALL,
    LEFT_SIDE,
    LEVITATION,
    MAX_CARR_CAP,
    MAX_TYPE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    N_DIRS,
    PASSES_WALLS,
    PICK_NONE,
    POISON_RES,
    RIGHT_SIDE,
    ROWNO,
    ROOM,
    RUN_CRAWL,
    RUN_LEAP,
    RUN_TPORT,
    SCORR,
    SDOOR,
    SEE_INVIS,
    SHOCK_RES,
    SLEEP_RES,
    STAIRS,
    STEALTH,
    STONE,
    STUNNED,
    TELEPORT,
    TELEPORT_CONTROL,
    TEST_TRAV,
    TEST_TRAP,
    TEST_MOVE,
    TRAVP_TRAVEL,
    TRAVP_VALID,
    TIMER_OBJECT,
    TIP_GETPOS,
    TT_BEARTRAP,
    Upolyd,
    VIBRATING_SQUARE,
    WEB,
    WOUNDED_LEGS,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    WT_ELF,
    WT_SQUEEZABLE_INV,
    WT_HUMAN,
    WT_WEIGHTCAP_SPARE,
    WT_WEIGHTCAP_STRCON,
    WT_TOOMUCH_DIAGONAL,
    WT_WOUNDEDLEG_REDUCT,
    ZOMBIFY_MON,
    OVERLOADED,
    PROT_FROM_SHAPE_CHANGERS,
    helpless,
    is_pit,
    isok,
    u_at,
    xdir,
    ydir,
} from './const.js';
import { acurrstr, effective_attribute, exercise } from './attrib.js';
import {
    bot,
    classify_terrain,
    feel_location,
    flush_screen,
    glyph_at,
    glyph_is_cmap,
    glyph_is_invisible,
    glyph_to_cmap,
    newsym,
    back_to_glyph,
    unmap_invisible,
    unmap_object,
    wall_angle,
} from './display.js';
// cmd.c owns the command queue and js/cmd.js already imports this file, so
// this pair of modules forms an import cycle. Only the hoisted function
// declaration is used, and only at call time, so neither module reads the
// other during evaluation.
import { cmdq_clear } from './cmd.js';
import { clear_kickedloc } from './dokick.js';
import { dig_typ } from './dig.js';
import { alwaysVisibleMonsterName, hliquid } from './do_name.js';
import { Invocation_lev, u_on_newpos } from './dungeon.js';
import { gethungry } from './eat.js';
import { done } from './end.js';
import { dist2, highc } from './hacklib.js';
import {
    can_reach_floor,
    engr_at,
    wipe_engr_at,
} from './engrave.js';
import { game } from './gstate.js';
import { doopen_indir } from './lock.js';
import {
    amorphous,
    attacktype,
    bigmonst,
    is_flyer,
    is_hider,
    is_rider,
    is_whirly,
    needspick,
    locomotion,
    noattacks,
    nohands,
    noncorporeal,
    passes_walls,
    slithy,
    strongmonst,
    throws_rocks,
    tunnels,
    verysmall,
} from './mondata.js';
import {
    is_pick,
    objectType,
    place_object,
    remove_object,
    sobj_at,
} from './obj.js';
import {
    assertObjectNameable,
    assertPricedObjectNameable,
    the,
    UnsupportedObjectNameError,
    xnameFresh,
} from './objnam.js';
import {
    BOULDER,
    COIN_CLASS,
    CORPSE,
    CREDIT_CARD,
    LOCK_PICK,
    SKELETON_KEY,
    STATUE,
    WATER_WALKING_BOOTS,
} from './objects.js';
import {
    AT_EXPL,
    PM_DISPLACER_BEAST,
    PM_ELF,
    PM_GRID_BUG,
    PM_KITTEN,
    PM_LITTLE_DOG,
    PM_PONY,
    PM_VALKYRIE,
    PM_WIZARD,
    PM_WIZARD_OF_YENDOR,
    MZ_MEDIUM,
    S_NYMPH,
} from './monsters.js';
import { curr_mon_load, maybe_unhide_at } from './mon.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import {
    accessible,
    can_fog,
    closed_door,
    onscary,
    youHear,
} from './monmove.js';
import {
    encumber_msg,
    pickup,
    preflight_describe_decor_at,
    preflight_projected_random_arrival_pickup,
    UnsupportedPickupError,
} from './pickup.js';
import { in_out_region, inside_region, visible_region_at } from './region.js';
import { rn2, rnd } from './rng.js';
import { check_special_room } from './rooms.js';
import {
    costly_spot,
    preflight_shop_transition,
    UnsupportedShopError,
} from './shk.js';
import {
    canSpotMonster,
    collectMonsterNoticeMessages,
    is_db_wall,
    is_drawbridge_wall,
    messageAt,
    monsterVisible,
    sensesMonster,
} from './startup_a11y.js';
import { exercise_steed, stucksteed } from './steed.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { S_hcdoor, S_stone, S_tree, S_vcdoor } from './symbols.js';
import {
    peek_timer,
    start_timer,
    stop_timer,
} from './timeout.js';
import {
    is_lava,
    is_pool,
    is_pool_or_lava,
    reset_utrap,
    t_at,
} from './trap.js';
import { dotrap, preflight_dotrap } from './trap_effects.js';
import {
    ttyNorep, ttyPline, ttyUrgentPline,
} from './tty_message.js';
import { select_menu } from './windows.js';
import { do_attack, is_safemon } from './uhitm.js';
import {
    block_point,
    couldsee,
    recalc_block_point,
    vision_recalc,
} from './vision.js';

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);

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

// C ref: hack.c handle_tip() (1852-1880), TIP_GETPOS arm. Other tip owners
// retain their existing local implementations until a running caller needs
// this shared dispatcher. The bit is set before the Lua callback runs.
export async function handle_tip(tip, state = game, env = {}) {
    if (!state.flags?.tips) return false;
    state.context ??= {};
    const tips = Math.trunc(state.context.tips ?? 0);
    if (tip < 0 || tip >= 4 || (tips & (1 << tip))) return false;
    state.context.tips = tips | (1 << tip);
    if (tip !== TIP_GETPOS)
        throw new UnsupportedHeroMoveBoundaryError(`handle_tip(${tip})`);
    const textWindow = env.textWindow ?? (async (lines) => select_menu(state, {
        how: PICK_NONE,
        items: lines,
        cancelValue: null,
        overlay: state.iflags?.menu_overlay !== false,
    }));
    await textWindow(GETPOS_TIP_LINES.map((text) => ({ text })));
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
        acurrstr(state) + effective_attribute(state, A_CON)
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

// C ref: hack.c monster_nearby(). This deliberately has stricter concealment,
// disposition, helplessness, and scare checks than canspotmon().
export function monsterNearby(state = game) {
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
export function endRunning(state = game, andTravel = true) {
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
    endRunning(state);
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

// A hit point loss whose consequences this port has not reached.
export class UnsupportedHitPointLossError extends Error {
    constructor(reason) {
        super(`unsupported hit point loss: ${reason}`);
        this.name = 'UnsupportedHitPointLossError';
        this.reason = reason;
    }
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

async function maybe_wail(state) {
    if (state.moves <= (state.wailmsg ?? 0) + 50) return;

    state.wailmsg = state.moves;
    const role = state.urole?.mnum;
    if (role === PM_WIZARD || state.urace?.mnum === PM_ELF
        || role === PM_VALKYRIE) {
        const who = (role === PM_WIZARD || role === PM_VALKYRIE)
            ? state.urole.name.m : 'Elf';

        if (state.u.uhp === 1) {
            await ttyPline(`${who} is about to die.`, state);
        } else {
            let powercnt = 0;
            for (const power of WAIL_POWERS) {
                if (state.u.uprops?.[power]?.intrinsic & INTRINSIC)
                    ++powercnt;
            }
            await ttyPline(
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
        if (line !== null) await ttyPline(line, state);
    }
}

// C ref: hack.c showdamage() (4245-4253). options.c leaves iflags.showdamage
// off, so an ordinary game prints nothing here.
//
// `message` exists because mhitu.c mdamageu() calls this from inside a monster
// turn, and js/unported_monster_actions.js runs every monster turn twice: once
// against a clone, to find out whether it can be replayed, and then live. With
// `showdamage` on, the default would write the clone's line to the live
// terminal. losehp() runs on the hero's own turn and needs no such seam.
export async function showdamage(dmg, state, env = {}) {
    if (!state.iflags?.showdamage || !dmg) return;
    const message = env.message ?? ttyPline;

    await message(`[HP ${-dmg}, ${Upolyd(state.u) ? state.u.mh : state.u.uhp}`
        + ' left]', state);
}

// C ref: hack.c losehp() (4255-4292). `knam` and `k_format` describe the
// killer; only the death branch records them, and only end.c done() reads them
// back.
export async function losehp(n, knam, k_format, state = game) {
    state.disp ??= {};
    state.disp.botl = true; /* u.uhp or u.mh is changing */
    endRunning(state);
    if (Upolyd(state.u)) {
        // Nothing in this port polymorphs the hero, so u.mh, rehumanize() and
        // the Unchanging wail have no reachable caller. The branch stops
        // rather than duplicating hit points into a second unowned field.
        throw new UnsupportedHitPointLossError('damage to a polymorphed hero');
    }

    state.u.uhp -= n;
    await showdamage(n, state);
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
        await maybe_wail(state);
    }
}

function heroIsBlind(state) {
    const blindness = state.u?.uprops?.[BLINDED];
    return Boolean(
        (blindness?.intrinsic || blindness?.extrinsic)
        && !blindness?.blocked,
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
    return !loc || loc.typ === STONE || IS_WALL(loc.typ)
        || IS_TREE(loc.typ, state);
}

// C ref: hack.c:1140-1141, the condition on test_move()'s testdiag arm. A
// doorway that still has its door refuses a diagonal entry.
//
// block_door() is omitted, and the reason has moved. It used to be that
// mklev.c:1349 gates every randomly placed shop on `u_depth > 1` and this
// boundary reached no such level; the ported descent now does generate D:2
// shops. What is left is shk.c:5815's final term, `debit || billct ||
// robbed`: js/shknam.js:319-326 and js/makemon_create.js:468-480 initialize
// all three to zero and nothing in this port writes any of them, so a
// shopkeeper is never owed and the predicate stays FALSE.
// blocksDiagonalDoorwayExit()'s block_entry() (shk.c:5826) is absent for the
// same reason, and additionally needs a D_BROKEN hero square, which neither
// admission seam allows.
function blocksDiagonalDoorwayEntry(ux, uy, x, y, state) {
    return Boolean((x - ux) && (y - uy)
        && !propertyPresent(state, PASSES_WALLS)
        && !doorless_door(state.level?.at(x, y)));
}

// C ref: hack.c:1208-1209. The mirror rule: a doorway that still has its door
// refuses a diagonal exit, whatever the destination is.
function blocksDiagonalDoorwayExit(ux, uy, x, y, state) {
    const source = state.level?.at(ux, uy);
    return Boolean((x - ux) && (y - uy)
        && !propertyPresent(state, PASSES_WALLS)
        && IS_DOOR(source?.typ) && !doorless_door(source));
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
// IS_FURNITURE square, or a doorway whose mask is exactly D_NODOOR or
// D_ISOPEN. With autopickup disabled, it also admits the sighted object
// descriptions and, now that js/dungeon.js surface() names every terrain
// look_here() can feel underfoot, the blind paths with no object or one
// object. Blind paths that would describe an object pile remain refused.
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
    // Only D_NODOOR and D_ISOPEN are admitted, the two masks recorded against
    // the C program. D_BROKEN behaves like D_NODOOR in doorless_door() but
    // differs in dfeature_at(), which returns the literal "broken door" where
    // the other two go through the cmap, so it is refused rather than assumed
    // equivalent. It is a mask a level really can carry: sp_lev.c
    // lspo_door():4702 rolls rnddoor() for `state = "random"`, and its
    // coordinate arm at 4721-4726 hands that roll to sel_set_door() (4646-4662)
    // to write as the doormask. dat/tut-1.lua:273 takes that arm, so the
    // tutorial's door at map [40,15] is D_BROKEN on about one seed in five. The
    // room-door arm at 4704-4720 cannot: it passes `msk`, still -1, to
    // create_door(), which rerolls a state that has no D_BROKEN in it.
    // D_TRAPPED is excluded too: C admits an open trapped door here because
    // its trap fires from doopen(), not from entry, but that path is not
    // traced yet, so it stays refused.
    const mask = doorMask(location);
    const doorway = location?.typ === DOOR
        && (mask === D_NODOOR || mask === D_ISOPEN);
    const ordinaryDestination = location
        && (location.typ === ROOM
            || location.typ === CORR
            || IS_FURNITURE(location.typ)
            || doorway);
    if (!ordinaryDestination) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door or special terrain movement',
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
    // C ref: hack.c test_move():1216-1231. moverock() runs inside test_move(),
    // above everything spoteffects() and pickup() do after the move, so the
    // boulder question is asked before them here too.
    const boulder = pushesBoulder ? sobj_at(BOULDER, x, y, state) : null;
    if (boulder) preflight_moverock(x, y, noPickMove, state);
    else if (sobj_at(BOULDER, x, y, state))
        throw new UnsupportedHeroMoveBoundaryError('boulder movement');
    // preflight_moverock() admits only a square whose whole pile is that one
    // boulder, and moverock() clears it off <x,y> before domove_core() commits
    // the step, so every question below reads the square as empty.
    const floorObject = boulder
        ? null
        : (state.level?.objects?.[x]?.[y] ?? null);
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
// outside D_NODOOR and D_BROKEN is set. Both of test_move()'s diagonal rules
// turn on this predicate, so they read it here rather than testing masks
// themselves. The Is_rogue_level() arm is not ported: the rogue level is not
// reachable from this boundary.
export function doorless_door(location) {
    return location?.typ === DOOR
        && (doorMask(location) & ~(D_NODOOR | D_BROKEN)) === 0;
}

// C ref: hack.c:1097, the autoopen test. TRUE where test_move() falls through
// to the bump arm and its "That door is closed." sibling instead of pulling at
// the door. Only the two terms this port admits are here; the three it refuses
// are named in requireAutoopenClosedDoor(), which rejects them before any
// caller asks this.
function autoopenSuppressed(state, run) {
    return !state.flags?.autoopen || Boolean(run);
}

// This seam owns the two routes through hack.c test_move()'s closed-door arm
// (1074-1137) that the port covers: a walking hero in ordinary form with
// `autoopen` set, pulling at a door lock.c doopen_indir() (780-923) can answer
// for, and the same hero with the pull suppressed, who bumps into the door or
// is told it is closed. Every other state those two functions branch on stops
// here, named for the C condition that diverges. Both the command admission
// seam and test_move() call it, as they do requireSimpleHeroDestination().
// `run` is a parameter rather than a read of `state.context.run` because the
// admission seam runs before `executeMovement()` commits the intent: at
// `js/cmd.js` the preflight is called first and `state.context.run = run` only
// afterwards, so the field still holds the previous command's value there.
// `runStopsBeforeMonster()` takes `run` for the same reason.
function requireAutoopenClosedDoor(x, y, state, run) {
    const data = state.youmonst?.data;
    const u = state.u;
    // hack.c:1076 feels the square before the branch, feel_newsym() at
    // lock.c:914 takes its blind arm, and Blind is the first of the four
    // terms hack.c:1113-1114 gates the bump on. All three stay refused.
    // Blindness cannot decide this arm on its own, but the reason is narrower
    // than it looks: of the gate's other three terms, Stunned and Fumbling are
    // refused below in this same function, so `ACURR(A_DEX) < 10` is the only
    // live one and is what keeps the bump arm reachable at all. If a later
    // slice narrows or moves the Dexterity test, the arm goes dark. Blindness's
    // only start-of-game source is optlist.h:211's `permablind`, which sets
    // u.uroleplay.blind at u_init.c:1027 and changes what every square of the
    // level draws from turn one, well outside this arm.
    if (heroIsBlind(state)) {
        throw new UnsupportedHeroMoveBoundaryError('blind door opening');
    }
    // hack.c:1078-1090, the four forms that pass a closed door instead of
    // opening it. can_ooze() and the "can't squeeze your possessions through"
    // notice both start at amorphous(), so refusing that covers them; a dwarf
    // tunnels() but also needspick(), which is why both are read.
    if (propertyPresent(state, PASSES_WALLS)
        || amorphous(data)
        || u.uinwater
        || (tunnels(data) && !needspick(data))) {
        throw new UnsupportedHeroMoveBoundaryError(
            'door bypassed rather than opened',
        );
    }
    // hack.c:1097's three remaining suppression terms. Each of them lands in
    // the same bump arm that `!flags.autoopen` and a nonzero svc.context.run
    // reach, but the hero carrying one diverges before test_move() is called
    // at all: domove_core() runs impaired_movement() (hack.c:2425) first,
    // which rerolls the step through confdir() for a stunned or confused hero
    // and draws u_maybe_impaired()'s rn2(5) for the confused one. Neither is
    // ported. Fumbling joins them because nothing in this port creates it:
    // `grep -rn FUMBLING js/` finds readers only, so admitting it would port a
    // branch against a state the game cannot reach.
    if (propertyIntrinsic(state, CONFUSION)
        || propertyIntrinsic(state, STUNNED)) {
        throw new UnsupportedHeroMoveBoundaryError('impaired movement');
    }
    if (propertyPresent(state, FUMBLING)) {
        throw new UnsupportedHeroMoveBoundaryError('fumbling movement');
    }
    // hack.c:1115-1117's "You can't lead <steed> through that closed door."
    // needs y_monnam(). That is the whole live basis: it sits inside the
    // Dexterity gate, so a mounted hero with ACURR(A_DEX) >= 10 takes
    // hack.c:1132's "That door is closed." exactly as an unmounted one does,
    // and lock.c:884's kick guard cannot decide the pull either while the
    // autounlock refusal below stands. The guard is therefore deliberately
    // wider than C, refusing every mounted case to own the one that diverges.
    if (u.usteed) {
        throw new UnsupportedHeroMoveBoundaryError('closed door on a steed');
    }
    // A monster on the closed door has already been offered to
    // domove_attackmon_at() by the time test_move() runs, both in C
    // (hack.c:2798 against 2843) and in domove(). C attacks it, or -- for a pet
    // do_attack() declines -- opens the door under it; this arm would open the
    // door either way. lock.c:826 stumble_on_door_mimic() is that square seen
    // from doopen_indir().
    //
    // The guard stays defensive. requireOrdinaryStartingPetSwap() admits only a
    // ROOM, CORR, IS_FURNITURE or D_NODOOR destination, and both
    // preflightDomoveDestination() and domove() call it above do_attack(), so a
    // monster on a closed door stops as 'door or special terrain movement'
    // first. This is what keeps that closed now that test_move() runs with the
    // destination monster still standing there.
    if (m_at(x, y, state)) {
        throw new UnsupportedHeroMoveBoundaryError('monster on a closed door');
    }
    // A held hero never gets as far as test_move(): domove_core():2830 hands
    // the step to trapmove() and returns unless it escapes, and no arm this
    // port reaches escapes. So only the admission seam asks this, and only for
    // the trap types heldStepIgnoresDestination() leaves to it -- every one of
    // which trapmove() stops on in turn, one call later. lock.c:815 refuses
    // the pull for a hero in a pit from the other side.
    if (u.utrap) {
        throw new UnsupportedHeroMoveBoundaryError('held hero movement');
    }
    // hack.c:1097. The remaining refusals belong to doopen_indir(), which only
    // the pull reaches; the bump arm and its "That door is closed." sibling
    // leave the door alone, so none of them applies there.
    if (autoopenSuppressed(state, run)) return;
    // lock.c:790 nohands() and :898 verysmall().
    if (nohands(data) || verysmall(data)) {
        throw new UnsupportedHeroMoveBoundaryError('door opening interrupted');
    }
    // lock.c:826. is_drawbridge_wall() makes the door a portcullis and diverts
    // the whole function into its drawbridge messages. Call the ported
    // predicate rather than an adjacency test: dbridge.c:148-159 requires the
    // neighbour's DB_DIR to point back at this square, so a bare adjacency
    // check refuses a superset, including a DOOR whose neighbouring bridge
    // faces away from it.
    if (is_drawbridge_wall(x, y, state)) {
        throw new UnsupportedHeroMoveBoundaryError('portcullis');
    }
    // monmove.c closed_door() is a bit test, not an equality test: it answers
    // TRUE for any mask carrying D_LOCKED or D_CLOSED, D_TRAPPED included. So
    // this guard is what selects the masks js/lock.js answers for, rather than
    // a restatement of closed_door(); deleting it as redundant would let a
    // trapped door reach the pull.
    //
    // D_CLOSED takes lock.c:904's roll and D_LOCKED takes the lock.c:855
    // message switch. D_LOCKED | D_TRAPPED joins them because lock.c:855 tests
    // only D_CLOSED, so 0x18 enters the same switch, prints the same line and
    // returns at :895 -- the b_trapped() and add_damage() tail at :907-911 is
    // inside the "known to be CLOSED" arm and needs D_CLOSED to run.
    // D_CLOSED | D_TRAPPED stays refused, because its roll really does reach
    // that tail on success.
    const mask = doorMask(state.level?.at(x, y));
    if (mask !== D_CLOSED && mask !== D_LOCKED
        && mask !== (D_LOCKED | D_TRAPPED)) {
        throw new UnsupportedHeroMoveBoundaryError('trapped or unusual door');
    }
    if (mask !== D_CLOSED) {
        // lock.c:876-894. doopen_indir() now handles the autounlock apply-key
        // path by calling autokey() and pick_lock() itself. The kick arm is
        // an `else if` in C: it fires only when apply-key did not handle the
        // door (no APPLY_KEY flag, or no tool in inventory).
        const autounlock = state.flags?.autounlock
            ?? AUTOUNLOCK_APPLY_KEY;
        // lock.c:884-893. AUTOUNLOCK_KICK asks "Kick it?" through ynq() and
        // queues dokick. Refuse it only when apply-key will not handle the
        // door first: either APPLY_KEY is not set, or it is set but
        // carriesUnlockingTool() finds no tool. When APPLY_KEY is set and a
        // tool exists, doopen_indir handles the door and C's `else if` means
        // kick never runs.
        const applyKeyHandles = (autounlock & AUTOUNLOCK_APPLY_KEY)
            && carriesUnlockingTool(state);
        if ((autounlock & AUTOUNLOCK_KICK) && !applyKeyHandles) {
            throw new UnsupportedHeroMoveBoundaryError('autounlock kick prompt');
        }
    }
}

// The inventory test behind lock.c autokey(TRUE) != 0, without picking the
// tool. Every branch of that function starts from one of these three object
// types, so carrying any of them is what routes a locked door into
// pick_lock().
function carriesUnlockingTool(state) {
    for (let object = state.invent; object; object = object.nobj) {
        if (object.otyp === SKELETON_KEY
            || object.otyp === LOCK_PICK
            || object.otyp === CREDIT_CARD) {
            return true;
        }
    }
    return false;
}

// C ref: hack.c domove_bump_mon() (1924-1948), which domove_core() calls at
// 2794, one line above domove_attackmon_at(). With the reqmenu prefix pending
// it claims the step outright -- "Pardon me, Fido." for a peaceful target,
// "You move right into the newt." for a hostile one -- and spends the turn
// without reaching do_attack(), so none of that function's draws happen.
// Nothing here ports it.
//
// `!svc.context.travel` is left out rather than restated: it is always true,
// because js/hack.js:412, js/cmd.js:844 and js/cmd.js:865 are the only writers
// of context.travel and all three write 0.
//
// The two glyph terms are left out. glyph_is_warning() is constantly false,
// because a warning glyph needs a warning level this port never raises.
// glyph_is_invisible() is not: mhitm.c pre_mm_attack() writes the marker now,
// so a target the hero cannot spot standing where one was written would take
// C's arm and print. This port falls through to do_attack() instead, and
// uhitm.c attack_checks() refuses an unseen-monster attack there
// (js/uhitm.js:307). Both routes end the segment on the same screen, so the
// term would change which refusal names the stop and nothing else. Adding it
// without the arm under it would only move the stop, and the arm needs
// stumble_onto_mimic() and the m_monnam() half of its message pair, neither of
// which is ported; the deferral
// reqmenu-bump-ignores-the-invisible-monster-marker owns the gap.
//
// cmd.c set_move_cmd() copies the prefix into context.nopick, but
// executeMovement() runs this seam before that call, so the pending
// iflags.menu_requested is read beside it exactly as
// requireSimpleHeroDestination() does.
function requireNoMonsterBump(monster, state) {
    if ((state.context?.nopick || state.iflags?.menu_requested)
        && canSpotMonster(monster, state)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'reqmenu bump into a monster',
        );
    }
}

// C ref: hack.c domove_attackmon_at() (1954-1992). What the hero has to know
// about the target before uhitm.c do_attack() can run.
//
// C's displacer-beast swap at 1972-1985 short-circuits on the species before
// its !rn2(2), so every other target reaches do_attack() with no draw spent
// and only that one species stops here.
//
// The gate at 1968-1970 is the other refusal. Its `!mtmp->mundetected` term is
// what admits an ordinary target; a hidden one needs sensemon() or the
// hides_under()/S_EEL pair to be admitted, and if none holds, C skips
// do_attack() entirely and lets the terrain rules answer the step with the
// monster still standing there. Both halves need unported code -- the skip
// arm has no port at all, and the admitted arm reaches attack_checks()'s
// hiding reveal -- so a hidden target stops before nomul(0) rather than one
// call later.
function requireOrdinaryHostileMelee(monster) {
    if (monster.data?.pmidx === PM_DISPLACER_BEAST) {
        throw new UnsupportedHeroMoveBoundaryError(
            'displacer beast position swap',
        );
    }
    if (monster.mundetected) {
        throw new UnsupportedHeroMoveBoundaryError(
            'attacking a hidden monster',
        );
    }
}

// The destination-monster seam. C splits by `is_safemon(mtmp) &&
// !svc.context.forcefight` inside do_attack() (uhitm.c:462); this splits the
// same way, because the two arms have nothing in common below that test. The
// forcefight conjunct is what sends `F` at a pet down the attack arm instead
// of down the displacement arm, so the prefix swings at the pet rather than
// swapping places with it. That path is bounded rather than complete: a miss
// runs the whole swing, including wakeup(), whose setmangry() returns early on
// mtame so the pet is not angered, while a landed blow stops at js/uhitm.js
// hmon_hitmon_pet()'s refusal -- which sits above abuse_dog() and its
// monflee() rnd(), but below the point where the pet's hit points have already
// gone negative. Neither outcome is tested end to end.
function requireSupportedDestinationMonster(monster, x, y, state) {
    requireNoMonsterBump(monster, state);
    if (!is_safemon(monster, state) || state.context?.forcefight) {
        requireOrdinaryHostileMelee(monster);
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
            'door or special terrain movement',
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
        // the arms below can decide it. A closed door is the clearest case:
        // requireAutoopenClosedDoor() would ask whether the door opens for a
        // step that never touches the door. The three fight functions carry
        // their own refusals inside domove(); this arm is here to let them.
    } else if (heldStepIgnoresDestination(state)) {
        // The step never reaches the terrain rules at all, so this seam must
        // not consult them either. See heldStepIgnoresDestination() above.
        // avoid_trap_andor_region() is the exception C makes, and the only
        // one: it runs above the u.utrap block.
        requireHeldStepDestination(x, y, state);
    } else if (refusedDiagonalDoorway(x, y, state)) {
        // test_move() owns both diagonal doorway refusals on an empty square.
    } else if (closed_door(x, y, state)) {
        // test_move()'s closed-door arm (1074) runs before its testdiag
        // label (1134-1135), so a diagonal walk into a closed door reaches
        // the autoopen route rather than the diagonal doorway rules. The
        // diagonal case is not silent by accident either: hack.c:1112 gates
        // the bump and its sibling on `x == ux || y == uy`, so a diagonal
        // step whose autoopen test fails prints nothing and falls through.
        requireAutoopenClosedDoor(x, y, state, run);
    } else if (boulderStopsRun(x, y, run, state)) {
        // C ref: test_move():1217-1223. A run stops in front of a boulder the
        // hero can neither push past nor squeeze onto, without pushing it and
        // without spending the move. That arm is ported inside test_move(), so
        // admit the command and let domove() run it, exactly as the
        // runStopsBeforeMonster() arm above does.
    } else if (!blocksMove(x, y, state)) {
        requireSimpleHeroDestination(x, y, state, true);
    }
}

// This seam owns the four hero states hack.c:1014-1045 answers for before its
// closing else, the arm this port covers. A STONE or wall destination reaches
// test_move() unexamined -- preflightDomoveDestination() has no arm for it --
// so unlike requireAutoopenClosedDoor() this one has a single caller, the
// obstacle arm itself. It runs after that arm's terrain refusal, because for
// the two types left by then, STONE and IS_WALL, C's chain asks these four
// questions in this order and nothing else stands between them.
//
// Every refusal here is unconditional in `mode`, which the tight-diagonal
// switch below deliberately is not: `3f9be36` gated that switch because
// landing_spot() probes eight neighbours with TEST_MOVE and one loud refusal
// ended the dismount. The same gating is available to two of these four and
// not to the other two. C's Underwater and autodig arms return FALSE in every
// mode and print or dig only under DO_MOVE, so a probe could be answered
// FALSE; its Passes_walls and tunnels arms fall through the chain and can
// answer TRUE, so a probe answered FALSE would diverge. None of the four
// states is reachable in this port, so nothing probes them and the plain
// refusal costs nothing; whoever makes one reachable reads this first.
function requireOrdinaryObstacleRefusal(state) {
    const data = state.youmonst?.data;
    // hack.c:1014 `Passes_walls && may_passwall(x, y)` falls through the whole
    // arm and can answer TRUE, hack.c:1016 Underwater prints "There is an
    // obstacle there." instead of the wall line, and hack.c:1037 a tunneller
    // that needs no pick eats the rock through still_chewing(), which changes
    // the map and draws. The refusal is wider than C for the first: it does
    // not ask may_passwall(), so a Sokoban or nondiggable wall stops here too
    // rather than reaching the "Sokoban walls resist your ability." line that
    // shares this arm's closing else. Nothing in this port grants either
    // property, so the width costs no reachable behavior.
    if (propertyPresent(state, PASSES_WALLS)
        || state.u?.uinwater
        || (tunnels(data) && !needspick(data))) {
        throw new UnsupportedHeroMoveBoundaryError(
            'obstacle passed rather than blocking',
        );
    }
    // hack.c:1042. use_pick_axe2() changes the map and draws, so the arm has
    // to stop even though `flags.autodig` has no writer yet: js/options.js
    // carries the name in its catalog and nothing reads it back into
    // state.flags. svc.context.nopick has no writer either, which is why the
    // read is `state.context?.nopick` rather than a ported field.
    if (state.flags?.autodig && !state.context?.run && !state.context?.nopick
        && state.uwep && is_pick(state.uwep, state)) {
        throw new UnsupportedHeroMoveBoundaryError('automatic digging');
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

// C ref: hack.c test_move():1217-1223, the run arm of its boulder block. A run
// stops in front of a boulder the hero can neither push past nor squeeze onto,
// before moverock() is reached, so it costs no time and no randomness.
//
// The command admission seam consults this too, which is why `run` is a
// parameter rather than a read of svc.context.run: cmd.c executeMovement()
// calls the seam before set_move_cmd() copies the command's run value there.
function boulderStopsRun(x, y, run, state) {
    return Boolean(sobj_at(BOULDER, x, y, state))
        && (In_sokoban(state.u.uz) || !propertyPresent(state, PASSES_WALLS))
        && run >= 2
        && !(heroIsBlind(state) || heroHallucinating(state))
        && !could_move_onto_boulder(
            x, y, x - state.u.ux, y - state.u.uy, state,
        );
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

// C ref: hack.c moverock_core() (347-638), every arm of it except the push at
// 626-637, plus the parts of dopush() (165-241) that no ported hero reaches.
//
// Two callers ask them, and both are needed. test_move()'s DO_MOVE arm asks
// immediately before moverock(), which is what covers every entry into the
// push: cmd.c executeMovement()'s admission seam runs once per keystroke, so
// the second and later steps of a run arrive through allmain.c
// moveloop_core()'s own re-entry with no seam between them. The seam asks as
// well, so a keystroke refuses before set_move_cmd() commits movement intent.
// Either way the refusal lands ahead of nomul(0) and of the boulder's
// next_boulder bookkeeping, so it never leaves the move half made.
//
// The questions follow C's order. Four of them are deliberately wider than the
// branch they stand for, and each says why.
function preflight_moverock(sx, sy, noPickMove, state) {
    const u = state.u;
    const otmp = sobj_at(BOULDER, sx, sy, state);
    // sx = u.ux + u.dx, so the direction is the offset of the square itself.
    // Reading u.dx here would be wrong: cmd.c executeMovement() runs this seam
    // before set_move_cmd() writes it, so it still holds the previous step's.
    const dx = sx - u.ux;
    const dy = sy - u.uy;
    const rx = sx + dx; /* boulder destination position */
    const ry = sy + dy;
    const refuse = (reason) => {
        throw new UnsupportedHeroMoveBoundaryError(reason);
    };
    const species = state.youmonst?.data;

    // test_move():1225-1229, which runs before moverock() is called at all:
    // a tunneller that needs no pick chews the boulder through still_chewing()
    // instead.
    if (tunnels(species) && !needspick(species) && !In_sokoban(u.uz))
        refuse('a boulder chewed rather than pushed');

    // 355-363, and wider than C's arm. C refuses only a boulder the hero has
    // not already felt -- `Blind && glyph_to_obj(glyph_at(sx, sy)) != BOULDER`
    // -- and pushes one he has, so a blind hero pushing a mapped boulder is a
    // case this refuses and C runs. The narrower test needs display.c
    // glyph_at(), which has no port; C's own arm also calls map_object() to
    // draw the boulder into map memory. Restoring the push must restore the
    // glyph_to_obj() guard with it.
    if (heroIsBlind(state)) refuse('a boulder felt in the dark');

    // The while loop at 353, the `otmp != svl.level.objects[sx][sy]` reorder at
    // 375-376 and moverock_done() (326-333) all exist for a square holding more
    // than one boulder, and xname()'s "next boulder" naming is what they carry
    // between them. This slice pushes one boulder off an otherwise empty
    // square, which is also what lets requireSimpleHeroDestination() treat the
    // square as empty once the push has happened.
    if (otmp.nexthere || state.level.objects[sx][sy] !== otmp)
        refuse('a boulder sharing its square');

    // 384-410. 'm<dir>' steps over the boulder or squeezes past it instead of
    // pushing, through could_move_onto_boulder() and sokoban_guilt().
    if (noPickMove) refuse('a boulder step without a push');

    // 412-421. "You don't have enough leverage to push %s."
    if (propertyActiveUnblocked(state, LEVITATION) || Is_airlevel(u.uz))
        refuse('a boulder push without leverage');

    // 422-427. "You're too small to push that %s."
    if (verysmall(species) && !u.usteed)
        refuse('a boulder push by a tiny hero');

    // dopush():198-202 reports a steed's push through do_name.c YMonnam() and
    // skips exercise() altogether, and cannot_push():388-391 needs
    // P_SKILL(P_RIDING). C reaches both from inside the conjunction below.
    if (u.usteed) refuse('a mounted boulder push');

    // 428-435, the conjunction that separates a push from a refusal. Its FALSE
    // arm is ported for an ordinary obstructed destination below. The other
    // FALSE arms still stop here because their later cannot_push() outcomes
    // are outside this slice.
    const destination = isok(rx, ry) ? state.level?.at(rx, ry) : null;
    if (destination && (IS_OBSTRUCTED(destination.typ)
        || destination.typ === IRONBARS)
        && !throws_rocks(species)
        && !could_move_onto_boulder(sx, sy, dx, dy, state)) {
        // The selected ordinary, normal-sized hero has no way to squeeze onto
        // the boulder square. moverock_core() owns the source-ordered message
        // and -1 result, so admit that path instead of ending the command here.
        return;
    }
    if (!destination
        || IS_OBSTRUCTED(destination.typ)
        || destination.typ === IRONBARS
        || (IS_DOOR(destination.typ) && dx && dy
            && !doorless_door(destination))
        || sobj_at(BOULDER, rx, ry, state)) {
        refuse('a boulder that will not move');
    }

    // 437-443, KMH's rule that Sokoban boulders do not roll diagonally. The
    // refusal covers the whole branch rather than the diagonal alone, because
    // sokoban_guilt() and Sokoban's own hole-plugging in flooreffects() are
    // both unported and an orthogonal Sokoban push reaches them.
    if (In_sokoban(u.uz)) refuse('a boulder push in Sokoban');

    // 445-447. revive_nasty() (103-137) is a call on the push path, not a
    // guard around it: it walks the pile at <rx,ry> and revives every Rider
    // corpse and every Wizard of Yendor corpse there. Only its TRUE arm gives
    // up the move, so its FALSE arm -- this scan finding neither -- is what
    // has to be exact. The TRUE arm needs revive_corpse(), enexto() and
    // rloc_to().
    for (let obj = state.level?.objects?.[rx]?.[ry] ?? null;
        obj;
        obj = obj.nexthere) {
        if (obj.otyp !== CORPSE) continue;
        if (is_rider(state.mons?.[obj.corpsenm])
            || obj.corpsenm === PM_WIZARD_OF_YENDOR) {
            refuse('a Rider or Wizard corpse behind a boulder');
        }
    }

    // 450-476. C pushes the boulder onto a noncorporeal monster, and onto one
    // already trapped in the pit under it, rather than refusing; this refuses
    // any monster at all, because both of those leave a boulder standing on a
    // monster and neither is traced here. The refusing arm needs a_monnam(),
    // map_invisible() and cannot_push().
    if (m_at(rx, ry, state)) refuse('a monster behind the boulder');

    // 478-481. cannot_push_msg() again, for a boulder against a closed door.
    if (closed_door(rx, ry, state)) refuse('a closed door behind the boulder');

    // 490-616, the trap switch. C acts on six types -- LANDMINE, PIT and
    // SPIKED_PIT, HOLE and TRAPDOOR, LEVEL_TELEP, TELEP_TRAP and
    // ROLLING_BOULDER_TRAP -- and lets every other type fall through its
    // `default: break` to the push below. This refuses all of them: the six
    // need blow_up_landmine(), flooreffects(), bury_objs(), rloco(),
    // add_to_migration() and launch_obj(), and the rest would leave a boulder
    // resting on a trap, which nothing here has traced.
    if (t_at(rx, ry, state)) refuse('a boulder pushed onto a trap');

    // 618-619. do.c boulder_hits_pool() (49-118) is the other unconditional
    // call on this path. Everything above its `is_pool_or_lava(rx, ry)` test
    // only rejects a non-boulder, so that test alone is its FALSE arm -- the
    // one that lets the push happen. js/do.js flooreffects() already records
    // the TRUE arm as unported.
    if (is_pool_or_lava(rx, ry, state))
        refuse('a boulder pushed into water or lava');

    // dopush():217-240, the shop bill, and the `costly` computed for it at
    // 445-447. addtobill(), subfrombill() and stolen_value() are all live once
    // a boulder crosses a shop boundary. C's `costly` conjoins costly_spot()
    // with shop_keeper(*in_rooms(sx, sy, SHOPBASE)); js/shk.js costly_spot()
    // (491-499) already requires that shopkeeper, so the first term carries it.
    if (costly_spot(sx, sy, state) || costly_spot(rx, ry, state)
        || otmp.unpaid) {
        refuse('a boulder pushed across a shop boundary');
    }

    // dopush():206-207. unmap_object() forgets a remembered invisible monster
    // standing where the boulder is about to land, and js/display.js refuses a
    // square that also shows an engraving. Asking here keeps that refusal from
    // landing between the message and the move.
    if (glyph_is_invisible(destination.remembered_glyph?.glyph))
        refuse('a remembered invisible monster behind the boulder');
}

// C ref: hack.c cannot_push_msg() (247-256). This is the ordinary unmounted
// arm: name the boulder, report the failed push, and feel its square only when
// blind. The mounted and blind branches remain behind preflight_moverock().
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

// C ref: hack.c dopush() (165-241). The feedback is throttled by two globals
// rather than by Norep(): gb.bldrpush_oid remembers which boulder was pushed
// last and gb.bldrpushtime the turn it was announced, so a run of pushes
// against the same boulder says nothing after the first while still exercising
// Strength and moving the rock. decl.c:224-225 starts both at 0.
async function dopush(sx, sy, rx, ry, otmp, state, env) {
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
    // 190-202. The steed arm is refused by preflight_moverock().
    const easypush = throws_rocks(state.youmonst?.data);
    if (givemesg) {
        const message = requiredMessageOperation(env, 'boulder push');
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
    state.gb.bldrpushtime = moves;

    /* Move the boulder *after* the message. */
    // 206-207, the glyph_is_invisible() unmap_object(), is refused by
    // preflight_moverock().
    otmp.next_boulder = 0;
    movobj(otmp, rx, ry, state); /* does newsym(rx,ry) */
    // 210-215. The Blind pair of feel_location() calls is refused by
    // preflight_moverock() along with every other Blind arm of this group.
    newsym(sx, sy);
    // 217-240, the shop bill, is refused by preflight_moverock().
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
// on <sx,sy>; preflight_moverock() admits only a square holding exactly one,
// so the body runs once and the second test finds the square empty.
//
// The return value is C's: 0 lets the hero advance onto <sx,sy>, -1 refuses
// the step. The selected failed-destination arm returns -1 after its message.
async function moverock_core(sx, sy, state, env) {
    const u = state.u;
    let firstboulder = true;
    let otmp;

    while ((otmp = sobj_at(BOULDER, sx, sy, state)) !== null) {
        // 355-363, the Blind arm, is refused by preflight_moverock().

        /* when otmp->next_boulder is 1, xname() will format it as
           "next boulder" instead of just "boulder" */
        otmp.next_boulder = firstboulder ? 0 : 1;
        firstboulder = false;

        /* make sure that this boulder is visible as the top object */
        if (otmp !== state.level.objects[sx][sy]) movobj(otmp, sx, sy, state);

        const rx = u.ux + 2 * u.dx; /* boulder destination position */
        const ry = u.uy + 2 * u.dy;
        nomul(0, state);

        // 384-427 -- the 'm' prefix, Levitation and the air level, and a tiny
        // hero -- remain refused by preflight_moverock().
        const destination = isok(rx, ry) ? state.level?.at(rx, ry) : null;
        if (!destination
            || IS_OBSTRUCTED(destination.typ)
            || destination.typ === IRONBARS
            || (IS_DOOR(destination.typ) && u.dx && u.dy
                && !doorless_door(destination))
            || sobj_at(BOULDER, rx, ry, state)) {
            // hack.c:486-487. nomul(0) and next_boulder bookkeeping precede
            // this failed-destination check. No trap, monster, or push-side
            // effect is reached when the boulder's destination is blocked.
            await cannot_push_msg(otmp, sx, sy, state, env);
            return cannot_push(otmp, sx, sy, state);
        }

        // The remaining valid-destination branches stay behind
        // preflight_moverock(): Sokoban's diagonal rule at 437-443,
        // revive_nasty() at 445-448, the monster behind the boulder at
        // 450-476, closed_door() at 478-481, the trap switch at 490-616 and
        // boulder_hits_pool() at 618-619.

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
        await dopush(sx, sy, rx, ry, otmp, state, env);
    }
    return 0;
}

// C ref: hack.c test_move(). Five of its branches are ported: the
// physical-obstacle refusal for ordinary wall and rock, which consumes no time
// or randomness, the IS_DOOR/closed_door() arm's autoopen route into lock.c
// doopen_indir(), the bump arm that a suppressed autoopen falls into, and its
// two diagonal doorway rules, which also spend no time. Its remaining terrain
// branches remain at the command admission boundary, which refuses every
// destination type this function does not own before domove() is reached.
//
// The ability branches are different, and the difference is easy to miss.
// preflightDomoveDestination()'s else-if chain has no arm at all for a STONE
// or wall destination -- blocksMove() answers TRUE there, so the chain falls
// off its end without a throw -- so the hero states hack.c:1014-1045 branches
// on inside the obstacle arm have no owner at the seam. They are refused here
// instead, by requireOrdinaryObstacleRefusal(), the way
// requireAutoopenClosedDoor() refuses the closed-door arm's equivalents.
//
// `mode` is C's fourth argument. Two of its four values have a ported caller:
// domove_core() asks DO_MOVE, which is the only value that prints, opens a
// door or spends a move, and steed.c mount_steed() asks TEST_MOVE, which only
// wants the boolean. TEST_TRAV and TEST_TRAP belong to findtravelpath(), which
// is unported; the two places C treats them differently from TEST_MOVE, the
// closed-door `goto testdiag` and the `svc.context.run == 8` filter, therefore
// have no caller that can reach them and are marked where they would sit.
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

    // C ref: hack.c:1011. The obstacle arm returns before the entry rule can
    // look at the square, since testdiag (1139) sits inside the IS_DOOR arm --
    // and, for every hero state this port admits, before the exit rule at 1208
    // as well. That second half is narrower than it looks: C's Passes_walls
    // (1015), passes_bars (1030) and tunnels (1036) branches fall out of the
    // arm rather than returning, and reach 1208, whose only property test is
    // !Passes_walls. requireOrdinaryObstacleRefusal() refuses all three below,
    // which is what makes the port's unconditional return safe.
    //
    // The four types this port does not own are refused here with the reason
    // requireSimpleHeroDestination() gives them, so a walk and a pet swap onto
    // one report the same boundary: requireOrdinaryStartingPetSwap() throws it
    // for the same four.
    if (IS_OBSTRUCTED(location.typ) || location.typ === IRONBARS) {
        if (location.typ !== STONE && !IS_WALL(location.typ)
            && !IS_TREE(location.typ, state)) {
            // C's physical-obstacle arm returns FALSE for every non-DO_MOVE
            // probe before it reaches any of the ordinary movement branches.
            // Secret doors and corridors are common in a travel search: they
            // are not an unsupported movement effect when merely tested.
            if (mode !== DO_MOVE
                && (location.typ === SDOOR || location.typ === SCORR)) {
                return false;
            }
            throw new UnsupportedHeroMoveBoundaryError(
                'door or special terrain movement',
            );
        }
        // C runs feel_location() before its branch chain, so refusing here
        // skips a tactile update C performs. The terrain refusal above sits on
        // the same side for the same reason: a refusal ends the port's run, and
        // a half-updated map would only make the stop harder to read.
        requireOrdinaryObstacleRefusal(state);
        if (heroIsBlind(state) && mode === DO_MOVE) feel_location(x, y, state);

        // C ref: hack.c:1048-1069, the three-arm chain inside the closing
        // else's `if (mode == DO_MOVE)`. Only the drawbridge arm and the
        // mention_walls arm are here: the Sokoban arm between them (1052-1055)
        // needs Passes_walls, which requireOrdinaryObstacleRefusal() has
        // already refused above.
        if (mode === DO_MOVE) {
            if (is_db_wall(x, y, state)) {
                // hack.c:1050. A raised drawbridge's wall is DBWALL, which
                // IS_WALL() admits (rm.h:117, `typ <= DBWALL`), so before this
                // arm existed the square fell through to the line below, where
                // display.c wall_angle() has no DBWALL case and answers
                // S_stone: the port said "It's solid stone." with
                // mention_walls set and nothing at all without it. C reaches
                // neither, and gates this line on no flag. Its own
                // back_to_glyph() would have said S_vcdbridge (display.c:2394),
                // which is a third answer again.
                //
                // C's line is a plain pline(), not the pline_dir() below, so it
                // carries no accessiblemsg location prefix; pline.c:114-123 is
                // what separates the two.
                const message = requiredMessageOperation(env, 'drawbridge wall');
                await message('That drawbridge is up!', state);
            } else if (state.flags?.mention_walls) {
                const symbol = location.typ === STONE
                    ? S_stone
                    : IS_TREE(location.typ, state)
                        ? S_tree : wall_angle(location);
                const description = symbol === S_stone ? 'solid stone'
                    : symbol === S_tree ? 'a tree' : 'a wall';
                const message = requiredMessageOperation(env, 'wall refusal');
                await message(
                    messageAt(`It's ${description}.`, x, y, state),
                    state,
                );
            }
        }
        return false;
    }

    if (IS_DOOR(location.typ) && closed_door(x, y, state)) {
        // hack.c:1093-1136. Everything below the `if (mode == DO_MOVE)` there
        // is skipped for the other three modes, which answer FALSE without
        // opening the door, printing, or spending a move. TEST_TRAV and
        // TEST_TRAP take `goto testdiag` first; neither has a ported caller.
        if (mode !== DO_MOVE) return false;
        const run = state.context.run ?? 0;
        requireAutoopenClosedDoor(x, y, state, run);
        if (!autoopenSuppressed(state, run)) {
            // doopen_indir() accepts only `message` and `random` from this env
            // and rejects any other key, so test_move()'s wider injection
            // contract narrows here rather than being forwarded whole.
            await doopen_indir(x, y, state, env);
            // hack.c:1110-1111. door_opened suppresses domove_core()'s
            // `move = 0; nomul(0)` when the pull succeeded; move itself is
            // FALSE either way, because domove_core()'s only DO_MOVE call
            // passes the hero's own square as <ux,uy>.
            state.context.door_opened = !closed_door(x, y, state);
            state.context.move
                = (ux !== state.u.ux || uy !== state.u.uy) ? 1 : 0;
        } else if (x === ux || y === uy) {
            // hack.c:1099-1128, the arm a suppressed autoopen falls into. It
            // is orthogonal-only: a diagonal step at a closed door prints
            // nothing and just returns FALSE.
            //
            // C gates the bump on `Blind || Stunned || ACURR(A_DEX) < 10
            // || Fumbling`. Three of those four stop at the seam above, so
            // Dexterity is the whole live test; the C order still puts it
            // third. Neither line goes through set_msg_xy(), and pline.c
            // vpline() clears a11y.msg_loc after every message, so neither
            // carries a direction prefix under `accessiblemsg`.
            const message = requiredMessageOperation(env, 'closed door');
            if (effective_attribute(state, A_DEX) < 10) {
                await message('Ouch!  You bump into a door.', state);
                await exercise(A_DEX, false, state, env.random ?? { rn2 });
                // hack.c:1122-1127, the inverse of the pull's bookkeeping.
                // C has just claimed a move it did not make, so the caller's
                // `move = 0; nomul(0)` has to be suppressed by door_opened
                // and the run stopped here by hand instead. The turn really
                // does elapse: this is the one closed-door outcome that costs
                // the hero time.
                //
                // door_opened is what does that work. The `move` half of C's
                // combined assignment cannot be observed at this call site,
                // because domove_core() is test_move()'s only DO_MOVE caller
                // and rhack() has already set svc.context.move for the step;
                // it is kept because it is half of one C statement, and no
                // test can pin it.
                state.context.door_opened = true;
                state.context.move = 1;
                nomul(0, state);
            } else {
                await message('That door is closed.', state);
            }
        }
        return false;
    }

    if (IS_DOOR(location.typ)
        && blocksDiagonalDoorwayEntry(ux, uy, x, y, state)) {
        // C ref: hack.c:1139-1150, the testdiag arm, which the closed-door arm
        // above returns before. Underwater joins mention_walls on this line
        // and not on the exit rule's below. Both lines are You_cant(), which
        // reaches plain pline(), not the pline_dir() the wall line above uses,
        // and pline.c:162-164 clears a11y.msg_loc on every call, so neither
        // carries a direction prefix under `accessiblemsg`.
        if (mode === DO_MOVE && heroIsBlind(state)) feel_location(x, y, state);
        if (mode === DO_MOVE
            && (state.u.uinwater || state.flags?.mention_walls)) {
            const message = requiredMessageOperation(env, 'doorway entry');
            await message(
                "You can't move diagonally into an intact doorway.",
                state,
            );
        }
        return false;
    }

    // C ref: hack.c:1153-1177. Every refusal the tight-diagonal switch can
    // print is dormant at this boundary and stays deferred: case 1 needs a
    // bigmonst polyform, case 3 needs Sokoban, and case 2 needs an inventory
    // heavier than WT_TOOMUCH_DIAGONAL, which no ported pickup path can build.
    // The live outcome is the fall-through, which is what lets the hero walk a
    // diagonal in a corridor, so cant_squeeze_thru() is called rather than
    // assumed: without it a hero who did cross the weight threshold would
    // squeeze through in silence where C stops him.
    const species = state.youmonst?.data;
    if (dx && dy && bad_rock(species, ux, y, state)
        && bad_rock(species, x, uy, state)) {
        if (cant_squeeze_thru(state.youmonst, state)) {
            // Each of C's three cases wraps its line in `if (mode == DO_MOVE)`
            // and then returns FALSE for every mode, so a TEST_MOVE or
            // TEST_TRAV probe drops the candidate square in silence. Only
            // DO_MOVE owes the message this port has not ported, and
            // landing_spot() probes all eight neighbours of a hero who may be
            // standing in a corridor, where both corner squares are STONE and
            // this switch is entered every time.
            if (mode !== DO_MOVE) return false;
            throw new UnsupportedHeroMoveBoundaryError('tight diagonal move');
        }
    } else if (dx && dy && m_at(ux, y, state)
        && m_at(ux, y, state) === m_at(x, uy, state)) {
        // C ref: hack.c:1172-1176 and worm.c worm_cross(), whose first two
        // tests are these. One monster on both corner squares can only be a
        // long worm; the consecutive-segment test that decides the refusal
        // reads wtails[], which has no ported counterpart, and neither does
        // the YMonnam() in the message.
        //
        // This arm therefore refuses in every mode, unlike the switch above.
        // Returning FALSE for a TEST_MOVE probe would be a guess: when the two
        // segments are not consecutive C's worm_cross() answers FALSE and
        // test_move() carries on to return TRUE, and this port cannot tell the
        // two apart.
        throw new UnsupportedHeroMoveBoundaryError('long worm body crossing');
    }

    // C ref: hack.c:1181-1205. Travel probes avoid remembered traps and
    // known liquid hazards when running with run == 8. TEST_TRAP reports the
    // hazard to findtravelpath(); TEST_TRAV falls through to the ordinary
    // movement checks below.
    if (state.context.run === 8 && mode !== DO_MOVE && !u_at(x, y, state)) {
        const trap = t_at(x, y, state);
        if (trap && trap.tseen && trap.ttyp !== VIBRATING_SQUARE)
            return mode === TEST_TRAP;

        const locationSeen = Boolean(location.seenv);
        const knownLiquid = locationSeen && is_pool_or_lava(x, y, state);
        const inAir = propertyActiveUnblocked(state, LEVITATION)
            || heroIsFlying(state);
        const safeLiquid = is_pool(x, y, state)
            ? known_wwalking(state)
            : (known_lwalking(state)
                && is_lava(state.u.ux, state.u.uy, state));
        if (knownLiquid
            && ((IS_WATERWALL(location.typ) || location.typ === LAVAWALL)
                || !(inAir || safeLiquid))) {
            return mode === TEST_TRAP;
        }
    }

    // C's TEST_TRAP path never proceeds to the source-square or boulder
    // checks. A non-hazardous candidate is therefore rejected here.
    if (mode === TEST_TRAP)
        return false;

    // C ref: hack.c:1207-1209. The source doorway restriction remains below.
    if (blocksDiagonalDoorwayExit(ux, uy, x, y, state)) {
        // C ref: hack.c:1208-1214. No feel_location() here, and mention_walls
        // is the whole gate.
        if (mode === DO_MOVE && state.flags?.mention_walls) {
            const message = requiredMessageOperation(env, 'doorway exit');
            await message(
                "You can't move diagonally out of an intact doorway.",
                state,
            );
        }
        return false;
    }

    // C ref: hack.c:1216-1252, the boulder block. Two of its four arms are
    // ported: the run arm that stops in front of a boulder the hero cannot get
    // past, and the moverock() call that pushes one. The still_chewing() arm
    // above it and the TEST_TRAV arm below it are not -- the first is refused
    // by preflight_moverock(), the second belongs to findtravelpath(), which
    // has no port and is the only caller that asks for TEST_TRAV.
    //
    // A Passes_walls hero walks onto the square without touching the boulder,
    // outside Sokoban. No ported path grants the property, so the guard is
    // here for its shape rather than for a reachable branch.
    if (sobj_at(BOULDER, x, y, state)
        && (In_sokoban(state.u.uz) || !propertyPresent(state, PASSES_WALLS))) {
        if (mode !== TEST_TRAV
            && (state.context.run ?? 0) >= 2
            && !(heroIsBlind(state) || heroHallucinating(state))
            && !could_move_onto_boulder(x, y, dx, dy, state)) {
            // C's line is pline_dir(), which carries the accessiblemsg
            // location prefix that messageAt() adds; the doorway lines above
            // are plain pline() and carry none.
            if (mode === DO_MOVE && state.flags?.mention_walls) {
                const message = requiredMessageOperation(env, 'blocked boulder');
                await message(
                    messageAt('A boulder blocks your path.', x, y, state),
                    state,
                );
            }
            return false;
        }
        if (mode === DO_MOVE) {
            // Every unported arm of moverock_core() is refused here rather
            // than only in the command-admission seam. cmd.c
            // executeMovement()'s seam runs once per keystroke, so the second
            // and later steps of a run reach test_move() through
            // allmain.c moveloop_core()'s own re-entry with no seam between
            // them; so does a bear-trapped hero who struggles free. Screening
            // at the call covers all three, and it lands ahead of
            // moverock_core()'s nomul(0) and its next_boulder bookkeeping, so
            // the refusal still precedes every state change.
            preflight_moverock(
                x, y, Boolean(state.context?.nopick), state,
            );
            if (await moverock(state, env) < 0) return false;
        }
        /* assume you'll be able to push it when you get there... */
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

// C ref: hack.c findtravelpath() (1266-1459), ordinary TRAVP_TRAVEL arm.
// The search grows a shortest path backwards from the selected destination.
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
        endRunning(state, false);
        if (await test_move(
            state.u.ux,
            state.u.uy,
            state.u.tx - state.u.ux,
            state.u.ty - state.u.uy,
            TEST_MOVE,
            state,
        )) {
            state.u.dx = state.u.tx - state.u.ux;
            state.u.dy = state.u.ty - state.u.uy;
            nomul(0, state);
            state.iflags.travelcc.x = 0;
            state.iflags.travelcc.y = 0;
            return true;
        }
        state.context.run = 8;
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

// C ref: hack.c avoid_moving_on_trap(). Its message needs trapname() and an(),
// neither of which is ported, so a msg = TRUE caller stops instead.
//
// Two callers pass TRUE. lookaround()'s trap arm does, at run values above 1,
// which the ctrl-direction rush now reaches. The other is
// avoid_running_into_trap_or_liquid(), which is `domove_core()`'s first run arm
// and is not ported at all: at run 1 it can only act on a destination trap or
// liquid, and both are refused before domove() reaches them, so nothing is
// dropped today. Port it with the trap work, where C stops a rush cleanly with
// no time spent and the port's destination seam throws instead.
function avoid_moving_on_trap(x, y, msg, state) {
    const trap = t_at(x, y, state);
    if (trap && trap.tseen && trap.ttyp !== VIBRATING_SQUARE) {
        if (msg && state.flags?.mention_walls) {
            throw new UnsupportedHeroMoveBoundaryError(
                'a trap stop message while rushing',
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

// C ref: hack.c domove_core(). This remains the narrow ordinary-floor subset;
// the movement goal will replace its collision and terrain branches in source
// order without changing the command intent established by cmd.c. It requires
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

    let newx;
    let newy;
    let destinationMonster;
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
        newx = u.ux + u.dx;
        newy = u.uy + u.dy;

        if (await move_out_of_bounds(newx, newy, state)) {
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
        if (u.uswallow) {
            // C still applies the optional m-prefix bump message, but the
            // engulfing target is admitted by uhitm.c attack_checks() before
            // ordinary visibility and concealment checks.
            requireNoMonsterBump(destinationMonster, state);
        } else {
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
        const attackConsumedMove = await do_attack(
            destinationMonster,
            state,
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
        if (attackConsumedMove) {
            state.domoveAttempting = 0;
            return;
        }
    }

    // C ref: domove_core():2805-2810, inside its `if (!displaceu)` block. The
    // displacer-beast swap that clears that flag is refused above, so the
    // block is entered on every step that gets this far. All three run before
    // the u.utrap block and before test_move(), so a force-fight answers the
    // square whatever else is true of the hero or the terrain.
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
    // test_move() has already run moverock() by now, so a boulder that was on
    // the destination has moved on and this reads the square it left.
    if (!destinationMonster)
        requireSimpleHeroDestination(newx, newy, state, true);

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
        if (avoid_moving_on_trap(
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
    if (terrain_changed_under_hero(state)) switch_terrain(state);
    await check_special_room(false, state);
    // C ref: hack.c:3353-3354, spoteffects()'s only IS_FURNITURE arm. Nothing
    // in this port grants levitation, so the arm is unreachable today, but
    // admitting a sink as a destination is what makes it reachable in
    // principle; sit.c dosinkfall() has no owner.
    if (IS_SINK(state.level?.at(state.u.ux, state.u.uy)?.typ)
        && propertyActiveUnblocked(state, LEVITATION)) {
        throw new UnsupportedHeroMoveBoundaryError('dosinkfall()');
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
    for (const line of collectMonsterNoticeMessages(state))
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
