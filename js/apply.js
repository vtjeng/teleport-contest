// apply.js -- the `a` command: using a tool.
// C refs: src/apply.c apply_ok(), doapply(), fig_transform(), jelly_ok(),
// use_royal_jelly(),
// figurine_location_checks(), use_figurine(), get_mleash(), light_cocktail(),
// use_cream_pie(), use_whistle(), use_magic_whistle(), magic_whistled(),
// use_whip(), the
// polearm helpers and use_pole(), use_stethoscope(), the grappling-hook
// helpers and use_grapple(), its_dead(), reset_trapset(),
// use_trap(), and set_trap().
//
// doapply()'s switch has thirty-odd named arms. Its live groups include
// BULLWHIP and polearms, CREAM_PIE, STETHOSCOPE, POT_OIL through
// apply.c:light_cocktail(), OIL_LAMP/MAGIC_LAMP/BRASS_LANTERN through
// apply.c:use_lamp(), CANDELABRUM_OF_INVOCATION through use_candelabrum(),
// WAX_CANDLE/TALLOW_CANDLE through use_candle(), BELL/BELL_OF_OPENING through
// use_bell(), and the
// LOCK_PICK/CREDIT_CARD/SKELETON_KEY arm that lock.c
// pick_lock() serves; MAGIC_MARKER delegates to write.c dowrite() in
// js/write.js; containers delegate to pickup.c use_container() in js/pickup.js;
// BAG_OF_TRICKS delegates to makemon.c bagotricks() in js/makemon.js; musical
// instruments delegate to music.c; the MAGIC_WHISTLE/TIN_WHISTLE/EUCALYPTUS_LEAF
// arms call their apply.c whistle helpers; WAND_CLASS enters do_break_wand();
// LAND_MINE/BEARTRAP use apply.c
// use_trap()/set_trap(); and HORN_OF_PLENTY delegates to mkobj.c. Ordinary
// food and armor return their source unknown-use result. The unicorn-horn arm
// calls apply.c use_unicorn_horn(); its unported void effect helpers remain
// explicit note_unported gaps. Other named arms still stop at a refusal
// naming the C function they need; spellbooks and coins call their helpers.
// use_stethoscope() covers the whole source function. Its mounted and
// swallowed arms await insight.c mstatusline(); both reachability branches
// call the corresponding engrave.c cant_reach_floor() helper.

import {
    ACCESSIBLE,
    ARTICLE_A,
    A_CON,
    A_CHA,
    A_DEX,
    A_STR,
    AIR,
    BEAR_TRAP,
    BLINDED,
    COLNO,
    ROWNO,
    CQ_CANNED,
    CORR,
    CONFUSION,
    COST_DSTROY,
    COST_SPLAT,
    DEAF,
    ECMD_CANCEL,
    ECMD_FAIL,
    ECMD_OK,
    ECMD_TIME,
    FIG_TRANSFORM,
    FLASHED_LIGHT,
    FREE_ACTION,
    FEMALE,
    FACE,
    FOOT,
    G_GONE,
    HEAD,
    FUMBLING,
    FORCETRAP,
    GLIB,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_INACCESS,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_NOFLAGS,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    DIGCHECK_FAILED,
    DIGCHECK_FAIL_BOULDER,
    EXPL_FIERY,
    EXPL_FROSTY,
    EXPL_MAGICAL,
    HOLE,
    ICE,
    IS_WALL,
    MELT_ICE_AWAY,
    N_DIRS,
    NO_MINVENT,
    MM_NOMSG,
    NO_MM_FLAGS,
    PARANOID_BREAKWAND,
    PIT,
    plur,
    HALLUC,
    HALLUC_RES,
    HOMEMADE_TIN,
    HAND,
    KILLED_BY,
    has_mcorpsenm,
    IS_TREE,
    MCORPSENM,
    M_AP_FURNITURE,
    M_AP_MONSTER,
    M_AP_NOTHING,
    M_AP_OBJECT,
    M_AP_TYPE,
    nothing_happens,
    nothing_seems_to_happen,
    OBJ_INVENT,
    OBJ_FLOOR,
    OBJ_MINVENT,
    PRONOUN_NO_IT,
    REVIVE_MON,
    RLOC_MSG,
    D_ISOPEN,
    DISP_BEAM,
    DISP_END,
    FLYING,
    HALF_PHDAM,
    INTRINSIC,
    INVIS,
    INVIS_BEAM,
    IS_DOOR,
    IS_AIR,
    IS_FURNITURE,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_WATERWALL,
    LAVAWALL,
    LANDMINE,
    P_BASIC,
    P_NONE,
    P_SKILLED,
    PICK_ONE,
    MENU_BEHAVE_STANDARD,
    P_RIDING,
    STOMACH,
    STONE,
    STONED,
    STRANGLED,
    PROT_FROM_SHAPE_CHANGERS,
    STUNNED,
    JUMPING,
    LEG,
    LEVITATION,
    LEFT_SIDE,
    PASSES_WALLS,
    RIGHT_SIDE,
    ROOM,
    SHOPBASE,
    SICK,
    SICK_ALL,
    SICK_NONVOMITABLE,
    SLIMED,
    SEE_INVIS,
    MONSEEN_INFRAVIS,
    MONSEEN_NORMAL,
    MONSEEN_SEEINVIS,
    NOSE,
    NO_TRAP_FLAGS,
    PLNMSG_enum,
    RLOC_NONE,
    TELEDS_NO_FLAGS,
    TELEDS_ALLOW_DRAG,
    TOOKPLUNGE,
    CLOUD,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    TT_PIT,
    TT_WEB,
    Trap_Killed_Mon,
    UNENCUMBERED,
    WEAK,
    MAXULEV,
    MAX_SPELL_STUDY,
    WOUNDED_LEGS,
    VOMITING,
    NO_KILLER_PREFIX,
    Is_airlevel,
    Is_waterlevel,
    SCORR,
    SDOOR,
    STATUE_TRAP,
    SUPPRESS_INVISIBLE,
    SUPPRESS_IT,
    TIMEOUT,
    TIMER_OBJECT,
    Upolyd,
    uhim,
    u_at,
    xdir,
    ydir,
} from './const.js';
import {
    is_pool,
    is_lava,
    is_pool_or_lava,
} from './dbridge.js';
import { isok } from './cmd_isok.js';
import {
    cmdq_add_ec,
    cmdq_add_key,
    confdir,
    extcmdRow,
    getdir,
    get_adjacent_loc,
    paranoid_query,
    set_occupation,
    y_n,
} from './cmd.js';
import {
    cvt_sdoor_to_door,
    findit,
    openit,
    use_crystal_ball,
} from './detect.js';
import { Can_dig_down, ceiling, surface } from './dungeon.js';
import { see_monster_closeup } from './dog.js';
import {
    bot,
    cmap_to_glyph,
    feel_newsym,
    flush_screen,
    glyph_at,
    glyph_is_cmap,
    glyph_is_invisible,
    glyph_is_monster,
    glyph_is_statue,
    glyph_to_cmap,
    glyph_to_obj,
    map_object,
    map_invisible,
    map_glyphinfo,
    newsym,
    obj_to_glyph,
    tmp_at,
    unmap_invisible,
} from './display.js';
import {
    Amonnam, a_monnam, l_monnam, m_monnam, Monnam, noit_mon_nam, c_obj_colors, hcolor, mon_nam, monverbself, obj_pmname,
    pmname, x_monnam, y_monnam,
} from './do_name.js';
import { can_reach_floor, cant_reach_floor, freehand } from './engrave.js';
import { game } from './gstate.js';
import { make_familiar } from './dog.js';
import {
    check_capacity,
    endRunning,
    invocation_pos,
    losehp,
    may_passwall,
    near_capacity,
    nomul,
    overexertion,
    spoteffects,
} from './hack.js';
import { dist2, highc, isqrt, sgn, s_suffix, strstri, truncateByteString, upstart } from './hacklib.js';
import { mstatusline, ustatusline } from './insight.js';
import { gulp_blnd_check } from './mhitu.js';
import { litroom, unpunish } from './read.js';
import {
    delobj,
    addinv_runtime,
    freeinv,
    addinv_nomerge,
    carrying,
    consume_obj_charge,
    getobj,
    any_obj_ok,
    hands_obj,
    nxtobj,
    obj_extract_self,
    obfree,
    update_inventory,
    useupall,
    useup,
    useupf,
    prinv,
    hold_another_object,
    stackobj,
    sobj_at,
} from './invent.js';
import { pick_lock } from './lock.js';
import { bagotricks, mkclass } from './makemon.js';
import { makemon_runtime } from './makemon_create.js';
import { mkundead } from './mkroom.js';
import {
    killed, m_in_air, mnexto, seemimic, set_ustuck, wakeup, wake_nearby, wake_nearto,
} from './mon.js';
import {
    can_blow,
    can_blnd,
    gender,
    humanoid,
    is_female,
    is_male,
    is_demon,
    is_unicorn,
    is_vampire,
    is_vampshifter,
    perceives,
    haseyes,
    has_head,
    mhe,
    is_rider,
    is_whirly,
    nohands,
    nolimbs,
    unsolid,
    pronoun_gender,
    slithy,
    throws_rocks,
    passes_walls,
    hides_under,
    locomotion,
    type_is_pname,
    bigmonst,
    strongmonst,
    verysmall,
    touch_petrifies,
    little_to_big,
    big_to_little,
    poly_when_stoned,
} from './mondata.js';
import {
    accessible, closed_door, monflee, onscary, set_apparxy, youHear,
    youSee,
} from './monmove.js';
import { m_at } from './monst.js';
import { paralyze_monst } from './mhitm.js';
import { do_play_instrument } from './music.js';
import { mon_reflects } from './muse.js';
import { get_mtraits } from './corpstat.js';
import { discover_object, objdescr_is, observe_object } from './o_init.js';
import { obj_resists } from './bury.js';
import { hornoplenty } from './mkobj_hornoplenty.js';
import {
    costly_alteration,
    bill_dummy_object,
    init_dummyobj,
    is_axe,
    is_boots,
    is_gloves,
    is_graystone,
    is_flimsy,
    is_pick,
    isCandle,
    hasContents,
    newObject,
    objectType,
    obj_no_longer_held,
    place_object,
    set_bknown,
    unbless,
    is_wet_towel,
    carried,
    splitobj,
    unsplitobj,
    mksobj,
    remove_object,
    weight,
} from './obj.js';
import {
    simple_typename,
    simpleonames,
    an,
    cxname,
    donameFresh,
    gloves_simple_name,
    singular,
    Tobjnam,
    the,
    The,
    vtense,
    Yobjnam2,
    Yname2,
    otense,
    safe_qbuf,
    thesimpleoname,
    yname,
    ysimple_name,
    xnameFresh,
} from './objnam.js';
import {
    BANANA,
    BELL,
    BELL_OF_OPENING,
    BLINDFOLD,
    BRASS_LANTERN,
    BULLWHIP,
    COIN_CLASS,
    CORPSE,
    CREAM_PIE,
    CRYSTAL_BALL,
    CREDIT_CARD,
    EUCALYPTUS_LEAF,
    FOOD_CLASS,
    GEM_CLASS,
    GRAPPLING_HOOK,
    HORN_OF_PLENTY,
    BUGLE,
    DRUM_OF_EARTHQUAKE,
    FIRE_HORN,
    FROST_HORN,
    LEATHER_DRUM,
    MAGIC_FLUTE,
    MAGIC_HARP,
    TOOLED_HORN,
    WOODEN_FLUTE,
    WOODEN_HARP,
    LENSES,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    EGG,
    MAGIC_MARKER,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
    POTION_CLASS,
    SKELETON_KEY,
    SLIME_MOLD,
    SPBOOK_CLASS,
    STATUE,
    STETHOSCOPE,
    TOOL_CLASS,
    TINNING_KIT,
    TOWEL,
    TOUCHSTONE,
    WAND_CLASS,
    WAN_CANCELLATION,
    WAN_COLD,
    WAN_CREATE_MONSTER,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_ENLIGHTENMENT,
    WAN_FIRE,
    WAN_LIGHT,
    WAN_LIGHTNING,
    WAN_LOCKING,
    WAN_MAGIC_MISSILE,
    WAN_NOTHING,
    WAN_OPENING,
    WAN_POLYMORPH,
    WAN_PROBING,
    WAN_SECRET_DOOR_DETECTION,
    WAN_STASIS,
    WAN_STRIKING,
    WAN_TELEPORTATION,
    WAN_UNDEAD_TURNING,
    WAN_WISHING,
    WEAPON_CLASS,
    LARGE_BOX,
    CHEST,
    ICE_BOX,
    LEASH,
    SACK,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    OILSKIN_SACK,
    EXPENSIVE_CAMERA,
    DWARVISH_MATTOCK,
    PICK_AXE,
    CAN_OF_GREASE,
    CANDELABRUM_OF_INVOCATION,
    FIGURINE,
    FLINT,
    RING_CLASS,
    RANDOM_CLASS,
    GEMSTONE,
    MINERAL,
    GLASS,
    CLOTH,
    LIQUID,
    WAX,
    WOOD,
    GOLD,
    SILVER,
    LUCKSTONE,
    LOADSTONE,
    MAGIC_WHISTLE,
    MIRROR,
    TIN_OPENER,
    TIN_WHISTLE,
    TALLOW_CANDLE,
    UNICORN_HORN,
    WAX_CANDLE,
    LAND_MINE,
    BEARTRAP,
    SADDLE,
    TIN,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SPE_NOVEL,
} from './objects.js';
import {
    AD_BLND, AT_ENGL, AT_WEAP, MZ_TINY, PM_AMOROUS_DEMON,
    PM_ARCHEOLOGIST, PM_FLOATING_EYE, PM_HEALER, PM_MEDUSA,
    PM_HORSE, PM_STONE_GOLEM, PM_UMBER_HULK, PM_WOOD_NYMPH,
    PM_WATER_NYMPH, PM_MOUNTAIN_NYMPH, PM_KILLER_BEE, PM_QUEEN_BEE,
    NON_PM, S_GHOST, S_NYMPH,
    S_VAMPIRE, S_EEL, S_MIMIC, PM_GNOME, PM_LONG_WORM,
} from './monsters.js';
import { body_part, mbodypart, poly_gender, polymon } from './polyself.js';
import { attacktype_fordmg } from './mondata.js';
import {
    djinni_from_bottle,
    incr_itimeout,
    make_blinded,
    make_confused,
    make_deaf,
    make_glib,
    make_hallucinated,
    make_sick,
    make_stunned,
    make_vomiting,
    set_itimeout,
} from './potion.js';
import { heroIsBlind, messageAt } from './startup_a11y.js';
import { P_SKILL } from './startup_skills.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import {
    attach_egg_hatch_timeout,
    obj_has_timer,
    obj_stop_timers,
    start_timer,
    stop_timer,
    spot_stop_timers,
} from './timeout.js';
import {
    activate_statue_trap,
    deltrap,
    fill_pit,
    instapetrify,
    Levitation,
    maketrap,
    reset_utrap,
    t_at,
    trapname,
} from './trap.js';
import { dotrap, feeltrap, mintrap } from './trap_effects.js';
import { ttyPline } from './tty_message.js';
import { cansee, couldsee, howmonseen, recalc_block_point, unblock_point, vision_recalc } from './vision.js';
import { bimanual, is_pole, mon_adjust_speed, setnotworn } from './worn.js';
import { dowrite } from './write.js';
import { encumber_msg, pickup_object, use_container } from './pickup.js';
import {
    buried_ball_to_freedom,
    dig_check,
    digactualhole,
    fillholetyp,
    liquid_flow,
    use_pick_axe,
    watch_dig,
} from './dig.js';
import { genders } from './roles.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz } from './rng.js';
import {
    check_unpaid,
    check_unpaid_usage,
    costly_spot,
    shop_keeper,
    shk_your,
    UnsupportedShopError,
} from './shk.js';
import { begin_burn, end_burn } from './timeout.js';
import { wield_tool } from './wield.js';
import { acurr } from './attrib.js';
import { known_spell, spe_Fresh, spelleffects } from './spell.js';
import { kick_steed, stucksteed, use_saddle } from './steed.js';
import { enexto, rloc, rloc_to, tele_restrict, tele_to_rnd_pet, teleds } from './teleport.js';
import { mpickobj } from './steal.js';
import {
    _doWearInternals,
    Blindf_off,
    fingers_or_gloves,
    inaccessible_equipment,
    setwornEnv,
} from './do_wear.js';
import {
    dropCommandEnv,
    dropx,
    boulder_hits_pool,
    legs_in_no_shape,
    revive_corpse,
    set_wounded_legs,
} from './do.js';
import {
    floorfood,
    morehungry,
    set_tin_variety,
    use_tin_opener,
    vomit,
} from './eat.js';
import { digests, hurtle, hurtle_jump, thitmonst, walk_path } from './dothrow.js';
import { makeplural } from './fruit.js';
import { change_luck } from './moveloop_preamble.js';
import { getpos, getpos_sethilite } from './getpos.js';
import { SPE_JUMPING, BOULDER } from './objects.js';
import { S_goodpos } from './symbols.js';
import { in_rooms } from './rooms.js';
import { On_stairs, stairway_at } from './stairs.js';
import { set_voice } from './sounds.js';
import {
    attack_checks,
    check_caitiff,
    flash_hits_mon,
    force_attack,
} from './uhitm.js';
import { get_obj_location, obj_merge_light_sources, transient_light_cleanup } from './light.js';
import {
    bhit,
    bhitm,
    bhitpile,
    release_hold,
    zapsetup,
    zappable,
    zapwrapup,
    zapyourself,
} from './zap.js';
import { explode } from './explode.js';
import { heroUnaware, verbalize } from './pline.js';
import { note_unported } from './unported.js';
import {
    dbon, dry_a_towel, setmnotwielded, uwep_skill_type,
} from './weapon.js';
import { mwelded } from './wield.js';
import { u_wipe_engr } from './engrave.js';
import { select_menu } from './windows.js';
import {
    ART_SNICKERSNEE,
    Stone_resistance,
    arti_speak,
    retouch_object,
} from './artifacts.js';
import { canseemon, canspotmon, sensemon } from './display.js';

function applyPropertyActive(property, state = game) {
    const value = state.u?.uprops?.[property];
    return Boolean((value?.intrinsic || value?.extrinsic) && !value?.blocked);
}

function applyIsConfused(state) {
    return Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
}

function applyIsStunned(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

function applyIsHallucinating(state) {
    const hallu = state.u?.uprops?.[HALLUC];
    const resist = state.u?.uprops?.[HALLUC_RES];
    return Boolean((hallu?.intrinsic || hallu?.extrinsic) && !hallu?.blocked
        && !(resist?.intrinsic || resist?.extrinsic));
}

function applyIsFumbling(state) {
    return applyPropertyActive(FUMBLING, state);
}

function applyIsGlib(state) {
    return applyPropertyActive(GLIB, state);
}

function polearmContext(state) {
    state.context ??= {};
    state.context.polearm ??= { hitmon: null };
    return state.context.polearm;
}

// C ref: apply.c calc_pole_range() (3371-3385). `gp` keeps this range for the
// duration of targeting, while context.polearm owns the remembered target.
export function calc_pole_range(state = game) {
    const type = uwep_skill_type(state);
    const skill = type === P_NONE ? P_NONE : P_SKILL(type, state);
    const minRange = 4;
    const maxRange = type === P_NONE || skill <= P_BASIC
        ? 4 : skill === P_SKILLED ? 5 : 8;
    state.gp ??= {};
    state.gp.polearm_range_min = minRange;
    state.gp.polearm_range_max = maxRange;
    return { minRange, maxRange };
}

function glyphIsPoleable(glyph) {
    return glyph_is_monster(glyph) || glyph_is_invisible(glyph)
        || glyph_is_statue(glyph);
}

// C ref: apply.c get_valid_polearm_position() (3321-3331).
export function get_valid_polearm_position(x, y, state = game) {
    const glyph = glyph_at(x, y, state);
    const distance = dist2(x, y, state.u.ux, state.u.uy);
    return isok(x, y) && distance >= state.gp?.polearm_range_min
        && distance <= state.gp?.polearm_range_max
        && (cansee(x, y, state)
            || (couldsee(x, y, state) && glyphIsPoleable(glyph)));
}

// C ref: apply.c display_polearm_positions() (3334-3353).
export async function display_polearm_positions(onOff, state = game) {
    if (onOff) {
        await tmp_at(DISP_BEAM, map_glyphinfo(cmap_to_glyph(S_goodpos, state), state), state);
        for (let dx = -3; dx <= 3; ++dx) {
            for (let dy = -3; dy <= 3; ++dy) {
                const x = state.u.ux + dx;
                const y = state.u.uy + dy;
                if (get_valid_polearm_position(x, y, state))
                    await tmp_at(x, y, state);
            }
        }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

// C ref: apply.c find_poleable_mon() (3284-3318). Preserve its x-major then
// y-major scan and the single-target-only result.
export function find_poleable_mon(pos, state = game) {
    const impaired = applyIsConfused(state) || applyIsStunned(state)
        || applyIsHallucinating(state);
    const rt = isqrt(state.gp.polearm_range_max);
    const lowX = Math.max(state.u.ux - rt, 1);
    const highX = Math.min(state.u.ux + rt, COLNO - 1);
    const lowY = Math.max(state.u.uy - rt, 0);
    const highY = Math.min(state.u.uy + rt, ROWNO - 1);
    let candidate = null;
    for (let x = lowX; x <= highX; ++x) {
        for (let y = lowY; y <= highY; ++y) {
            if (!get_valid_polearm_position(x, y, state)) continue;
            const glyph = glyph_at(x, y, state);
            const monster = !impaired && glyph_is_monster(glyph)
                ? m_at(x, y, state) : null;
            if (monster && (monster.mtame
                || (monster.mpeaceful && state.flags.confirm)))
                continue;
            if (glyphIsPoleable(glyph)
                && (!glyph_is_statue(glyph) || impaired)) {
                if (candidate) return false;
                candidate = { x, y };
            }
        }
    }
    if (!candidate) return false;
    pos.x = candidate.x;
    pos.y = candidate.y;
    return true;
}

// C ref: apply.c could_pole_mon() (3388-3411).
export function could_pole_mon(state = game) {
    if (!state.uwep || !is_pole(state.uwep, state)) return false;
    const { minRange, maxRange } = calc_pole_range(state);
    const pos = { x: state.u.ux, y: state.u.uy };
    if (find_poleable_mon(pos, state)) return true;
    const hitmon = polearmContext(state).hitmon;
    if (hitmon && hitmon.mhp > 0 && sensemon(hitmon, state)) {
        const distance = dist2(hitmon.mx, hitmon.my, state.u.ux, state.u.uy);
        if (distance <= maxRange && distance >= minRange) return true;
    }
    return false;
}

// C ref: apply.c snickersnee_used_dist_attk() (3414-3422).
export function snickersnee_used_dist_attk(obj, state = game) {
    return Boolean(obj && obj === state.uwep
        && obj.oartifact === ART_SNICKERSNEE
        && state.context?.snickersnee_turn === state.moves);
}

// C ref: apply.c use_whip() (2955-3279). The source's fire_damage(),
// kick_steed(), possibly_unwield(), and instapetrify() results are discarded;
// record those unported void boundaries without substituting a result.
export async function use_whip(obj, state = game, env = {}) {
    let monster;
    let rx;
    let ry;
    let proficient = 0;
    const msgSlipsFree = 'The bullwhip slips free.';
    const msgSnap = 'Snap!';
    const u = state.u;

    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'lash', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }
    if (!await getdir(null, state)) return ECMD_OK | ECMD_CANCEL;

    if (u.uswallow) {
        monster = u.ustuck;
        rx = monster.mx;
        ry = monster.my;
    } else {
        confdir(false, state);
        rx = u.ux + u.dx;
        ry = u.uy + u.dy;
        if (!isok(rx, ry)) {
            await ttyPline('You miss.', state);
            return ECMD_OK;
        }
        monster = m_at(rx, ry, state);
    }

    if (state.urole?.mnum === PM_ARCHEOLOGIST) ++proficient;
    const dexterity = acurr(state, A_DEX);
    if (dexterity < 6) --proficient;
    else if (dexterity >= 14) proficient += dexterity - 14;
    if (applyIsFumbling(state)) --proficient;
    proficient = Math.max(0, Math.min(3, proficient));

    if (u.uswallow) {
        await ttyPline("There's not enough room to flick your bullwhip.", state);
    } else if (u.uinwater) {
        await ttyPline("There's too much resistance to flick your bullwhip.", state);
    } else if (u.dz < 0) {
        await ttyPline(`You flick a bug off of the ${ceiling(u.ux, u.uy, state)}.`, state);
    } else if (!u.dz && (IS_WATERWALL(state.level.at(rx, ry).typ)
        || state.level.at(rx, ry).typ === LAVAWALL)) {
        await ttyPline('You cause a small splash.', state);
        if (state.level.at(rx, ry).typ === LAVAWALL)
            note_unported('trap.c fire_damage');
        return ECMD_TIME;
    } else if ((!u.dx && !u.dy) || u.dz > 0) {
        if (u.usteed && !rn2(proficient + 2)) {
            await ttyPline(`You whip ${mon_nam(u.usteed, state)}!`, state);
            await kick_steed(state);
            return ECMD_TIME;
        }
        if (is_pool_or_lava(u.ux, u.uy, state)
            || IS_WATERWALL(state.level.at(rx, ry).typ)
            || state.level.at(rx, ry).typ === LAVAWALL) {
            await ttyPline('You cause a small splash.', state);
            if (is_lava(u.ux, u.uy, state))
                note_unported('trap.c fire_damage');
            return ECMD_TIME;
        }
        if (Levitation(state) || u.usteed || applyPropertyActive(FLYING, state)) {
            let object = state.level.objects?.[u.ux]?.[u.uy] ?? null;
            if (object?.otyp === CORPSE
                && [PM_HORSE, little_to_big(PM_HORSE), big_to_little(PM_HORSE)]
                    .includes(object.corpsenm)) {
                await ttyPline('Why beat a dead horse?', state);
                return ECMD_TIME;
            }
            if (object && proficient) {
                const name = an(singular(object, xnameFresh, state), state);
                await ttyPline(
                    `You wrap your bullwhip around ${name} on the ${surface(u.ux, u.uy, state)}.`,
                    state,
                );
                if (rnl(6) || await pickup_object(object, 1, true, state) < 1)
                    await ttyPline(msgSlipsFree, state);
                return ECMD_TIME;
            }
        }
        let damage = rnd(2) + dbon(state) + obj.spe;
        if (damage <= 0) damage = 1;
        await ttyPline(`You hit your ${body_part(FOOT, state.youmonst)} with your bullwhip.`, state);
        const killer = `killed ${uhim(state)}self with ${state.flags.female ? 'her' : 'his'} bullwhip`;
        await losehp(halfPhysicalDamage(damage, state), killer, NO_KILLER_PREFIX, state);
        return ECMD_TIME;
    } else if ((applyIsFumbling(state) || applyIsGlib(state)) && !rn2(5)) {
        await ttyPline(`The bullwhip slips out of your ${body_part(HAND, state.youmonst)}.`, state);
        await dropx(obj, { state });
    } else if (u.utrap && u.utraptype === TT_PIT) {
        const tile = state.level.at(rx, ry);
        let wrappedWhat = sobj_at(BOULDER, rx, ry, state)
            ? 'a boulder' : IS_FURNITURE(tile.typ) ? 'something' : null;
        if (monster) {
            if (bigmonst(monster.data) && canspotmon(monster, state))
                wrappedWhat = mon_nam(monster, state);
            if (!wrappedWhat) wrappedWhat = null;
        }
        if (wrappedWhat) {
            const target = { x: rx, y: ry };
            await ttyPline(`You wrap your bullwhip around ${wrappedWhat}.`, state);
            if (proficient && rn2(proficient + 2)) {
                const adjacent = monster
                    ? enexto(rx, ry, state.youmonst.data, { state }) : target;
                if (!monster || adjacent) {
                    await ttyPline('You yank yourself out of the pit!', state);
                    await reset_utrap(true, state);
                    await teleds(adjacent.x, adjacent.y, TELEDS_ALLOW_DRAG, state);
                    state.vision_full_recalc = 1;
                }
            } else {
                await ttyPline(msgSlipsFree, state);
            }
            if (monster) await wakeup(monster, true, { state });
        } else if (monster) {
            return await whipattack(monster, rx, ry, proficient, state, env);
        } else {
            await ttyPline(msgSnap, state);
        }
    } else if (monster) {
        return await whipattack(monster, rx, ry, proficient, state, env);
    } else if (Is_airlevel(u.uz) || Is_waterlevel(u.uz)) {
        await ttyPline('You snap your whip through thin air.', state);
    } else {
        await ttyPline(msgSnap, state);
    }
    return ECMD_TIME;
}

// C ref: apply.c use_whip()'s `whipattack:` label, shared by the pit case
// when no boulder, furniture, or visible big monster can be used to escape.
async function whipattack(monster, rx, ry, proficient, state, env) {
        let object = null;
        if (!canspotmon(monster, state)) {
            monster.mundetected = 0;
            const spotItNow = canspotmon(monster, state);
            const rememberedGlyph = glyph_at(rx, ry, state);
            if (spotItNow || !glyph_is_invisible(rememberedGlyph)) {
                await ttyPline(
                `${spotItNow ? Amonnam(monster, state) : 'A monster'} is there that you `
                        + `${heroIsBlind(state) ? "hadn't noticed" : "couldn't see"}.`,
                    state,
                );
                if (!spotItNow) map_invisible(rx, ry, state);
                else newsym(rx, ry, state);
            }
        } else {
            object = monster.mw ?? null;
        }

        if (object) {
            const objectName = cxname(object, state);
            const gotIt = proficient && (!applyIsFumbling(state) || !rn2(10));
            let hand = gotIt ? mbodypart(monster, HAND) : null;
            if (gotIt && bimanual(object, state)) hand = makeplural(hand);
            await ttyPline(`You wrap your bullwhip around ${yname(object, state)}.`, state);
            let pullFree = gotIt;
            if (gotIt && mwelded(object, state)) {
                await ttyPline(
                    `${object.quan === 1 ? 'It is' : 'They are'} welded to ${s_suffix(mon_nam(monster, state))} ${hand}${object.bknown ? '.' : '!'}`,
                    state,
                );
                set_bknown(object, true, { state });
                pullFree = false;
            }
            if (pullFree) {
                obj_extract_self(object, { state });
                if (monster.mw === object) note_unported('weapon.c possibly_unwield');
                await setmnotwielded(monster, object, { state });
                switch (rn2(proficient + 1)) {
                case 2:
                    await ttyPline(`You yank ${yname(object, state)} to the ${surface(u.ux, u.uy, state)}!`, state);
                    place_object(object, u.ux, u.uy, { state });
                    stackobj(object, { state });
                    break;
                case 3: {
                    await ttyPline(`You snatch ${yname(object, state)}!`, state);
                    const species = state.mons?.[object.corpsenm];
                    const petrifies = object.otyp === CORPSE
                        && touch_petrifies(species) && !state.uarmg
                        && !Stone_resistance(state);
                    if (petrifies) {
                        const canTransform = poly_when_stoned(state.youmonst.data, state);
                        const saved = canTransform
                            ? await polymon(PM_STONE_GOLEM, state) : false;
                        if (!saved) {
                            await ttyPline(`Snatching ${an(objectName, state)} is a fatal mistake.`, state);
                            place_object(object, u.ux, u.uy, { state });
                            note_unported('trap.c instapetrify');
                            obj_extract_self(object, { state });
                        }
                    }
                    await hold_another_object(
                        object, 'You drop %s!', donameFresh(object, state),
                        null, { state },
                    );
                    break;
                }
                default:
                    await ttyPline(`You yank ${the(objectName, state)} from ${s_suffix(mon_nam(monster, state))} ${hand}!`, state);
                    obj_no_longer_held(object, { state });
                    place_object(object, monster.mx, monster.my, { state });
                    stackobj(object, { state });
                    break;
                }
            } else {
                await ttyPline(msgSlipsFree, state);
            }
        } else {
            let doSnap = true;
            if (M_AP_TYPE(monster) && !applyPropertyActive(PROT_FROM_SHAPE_CHANGERS, state)
                && !sensemon(monster, state)) {
                await stumble_onto_mimic(monster, state);
                doSnap = false;
            } else {
                await ttyPline(`You flick your bullwhip towards ${mon_nam(monster, state)}.`, state);
            }
            if (proficient && await force_attack(monster, false, state, env))
                return ECMD_TIME;
            if (doSnap) await ttyPline(msgSnap, state);
        }
        await wakeup(monster, true, { state });
        return ECMD_TIME;
}

// C ref: apply.c use_pole() (3426-3557).
export async function use_pole(obj, autohit, state = game) {
    let res = ECMD_OK;
    const pole = polearmContext(state);
    const hitmon = pole.hitmon;
    let freehit = false;
    let glyph;
    if (state.u.uswallow) {
        await ttyPline("There's not enough room here to use that.", state);
        return ECMD_OK;
    }
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'swing', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    const { minRange, maxRange } = calc_pole_range(state);
    if (!autohit) await ttyPline('Where do you want to hit?', state);
    const target = { x: state.u.ux, y: state.u.uy };
    if (!find_poleable_mon(target, state) && hitmon && hitmon.mhp > 0
        && sensemon(hitmon, state)) {
        const distance = dist2(hitmon.mx, hitmon.my, state.u.ux, state.u.uy);
        if (distance <= maxRange && distance >= minRange) {
            target.x = hitmon.mx;
            target.y = hitmon.my;
        }
    }
    if (!autohit) {
        await getpos_sethilite(display_polearm_positions, get_valid_polearm_position, state);
        if (await getpos(target, true, 'the spot to hit', state) < 0)
            return res | ECMD_CANCEL;
    }

    glyph = glyph_at(target.x, target.y, state);
    const distance = dist2(target.x, target.y, state.u.ux, state.u.uy);
    if (distance > maxRange) {
        await ttyPline('Too far!', state);
        return ECMD_FAIL;
    } else if (distance < minRange) {
        await ttyPline(autohit && u_at(target.x, target.y, state)
            ? "Don't know what to hit." : 'Too close!', state);
        return ECMD_FAIL;
    } else if (!cansee(target.x, target.y, state) && !glyphIsPoleable(glyph)) {
        await ttyPline("That won't hit anything if you can't see that spot.", state);
        return ECMD_FAIL;
    } else if (!couldsee(target.x, target.y, state)) {
        await ttyPline("You can't reach that spot from here.", state);
        return ECMD_FAIL;
    }

    pole.hitmon = null;
    state.gb.bhitpos = { x: target.x, y: target.y };
    const monster = m_at(target.x, target.y, state);
    if (monster) {
        if (await attack_checks(monster, state.uwep, state))
            return res | (state.context.move ? ECMD_TIME : ECMD_OK);
        if (await overexertion(state)) return ECMD_TIME;
        pole.hitmon = monster;
        if (snickersnee_used_dist_attk(obj, state)) {
            await ttyPline("The blade doesn't reach there!", state);
            return ECMD_FAIL;
        }
        await check_caitiff(monster, state);
        state.gn ??= {};
        state.gn.notonhead = target.x !== monster.mx || target.y !== monster.my;
        if (obj === state.uwep && obj.oartifact === ART_SNICKERSNEE) {
            freehit = state.moves !== state.context.snickersnee_turn;
            state.context.snickersnee_turn = state.moves;
            if (freehit && !applyPropertyActive(DEAF, state))
                await ttyPline('Shkinng!', state);
        }
        await thitmonst(monster, state.uwep, state);
    } else if (glyph_is_statue(glyph) && sobj_at(STATUE, target.x, target.y, state)) {
        const trap = t_at(target.x, target.y, state);
        if (!(trap && trap.ttyp === STATUE_TRAP
            && await activate_statue_trap(trap, trap.tx, trap.ty, false, { state }))) {
            await ttyPline('Thump!  Your blow bounces harmlessly off the statue.', state);
            await wake_nearto(target.x, target.y, 25, { state });
        }
    } else {
        unmap_invisible(target.x, target.y, state);
        if (glyph_to_obj(glyph) === BOULDER
            && sobj_at(BOULDER, target.x, target.y, state)) {
            await ttyPline('Thump!  Your blow bounces harmlessly off the boulder.', state);
            await wake_nearto(target.x, target.y, 25, { state });
        } else {
            const tile = state.level.at(target.x, target.y);
            if (!accessible(target.x, target.y, state) || IS_FURNITURE(tile.typ)) {
                const what = tile.typ === STONE || tile.typ === SCORR ? 'stone'
                    : glyph_is_cmap(glyph)
                        ? `the ${CMAP_EXPLANATIONS[glyph_to_cmap(glyph)]}`
                        : 'an unknown obstacle';
                await ttyPline(`You uselessly attack ${what}.`, state);
            } else {
                await ttyPline('You miss; there is no one there to hit.', state);
            }
        }
    }
    u_wipe_engr(2, { state });
    return freehit ? ECMD_OK : ECMD_TIME;
}

// C ref: apply.c get_mleash() (880-887). The leash belongs to the hero's
// inventory, and its leashmon id names the monster; the monster's minvent is
// not searched here.
// C ref: apply.c number_leashed() (698-708). The count is based on active
// inventory leash objects, not on monsters' mleashed bits.
export function number_leashed(state = game) {
    let count = 0;
    for (let object = state.invent; object; object = object.nobj) {
        if (object.otyp === LEASH && object.leashmon !== 0)
            count++;
    }
    return count;
}

// C ref: apply.c o_unleash() (711-724). The object owns the attachment id;
// clear it even when its monster is no longer on this level.
export function o_unleash(object, env = {}) {
    const state = env.state ?? game;
    for (let monster = state.level.monlist; monster; monster = monster.nmon) {
        if (monster.m_id === object.leashmon) {
            monster.mleashed = 0;
            break;
        }
    }
    object.leashmon = 0;
    update_inventory({ ...env, state });
}

// C ref: apply.c leashable() (761-766). The source reads mnum and the
// monster's current data; newcham() calls this after installing its new form.
export function leashable(monster) {
    return monster?.mnum !== PM_LONG_WORM
        && !unsolid(monster?.data)
        && (!nolimbs(monster?.data) || has_head(monster?.data));
}

// C ref: apply.c use_leash() (769-810). The direction prompt, active-leash
// limit, mounted downward case, and time result follow the source order.
async function use_leash(obj, state = game, env = {}) {
    const u = state.u;
    if (u.uswallow) {
        const phrase = !obj.leashmon
            ? `leash ${noit_mon_nam(u.ustuck, state, env)} from inside.`
            : obj.leashmon === u.ustuck?.m_id
                ? `unleash ${noit_mon_nam(u.ustuck, state, env)} from inside.`
                : `unleash anything from inside ${noit_mon_nam(u.ustuck, state, env)}.`;
        await ttyPline(`You can't ${phrase}`, state);
        return ECMD_OK;
    }
    if (!obj.leashmon && number_leashed(state) >= 2) {
        await ttyPline('You cannot leash any more pets.', state);
        return ECMD_OK;
    }

    const cc = {};
    if (!await get_adjacent_loc(null, null, u.ux, u.uy, cc, state))
        return ECMD_OK;

    if (u_at(cc.x, cc.y, state)) {
        if (u.usteed && u.dz > 0) {
            await use_leash_core(obj, u.usteed, cc, 1, state, env);
            return ECMD_TIME;
        }
        await ttyPline('Leash yourself?  Very funny...', state);
        return ECMD_OK;
    }

    const monster = m_at(cc.x, cc.y, state);
    if (!monster) {
        await ttyPline('There is no creature there.', state);
        unmap_invisible(cc.x, cc.y, state);
        return ECMD_TIME;
    }

    await use_leash_core(obj, monster, cc,
        canspotmon(monster, state) ? 1 : 0, state, env);
    return ECMD_TIME;
}

// C ref: apply.c use_leash_core() (821-877). A successful attachment updates
// both C-owned sides of the leash pair before refreshing the inventory view.
async function use_leash_core(obj, monster, cc, spotmon, state, env = {}) {
    if (!spotmon && !glyph_is_invisible(glyph_at(cc.x, cc.y, state))) {
        await ttyPline(
            `You fail to ${obj.leashmon ? 'un' : ''}leash something.`, state,
        );
        map_invisible(cc.x, cc.y, state);
    } else if (!monster.mtame) {
        await ttyPline(
            `${Monnam(monster, state, env)} ${!obj.leashmon ? 'cannot be' : 'is not'} leashed!`,
            state,
        );
    } else if (!obj.leashmon) {
        if (monster.mleashed) {
            await ttyPline(
                `This ${spotmon ? l_monnam(monster, state, env) : 'creature'} is already leashed.`,
                state,
            );
        } else if (unsolid(monster.data)) {
            await ttyPline('The leash would just fall off.', state);
        } else if (nolimbs(monster.data) && !has_head(monster.data)) {
            await ttyPline(
                `${Monnam(monster, state, env)} has no extremities the leash would fit.`,
                state,
            );
        } else if (!leashable(monster)) {
            let name = l_monnam(monster, state, env);
            if (cc.x !== monster.mx || cc.y !== monster.my)
                name = `${s_suffix(name)} tail`;
            await ttyPline(
                `The leash won't fit onto ${spotmon ? 'your ' : ''}${name}.`,
                state,
            );
        } else {
            await ttyPline(
                `You slip the leash around ${spotmon ? 'your ' : ''}${l_monnam(monster, state, env)}.`,
                state,
            );
            monster.mleashed = 1;
            obj.leashmon = monster.m_id;
            monster.msleeping = 0;
            update_inventory({ ...env, state });
        }
    } else if (obj.leashmon !== monster.m_id) {
        await ttyPline('This leash is not attached to that creature.', state);
    } else if (obj.cursed) {
        await ttyPline('The leash would not come off!', state);
        set_bknown(obj, true, { ...env, state });
    } else {
        monster.mleashed = 0;
        obj.leashmon = 0;
        update_inventory({ ...env, state });
        await ttyPline(
            `You remove the leash from ${spotmon ? 'your ' : ''}${l_monnam(monster, state, env)}.`,
            state,
        );
    }
}

export function get_mleash(monster, state = game) {
    for (let object = state.invent; object; object = object.nobj) {
        if (object.otyp === LEASH && object.leashmon === monster.m_id)
            return object;
    }
    return null;
}

// C ref: apply.c grapple_range(), can_grapple_location(),
// display_grapple_positions(), and use_grapple() (3686-3873).
export function grapple_range(state = game) {
    const typ = uwep_skill_type(state);
    let maxRange = 4;
    if (typ === P_NONE || P_SKILL(typ, state) <= P_BASIC) {
        maxRange = 4;
    } else if (P_SKILL(typ, state) === P_SKILLED) {
        maxRange = 5;
    } else {
        maxRange = 8;
    }
    return maxRange;
}

// apply.c uses distu(), whose source macro delegates to square-distance
// dist2(); this is intentionally not Chebyshev range.
export function can_grapple_location(x, y, state = game) {
    return isok(x, y) && cansee(x, y, state)
        && dist2(x, y, state.u.ux, state.u.uy) <= grapple_range(state);
}

export async function display_grapple_positions(onOff, state = game) {
    if (onOff) {
        await tmp_at(DISP_BEAM, map_glyphinfo(cmap_to_glyph(S_goodpos, state), state), state);
        for (let dx = -3; dx <= 3; ++dx) {
            for (let dy = -3; dy <= 3; ++dy) {
                const x = dx + state.u.ux;
                const y = dy + state.u.uy;
                if (can_grapple_location(x, y, state) && !u_at(x, y, state))
                    await tmp_at(x, y, state);
            }
        }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

// C apply.c:use_grapple() initializes any.a_int to 1 and increments it before
// each add_menu(); selected.a_int - 1 then maps these IDs to object/monster/
// surface values 1/2/3.
export function grapple_target_menu_items(ground) {
    let itemId = 1;
    return [
        { text: `an object on the ${ground}`, value: ++itemId },
        { text: 'a monster', value: ++itemId },
        { text: `the ${ground}`, value: ++itemId },
    ];
}

export function grapple_menu_choice_to_hit(itemId) {
    return Number(itemId) - 1;
}

export async function use_grapple(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? { rn1, rn2, rnd };
    let res = ECMD_OK;
    let typ;
    let tohit;
    let cc;
    let monster;
    let object;

    if (state.u.uswallow) {
        await message("There's not enough room here to use that.", state);
        return ECMD_OK;
    }
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'cast', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('apply'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    await message('Where do you want to hit?', state);
    cc = { x: state.u.ux, y: state.u.uy };
    await getpos_sethilite(display_grapple_positions, can_grapple_location, state);
    if (await getpos(cc, true, 'the spot to hit', state) < 0)
        return res | ECMD_CANCEL;

    typ = uwep_skill_type(state);
    if (dist2(cc.x, cc.y, state.u.ux, state.u.uy) > grapple_range(state)) {
        await message('Too far!', state);
        return res;
    } else if (!cansee(cc.x, cc.y, state)) {
        await message("You won't hit anything if you can't see that spot.", state);
        return res;
    } else if (!couldsee(cc.x, cc.y, state)) {
        await message("You can't reach that spot from here.", state);
        return res;
    }

    tohit = random.rn2(5);
    if (typ !== P_NONE && P_SKILL(typ, state) >= P_SKILLED) {
        const ground = surface(cc.x, cc.y, state);
        tohit = random.rn2(4);
        const selected = await select_menu(state, {
            title: 'Aim for what?',
            items: grapple_target_menu_items(ground),
            how: PICK_ONE,
            cancelValue: null,
            behavior: MENU_BEHAVE_STANDARD,
        });
        if (selected > 0
            && random.rn2(P_SKILL(typ, state) > P_SKILLED ? 20 : 2)) {
            tohit = grapple_menu_choice_to_hit(selected);
        }
    }

    if (tohit === 2 || !random.rn2(2))
        u_wipe_engr(random.rnd(2), { ...env, state, random });

    switch (tohit) {
    case 0:
        // apply.c's untrap FIXME leaves this target unchanged.
        break;
    case 1:
        object = state.level.objects?.[cc.x]?.[cc.y] ?? null;
        if (object) {
            await message(`You snag an object from the ${surface(cc.x, cc.y, state)}!`, state);
            // apply.c discards pickup_object()'s result.
            await pickup_object(object, 1, false, { ...env, state, random });
            newsym(cc.x, cc.y, state);
            return ECMD_TIME;
        }
        break;
    case 2:
        state.gb.bhitpos = { x: cc.x, y: cc.y };
        monster = m_at(cc.x, cc.y, state);
        if (!monster) break;
        state.gn.notonhead = state.gb.bhitpos.x !== monster.mx
            || state.gb.bhitpos.y !== monster.my;
        {
            const saveConfirm = state.flags.confirm;
            let adjacent = null;
            if (verysmall(monster.data) && !random.rn2(4)) {
                adjacent = enexto(
                    state.u.ux, state.u.uy, null,
                    { ...env, state, random },
                );
            }
            if (adjacent) {
                cc = adjacent;
                state.flags.confirm = false;
                await attack_checks(monster, state.uwep, state,
                    { ...env, message, random });
                state.flags.confirm = saveConfirm;
                await check_caitiff(monster, state,
                    { ...env, message, random });
                await message(
                    `You pull in ${mon_nam(monster, state, { ...env, random })}!`,
                    state,
                );
                monster.mundetected = 0;
                // apply.c discards rloc_to()'s return; its ordinary monster
                // relocation path is already available to this caller.
                await rloc_to(monster, cc.x, cc.y, { ...env, state, random });
                return ECMD_TIME;
            }
            if ((!bigmonst(monster.data) && !strongmonst(monster.data))
                || random.rn2(4)) {
                state.flags.confirm = false;
                await attack_checks(monster, state.uwep, state,
                    { ...env, message, random });
                state.flags.confirm = saveConfirm;
                await check_caitiff(monster, state,
                    { ...env, message, random });
                await thitmonst(monster, state.uwep, state, { ...env, random });
                return ECMD_TIME;
            }
        }
        // FALLTHROUGH: a large and strong monster can turn this into a
        // surface pull when the final source rn2(4) is zero.
    case 3:
        if (IS_AIR(state.level.at(cc.x, cc.y).typ) || is_pool(cc.x, cc.y, state)) {
            await message(`The hook slices through the ${surface(cc.x, cc.y, state)}.`, state);
        } else {
            await message(`You are yanked toward the ${surface(cc.x, cc.y, state)}!`, state);
            await hurtle(
                sgn(cc.x - state.u.ux),
                sgn(cc.y - state.u.uy),
                1,
                false,
                state,
            );
            await spoteffects(true, state, { ...env, random });
        }
        return ECMD_TIME;
    default:
        if (P_SKILL(typ, state) <= P_BASIC) {
            await message('You hook yourself!', state);
            await losehp(
                halfPhysicalDamage(random.rn1(10, 10), state),
                'a grappling hook', KILLED_BY, state, { ...env, random },
            );
            return ECMD_TIME;
        }
        break;
    }
    await message(nothing_happens, state);
    return ECMD_TIME;
}

// Thrown where apply.c reaches a tool or a branch this port has not ported.
export class UnsupportedApplyError extends Error {
    constructor(branch) {
        super(`applying a tool requires ${branch}`);
        this.name = 'UnsupportedApplyError';
        this.branch = branch;
    }
}

function cameraTransientLightEnv(state) {
    return {
        visionRecalc: (control) => vision_recalc(control, {
            state,
            redraw: (x, y) => newsym(x, y, state),
        }),
        flushScreen: (mode) => flush_screen(mode),
        canSpotMonster: (monster) => canspotmon(monster, state),
        mapInvisible: (x, y) => map_invisible(x, y, state),
    };
}

// C ref: apply.c do_blinding_ray() (61-76). zap.c:bhit() returns the first
// visible monster but handles invisible monsters while continuing the beam;
// both use the same FLASHED_LIGHT traversal and defer temporary-light cleanup
// until after this caller has processed the returned target.
export async function do_blinding_ray(
    object,
    state = game,
    env = {},
) {
    const random = env.random ?? { d, rn2, rnd };
    const monster = await bhit(
        state.u.dx,
        state.u.dy,
        COLNO,
        FLASHED_LIGHT,
        null,
        null,
        { obj: object },
        state,
        random,
        env,
    );
    object.ox = state.u.ux;
    object.oy = state.u.uy;
    if (monster) {
        await flash_hits_mon(monster, object, state, random, env);
        if (object.otyp === EXPENSIVE_CAMERA) {
            await see_monster_closeup(monster, true, {
                ...env,
                state,
                observedAt: state.gb.bhitpos,
            });
        }
    }
    await transient_light_cleanup(state, cameraTransientLightEnv(state));
}

// C ref: apply.c use_camera() (79-111). A charge is spent after direction
// selection, before cursed backfire, and the swallowed, vertical, selfie and
// aimed-ray outcomes are kept in the same source order.
export async function use_camera(object, state = game, env = {}) {
    if (state.u?.uinwater) {
        await ttyPline(
            'Using your camera underwater would void the warranty.', state,
        );
        return ECMD_OK;
    }
    if (!await getdir(null, state)) return ECMD_CANCEL;

    if (object.spe <= 0) {
        await ttyPline(nothing_happens, state);
        return ECMD_TIME;
    }
    consume_obj_charge(object, true, { ...env, state });

    const random = env.random ?? { d, rn2, rnd };
    if (object.cursed && !random.rn2(2)) {
        await zapyourself(object, true, state);
    } else if (state.u.uswallow) {
        const engulfer = state.u.ustuck;
        await ttyPline(
            `You take a picture of ${s_suffix(mon_nam(engulfer, state))} `
                + `${mbodypart(engulfer, STOMACH)}.`,
            state,
        );
    } else if (state.u.dz) {
        const location = state.u.dz > 0
            ? surface(state.u.ux, state.u.uy, state)
            : ceiling(state.u.ux, state.u.uy, state);
        await ttyPline(`You take a picture of the ${location}.`, state);
    } else if (!state.u.dx && !state.u.dy) {
        await zapyourself(object, true, state);
    } else {
        await do_blinding_ray(object, state, { ...env, random });
    }
    return ECMD_TIME;
}

// C ref: apply.c tinnable() (2167-2173). An uneaten corpse can be canned only
// when its species supplies nutrition; this pure predicate is shared by
// eat.c floorfood()'s tin_ok() and its final corpsecheck validation.
export function tinnable(corpse, state = game) {
    if (corpse?.oeaten) return false;
    return Boolean(state.mons?.[corpse?.corpsenm]?.cnutrit);
}

// C ref: apply.c use_tinning_kit() (2177-2258). apply.c:doapply() ignores
// this helper's return and retains its initial ECMD_TIME result. Petrification
// finishes before charge consumption or tin creation. Rider revival delegates to the
// whole do.c:revive_corpse() owner with the caller's lifecycle environment.
async function use_tinning_kit(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    if (obj.spe <= 0) {
        await message('You seem to be out of tins.', state);
        return;
    }

    const corpse = await floorfood('tin', 2, state);
    if (!corpse) return;
    if (corpse.oeaten) {
        await message('You cannot tin something which is partly eaten.', state);
        return;
    }

    const species = state.mons?.[corpse.corpsenm];
    if (!species)
        throw new RangeError(`tinning kit: invalid corpse species ${corpse.corpsenm}`);

    if (touch_petrifies(species) && !Stone_resistance(state) && !state.uarmg) {
        const corpseName = an(cxname(corpse, state), state);
        let kbuf = '';
        if (poly_when_stoned(state.youmonst.data, state)) {
            await message(
                `You tin ${corpseName} without wearing gloves.`,
                state,
            );
        } else {
            await message(
                `Tinning ${corpseName} without wearing gloves is a fatal mistake...`,
                state,
            );
            kbuf = `trying to tin ${corpseName} without gloves`;
        }
        await instapetrify(kbuf, state, env);
        // C's really_done() never returns after death; the JS end owner
        // retains the final terminal boundary and sets gameover instead.
        if (state.program_state?.gameover) return;
    }

    if (is_rider(species)) {
        if (await revive_corpse(corpse, state, env)) {
            await verbalize(
                'Yes...  But War does not preserve its enemies...',
                state,
                { message },
            );
        } else {
            await message('The corpse evades your grasp.', state);
        }
        return;
    }
    if (species.cnutrit === 0) {
        await message("That's too insubstantial to tin.", state);
        return;
    }

    consume_obj_charge(obj, true, { ...env, state });
    const can = mksobj(TIN, false, false, { ...env, state });
    if (!can) {
        note_unported('pline.c impossible');
        return;
    }

    can.corpsenm = corpse.corpsenm;
    can.cursed = obj.cursed;
    can.blessed = obj.blessed;
    can.owt = weight(can, { ...env, state });
    can.known = true;
    set_tin_variety(can, HOMEMADE_TIN, { ...env, state });
    const lifecycleEnv = {
        ...env,
        state,
        hooks: {
            ...env.hooks,
            extractExternalObject:
                env.hooks?.extractExternalObject ?? remove_object,
            stopObjectTimers: env.hooks?.stopObjectTimers
                ?? ((target, hookEnv) => obj_stop_timers(
                    target,
                    hookEnv.state ?? state,
                    hookEnv,
                )),
            encumberMessage: env.hooks?.encumberMessage ?? encumber_msg,
        },
    };

    if (carried(corpse)) {
        if (corpse.unpaid) {
            const room = in_rooms(state.u.ux, state.u.uy, SHOPBASE, state)[0]
                ?? 0;
            const shopkeeper = shop_keeper(room, state);
            set_voice(shopkeeper, 0, 80, 0, state);
            await verbalize('You tin it, you bought it!', state, { message });
        }
        await useup(corpse, lifecycleEnv);
    } else {
        if (costly_spot(corpse.ox, corpse.oy, state) && !corpse.no_charge) {
            const room = in_rooms(
                corpse.ox,
                corpse.oy,
                SHOPBASE,
                state,
            )[0] ?? 0;
            const shopkeeper = shop_keeper(room, state);
            set_voice(shopkeeper, 0, 80, 0, state);
            await verbalize('You tin it, you bought it!', state, { message });
        }
        await useupf(corpse, 1, lifecycleEnv);
    }

    await hold_another_object(
        can,
        'You make, but cannot pick up, %s.',
        donameFresh(can, state),
        null,
        {
            ...lifecycleEnv,
        },
    );
}

// C ref: youprop.h:120 Hallucination, which is the intrinsic timeout alone
// minus resistance from either source.
function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    if (!hallucination || !resistance)
        throw new Error('Hallucination requires initialized u.uprops');
    return Boolean(hallucination.intrinsic
        && !(resistance.intrinsic || resistance.extrinsic));
}

// C ref: youprop.h:125 Deaf, which adds the permanent-deafness roleplay
// option to the intrinsic and the extrinsic.
function heroDeaf(state) {
    const deafness = state.u?.uprops?.[DEAF] ?? {};
    return Boolean(deafness.intrinsic || deafness.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: apply.c use_cream_pie() (3568-3603). The C-discarded shop
// alteration remains a named gap for billed inventory when its implementation
// is not supplied; the ordinary paid inventory path is costly_alteration()'s
// source fast path.
async function use_cream_pie(obj, state = game, rawEnv = {}) {
    const random = { d, rn1, rn2, rnd, rne, rnz, ...(rawEnv.random ?? {}) };
    const env = { ...rawEnv, state, random };
    const wasblind = heroIsBlind(state);
    const wascreamed = Boolean(state.u.ucreamed);
    const several = obj.quan > 1;

    if (several)
        obj = splitobj(obj, 1, env);

    if (heroHallucinating(state)) {
        await ttyPline('You give yourself a facial.', state);
    } else {
        const pieName = the(xnameFresh(obj, state), state);
        const pieDescription = several
            ? `one of ${makeplural(pieName)}`
            : pieName;
        await ttyPline(
            `You immerse your ${body_part(FACE, state.youmonst)} in ${pieDescription}.`,
            state,
        );
    }

    if (can_blnd(null, state.youmonst, AT_WEAP, obj, state)) {
        const blindinc = random.rnd(25);
        state.u.ucreamed += blindinc;
        const blindness = state.u.uprops[BLINDED];
        await make_blinded(
            (blindness.intrinsic & TIMEOUT) + blindinc,
            false,
            state,
            env,
        );
        if (!heroIsBlind(state) || wasblind) {
            await ttyPline(
                `There's ${wascreamed ? 'more ' : ''}sticky goop all over your ${
                    body_part(FACE, state.youmonst)}.`,
                state,
            );
        } else {
            await ttyPline(
                `You can't see through all the sticky goop on your ${
                    body_part(FACE, state.youmonst)}.`,
                state,
            );
        }
    }

    await setnotworn(obj, env);
    if (obj.unpaid && typeof env.hooks?.costlyAlteration !== 'function') {
        if (state === game) note_unported('mkobj.c costly_alteration');
    } else {
        costly_alteration(obj, COST_SPLAT, env);
    }
    obj_extract_self(obj, env);
    delobj(obj, env);
    return ECMD_OK;
}

// C ref: apply.c reset_trapset() (2812-2817), the third of the three clears
// cmd.c reset_occupations() makes. C resets only the object and bungle flag;
// the target coordinates and remaining setup time stay in gt.trapinfo.
export function reset_trapset(state = game) {
    state.gt ??= {};
    state.gt.trapinfo ??= {
        tobj: null,
        tx: 0,
        ty: 0,
        time_needed: 0,
        force_bungle: false,
    };
    state.gt.trapinfo.tobj = null;
    state.gt.trapinfo.force_bungle = false;
}

function trapSettingFumbling(state) {
    const property = state.u?.uprops?.[FUMBLING];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function trapSettingStunned(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}

// C ref: apply.c use_trap() (2821-2911). The caller has already selected a
// land mine or bear trap in doapply(); this function validates the square,
// records gt.trapinfo, and installs set_trap() as the turn occupation.
export async function use_trap(obj, state = game, env = {}) {
    const random = env.random ?? { rnl };
    const location = state.level.at(state.u.ux, state.u.uy);
    const levtyp = location.typ;
    const trapinfo = state.gt?.trapinfo;
    let what = null;

    if (nohands(state.youmonst.data))
        what = 'without hands';
    else if (trapSettingStunned(state))
        what = 'while stunned';
    else if (state.u.uswallow)
        what = digests(state.u.ustuck?.data)
            ? 'while swallowed' : 'while engulfed';
    else if (state.u.uinwater)
        what = 'underwater';
    else if (Levitation(state))
        what = 'while levitating';
    else if (is_pool(state.u.ux, state.u.uy, state))
        what = 'in water';
    else if (is_lava(state.u.ux, state.u.uy, state))
        what = 'in lava';
    else if (On_stairs(state.u.ux, state.u.uy, state)) {
        const stway = stairway_at(state.u.ux, state.u.uy, state);
        what = stway.isladder ? 'on the ladder' : 'on the stairs';
    } else if (IS_FURNITURE(levtyp) || IS_OBSTRUCTED(levtyp)
        || closed_door(state.u.ux, state.u.uy, state)
        || t_at(state.u.ux, state.u.uy, state)) {
        what = 'here';
    } else if (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)) {
        what = levtyp === AIR ? 'in midair'
            : levtyp === CLOUD ? 'in a cloud' : 'in this place';
    }

    if (what) {
        await ttyPline(`You can't set a trap ${what}!`, state);
        reset_trapset(state);
        return;
    }

    const ttyp = obj.otyp === LAND_MINE ? LANDMINE : BEAR_TRAP;
    if (obj === trapinfo?.tobj
        && u_at(trapinfo.tx, trapinfo.ty, state)) {
        await ttyPline(
            `You resume setting ${shk_your(obj, state)}${trapname(ttyp, false, state)}.`,
            state,
        );
        set_occupation(set_trap, 'setting the trap', 0, state);
        return;
    }

    state.gt ??= {};
    state.gt.trapinfo ??= {
        tobj: null,
        tx: 0,
        ty: 0,
        time_needed: 0,
        force_bungle: false,
    };
    const currentTrapInfo = state.gt.trapinfo;
    currentTrapInfo.tobj = obj;
    currentTrapInfo.tx = state.u.ux;
    currentTrapInfo.ty = state.u.uy;
    let attribute = acurr(state, A_DEX);
    currentTrapInfo.time_needed = attribute > 17 ? 2
        : attribute > 12 ? 3 : attribute > 7 ? 4 : 5;
    if (heroIsBlind(state)) currentTrapInfo.time_needed *= 2;
    attribute = acurr(state, A_STR);
    if (ttyp === BEAR_TRAP && attribute < 18) {
        currentTrapInfo.time_needed += attribute > 12 ? 1
            : attribute > 7 ? 2 : 4;
    }

    if (state.u.usteed && P_SKILL(P_RIDING, state) < P_BASIC) {
        const chance = trapSettingFumbling(state) || obj.cursed
            ? random.rnl(10) > 3
            : random.rnl(10) > 5;
        await ttyPline(
            `You aren't very skilled at reaching from ${mon_nam(state.u.usteed, state)}.`,
            state,
        );
        const question = `Continue your attempt to set ${the(trapname(ttyp, false, state), state)}?`;
        if (await y_n(question, state) === 'y') {
            if (chance) {
                if (ttyp === LANDMINE) {
                    currentTrapInfo.time_needed = 0;
                    currentTrapInfo.force_bungle = true;
                } else {
                    reset_trapset(state);
                    await ttyPline(
                        `You drop ${the(trapname(ttyp, false, state), state)}!`,
                        state,
                    );
                    await dropx(obj, { ...env, state });
                    return;
                }
            }
        } else {
            reset_trapset(state);
            return;
        }
    }

    await ttyPline(
        `You begin setting ${shk_your(obj, state)}${trapname(ttyp, false, state)}.`,
        state,
    );
    if (obj.unpaid) note_unported('shk.c use_unpaid_trapobj');
    set_occupation(set_trap, 'setting the trap', 0, state);
}

// C ref: apply.c set_trap() (2914-2952), the untimed occupation callback.
// Its integer answer is consumed by allmain.c: a positive answer keeps the
// occupation, and zero clears it after this turn.
export async function set_trap(state = game, env = {}) {
    const trapinfo = state.gt?.trapinfo;
    const obj = trapinfo?.tobj;
    if (!obj || !carried(obj) || !u_at(trapinfo.tx, trapinfo.ty, state)) {
        reset_trapset(state);
        return 0;
    }

    if (--trapinfo.time_needed > 0) return 1;

    const ttyp = obj.otyp === LAND_MINE ? LANDMINE : BEAR_TRAP;
    const trap = maketrap(state.u.ux, state.u.uy, ttyp, { ...env, state });
    if (trap) {
        trap.madeby_u = true;
        feeltrap(trap, {
            state,
            redraw: (x, y) => newsym(x, y, state),
        });
        if (in_rooms(state.u.ux, state.u.uy, SHOPBASE, state).length)
            note_unported('shk.c add_damage');
        if (!trapinfo.force_bungle) {
            await ttyPline(
                `You finish arming ${the(trapname(ttyp, false, state), state)}.`,
                state,
            );
        }
        if (((obj.cursed || trapSettingFumbling(state))
            && (env.random?.rnl ?? rnl)(10) > 5)
            || trapinfo.force_bungle) {
            // C discards dotrap()'s result. Its complete trigger chain is not
            // in this task, so retain the named gap and skip its partial port.
            note_unported('trap.c dotrap');
        }
    } else {
        await ttyPline('Your trap setting attempt fails.', state);
    }
    await useup(obj, { ...env, state });
    reset_trapset(state);
    return 0;
}

// C ref: apply.c apply_ok() (4149-4210), the getobj() callback for the `a`
// command. It is longer than most because there are many appliable things.
export function apply_ok(obj, state = game) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    /* all tools, all wands (breaking), all spellbooks (flipping through -
       including blank/novel/Book of the Dead) */
    if (obj.oclass === TOOL_CLASS || obj.oclass === WAND_CLASS
        || obj.oclass === SPBOOK_CLASS)
        return GETOBJ_SUGGEST;

    /* applying coins to flip them is a minor easter egg, so do not suggest
       coin application to the player */
    if (obj.oclass === COIN_CLASS)
        return GETOBJ_DOWNPLAY;

    /* certain weapons */
    if (obj.oclass === WEAPON_CLASS
        && (is_pick(obj, state) || is_axe(obj, state) || is_pole(obj, state)
            || obj.otyp === BULLWHIP))
        return GETOBJ_SUGGEST;

    if (obj.oclass === POTION_CLASS) {
        /* permit applying unknown potions, but don't suggest them */
        if (!obj.dknown || !objectType(obj, state).oc_name_known)
            return GETOBJ_DOWNPLAY;

        /* only applicable potion is oil, and it will only be suggested as a
           choice when already discovered */
        if (obj.otyp === POT_OIL)
            return GETOBJ_SUGGEST;
    }

    /* certain foods */
    if (obj.otyp === CREAM_PIE || obj.otyp === EUCALYPTUS_LEAF
        || obj.otyp === LUMP_OF_ROYAL_JELLY)
        return GETOBJ_SUGGEST;

    if (obj.otyp === BANANA && heroHallucinating(state))
        return GETOBJ_DOWNPLAY;

    if (is_graystone(obj)) {
        /* The only case where we don't suggest a gray stone is if we KNOW it
           isn't a touchstone. */
        if (!obj.dknown)
            return GETOBJ_SUGGEST;

        if (obj.otyp !== TOUCHSTONE
            && (objectType(TOUCHSTONE, state).oc_name_known
                || objectType(obj, state).oc_name_known))
            return GETOBJ_EXCLUDE_SELECTABLE;

        return GETOBJ_SUGGEST;
    }

    /* item can't be applied; if picked anyway,
       _EXCLUDE would yield "That is a silly thing to apply.",
       _EXCLUDE_SELECTABLE yields "Sorry, I don't know how to use that." */
    return GETOBJ_EXCLUDE_SELECTABLE;
}

// C ref: apply.c rub_ok() (1770-1781), the getobj() callback for #rub.
// Hands are excluded along with every carried object except the three lamps,
// the four gray stones, and royal jelly.
export function rub_ok(obj) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    if (obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP
        || obj.otyp === BRASS_LANTERN || is_graystone(obj)
        || obj.otyp === LUMP_OF_ROYAL_JELLY)
        return GETOBJ_SUGGEST;

    return GETOBJ_EXCLUDE;
}

// C ref: apply.c touchstone_ok() (2658-2675), getobj's secondary-object
// ranking for a known touchstone. Identified gems are selectable but not
// suggested; every other ordinary inventory object is downplayed.
export function touchstone_ok(obj, state = game) {
    if (!obj)
        return GETOBJ_EXCLUDE;

    if (obj.oclass === COIN_CLASS)
        return GETOBJ_SUGGEST;

    if (obj.oclass === GEM_CLASS
        && !(obj.dknown && objectType(obj, state).oc_name_known))
        return GETOBJ_SUGGEST;

    return GETOBJ_DOWNPLAY;
}

// C ref: apply.c use_stone() (2680-2810). Preserve the callback choice and
// C's observation, resistance, discovery, and message order for both `a` and
// `#rub` callers.
export async function use_stone(tstone, state = game, env = {}) {
    const scritch = '"scritch, scritch"';
    if (!heroIsBlind(state))
        observe_object(tstone, state);

    const known = tstone.otyp === TOUCHSTONE
        && tstone.dknown
        && objectType(TOUCHSTONE, state).oc_name_known;
    let obj = await getobj(
        `rub on the stone${plur(tstone.quan)}`,
        known ? (candidate) => touchstone_ok(candidate, state) : any_obj_ok,
        GETOBJ_PROMPT,
        state,
    );
    if (!obj)
        return ECMD_CANCEL;

    if (obj === tstone && obj.quan === 1) {
        await ttyPline(
            `You can't rub ${the(xnameFresh(obj, state), state)} on itself.`,
            state,
        );
        return ECMD_OK;
    }

    if (tstone.otyp === TOUCHSTONE && tstone.cursed
        && obj.oclass === GEM_CLASS && !is_graystone(obj)
        && !obj_resists(obj, 80, 100, { ...env, state })) {
        if (heroIsBlind(state)) {
            await ttyPline('You feel something shatter.', state);
        } else if (heroHallucinating(state)) {
            await ttyPline('Oh, wow, look at the pretty shards.', state);
        } else {
            await ttyPline(
                `A sharp crack shatters ${obj.quan > 1 ? 'one of ' : ''}`
                    + `${the(xnameFresh(obj, state), state)}.`,
                state,
            );
        }
        await useup(obj, { ...env, state });
        return ECMD_TIME;
    }

    if (heroIsBlind(state)) {
        await ttyPline(scritch, state);
        return ECMD_TIME;
    } else if (heroHallucinating(state)) {
        await ttyPline('Oh wow, man: Fractals!', state);
        return ECMD_TIME;
    }

    let doScratch = false;
    let streakColor = null;
    let oclass = obj.oclass;
    const objType = objectType(obj, state);

    // apply.c treats non-gemstone/non-mineral rings as ordinary objects for
    // the material branch below.
    if (oclass === RING_CLASS
        && objType.oc_material !== GEMSTONE
        && objType.oc_material !== MINERAL)
        oclass = RANDOM_CLASS;

    switch (oclass) {
    case GEM_CLASS:
    case RING_CLASS:
        if (tstone.otyp !== TOUCHSTONE) {
            doScratch = true;
        } else if (obj.oclass === GEM_CLASS
            && (tstone.blessed
                || (!tstone.cursed
                    && (state.urole?.mnum === PM_ARCHEOLOGIST
                        || state.urace?.mnum === PM_GNOME)))) {
            const random = env.random ?? { d, rn1, rn2, rnd, rne, rnl, rnz };
            const knowledgeEnv = {
                ...env,
                random,
                gemLearned: env.gemLearned ?? env.hooks?.gemLearned
                    ?? (() => note_unported('shk.c gem_learned')),
            };
            discover_object(TOUCHSTONE, true, true, true, state, {
                ...knowledgeEnv,
            });
            discover_object(obj.otyp, true, true, true, state, {
                ...knowledgeEnv,
            });
            await prinv(null, obj, 0, { ...env, state });
            return ECMD_TIME;
        } else if (objType.oc_material === GLASS) {
            doScratch = true;
            break;
        }
        streakColor = c_obj_colors[objType.oc_color];
        break;

    default:
        switch (objType.oc_material) {
        case CLOTH:
            await ttyPline(
                `${Tobjnam(tstone, 'look', state)} a little more polished now.`,
                state,
            );
            return ECMD_TIME;
        case LIQUID:
            if (!obj.known) {
                await ttyPline(
                    'You must think this is a wetstone, do you?',
                    state,
                );
            } else {
                await ttyPline(
                    `${Tobjnam(tstone, 'are', state)} a little wetter now.`,
                    state,
                );
            }
            return ECMD_TIME;
        case WAX:
            streakColor = 'waxy';
            break;
        case WOOD:
            streakColor = 'wooden';
            break;
        case GOLD:
            doScratch = true;
            streakColor = 'golden';
            break;
        case SILVER:
            doScratch = true;
            streakColor = 'silvery';
            break;
        default:
            if (is_flimsy(obj, state))
                streakColor = c_obj_colors[objType.oc_color];
            else
                doScratch = tstone.otyp !== TOUCHSTONE;
            break;
        }
        break;
    }

    const stoneName = `stone${plur(tstone.quan)}`;
    if (doScratch) {
        const color = streakColor ? `${streakColor} ` : '';
        await ttyPline(
            `You make ${color}scratch marks on the ${stoneName}.`,
            state,
        );
    } else if (streakColor) {
        await ttyPline(
            `You see ${streakColor} streaks on the ${stoneName}.`,
            state,
        );
    } else {
        await ttyPline(scritch, state);
    }
    return ECMD_TIME;
}

// C ref: apply.c dorub() (1785-1846). The selected tool is wielded on one
// turn and rubbed by its queued continuation; stones and jelly return their
// owners' command results directly.
export async function dorub(state = game, env = {}) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to rub anything without hands.",
            state,
        );
        return ECMD_OK;
    }
    const obj = await getobj('rub', rub_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    if (obj.oclass === GEM_CLASS || obj.oclass === FOOD_CLASS) {
        if (is_graystone(obj))
            return use_stone(obj, state, env);
        if (obj.otyp === LUMP_OF_ROYAL_JELLY)
            return use_royal_jelly({ obj }, state, env);
        await ttyPline("Sorry, I don't know how to use that.", state);
        return ECMD_OK;
    }
    if (obj !== state.uwep) {
        if (await wield_tool(obj, 'rub', state)) {
            cmdq_add_ec(CQ_CANNED, extcmdRow('rub'), state);
            cmdq_add_key(CQ_CANNED, obj.invlet, state);
            return ECMD_TIME;
        }
        return ECMD_OK;
    }

    if (state.uwep.otyp === MAGIC_LAMP) {
        const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
        if (state.uwep.spe > 0 && !random.rn2(3)) {
            check_unpaid_usage(state.uwep, true, state);
            state.uwep.otyp = OIL_LAMP;
            state.uwep.spe = 0;
            state.uwep.age = random.rn1(500, 1000);
            if (state.uwep.lamplit)
                begin_burn(state.uwep, true, { ...env, state });
            await (env.djinniFromBottle ?? djinni_from_bottle)(
                state.uwep,
                state,
                { ...env, random },
            );
            discover_object(
                MAGIC_LAMP,
                true,
                true,
                true,
                state,
                { ...env, random },
            );
            update_inventory({ ...env, state });
        } else if (random.rn2(2)) {
            await ttyPline(
                `You ${heroIsBlind(state) ? 'smell' : 'see a puff of'} smoke.`,
                state,
            );
        } else {
            await ttyPline(nothing_happens, state);
        }
    } else if (obj.otyp === BRASS_LANTERN) {
        await ttyPline(
            'Rubbing the electric lamp is not particularly rewarding.', state,
        );
        await ttyPline('Anyway, nothing exciting happens.', state);
    } else {
        await ttyPline(nothing_happens, state);
    }
    return ECMD_TIME;
}

// C ref: apply.c its_dead() (196-309), the floor-object half of a listen.
// C answers TRUE when it printed something and FALSE when the square holds
// neither a corpse nor a statue, which is when the caller falls through to
// "You hear nothing special."
//
// C takes `int *resp` so that its hallucination arm can charge the turn. The
// exported source-named helper retains its boolean result and optionally
// accepts the caller-owned response holder for that write.
function selectedDeadObject(rx, ry, state) {
    let corpse = sobj_at(CORPSE, rx, ry, state);
    let statue = sobj_at(STATUE, rx, ry, state);
    const canReachFloor = can_reach_floor(true, state);

    if (!canReachFloor) {               /* levitation or unskilled riding */
        corpse = null;                   /* can't reach corpse on floor */
        // apply.c:208-211. An out-of-reach hero cannot touch tiny statues;
        // walk this square's pile until the first statue whose species is not
        // tiny. When none remains, its_dead() reaches its FALSE fall-through.
        while (statue
            && state.mons[statue.corpsenm].msize === MZ_TINY) {
            statue = nxtobj(statue, STATUE, true);
        }
    }
    // apply.c:213-219. sobj_at() found the first object of each kind. If the
    // first corpse follows the first statue in the square's nexthere chain,
    // the statue is uppermost; otherwise the corpse is. An unrelated object
    // between them does not affect the comparison.
    if (corpse && statue) {
        if (nxtobj(statue, CORPSE, true) === corpse) corpse = null;
        else statue = null;
    }
    return { corpse, statue };
}

// C ref: apply.c its_dead(). The optional response holder models C's `int
// *resp`; direct callers that need only the source boolean result may omit it.
export async function its_dead(rx, ry, state = game, response = null) {
    const { corpse, statue } = selectedDeadObject(rx, ry, state);
    if ((corpse || statue) && heroHallucinating(state)) {
        let answer;
        if (!corpse) {
            answer = "You're both stoned";
        } else {
            const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
            if (corpse.quan === 1 && !more_corpses) {
                let gndr = 2;
                const saved = get_mtraits(corpse, false, state);
                if (saved) {
                    gndr = pronoun_gender(saved, PRONOUN_NO_IT, { state });
                } else {
                    const species = state.mons[corpse.corpsenm];
                    if (is_female(species)) gndr = 1;
                    else if (is_male(species)) gndr = 0;
                }
                const pronoun = genders[gndr].he;
                answer = `${highc(pronoun[0])}${pronoun.slice(1)}'s dead`;
            } else {
                answer = "They're dead";
            }
        }
        const heard = youHear(`a voice say, "${answer}, Jim."`, state);
        if (heard) await ttyPline(heard, state);
        if (response) response.value = ECMD_TIME;
        return true;
    }
    if (corpse) {
        const more_corpses = Boolean(nxtobj(corpse, CORPSE, true));
        const one = (corpse.quan === 1 && !more_corpses);
        const here = u_at(rx, ry, state);
        const visglyph = glyph_at(rx, ry, state);
        const corpseglyph = obj_to_glyph(corpse, state);
        let reviver = false;
        if (heroIsBlind(state) && visglyph !== corpseglyph.glyph)
            map_object(corpse, true, state);
        if (state.urole?.mnum === PM_HEALER) {
            // apply.c:265-274. This only detects a pending revival; it neither
            // runs nor changes the timer. Walk the square's nexthere chain,
            // stopping at the first corpse with REVIVE_MON.
            let current = corpse;
            do {
                if (obj_has_timer(current, REVIVE_MON, state))
                    reviver = true;
                else
                    current = nxtobj(current, CORPSE, true);
            } while (current && !reviver);
        }
        await ttyPline(
            `You determine that ${one ? (here ? 'this' : 'that')
                : (here ? 'these' : 'those')} unfortunate being${
                one ? '' : 's'} ${one ? 'is' : 'are'}${
                reviver ? ' mostly' : ''} dead.`,
            state,
        );
        return true;
    }
    if (statue) {
        const species = state.mons[statue.corpsenm];
        let what;
        let how = 'fine';
        if (heroIsBlind(state)) {
            what = `${u_at(rx, ry, state) ? 'This' : 'That'} ${
                humanoid(species) ? 'person' : 'creature'}`;
        } else {
            what = obj_pmname(statue, state);
            if (!type_is_pname(species)) what = The(what, state);
        }
        if (state.urole?.mnum === PM_HEALER) {
            if (t_at(rx, ry, state)?.ttyp === STATUE_TRAP)
                how = 'extraordinary';
            else if (hasContents(statue))
                how = 'remarkable';
        }
        await ttyPline(`${what} is in ${how} health for a statue.`, state);
        return true;
    }
    return false;
}

// C ref: apply.c use_stethoscope() (317-470), with C's own comment above it at
// 313-316 explaining the free action: one use per turn costs nothing, so a
// second use in the same move is what makes a cursed stethoscope's wasted
// listen cost anything.
//
// Mounted and swallowed branches await insight.c mstatusline() in the same
// source order as their preceding interference message. Both directions call
// engrave.c cant_reach_floor() from js/engrave.js. Soundeffect() expands to an
// empty macro in this tty build, while You_hear() remains visible through
// youHear().
async function use_stethoscope(obj, state = game) {
    const u = state.u;
    // apply.c:324-325. The source initializer draws before every guard when a
    // swallowed hero is inside a whirly engulfer.
    const interference = Boolean(u.uswallow && is_whirly(u.ustuck.data)
        && !rn2(state.urole?.mnum === PM_HEALER ? 10 : 3));

    if (nohands(state.youmonst.data)) {
        await ttyPline('You have no hands!', state); /* not `body_part(HAND)' */
        return ECMD_OK;
    } else if (heroDeaf(state)) {
        await ttyPline("You can't hear anything!", state);
        return ECMD_OK;
    } else if (!freehand(state)) {
        await ttyPline(
            `You have no free ${body_part(HAND, state.youmonst)}.`,
            state,
        );
        return ECMD_OK;
    }
    if (!await getdir(null, state))
        return ECMD_CANCEL;

    const res = (state.hero_seq === state.context.stethoscope_seq)
        ? ECMD_TIME : ECMD_OK;
    state.context.stethoscope_seq = state.hero_seq;

    // apply.c:340-341. C calls these tentative because the monster arm below
    // overwrites both; mstatusline() reads gb.bhitpos for its long-worm and
    // region terms, and gn.notonhead for nothing this port reaches yet.
    // js/dog.js setMonsterObservationPosition() makes the same coupled write
    // from mon.c see_monster_closeup(); this pair is not that one, because
    // gn.notonhead here is u.uswallow rather than a comparison with the
    // monster's own square.
    state.gb ??= {};
    state.gb.bhitpos ??= {};
    state.gb.bhitpos.x = u.ux;
    state.gb.bhitpos.y = u.uy;
    state.gn ??= {};
    state.gn.notonhead = Boolean(u.uswallow);

    if (u.usteed && u.dz > 0) {
        if (interference) {
            await ttyPline(`${Monnam(u.ustuck, state)} interferes.`, state);
            await mstatusline(u.ustuck, state);
        } else {
            await mstatusline(u.usteed, state);
        }
        return res;
    } else if (u.uswallow && (u.dx || u.dy || u.dz)) {
        await mstatusline(u.ustuck, state);
        return res;
    } else if (u.uswallow && interference) {
        await ttyPline(`${Monnam(u.ustuck, state)} interferes.`, state);
        await mstatusline(u.ustuck, state);
        return res;
    } else if (u.dz) {
        if (u.uinwater) {
            const heard = youHear('faint splashing.', state);
            if (heard) await ttyPline(heard, state);
        } else if (u.dz < 0) {
            await cant_reach_floor(
                u.ux, u.uy, true, true, false, state, { pline: ttyPline },
            );
        } else if (!can_reach_floor(true, state)) {
            await cant_reach_floor(
                u.ux, u.uy, false, true, false, state, { pline: ttyPline },
            );
        } else {
            const response = { value: res };
            if (!await its_dead(u.ux, u.uy, state, response)) {
                const level = state.stronghold_level;
                const inStronghold = Boolean(level
                    && u.uz.dnum === level.dnum
                    && u.uz.dlevel === level.dlevel);
                if (inStronghold) {
                    const heard = youHear('the crackling of hellfire.', state);
                    if (heard) await ttyPline(heard, state);
                } else {
                    await ttyPline(
                        `${The(surface(u.ux, u.uy, state), state)} `
                            + 'seems healthy enough.',
                        state,
                    );
                }
            }
            return response.value;
        }
        return res;
    } else if (obj.cursed && !rn2(2)) {
        const heard = youHear('your heart beat.', state);
        if (heard) await ttyPline(heard, state);
        return res;
    }

    confdir(false, state);
    if (!u.dx && !u.dy) {
        await ustatusline(state);
        return res;
    }
    const rx = u.ux + u.dx;
    const ry = u.uy + u.dy;
    // apply.c:386-390 answers a square off the map with "You hear a faint
    // typing noise." and ECMD_OK, the one arm below here that discards `res`
    // rather than returning it. Soundeffect(se_typing_noise, 100) expands to
    // nothing in the tty build; You_hear() still applies the acoustics gate.
    if (!isok(rx, ry)) {
        const heard = youHear('a faint typing noise.', state);
        if (heard) await ttyPline(heard, state);
        return ECMD_OK;
    }
    const mtmp = m_at(rx, ry, state);
    if (mtmp) {
        // Named before seemimic() runs, so a mimic is still wearing its
        // disguise here; x_monnam() ignores that for M_AP_OBJECT and answers
        // the true species either way. insight.c:3392 names it a second time
        // afterwards, with a different article and no disguise left.
        const mnm = x_monnam(mtmp, ARTICLE_A, null,
                             SUPPRESS_IT | SUPPRESS_INVISIBLE, false, state);

        /* gb.bhitpos needed by mstatusline() iff mtmp is a long worm */
        state.gb.bhitpos.x = rx;
        state.gb.bhitpos.y = ry;
        state.gn.notonhead = (mtmp.mx !== rx || mtmp.my !== ry);

        if (mtmp.mundetected) {
            if (!canspotmon(mtmp, state))
                await ttyPline(`There is ${mnm} hidden there.`, state);
            mtmp.mundetected = 0;
            newsym(mtmp.mx, mtmp.my);
        } else if (mtmp.mappearance) {
            let what = 'thing';
            let use_plural = false;

            switch (M_AP_TYPE(mtmp)) {
            case M_AP_OBJECT: {
                /* FIXME?
                 *  we should probably be using object_from_map() here
                 */
                const odummy = init_dummyobj(newObject(), mtmp.mappearance,
                                             1, state);
                /* simple_typename() yields "fruit" for any named fruit;
                   we want the same thing '//' or ';' shows: "slime mold"
                   or "grape" or "slice of pizza" */
                if (odummy.otyp === SLIME_MOLD && has_mcorpsenm(mtmp)) {
                    odummy.spe = MCORPSENM(mtmp);
                    what = simpleonames(odummy, state);
                } else {
                    what = simple_typename(odummy.otyp, state);
                }
                use_plural = (is_boots(odummy, state)
                    || is_gloves(odummy, state)
                    || odummy.otyp === LENSES);
                break;
            }
            case M_AP_MONSTER: /* ignore Hallucination here */
                what = pmname(state.mons[mtmp.mappearance], gender(mtmp));
                break;
            case M_AP_FURNITURE:
                what = CMAP_EXPLANATIONS[mtmp.mappearance];
                break;
            }
            seemimic(mtmp, state);
            await ttyPline(
                `${use_plural ? 'Those' : 'That'} ${what} `
                + `${use_plural ? 'are' : 'is'} really ${mnm}.`,
                state,
            );
        } else if (state.flags.verbose && !canspotmon(mtmp, state)) {
            await ttyPline(`There is ${mnm} there.`, state);
        }

        await mstatusline(mtmp, state);
        if (!canspotmon(mtmp, state))
            map_invisible(rx, ry, state);
        return res;
    }
    if (unmap_invisible(rx, ry, state))
        await ttyPline('The invisible monster must have moved.', state);

    const lev = state.level.at(rx, ry);
    // apply.c:452-464. Soundeffect() is a no-op in the tty build; You_hear()
    // still owns the acoustics gate and its alternate underwater prefix.
    if (lev.typ === SDOOR) {
        const heard = youHear(
            'a hollow sound.  This must be a secret door!', state,
        );
        if (heard) await ttyPline(heard, state);
        cvt_sdoor_to_door(lev, state); /* ->typ = DOOR */
        recalc_block_point(rx, ry, state);
        feel_newsym(rx, ry, state);
        return res;
    }
    if (lev.typ === SCORR) {
        const heard = youHear(
            'a hollow sound.  This must be a secret passage!', state,
        );
        if (heard) await ttyPline(heard, state);
        lev.typ = CORR;
        lev.flags = 0;
        lev.doormask = 0;
        unblock_point(rx, ry, state);
        feel_newsym(rx, ry, state);
        return res;
    }

    const response = { value: res };
    if (!await its_dead(rx, ry, state, response))
        await ttyPline('You hear nothing special.', state); /* not You_hear() */
    return response.value;
}

// C ref: apply.c dojump(), check_jump(), is_valid_jump_pos(),
// get_valid_jump_position(), display_jump_positions(), and jump() (1847-2166).
// The callback walk is the same Bresenham algorithm as dothrow.c walk_path().
// Its movement callback is kept local until dothrow.c's hurtle family lands.

const JUMP_ANY = 0;
const JUMP_HORZ = 1;
const JUMP_VERT = 2;
const JUMP_DIAG = 3;

function jumpProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function jumpPropertyActive(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// C ref: dothrow.c walk_path() (656-753).
function jumpWalkPath(source, destination, callback, argument, state) {
    let dx = destination.x - source.x;
    let dy = destination.y - source.y;
    let x = source.x;
    let y = source.y;
    let previousX = x;
    let previousY = y;
    const xChange = dx < 0 ? -1 : 1;
    const yChange = dy < 0 ? -1 : 1;
    if (dx < 0) dx = -dx;
    if (dy < 0) dy = -dy;
    let error = 0;
    let keepGoing = true;
    if (dx < dy) {
        for (let i = 0; i < dy; ++i) {
            previousX = x;
            previousY = y;
            y += yChange;
            error += dx << 1;
            if (error > dy) {
                x += xChange;
                error -= dy << 1;
            }
            keepGoing = callback(argument, x, y, state);
            if (!keepGoing) break;
        }
    } else {
        for (let i = 0; i < dx; ++i) {
            previousX = x;
            previousY = y;
            x += xChange;
            error += dy << 1;
            if (error > dx) {
                y += yChange;
                error -= dx << 1;
            }
            keepGoing = callback(argument, x, y, state);
            if (!keepGoing) break;
        }
    }
    if (!keepGoing) {
        destination.x = previousX;
        destination.y = previousY;
    }
    return keepGoing;
}

// C ref: apply.c check_jump() (1860-1883).
export function check_jump(trajectory, x, y, state = game) {
    if (jumpProperty(state, PASSES_WALLS)) return true;
    const location = state.level.at(x, y);
    if (IS_STWALL(location.typ)) return false;
    if (IS_DOOR(location.typ)) {
        if (closed_door(x, y, state)) return false;
        const mask = location.doormask ?? 0;
        if ((mask & D_ISOPEN) !== 0 && trajectory !== JUMP_ANY
            && (trajectory === JUMP_DIAG
                || (((trajectory & JUMP_HORZ) !== 0)
                    === Boolean(location.horizontal))))
            return false;
    }
    if (sobj_at(BOULDER, x, y, state)
        && !throws_rocks(state.youmonst?.data)) return false;
    return true;
}

// C ref: apply.c is_valid_jump_pos() (1885-1954).
export async function is_valid_jump_pos(x, y, magic, showmsg, state = game) {
    const distance = dist2(x, y, state.u.ux, state.u.uy);
    const jumping = state.u?.uprops?.[JUMPING] ?? {};
    if (!magic && !(jumping.intrinsic & ~INTRINSIC) && !jumping.extrinsic
        && distance !== 5) {
        if (showmsg) await ttyPline('Illegal move!', state);
        return false;
    }
    if (distance > (magic ? 6 + magic * 3 : 9)) {
        if (showmsg) await ttyPline('Too far!', state);
        return false;
    }
    if (!isok(x, y)) {
        if (showmsg) await ttyPline('You cannot jump there!', state);
        return false;
    }
    if (!cansee(x, y, state)) {
        if (showmsg) await ttyPline('You cannot see where to land!', state);
        return false;
    }

    const dx = x - state.u.ux;
    const dy = y - state.u.uy;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const diagonal = (magic || jumpProperty(state, PASSES_WALLS) || (!dx && !dy))
        ? JUMP_ANY : !dy ? JUMP_HORZ : !dx ? JUMP_VERT : JUMP_DIAG;
    let flatX = ax;
    let flatY = ay;
    if (flatX >= 2 * flatY) flatY = 0;
    else if (flatY >= 2 * flatX) flatX = 0;
    const trajectory = (magic || jumpProperty(state, PASSES_WALLS)
        || (!flatX && !flatY))
        ? JUMP_ANY : !flatY ? JUMP_HORZ : !flatX ? JUMP_VERT : JUMP_DIAG;

    const source = state.level.at(state.u.ux, state.u.uy);
    if (diagonal === JUMP_DIAG && IS_DOOR(source.typ)
        && (source.doormask & D_ISOPEN) !== 0
        && (trajectory === JUMP_DIAG
            || (((trajectory & JUMP_HORZ) !== 0)
                === Boolean(source.horizontal)))) {
        if (showmsg)
            await ttyPline("You can't jump diagonally out of a doorway.", state);
        return false;
    }
    const from = { x: state.u.ux, y: state.u.uy };
    const to = { x, y };
    if (!jumpWalkPath(from, to, check_jump, trajectory, state)) {
        if (showmsg)
            await ttyPline('There is an obstacle preventing that jump.', state);
        return false;
    }
    return true;
}

export async function get_valid_jump_position(x, y, state = game) {
    return isok(x, y)
        && (ACCESSIBLE(state.level.at(x, y).typ)
            || jumpProperty(state, PASSES_WALLS))
        && await is_valid_jump_pos(
            x, y, state.gj?.jumping_is_magic ?? 0, false, state,
        );
}

// C ref: apply.c display_jump_positions() (1956-1986).
async function display_jump_positions(onOff, state = game) {
    if (onOff) {
        await tmp_at(
            DISP_BEAM,
            map_glyphinfo(cmap_to_glyph(S_goodpos, state), state),
            state,
        );
        for (let dx = -4; dx <= 4; ++dx) {
            for (let dy = -4; dy <= 4; ++dy) {
                const x = state.u.ux + dx;
                const y = state.u.uy + dy;
                if (await get_valid_jump_position(x, y, state)
                    && !u_at(x, y, state))
                    await tmp_at(x, y, state);
            }
        }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

function halfPhysicalDamage(damage, state) {
    const prop = state.u?.uprops?.[HALF_PHDAM];
    return (prop?.intrinsic || prop?.extrinsic)
        ? Math.trunc((damage + 1) / 2) : damage;
}

async function jumpLandingPath(target, state) {
    const source = { x: state.u.ux, y: state.u.uy };
    const destination = { x: target.x, y: target.y };
    const range = {
        range: Math.max(
            Math.abs(destination.x - source.x),
            Math.abs(destination.y - source.y),
        ),
    };
    await walk_path(
        source,
        destination,
        hurtle_jump,
        { state, range },
    );
    target.x = destination.x;
    target.y = destination.y;
    return teleds(target.x, target.y, TELEDS_NO_FLAGS, state);
}

// C ref: apply.c dojump() (1847-1851).
export async function dojump(state = game, env = {}) {
    return jump(0, state, env);
}

// C ref: apply.c jump() (1988-2163).
export async function jump(magic = 0, state = game, env = {}) {
    // apply.c's morehungry calls reach newuhs's pline/end_running/bot.
    // Preserve supplied operations when this caller uses a cloned state.
    const hungerEnv = {
        ...env,
        message: env.message ?? ttyPline,
        endRunning: env.endRunning ?? endRunning,
        statusRefresh: env.statusRefresh ?? (() => bot()),
    };
    if (!magic && !jumpProperty(state, JUMPING)
        && known_spell(SPE_JUMPING, state) >= spe_Fresh)
        return spelleffects(SPE_JUMPING, false, false, state, hungerEnv);

    const species = state.youmonst?.data;
    if (!magic && (nolimbs(species) || slithy(species))) {
        await ttyPline("You can't jump; you have no legs!", state);
        return ECMD_OK;
    }
    if (!magic && !jumpProperty(state, JUMPING)) {
        await ttyPline("You can't jump very far.", state);
        return ECMD_OK;
    }
    if (!magic && state.u.usteed
        && await stucksteed(false, state)) return ECMD_OK;
    if (state.u.uswallow) {
        if (magic) {
            await ttyPline('You bounce around a little.', state);
            return ECMD_TIME;
        }
        await ttyPline("You've got to be kidding!", state);
        return ECMD_OK;
    }
    if (state.u.uinwater) {
        if (magic) {
            await ttyPline('You swish around a little.', state);
            return ECMD_TIME;
        }
        await ttyPline('This calls for swimming, not jumping!', state);
        return ECMD_OK;
    }
    if (state.u.ustuck) {
        const captor = state.u.ustuck;
        if (captor.mtame && !jumpProperty(state, CONFLICT) && !captor.mconf) {
            set_ustuck(null, state);
            await ttyPline(`You pull free from ${mon_nam(captor, state)}.`, state);
            return ECMD_TIME;
        }
        if (magic) {
            await ttyPline('You writhe a little in the grasp of your captor!', state);
            return ECMD_TIME;
        }
        await ttyPline('You cannot escape from your captor!', state);
        return ECMD_OK;
    }
    if (jumpPropertyActive(state, LEVITATION)
        || Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)) {
        if (magic) {
            await ttyPline('You flail around a little.', state);
            return ECMD_TIME;
        }
        await ttyPline("You don't have enough traction to jump.", state);
        return ECMD_OK;
    }
    if (!magic && near_capacity(state) > UNENCUMBERED) {
        await ttyPline('You are carrying too much to jump!', state);
        return ECMD_OK;
    }
    if (!magic && (state.u.uhunger <= 100 || acurr(state, A_STR) < 6)) {
        await ttyPline('You lack the strength to jump!', state);
        return ECMD_OK;
    }
    if (!magic && jumpProperty(state, WOUNDED_LEGS)) {
        await legs_in_no_shape('jumping', Boolean(state.u.usteed), state);
        return ECMD_OK;
    }
    if (state.u.usteed && state.u.utrap) {
        await ttyPline(`${Monnam(state.u.usteed, state)} is stuck in a trap.`, state);
        return ECMD_OK;
    }

    await ttyPline('Where do you want to jump?', state);
    const target = { x: state.u.ux, y: state.u.uy };
    state.gj ??= {};
    state.gj.jumping_is_magic = magic;
    await getpos_sethilite(display_jump_positions, get_valid_jump_position, state);
    if (await getpos(target, true, 'the desired position', state) < 0)
        return ECMD_CANCEL;
    if (!await is_valid_jump_pos(target.x, target.y, magic, true, state))
        return ECMD_FAIL;
    if (state.u.usteed && u_at(target.x, target.y, state)) {
        await ttyPline("Your steed isn't capable of jumping in place.", state);
        return ECMD_FAIL;
    }

    let wasTrapped = false;
    if (state.u.utrap) {
        wasTrapped = true;
        switch (state.u.utraptype) {
        case TT_BEARTRAP: {
            const side = rn2(3) ? LEFT_SIDE : RIGHT_SIDE;
            await ttyPline('You rip yourself free of the bear trap!  Ouch!', state);
            await losehp(halfPhysicalDamage(rnd(10), state),
                'jumping out of a bear trap', KILLED_BY, state);
            await set_wounded_legs(side, rn1(1000, 500), state);
            break;
        }
        case TT_PIT:
            await ttyPline('You leap from the pit!', state);
            break;
        case TT_WEB:
            await ttyPline('You tear the web apart as you pull yourself free!', state);
            deltrap(t_at(state.u.ux, state.u.uy, state), state);
            break;
        case TT_LAVA:
            await ttyPline('You pull yourself above the lava!', state);
            target.x = state.u.ux;
            target.y = state.u.uy;
            break;
        case TT_BURIEDBALL:
        case TT_INFLOOR:
            const legs = makeplural(body_part(LEG, state.youmonst));
            const place = state.u.utraptype === TT_INFLOOR
                ? 'stuck in the floor' : 'attached to the buried ball';
            await ttyPline(`You strain your ${legs}, but you're still ${place}.`, state);
            await set_wounded_legs(LEFT_SIDE, rn1(10, 11), state);
            await set_wounded_legs(RIGHT_SIDE, rn1(10, 11), state);
            return ECMD_TIME;
        default:
            throw new Error(`Jumping out of strange trap (${state.u.utraptype})?`);
        }
        await reset_utrap(true, state);
    }

    if (u_at(target.x, target.y, state)) {
        const trap = t_at(target.x, target.y, state);
        if (wasTrapped) {
            await morehungry((env.random?.rnd ?? rnd)(10), state, hungerEnv);
            return ECMD_TIME;
        }
        if (trap) {
            await ttyPline(
                `You jump up and ${jumpPropertyActive(state, FLYING) ? 'fly' : 'come'} back down.`,
                state,
            );
            await dotrap(trap, FORCETRAP | TOOKPLUNGE, state);
            return ECMD_TIME;
        }
        await ttyPline(
            `${heroHallucinating(state) ? 'You hop up and down a bit.' : 'You decide not to jump after all.'}`,
            state,
        );
        return ECMD_OK;
    }

    await jumpLandingPath(target, state);
    nomul(-1, state);
    state.multi_reason = 'jumping around';
    state.nomovemsg = '';
    await morehungry((env.random?.rnd ?? rnd)(25), state, hungerEnv);
    return ECMD_TIME;
}

// C ref: apply.c use_lamp() (1628-1702). The branch order is observable:
// an already-lit object is snuffed before the underwater and empty-fuel
// checks, and cursed lamps consume the second draw only for oil or magic
// lamps after the first curse check fails.
export async function use_lamp(obj, state = game, env = {}) {
    const candle = obj.otyp === TALLOW_CANDLE || obj.otyp === WAX_CANDLE;
    const lamp = obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP
        ? 'lamp' : obj.otyp === BRASS_LANTERN ? 'lantern' : null;

    if (obj.lamplit) {
        if (lamp) {
            const owner = shk_your(obj, state);
            await ttyPline(
                `${highc(owner[0])}${owner.slice(1)}${lamp} is now off.`,
                state,
            );
        } else {
            await ttyPline(`You snuff out ${yname(obj, state)}.`, state);
        }
        end_burn(obj, true, { ...env, state });
        return;
    }
    if (state.u?.uinwater) {
        await ttyPline(candle
            ? 'Sorry, fire and water don\'t mix.'
            : 'This is not a diving lamp.', state);
        return;
    }
    if ((!candle && obj.age === 0)
        || (obj.otyp === MAGIC_LAMP && obj.spe === 0)) {
        if (obj.otyp === BRASS_LANTERN) {
            await ttyPline(heroIsBlind(state)
                ? 'Nothing seems to happen.'
                : 'Your lantern is out of power.', state);
        } else {
            await ttyPline(`This ${xnameFresh(obj, state)} has no oil.`, state);
        }
        return;
    }

    if (obj.cursed && rn2(2) === 0) {
        if ((obj.otyp === OIL_LAMP || obj.otyp === MAGIC_LAMP)
            && rn2(3) === 0) {
            await ttyPline(
                `The lamp spills and covers your ${fingers_or_gloves(true, state)} with oil.`,
                state,
            );
            const glib = state.u?.uprops?.[GLIB]?.intrinsic ?? 0;
            make_glib((glib & TIMEOUT) + d(2, 10), state, env);
        } else if (!heroIsBlind(state)) {
            await ttyPline(
                `${Tobjnam(obj, 'flicker', state)} for a moment, then ${otense(obj, 'die', state)}.`,
                state,
            );
        } else {
            await ttyPline('Nothing seems to happen.', state);
        }
    } else if (lamp) {
        try {
            check_unpaid(obj, state);
        } catch (error) {
            // check_unpaid() is void in C. Its unresolved billing branch is
            // skipped as a recorded gap while the source continues to light.
            if (!(error instanceof UnsupportedShopError)) throw error;
            note_unported('shk.c check_unpaid_usage');
        }
        const owner = shk_your(obj, state);
        await ttyPline(
            `${highc(owner[0])}${owner.slice(1)}${lamp} is now on.`, state,
        );
        begin_burn(obj, false, { ...env, state });
    } else {
        const name = Yname2(obj, state);
        const plural = obj.quan !== 1;
        await ttyPline(
            `${s_suffix(name)} flame${plural ? 's' : ''} ${otense(obj, 'burn', state)}`
                + `${heroIsBlind(state) ? '.' : ' brightly!'}`,
            state,
        );
        const cost = objectType(obj, state).oc_cost;
        if (obj.unpaid && costly_spot(state.u.ux, state.u.uy, state)
            && obj.age === 20 * cost) {
            const pronoun = obj.quan > 1 ? 'them' : 'it';
            const rooms = in_rooms(state.u.ux, state.u.uy, SHOPBASE, state);
            set_voice(shop_keeper(rooms[0] ?? 0, state), 0, 80, 0, state);
            await verbalize(`You burn ${pronoun}, you bought ${pronoun}!`, state);
            await bill_dummy_object(obj, { ...env, state });
        }
        begin_burn(obj, false, { ...env, state });
    }
}

// C ref: apply.c light_cocktail() (1703-1758). The object pointer is part of
// the result: snuffing can replace it with an inventory merge, and lighting
// one potion from a stack can replace it with hold_another_object()'s return.
export async function light_cocktail(objp, state = game, env = {}) {
    let obj = objp.obj;
    const message = env.message ?? ttyPline;

    if (state.u?.uswallow) {
        await message(
            "You don't have enough elbow-room to maneuver.",
            state,
        );
        return;
    }

    if (obj.lamplit) {
        await message('You snuff the lit potion.', state);
        end_burn(obj, true, { ...env, state });
        // C only frees and re-adds an unworn potion: merging can replace the
        // caller's pointer, so await the live addinv return before storing it.
        if (!obj.owornmask) {
            await freeinv(obj, { ...env, state });
            objp.obj = await addinv_runtime(obj, { ...env, state });
        }
        return;
    }

    if (state.u?.uinwater) {
        await message('There is not enough oxygen to sustain a fire.', state);
        return;
    }

    const split1off = obj.quan > 1;
    if (split1off) obj = splitobj(obj, 1, { ...env, state });

    const ownership = shk_your(obj, state);
    await message(
        `You light ${ownership}potion.${heroIsBlind(state)
            ? '' : '  It gives off a dim light.'}`,
        state,
    );

    if (obj.unpaid && costly_spot(state.u.ux, state.u.uy, state)) {
        const room = in_rooms(
            state.u.ux,
            state.u.uy,
            SHOPBASE,
            state,
        )[0] ?? 0;
        const shopkeeper = shop_keeper(room, state);
        // C check_unpaid() discards check_unpaid_usage()'s void result. Its
        // fee tail is unported, so record the gap without invoking its partial
        // refusal; the following voice and billing calls still run in order.
        note_unported('shk.c check_unpaid_usage');
        set_voice(shopkeeper, 0, 80, 0, state);
        await verbalize(
            "That's in addition to the cost of the potion, of course.",
            state,
            { message },
        );
        await bill_dummy_object(obj, { ...env, state });
    }

    // C's makeknown macro calls discover_object(..., TRUE, TRUE, TRUE),
    // including its Wisdom exercise before the burn timer is started.
    discover_object(obj.otyp, true, true, true, state, env);
    begin_burn(obj, false, { ...env, state });

    if (split1off) {
        obj_extract_self(obj, { ...env, state });
        obj.nomerge = 1;
        const dropName = donameFresh(obj, state);
        obj = await hold_another_object(
            obj,
            'You drop %s!',
            dropName,
            null,
            {
                ...env,
                state,
                hooks: {
                    ...(env.hooks ?? {}),
                    message: env.hooks?.message ?? message,
                },
            },
        );
        if (obj) obj.nomerge = 0;
    }
    objp.obj = obj;
}

// C ref: apply.c use_candelabrum() (1319-1386). Keep the snuff, empty, water,
// cursed/swallowed, candle-count, and invocation branches in source order;
// end_burn() and begin_burn() own their timer and light side effects.
export async function use_candelabrum(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const s = obj.spe !== 1 ? 'candles' : 'candle';

    if (obj.lamplit) {
        await message(`You snuff the ${s}.`, state);
        end_burn(obj, true, { ...env, state });
        return;
    }
    if (obj.spe <= 0) {
        const name = xnameFresh(obj, state);
        await message(`This ${name} has no ${s}.`, state);
        for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (isCandle(otmp)) {
                await message(
                    `To attach candles, apply them instead of the ${name}.`,
                    state,
                );
                break;
            }
        }
        return;
    }
    if (state.u?.uinwater) {
        await message('You cannot make fire under water.', state);
        return;
    }
    if (state.u?.uswallow || obj.cursed) {
        if (!heroIsBlind(state)) {
            await message(
                `${The(s, state)} ${vtense(s, 'flicker')} for a moment,`
                    + ` then ${vtense(s, 'die')}.`,
                state,
            );
        }
        return;
    }
    if (obj.spe < 7) {
        await message(
            `There ${vtense(s, 'are')} only ${obj.spe} ${s} in `
                + `${the(xnameFresh(obj, state), state)}.`,
            state,
        );
        if (!heroIsBlind(state)) {
            await message(
                `${obj.spe === 1 ? 'It is' : 'They are'} lit.  `
                    + `${Tobjnam(obj, 'shine', state)} dimly.`,
                state,
            );
        }
    } else {
        await message(
            `${The(xnameFresh(obj, state), state)}'s ${s} burn`
                + `${heroIsBlind(state) ? '.' : ' brightly!'}`,
            state,
        );
    }

    if (!invocation_pos(state.u.ux, state.u.uy, state)
        || On_stairs(state.u.ux, state.u.uy, state)) {
        await message(
            `The ${s} ${vtense(s, 'are')} being rapidly consumed!`, state,
        );
        obj.age = Math.trunc(((obj.age ?? 0) + 1) / 2);
        if (obj.age === 0) {
            if (state === game) note_unported('pline.c impossible');
            obj.age = 1;
        }
    } else {
        if (obj.spe === 7) {
            if (heroIsBlind(state)) {
                await message(
                    `${Tobjnam(obj, 'radiate', state)} a strange warmth!`,
                    state,
                );
            } else {
                await message(
                    `${Tobjnam(obj, 'glow', state)} with a strange light!`,
                    state,
                );
            }
        }
        obj.known = true;
    }
    begin_burn(obj, false, { ...env, state });
}

// C ref: apply.c use_candle() (1387-1468). Attaching a candle stack to the
// carried candelabrum consumes the accepted split, while a negative answer,
// a missing/full candelabrum, or a swallowed hero delegates to use_lamp().
export async function use_candle(obj, state = game, env = {}) {
    if (state.u?.uswallow) {
        await ttyPline(
            "You don't have enough elbow-room to maneuver.", state,
        );
        return;
    }

    const candelabrum = carrying(CANDELABRUM_OF_INVOCATION, state);
    if (!candelabrum || candelabrum.spe === 7) {
        await use_lamp(obj, state, env);
        return;
    }

    let candleNoun = obj.quan !== 1 ? 'candles' : 'candle';
    const suffix = ` to\x1b${thesimpleoname(candelabrum, state)}?`;
    let query = safe_qbuf(
        'Attach ', suffix, obj, yname, thesimpleoname, candleNoun, state,
    );
    const marker = strstri(query, ' to\x1b');
    if (marker >= 0)
        query = `${query.slice(0, marker)} to `;
    const attachQuery = safe_qbuf(
        query, '?', candelabrum, yname, thesimpleoname, 'it', state,
    );
    if (await y_n(attachQuery, state) === 'n'.charCodeAt(0)) {
        await use_lamp(obj, state, env);
        return;
    }

    if (candelabrum.spe + obj.quan > 7) {
        obj = splitobj(obj, 7 - candelabrum.spe, { ...env, state });
        candleNoun = obj.quan !== 1 ? 'candles' : 'candle';
    }

    const wasLit = Boolean(obj.lamplit);
    if (wasLit)
        end_burn(obj, true, { ...env, state });

    await ttyPline(
        `You attach ${obj.quan}${candelabrum.spe ? ' more' : ''} ${candleNoun} to ${the(xnameFresh(candelabrum, state), state)}.`,
        state,
    );
    if (!candelabrum.spe || candelabrum.age > obj.age)
        candelabrum.age = obj.age;
    candelabrum.spe += obj.quan;
    if (candelabrum.lamplit && !wasLit) {
        const pluralSuffix = candleNoun;
        await ttyPline(
            `The new ${pluralSuffix} magically ${pluralSuffix === 'candle' ? 'ignites' : 'ignite'}!`,
            state,
        );
    } else if (!candelabrum.lamplit && wasLit) {
        await ttyPline(obj.quan > 1 ? 'They go out.' : 'It goes out.', state);
    }
    if (obj.unpaid) {
        const rooms = in_rooms(state.u.ux, state.u.uy, SHOPBASE, state);
        set_voice(shop_keeper(rooms[0] ?? 0, state), 0, 80, 0, state);
        const pronoun = obj.quan > 1 ? 'them' : 'it';
        await verbalize(
            `You ${candelabrum.lamplit ? 'burn' : 'use'} ${pronoun}, you bought ${pronoun}!`,
            state,
        );
    }
    if (obj.quan < 7 && candelabrum.spe === 7) {
        const lit = candelabrum.lamplit ? ' lit' : '';
        await ttyPline(
            `${The(xnameFresh(candelabrum, state), state)} now has seven${lit} candles attached.`,
            state,
        );
    }
    if (candelabrum.lamplit)
        obj_merge_light_sources(candelabrum, candelabrum, { ...env, state });
    await useupall(obj, { ...env, state });
    candelabrum.owt = weight(candelabrum, { ...env, state });
    update_inventory({ ...env, state });
}

// C ref: apply.c use_unicorn_horn() (2258-2392). attacktype_fordmg() returns
// the consumed attack pointer; existing potion helpers own their state
// transitions. Other missing effect helpers are void or explicitly discarded,
// so their C call sites remain named gaps. Trouble state is stored in the
// intrinsic timeout and property flags in u.uprops.
export async function use_unicorn_horn(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const recordGap = (source) => {
        if (state === game) note_unported(source);
    };
    const intrinsic = (property) => state.u?.uprops?.[property]?.intrinsic ?? 0;
    const timedTrouble = (property) => {
        const value = intrinsic(property);
        return value && !(value & ~TIMEOUT) ? value & TIMEOUT : 0;
    };
    const hallucinating = () => Boolean(
        intrinsic(HALLUC)
        && !(state.u?.uprops?.[HALLUC_RES]?.intrinsic
            || state.u?.uprops?.[HALLUC_RES]?.extrinsic),
    );
    const deaf = () => Boolean(
        intrinsic(DEAF) || state.u?.uprops?.[DEAF]?.extrinsic
        || state.u?.uroleplay?.deaf,
    );

    if (obj?.cursed) {
        const lcount = rn1(90, 10);
        switch (Math.trunc(rn2(13) / 2)) {
        case 0: {
            const sickTimeout = intrinsic(SICK) & TIMEOUT;
            // C evaluates the timeout (and its conditional RNG) before xname.
            const sicknessDuration = sickTimeout
                ? Math.trunc(sickTimeout / 3) + 1
                : rn1(acurr(state, A_CON), 20);
            const cause = xnameFresh(obj, state);
            await make_sick(
                sicknessDuration, cause, true, SICK_NONVOMITABLE, state, env,
            );
            break;
        }
        case 1:
            await make_blinded(
                (intrinsic(BLINDED) & TIMEOUT) + lcount,
                true,
                state,
                env,
            );
            break;
        case 2:
            if (!intrinsic(CONFUSION)) {
                await message(
                    `You suddenly feel ${hallucinating() ? 'trippy' : 'confused'}.`,
                    state,
                );
            }
            await make_confused(
                (intrinsic(CONFUSION) & TIMEOUT) + lcount,
                true,
                state,
                env,
            );
            break;
        case 3:
            await make_stunned(
                (intrinsic(STUNNED) & TIMEOUT) + lcount,
                true, state, env,
            );
            break;
        case 4:
            if (intrinsic(VOMITING))
                await vomit(state, { ...env, message });
            else
                await make_vomiting(14, false, state, env);
            break;
        case 5:
            await make_hallucinated(
                (intrinsic(HALLUC) & TIMEOUT) + lcount,
                true,
                0,
                state,
                env,
            );
            break;
        case 6:
            if (deaf()) await message(nothing_seems_to_happen, state);
            await make_deaf(
                (intrinsic(DEAF) & TIMEOUT) + lcount,
                true,
                state,
                env,
            );
            break;
        }
        return;
    }

    const troubles = [];
    if (timedTrouble(SICK)) troubles.push(SICK);
    if (timedTrouble(BLINDED) > (state.u?.ucreamed ?? 0)
        && !(state.u?.uswallow
            && attacktype_fordmg(
                state.u?.ustuck?.data,
                AT_ENGL,
                AD_BLND,
            ))) {
        troubles.push(BLINDED);
    }
    if (timedTrouble(HALLUC)) troubles.push(HALLUC);
    if (timedTrouble(VOMITING)) troubles.push(VOMITING);
    if (timedTrouble(CONFUSION)) troubles.push(CONFUSION);
    if (timedTrouble(STUNNED)) troubles.push(STUNNED);
    if (timedTrouble(DEAF)) troubles.push(DEAF);

    if (!troubles.length) {
        await message(nothing_happens, state);
        return;
    }
    if (troubles.length > 1)
        recordGap('rnd.c shuffle_int_array');

    let valLimit = rn2(d(2, obj?.blessed ? 4 : 2));
    if (valLimit > troubles.length) valLimit = troubles.length;

    let didProp = 0;
    for (let value = 0; value < valLimit; value++) {
        switch (troubles[value]) {
        case SICK:
            await make_sick(0, null, true, SICK_ALL, state, env);
            didProp++;
            break;
        case BLINDED:
            await make_blinded(state.u?.ucreamed ?? 0, true, state, env);
            didProp++;
            break;
        case HALLUC:
            await make_hallucinated(0, true, 0, state, env);
            didProp++;
            break;
        case VOMITING:
            await make_vomiting(0, true, state, env);
            didProp++;
            break;
        case CONFUSION:
            await make_confused(0, true, state, env);
            didProp++;
            break;
        case STUNNED:
            await make_stunned(0, true, state, env);
            didProp++;
            break;
        case DEAF:
            await make_deaf(0, true, state, env);
            didProp++;
            break;
        default:
            break;
        }
    }

    if (didProp)
        state.disp.botl = true;
    else
        await message(nothing_seems_to_happen, state);
}

// C ref: apply.c doapply() (4213-4430), the `a` command.
//
// apply.c:doapply() calls artifact.c:retouch_object(&obj, FALSE) for every
// selected object before class dispatch. The helper can blast the hero and
// its Boolean answer controls whether this command continues; keep its
// possibly updated object pointer for the source's subsequent dispatch.
// apply.c:doapply() switch cases whose handlers are not ported in this
// JavaScript slice. Keep them out of the generic default, which C reaches
// only after every named case has failed to match.
function figurineObjectEnv(state, env = {}) {
    const hooks = { ...(env.hooks ?? {}) };
    hooks.extractExternalObject ??= (obj, hookEnv) => remove_object(obj, {
        ...hookEnv,
        state: hookEnv.state ?? state,
    });
    hooks.stopFigurineTimer ??= (obj, hookEnv) => stop_timer(
        FIG_TRANSFORM, obj, hookEnv.state ?? state, hookEnv,
    );
    hooks.stopObjectTimers ??= (obj, hookEnv) => obj_stop_timers(
        obj, hookEnv.state ?? state, hookEnv,
    );
    if (hooks.updateInventory === undefined
        && typeof state.hooks?.updateInventory === 'function') {
        hooks.updateInventory = state.hooks.updateInventory;
    }
    return { ...env, state, hooks };
}

// C ref: apply.c fig_transform() (2398-2508). This is timeout.c's object
// timer owner; it retains the object location before placement and deletion,
// and only redraws a visible floor location after freeing the figurine.
export async function fig_transform(figurine, timeout, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const env = figurineObjectEnv(state, rawEnv);
    const random = { d, rn1, rn2, rnd, rne, rnz, ...(env.random ?? {}) };
    const message = env.message ?? ttyPline;
    if (!figurine) {
        note_unported('pline.c impossible');
        return;
    }

    const silent = Math.trunc(timeout) !== Math.trunc(state.moves ?? 0);
    let location = get_obj_location(figurine, 0, state);
    let okaySpot = Boolean(location);
    if (figurine.where === OBJ_INVENT || figurine.where === OBJ_MINVENT) {
        if (location) {
            const nearby = enexto(
                location.x,
                location.y,
                state.mons?.[figurine.corpsenm],
                env,
            );
            okaySpot = Boolean(nearby);
            if (nearby) location = nearby;
        } else {
            okaySpot = false;
        }
    }
    if (!okaySpot
        || !await figurine_location_checks(
            figurine, location, true, state, env,
        )) {
        // C discards start_timer()'s Boolean result; keep the retry draw and
        // due time at this exact source point.
        start_timer(
            random.rnd(5000), TIMER_OBJECT, FIG_TRANSFORM, figurine, state,
        );
        return;
    }

    const { x, y } = location;
    const canSeeSpot = cansee(x, y, state);
    const monster = await make_familiar(figurine, x, y, true, env);
    let redraw = false;
    if (monster) {
        const shelter = state.level?.objects?.[monster.mx]?.[monster.my] ?? null;
        const monsterName = an(m_monnam(monster, state, env));
        let andVanish = '';
        let suppressSee = (monster.minvis
            && !applyPropertyActive(SEE_INVIS, state))
            || (monster.data?.mlet === S_MIMIC
                && M_AP_TYPE(monster) !== M_AP_NOTHING);

        if (monster.mundetected) {
            if (hides_under(monster.data) && shelter) {
                andVanish = ` and ${locomotion(monster.data, 'crawl')} under `
                    + donameFresh(shelter, state);
            } else if (monster.data?.mlet === S_MIMIC
                || monster.data?.mlet === S_EEL) {
                suppressSee = true;
            } else {
                andVanish = ' and vanish';
            }
        }

        switch (figurine.where) {
        case OBJ_INVENT:
            if (heroIsBlind(state) || suppressSee) {
                await message(
                    `You feel something ${locomotion(monster.data, 'drop')} `
                        + 'from your pack!',
                    state,
                );
            } else {
                await message(
                    `You see ${monsterName} `
                        + `${locomotion(monster.data, 'drop')} out of your `
                        + `pack${andVanish}!`,
                    state,
                );
            }
            break;
        case OBJ_FLOOR:
            if (canSeeSpot && !silent) {
                const text = suppressSee
                    ? `${an(xnameFresh(figurine, state))} suddenly vanishes!`
                    : `You see a figurine transform into ${monsterName}`
                        + `${andVanish}!`;
                await message(messageAt(text, x, y, state), state);
                redraw = true;
            }
            break;
        case OBJ_MINVENT:
            if (canSeeSpot && !silent && !suppressSee) {
                const carrier = figurine.ocarry;
                let carriedBy;
                if (canseemon(carrier, state)
                    && (!carrier.wormno || cansee(carrier.mx, carrier.my, state))) {
                    carriedBy = `${s_suffix(a_monnam(carrier, { ...env, state }))} pack`;
                } else if (is_pool(carrier.mx, carrier.my, state)) {
                    carriedBy = 'empty water';
                } else {
                    carriedBy = 'thin air';
                }
                await message(
                    `You see ${monsterName} `
                        + `${locomotion(monster.data, 'drop')} out of `
                        + `${carriedBy}${andVanish}!`,
                    state,
                );
            }
            break;
        default:
            note_unported('pline.c impossible');
            break;
        }
    }

    // C removes a carried object through useup(); other object owners first
    // extract it, then discard it with obfree().
    if (carried(figurine)) {
        await useup(figurine, env);
    } else {
        obj_extract_self(figurine, env);
        obfree(figurine, null, env);
    }
    if (redraw) newsym(location.x, location.y, state);
}

// C ref: apply.c figurine_location_checks() (2511-2541). Read-only location
// and monster-ability predicate shared by manual use and the timer callback.
export async function figurine_location_checks(
    obj, cc, quietly = false, state = game, rawEnv = {},
) {
    const env = { ...rawEnv, state };
    const message = env.message ?? ttyPline;
    if (carried(obj) && state.u?.uswallow) {
        if (!quietly)
            await message("You don't have enough room in here.", state);
        return false;
    }
    const x = cc ? cc.x : state.u.ux;
    const y = cc ? cc.y : state.u.uy;
    if (!isok(x, y)) {
        if (!quietly)
            await message('You cannot put the figurine there.', state);
        return false;
    }
    const type = state.level.at(x, y).typ;
    const species = state.mons?.[obj.corpsenm];
    if (IS_OBSTRUCTED(type)
        && !(passes_walls(species) && may_passwall(x, y, state))) {
        if (!quietly) {
            await message(
                `You cannot place a figurine in ${IS_TREE(type)
                    ? 'a tree' : 'solid rock'}!`,
                state,
            );
        }
        return false;
    }
    if (sobj_at(BOULDER, x, y, state)
        && !passes_walls(species) && !throws_rocks(species)) {
        if (!quietly)
            await message('You cannot fit the figurine on the boulder.', state);
        return false;
    }
    return true;
}

// C ref: apply.c use_figurine() (2544-2581). Direction cancellation, target
// validation, familiar creation, timer removal, and consumption stay ordered
// as in the command's pointer-returning arm.
export async function use_figurine(objp, state = game, rawEnv = {}) {
    const obj = objp.obj;
    const env = figurineObjectEnv(state, rawEnv);
    if (state.u.uswallow
        && !await figurine_location_checks(obj, null, false, state, env)) {
        return ECMD_OK;
    }
    if (!await getdir(null, state)) {
        state.context.move = 0;
        state.multi = 0;
        return ECMD_CANCEL;
    }
    const x = state.u.ux + state.u.dx;
    const y = state.u.uy + state.u.dy;
    const cc = { x, y };
    if (!await figurine_location_checks(obj, cc, false, state, env))
        return ECMD_TIME;

    const action = (state.u.dx || state.u.dy)
        ? 'set the figurine beside you'
        : (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)
            || is_pool(x, y, state))
            ? 'release the figurine'
            : state.u.dz < 0
                ? 'toss the figurine into the air'
                : 'set the figurine on the ground';
    await (env.message ?? ttyPline)(
        `You ${action} and it ${heroIsBlind(state) ? 'supposedly ' : ''}`
            + 'transforms.',
        state,
    );
    await make_familiar(obj, x, y, false, env);
    stop_timer(FIG_TRANSFORM, obj, state, env);
    await useup(obj, env);
    if (heroIsBlind(state)) map_invisible(x, y, state);
    objp.obj = null;
    return ECMD_TIME;
}

// C ref: apply.c use_bell() (1202-1316). The object holder represents C's
// struct obj ** parameter: a shattered bell is removed from the caller's
// local pointer before doapply() reaches its shared artifact-speech tail.
export async function use_bell(objp, state = game, rawEnv = {}) {
    const obj = objp.obj;
    const message = (text) => (rawEnv.message ?? ttyPline)(text, state);
    const random = {
        d, rn1, rn2, rnd, rne, rnl, rnz,
        ...(rawEnv.random ?? {}),
    };
    let wakem = false;
    let learno = false;
    const ordinary = obj.otyp !== BELL_OF_OPENING || !obj.spe;
    const invoking = obj.otyp === BELL_OF_OPENING
        && invocation_pos(state.u.ux, state.u.uy, state)
        && !On_stairs(state.u.ux, state.u.uy, state);

    // sndprocs.h defines Hero_playnotes as an empty macro in this recorder
    // build, so neither obj_to_instr(obj) nor the note string is evaluated.
    await message(`You ring ${the(xnameFresh(obj, state), state)}.`);

    if (state.u.uinwater || (state.u.uswallow && ordinary)) {
        await message('But the sound is muffled.');
    } else if (invoking && ordinary) {
        await message("But it makes no sound.");
        learno = true;
    } else if (ordinary) {
        if (obj.cursed && random.rn2(4) === 0
            && !(state.mvitals[PM_WOOD_NYMPH]?.mvflags & G_GONE)
            && !(state.mvitals[PM_WATER_NYMPH]?.mvflags & G_GONE)
            && !(state.mvitals[PM_MOUNTAIN_NYMPH]?.mvflags & G_GONE)) {
            const nymphSpecies = mkclass(S_NYMPH, 0, { state, random });
            // makemon(NULL, ...) selects a random species; mkclass returning
            // null does not skip the C makemon call.
            const monster = await makemon_runtime(
                nymphSpecies,
                state.u.ux,
                state.u.uy,
                NO_MINVENT | MM_NOMSG,
                { ...rawEnv, state, random },
            );
            if (monster) {
                await message(`You summon ${a_monnam(monster, state)}!`);
                if (!obj_resists(obj, 93, 100, { state, random })) {
                    await message(`${Tobjnam(obj, 'have', state)} shattered!`);
                    await useup(obj, { ...rawEnv, state });
                    objp.obj = null;
                } else {
                    switch (random.rn2(3)) {
                    case 1:
                        await mon_adjust_speed(monster, 2, null, state, {
                            ...rawEnv, random,
                        });
                        break;
                    case 2:
                        state.gn.nomovemsg = '';
                        state.gm.multi_reason = null;
                        nomul(-random.rnd(2), state);
                        break;
                    }
                }
            }
        }
        wakem = true;
    } else {
        consume_obj_charge(obj, true, {
            ...rawEnv,
            state,
            // check_unpaid() is a discarded void call here. Its shop fee
            // tail is still unported, so record the gap and preserve C's
            // following charge decrement/update_inventory order.
            checkUnpaid(item, chargeState) {
                if (item.unpaid && chargeState.u?.ushops?.[0])
                    note_unported('shk.c check_unpaid');
            },
        });
        if (state.u.uswallow) {
            if (!obj.cursed) await openit(state, rawEnv);
            else await message(nothing_happens);
        } else if (obj.cursed) {
            await mkundead({ x: state.u.ux, y: state.u.uy }, false,
                NO_MINVENT, state, { ...rawEnv, random });
            wakem = true;
        } else if (invoking) {
            await message(
                `${Tobjnam(obj, 'issue', state)} an unsettling shrill sound...`,
            );
            obj.age = state.moves;
            learno = true;
            wakem = true;
        } else if (obj.blessed) {
            let result = 0;
            if (state.uchain) {
                unpunish(state, { ...rawEnv, random });
                result = 1;
            } else if (state.u.utrap
                && state.u.utraptype === TT_BURIEDBALL) {
                await buried_ball_to_freedom(state, rawEnv);
                result = 1;
            }
            result += await openit(state, rawEnv);
            if (result === 0) {
                await message(nothing_happens);
            } else if (result === 1) {
                await message('Something opens...');
                learno = true;
            } else {
                await message('Things open around you...');
                learno = true;
            }
        } else if (await findit(state, rawEnv) !== 0) {
            learno = true;
        } else {
            await message(nothing_happens);
        }
    }

    if (learno) {
        discover_object(BELL_OF_OPENING, true, true, true, state, {
            ...rawEnv, random,
        });
        obj.known = true;
    }
    if (wakem) await wake_nearby(true, { ...rawEnv, state, random });
}

// C ref: apply.c jelly_ok() (3607-3614), the pure getobj selector for the
// royal-jelly target prompt.
export function jelly_ok(obj) {
    return obj?.otyp === EGG ? GETOBJ_SUGGEST : GETOBJ_EXCLUDE;
}

// C ref: apply.c use_royal_jelly() (3616-3682). The holder preserves C's
// struct obj ** updates across both production callers. The cursed kill_egg()
// result is discarded and remains a named gap until timeout.c:kill_egg() lands.
async function use_royal_jelly(objp, state = game, rawEnv = {}) {
    let obj = objp.obj;
    const env = { ...rawEnv, state };
    const message = env.message ?? ttyPline;
    const splitit = obj.quan > 1;

    if (splitit) obj = splitobj(obj, 1, env);
    await freeinv(obj, env);

    const eobj = await getobj(
        'rub the royal jelly on', jelly_ok, GETOBJ_PROMPT, state,
    );
    if (!eobj) {
        if (splitit) {
            unsplitobj(obj, env);
            update_inventory(env);
        } else {
            addinv_nomerge(obj, env);
        }
        return ECMD_CANCEL;
    }

    await message(`You smear royal jelly all over ${yname(eobj, state)}.`, state);
    if (eobj.otyp !== EGG) {
        await message(nothing_happens, state);
    } else {
        const oldCorpsenm = eobj.corpsenm;
        if (eobj.corpsenm === PM_KILLER_BEE)
            eobj.corpsenm = PM_QUEEN_BEE;

        if (obj.cursed) {
            if (eobj.timed || eobj.corpsenm !== oldCorpsenm) {
                await message(
                    `The ${xnameFresh(eobj, state)} `
                        + `${otense(eobj, 'quiver', state)} feebly.`,
                    state,
                );
            } else {
                await message(nothing_seems_to_happen, state);
            }
            note_unported('timeout.c kill_egg');
        } else {
            const wasTimed = eobj.timed;
            if (eobj.corpsenm !== NON_PM) {
                if (!eobj.timed)
                    attach_egg_hatch_timeout(eobj, 0, env);
                // Blessed jelly marks only eggs not laid by the hero.
                if (obj.blessed && !eobj.spe) eobj.spe = 2;
            }

            if ((eobj.timed && !wasTimed) || eobj.spe === 2
                || eobj.corpsenm !== oldCorpsenm) {
                await message(
                    `The ${xnameFresh(eobj, state)} `
                        + `${otense(eobj, 'quiver', state)} briefly.`,
                    state,
                );
            } else {
                await message(nothing_seems_to_happen, state);
            }
        }
    }

    await setnotworn(obj, env);
    obfree(obj, null, env);
    objp.obj = null;
    return ECMD_TIME;
}

const DOAPPLY_UNPORTED_NAMED_ARMS = new Set([
    TOWEL,
    FLINT,
    LUCKSTONE,
    LOADSTONE,
    TOUCHSTONE,
]);

// C ref: apply.c beautiful() (1000-1017). Pure charisma/form-gender
// description shared by the mirror and the name-command source owner.
export function beautiful(state = game) {
    const cha = acurr(state, A_CHA);
    return cha >= 25 ? 'sublime'
        : cha >= 19 ? 'splendorous'
            : cha >= 16 ? (poly_gender(state) === FEMALE
                ? 'beautiful' : 'handsome')
                : cha >= 14 ? (poly_gender(state) === FEMALE
                    ? 'winsome' : 'amiable')
                    : cha >= 11 ? 'cute'
                        : cha >= 9 ? 'plain'
                            : cha >= 6 ? 'homely'
                                : cha >= 4 ? 'ugly' : 'hideous';
}

// C ref: apply.c use_mirror() (1018-1201). bhit() supplies the first
// visible or self-perceiving monster along an INVIS_BEAM, without a beam
// glyph or animation. Its returned monster and gn.notonhead are both used
// here, so the zap.c callee is wired at this exact source call.
export async function use_mirror(obj, state = game, env = {}) {
    const random = { d, rn2, rnd, ...(env.random ?? {}) };
    if (!await getdir(null, state)) return ECMD_CANCEL;

    const invisMirror = applyPropertyActive(INVIS, state);
    const useeit = !heroIsBlind(state)
        && (!invisMirror || applyPropertyActive(SEE_INVIS, state));
    const visage = beautiful(state);
    const mirror = simpleonames(obj, state);
    if (obj.cursed && random.rn2(2) === 0) {
        if (!heroIsBlind(state))
            await ttyPline(`The ${mirror} fogs up and doesn't reflect!`, state);
        else
            await ttyPline(nothing_seems_to_happen, state);
        return ECMD_TIME;
    }

    const u = state.u;
    if (!u.dx && !u.dy && !u.dz) {
        if (!useeit) {
            await ttyPline(
                `You can't see your ${visage} ${body_part(FACE, state.youmonst)}.`,
                state,
            );
        } else if (u.umonnum === PM_FLOATING_EYE) {
            if (applyPropertyActive(FREE_ACTION, state)) {
                await ttyPline('You stiffen momentarily under your gaze.', state);
            } else {
                const hallucinating = applyIsHallucinating(state);
                await ttyPline(hallucinating
                    ? `Yow!  The ${mirror} stares back!`
                    : "Yikes!  You've frozen yourself!", state);
                if (!hallucinating || random.rn2(4) === 0) {
                    nomul(-random.rnd(MAXULEV + 6 - u.ulevel), state);
                    state.multi_reason = 'gazing into a mirror';
                }
                state.gn ??= {};
                state.gn.nomovemsg = 0;
            }
        } else if (is_vampire(state.youmonst.data)
            || is_vampshifter(state.youmonst)) {
            await ttyPline("You don't have a reflection.", state);
        } else if (u.umonnum === PM_UMBER_HULK) {
            await ttyPline("Huh?  That doesn't look like you!", state);
            await make_confused(
                (state.u.uprops[CONFUSION]?.intrinsic ?? 0)
                    + random.d(3, 4),
                false,
                state,
            );
        } else if (applyIsHallucinating(state)) {
            await ttyPline(`You look ${hcolor(null, state)}.`, state);
        } else if (state.u.uprops[SICK]?.intrinsic) {
            await ttyPline('You look peaked.', state);
        } else if (u.uhs >= WEAK) {
            await ttyPline('You look undernourished.', state);
        } else if (Upolyd(u)) {
            await ttyPline(
                `You look like ${an(pmname(
                    state.mons[u.umonnum], poly_gender(state),
                ))}.`,
                state,
            );
        } else {
            await ttyPline(`You look as ${visage} as ever.`, state);
        }
        return ECMD_TIME;
    }
    if (u.uswallow) {
        if (useeit)
            await ttyPline(
                `You reflect ${s_suffix(mon_nam(u.ustuck, state))} `
                    + `${mbodypart(u.ustuck, STOMACH)}.`,
                state,
            );
        return ECMD_TIME;
    }
    if (u.uinwater) {
        if (useeit)
            await ttyPline(applyIsHallucinating(state)
                ? 'You give the fish a chance to fix their makeup.'
                : 'You reflect the murky water.', state);
        return ECMD_TIME;
    }
    if (u.dz) {
        if (useeit) {
            const reflected = u.dz > 0
                ? surface(u.ux, u.uy, state)
                : ceiling(u.ux, u.uy, state);
            await ttyPline(`You reflect the ${reflected}.`, state);
        }
        return ECMD_TIME;
    }

    const mtmp = await bhit(
        u.dx, u.dy, COLNO, INVIS_BEAM, null, null, { obj },
        state, random, env,
    );
    state.gn ??= {};
    if (!mtmp || !haseyes(mtmp.data) || state.gn.notonhead)
        return ECMD_TIME;

    const vis = canseemon(mtmp, state);
    const howSeen = vis ? howmonseen(mtmp, state) : 0;
    const monable = !mtmp.mcan
        && (!mtmp.minvis || perceives(mtmp.data));
    const mlet = mtmp.data.mlet;
    if (mtmp.msleeping) {
        if (vis)
            await ttyPline(
                `${Monnam(mtmp, state)} is too tired to look at your ${mirror}.`,
                state,
            );
    } else if (!mtmp.mcansee) {
        if (vis)
            await ttyPline(`${Monnam(mtmp, state)} can't see anything right now.`, state);
    } else if (invisMirror && !perceives(mtmp.data)) {
        if (vis)
            await ttyPline(`${Monnam(mtmp, state)} fails to notice your ${mirror}.`, state);
    } else if ((howSeen & (MONSEEN_NORMAL | MONSEEN_SEEINVIS
        | MONSEEN_INFRAVIS)) === MONSEEN_INFRAVIS) {
        if (vis)
            await ttyPline(
                `${monverbself(mtmp, Monnam(mtmp, state), 'are',
                    'too far away to see', state)} in the dark.`,
                state,
            );
    } else if (mlet === S_VAMPIRE || mlet === S_GHOST
        || is_vampshifter(mtmp)) {
        if (vis)
            await ttyPline(`${Monnam(mtmp, state)} doesn't have a reflection.`, state);
    } else if (monable && mtmp.data === state.mons[PM_MEDUSA]) {
        if (await mon_reflects(
            mtmp, 'The gaze is reflected away by %s %s!', state, env,
        )) return ECMD_TIME;
        if (vis)
            await ttyPline(`${Monnam(mtmp, state)} is turned to stone!`, state);
        state.gs ??= {};
        state.gs.stoned = true;
        await killed(mtmp, state, {
            ...env,
            random: { d, rn1, rn2, rnd, rne, rnl, rnz, ...(env.random ?? {}) },
        });
    } else if (monable && mtmp.data === state.mons[PM_FLOATING_EYE]) {
        let amount = random.d(
            Math.trunc(mtmp.m_lev),
            Math.trunc(mtmp.data.mattk[0].damd),
        );
        if (random.rn2(4) === 0) amount = 120;
        if (vis)
            await ttyPline(`${Monnam(mtmp, state)} is frozen by its reflection.`, state);
        else {
            const heard = youHear('something stop moving.', state);
            if (heard) await ttyPline(heard, state);
        }
        paralyze_monst(mtmp, mtmp.mfrozen + amount);
    } else if (monable && mtmp.data === state.mons[PM_UMBER_HULK]) {
        if (vis)
            await ttyPline(`${Monnam(mtmp, state)} confuses itself!`, state);
        mtmp.mconf = 1;
    } else if (monable && (mlet === S_NYMPH
        || mtmp.data === state.mons[PM_AMOROUS_DEMON])) {
        if (vis) {
            await ttyPline(
                `${monverbself(mtmp, Monnam(mtmp, state), 'admire', null, state)} `
                    + `in your ${mirror}.`,
                state,
            );
            await ttyPline(`${upstart(mhe(mtmp, { state }))} takes it!`, state);
        } else {
            await ttyPline(`It steals your ${mirror}!`, state);
        }
        await setnotworn(obj, { ...env, state });
        await freeinv(obj, { ...env, state });
        mpickobj(mtmp, obj, { ...env, state });
        await monflee(mtmp, 0, false, false, { ...env, state, random });
        if (!await tele_restrict(mtmp, state, env)) {
            await rloc(mtmp, RLOC_MSG, {
                ...env,
                state,
                random,
                newsym: (x, y) => newsym(x, y, state),
                onscary: (x, y, mon) => onscary(x, y, mon, state),
                setApparxy: set_apparxy,
            });
        }
    } else if (!is_unicorn(mtmp.data) && !humanoid(mtmp.data)
        && !is_demon(mtmp.data)
        && (!mtmp.minvis || perceives(mtmp.data))
        && random.rn2(5) !== 0) {
        let doReact = true;
        if (mtmp.mfrozen) {
            if (vis)
                await ttyPline(
                    `You discern no obvious reaction from ${mon_nam(mtmp, state)}.`,
                    state,
                );
            else
                await ttyPline(
                    'You feel a bit silly gesturing the mirror in that direction.',
                    state,
                );
            doReact = false;
        }
        if (doReact) {
            if (vis)
                await ttyPline(`${Monnam(mtmp, state)} is frightened by its reflection.`, state);
            await monflee(mtmp, random.d(2, 4), false, false, {
                ...env,
                state,
                random,
            });
        }
    } else if (!heroIsBlind(state)) {
        if (mtmp.minvis && !applyPropertyActive(SEE_INVIS, state)) {
            // The hero cannot distinguish this from no reaction.
        } else if ((mtmp.minvis && !perceives(mtmp.data))
            || !haseyes(mtmp.data) || state.gn.notonhead || !mtmp.mcansee) {
            await ttyPline(
                `${Monnam(mtmp, state)} doesn't seem to notice ${mhis(mtmp, { state })} reflection.`,
                state,
            );
        } else {
            await ttyPline(
                `${Monnam(mtmp, state)} ignores ${mhis(mtmp, { state })} reflection.`,
                state,
            );
        }
    }
    return ECMD_TIME;
}

// C ref: apply.c use_towel() (112-197). Towel wetness is stored in spe; its
// four cleanup branches call weapon.c dry_a_towel() in source order.
export async function use_towel(obj, state = game, env = {}) {
    const random = { rn1, rn2, ...(env.random ?? {}) };
    const message = env.message ?? ttyPline;
    const u = state.u;
    const drying_feedback = obj === state.uwep;

    if (!freehand(state, env)) {
        await message(
            `You have no free ${body_part(HAND, state.youmonst)}!`, state,
        );
        return ECMD_OK;
    } else if (obj === state.ublindf) {
        await message("You cannot use it while you're wearing it!", state);
        return ECMD_OK;
    } else if (obj.cursed) {
        let old;
        switch (random.rn2(3)) {
        case 2:
            old = (u.uprops?.[GLIB]?.intrinsic ?? 0) & TIMEOUT;
            make_glib(old + random.rn1(10, 3), state, env);
            await message(
                `Your ${makeplural(body_part(HAND, state.youmonst))} `
                    + `${old ? 'are filthier than ever' : 'get slimy'}!`,
                state,
            );
            if (is_wet_towel(obj))
                await dry_a_towel(obj, -1, drying_feedback, state, env);
            return ECMD_TIME;
        case 1:
            if (!state.ublindf) {
                old = u.ucreamed;
                u.ucreamed += random.rn1(10, 3);
                await message(
                    `Yecch!  Your ${body_part(FACE, state.youmonst)} `
                        + `${old ? 'has more' : 'now has'} gunk on it!`,
                    state,
                );
                await make_blinded(
                    ((u.uprops[BLINDED].intrinsic & TIMEOUT)
                        + u.ucreamed - old),
                    true,
                    state,
                    env,
                );
            } else {
                const worn = state.ublindf;
                const what = worn.otyp === LENSES
                    ? 'lenses'
                    : obj.otyp === worn.otyp ? 'other towel' : 'blindfold';
                if (worn.cursed) {
                    await message(
                        `You push your ${what} `
                            + `${random.rn2(2) ? 'cock-eyed' : 'crooked'}.`,
                        state,
                    );
                } else {
                    await message(`You push your ${what} off.`, state);
                    await Blindf_off(worn, state);
                    await dropx(worn, dropCommandEnv(state, env));
                }
            }
            if (is_wet_towel(obj))
                await dry_a_towel(obj, -1, drying_feedback, state, env);
            return ECMD_TIME;
        case 0:
            break;
        }
    }

    if (u.uprops?.[GLIB]?.intrinsic) {
        make_glib(0, state, env);
        await message(
            `You wipe off your ${!state.uarmg
                ? makeplural(body_part(HAND, state.youmonst))
                : gloves_simple_name(state.uarmg, state)}.`,
            state,
        );
        if (is_wet_towel(obj))
            await dry_a_towel(obj, -1, drying_feedback, state, env);
        return ECMD_TIME;
    } else if (u.ucreamed) {
        incr_itimeout(u.uprops[BLINDED], -1 * Math.trunc(u.ucreamed));
        u.ucreamed = 0;
        // C tests its `Blinded` macro here: HBlinded && !BBlinded.
        // The broader `Blind` macro also includes an extrinsic blindfold.
        const blinded = Boolean(
            u.uprops?.[BLINDED]?.intrinsic
                && !u.uprops[BLINDED].blocked,
        );
        if (!blinded) {
            await message("You've got the glop off.", state);
            if (!await gulp_blnd_check(state, env)) {
                set_itimeout(u.uprops[BLINDED], 1);
                await make_blinded(0, true, state, env);
            }
        } else {
            await message(
                `Your ${body_part(FACE, state.youmonst)} feels clean now.`,
                state,
            );
        }
        if (is_wet_towel(obj))
            await dry_a_towel(obj, -1, drying_feedback, state, env);
        return ECMD_TIME;
    }

    await message(
        `Your ${body_part(FACE, state.youmonst)} and `
            + `${makeplural(body_part(HAND, state.youmonst))} are already clean.`,
        state,
    );
    return ECMD_OK;
}

const whistleRandom = { d, rn1, rn2, rnd, rne, rnl, rnz };

function whistleHowMany(count) {
    return count === 2 ? 'two'
        : count === 3 ? 'three'
            : count === 4 ? 'four'
                : count <= 7 ? 'several' : 'many';
}

// C refs: apply.c use_whistle() (476-491), use_magic_whistle() (493-516),
// and magic_whistled() (518-691). The C Soundeffect calls in these paths are
// empty in the reference TTY build, so their arguments have no observable
// effect and are intentionally not evaluated.
export async function use_whistle(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const deaf = heroDeaf(state);
    if (!can_blow(state.youmonst, state)) {
        await message('You are incapable of using the whistle.', state);
        return;
    }
    if (state.u?.uinwater) {
        await message(`You blow bubbles through ${yname(obj, state)}.`, state);
        return;
    }
    if (deaf) {
        await message(
            `You feel rushing air tickle your ${body_part(NOSE, state.youmonst)}.`,
            state,
        );
    } else {
        await message(
            `You produce a ${obj.cursed ? 'shrill' : 'high'} whistling sound.`,
            state,
        );
    }
    await (env.wakeNearby ?? wake_nearby)(true, {
        ...env, state, random: env.random ?? whistleRandom,
    });
    if (obj.cursed) note_unported('vault.c vault_summon_gd');
}

export async function use_magic_whistle(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = { ...whistleRandom, ...(env.random ?? {}) };
    const deaf = heroDeaf(state);
    if (!can_blow(state.youmonst, state)) {
        await message('You are incapable of using the whistle.', state);
    } else if (obj.cursed && !random.rn2(2)) {
        await message(
            `You produce a ${state.u?.uinwater ? 'very ' : ''}high-${deaf
                ? 'frequency vibration' : 'pitched humming noise'}.`,
            state,
        );
        await (env.wakeNearby ?? wake_nearby)(true, { ...env, state, random });
        if (!random.rn2(2) && !noteleport_level(state.youmonst, state))
            await (env.teleToRndPet ?? tele_to_rnd_pet)(state, {
                ...env, random, message,
            });
    } else {
        const descriptor = heroHallucinating(state) ? 'normal'
            : state.u?.uinwater && !deaf ? 'strange, high-pitched' : 'strange';
        await message(
            `You produce a ${descriptor}${deaf
                ? ', sharp vibration.' : ' whistling sound.'}`,
            state,
        );
        await magic_whistled(obj, state, { ...env, random, message });
    }
}

// C ref: apply.c magic_whistled() (518-691). Trapped-pet and active-trap
// consequences retain explicit source boundaries: fill_pit() is a discarded
// void call, while mintrap()'s consumed result is wired through its existing
// implementation. That implementation currently refuses trap effects it has
// not ported, so matching evidence must keep pets on trap-free destinations.
export async function magic_whistled(obj, state = game, env = {}) {
    const random = { ...whistleRandom, ...(env.random ?? {}) };
    const message = env.message ?? ttyPline;
    const alreadyDiscovered = Boolean(
        state.objects?.[obj.otyp]?.oc_name_known,
    );
    if ((state.level?.flags?.stasis_until ?? 0) >= (state.moves ?? 0))
        return;

    let shift = 0;
    let appear = 0;
    let disappear = 0;
    let trapped = 0;
    let shiftName = '';
    let appearName = '';
    let disappearName = '';
    for (let monster = state.level?.monlist ?? null;
        monster;) {
        const nextmon = monster.nmon;
        if (monster.mhp >= 1 && monster.mtame && monster !== state.u?.usteed) {
            if (monster.mtrapped) {
                monster.mtrapped = false;
                note_unported('trap.c fill_pit');
            }

            const oldSeen = canspotmon(monster, state);
            let monsterName = oldSeen ? y_monnam(monster, state, env) : '';
            if (M_AP_TYPE(monster)) seemimic(monster, state, env);
            const oldX = monster.mx;
            const oldY = monster.my;
            await mnexto(monster, alreadyDiscovered ? RLOC_NONE : RLOC_MSG, {
                ...env, state, random, message,
            });

            if (monster.mx !== oldX || monster.my !== oldY) {
                if (monster.mundetected) {
                    monster.mundetected = false;
                    newsym(monster.mx, monster.my);
                }
                state.iflags.last_msg = PLNMSG_enum;
                const result = await mintrap(monster, NO_TRAP_FLAGS, {
                    ...env,
                    state,
                    random,
                    message,
                    redraw: (x, y) => newsym(x, y),
                    mInAir: subject => m_in_air(subject, state),
                    heroDeaf: () => heroDeaf(state),
                    youHear,
                    unsupported: name => {
                        note_unported(`trap.c ${name}`);
                        throw new Error(`magic_whistled needs trap.c ${name}`);
                    },
                });
                if (result === Trap_Killed_Mon) change_luck(-1, state);
                if (state.iflags.last_msg !== PLNMSG_enum) {
                    trapped++;
                    monster = nextmon;
                    continue;
                }
                const newSeen = monster.mhp < 1
                    ? false : canspotmon(monster, state);
                if (newSeen) {
                    monsterName = y_monnam(monster, state, env);
                    if (oldSeen) {
                        if (++shift === 1)
                            shiftName = `${monsterName} shifts location`;
                    } else if (++appear === 1) {
                        appearName = `${monsterName} appears`;
                    }
                } else if (oldSeen && ++disappear === 1) {
                    disappearName = `${monsterName} disappears`;
                }
            }
        }
        monster = nextmon;
    }

    let text = '';
    if (!alreadyDiscovered) {
        if (shift + appear + trapped > 0)
            discover_object(obj.otyp, true, true, true, state, { random });
        return;
    }

    if (shift > 1) shiftName = `${whistleHowMany(shift)} creatures shift locations`;
    if (shift > 0) text = truncateByteString(upstart(shiftName), 255);
    if (appear > 1) {
        appearName = `${whistleHowMany(appear)} ${shift === 0
            ? 'creatures' : shift === 1 ? 'other creatures' : 'others'} appear`;
    }
    if (appear > 0) {
        if (shift === 0) text = truncateByteString(upstart(appearName), 255);
        else text = truncateByteString(
            `${text}${disappear ? ',' : ' and'} ${appearName}`,
            255,
        );
    }
    if (disappear > 1) {
        disappearName = `${whistleHowMany(disappear)} ${shift === 0 && appear === 0
            ? 'creatures'
            : shift < 2 && appear < 2 ? 'other creatures' : 'others'} disappear`;
    }
    if (disappear > 0) {
        if (shift + appear === 0)
            text = truncateByteString(upstart(disappearName), 255);
        else text = truncateByteString(
            `${text}${shift && appear ? ',' : ''} and ${disappearName}`,
            255,
        );
    }
    if (text) await message(`${text}.`, state);
}

// C ref: apply.c discard_broken_wand() (3880-3890).  `current_wand` is the
// JavaScript home of gc.current_wand, also used by zap.c destroy_items().
function discard_broken_wand(state = game, rawEnv = {}) {
    const obj = state.current_wand;
    state.current_wand = null;
    if (obj) delobj(obj, { ...rawEnv, state });
    nomul(0, state);
}

// C ref: apply.c broken_wand_explode() (3892-3900).  The explosion's void
// return is discarded by C; its effects and knowledge update precede discard.
async function broken_wand_explode(obj, damage, expltype, state = game,
    rawEnv = {}) {
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnl, rnz };
    await explode(
        state.u.ux,
        state.u.uy,
        -obj.otyp,
        damage,
        WAND_CLASS,
        expltype,
        state,
        { ...env, random },
    );
    discover_object(obj.otyp, true, true, true, state, { ...env, random });
    discard_broken_wand(state, env);
}

// C ref: apply.c maybe_dunk_boulders() (3902-3910).  do.c
// boulder_hits_pool() returns a Boolean, but both C callers discard it.
export async function maybe_dunk_boulders(
    x, y, state = game, rawEnv = {},
) {
    const env = { ...rawEnv, state };
    const suppliedRandom = env.random ?? {};
    const random = {
        d: suppliedRandom.d ?? d,
        rn2: suppliedRandom.rn2 ?? rn2,
        rnd: suppliedRandom.rnd ?? rnd,
    };
    let boulder;
    while (is_pool_or_lava(x, y, state)
        && (boulder = sobj_at(BOULDER, x, y, state))) {
        obj_extract_self(boulder, { ...env });
        await boulder_hits_pool(
            boulder,
            x,
            y,
            false,
            { ...env, random },
        );
    }
}

// C ref: apply.c do_break_wand() (3913-4147).  This is the shared WAND_CLASS
// arm of doapply(); it removes the wand before using zappable(), restores the
// consumed charge, then runs the type-specific explosion and callbacks in C's
// eight-neighbor-plus-hero order.
export async function do_break_wand(obj, state = game, rawEnv = {}) {
    const env = { ...rawEnv, state };
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnl, rnz };
    const message = env.message ?? ttyPline;
    const fragile = objdescr_is(obj, 'balsa', state)
        || objdescr_is(obj, 'glass', state);

    if (nohands(state.youmonst.data)) {
        await message(`You can't break ${yname(obj, state)} without hands!`,
            state, env);
        return ECMD_OK;
    }
    if (!freehand(state, env)) {
        const hands = makeplural(body_part(HAND, state.youmonst));
        await message(`Your ${hands} are occupied!`, state, env);
        return ECMD_OK;
    }
    if (acurr(state, A_STR) < (fragile ? 5 : 10)) {
        await message(`You don't have the strength to break ${yname(obj, state)}!`,
            state, env);
        return ECMD_OK;
    }

    const confirmation = safe_qbuf(
        'Are you really sure you want to break ',
        '?',
        obj,
        yname,
        ysimple_name,
        'the wand',
        state,
    );
    const paranoid = Boolean((state.flags?.paranoia_bits ?? 0)
        & PARANOID_BREAKWAND);
    if (!await paranoid_query(paranoid, confirmation, state))
        return ECMD_OK;

    await message(
        `Raising ${yname(obj, state)} high above your `
            + `${body_part(HEAD, state.youmonst)}, `
            + `you ${fragile ? 'snap' : 'break'} it in two!`,
        state,
        env,
    );

    if (obj.unpaid) {
        check_unpaid(obj, state);
        costly_alteration(obj, COST_DSTROY, env);
    }

    state.current_wand = obj;
    await freeinv(obj, env);
    await setnotworn(obj, setwornEnv(state));

    if (!await zappable(obj, state)) {
        await message(nothing_happens, state, env);
        discard_broken_wand(state, env);
        return ECMD_TIME;
    }
    // C's successful zappable() consumes one charge; breaking the wand puts
    // it back before deriving damage. A wrested last charge may leave zero.
    obj.spe++;
    if (!obj.spe) obj.spe = random.rnd(3);

    obj.ox = state.u.ux;
    obj.oy = state.u.uy;
    let damage = obj.spe * 4;
    let affectsObjects = false;
    let shopDamage = false;
    let fillmsg = false;

    switch (obj.otyp) {
    case WAN_OPENING:
        if (state.u.ustuck) {
            await release_hold(state);
            if (obj.dknown)
                discover_object(WAN_OPENING, true, true, true, state, env);
            discard_broken_wand(state, env);
            return ECMD_TIME;
        }
        // C falls through to the no-special-effect group when not stuck.
        // falls through
    case WAN_WISHING:
    case WAN_NOTHING:
    case WAN_LOCKING:
    case WAN_PROBING:
    case WAN_ENLIGHTENMENT:
    case WAN_SECRET_DOOR_DETECTION:
    case WAN_STASIS:
        await message('But nothing else happens...', state, env);
        discard_broken_wand(state, env);
        return ECMD_TIME;
    case WAN_DEATH:
    case WAN_LIGHTNING:
        await broken_wand_explode(obj, damage * 4, EXPL_MAGICAL, state, env);
        return ECMD_TIME;
    case WAN_FIRE:
        await broken_wand_explode(obj, damage * 2, EXPL_FIERY, state, env);
        return ECMD_TIME;
    case WAN_COLD:
        await broken_wand_explode(obj, damage * 2, EXPL_FROSTY, state, env);
        return ECMD_TIME;
    case WAN_MAGIC_MISSILE:
        await broken_wand_explode(obj, damage, EXPL_MAGICAL, state, env);
        return ECMD_TIME;
    case WAN_STRIKING:
        // Soundeffect() is a no-op with the recorder's tty backend.
        await message('A wall of force smashes down around you!', state, env);
        damage = random.d(1 + obj.spe, 6);
        // C falls through to the object-affecting group.
        // falls through
    case WAN_CANCELLATION:
    case WAN_POLYMORPH:
    case WAN_TELEPORTATION:
    case WAN_UNDEAD_TURNING:
        affectsObjects = true;
        break;
    default:
        break;
    }

    await explode(
        obj.ox,
        obj.oy,
        -obj.otyp,
        random.rnd(damage),
        WAND_CLASS,
        EXPL_MAGICAL,
        state,
        { ...env, random },
    );
    zapsetup(state);

    for (let i = 0; i <= N_DIRS; i++) {
        const x = obj.ox + xdir[i];
        const y = obj.oy + ydir[i];
        state.gb.bhitpos = { x, y };
        if (!isok(x, y)) continue;

        if (obj.otyp === WAN_DIGGING) {
            const level = state.level.at(x, y);
            const digResult = dig_check(null, x, y, state);
            if (digResult < DIGCHECK_FAILED
                || digResult === DIGCHECK_FAIL_BOULDER) {
                if (IS_WALL(level.typ) || IS_DOOR(level.typ)) {
                    await watch_dig(null, x, y, true, env);
                    if (in_rooms(x, y, SHOPBASE, state).length)
                        shopDamage = true;
                }
                if (level.typ === ICE)
                    spot_stop_timers(x, y, MELT_ICE_AWAY, state);

                const terrain = fillholetyp(x, y, false, state, random);
                if (terrain !== ROOM) {
                    level.typ = terrain;
                    level.flags = 0;
                    await liquid_flow(
                        x,
                        y,
                        terrain,
                        t_at(x, y, state),
                        fillmsg
                            ? null
                            : 'Some holes are quickly filled with %s!',
                        state,
                        { ...env, random },
                    );
                    fillmsg = true;
                } else {
                    const makePit = random.rn2(obj.spe) < 3
                        || (!Can_dig_down(state.u.uz, state)
                            && !level.candig);
                    await digactualhole(
                        x, y, null, makePit ? PIT : HOLE, state, { ...env, random },
                    );
                }
            }
            fill_pit(x, y, state);
            await maybe_dunk_boulders(x, y, state, { ...env, random });
            recalc_block_point(x, y, state);
            continue;
        }

        if (obj.otyp === WAN_CREATE_MONSTER) {
            // C discards makemon()'s pointer; its random creation effects are
            // still required at the hero square rather than the offset cell.
            await makemon_runtime(null, state.u.ux, state.u.uy, NO_MM_FLAGS,
                { ...env, random });
            continue;
        }

        if (x !== state.u.ux || y !== state.u.uy) {
            const monster = m_at(x, y, state);
            if (monster) {
                if (obj.otyp === WAN_LIGHT || obj.otyp === WAN_STRIKING
                    || obj.otyp === WAN_POLYMORPH) {
                    await bhitm(monster, obj, state, random, env);
                } else {
                    note_unported('zap.c bhitm');
                }
            }
            if (affectsObjects && state.level.objects[x]?.[y]) {
                if (obj.otyp === WAN_STRIKING || obj.otyp === WAN_POLYMORPH) {
                    await bhitpile(obj, x, y, state, random, env);
                } else {
                    note_unported('zap.c bhito');
                }
                if (state.disp?.botl) await bot();
            }
        } else {
            if (affectsObjects && state.level.objects[x]?.[y]) {
                if (obj.otyp === WAN_STRIKING || obj.otyp === WAN_POLYMORPH) {
                    await bhitpile(obj, x, y, state, random, env);
                } else {
                    note_unported('zap.c bhito');
                }
                if (state.disp?.botl) await bot();
            }
            const dealt = await zapyourself(obj, false, state);
            if (dealt) {
                const killer = `killed ${uhim(state)}self by breaking a wand`;
                await losehp(
                    halfPhysicalDamage(dealt, state),
                    killer,
                    NO_KILLER_PREFIX,
                    state,
                    env,
                );
            }
            if (state.disp?.botl) await bot();
        }
    }

    await zapwrapup(state, env);
    if (shopDamage) note_unported('shk.c pay_for_damage');
    if (obj.otyp === WAN_LIGHT)
        await litroom(true, obj, state);
    discard_broken_wand(state, env);
    return ECMD_TIME;
}

export async function doapply(state = game, env = {}) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to use or apply tools in your current form.",
            state,
        );
        return ECMD_OK;
    }
    if (await check_capacity(null, state))
        return ECMD_OK;

    let obj = await getobj('use or apply', apply_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    const objp = { obj };
    if (!await retouch_object(objp, false, state))
        return ECMD_TIME;
    obj = objp.obj;

    if (obj.oclass === WAND_CLASS)
        return await do_break_wand(obj, state, env);
    if (obj.oclass === SPBOOK_CLASS)
        return await flip_through_book(obj, state);
    if (obj.oclass === COIN_CLASS)
        return await flip_coin(obj, state, env);

    switch (obj.otyp) {
    case BLINDFOLD:
    case LENSES:
        if (obj === state.ublindf) {
            if (!obj.cursed)
                await Blindf_off(obj, state);
        } else if (!state.ublindf) {
            await _doWearInternals.Blindf_on(obj, state);
        } else {
            const already = state.ublindf.otyp === TOWEL
                ? 'covered by a towel'
                : state.ublindf.otyp === BLINDFOLD
                    ? 'wearing a blindfold' : 'wearing lenses';
            await ttyPline(`You are already ${already}.`, state);
        }
        return ECMD_TIME;
    case CRYSTAL_BALL:
        // apply.c discards use_crystal_ball()'s result.
        await use_crystal_ball({ obj }, state);
        return ECMD_TIME;
    case TINNING_KIT:
        // apply.c discards use_tinning_kit()'s result.
        await use_tinning_kit(obj, state, env);
        return ECMD_TIME;
    case CANDELABRUM_OF_INVOCATION:
        // apply.c:4337-4338. use_candelabrum() is void; retain doapply's
        // initial ECMD_TIME result after its source branches.
        await use_candelabrum(obj, state, env);
        return ECMD_TIME;
    case LEASH:
        return use_leash(obj, state, env);
    case CREAM_PIE:
        return use_cream_pie(obj, state, env);
    case LUMP_OF_ROYAL_JELLY: {
        const result = await use_royal_jelly(objp, state, env);
        obj = objp.obj;
        return result;
    }
    case BULLWHIP:
        return use_whip(obj, state, env);
    case GRAPPLING_HOOK:
        return use_grapple(obj, state, env);
    case SADDLE:
        return use_saddle(obj, state, env);
    case MAGIC_WHISTLE:
        await use_magic_whistle(obj, state, env);
        return ECMD_TIME;
    case TIN_WHISTLE:
        await use_whistle(obj, state, env);
        return ECMD_TIME;
    case EUCALYPTUS_LEAF:
        if (obj.blessed) {
            await use_magic_whistle(obj, state, env);
            if (!(env.random?.rn2 ?? rn2)(49)) {
                if (!heroIsBlind(state)) {
                    await ttyPline(
                        `${Yobjnam2(obj, 'glow', state)} ${hcolor('brown')}.`,
                        state,
                    );
                    set_bknown(obj, true, { ...env, state });
                }
                await unbless(obj, { ...env, state });
            }
        } else {
            await use_whistle(obj, state, env);
        }
        return ECMD_TIME;
    case CAN_OF_GREASE:
        return use_grease(obj, state, env);
    case STETHOSCOPE:
        return use_stethoscope(obj, state);
    case BELL:
    case BELL_OF_OPENING: {
        await use_bell(objp, state, env);
        obj = objp.obj;
        let result = ECMD_TIME;
        // apply.c's common tail remains after use_bell() and runs only when
        // the source pointer still names the object.
        if (obj?.oartifact) result |= await arti_speak(obj, state);
        return result;
    }
    case EXPENSIVE_CAMERA:
        return use_camera(obj, state, env);
    case TOWEL:
        return use_towel(obj, state, env);
    case MIRROR: {
        const result = await use_mirror(obj, state, env);
        // apply.c:4331 and its common tail at 4422, including a canceled
        // mirror direction: a speaking artifact still spends the turn.
        return obj?.oartifact ? result | await arti_speak(obj, state) : result;
    }
    case PICK_AXE:
    case DWARVISH_MATTOCK:
        return use_pick_axe(obj, state, env);
    case LOCK_PICK:
    case CREDIT_CARD:
    case SKELETON_KEY: {
        // apply.c:4285-4289. Every pick_lock() answer except
        // PICKLOCK_DID_NOTHING spends the turn, which is what draws the next
        // turn's random numbers.
        const result = (await pick_lock(obj, 0, 0, null, state) !== 0)
            ? ECMD_TIME : ECMD_OK;
        // apply.c:4422 also runs after PICKLOCK_DID_NOTHING; the Master
        // Key's speech can add ECMD_TIME to the operation's ECMD_OK result.
        return obj?.oartifact ? result | await arti_speak(obj, state) : result;
    }
    case LARGE_BOX:
    case CHEST:
    case ICE_BOX:
    case SACK:
    case BAG_OF_HOLDING:
    case OILSKIN_SACK:
        // apply.c:4271-4278. use_container() handles open/close/loot.
        return use_container(obj, true, false, state);
    case BAG_OF_TRICKS:
        // apply.c:4279-4281. (void) bagotricks(obj, FALSE, (int *) 0)
        await bagotricks(obj, false, state);
        return ECMD_TIME;
    case WAX_CANDLE:
    case TALLOW_CANDLE:
        await use_candle(obj, state, env);
        return ECMD_TIME;
    case OIL_LAMP:
    case MAGIC_LAMP:
    case BRASS_LANTERN:
        await use_lamp(obj, state, env);
        return ECMD_TIME;
    case POT_OIL:
        // apply.c:4349-4350. light_cocktail() is void in C but may update
        // obj through its pointer; the enclosing command keeps ECMD_TIME.
        await light_cocktail(objp, state, env);
        obj = objp.obj;
        return ECMD_TIME;
    case MAGIC_MARKER:
        // apply.c:4361-4362. dowrite() handles the full magic marker flow.
        return dowrite(obj, state, {
            ...env,
            fingersOrGloves: fingers_or_gloves,
            // write.c discards dropx()'s result. Use the existing ordinary
            // floor-drop path with the same display and inventory hooks as
            // other production drop callers.
            dropx: (object) => dropx(object, {
                ...env,
                state,
                hooks: {
                    ...(env.hooks ?? {}),
                    encumberMessage: env.hooks?.encumberMessage
                        ?? ((targetState) => encumber_msg(targetState, {
                            message: env.planning ? async () => {} : ttyPline,
                        })),
                    extractExternalObject:
                        env.hooks?.extractExternalObject ?? remove_object,
                    newsym: env.hooks?.newsym
                        ?? (env.planning ? () => {} : (x, y) => newsym(x, y)),
                },
            }),
        });
    case TIN_OPENER: {
        // apply.c:4364-4366 assigns this ECMD result before the common
        // artifact-speech tail; use_tin_opener() selects a tin and calls
        // start_tin() for the source opening effect.
        const result = await use_tin_opener(obj, state, env);
        return obj?.oartifact ? result | await arti_speak(obj, state) : result;
    }
    case FIGURINE:
        // apply.c:4367. use_figurine() updates the pointer to NULL after the
        // source consumes the selected object.
        return use_figurine(objp, state, env);
    case UNICORN_HORN:
        // apply.c:4371. use_unicorn_horn() is void; retain doapply's initial
        // ECMD_TIME while applying its property effects.
        await use_unicorn_horn(obj, state, env);
        return ECMD_TIME;
    case HORN_OF_PLENTY:
        // apply.c:4385-4387. Not a musical instrument.
        // C's res starts as ECMD_TIME; hornoplenty doesn't change it.
        await hornoplenty(obj, false, null, { state });
        return ECMD_TIME;
    case LAND_MINE:
    case BEARTRAP:
        // apply.c:4388-4393. use_trap() is void, so doapply() keeps its
        // initial ECMD_TIME result while it schedules the occupation.
        await use_trap(obj, state, env);
        return ECMD_TIME;
    case FLINT:
    case LUCKSTONE:
    case LOADSTONE:
    case TOUCHSTONE:
        // apply.c:4397-4400. use_stone() returns doapply's command result.
        return use_stone(obj, state, env);
    case WOODEN_FLUTE:
    case MAGIC_FLUTE:
    case TOOLED_HORN:
    case FROST_HORN:
    case FIRE_HORN:
    case WOODEN_HARP:
    case MAGIC_HARP:
    case BUGLE:
    case LEATHER_DRUM:
    case DRUM_OF_EARTHQUAKE:
        // apply.c:4372-4383. All musical instruments share this owner.
        return do_play_instrument(obj, state, env);
    case BANANA:
        // apply.c:4401-4403. Hallucinating heroes get the banana's ringing
        // message and the source's initial ECMD_TIME result; otherwise C
        // falls through to the generic default arm below.
        if (heroHallucinating(state)) {
            await ttyPline("It rings! ... But no-one answers.", state);
            return ECMD_TIME;
        }
        // FALLTHROUGH to the same unknown-use result as the C default.
    default:
        // apply.c:4407-4417. CARROT and other nonnamed foods use this arm;
        // BANANA also falls through here when not hallucinating. Those food
        // objects cannot be poles, picks, or axes because the source macros
        // admit only WEAPON_CLASS and TOOL_CLASS.
        // The set above preserves each unported named switch arm rather than
        // mistaking it for a generic refusal.
        if (DOAPPLY_UNPORTED_NAMED_ARMS.has(obj.otyp))
            throw new UnsupportedApplyError(
                `doapply()'s arm for object type ${obj.otyp}`,
            );
        if (is_pole(obj, state))
            return use_pole(obj, false, state);
        if (is_pick(obj, state) || is_axe(obj, state))
            return use_pick_axe(obj, state, env);
        await ttyPline("Sorry, I don't know how to use that.", state);
        return ECMD_FAIL;
    }
}

// C ref: apply.c flip_coin() (4526-4556). splitobj()'s returned coin is used
// for stacked drops. Every lost coin calls do.c:dropx(), including under
// Hallucination; only the separate underwater floor-effects path remains a
// named gap.
export async function flip_coin(obj, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    const random = env.random ?? {};
    const drawRn2 = random.rn2 ?? rn2;
    let coin = obj;
    let loseCoin = false;

    await message(`You flip ${an(singular(obj, xnameFresh, state), state)}.`, state);
    if (state.u?.uinwater) {
        await message('It tumbles away.', state);
        loseCoin = true;
    } else {
        const glib = state.u?.uprops?.[GLIB]?.intrinsic;
        const fumbling = state.u?.uprops?.[FUMBLING];
        if (glib || fumbling?.intrinsic || fumbling?.extrinsic
            || (acurr(state, A_DEX) < 10
                && !drawRn2(acurr(state, A_DEX)))) {
            await message(
                `It slips between your ${fingers_or_gloves(false, state)}.`,
                state,
            );
            loseCoin = true;
        }
    }

    if (loseCoin) {
        if (coin.quan > 1)
            coin = splitobj(coin, 1, { ...env, state });
        if (state.u?.uinwater) {
            // C discards dropx()'s result. Its underwater drop/floor effects
            // are still unported, so retain that source-named gap.
            note_unported('do.c dropx underwater');
        } else {
            await dropx(coin, {
                ...env,
                state,
                hooks: {
                    ...(env.hooks ?? {}),
                    encumberMessage: env.hooks?.encumberMessage
                        ?? ((targetState) => encumber_msg(targetState, {
                            message: env.planning ? async () => {} : ttyPline,
                        })),
                    extractExternalObject:
                        env.hooks?.extractExternalObject ?? remove_object,
                    newsym: env.hooks?.newsym
                        ?? (env.planning ? () => {} : (x, y) => newsym(x, y)),
                },
            });
        }
        return ECMD_TIME;
    }

    if (heroHallucinating(state)) {
        await message(drawRn2(100)
            ? 'Wow, a double header!'
            : 'The coin miraculously lands on its edge!', state);
    } else {
        await message(`It comes up ${drawRn2(2) ? 'heads' : 'tails'}.`, state);
    }
    return ECMD_TIME;
}

// C ref: apply.c flip_through_book() (4473-4526), selected by doapply() for
// every SPBOOK_CLASS object. Soundeffect() is an empty macro in the recorder's
// tty build; the following You_hear/You_see/You_feel messages remain active.
async function flip_through_book(obj, state = game) {
    if (state.u?.uinwater) {
        await ttyPline(
            "You don't want to get the pages even more soggy, do you?", state,
        );
        return ECMD_OK;
    }

    await ttyPline(
        `You flip through the pages of ${thesimpleoname(obj, state)}.`, state,
    );

    if (obj.otyp === SPE_BOOK_OF_THE_DEAD) {
        if (!heroDeaf(state)) {
            // The C Soundeffect(se_rustling_paper, 50) expands to nothing in
            // this build. You_hear still applies the acoustics/Unaware rules.
            const heard = youHear(
                `the pages make an unpleasant ${
                    heroHallucinating(state) ? 'chuckling' : 'rustling'
                } sound.`,
                state,
            );
            if (heard) await ttyPline(heard, state);
        } else if (!heroIsBlind(state)) {
            await ttyPline(
                youSee(
                    `the pages glow faintly ${hcolor('red', state)}.`, state,
                ),
                state,
            );
        } else {
            const prefix = heroUnaware(state)
                ? 'You dream that you feel' : 'You feel';
            await ttyPline(`${prefix} the pages tremble.`, state);
        }
    } else if (heroIsBlind(state)) {
        await ttyPline(
            `The pages feel ${
                heroHallucinating(state) ? 'freshly picked' : 'rough and dry'
            }.`,
            state,
        );
    } else if (obj.otyp === SPE_BLANK_PAPER) {
        await ttyPline(
            `This spellbook ${heroHallucinating(state)
                ? "doesn't have much of a plot"
                : 'has nothing written in it'}.`,
            state,
        );
        // C makeknown(obj->otyp) expands to discover_object(type, TRUE, TRUE,
        // TRUE); it also credits the hero's discovery and Wisdom exercise.
        discover_object(obj.otyp, true, true, true, state);
    } else if (heroHallucinating(state)) {
        await ttyPline('You enjoy the animated initials.', state);
    } else if (obj.otyp === SPE_NOVEL) {
        await ttyPline(
            'This looks like it might be interesting to read.', state,
        );
    } else {
        const fadeness = [
            'fresh',
            'slightly faded',
            'very faded',
            'extremely faded',
            'barely visible',
        ];
        const findx = Math.min(obj.spestudied ?? 0, MAX_SPELL_STUDY);
        const magic = objectType(obj.otyp, state).oc_magic;
        await ttyPline(
            `The${magic ? ' magical' : ''} ink in this spellbook is ${
                fadeness[findx]
            }.`,
            state,
        );
    }

    return ECMD_TIME;
}

// C ref: apply.c grease_ok() (2585-2601). The inventory callback is pure:
// NULL means hands, coins are never candidates, and inaccessible worn gear is
// excluded while ordinary items remain suggested.
export function grease_ok(obj, state = game) {
    if (!obj)
        return GETOBJ_SUGGEST;
    if (obj.oclass === COIN_CLASS)
        return GETOBJ_EXCLUDE;
    if (inaccessible_equipment(obj, null, false, state))
        return GETOBJ_EXCLUDE_INACCESS;
    return GETOBJ_SUGGEST;
}

// C ref: apply.c use_grease() (2604-2654). The caller consumes the ECMD_*
// result; charge, drop, target selection, Glib and inventory updates stay in
// the same order as the source.
export async function use_grease(obj, state = game, env = {}) {
    if (applyIsGlib(state)) {
        await ttyPline(
            `${Tobjnam(obj, 'slip', state)} from your ${fingers_or_gloves(false, state)}.`,
            state,
        );
        await dropx(obj, dropCommandEnv(state, { ...env, state }));
        return ECMD_TIME;
    }

    if (obj.spe > 0) {
        if ((obj.cursed || applyIsFumbling(state)) && !rn2(2)) {
            consume_obj_charge(obj, true, { ...env, state });
            await ttyPline(
                `${Tobjnam(obj, 'slip', state)} from your ${fingers_or_gloves(false, state)}.`,
                state,
            );
            await dropx(obj, dropCommandEnv(state, { ...env, state }));
            return ECMD_TIME;
        }

        const target = await getobj(
            'grease', grease_ok, GETOBJ_PROMPT, state,
        );
        if (!target)
            return ECMD_CANCEL;
        if (await inaccessible_equipment(target, 'grease', false, state))
            return ECMD_OK;

        consume_obj_charge(obj, true, { ...env, state });
        const oldglib = (state.u?.uprops?.[GLIB]?.intrinsic ?? 0) & TIMEOUT;
        if (target !== hands_obj) {
            await ttyPline(
                `You cover ${yname(target, state)} with a thick layer of grease.`,
                state,
            );
            target.greased = 1;
            if (obj.cursed && !nohands(state.youmonst.data)) {
                make_glib(oldglib + rn1(6, 10), state, env);
                await ttyPline(
                    `Some of the grease gets all over your ${fingers_or_gloves(true, state)}.`,
                    state,
                );
            }
        } else {
            make_glib(oldglib + rn1(11, 5), state, env);
            await ttyPline(
                `You coat your ${fingers_or_gloves(true, state)} with grease.`,
                state,
            );
        }
    } else if (obj.known) {
        await ttyPline(`${Tobjnam(obj, 'are', state)} empty.`, state);
    } else {
        await ttyPline(`${Tobjnam(obj, 'seem', state)} to be empty.`, state);
    }

    update_inventory({ ...env, state });
    return ECMD_TIME;
}

// C ref: apply.c unfixable_trouble_count() (4431-4470). The current potion
// caller passes false, while the is_horn parameter's timed-malady masks are
// preserved as part of the complete helper contract.
export function unfixable_trouble_count(isHorn = false, state = game) {
    const u = state?.u ?? {};
    const prop = (index) => u.uprops?.[index] ?? {};
    const intrinsic = (index) => prop(index).intrinsic ?? 0;
    let count = 0;

    if (intrinsic(STONED)) count++;
    if (intrinsic(SLIMED)) count++;
    if (intrinsic(STRANGLED)) count++;
    if ((u.atemp?.[A_DEX] ?? 0) < 0
        && (intrinsic(WOUNDED_LEGS) || prop(WOUNDED_LEGS).extrinsic)) count++;
    if ((u.atemp?.[A_STR] ?? 0) < 0 && (u.uhs ?? 0) >= WEAK) count++;

    if (intrinsic(SICK)
        && (!isHorn || (intrinsic(SICK) & ~TIMEOUT) !== 0)) count++;
    if (intrinsic(STUNNED)
        && (!isHorn || (intrinsic(STUNNED) & ~TIMEOUT) !== 0)) count++;
    if (intrinsic(CONFUSION)
        && (!isHorn || (intrinsic(CONFUSION) & ~TIMEOUT) !== 0)) count++;

    const hallucination = intrinsic(HALLUC);
    const resistance = prop(HALLUC_RES);
    if (hallucination && !(resistance.intrinsic || resistance.extrinsic)
        && (!isHorn || (hallucination & ~TIMEOUT) !== 0)) count++;

    if (intrinsic(VOMITING)
        && (!isHorn || (intrinsic(VOMITING) & ~TIMEOUT) !== 0)) count++;

    const deafness = prop(DEAF);
    if ((deafness.intrinsic || deafness.extrinsic || u.uroleplay?.deaf)
        && (!isHorn || (deafness.intrinsic & ~TIMEOUT) !== 0)) count++;

    return count;
}
