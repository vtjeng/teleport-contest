// zap.js -- the `z` command, the ray it fires, and the wish prompt.
// C refs: src/zap.c learnwand(), zappable(), zap_ok(), dozap(), zapyourself()
// and makewish(); then the ray, whose own section header below lists it.
//
// dozap() is ported whole, and so is the command around its effect arms: the
// two guards, the object prompt, the charge, the direction prompt, the wand
// that glows and fades when no direction is given, and the worn-out wand that
// crumbles. One of its five effect arms still stops: backfire(). The fifth,
// weffects(), runs, and takes an aimed ray wand as far as the fire damage
// zhitu() does to the hero.
//
// The shop usage fee stops the command earlier than any of them. check_unpaid()
// runs between the object prompt and the charge, and js/shk.js raises
// UnsupportedShopError there for merchandise the hero has not paid for, so a
// zap in a shop ends the segment before an effect arm is chosen at all.
//
// The self-zap arm runs through zapyourself(), whose complete C switch is kept
// below. Calls to helpers that are void in C but still outside the port are
// recorded at their source boundary; the self-zap dispatch itself does not
// reject a valid object type.
//
// wizcmds.c wiz_wish() calls makewish(); potion.c, sit.c and zap.c's own
// wand code reach it too, and none of those callers is ported.
//
// zap.c's elemental destruction of carried and floor-borne objects lives in
// js/zap_destroy_items.js, which the C file separates as its own group of
// functions.

import { artifact_origin } from './artifacts.js';
import {
    ACID_RES,
    A_INT,
    A_STR,
    A_DEX,
    A_CON,
    AC_VALUE,
    ANTIMAGIC,
    ARM,
    A_WIS,
    BLINDED,
    BUFSZ,
    LARGEST_INT,
    MAX_SPELL_STUDY,
    COLD_RES,
    COLNO,
    CORR,
    D_BROKEN,
    DIR_180,
    DIR_ERR,
    D_NODOOR,
    DB_FLOOR,
    DB_ICE,
    DB_UNDER,
    DISINT_RES,
    DISP_BEAM,
    DISP_CHANGE,
    DISP_END,
    DISP_FLASH,
    DISP_TETHER,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FIRE_RES,
    FUMBLING,
    GETOBJ_EXCLUDE,
    GETOBJ_NOFLAGS,
    GETOBJ_SUGGEST,
    HALF_SPDAM,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    HEAD,
    HEADSTONE,
    HWALL,
    ICE,
    INTRINSIC,
    ICED_MOAT,
    ICED_POOL,
    IRONBARS,
    LEFT_HANDED,
    IS_FOUNTAIN,
    IS_OBSTRUCTED,
    IS_ROOM,
    IS_SINK,
    IS_TREE,
    IS_WALL,
    IS_WATERWALL,
    In_mines,
    TEST_MOVE,
    is_hole,
    is_pit,
    DIED,
    DOOR,
    DRAWBRIDGE_UP,
    EXPL_FIERY,
    KILLED_BY_AN,
    LL_ARTIFACT,
    LL_CONDUCT,
    LL_WISH,
    NO_KILLER_PREFIX,
    NO_TRAP_FLAGS,
    TIMEOUT,
    PHYS_EXPL_TYPE,
    POLY_NOFLAGS,
    PLNMSG_ENVELOPED_IN_GAS,
    POOL,
    PIT,
    P_BASIC,
    P_EXPERT,
    P_ISRESTRICTED,
    P_SKILLED,
    P_UNSKILLED,
    Is_airlevel,
    Is_earthlevel,
    Is_rogue_level,
    Is_waterlevel,
    LAVAWALL,
    M_AP_OBJECT,
    M_AP_TYPE,
    M_SEEN_FIRE,
    M_SEEN_MAGR,
    M_SEEN_ELEC,
    M_SEEN_COLD,
    M_SEEN_REFL,
    M_SEEN_SLEEP,
    OBJ_AT,
    OBJ_FLOOR,
    OBJ_INVENT,
    BURIED_TOO,
    CONTAINED_TOO,
    CORPSTAT_FEMALE,
    CORPSTAT_GENDER,
    CORPSTAT_MALE,
    CXN_PFX_THE,
    DEAF,
    MM_FEMALE,
    MM_ADJACENTOK,
    MM_MALE,
    MM_NOCOUNTBIRTH,
    MM_NOMSG,
    MM_NOTAIL,
    MM_NOWAIT,
    NO_MINVENT,
    NON_PM,
    NOTELL,
    G_GENOD,
    has_mcorpsenm,
    REFLECTING,
    ROOM,
    ROWNO,
    SDOOR,
    SCORR,
    SHOCK_RES,
    POISON_RES,
    SHOPBASE,
    SHOP_BARS_COST,
    SHOP_DOOR_COST,
    STONE,
    STOMACH,
    STRAT_WAITMASK,
    TT_INFLOOR,
    TT_LAVA,
    TT_PIT,
    MELT_ICE_AWAY,
    VWALL,
    nothing_happens,
    ONAME_KNOW_ARTI,
    ONAME_WISH,
    SLEEP_RES,
    STONED,
    STUNNED,
    TELEPORT_CONTROL,
    THROWN_TETHERED_WEAPON,
    UNCHANGING,
    DRAIN_RES,
    FAST,
    INVIS,
    THROWN_WEAPON,
    ZAPPED_WAND,
    WAND_BACKFIRE_CHANCE,
    WAND_WREST_CHANCE,
    WEB,
    W_ACCESSORY,
    W_ART,
    W_ARTI,
    W_AMUL,
    W_ARMC,
    W_ARM,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMOR,
    W_ARMS,
    W_ARMU,
    W_BALL,
    W_CHAIN,
    W_RING,
    W_RINGL,
    W_QUIVER,
    W_SWAPWEP,
    W_TOOL,
    W_WEAPONS,
    W_WEP,
    W_NONDIGGABLE,
    XKILL_GIVEMSG,
    XKILL_NOMSG,
    XKILL_NOCORPSE,
    ZAP_POS,
    xdir,
    ydir,
    engulfing_u,
    isok,
    u_at,
    uhim,
    Upolyd,
    NC_SHOW_MSG,
    NC_VIA_WAND_OR_SPELL,
    ANIMATE_SPELL,
} from './const.js';
import { stop_occupation } from './allmain.js';
import { acurr, exercise } from './attrib.js';
import { dirtocoord, getdir, xytodir } from './cmd.js';
import {
    bot,
    cmap_to_glyph,
    glyph_is_invisible,
    glyph_is_monster,
    glyph_at,
    map_glyphinfo,
    map_invisible,
    glyph_is_warning,
    newsym,
    obj_to_glyph,
    tmp_at,
    unmap_invisible,
    unmap_object,
    zapdir_to_glyph,
} from './display.js';
import {
    christen_monst,
    hliquid,
    a_monnam,
    Monnam,
    mon_nam,
    monsterCommonName,
} from './do_name.js';
import { get_mtraits } from './corpstat.js';
import { eaten_stat, vegetarian } from './eat.js';
import { cvt_sdoor_to_door, findit } from './detect.js';
import { adj_pit_checks, fillholetyp, is_moat, watch_dig } from './dig.js';
import { dropx, preflight_dropx } from './do.js';
import { ceiling } from './dungeon.js';
import { done } from './end.js';
import { more_experienced } from './exper.js';
import { getlin } from './windows.js';
import { game } from './gstate.js';
import {
    check_capacity, end_running, in_town, losehp, may_dig, nh_delay_output, nomul,
    test_move,
    set_uinwater,
} from './hack.js';
import {
    lcase, mungspaces, s_suffix, truncateByteString, upstart,
} from './hacklib.js';
import {
    getobj,
    hold_another_object,
    stackobj,
    prepareHoldDropAdmission,
    delete_contents,
    replace_inventory_core,
    update_inventory,
    useupall,
    useup,
    obj_extract_self,
    delobj,
    delobj_core,
    mergedRuntime,
} from './invent.js';
import { get_obj_location } from './light.js';
import { monhp_per_lvl, newmcorpsenm } from './makemon.js';
import {
    makemon_revival,
    makemon_runtime,
    newcham_revival,
    neweshk,
} from './makemon_create.js';
import {
    can_be_hatched,
    completelyburns,
    attacktype_fordmg,
    defended,
    dead_species,
    dmgtype,
    dmgtype_fromattack,
    is_demon,
    hides_under,
    is_whirly,
    mindless,
    is_mplayer,
    is_rider,
    is_vampshifter,
    is_swimmer,
    amphibious,
    breathless,
    monster_resists_element,
    resists_magm,
    resists_blnd,
    resists_blnd_by_arti,
    monstseesu,
    monstunseesu,
    nonliving,
    is_golem,
    carnivorous,
    nohands,
    is_undead,
    sticks,
    type_is_pname,
    unique_corpstat,
} from './mondata.js';
import {
    AD_ACID,
    AD_ANY,
    AD_COLD,
    AD_DGST,
    AD_DISN,
    AD_ELEC,
    AD_FIRE,
    AD_DRST,
    AD_MAGM,
    AD_RBRE,
    AD_SEDU,
    AD_SSEX,
    AD_WRAP,
    AT_ENGL,
    PM_CLAY_GOLEM,
    PM_CROCODILE,
    PM_FLESH_GOLEM,
    PM_GLASS_GOLEM,
    PM_GOLD_GOLEM,
    PM_IRON_GOLEM,
    PM_LEATHER_GOLEM,
    PM_PAPER_GOLEM,
    PM_ROPE_GOLEM,
    PM_SKELETON,
    PM_STONE_GOLEM,
    PM_STRAW_GOLEM,
    PM_WOOD_GOLEM,
    PM_DEATH,
    PM_DOPPELGANGER,
    PM_MONK,
    PM_KNIGHT,
    PM_GREMLIN,
    PM_LONG_WORM,
    G_NOCORPSE,
    G_UNIQ,
    NUMMONS,
    S_EEL,
} from './monsters.js';
import { discover_object, observe_object } from './o_init.js';
import { obj_resists } from './bury.js';
import { del_engr_at, engr_at, make_engr_at } from './engrave.js';
import { random_engraving } from './random_engraving.js';
import {
    carried,
    free_omid,
    free_omonst,
    erosionMatters,
    fixup_oil,
    hasContents,
    is_helmet,
    isDamageable,
    is_flammable,
    isBox,
    isContainer,
    isMetallic,
    isCorrodeable,
    isCrackable,
    is_pick,
    is_rottable,
    isRustprone,
    mkobj,
    mksobj,
    mksobj_at,
    objectType,
    obj_ice_effects,
    recreate_pile_at,
    replace_object,
    remove_object,
    place_object,
    rnd_class,
    set_corpsenm,
    sobj_at,
    splitobj,
    weight,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    CORPSE,
    ROCK_CLASS,
    MEATBALL,
    MEAT_STICK,
    ENORMOUS_MEATBALL,
    MEAT_RING,
    ARMOR_CLASS,
    GEM_CLASS,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_UNCHANGING,
    BOULDER,
    DWARVISH_CLOAK,
    HEAVY_IRON_BALL,
    IMMEDIATE,
    NODIR,
    POTION_CLASS,
    POT_POLYMORPH,
    POT_WATER,
    RING_CLASS,
    ROCK,
    SCROLL_CLASS,
    SPBOOK_CLASS,
    SPE_DIG,
    SPE_FORCE_BOLT,
    SPE_FIREBALL,
    SPE_CONE_OF_COLD,
    SPE_EXTRA_HEALING,
    SPE_FINGER_OF_DEATH,
    SPE_HEALING,
    SPE_KNOCK,
    SPE_MAGIC_MISSILE,
    SPE_DRAIN_LIFE,
    SPE_CANCELLATION,
    SPE_SLOW_MONSTER,
    SPE_WIZARD_LOCK,
    SPE_DETECT_UNSEEN,
    SPE_TURN_UNDEAD,
    SPE_BLANK_PAPER,
    SPE_NOVEL,
    SPE_POLYMORPH,
    SPE_SLEEP,
    SPE_STONE_TO_FLESH,
    TOOL_CLASS,
    WAND_CLASS,
    STATUE,
    FIGURINE,
    WEAPON_CLASS,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_LIGHTNING,
    WAN_LIGHT,
    WAN_MAKE_INVISIBLE,
    WAN_SLOW_MONSTER,
    WAN_SPEED_MONSTER,
    WAN_UNDEAD_TURNING,
    WAN_OPENING,
    WAN_POLYMORPH,
    WAN_WISHING,
    WAN_STRIKING,
    WAN_MAGIC_MISSILE,
    WAN_CANCELLATION,
    WAN_NOTHING,
    WAN_PROBING,
    WAN_COLD,
    WAN_FIRE,
    WAN_LOCKING,
    EXPENSIVE_CAMERA,
    FROST_HORN,
    FIRE_HORN,
    MUMMY_WRAPPING,
    LARGE_BOX,
    TIN,
    WAN_SECRET_DOOR_DETECTION,
    WAN_SLEEP,
    WAN_TELEPORTATION,
    POT_OIL,
    POT_GAIN_ABILITY,
    SCR_MAIL,
    SCR_FIRE,
    SPE_TELEPORT_AWAY,
    MAGIC_LAMP,
    MAGIC_MARKER,
    OIL_LAMP,
    LOW_BOOTS,
    EGG,
    LEASH,
    UNICORN_HORN,
    FLESH,
    PAPER,
    CLOTH,
    LEATHER,
    WOOD,
    BONE,
    IRON,
    METAL,
    COPPER,
    SILVER,
    GOLD,
    PLATINUM,
    MITHRIL,
    GEMSTONE,
    MINERAL,
    GLASS,
    STRANGE_OBJECT,
} from './objects.js';
import {
    The,
    Tobjnam,
    Yname2,
    an,
    aobjnam,
    ansimpleoname,
    bare_artifactname,
    boots_simple_name,
    cloak_simple_name,
    donameFresh,
    corpse_xname,
    distant_name,
    otense,
    gloves_simple_name,
    helm_simple_name,
    killer_xname,
    shield_simple_name,
    shirt_simple_name,
    simpleonames,
    isPoisonable,
    suit_simple_name,
    the_unique_pm,
    vtense,
    yname,
    xnameFresh,
} from './objnam.js';
import { UnsupportedWishError, readobjnam } from './objnam_readobjnam.js';
import { encumber_msg } from './pickup.js';
import { cant_revive } from './read.js';
import { is_quest_artifact } from './questpgr.js';
import { ustatusline } from './insight.js';
import {
    body_part, mbodypart, polyself, polymon, rehumanize, ugolemeffects,
} from './polyself.js';
import { P_SKILL, spell_skilltype } from './startup_skills.js';
import {
    healup, make_blinded, incr_itimeout, speed_up, self_invis_message,
} from './potion.js';
import { d, rn1, rn2, rnd, rne, rnl, rnz } from './rng.js';
import {
    shieldeff_mon,
    monkilled,
    normal_shape,
    replmon,
    restore_cham,
    seemimic,
    healmon,
    maybe_unhide_at,
    m_respond,
    newcham,
    wake_nearto,
    wakeup,
    xkilled,
    set_ustuck,
    unstuck,
} from './mon.js';
import { dmgval } from './weapon.js';
import { expels, u_slow_down } from './mhitu.js';
import { sleep_monst, slept_monst } from './mhitm.js';
import { explode } from './explode.js';
import {
    m_at,
} from './monst.js';
import { mon_reflects, ureflects } from './muse.js';
import { in_rooms } from './rooms.js';
import {
    check_unpaid,
    contained_cost,
    costly_spot,
    inhishop,
    inside_shop,
    shkcatch,
    shop_keeper,
} from './shk.js';
import { Shknam } from './shknam.js';
import { canSpotMonster, messageAt } from './startup_a11y.js';
import { S_digbeam } from './symbols.js';
import { closed_door, dissolve_bars, m_in_air, youHear } from './monmove.js';
import { stairway_at } from './stairs.js';
import { is_ice } from './terrain.js';
import { burnarmor } from './trap_erode_obj.js';
import {
    conjoined_pits, delfloortrap, fill_pit, is_lava, is_pool,
    is_pool_or_lava, maketrap, openholdingtrap, closeholdingtrap,
    openfallingtrap,
    animate_statue,
    reset_utrap, set_utrap, t_at,
} from './trap.js';
import { dotrap, mintrap } from './trap_effects.js';
import { shade_miss } from './uhitm.js';
import { enexto, tele } from './teleport.js';
import {
    block_point, cansee, canseemon, couldsee, does_block,
    recalc_block_point, unblock_point,
} from './vision.js';
import {
    bimanual,
    bypass_obj,
    find_mac,
    set_twoweap,
    setuqwep,
    setuswapwep,
    setuwep,
    setworn,
    wearslot,
    wearmask_to_obj,
    which_armor,
} from './worn.js';
import { remove_worn_item } from './steal.js';
import {
    burn_away_slime, fall_asleep, obj_stop_timers, spot_stop_timers,
    spot_time_left,
} from './timeout.js';
import { ttyNorep, ttyPline, ttyUrgentPline } from './tty_message.js';
import { burn_floor_objects, destroy_items } from './zap_destroy_items.js';
import { create_gas_cloud } from './region.js';
import { ignite_items } from './apply_catch_lit.js';
import {
    hits_bars, m_useup, m_useupall, rnd_hallublast, thitu,
} from './mthrowu.js';
import { note_unported } from './unported.js';
import { livelog_printf } from './pline.js';
import { waterbody_name } from './pager.js';
import { fix_wall_spines } from './mklev.js';
import { picking_at, reset_pick } from './lock.js';

// The wish parser raises every other refusal, so the class lives with it.
export { UnsupportedWishError };

// Thrown where zap.c reaches a wand effect this port has not ported.
export class UnsupportedZapError extends Error {
    constructor(branch) {
        super(`zapping a wand requires ${branch}`);
        this.name = 'UnsupportedZapError';
        this.branch = branch;
    }
}

// C ref: youprop.h:103 Blind, which is either source of blindness minus the
// artifact block that cancels both.
function heroIsBlind(state) {
    const blinded = state.u?.uprops?.[BLINDED];
    return Boolean((blinded?.intrinsic || blinded?.extrinsic)
        && !blinded?.blocked);
}

// C ref: youprop.h Deaf, either an intrinsic property or the role-play
// option. zap_over_floor() uses this to select the water-boiling message.
function heroIsDeaf(state) {
    const property = state.u?.uprops?.[DEAF];
    return Boolean(property?.intrinsic || property?.extrinsic
        || state.u?.uroleplay?.deaf);
}

// C ref: zap.c bhit_done() (4125-4138).  The flight cleanup is a discarded
// light.c call; retain its source boundary for every thrown or tethered exit
// without inventing a transient-light state change.
function noteBhitTransientLightCleanup(weapon, tetheredWeapon) {
    if (weapon === THROWN_WEAPON || tetheredWeapon)
        note_unported('light.c transient_light_cleanup');
}

// symbol_data.js derives these cmap positions from defsym.h; symbols.js
// intentionally exports only the terrain symbols used by public callers.
const S_BOOMLEFT = 80;
const S_BOOMRIGHT = 81;

// C ref: zap.c boomhit() (4148-4236).  This source owner lives in zap.js;
// dothrow.js supplies throwit_mon_hit() and endmultishot() as the production
// callbacks because C's boomerang caller owns those dothrow-side transitions.
// Direct callers get those owners through lazy imports, which avoids adding a
// second static zap.js -> dothrow.js cycle.
export async function boomhit(
    obj, dx, dy, state = game, hitMonster = null, endMultishotOwner = null,
) {
    const counterclockwise = state.u?.uhandedness !== LEFT_HANDED;
    let direction = xytodir(dx, dy);
    let nhits = Math.max(1, (obj.spe ?? 0) + 1);
    state.gb ??= {};
    state.gb.bhitpos = { x: state.u.ux, y: state.u.uy };
    let boom = counterclockwise ? S_BOOMLEFT : S_BOOMRIGHT;

    const boomGlyph = map_glyphinfo(cmap_to_glyph(boom, state), state);
    await tmp_at(DISP_FLASH, boomGlyph, state);
    for (let count = 0; count < 10; count++) {
        direction = (direction + 8) % 8;
        boom = S_BOOMLEFT + S_BOOMRIGHT - boom;
        const turnGlyph = map_glyphinfo(
            cmap_to_glyph(boom, state), state,
        );
        await tmp_at(DISP_CHANGE, turnGlyph, state);
        const stepX = xdir[direction];
        const stepY = ydir[direction];
        state.gb.bhitpos.x += stepX;
        state.gb.bhitpos.y += stepY;
        if (!isok(state.gb.bhitpos.x, state.gb.bhitpos.y, state)) {
            state.gb.bhitpos.x -= stepX;
            state.gb.bhitpos.y -= stepY;
            break;
        }

        const monster = m_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
        if (monster) {
            await m_respond(monster, { state });
            if (nhits-- < 0) {
                await tmp_at(DISP_END, 0, state);
                return monster;
            }
            const callback = hitMonster
                ?? (await import('./dothrow.js')).throwit_mon_hit;
            const caught = await callback(monster, obj, state);
            if (caught || !state.gt?.thrownobj) break;
        }
        const location = state.level.at(state.gb.bhitpos.x, state.gb.bhitpos.y);
        if (!ZAP_POS(location.typ)
            || closed_door(state.gb.bhitpos.x, state.gb.bhitpos.y, state)) {
            state.gb.bhitpos.x -= stepX;
            state.gb.bhitpos.y -= stepY;
            break;
        }
        if (state.gb.bhitpos.x === state.u.ux
            && state.gb.bhitpos.y === state.u.uy) {
            const fumbling = state.u?.uprops?.[FUMBLING];
            if (Boolean(fumbling?.intrinsic || fumbling?.extrinsic)
                || rn2(20) >= acurr(state, A_DEX)) {
                // C discards both return values, but their source-owned
                // effects still occur in this self-hit arm.
                const damage = dmgval(obj, state.youmonst, state);
                await thitu(
                    10 + (obj.spe ?? 0), maybeHalfPhysical(damage, state),
                    obj, 'boomerang', state,
                    { message: ttyPline, losehp, exercise, random: { rnd } },
                );
                const finish = endMultishotOwner
                    ?? (await import('./dothrow.js')).endmultishot;
                await finish(true, state);
                break;
            }
            await tmp_at(DISP_END, 0, state);
            await ttyPline('You skillfully catch the boomerang.', state);
            return state.youmonst;
        }
        await tmp_at(state.gb.bhitpos.x, state.gb.bhitpos.y, state);
        await nh_delay_output(state);
        if (IS_SINK(location.typ)) {
            note_unported('sounds.c Soundeffect');
            if (!heroIsDeaf(state)) await ttyPline('Klonk!', state);
            await wake_nearto(
                state.gb.bhitpos.x, state.gb.bhitpos.y, 20, { state },
            );
            break;
        }
        if (count % 5 !== 0)
            direction = counterclockwise ? (direction + 7) % 8
                : (direction + 1) % 8;
    }
    await tmp_at(DISP_END, 0, state);
    return null;
}

// C ref: zap.c lightdamage() (3024-3056). Scrolls pass ordinary=TRUE, but
// the source changes that to FALSE for scrolls so a gremlin blames the magic
// rather than a wand. The normal humanoid path returns the supplied amount
// without a random draw, exactly as C does.
function maybeHalfPhysical(damage, state) {
    const half = state.u?.uprops?.[HALF_PHDAM];
    return (half?.intrinsic || half?.extrinsic)
        ? Math.trunc((damage + 1) / 2) : damage;
}

export async function lightdamage(scroll, ordinary, amount, state = game) {
    let damage = amount;
    if (damage && state.youmonst?.data?.pmidx === PM_GREMLIN) {
        damage = rnd(damage);
        if (damage > 10) damage = 10 + rnd(damage - 10);
        if (damage > 20) damage = 20;
        await ttyPline(
            `Ow, that light hurts${damage > 2 || state.u.mh <= 5 ? '!' : '.'}`,
            state,
        );
        const how = scroll.oclass === SPBOOK_CLASS
            ? 'spell of light'
            : scroll.oartifact ? bare_artifactname(scroll, state)
                : ansimpleoname(scroll, state);
        const reason = `${ordinary ? 'zapped' : 'blasted'} ${uhim(state)}self with ${how}`;
        await losehp(
            maybeHalfPhysical(damage, state), reason, NO_KILLER_PREFIX, state,
        );
    }
    return damage;
}

export class UnsupportedRevivalError extends Error {
    constructor(branch) {
        super(`reviving a corpse requires ${branch}`);
        this.name = 'UnsupportedRevivalError';
        this.branch = branch;
    }
}

function revivalEnv(rawEnv = {}) {
    const random = rawEnv.random ?? { d, rn1, rn2, rnd, rne, rnz };
    return { ...rawEnv, random, state: rawEnv.state ?? game };
}

// C ref: zap.c montraits() (713-829). Saved-trait restoration is shared by
// statue animation and corpse revival. The shopkeeper extension is rebuilt
// before replmon() so that its room and bill pointers remain value-consistent.
export function montraits(obj, cc, adjacentok = false, rawEnv = {}) {
    const env = revivalEnv(rawEnv);
    const { random, state } = env;
    const saved = get_mtraits(obj, true, state);
    if (!saved) return null;
    if (!saved.data || (saved.mhpmax <= 0 && !is_rider(saved.data)))
        return null;

    const dummy = makemon_revival(
        saved.data,
        cc.x,
        cc.y,
        NO_MINVENT | MM_NOWAIT | MM_NOCOUNTBIRTH | MM_NOTAIL | MM_NOMSG
            | (adjacentok ? MM_ADJACENTOK : 0),
        env,
    );
    const finish = async (resolvedDummy) => {
        if (!resolvedDummy) return null;

        if (resolvedDummy.m_lev < resolvedDummy.data.mlevel) {
            const targetLevel = random.rnd(resolvedDummy.data.mlevel + 1);
            if (targetLevel > resolvedDummy.m_lev) {
                while (resolvedDummy.m_lev < targetLevel) {
                    ++resolvedDummy.m_lev;
                    resolvedDummy.mhpmax += monhp_per_lvl(resolvedDummy, env);
                }
                saved.m_lev = resolvedDummy.m_lev;
            }
        }
        if (resolvedDummy.mhpmax > saved.mhpmax)
            saved.mhpmax = resolvedDummy.mhpmax;
        saved.mhp = saved.mhpmax;

        saved.minvent = resolvedDummy.minvent;
        if (resolvedDummy.m_id) {
            saved.m_id = resolvedDummy.m_id;
            const quest = state.svq?.quest_status;
            if (quest?.leader_is_dead && saved.m_id === quest.leader_m_id)
                quest.leader_is_dead = false;
        }
        for (const field of [
            'mx', 'my', 'mux', 'muy', 'mw', 'wormno', 'misc_worn_check',
            'weapon_check', 'mtrapseen', 'mflee', 'mburied', 'mundetected',
            'mfleetim', 'mlstmv', 'm_ap_type',
        ]) {
            saved[field] = resolvedDummy[field];
        }
        saved.mrevived = true;
        saved.mavenge = false;
        saved.meating = 0;
        saved.mleashed = false;
        saved.mtrapped = false;
        saved.msleeping = false;
        saved.mfrozen = 0;
        saved.mcanmove = true;
        // C clears cancellation for ordinary monsters, but preserves it for
        // seducers when that optional attack is enabled.  This predicate is
        // source state, rather than a blanket revival reset.
        if (!dmgtype(saved.data, AD_SEDU)
            && (!(state.sysopt?.seduce ?? true)
                || !dmgtype(saved.data, AD_SSEX))) {
            saved.mcan = false;
        }
        saved.mcansee = true;
        saved.mblinded = 0;
        saved.mstun = false;
        saved.mconf = false;

        if (saved.isshk) {
            // C neweshk() allocates the dummy's extension, then copies the
            // saved shop record before replmon() updates the room resident
            // and bill pointer. Keep nested coordinate and bill values by
            // value so the corpse's snapshot is not aliased.
            const extension = neweshk(resolvedDummy);
            const savedExtension = saved.mextra?.eshk;
            if (savedExtension)
                Object.assign(extension, structuredClone(savedExtension));
            if (extension.bill_p && extension.bill_p !== -1000)
                extension.bill_p = extension.bill ?? [];
            resolvedDummy.isshk = true;
        }
        replmon(resolvedDummy, saved, state);
        newsym(saved.mx, saved.my, state);
        await restore_cham(saved, state, env);
        return saved;
    };
    return dummy && typeof dummy.then === 'function'
        ? dummy.then(finish) : finish(dummy);
}

// C ref: zap.c revive() (884-1100), for a floor corpse and a non-hero cause.
// That is the complete call shape of do.c revive_corpse() from revive_nasty().
export async function revive(corpse, byHero = false, rawEnv = {}) {
    const env = revivalEnv(rawEnv);
    const { state } = env;
    if (corpse?.otyp !== CORPSE) return null;
    if (byHero || corpse.where !== OBJ_FLOOR) {
        throw new UnsupportedRevivalError(
            'the floor, non-hero revive() call shape',
        );
    }
    if (state.context?.victual?.piece === corpse) {
        throw new UnsupportedRevivalError('eat.c cant_finish_meal()');
    }
    if (corpse.oextra?.omid) {
        throw new UnsupportedRevivalError('active-ghost recorporealization');
    }
    if (corpse.quan > 1 && (corpse.timed || corpse.unpaid || corpse.lamplit)) {
        throw new UnsupportedRevivalError('timed, billed, or lit corpse split');
    }

    const originalType = corpse.corpsenm;
    const originalSpecies = state.mons?.[originalType];
    if (!originalSpecies) return null;
    let coordinate = get_obj_location(corpse, 0, state);
    if (!coordinate?.x) return null;
    corpse.ox = coordinate.x;
    corpse.oy = coordinate.y;

    if (m_at(coordinate.x, coordinate.y, state)) {
        coordinate = enexto(
            coordinate.x,
            coordinate.y,
            originalSpecies,
            env,
        ) ?? coordinate;
    }
    const { x, y } = coordinate;
    if (corpse.norevive
        || (originalSpecies.mlet === S_EEL && !is_pool(x, y, state))) {
        if (cansee(x, y, state)) {
            await ttyPline(
                `${upstart(corpse_xname(corpse, null, CXN_PFX_THE, state))} `
                    + 'twitches feebly.',
                state,
            );
        }
        return null;
    }

    let mmflags = NO_MINVENT | MM_NOWAIT | MM_NOMSG;
    const gender = corpse.spe & CORPSTAT_GENDER;
    if (gender === CORPSTAT_MALE) mmflags |= MM_MALE;
    else if (gender === CORPSTAT_FEMALE) mmflags |= MM_FEMALE;

    const substitution = cant_revive(
        originalType,
        true,
        corpse,
        state,
    );
    let monster = null;
    if (substitution.changed) {
        monster = await makemon_revival(
            state.mons[substitution.mtype], x, y, mmflags, env,
        );
        if (monster) {
            if (corpse.oextra?.omid) free_omid(corpse);
            if (corpse.oextra?.omonst) free_omonst(corpse);
            if (monster.cham === PM_DOPPELGANGER) {
                await newcham_revival(monster, originalSpecies, env);
            }
        }
    } else if (corpse.oextra?.omonst) {
        monster = await montraits(corpse, { x, y }, false, env);
        if (monster?.mtame && !monster.isminion)
            note_unported('dog.c wary_dog');
    } else {
        monster = await makemon_revival(
            originalSpecies,
            x,
            y,
            mmflags | MM_NOCOUNTBIRTH,
            env,
        );
    }
    if (!monster) return null;

    if (monster.mundetected) {
        monster.mundetected = false;
        newsym(monster.mx, monster.my, state);
    }
    if (M_AP_TYPE(monster)) seemimic(monster, state);

    if (corpse.quan > 1)
        corpse = splitobj(corpse, 1, objectGenerationEnv(env));

    if (corpse.oextra?.oname && !unique_corpstat(monster.data)) {
        monster = christen_monst(monster, corpse.oextra.oname, {
            state,
        });
    }
    if (corpse.oeaten)
        monster.mhp = eaten_stat(monster.mhp, corpse, env);
    monster.mrevived = true;

    delobj_core(corpse, true, objectGenerationEnv({
        ...env,
        redraw: (rx, ry) => newsym(rx, ry, state),
    }));
    return monster;
}

// C ref: zap.c learnwand() (122-151), translated whole. Called once a zap's
// effect has been observed, to turn "a wand" into "a wand of sleep" in the
// discoveries and in the pack.
//
// The SPBOOK_CLASS guard is for a cast spell, which reaches zapyourself()
// through a fake spellbook object; skipping it there keeps casting a spell
// from rediscovering a spellbook the hero has forgotten.
//
// makeknown() is hack.h:1530's `discover_object((x), TRUE, TRUE, TRUE)`, whose
// fourth argument is what credits the hero with the discovery through
// exercise(A_WIS, TRUE). Only the arm below reaches it: a wand whose type is
// already discovered takes observe_object() alone, which is the arm the Healer
// takes, because u_init.c ini_inv_use_obj() discovered her wand of sleep as it
// handed the wand over.
export function learnwand(obj, state = game) {
    if (obj.oclass !== SPBOOK_CLASS) {
        /* if type already discovered, treat this item has having been seen
           even if hero is currently blinded (skips redundant makeknown) */
        if (objectType(obj, state).oc_name_known) {
            observe_object(obj, state); /* will usually be dknown already */

        /* otherwise discover it if item itself has been or can be seen */
        } else {
            /* in case it was picked up while blind and then zapped without
               examining inventory after regaining sight (bypassing xname) */
            if (!heroIsBlind(state))
                observe_object(obj, state);
            /* make the discovery iff we know what we're manipulating */
            if (obj.dknown)
                discover_object(obj.otyp, true, true, true, state);
        }
        update_inventory({ state });
    }
}

// C ref: zap.c zappable() (2508-2522), translated whole. Answers whether the
// wand still has a charge to spend and spends it, and its comment records
// that spending is the point: "returns 1 if zap is available, 0 otherwise. it
// removes a charge from the wand if zappable."
//
// The wrest arm is the only one that draws. A wand at zero charges is worth
// one more zap with probability 1 in WAND_WREST_CHANCE, and that last zap
// takes spe to -1, which is what makes dozap()'s tail crumble the wand.
export async function zappable(wand, state = game) {
    if (wand.spe < 0 || (wand.spe === 0 && rn2(WAND_WREST_CHANCE)))
        return 0;
    if (wand.spe === 0)
        await ttyPline(
            'You wrest one last charge from the worn-out wand.', state,
        );
    wand.spe--;
    return 1;
}

// C ref: zap.c zap_ok() (2616-2623), the getobj() callback for the `z`
// command. Every wand is a likely candidate and nothing else is one, so a
// starting hero who carries a single wand sees it alone in the prompt.
export function zap_ok(obj) {
    if (obj && obj.oclass === WAND_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_EXCLUDE;
}

// C ref: zap.c dozap() (2625-2683), the `z` command, translated whole.
//
// One of the five effect arms stops, and it stops after everything C does
// ahead of it has run, so the charge, the prompts and the draws that select
// the arm all happen first:
//
// - backfire() throws the cursed wand up in the hero's face. The rn2 that
//   picks it is inside the condition, so a cursed wand that does not backfire
//   spends the draw and carries on exactly as C does.
// weffects() runs the aimed-zap machinery below it and the empty
// secret-door-detection scan.
//
// The self-zap arm runs the complete zapyourself() switch below. Its returned
// damage is passed through the source losehp() call before the command's
// inventory update, so damaging self-zaps keep C's killer and HP semantics.
//
// check_unpaid() stops the command earlier than any effect arm; the file
// header says what that costs.
export async function dozap(state = game) {
    if (nohands(state.youmonst.data)) {
        await ttyPline(
            "You aren't able to zap anything in your current form.", state,
        );
        return ECMD_OK;
    }
    if (await check_capacity(null, state))
        return ECMD_OK;
    const obj = await getobj('zap', zap_ok, GETOBJ_NOFLAGS, state);
    if (!obj)
        return ECMD_CANCEL;

    check_unpaid(obj, state);

    const need_dir = objectType(obj, state).oc_dir !== NODIR;
    if (!await zappable(obj, state)) {
        await ttyPline(nothing_happens, state);
    } else if (obj.cursed && !rn2(WAND_BACKFIRE_CHANCE)) {
        /* the wand blows up in your face! */
        // backfire() names the wand, rolls d(spe + 2, 6) damage through
        // losehp() and useupall()s the wreckage; exercise(A_STR, FALSE) and
        // the early `return ECMD_TIME` that skips update_inventory() follow
        // it.
        throw new UnsupportedZapError('backfire() for a cursed wand');
    } else if (need_dir && !await getdir(null, state)) {
        if (!heroIsBlind(state))
            await ttyPline(
                `${The(xnameFresh(obj, state), state)} glows and fades.`, state,
            );
        /* make him pay for knowing !NODIR */
    } else if (need_dir && !state.u.dx && !state.u.dy && !state.u.dz) {
        const damage = await zapyourself(obj, true, state);
        if (damage !== 0) {
            const reason = `zapped ${uhim(state)}self with `
                + killer_xname(obj, state);
            await losehp(
                maybeHalfPhysical(damage, state), reason,
                NO_KILLER_PREFIX, state,
            );
        }
    } else {
        /*      Are we having fun yet?
         * weffects -> buzz(obj->otyp) -> zhitm (temple priest) ->
         * attack -> hitum -> known_hitum -> ghod_hitsu ->
         * buzz(AD_ELEC) -> destroy_items(AD_ELEC) ->
         * useup -> obfree -> dealloc_obj -> free(obj)
         */
        // That chain is why C reloads `obj` from gc.current_wand afterwards
        // and tests it for NULL below: weffects() can free the wand. Nothing
        // this port reaches inside weffects() frees it -- the priest whose
        // temple the chain names is behind the monster arm dobuzz() refuses --
        // so the wand below is still the one getobj() answered and C's
        // `obj &&` term has no reachable false case.
        //
        // gc.current_wand is what makes the wand reachable from the bottom of
        // that chain without being passed down it. zhitu():4563 is this port's
        // one reader, telling a wand's "zapped" from a horn's "played" in the
        // killer it builds. muse.c, music.c, priest.c and apply.c are C's
        // other writers, and none of them is ported.
        state.current_wand = obj;
        try {
            await weffects(obj, state);
        } finally {
            // JavaScript's fail-closed boundaries unwind where C's call would
            // complete. Do not let that artificial exit retain the transient
            // attribution pointer.
            state.current_wand = null;
        }
    }
    if (obj.spe < 0) {
        await ttyPline(`${Tobjnam(obj, 'turn', state)} to dust.`, state);
        useupall(obj, { state }); /* calls freeinv() -> update_inventory() */
    } else {
        update_inventory({ state }); /* maybe used a charge */
    }
    return ECMD_TIME;
}

// C ref: youprop.h:36 Sleep_resistance, which is the plain "either source"
// spelling: unlike Blind it has no blocking term.
function heroResistsSleep(state) {
    const resistance = state.u?.uprops?.[SLEEP_RES];
    return Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: zap.c boxlock_invent() (2687-2701).  zap.c's boxlock() result is
// discarded here, so the still-unported lock transition is recorded at its
// source boundary while the inventory refresh remains in source order.
async function boxlock_invent(obj, state = game) {
    let boxing = false;
    for (let item = state.invent; item;) {
        const next = item.nobj;
        if (isBox(item)) {
            boxing = true;
            note_unported('lock.c boxlock');
        }
        item = next;
    }
    if (boxing) update_inventory({ state });
    void obj;
}

// C ref: zap.c release_hold() (578-606).  The swallowed expels(TRUE) arm is
// still outside the port; keep that void call as a named source gap rather
// than invoking expels() with its different FALSE-message contract.
async function release_hold(state = game) {
    const holder = state.u?.ustuck;
    if (!holder) {
        note_unported('zap.c impossible release_hold');
        return;
    }
    const swallowed = Boolean(state.u?.uswallow);
    if (swallowed) {
        const digests = holder.data?.mattk?.some((attack) =>
            attack.aatyp === AT_ENGL && attack.adtyp === AD_DGST);
        if (digests) {
            if (!heroIsBlind(state))
                await ttyPline(`${Monnam(holder, state)} opens its mouth!`, state);
            else
                await ttyPline('You feel a sudden rush of air!', state);
        }
        // C passes `TRUE` here (zap.c:598), while the current expels owner
        // implements only its FALSE-message contract.  The return is void,
        // so preserve the source boundary until that arm is ported.
        note_unported('mhitu.c expels TRUE');
    } else if (sticks(state.youmonst?.data)) {
        set_ustuck(null, state);
        await ttyPline(`You release ${mon_nam(holder, state)}.`, state);
    } else {
        await unstuck(holder, state);
        const from = nohands(holder.data)
            ? `by ${mon_nam(holder, state)}`
            : `from ${s_suffix(mon_nam(holder, state))} grasp`;
        await ttyPline(`You are released ${from}.`, state);
    }
}

// C ref: zap.c probe_objchain() (612-623).  The helper is pure state
// knowledge bookkeeping and is called by the probing self-zap below.
function probe_objchain(head, state = game) {
    for (let item = head; item; item = item.nobj) {
        observe_object(item, state);
        if (isContainer(item) || item.otyp === STATUE) {
            item.lknown = true;
            // lock.c SchroedingersBox is LARGE_BOX with spe==1.
            if (!(item.otyp === LARGE_BOX && item.spe === 1))
                item.cknown = true;
        } else if (item.otyp === TIN) {
            item.known = true;
        }
    }
}

// C ref: zap.c unturn_you() (1225-1234).  unturn_dead() and make_stunned()
// are void calls whose source owners are still outside this span; preserve
// the source messages and record those discarded calls without rejecting the
// otherwise valid undead-turning effect.
async function unturn_you(state = game) {
    note_unported('zap.c unturn_dead');
    if (is_undead(state.youmonst?.data)) {
        const already = Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
        await ttyPline(
            `You feel frightened and ${already ? 'even more ' : ''}stunned.`,
            state,
        );
        note_unported('potion.c make_stunned');
    } else {
        await ttyPline('You shudder in dread.', state);
    }
}

function heroHasProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// C ref: zap.c zapyourself() (2705-3013), the complete effect switch for a
// wand or spell aimed at the hero. The source order, damage rolls, inventory
// destruction and discovery timing are retained for every arm. Helper calls
// that return no value in C but remain outside this port are named explicitly;
// no valid object type is routed through an artificial Unsupported error.
export async function zapyourself(obj, ordinary, state = game) {
    let learn_it = false;
    let damage = 0;
    let orig_dmg = 0;
    const random = { d, rn1, rn2, rnd, rne, rnl, rnz };
    const env = { state, random };

    switch (obj.otyp) {
    case WAN_STRIKING:
    case SPE_FORCE_BOLT:
        learn_it = true;
        if (heroHasProperty(state, ANTIMAGIC)) {
            note_unported('display.c shieldeff');
            await ttyPline('Boing!', state);
            monstseesu(M_SEEN_MAGR, state);
        } else {
            if (ordinary)
                await ttyPline('You bash yourself!', state);
            damage = ordinary ? d(2, 12) : d(1 + obj.spe, 6);
            await exercise(A_STR, false, state);
            monstunseesu(M_SEEN_MAGR, state);
        }
        break;

    case WAN_LIGHTNING:
        learn_it = true;
        orig_dmg = d(12, 6);
        if (!heroHasProperty(state, SHOCK_RES)) {
            await ttyPline('You shock yourself!', state);
            damage = orig_dmg;
            await exercise(A_CON, false, state);
            monstunseesu(M_SEEN_ELEC, state);
        } else {
            note_unported('display.c shieldeff');
            await ttyPline('You zap yourself, but seem unharmed.', state);
            monstseesu(M_SEEN_ELEC, state);
            await ugolemeffects(AD_ELEC, orig_dmg, state);
        }
        await destroy_items(state.youmonst, AD_ELEC, orig_dmg, env);
        await flashburn(rnd(100), true, state);
        break;

    case SPE_FIREBALL:
        await ttyPline('You explode a fireball on top of yourself!', state);
        await explode(
            state.u.ux, state.u.uy, 11, d(6, 6), WAND_CLASS, EXPL_FIERY, state,
        );
        break;

    case WAN_FIRE:
    case FIRE_HORN:
        learn_it = true;
        orig_dmg = d(12, 6);
        if (heroHasProperty(state, FIRE_RES)) {
            note_unported('display.c shieldeff');
            await ttyPline('You feel rather warm.', state);
            monstseesu(M_SEEN_FIRE, state);
            await ugolemeffects(AD_FIRE, orig_dmg, state);
        } else {
            await ttyPline("You've set yourself afire!", state);
            damage = orig_dmg;
            monstunseesu(M_SEEN_FIRE, state);
        }
        burn_away_slime(state);
        await burnarmor(state.youmonst, env);
        await destroy_items(state.youmonst, AD_FIRE, orig_dmg, env);
        await ignite_items(state.invent, env);
        break;

    case WAN_COLD:
    case SPE_CONE_OF_COLD:
    case FROST_HORN:
        learn_it = true;
        orig_dmg = d(12, 6);
        if (heroHasProperty(state, COLD_RES)) {
            note_unported('display.c shieldeff');
            await ttyPline('You feel a little chill.', state);
            monstseesu(M_SEEN_COLD, state);
            await ugolemeffects(AD_COLD, orig_dmg, state);
        } else {
            await ttyPline('You imitate a popsicle!', state);
            damage = orig_dmg;
            monstunseesu(M_SEEN_COLD, state);
        }
        await destroy_items(state.youmonst, AD_COLD, orig_dmg, env);
        break;

    case WAN_MAGIC_MISSILE:
    case SPE_MAGIC_MISSILE:
        learn_it = true;
        if (heroHasProperty(state, ANTIMAGIC)) {
            note_unported('display.c shieldeff');
            await ttyPline('The missiles bounce!', state);
            monstseesu(M_SEEN_MAGR, state);
        } else {
            damage = d(4, 6);
            await ttyPline("Idiot!  You've shot yourself!", state);
            monstunseesu(M_SEEN_MAGR, state);
        }
        break;

    case WAN_POLYMORPH:
    case SPE_POLYMORPH:
        if (!heroHasProperty(state, UNCHANGING)) {
            learn_it = true;
            // zap.c discards polyself()'s return, but its state transition
            // must complete before the switch returns to the command loop.
            await polyself(POLY_NOFLAGS, state);
        }
        break;

    case WAN_CANCELLATION:
    case SPE_CANCELLATION:
        await cancel_monst(state.youmonst, obj, true, true, true, state);
        break;

    case SPE_DRAIN_LIFE:
        if (!heroHasProperty(state, DRAIN_RES)) {
            learn_it = true;
            note_unported('exper.c losexp');
        }
        break;

    case WAN_MAKE_INVISIBLE: {
        state.u.uprops ??= {};
        const property = state.u.uprops[INVIS] ??= {
            intrinsic: 0, extrinsic: 0,
        };
        // C's BInvis is the blocked field (a worn artifact can cancel an
        // intrinsic or extrinsic invisibility source); it is distinct from
        // the extrinsic source itself.
        const msg = !(property.intrinsic || property.extrinsic)
            && !heroIsBlind(state)
            && !property.blocked;
        if (property.blocked && state.uarmc?.otyp === MUMMY_WRAPPING) {
            await ttyPline(
                `You feel rather itchy under ${yname(state.uarmc, state)}.`,
                state,
            );
            break;
        }
        incr_itimeout(property, rn1(15, 31));
        if (msg) {
            learn_it = true;
            newsym(state.u.ux, state.u.uy, state);
            await self_invis_message(state);
        }
        break;
    }

    case WAN_SPEED_MONSTER:
        await speed_up(rn1(25, 50), state);
        learn_it = true;
        break;

    case WAN_SLEEP:
    case SPE_SLEEP:
        learn_it = true;
        if (heroResistsSleep(state)) {
            note_unported('display.c shieldeff');
            await ttyPline("You don't feel sleepy!", state);
            monstseesu(M_SEEN_SLEEP, state);
        } else {
            await ttyPline(
                ordinary ? 'The sleep ray hits you!' : 'You fall asleep!',
                state,
            );
            monstunseesu(M_SEEN_SLEEP, state);
            await fall_asleep(-rnd(50), true, state, {
                message: ttyPline,
                statusRefresh: () => bot(),
            });
        }
        break;

    case WAN_SLOW_MONSTER:
    case SPE_SLOW_MONSTER:
        // C tests HFast & (TIMEOUT | INTRINSIC), so extrinsic speed alone
        // does not make a self-zap learn or invoke u_slow_down().
        if ((state.u?.uprops?.[FAST]?.intrinsic ?? 0) & (TIMEOUT | INTRINSIC)) {
            learn_it = true;
            await u_slow_down(state);
        }
        break;

    case WAN_TELEPORTATION:
    case SPE_TELEPORT_AWAY:
        await tele(state);
        if ((heroHasProperty(state, TELEPORT_CONTROL)
                && !heroHasProperty(state, STUNNED))
            || !couldsee(state.u.ux0, state.u.uy0, state)
            || ((state.u.ux0 - state.u.ux) ** 2
                + (state.u.uy0 - state.u.uy) ** 2) >= 16)
            learn_it = true;
        break;

    case WAN_DEATH:
    case SPE_FINGER_OF_DEATH:
        if (nonliving(state.youmonst?.data)
            || is_demon(state.youmonst?.data)) {
            await ttyPline(
                obj.otyp === WAN_DEATH
                    ? 'The wand shoots an apparently harmless beam at you.'
                    : 'You seem no deader than before.',
                state,
            );
            break;
        }
        learn_it = true;
        state.killer ??= {};
        state.killer.name = `shot ${uhim(state)}self with a death ray`;
        state.killer.format = NO_KILLER_PREFIX;
        await ttyUrgentPline(
            'You irradiate yourself with pure energy!', state,
        );
        await ttyUrgentPline('You die.', state);
        await done(DIED, state);
        break;

    case WAN_UNDEAD_TURNING:
    case SPE_TURN_UNDEAD:
        learn_it = true;
        await unturn_you(state);
        break;

    case SPE_HEALING:
    case SPE_EXTRA_HEALING:
        learn_it = true;
        await healup(d(6, obj.otyp === SPE_EXTRA_HEALING ? 8 : 4), 0, false,
            (obj.blessed || obj.otyp === SPE_EXTRA_HEALING), state);
        await ttyPline(
            `You feel ${obj.otyp === SPE_EXTRA_HEALING ? 'much ' : ''}better.`,
            state,
        );
        break;

    case WAN_LIGHT:
        damage = d(obj.spe, 25);
        // C deliberately falls through from a broken WAN_LIGHT to the camera
        // arm, where a zero damage roll is replaced with five.
        // falls through
    case EXPENSIVE_CAMERA:
        if (!damage) damage = 5;
        damage = await lightdamage(obj, ordinary, damage, state);
        damage += rnd(25);
        if (await flashburn(damage, false, state)) learn_it = true;
        damage = 0;
        break;

    case WAN_OPENING:
    case SPE_KNOCK: {
        if (state.u.ustuck) {
            await release_hold(state);
            learn_it = true;
        }
        if (state.uball) {
            learn_it = true;
            note_unported('read.c unpunish');
        }
        // C evaluates u.utrap before openholdingtrap() can clear it.
        const wasTrapped = Boolean(state.u.utrap);
        const holding = wasTrapped
            ? await openholdingtrap(state.youmonst, state)
            : { result: false, noticed: false };
        if (holding.noticed) learn_it = true;
        if (!wasTrapped || !holding.result) {
            await boxlock_invent(obj, state);
            const falling = await openfallingtrap(
                state.youmonst, true, state,
            );
            if (falling.noticed) learn_it = true;
        }
        break;
    }

    case WAN_LOCKING:
    case SPE_WIZARD_LOCK:
        // Preserve the pre-call C short-circuit; closeholdingtrap() may set
        // u.utrap while it resolves.
        const wasTrapped = Boolean(state.u.utrap);
        const closing = wasTrapped
            ? { result: false, noticed: false }
            : await closeholdingtrap(state.youmonst, state);
        if (closing.noticed) learn_it = true;
        if (wasTrapped || !closing.result)
            await boxlock_invent(obj, state);
        break;

    case WAN_DIGGING:
    case SPE_DIG:
    case SPE_DETECT_UNSEEN:
    case WAN_NOTHING:
        break;

    case WAN_PROBING:
        probe_objchain(state.invent, state);
        update_inventory({ state });
        learn_it = true;
        await ustatusline(state);
        break;

    case SPE_STONE_TO_FLESH: {
        if (state.u.umonnum === PM_STONE_GOLEM) {
            learn_it = true;
            await polymon(PM_FLESH_GOLEM, state);
        }
        if (state.u.uprops?.[STONED]?.intrinsic || state.u.stoned) {
            learn_it = true;
            note_unported('eat.c fix_petrification');
        }
        for (let item = state.invent; item;) {
            const next = item.nobj;
            if (await bhito(item, obj, state, random, env))
                learn_it = true;
            item = next;
        }
        let didmerge;
        const mergeEnv = {
            state,
            hooks: {
                message: ttyPline,
                inventoryComparisonDiscovered: () => ttyPline(
                    'You learn more about your items by comparing them.',
                    state,
                ),
            },
        };
        do {
            didmerge = false;
            for (let item = state.invent; !didmerge && item; item = item.nobj) {
                if (item.owornmask) continue;
                for (let next = item.nobj; next; next = next.nobj) {
                    if (await mergedRuntime(item, next, mergeEnv)) {
                        didmerge = true;
                        break;
                    }
                }
            }
        } while (didmerge);
        break;
    }

    default:
        note_unported('zap.c impossible');
        break;
    }
    if (learn_it) learnwand(obj, state);
    return damage;
}

// C ref: zap.c exclam() (3546-3553). The punctuation that ends a hit message,
// chosen by how hard the blow landed. uhitm.c hmon_hitmon_msg_hit() is the
// caller here. C's comment records that the "?" arm is for a force below zero,
// which a zap can produce and a melee blow cannot.
export function exclam(force) {
    /* force == 0 occurs e.g. with sleep ray */
    /* note that large force is usual with wands so that !! would
            require information about hand/weapon/wand */
    return (force < 0) ? '?' : (force <= 4) ? '.' : '!';
}

// C ref: zap.c hit() (3555-3568). Message when a zap or missile hits a monster.
// `str` is the zap text or missile name, `force` is the exclam() punctuation.
export async function hit(str, mtmp, force, state = game, rawEnv = {}) {
    const verbosely = (mtmp === state.youmonst
        || (state.flags?.verbose
            && (cansee(state.gb.bhitpos.x, state.gb.bhitpos.y, state)
                || canSpotMonster(mtmp, state)
                || (state.u.uswallow && state.u.ustuck === mtmp))));
    const message = rawEnv.message ?? ttyPline;
    await message(
        `${The(str, state)} ${vtense(str, 'hit')} `
        + `${verbosely ? monsterCommonName(mtmp, state, 0, rawEnv) : 'it'}${force}`,
        state,
        rawEnv,
    );
}

// C ref: zap.c miss() (3570-3576). Message when a zap or missile misses.
export async function miss(str, mtmp, state = game, env = {}) {
    const message = env.message ?? ttyPline;
    await message(
        `${The(str, state)} ${vtense(str, 'miss')} `
        + `${((cansee(state.gb.bhitpos.x, state.gb.bhitpos.y, state)
               || canSpotMonster(mtmp, state))
              && state.flags?.verbose)
            ? monsterCommonName(mtmp, state, 0, env) : 'it'}.`,
        state,
        env,
    );
}

// C ref: zap.c resist() (6100-6158). Magic resistance check for a monster.
// Returns true if the monster resisted. When `damage` > 0, deducts it from the
// monster's HP (halved if resisted) and kills the monster if HP drops to zero.
// When `tell` is truthy (TELL = 1), shows a shield effect and "<monster>
// resists!" message; when falsy (NOTELL = 0), silent.
export async function resist(mtmp, oclass, damage, tell, state = game, random = { rn2 }) {
    /* fake players always pass resistance test against Conflict */
    if (oclass === RING_CLASS && !damage && !tell && is_mplayer(mtmp.data))
        return 1;

    /* attack level */
    let alev;
    switch (oclass) {
    case WAND_CLASS: alev = 12; break;
    case TOOL_CLASS: alev = 10; break; /* instrument */
    case WEAPON_CLASS: alev = 10; break; /* artifact */
    case SCROLL_CLASS: alev = 9; break;
    case POTION_CLASS: alev = 6; break;
    case RING_CLASS: alev = 5; break;
    default: alev = state.u.ulevel; break; /* spell */
    }
    /* defense level */
    let dlev = mtmp.m_lev ?? 0;
    if (dlev > 50) dlev = 50;
    else if (dlev < 1) dlev = is_mplayer(mtmp.data) ? state.u.ulevel : 1;

    const resisted = random.rn2(100 + alev - dlev) < (mtmp.data?.mr ?? 0);
    if (resisted) {
        if (tell) {
            await shieldeff_mon(mtmp, { state });
        }
        damage = Math.trunc((damage + 1) / 2);
    }

    if (damage) {
        mtmp.mhp -= damage;
        if (mtmp.mhp < 1) { /* DEADMONSTER */
            // gm.m_using tracks "a monster is using an item", set by muse.c.
            // No ported caller sets it, and the hero-zap path through dobuzz()
            // does not reach it, so the else (killed()) is the reachable arm.
            throw new UnsupportedZapError(
                'resist() killing a monster via damage (m_using / killed path)',
            );
        }
    }
    return resisted ? 1 : 0;
}

// C ref: zap.c spell_damage_bonus() (3480-3505).  The adjustment is pure:
// it reads effective intelligence and level, then clamps the low-intelligence
// penalty so a zero damage roll remains zero and a positive roll remains at
// least one.
export function spell_damage_bonus(damage, state = game) {
    const intelligence = acurr(state, A_INT);
    if (intelligence <= 9) {
        if (damage > 1)
            return damage <= 3 ? 1 : damage - 3;
        return damage;
    }
    if (intelligence <= 13 || (state.u?.ulevel ?? 0) < 5)
        return damage;
    if (intelligence <= 18) return damage + 1;
    if (intelligence <= 24 || (state.u?.ulevel ?? 0) < 14)
        return damage + 2;
    return damage + 3;
}

// C ref: zap.c zhitm() (4238-4398). Damage a bolt does to a monster. The
// caller (dobuzz() monster arm) is responsible for killing the monster when
// damage is fatal. Returns the damage dealt. Sets *ootmp (here returned as
// the second element) to a piece of armor to disintegrate when appropriate.
//
// Every damage branch is kept here because dobuzz() uses zhitm()'s returned
// damage and armor pointer to decide the rest of the monster arm.  Calls whose
// C result is discarded (acid damage and armor erosion) are recorded as
// unported at their exact source boundary below.
export async function zhitm(
    mon,
    type,
    nd,
    state = game,
    random = { d, rn2, rnd },
    rawEnv = {},
) {
    const env = { ...rawEnv, state, random };
    let tmp = 0;
    let otmp = null;
    const damgtype = zaptype(type) % 10;
    let sho_shieldeff = false;
    const spellcaster = type >= 10 && type < 20; /* is_hero_spell(type) */

    switch (damgtype) {
    case ZT_MAGIC_MISSILE:
        if (resists_magm(mon, state) || defended(mon, AD_MAGM, state)) {
            sho_shieldeff = true;
            break;
        }
        tmp = random.d(nd, 6);
        if (spellcaster) tmp = spell_damage_bonus(tmp, state);
        break;
    case ZT_FIRE:
        if (monster_resists_element(mon, FIRE_RES, state)
            || defended(mon, AD_FIRE, state)) {
            sho_shieldeff = true;
            break;
        }
        tmp = random.d(nd, 6);
        if (spellcaster) tmp = spell_damage_bonus(tmp, state);
        /* includes spell bonus but not monster vuln to fire */
        {
            const orig_dmg = tmp;
            if (monster_resists_element(mon, COLD_RES, state))
                tmp += 7;
            if (await burnarmor(mon, { ...env })) {
                if (!random.rn2(3)) {
                    tmp += await destroy_items(mon, AD_FIRE, orig_dmg,
                        { ...env });
                    await ignite_items(mon.minvent, { ...env });
                }
            }
        }
        break;
    case ZT_COLD:
        if (monster_resists_element(mon, COLD_RES, state)
            || defended(mon, AD_COLD, state)) {
            sho_shieldeff = true;
            break;
        }
        tmp = random.d(nd, 6);
        if (spellcaster) tmp = spell_damage_bonus(tmp, state);
        /* includes spell bonus but not monster vuln to cold */
        {
            const orig_dmg = tmp;
            if (monster_resists_element(mon, FIRE_RES, state))
                tmp += random.d(nd, 3);
            if (!random.rn2(3))
                tmp += await destroy_items(mon, AD_COLD, orig_dmg,
                    { ...env });
        }
        break;

    case ZT_SLEEP:
        // C deliberately discards sleep_monst()'s boolean result.  The owner
        // still changes the monster's helpless state and releases a grabber.
        tmp = 0;
        await sleep_monst(mon, random.d(nd, 25),
            type === ZT_SLEEP ? WAND_CLASS : 0,
            { ...env });
        break;

    case ZT_DEATH:
        if (Math.abs(type) !== 20 + ZT_DEATH) {
            if (mon.data === state.mons?.[PM_DEATH]) {
                healmon(mon, Math.trunc((mon.mhpmax ?? mon.mhp) * 3 / 2),
                    Math.trunc((mon.mhpmax ?? mon.mhp) / 2));
                if ((mon.mhpmax ?? 0) >= 1000) mon.mhpmax = 999;
                tmp = 0;
                break;
            }
            if (nonliving(mon.data) || is_demon(mon.data)
                || is_vampshifter(mon) || resists_magm(mon, state)) {
                sho_shieldeff = true;
                break;
            }
            // C sets type=-1 here so the final resist() saving throw is not
            // attempted.  Keep the local value as the source does.
            type = -1;
            // zap.c:4340. An ordinary death ray kills a living, non-resistant
            // monster by applying mhp + 1 after the source type is cleared.
            tmp = mon.mhp + 1;
        } else if (monster_resists_element(mon, DISINT_RES, state)
                   || defended(mon, AD_DISN, state)) {
            sho_shieldeff = true;
        } else if (mon.misc_worn_check & W_ARMS) {
            otmp = which_armor(mon, W_ARMS, state);
        } else if (mon.misc_worn_check & W_ARM) {
            otmp = which_armor(mon, W_ARM, state);
            const cloak = which_armor(mon, W_ARMC, state);
            if (cloak) m_useup(mon, cloak, { ...env });
        } else {
            // MAGIC_COOKIE is the sentinel used by dobuzz() to call
            // disintegrate_mon(), rather than ordinary damage handling.
            tmp = 1000;
            const cloak = which_armor(mon, W_ARMC, state);
            if (cloak) m_useup(mon, cloak, { ...env });
            const shirt = which_armor(mon, W_ARMU, state);
            if (shirt) m_useup(mon, shirt, { ...env });
        }
        type = -1;
        break;

    case ZT_LIGHTNING: {
        tmp = random.d(nd, 6);
        if (spellcaster) tmp = spell_damage_bonus(tmp, state);
        const orig_dmg = tmp;
        if (monster_resists_element(mon, SHOCK_RES, state)
            || defended(mon, AD_ELEC, state)) {
            sho_shieldeff = true;
            tmp = 0;
        }
        if (!resists_blnd(mon, state)
            && !(type > 0 && engulfing_u(mon, state)) && nd > 2) {
            const blindAmount = random.rnd(50);
            mon.mcansee = false;
            mon.mblinded = Math.min(127,
                Math.trunc(mon.mblinded ?? 0) + blindAmount);
        }
        if (!random.rn2(3))
            tmp += await destroy_items(mon, AD_ELEC, orig_dmg,
                { ...env });
        break;
    }

    case ZT_POISON_GAS:
        if (monster_resists_element(mon, POISON_RES, state)
            || defended(mon, AD_DRST, state)) {
            sho_shieldeff = true;
            break;
        }
        tmp = random.d(nd, 6);
        break;

    case ZT_ACID:
        if (monster_resists_element(mon, ACID_RES, state)
            || defended(mon, AD_ACID, state)) {
            sho_shieldeff = true;
            break;
        }
        tmp = random.d(nd, 6);
        if (!random.rn2(6)) note_unported('trap.c acid_damage');
        if (!random.rn2(6)) note_unported('uhitm.c erode_armor');
        break;

    default:
        // zaptype() only yields the eight source damage families above.
        throw new RangeError(`invalid zap damage type ${damgtype}`);
    }

    if (sho_shieldeff) {
        // C's shieldeff() is a visual animation with no resistance message;
        // keep the display.c gap explicit without borrowing shieldeff_mon(),
        // whose separate mon.c owner prints a visible "resists!" line.
        note_unported('display.c shieldeff');
    }
    // is_hero_spell(type) && Role_if(PM_KNIGHT) && u.uhave.questart => 2x.
    // For wand zaps (type 0-9), is_hero_spell is false so this never fires.
    if (type >= 10 && type < 20
        && state.urole?.mnum === PM_KNIGHT
        && state.u?.uhave?.questart)
        tmp *= 2;
    // resist() halves damage for a wand zap (type < ZT_SPELL(0) = 10)
    if (tmp > 0 && type >= 0
        && await resist(mon, type < 10 /* ZT_SPELL(0) */
            ? WAND_CLASS : 0 /* '\0' */, 0, NOTELL, state, random))
        tmp = Math.trunc(tmp / 2);
    if (tmp < 0) tmp = 0; /* don't allow negative damage */
    mon.mhp -= tmp;
    return { damage: tmp, otmp };
}

// C ref: zap.c makewish() (6313-6422). The "help" arm at 6348-6352, the
// MAXWISHTRY retry loop at 6360-6368 and the hands_obj and artifact arms all
// stop instead; the wishes this port grants take the plain readobjnam() and
// hold_another_object() path between them, the Escape at 6346-6347 included.
//
// `tries` is 0 on every pass this port reaches, because the MAXWISHTRY loop
// that raises it starts past the throw. That settles two of the head's tests:
// the `iflags.cmdassist && tries > 0` suffix at 6330 cannot be appended, and
// the third operand of the 6334 test below holds.
export async function makewish(state = game) {
    state.u.uconduct ??= {};
    state.context ??= {};
    // svc.context.resume_wish. allmain.c:200 is its only reader, restarting a
    // wish that a saved game left standing at this prompt; that call site is
    // not ported, so nothing reads the value back yet. It lives here because
    // makewish() is the only writer of it.
    state.context.resume_wish = 0;
    if (state.flags?.verbose)
        await ttyPline('You may wish for an object.', state);

    // `retry:`, the label the MAXWISHTRY loop jumps back to.
    const promptbuf = 'For what do you wish?';

    // 6334's `iflags.menu_requested && wish_history[0] && (tries == 0)` picks
    // the history menu over getlin(). wish_history[] is written only by
    // wish_history_add(), which sits inside `#ifdef DEBUG` at zap.c:6229;
    // include/config.h defines only DEBUG_MIGRATING_MONS and no patch under
    // nethack-c/patches/ defines DEBUG, so wish_history[0] is permanently
    // NULL. The `m` prefix therefore reaches getlin() like every other wish.
    const answer = await getlin(promptbuf, state);

    if (state.iflags?.term_gone) {
        // The terminal is gone, so C abandons the wish and marks it for a
        // restore to resume. win/tty/getline.c:87 raises the flag for the one
        // byte that reads back as EOF, which js/getline.js already models.
        // C guards the assignment with `!iflags.debug_fuzzer`, and that flag
        // is never set here.
        state.context.resume_wish = 1;
        return;
    }

    let buf = mungspaces(answer);
    if (buf[0] === '\x1b') {
        // zap.c:6346-6347 empties the buffer rather than declining the wish,
        // so readobjnam("") falls through readobjnam_preparse()'s empty return
        // to `any:` and is granted wrpsym[rn2(13)].
        buf = '';
    } else if (lcase(buf) === 'help') {
        // 6348-6352 opens wishcmdassist()'s window and asks again.
        throw new UnsupportedWishError('the wish prompt help text', buf);
    }
    /*
     *  Note: if they wished for and got a non-object successfully,
     *  otmp == &hands_obj.  That includes an artifact which has been
     *  denied.  Wishing for "nothing" requires a separate value to remain
     *  distinct.
     */
    // C's bufcpy holds the typed line for wish_history_add(), which is
    // compile-time DEBUG-only here; the three livelog strings are retained in
    // the in-memory chronicle by pline.js.
    // C's `struct obj nothing` is a stack object whose address alone matters.
    const nothing = Object.freeze({});
    // readobjnam()'s typfnd: tail calls mksobj(), which reaches the same
    // generation machinery mklev.c and makemon() do -- mkbox_cnts() for a
    // container is the arm a wish reaches today. The hooks obj.js requires for
    // those arms are the ones every other mksobj() caller assembles, so this
    // wish path assembles them the same way rather than a subset of its own.
    const oldwisharti = Math.trunc(state.u.uconduct.wisharti ?? 0);
    const otmp = readobjnam(buf, nothing, objectGenerationEnv({ state }));
    // readobjnam() answering null -- the MAXWISHTRY retry loop at 6360-6368 --
    // and &hands_obj -- wizterrainwish() at 6374-6377 -- are both refused
    // inside it, so only the two arms below are reachable.
    if (otmp === nothing) {
        /* explicitly wished for "nothing", presumably attempting
           to retain wishless conduct */
        livelog_printf(LL_WISH, 'declined to make a wish', state);
        return;
    }
    // wish_history_add() sits inside `#ifdef DEBUG` at zap.c:6229, and no
    // patch under nethack-c/patches/ defines DEBUG.
    if (otmp.oartifact) {
        /* update artifact bookkeeping; doesn't produce a livelog event */
        artifact_origin(otmp, ONAME_WISH | ONAME_KNOW_ARTI, state);
    }
    // 6387-6388 saves u.uconduct.wisharti from before the wish only to pick
    // one of three livelog strings with it, so nothing outside the livelog
    // file reads it.

    const holdEnv = {
        state,
        hooks: {
            message: ttyPline,
            encumberMessage: encumber_msg,
            // do.c dropz() -> stackobj() -> invent.c merged() reaches
            // mkobj.c obj_extract_self() for the pile member the landing
            // object absorbs, and that member is on the floor.
            extractExternalObject: remove_object,
            // invent.c merged():933-942.  A wished-for object that merges
            // into a stack the hero already carries settles any known,
            // rknown or bknown the two disagreed on, and says so.  Only a
            // random wish reaches this: a named one is spelled the same way
            // twice, so the second copy agrees with the first.
            inventoryComparisonDiscovered: () => ttyPline(
                'You learn more about your items by comparing them.',
                state,
            ),
            newsym,
            preflightDropObject: preflight_dropx,
            dropObject: dropx,
        },
    };
    // The supported drop tail must be admitted before doname() records
    // discovery and before wish conduct changes. The returned token is
    // consumed after addinv() reaches the source drop_it branch.
    const holdDropAdmission = prepareHoldDropAdmission(otmp, holdEnv);

    // 6398 builds a BUFSZ-sized local string before livelog_printf() receives
    // it. Keep that inner truncation separate from pline.c's larger formatted
    // buffer, because the former controls what the chronicle stores here.
    const wish = truncateByteString(
        `"${buf}", got "${donameFresh(otmp, state)}"`,
        BUFSZ - 1,
    );
    const maybeLlArti = oldwisharti < Math.trunc(state.u.uconduct.wisharti ?? 0)
        ? LL_ARTIFACT : 0;
    /* KMH, conduct */
    const firstWish = !state.u.uconduct.wishes;
    state.u.uconduct.wishes++;
    if (firstWish) {
        livelog_printf(
            LL_CONDUCT | LL_WISH | maybeLlArti,
            `made ${state.flags?.female ? 'her' : 'his'} first wish - ${wish}`,
            state,
        );
    } else if (!oldwisharti && state.u.uconduct.wisharti) {
        livelog_printf(
            LL_CONDUCT | LL_WISH | LL_ARTIFACT,
            `made ${state.flags?.female ? 'her' : 'his'} first artifact wish - ${wish}`,
            state,
        );
    } else {
        livelog_printf(
            LL_WISH | maybeLlArti,
            `wished for ${wish}`,
            state,
        );
    }

    // 6405-6420.  readobjnam() refuses a corpse, so otmp->wishedfor is 0 and
    // both tests that read it take their other branch.
    const verb = (Is_airlevel(state.u.uz) || state.u.uinwater)
        ? 'slip' : 'drop';
    const here = state.level.at(state.u.ux, state.u.uy).typ;
    const oops_msg = state.u.uswallow
        ? 'Oops!  %s out of your reach!'
        : (Is_airlevel(state.u.uz) || Is_waterlevel(state.u.uz)
           || here < IRONBARS || here >= ICE)
            ? 'Oops!  %s away from you!'
            : 'Oops!  %s to the floor!';

    /* The(aobjnam()) is safe since otmp is unidentified -dlc */
    await hold_another_object(
        otmp, oops_msg, The(aobjnam(otmp, verb, state), state), null,
        holdEnv,
        holdDropAdmission,
    );
    state.u.ublesscnt += rn1(100, 50); /* the gods take notice */
}

// ── bhit ──
//
// C ref: zap.c bhit() (3827-4139) and skiprange() (3578-3590). The distance
// effect shared by a thrown weapon, a kicked object, an immediate wand, a
// flashed light and an applied mirror: it walks the ray one square at a time,
// draws the transient glyph, and stops at the first monster, wall or closed
// door. C's gb.bhitpos, which it leaves at the final square, is the port's
// `state.gb.bhitpos`, the one JavaScript home for that global; dogmove.c's
// and mon.c's writers use the same name. Every caller reads it after the call
// rather than the return value, which is the monster hit.
//
// The THROWN_WEAPON and ZAPPED_WAND walks are ported here.  The immediate arm
// deliberately has no transient glyph: C's bhit() calls zap_map() and the two
// callbacks on each square before testing whether the ray may continue.
//
// The thrown-weapon walk has several early-stop branches: a shopkeeper
// catching a pick-axe, a lit object lighting the squares it passes, iron bars,
// a rock skipping over water, a mimic disguised as an object, and a heavy iron
// ball's four range limits. The shade branch is different: C's shade_miss()
// at uhitm.c:2013 reads dmgval() for zero or not-zero, and dmgval() rolls the
// damage dice, so the draw is spent before harmless feedback is emitted. The
// async message is awaited before the missile target is cleared, preserving
// the source's output and continuation order.
//
// A monster in the path is not one of them. C's THROWN_WEAPON arm at 4021-4029
// ends the flight, maps an unseen monster and returns it, leaving the caller
// to decide what hits it: dothrow.c throwit() reaches the ported thitmonst()
// through throwit_mon_hit():1492, while dothrow.c throw_gold():2712 reaches
// dokick.c ghitm(), which remains outside this call type.
export class UnsupportedBhitError extends Error {
    constructor(branch) {
        super(`zap.c bhit() reached ${branch}`);
        this.name = 'UnsupportedBhitError';
        this.branch = branch;
    }
}

// The following helpers are the IMMEDIATE-wand object arm from zap.c.  They
// live here (rather than in obj.js) because zap.c owns the polymorph policy;
// obj.js remains the owner of allocation and chain mechanics.

function zapObjectEnv(state, random, rawEnv = {}) {
    return objectGenerationEnv({
        ...rawEnv,
        state,
        random,
        redraw: rawEnv.redraw ?? ((x, y) => newsym(x, y, state)),
    });
}

// C ref: obj.h unpolyable() and zap.c obj_unpolyable() (1678-1683).
// The first four terms are the source macro; obj_resists() is the final
// ordinary/artifact protection check and is evaluated when those terms allow
// execution to reach it.
export function obj_unpolyable(obj, state = game, random = { rn2 }) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('obj_unpolyable requires an object');
    if (obj.otyp === WAN_POLYMORPH
        || obj.otyp === SPE_POLYMORPH
        || obj.otyp === POT_POLYMORPH
        || obj.otyp === AMULET_OF_UNCHANGING
        || obj === state.uball
        || obj === state.uskin)
        return true;
    return obj_resists(obj, 5, 95, { state, random });
}

// C ref: zap.c obj_shudders() (1476-1499).  This is pure apart from the one
// rn2 which chooses whether system shock happens.
export function obj_shudders(obj, state = game, random = { rn2 }) {
    if (state.context?.bypasses && obj.bypass) return false;
    let odds;
    if (obj.oclass === WAND_CLASS || obj.cursed) odds = 3;
    else if (obj.blessed) odds = 12;
    else odds = 8;
    if (obj.quan > 4) odds = Math.trunc(odds / 2);
    return random.rn2(odds) === 0;
}

// C ref: zap.c do_osshock() (1637-1674).  delobj() consumes the final
// object-resistance draw after the system-shock roll, so keep deletion in the
// source order instead of using a direct grid splice.
export function do_osshock(obj, state = game, random = { rn2, rnd }, rawEnv = {}) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('do_osshock requires an object');
    // MAIL_STRUCTURES is enabled by the recorder build.  C never shocks a
    // mail scroll, so this guard must precede the object-zapped flag and all
    // luck/quantity draws.
    if (obj.otyp === SCR_MAIL) return;
    state.go ??= {};
    state.gp ??= {};
    state.go.obj_zapped = true;
    if (state.gp.poly_zapped == null || state.gp.poly_zapped < 0) {
        const luck = Math.trunc(state.u?.uluck ?? 0)
            + Math.trunc(state.u?.moreluck ?? 0);
        for (let count = Math.trunc(obj.quan ?? 0); count; --count) {
            if (!random.rn2(luck + 45)) {
                state.gp.poly_zapped = objectType(obj, state).oc_material;
                break;
            }
        }
    }
    if (obj.quan > 1) {
        const splitQuantity = obj.quan > LARGEST_INT
            ? random.rnd(30000)
            : random.rnd(Math.trunc(obj.quan) - 1);
        obj = splitobj(obj, splitQuantity,
            zapObjectEnv(state, random, rawEnv));
    }
    // do_osshock() is floor-only, but its source still accounts for the
    // square's shop before deleting the shocked object.  Both billing helpers
    // are void calls at this site, so retain their exact source boundaries.
    if (costly_spot(obj.ox, obj.oy, state)) {
        const roomno = in_rooms(obj.ox, obj.oy, SHOPBASE, state)[0] ?? 0;
        const shopkeeper = shop_keeper(roomno, state);
        if (shopkeeper && state.u?.ushops?.[0])
            note_unported('shk.c addtobill');
        else
            note_unported('shk.c stolen_value');
    }
    delobj_core(obj, false, zapObjectEnv(state, random, rawEnv));
}

// C ref: zap.c polyuse() (1505-1544).  The object successor is captured
// before each deletion because delobj() changes both pile chains.
export function polyuse(objhdr, material, minwt, state = game,
    random = { rn2 }, rawEnv = {}) {
    let current = objhdr;
    while (minwt > 0 && current) {
        const next = current.nexthere;
        if (!(state.context?.bypasses && current.bypass)
            && current !== state.uball && current !== state.uchain
            && !obj_resists(current, 0, 0, { state, random })
            && current.otyp !== SCR_MAIL) {
            const sameMaterial = objectType(current, state).oc_material
                === material;
            if (sameMaterial === (random.rn2(minwt + 1) !== 0)) {
                if (costly_spot(current.ox, current.oy, state)) {
                    const roomno = in_rooms(
                        current.ox,
                        current.oy,
                        SHOPBASE,
                        state,
                    )[0] ?? 0;
                    const shopkeeper = shop_keeper(roomno, state);
                    if (shopkeeper && state.u?.ushops?.[0])
                        note_unported('shk.c addtobill');
                    else
                        note_unported('shk.c stolen_value');
                }
                minwt = current.quan < 0x7fffffff
                    ? Math.max(0, minwt - Math.trunc(current.quan)) : 0;
                delobj_core(current, false,
                    zapObjectEnv(state, random, rawEnv));
            }
        }
        current = next;
    }
}

// C ref: zap.c create_polymon() (1546-1634).  The golem-producing arm is a
// rare consequence of a pile's system shock.  The target immediate-wand
// witness does not enter it, but retaining the source selection and calling
// canonical makemon/polyuse keeps the state contract complete when it does.
export async function create_polymon(obj, material, state = game,
    random = { rn2 }, rawEnv = {}) {
    if (state.context?.bypasses) {
        // Bypassed objects form the consecutive prefix of the pile in C.
        // Skip that prefix before deciding whether enough material remains.
        while (obj?.bypass) obj = obj.nexthere;
    }
    if (!obj || (!obj.nexthere && obj.quan === 1)) return;

    const pileHead = obj;
    let pmidx;
    let materialText;
    switch (material) {
    case IRON:
    case METAL:
    case MITHRIL:
        pmidx = PM_IRON_GOLEM;
        materialText = 'metal ';
        break;
    case COPPER:
    case SILVER:
    case PLATINUM:
    case GEMSTONE:
    case MINERAL:
        // zap.c deliberately uses this draw to choose between its two
        // closest stone forms; it is before makemon() and polyuse().
        pmidx = random.rn2(2) ? PM_STONE_GOLEM : PM_CLAY_GOLEM;
        materialText = 'lithic ';
        break;
    case 0: // food has no material, and is treated as flesh
    case FLESH:
        pmidx = PM_FLESH_GOLEM;
        materialText = 'organic ';
        break;
    case WOOD:
        pmidx = PM_WOOD_GOLEM;
        materialText = 'wood ';
        break;
    case LEATHER:
        pmidx = PM_LEATHER_GOLEM;
        materialText = 'leather ';
        break;
    case CLOTH:
        pmidx = PM_ROPE_GOLEM;
        materialText = 'cloth ';
        break;
    case BONE:
        pmidx = PM_SKELETON;
        materialText = 'bony ';
        break;
    case GOLD:
        pmidx = PM_GOLD_GOLEM;
        materialText = 'gold ';
        break;
    case GLASS:
        pmidx = PM_GLASS_GOLEM;
        materialText = 'glassy ';
        break;
    case PAPER:
        pmidx = PM_PAPER_GOLEM;
        materialText = 'paper ';
        break;
    default:
        pmidx = PM_STRAW_GOLEM;
        materialText = '';
        break;
    }
    const species = (state.mvitals?.[pmidx]?.mvflags & G_GENOD)
        ? null : state.mons?.[pmidx] ?? null;
    const env = zapObjectEnv(state, random, rawEnv);
    const monster = makemon_runtime(
        species,
        obj.ox,
        obj.oy,
        MM_NOMSG,
        env,
    );
    const made = monster && typeof monster.then === 'function'
        ? await monster : monster;
    polyuse(pileHead, material,
        state.mons?.[pmidx]?.cwt ?? 0, state, random, rawEnv);
    if (made && cansee(made.mx, made.my, state)) {
        const name = a_monnam(made, { ...rawEnv, state, random });
        await (rawEnv.message ?? ttyPline)(
            `Some ${materialText}objects meld, and ${name} arises from the pile!`,
            state,
            rawEnv,
        );
    }
}

// C ref: zap.c poly_obj() (1702-1989).  Object allocation, chain replacement,
// and deletion remain in their canonical obj/invent owners; this function
// carries zap.c's polymorph-specific choice and field preservation.
export async function poly_obj(obj, id, state = game,
    random = { rn2, rnd }, rawEnv = {}) {
    if (!obj || typeof obj !== 'object')
        throw new TypeError('poly_obj requires an object');
    const env = zapObjectEnv(state, random, rawEnv);
    const oldType = objectType(obj, state);
    const oldLocation = obj.where;
    let replacement;

    // zap.c keeps Sokoban's guilt accounting even though the terrain owner is
    // not part of this span.  Keep the discarded call visible rather than
    // silently changing that source branch.
    if (obj.otyp === BOULDER)
        note_unported('sokoban.c sokoban_guilt');

    if (id === STRANGE_OBJECT) {
        // A degraded unicorn horn has lost its magic status before the
        // source's three-attempt preservation loop reads it.
        const magic = obj.otyp === UNICORN_HORN && obj.obroken
            ? 0 : oldType.oc_magic;
        let tries = 3;
        do {
            if (replacement)
                delobj_core(replacement, false, env);
            replacement = mkobj(obj.oclass, false, env);
        } while (--tries > 0
                 && Boolean(objectType(replacement, state).oc_magic)
                    !== Boolean(magic));
    } else {
        replacement = mksobj(id, false, false, env);
        if ((obj.otyp === CORPSE || obj.otyp === STATUE
             || obj.otyp === FIGURINE)
            && (id === CORPSE || id === STATUE || id === FIGURINE)) {
            set_corpsenm(replacement, obj.corpsenm, env);
        }
    }

    replacement.quan = obj.quan;
    replacement.no_charge = obj.no_charge;
    if (oldLocation === OBJ_INVENT) replacement.invlet = obj.invlet;
    if (obj.otyp === SCR_MAIL) {
        // MAIL_STRUCTURES is enabled in the reference source.  A mail
        // scroll remains mail and carries one message when transformed.
        replacement.otyp = SCR_MAIL;
        replacement.oclass = SCROLL_CLASS;
        replacement.spe = 1;
    }
    if (obj.otyp === EGG && obj.spe) {
        // Eggs laid by the hero may not be converted into arbitrary objects.
        // kill_egg() also removes a hatch timer; no supported immediate-zap
        // path carries one today, so retain the call as a named discarded
        // dependency and reset the same object fields here.
        if (replacement.otyp === EGG)
            note_unported('timeout.c kill_egg');
        else {
            replacement.otyp = EGG;
            replacement.owt = weight(replacement, env);
        }
        replacement.corpsenm = NON_PM;
        replacement.spe = 0;
        let attempts = 100;
        while (attempts-- > 0) {
            const mnum = can_be_hatched(
                random.rn2(NUMMONS),
                env,
            );
            if (mnum !== NON_PM && !dead_species(mnum, true, env)) {
                replacement.spe = 1;
                set_corpsenm(replacement, mnum, env);
                break;
            }
        }
    }
    replacement.recharged = obj.recharged;
    replacement.cursed = obj.cursed;
    replacement.blessed = obj.blessed;
    if (replacement.oclass === WAND_CLASS
        || replacement.oclass === WEAPON_CLASS
        || replacement.oclass === ARMOR_CLASS)
        replacement.spe = obj.spe;

    if (erosionMatters(replacement, state)) {
        if (is_flammable(replacement, state)
            || isRustprone(replacement, state)
            || isCrackable(replacement, state))
            replacement.oeroded = obj.oeroded;
        if (isCorrodeable(replacement, state)
            || is_rottable(replacement, state))
            replacement.oeroded2 = obj.oeroded2;
        if (isDamageable(replacement, state))
            replacement.oerodeproof = obj.oerodeproof;
    }
    if (obj.otrapped && isBox(replacement)) replacement.otrapped = true;
    if (obj.opoisoned && isPoisonable(replacement, state))
        replacement.opoisoned = true;
    if (id === STRANGE_OBJECT && obj.otyp === CORPSE
        && obj.corpsenm === PM_CROCODILE) {
        replacement.otyp = LOW_BOOTS;
        replacement.oclass = ARMOR_CLASS;
        replacement.spe = 0;
        replacement.oeroded = 0;
        replacement.oerodeproof = true;
        replacement.quan = 1;
        replacement.cursed = false;
    }
    if (obj.otyp === LEASH && obj.leashmon) {
        if (replacement.otyp === LEASH) {
            replacement.leashmon = obj.leashmon;
            obj.leashmon = 0;
        } else {
            note_unported('steed.c o_unleash');
        }
    }
    if (hasContents(replacement))
        delete_contents(replacement, env);
    // C's merge decision is made before the class-specific degradation arms,
    // so its rn2(1000) must precede any wand, potion, spellbook, or gem roll.
    if (replacement.quan > 1
        && (!objectType(replacement, state).oc_merge
            || (id === STRANGE_OBJECT && replacement.quan > random.rn2(1000)))) {
        replacement.quan = 1;
    }
    // C keeps this adjustment after object-chain handling.  A magic lamp
    // becomes the best possible oil lamp, while a marker loses one recharge;
    // other tools leave their charge field alone.
    if (replacement.oclass === TOOL_CLASS) {
        if (replacement.otyp === MAGIC_LAMP) {
            replacement.otyp = OIL_LAMP;
            replacement.age = 1500;
        } else if (replacement.otyp === MAGIC_MARKER) {
            replacement.recharged = 1;
        }
    }
    if (replacement.oclass === WAND_CLASS
        && (replacement.otyp === WAN_WISHING
            || replacement.otyp === WAN_POLYMORPH)) {
        do {
            replacement.otyp = rnd_class(WAN_LIGHT, WAN_LIGHTNING, env);
        } while (replacement.otyp === WAN_WISHING
                 || replacement.otyp === WAN_POLYMORPH);
    }
    if (replacement.oclass === WAND_CLASS
        && replacement.recharged < random.rn2(7))
        replacement.recharged++;
    while (replacement.oclass === POTION_CLASS
           && replacement.otyp === POT_POLYMORPH) {
        replacement.otyp = rnd_class(POT_GAIN_ABILITY, POT_WATER, env);
    }
    if (replacement.oclass === POTION_CLASS
        && (replacement.otyp === POT_OIL || obj.otyp === POT_OIL)) {
        fixup_oil(replacement, obj, env);
    }
    while (replacement.oclass === SPBOOK_CLASS
           && replacement.otyp === SPE_POLYMORPH) {
        const firstSpell = state.svb?.bases?.[SPBOOK_CLASS]
            ?? SPE_MAGIC_MISSILE;
        replacement.otyp = rnd_class(firstSpell, SPE_BLANK_PAPER, env);
    }
    if (replacement.oclass === SPBOOK_CLASS
        && replacement.otyp !== SPE_BLANK_PAPER
        && replacement.otyp !== SPE_NOVEL) {
        replacement.spestudied = (obj.spestudied ?? obj.usecount ?? 0) + 1;
        if (replacement.spestudied > MAX_SPELL_STUDY) {
            replacement.otyp = SPE_BLANK_PAPER;
            replacement.spestudied = random.rn2(replacement.spestudied);
        }
    }
    if (replacement.oclass === GEM_CLASS
        && replacement.quan > random.rnd(4)
        && oldType.oc_material === MINERAL
        && objectType(replacement, state).oc_material !== MINERAL) {
        replacement.otyp = ROCK;
        replacement.quan = Math.trunc(replacement.quan / 2);
    }
    replacement.owt = weight(replacement, env);

    // C resolves the object's physical location and worn bits before the
    // chain swap.  Both values remain meaningful after replace_object() has
    // detached the old node, so keep the source order here.
    const location = get_obj_location(
        obj,
        BURIED_TOO | CONTAINED_TOO,
        state,
    );
    const ox = location?.x ?? 0;
    const oy = location?.y ?? 0;
    const oldWornMask = (obj.owornmask ?? 0) & ~(W_ART | W_ARTI);
    replace_object(obj, replacement, env);

    if (oldLocation === OBJ_INVENT) {
        // C keeps the in-place chain swap, then runs the inventory cores in
        // source order. addinv_core2 can wait for an Archeologist's label, so
        // consume its completion before changing worn slots below.
        await replace_inventory_core(obj, replacement, env);
        if (oldWornMask) {
            const wasTwoHanded = bimanual(obj, state);
            const wasTwoweap = Boolean(state.u?.twoweap);
            const newWornMask = (oldWornMask & W_WEAPONS)
                ? oldWornMask
                : wearslot(replacement, state) & oldWornMask;
            // steal.c remove_worn_item() is a void dependency. Its supported
            // ring/weapon arms are wired here; unsupported accessory arms stay
            // an explicit discarded-call boundary until that source owner is
            // ported, rather than being replaced with invented effects.
            const removable = !(oldWornMask
                & (W_ARMOR | W_AMUL | W_TOOL | W_BALL | W_CHAIN | W_QUIVER));
            if (removable) {
                remove_worn_item(obj, true, state);
            } else {
                note_unported('steal.c remove_worn_item');
            }
            // C keeps this tail after remove_worn_item(), even when that
            // discarded void helper is not yet ported for an accessory.
            if (newWornMask & W_WEP) {
                if (wasTwoHanded || !bimanual(replacement, state)
                    || !state.uarms)
                    setuwep(replacement, env);
                if (wasTwoweap && state.uwep
                    && !bimanual(state.uwep, state))
                    set_twoweap(true, state);
            } else if (newWornMask & W_SWAPWEP) {
                if (wasTwoHanded || !bimanual(replacement, state))
                    setuswapwep(replacement, env);
                if (wasTwoweap && state.uswapwep)
                    set_twoweap(true, state);
            } else if (newWornMask & W_QUIVER) {
                setuqwep(replacement, env);
            } else if (newWornMask) {
                setworn(replacement, newWornMask, env);
                // C's set_wear() return is discarded. The existing JS
                // set_wear() is the startup-wide callback and has a
                // different signature, so retain this call-site gap.
                note_unported('do_wear.c set_wear');
                replacement = wearmask_to_obj(newWornMask, state);
            }
        }
    } else if (oldLocation === OBJ_FLOOR && location) {
        if (obj.otyp === BOULDER && replacement.otyp !== BOULDER) {
            if (!does_block(ox, oy, state.level?.at(ox, oy), state))
                unblock_point(ox, oy, state);
        } else if (obj.otyp !== BOULDER && replacement.otyp === BOULDER) {
            // fracture_rock() is void and remains outside this source span;
            // preserve its source call as a named gap after the liquid test.
            if (is_pool_or_lava(ox, oy, state))
                note_unported('zap.c fracture_rock');
            if (does_block(ox, oy, state.level?.at(ox, oy), state))
                block_point(ox, oy, state);
        }
    }

    // The billing expression is intentionally after replacement and before
    // delobj(), just as C uses the replacement's carried status and the old
    // object's no_charge/unpaid fields. The two angry-shopkeeper helpers
    // remain discarded gaps; their source messages are ported here.
    if (((replacement && !carried(replacement)) || obj.unpaid)
        && costly_spot(ox, oy, state)) {
        const roomno = in_rooms(ox, oy, SHOPBASE, state)[0] ?? 0;
        const shopkeeper = shop_keeper(roomno, state);
        const billable = !obj.no_charge
            || (hasContents(obj) && shopkeeper
                && contained_cost(obj, shopkeeper, 0, false, false, state) !== 0);
        if (billable
            && inhishop(shopkeeper, state)) {
            const namingEnv = { ...env, state, random };
            if (shopkeeper.mpeaceful) {
                const heroRoom = in_rooms(
                    state.u?.ux,
                    state.u?.uy,
                    0,
                    state,
                )[0] ?? 0;
                const keeperRoom = in_rooms(
                    shopkeeper.mx,
                    shopkeeper.my,
                    0,
                    state,
                )[0] ?? 0;
                if (state.u?.ushops?.[0]
                    && heroRoom === keeperRoom
                    && !costly_spot(state.u.ux, state.u.uy, state)) {
                    note_unported('shk.c make_angry_shk');
                } else {
                    await (env.message ?? ttyPline)(
                        `${Shknam(shopkeeper, state, namingEnv)} gets angry!`,
                        state,
                        env,
                    );
                    note_unported('shk.c hot_pursuit');
                }
            } else {
                await (env.norepMessage ?? ttyNorep)(
                    `${Shknam(shopkeeper, state, namingEnv)} is furious!`,
                    state,
                    env,
                );
            }
        }
    }
    delobj_core(obj, false, env);
    return replacement;
}

// C ref: zap.c stone_to_flesh_obj() (1993-2111).  This is the value-returning
// callback used by bhito(); it handles both ordinary mineral replacement and
// statue/figurine revival before reporting whether the object was affected.
export async function stone_to_flesh_obj(obj, state = game,
    random = { d, rn1, rn2, rnd, rne, rnl, rnz }, rawEnv = {}) {
    const message = rawEnv.message ?? ttyPline;
    const norepMessage = rawEnv.norepMessage ?? ttyNorep;
    const env = zapObjectEnv(state, random, {
        ...rawEnv,
        message,
        norepMessage,
        hooks: {
            updateInventory: () => update_inventory({ state }),
            ...(rawEnv.hooks ?? {}),
        },
    });
    const type = objectType(obj, state);
    if (type.oc_material !== MINERAL && type.oc_material !== GEMSTONE)
        return 0;
    if (obj_resists(obj, 2, 98, { state, random })) return 0;

    const location = get_obj_location(obj, 0, state);
    const ox = location?.x ?? 0;
    const oy = location?.y ?? 0;
    let target = obj;
    let result = 1;
    let smell = false;
    let golemXform = false;
    let monster = null;
    let originalSpecies = state.mons?.[obj.corpsenm] ?? null;

    switch (type.oc_class) {
    case ROCK_CLASS:
    case TOOL_CLASS:
        if (obj.otyp === BOULDER) {
            target = await poly_obj(obj, ENORMOUS_MEATBALL,
                state, random, rawEnv);
            smell = true;
        } else if (obj.otyp === STATUE || obj.otyp === FIGURINE) {
            if (is_golem(originalSpecies)) {
                golemXform = originalSpecies
                    !== state.mons?.[PM_FLESH_GOLEM];
            } else if (vegetarian(originalSpecies)) {
                // Vegetarian statues become meat instead of animating.
                target = await poly_obj(obj, MEATBALL,
                    state, random, rawEnv);
                smell = true;
                break;
            }

            if (obj.otyp === STATUE) {
                // animate_statue owns saved traits, contents, and deletion.
                monster = await animate_statue(
                    obj, ox, oy, ANIMATE_SPELL,
                    { ...env, state, random },
                );
            } else {
                // C updates ptr before creation, so a failed golem
                // animation tests the replacement species' corpse flags.
                if (golemXform)
                    originalSpecies = state.mons?.[PM_FLESH_GOLEM];
                monster = await makemon_runtime(
                    originalSpecies,
                    ox,
                    oy,
                    NO_MINVENT | MM_NOMSG,
                    { ...env, _stoneFleshFigurine: true },
                );
                if (monster) {
                    if (costly_spot(ox, oy, state)
                        && (carried(obj) ? obj.unpaid : !obj.no_charge)) {
                        note_unported('shk.c stolen_value');
                    }
                    if (obj.timed) obj_stop_timers(obj, state, env);
                    if (carried(obj)) useup(obj, env);
                    else delobj(obj, env);
                    if (cansee(monster.mx, monster.my, state)) {
                        await ttyPline(
                            `The figurine ${golemXform
                                ? 'turns to flesh and ' : ''}animates!`,
                            state,
                        );
                    }
                }
            }

            if (monster) {
                if (is_golem(monster.data)
                    && monster.data !== state.mons?.[PM_FLESH_GOLEM]) {
                    await newcham(
                        monster,
                        state.mons?.[PM_FLESH_GOLEM],
                        { ...env, state, random, ncflags: NC_VIA_WAND_OR_SPELL },
                    );
                }
            } else if (originalSpecies?.geno
                && (originalSpecies.geno & (G_NOCORPSE | G_UNIQ))) {
                result = 0;
            } else {
                // C drops statue contents before changing the statue to a
                // corpse, and bypasses those contents for this same spell.
                while (target.cobj) {
                    const item = target.cobj;
                    bypass_obj(item, state);
                    obj_extract_self(item, env);
                    place_object(item, ox, oy, env);
                }
                target = await poly_obj(target, CORPSE,
                    state, random, rawEnv);
            }
        } else {
            result = 0;
        }
        break;
    case RING_CLASS:
        target = await poly_obj(obj, MEAT_RING, state, random, rawEnv);
        smell = true;
        break;
    case WAND_CLASS:
        target = await poly_obj(obj, MEAT_STICK, state, random, rawEnv);
        smell = true;
        break;
    case GEM_CLASS:
        target = await poly_obj(obj, MEATBALL, state, random, rawEnv);
        smell = true;
        break;
    case WEAPON_CLASS:
    default:
        result = 0;
        break;
    }

    // The local target is deliberately retained even after poly_obj() or
    // useup() changes the object chain, matching C's nhUse(obj) lifetime
    // marker without exposing a stale pointer to a caller.
    void target;
    if (smell) {
        const nonMeatEater = state.urole?.mnum === PM_MONK
            || !state.u?.uconduct?.unvegetarian
            || !carnivorous(state.youmonst?.data);
        await norepMessage(
            nonMeatEater
                ? 'You smell the odor of meat.'
                : 'You smell a delicious smell.',
            state,
            env,
        );
    }
    newsym(ox, oy, state);
    return result;
}

// C ref: zap.c bhito() (2118-2426), the WAN_POLYMORPH arm.  Other object
// effects remain owned by their own zap.c spans and retain their established
// fail-closed boundaries when reached by this callback.
export async function bhito(obj, wand, state = game,
    random = { rn2, rnd }, rawEnv = {}) {
    if (obj === wand) return 0;
    if (obj?.bypass) {
        if (state.context?.bypasses) return 0;
        // C's defensive stray-bit arm prints only a debug line. The recorder
        // has no debug channel, so retain its clearing transition without
        // inventing user-visible output.
        obj.bypass = false;
    }
    // bhitpile() adds this result to its hit count. Its only production
    // caller here admits the implemented polymorph callback; unsupported
    // immediate effects stop at weffects() before reaching this callback.
    if (obj === state.uball || obj === state.u?.uball) return 0;
    if (obj === state.uchain || obj === state.u?.uchain) {
        if (wand.otyp === WAN_OPENING || wand.otyp === SPE_KNOCK) {
            note_unported('read.c unpunish');
            learnwand(wand, state);
        }
        return 0;
    }
    // zap.c permits Stone to Flesh to reach inventory objects as well as
    // floor objects; its return value is consumed by bhitpile(), so this
    // branch must precede the polymorph-only unpolyable guard.
    if (wand.otyp === SPE_STONE_TO_FLESH)
        return await stone_to_flesh_obj(obj, state, random, rawEnv);
    if (obj_unpolyable(obj, state, random)) return 0;

    state.u ??= {};
    state.u.uconduct ??= {};
    const firstPolypile = !(state.u.uconduct.polypiles ?? 0);
    state.u.uconduct.polypiles = (state.u.uconduct.polypiles ?? 0) + 1;
    if (firstPolypile) {
        livelog_printf(
            LL_CONDUCT,
            `polymorphed ${state.flags?.female ? 'her' : 'his'} first object`,
            state,
        );
    }
    if (isBox(obj)) note_unported('lock.c boxlock');

    let learn_it = false;
    if (obj_shudders(obj, state, random)) {
        // C's bhito() records this intent before do_osshock(), but calls
        // learnwand() only after that effect has consumed its own rolls.
        // Keeping the flag here preserves the object-resistance/deletion
        // order when discovery exercises Wisdom.
        learn_it = cansee(obj.ox, obj.oy, state);
        const cover = obj === state.level?.objects?.[state.u?.ux]?.[state.u?.uy]
            && state.u?.uundetected
            && hides_under(state.youmonst?.data);
        do_osshock(obj, state, random, rawEnv);
        // C calls hideunder(&youmonst) here for a discarded result.  The
        // canonical monster helper deliberately has an explicit hero gap, so
        // retain that boundary rather than invoking its throwing adapter.
        if (cover) note_unported('mon.c hideunder');
    } else {
        const replacement = await poly_obj(
            obj,
            STRANGE_OBJECT,
            state,
            random,
            rawEnv,
        );
        if (replacement)
            newsym(replacement.ox, replacement.oy, state);
    }
    if (learn_it) learnwand(wand, state);
    return 1;
}

// C ref: zap.c bhitm() (160-610).  The immediate polymorph callback uses the
// same monster selector as mon.c and awaits its result because newcham may
// prompt or run floor effects.  The other wand callbacks remain explicit
// source boundaries until their own effect families land.
export async function bhitm(monster, wand, state = game,
    random = { rn2, rnd }, rawEnv = {}) {
    // bhit() consumes the callback's return value while walking the ray. Its
    // production caller admits only the implemented polymorph callback;
    // unsupported immediate effects stop at weffects() first.
    state.gn ??= {};
    const hit = state.gb?.bhitpos ?? { x: monster.mx, y: monster.my };
    state.gn.notonhead = monster.mx !== hit.x || monster.my !== hit.y;
    let learn_it = false;
    // A long worm which this same zap just changed into must not be hit again
    // when its tail is traversed later in the ray.
    if (monster.data === state.mons?.[PM_LONG_WORM]
        && has_mcorpsenm(monster)) {
        // C leaves the common wake/reveal/learn tail in place even for this
        // no-op guard; there is simply no effect to learn.
    } else if (resists_magm(monster, state)) {
        await shieldeff_mon(monster, { state });
    } else if (await resist(
        monster,
        wand.oclass ?? WAND_CLASS,
        0,
        NOTELL,
        state,
        random,
    )) {
        // A resisted zap still wakes the defender below, as in C.
    } else {
        const give_msg = !Hallucination(state)
            && (canseemon(monster, state) || engulfing_u(monster, state));
        // C marks inventory objects bypassed before changing the monster. The
        // bypass context is consumed by the shared polymorph cleanup owner.
        for (let object = monster.minvent; object; object = object.nobj)
            bypass_obj(object, state);

        if (monster.cham === NON_PM && !random.rn2(25)) {
            if (canseemon(monster, state)) {
                await (rawEnv.message ?? ttyPline)(
                    `${Monnam(monster, state, rawEnv)} shudders!`,
                    state,
                    rawEnv,
                );
                learn_it = true;
            }
            await xkilled(
                monster,
                XKILL_GIVEMSG | XKILL_NOCORPSE,
                state,
                rawEnv,
            );
        } else {
            const ncflags = NC_VIA_WAND_OR_SPELL
                | (give_msg ? NC_SHOW_MSG : 0);
            let changed = await newcham(monster, null, {
                ...rawEnv, state, random, ncflags,
            });
            if (!changed && Number.isInteger(monster.cham)
                && monster.cham !== NON_PM) {
                changed = await newcham(
                    monster,
                    state.mons[monster.cham],
                    { ...rawEnv, state, random, ncflags },
                );
            }
            if (changed && give_msg
                && (canSpotMonster(monster, state)
                    || engulfing_u(monster, state)))
                learn_it = true;
        }

        // Do this even when polymorph failed: otherwise forcing a long worm
        // form would be retried when the same zap traverses its new tail.
        if (monster.mhp >= 1
            && monster.data === state.mons?.[PM_LONG_WORM]) {
            if (!has_mcorpsenm(monster)) newmcorpsenm(monster);
            monster.mextra.mcorpsenm = PM_LONG_WORM;
            state.context ??= {};
            state.context.bypasses = true;
        }
    }
    if (monster.mhp >= 1) {
        await wakeup(monster, !mindless(monster.data), {
            ...rawEnv, state, random,
        });
        await m_respond(monster, { ...rawEnv, state, random });
    }
    if (learn_it) learnwand(wand, state);
    return 0;
}

// C ref: zap.c bhitpile() (2428-2537).  Every floor callback receives the
// object successor captured before the callback can replace or delete it.
export async function bhitpile(wand, tx, ty, state = game,
    random = { rn2, rnd }, rawEnv = {}, zz = 0) {
    let object = state.level?.objects?.[tx]?.[ty] ?? null;
    if (!object) return 0;
    const hidingunder = zz !== 0
        && state.u?.uundetected
        && hides_under(state.youmonst?.data);
    let first = true;
    state.gp ??= {};
    state.gp.poly_zapped = -1;
    let hitanything = 0;
    while (object) {
        const next = object.nexthere;
        if (hidingunder) {
            if (first) {
                first = false;
                if (zz > 0) {
                    object = next;
                    continue;
                }
            } else if (zz < 0) {
                object = next;
                continue;
            }
        }
        if (object.where === OBJ_FLOOR && object.ox === tx && object.oy === ty)
            hitanything += await bhito(object, wand, state, random, rawEnv);
        object = next;
    }
    if (state.gp.poly_zapped >= 0) {
        await create_polymon(
            state.level.objects?.[tx]?.[ty],
            state.gp.poly_zapped,
            state,
            random,
            rawEnv,
        );
    }
    let previous = state.level.objects?.[tx]?.[ty] ?? null;
    let previousType = BOULDER;
    while (previous) {
        if (previous.otyp === BOULDER && previousType !== BOULDER) {
            recreate_pile_at(tx, ty, zapObjectEnv(state, random, rawEnv));
            break;
        }
        previousType = previous.otyp;
        previous = previous.nexthere;
    }
    if (hidingunder) maybe_unhide_at(tx, ty, state, rawEnv);
    fill_pit(tx, ty, state);
    return hitanything;
}

// C ref: zap.c zap_map() (3625-3825).  A downward polymorph changes a
// non-headstone engraving before the ray reaches the square's objects. The
// lateral arm is intentionally empty; all other terrain effects remain at
// their source boundaries until their own zap spans are ported.
export function zap_map(x, y, wand, state = game, random = { rn2 },
    rawEnv = {}) {
    if (wand?.otyp !== WAN_POLYMORPH && wand?.otyp !== SPE_POLYMORPH)
        return undefined;
    if ((state.u?.dz ?? 0) <= 0) return undefined;
    const engraving = engr_at(x, y, state);
    if (!engraving || engraving.engr_type === HEADSTONE)
        return undefined;
    del_engr_at(x, y, state);
    const replacement = random_engraving({ ...rawEnv, state, random });
    make_engr_at(
        x,
        y,
        replacement.text,
        replacement.pristine,
        state.moves ?? 0,
        0,
        { ...rawEnv, state, random },
    );
    return undefined;
}

// C ref: zap.c skiprange() (3578-3590). Picks the range window over which a
// thrown rock may skip. Its rnd() draws are part of the stream whether or not
// any water lies ahead, so the caller runs it for every thrown rock.
export function skiprange(range, random = { rnd }) {
    const tr = Math.trunc(range / 4);
    const tmp = range - (tr > 0 ? random.rnd(tr) : 0);
    let skipend = tmp - Math.trunc(tmp / 4) * random.rnd(3);
    if (skipend >= tmp) skipend = tmp - 1;
    return { skipstart: tmp, skipend };
}

export async function bhit(
    ddx,
    ddy,
    range,
    weapon,
    fhitm,
    fhito,
    pobj,
    state = game,
    random = { rn2, rnd },
    rawEnv = {},
) {
    let obj = pobj.obj;
    let allow_skip = false;
    let skiprange_start = 0;
    let skiprange_end = 0;
    let in_skip = false;
    let skipcount = 0;

    const tetheredWeapon = weapon === THROWN_TETHERED_WEAPON && Boolean(obj);
    const zapped = weapon === ZAPPED_WAND;
    // zap.c remembers whether this flight entered with an auto-returning
    // missile so a web or another early stop can cancel that return before
    // throwit() handles the landing tail.
    const wasReturning = state.iflags?.returning_missile === obj ? obj : null;
    if (weapon !== THROWN_WEAPON && !tetheredWeapon && !zapped) {
        throw new UnsupportedBhitError(`call type ${weapon}`);
    }
    if ((weapon === THROWN_WEAPON || tetheredWeapon) && (fhitm || fhito)) {
        // Only ZAPPED_WAND supplies either callback; C passes null for a
        // thrown weapon at dothrow.c:1665-1666.
        throw new UnsupportedBhitError('an object or monster callback');
    }
    state.gb ??= {};
    state.gb.bhitpos = { x: state.u.ux, y: state.u.uy };

    if (!zapped && obj && obj.otyp === ROCK) {
        ({ skipstart: skiprange_start, skipend: skiprange_end } =
            skiprange(range, random));
        allow_skip = random.rn2(3) === 0;
    }

    if (tetheredWeapon) {
        // display.c owns this transient frame; throwit() closes it after bhit
        // returns because C leaves tethered flights open at their boundary.
        await tmp_at(DISP_TETHER, obj_to_glyph(obj, state), state);
    }
    else if (!zapped)
        await tmp_at(DISP_FLASH, obj_to_glyph(obj, state), state);
    let point_blank = true;

    while (range-- > 0) {
        state.gb.bhitpos.x += ddx;
        state.gb.bhitpos.y += ddy;
        const x = state.gb.bhitpos.x;
        const y = state.gb.bhitpos.y;

        if (!isok(x, y)) {
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }

        if (is_pick(obj, state) && inside_shop(x, y, state)) {
            const caught = await shkcatch(obj, x, y, state, rawEnv);
            if (caught) {
                await tmp_at(DISP_END, 0, state);
                noteBhitTransientLightCleanup(weapon, tetheredWeapon);
                return caught;
            }
        }

        let typ = state.level.at(x, y).typ;

        /* WATER aka "wall of water" stops items */
        if (!zapped && (IS_WATERWALL(typ) || typ === LAVAWALL)) break;

        if (!zapped && obj.lamplit && !heroIsBlind(state))
            // zap.c discards show_transient_light()'s void result. Keep the
            // flight running when that display owner is still unported.
            note_unported('display.c show_transient_light');
        if (!zapped && typ === IRONBARS
            && hits_bars(pobj, x - ddx, y - ddy, x, y,
                         point_blank ? 0 : !random.rn2(5) ? 1 : 0, 1,
                         state, random)) {
            /* caveat: obj might now be null... */
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }

        if (zapped) {
            zap_map(x, y, obj, state, random, rawEnv);
            typ = state.level.at(x, y).typ;
        }

        let mtmp = m_at(x, y, state);
        const ttmp = t_at(x, y, state);
        if (!zapped && !mtmp && ttmp && ttmp.ttyp === WEB
            && random.rn2(3) === 0) {
            if (cansee(x, y, state)) {
                await ttyPline(
                    `${Yname2(obj, state)} gets stuck in a web!`,
                    state,
                );
                ttmp.tseen = true;
                newsym(x, y);
            }
            if (wasReturning) state.iflags.returning_missile = null;
            break;
        }

        /*
         * skipping rocks
         *
         * skiprange_start is only set if this is a thrown rock
         */
        if (!zapped && skiprange_start && range === skiprange_start && allow_skip) {
            if (is_pool(x, y, state) && !mtmp) {
                in_skip = true;
                if (!heroIsBlind(state)) {
                    await ttyPline(
                        `${Yname2(obj, state)} ${otense(obj, 'skip')}`
                            + `${skipcount ? ' again' : ''}.`, state,
                    );
                } else {
                    const heard = youHear(`${yname(obj, state)} skip.`, state);
                    if (heard) await ttyPline(heard, state);
                }
                skipcount++;
            } else if (skiprange_start > skiprange_end + 1) {
                --skiprange_start;
            }
        }
        if (in_skip) {
            if (range <= skiprange_end) {
                in_skip = false;
                if (range > 3) {
                    ({ skipstart: skiprange_start, skipend: skiprange_end } =
                        skiprange(range, random));
                }
            } else if (mtmp && (mtmp.data?.mlet === S_EEL
                || is_swimmer(mtmp.data)
                || amphibious(mtmp.data)
                || breathless(mtmp.data))) {
                if (!heroIsBlind(state) && canSpotMonster(mtmp, state)) {
                    await ttyPline(
                        `${Yname2(obj, state)} ${otense(obj, 'pass')} over `
                            + `${mon_nam(mtmp, state)}.`, state,
                    );
                }
                mtmp = null;
            }
        }

        /* if mtmp is a shade and missile passes harmlessly through it,
           give message and skip it in order to keep going;
           ...
           thrown objects don't hit mimics pretending to be objects (both
           because the hero is likely aiming to throw over what seems to
           be an object rather than at it, and for balance because
           otherwise mimics are too easy to identify by throwing gold at
           them); exception: if the hero knows there is a monster there,
           they will be aiming at the monster */
        // zap.c:3983-3992, the guard that can clear mtmp and let the missile
        // fly past a monster standing in its path. Its FLASHED_LIGHT disjunct
        // belongs to a call type the head of this function refuses, so only
        // the THROWN_WEAPON half is here.
        //
        // shade_miss() answers false for every defender that is not a shade.
        // C assigns mtmp = 0 when a shade cannot be hurt, letting the missile
        // continue; its false answer still costs a dmgval() roll for a shade
        // that the missile can hurt, which is why it is called rather than
        // skipped.
        if (!zapped && mtmp) {
            const passedShade = await shade_miss(
                state.youmonst, mtmp, obj, true, true, state,
            );
            if (passedShade) mtmp = null;
            const xyglyph = glyph_at(x, y, state);
            if (mtmp && M_AP_TYPE(mtmp) === M_AP_OBJECT
                && !glyph_is_monster(xyglyph)
                && !glyph_is_warning(xyglyph)
                && !glyph_is_invisible(xyglyph))
                mtmp = null;
        }

        if (mtmp) {
            /* THROWN_WEAPON, KICKED_WEAPON */
            // zap.c:3994-3995 and 4021-4029. Tethered weapons retain their
            // tether animation until throwit() owns the final cleanup.
            if (zapped) {
                if (fhitm && await fhitm(mtmp, obj, state, random, rawEnv))
                    return mtmp;
                range -= 3;
            } else {
                state.gn ??= {};
                state.gn.notonhead = x !== mtmp.mx || y !== mtmp.my;
                if (!tetheredWeapon) await tmp_at(DISP_END, 0, state);
                if (cansee(x, y, state) && !canSpotMonster(mtmp, state))
                    map_invisible(x, y, state);
                noteBhitTransientLightCleanup(weapon, tetheredWeapon);
                return mtmp;
            }
        }

        if (fhito && await bhitpile(obj, x, y, state, random, rawEnv))
            range--;

        if (!ZAP_POS(typ) || closed_door(x, y, state)) {
            state.gb.bhitpos.x -= ddx;
            state.gb.bhitpos.y -= ddy;
            break;
        }
        /* 'I' present but no monster: erase; do this before tmp_at() */
        if (!zapped && glyph_is_invisible(state.level.at(x, y).remembered_glyph?.glyph)
            && cansee(x, y, state)) {
            unmap_object(x, y, state);
            newsym(x, y);
        }
        if (!zapped) {
            await tmp_at(x, y, state);
            await nh_delay_output(state);
        }
        if (!zapped && IS_SINK(typ))
            break; /* physical objects fall onto sink */

        /* limit range of ball so hero won't make an invalid move */
        if (!zapped && range > 0 && obj.otyp === HEAVY_IRON_BALL) {
            const boulder = sobj_at(BOULDER, x, y, state);
            if (boulder) {
                if (cansee(x, y, state)) {
                    await ttyPline(
                        `${The(distant_name(obj, xnameFresh, state), state)} `
                            + `hits ${an(xnameFresh(boulder, state), state)}.`,
                        state,
                    );
                }
                range = 0;
            } else if (obj === state.uball) {
                // hack.c test_move() owns the source's doorway, boulder and
                // Sokoban admission checks. Its boolean decides whether the
                // ball's flight is stopped at this square.
                const mayContinue = await test_move(
                    x - ddx, y - ddy, ddx, ddy, TEST_MOVE, state, rawEnv,
                );
                if (!mayContinue) {
                    if (cansee(x, y, state)) {
                        await ttyPline(
                            `${The(distant_name(obj, xnameFresh, state), state)} `
                                + 'jerks to an abrupt halt.', state,
                        );
                    }
                    range = 0;
                } else if (state.level?.flags?.sokoban_rules
                    && ttmp && (is_pit(ttmp.ttyp) || is_hole(ttmp.ttyp))) {
                    range = 0;
                }
            }
        }

        /* thrown/kicked missile has moved away from its starting spot */
        point_blank = false; /* affects passing through iron bars */
    }

    if ((!zapped && !tetheredWeapon)
        || (wasReturning
            && wasReturning !== state.iflags?.returning_missile))
        await tmp_at(DISP_END, 0, state);
    noteBhitTransientLightCleanup(weapon, tetheredWeapon);
    //
    // The return value is the monster the missile hit. Reaching the tail means
    // the flight ended on terrain or on its own range instead, so it is null.
    return null;
}

// ── The ray ──
//
// C refs: zap.c weffects() (3430-3476), ubuzz() (4758-4762), dobuzz()
// (4779-5037), zhitu() (4400-4591), zap_over_floor() (5140-5497),
// bounce_dir() (4663-4701), zap_hit() (4704-4720), zaptype() (88-96),
// flash_types[] (71-85), flash_str() (6428-6445), adtyp_to_prop() (5653-5674),
// u_adtyp_resistance_obj() (5675-5698) and inventory_resistance_check()
// (5709-5718).
//
// This is the aimed-ray half of the file: the hero points a wand of magic
// missile, fire, cold, sleep, death or lightning in a direction and dobuzz()
// walks the bolt one square at a time until its range runs out. bhit() above
// is the sibling traversal for an IMMEDIATE wand and shares none of it.
//
// The whole of it is entered from one place, weffects()'s ubuzz() arm, so
// `type` is always a hero wand zap, 0..9. Three things C computes follow from
// that and are written here as constants rather than tests:
//
// - `fireball` is `type == ZT_SPELL(ZT_FIRE)`, which is 11, so it is false.
//   Its four consequences -- the skipped zap_over_floor(), the `break` on a
//   monster, the explode-before-the-obstacle arm and explode() itself -- are
//   all absent below rather than refused.
// - `spell_type` is `is_hero_spell(type) ? SPE_MAGIC_MISSILE + damgtype : 0`,
//   and is_hero_spell() needs 10..19, so it is 0. zap_hit() takes that 0 and
//   never reaches spell_hit_bonus().
// - `gas_hit` is `damgtype == ZT_POISON_GAS`, which is 6. BZ_OFS_WAN() answers
//   0..5 for the six ray wands (objects.h:1488 orders them so), so it is
//   false and the deferred second zap_over_floor() at 5021-5022 never runs.
//
// Only zhitu()'s ZT_FIRE arm is ported; the other six damage types stop by
// name. The killer-and-losehp() tail below them is ported too, and the doc
// comment on zhitu() itself records what of it still refuses.

// C ref: zap.c:45-57. ZT_<element> is the damage type minus one, and the three
// ZT_ macros shift it into the wand, spell and breath bands.
const ZT_MAGIC_MISSILE = 0;
const ZT_FIRE = 1;
const ZT_COLD = 2;
const ZT_SLEEP = 3;
const ZT_DEATH = 4;
const ZT_LIGHTNING = 5;
const ZT_POISON_GAS = 6;
const ZT_ACID = 7;

// C ref: zap.c flash_types[] (71-85). "A positive index means zapped/cast/
// breathed by hero. A negative index means zapped/cast/breathed by a monster,
// with value index fixup beyond abs() needed for wand zaps." Wands are 0-9,
// spell equivalents 10-19 and dragon-breath equivalents 20-29; the empty
// strings are the unassigned slots in each band.
const flash_types = Object.freeze([
    'magic missile', /* Wands must be 0-9 */
    'bolt of fire', 'bolt of cold', 'sleep ray', 'death ray',
    'bolt of lightning', '', '', '', '',

    'magic missile', /* Spell equivalents must be 10-19 */
    'fireball', 'cone of cold', 'sleep ray', 'finger of death',
    'bolt of lightning', /* there is no spell, used for retribution */
    '', '', '', '',

    'blast of missiles', /* Dragon breath equivalents 20-29*/
    'blast of fire', 'blast of frost', 'blast of sleep gas',
    'blast of disintegration', 'blast of lightning',
    'blast of poison gas', 'blast of acid', '', '',
]);

// C ref: zap.c zaptype() (88-96), "convert monster zap/spell/breath value to
// hero zap/spell/breath value". A monster's wand zap is -39..-30 rather than
// -9..-0 because -0 is ambiguous, so it is shifted before the abs().
export function zaptype(type) {
    if (type <= -30 && -39 <= type) /* monster wand zap */
        type += 30; /* first convert -39..-30 to -9..0 so that abs()
                     * will yield 0..9 (hero wand zap) for it */
    return Math.abs(type);
}

// C ref: youprop.h:120 Hallucination, over :116-119. The property is an
// intrinsic timeout alone, and either source of Halluc_resistance suppresses
// it.
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: youprop.h:28 Fire_resistance and :381 Reflecting, both the plain
// "either source" spelling. Fire_resistance is exported because
// js/zap_destroy_items.js maybe_destroy_item() reads it too, at zap.c:5834.
export function Fire_resistance(state) {
    const property = state.u?.uprops?.[FIRE_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:32 Cold_resistance = (HCold_resistance || ECold_resistance).
// Exported because peffect_oil() in js/potion.js reads it.
export function Cold_resistance(state) {
    const property = state.u?.uprops?.[COLD_RES];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

function Reflecting(state) {
    const property = state.u?.uprops?.[REFLECTING];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: youprop.h:293-295 Half_spell_damage, another "either source"
// spelling. Only an artifact carrying SPFX_HSPDAM confers it, and no ported
// path puts one in a hero's hand, so the halving it gates at zap.c:4586 has
// yet to fire in a running game.
function Half_spell_damage(state) {
    const property = state.u?.uprops?.[HALF_SPDAM];
    return Boolean(property?.intrinsic || property?.extrinsic);
}

// C ref: zap.c flash_str() (6428-6445). "Fills buf with the appropriate string
// for this ray. In the hallucination case, insert 'blast of <silly thing>'."
//
// `nohallu` suppresses hallucination for a death reason, so the killer a
// player reads afterwards names the bolt that killed them. The hallucinating
// arm needs rnd_hallublast(), which draws, so it stops; dobuzz() stops on the
// same property one call earlier.
export function flash_str(typ, nohallu, state = game, random = { rn2 }) {
    typ = zaptype(typ);
    if (!nohallu && Hallucination(state)) {
        return `blast of ${rnd_hallublast(random)}`;
    }
    return flash_types[typ];
}

// C ref: zap.c adtyp_to_prop() (5653-5674). The resistance property that
// answers a damage type, or 0 for a type no property covers.
export function adtyp_to_prop(dmgtyp) {
    switch (dmgtyp) {
    case AD_COLD: return COLD_RES;
    case AD_FIRE: return FIRE_RES;
    case AD_ELEC: return SHOCK_RES;
    case AD_ACID: return ACID_RES;
    case AD_DISN: return DISINT_RES;
    // C's switch holds these five rows and nothing else. Every other damage
    // type falls to `default: break;` and the `return 0` below it, which
    // zap.c:5670's own comment explains: prop_types start at 1, so 0 is the
    // no-property answer u_adtyp_resistance_obj() tests for.
    default: return 0;
    }
}

// C ref: zap.c u_adtyp_resistance_obj() (5675-5698). How well the hero's own
// equipment protects the pack from a damage type, as a percentage. C's own
// comment: "FIXME? these percentages (99 and 90) seem too high..."
//
// The 99% arm needs an extrinsic from armor, an accessory, the wielded weapon
// or an artifact; the 90% arm needs a worn dwarvish cloak against heat or
// cold. A starting hero has neither, which is why the ray's first burnarmor()
// spends no draw on inventory_resistance_check().
export function u_adtyp_resistance_obj(dmgtyp, state = game) {
    const prop = adtyp_to_prop(dmgtyp);
    if (!prop) return 0;

    /* items that give an extrinsic resistance when worn or wielded or
       carried give 99% protection to your items */
    if ((Math.trunc(state.u?.uprops?.[prop]?.extrinsic ?? 0)
         & (W_ARMOR | W_ACCESSORY | W_WEP | W_ART)) !== 0)
        return 99;

    /* worn dwarvish cloaks give 90% protection against heat and cold to
       carried items */
    if (state.uarmc && state.uarmc.otyp === DWARVISH_CLOAK
        && (dmgtyp === AD_COLD || dmgtyp === AD_FIRE))
        return 90;

    return 0;
}

// C ref: zap.c inventory_resistance_check() (5709-5718). "Rolls to see whether
// an object in inventory resists damage from the given damage type, due to an
// equipped item protecting it." No protection means no roll, which is what
// keeps an unprotected hero's erosion draw-free.
export function inventory_resistance_check(
    dmgtyp,
    state = game,
    random = { rn2 },
) {
    const prob = u_adtyp_resistance_obj(dmgtyp, state);
    if (!prob) return false;
    return random.rn2(100) < prob;
}

// C ref: zap.c item_what() (5722-5762).  This wizard-only formatter names the
// equipment that protects inventory from an element.  The source deliberately
// chooses category-specific simple names, reports both rings together, and
// clips the final name to forty bytes before adding the possessive prefix.
export function item_what(dmgtyp, state = game) {
    if (!state.wizard) return '';
    const prop = adtyp_to_prop(dmgtyp);
    const extrinsic = Math.trunc(state.u?.uprops?.[prop]?.extrinsic ?? 0);
    if (!prop || !extrinsic) return '';

    let what;
    if (extrinsic & W_ARMC) what = cloak_simple_name(state.uarmc, state);
    else if (extrinsic & W_ARM) what = suit_simple_name(state.uarm, state);
    else if (extrinsic & W_ARMU) what = shirt_simple_name(state.uarmu, state);
    else if (extrinsic & W_ARMH) what = helm_simple_name(state.uarmh, state);
    else if (extrinsic & W_ARMG) what = gloves_simple_name(state.uarmg, state);
    else if (extrinsic & W_ARMF) what = boots_simple_name(state.uarmf, state);
    else if (extrinsic & W_ARMS) what = shield_simple_name(state.uarms, state);
    else if (extrinsic & (W_AMUL | W_TOOL)) {
        what = simpleonames(
            (extrinsic & W_AMUL) ? state.uamul : state.ublindf,
            state,
        );
    } else if (extrinsic & W_RING) {
        what = (extrinsic & W_RING) === W_RING
            ? 'rings'
            : simpleonames(
                (extrinsic & W_RINGL) ? state.uleft : state.uright,
                state,
            );
    } else if (extrinsic & W_WEP) {
        what = simpleonames(state.uwep, state);
    }
    return what ? ` by your ${truncateByteString(what, 40)}` : '';
}

// C ref: zap.c bounce_dir() (4663-4701). "which direction a ray bounces.
// current location is sx,sy, direction is ddx, ddy. bounceback is 1/n chance
// of bouncing back. caller must ensure sx,sy is a bouncing location: !ZAP_POS
// or closed_door".
//
// C writes the new direction back through two pointers; this returns it.
//
// A ray travelling along a row or a column takes the first arm on `!*ddx ||
// !*ddy` before the bounceback roll is reached, so it always reverses and
// never draws. That is why a horizontal zap's log carries no bounce roll and
// why no horizontal zap can exercise the 10/20/75 selector dobuzz() picks
// `bounceback` from.
// C's `*ddx = -(*ddx)` on an int 0 is 0; JavaScript's unary minus answers -0.
// No branch this port takes can tell the two apart: `-0 === 0` holds, `-0` is
// falsy exactly as `0` is, and so zapdir_to_glyph()'s `dx ? 1 : 0`,
// dobuzz()'s `dx === 0 && dy === 0` and the `!ddx || !ddy` test below all
// answer the same either way. js/zap.js's own `xytodir(-dx, -dy)` passes -0
// for a horizontal bolt and resolves correctly.
//
// What separates them is identity: Object.is and assert.deepStrictEqual. This
// keeps a delta the same value C's int holds, so an assertion or a future
// serialization comparing by identity stays meaningful. It fixes no branch.
function negate(delta) {
    return 0 - delta;
}

export function bounce_dir(
    sx, sy, ddx, ddy, bounceback, state = game, random = { rn2 },
) {
    if (!ddx || !ddy || (bounceback > 0 && !random.rn2(bounceback))) {
        return { dx: negate(ddx), dy: negate(ddy) };
    }
    let rmn;
    let bounce = 0;
    const lsy = sy - ddy;
    const lsx = sx - ddx;

    if (isok(sx, lsy) && ZAP_POS(rmn = state.level.at(sx, lsy).typ)
        && !closed_door(sx, lsy, state)
        && (IS_ROOM(rmn) || (isok(sx + ddx, lsy)
                             && ZAP_POS(state.level.at(sx + ddx, lsy).typ))))
        bounce = 1;
    if (isok(lsx, sy) && ZAP_POS(rmn = state.level.at(lsx, sy).typ)
        && !closed_door(lsx, sy, state)
        && (IS_ROOM(rmn) || (isok(lsx, sy + ddy)
                             && ZAP_POS(state.level.at(lsx, sy + ddy).typ))))
        if (!bounce || random.rn2(2))
            bounce = 2;
    switch (bounce) {
    case 0:
        ddx = negate(ddx);
        /* FALLTHRU */
    case 1:
        ddy = negate(ddy);
        break;
    case 2:
        ddx = negate(ddx);
        break;
    default:
        break;
    }
    return { dx: ddx, dy: ddy };
}

// C ref: zap.c zap_hit() (4704-4720). "will zap/spell/breath attack score a
// hit against armor class `ac'?"
//
// `type` is a hero-cast spell type or 0; every ported caller passes 0, because
// dobuzz()'s `spell_type` is 0 for a wand. The rn2(20) precedes the
// spell_hit_bonus() the refusal stands in for, exactly as C evaluates them.
// C ref: zap.c spell_hit_bonus() (3508-3539). `skill` is the spell object
// type used by zap_hit(); spell_skilltype() and P_SKILL() are the shared
// startup skill owners, so the bonus follows the current hero's skill state.
export function spell_hit_bonus(skill, state = game) {
    let hitBonus = 0;
    switch (P_SKILL(spell_skilltype(skill, state), state)) {
    case P_ISRESTRICTED:
    case P_UNSKILLED:
        hitBonus = -4;
        break;
    case P_BASIC:
        break;
    case P_SKILLED:
        hitBonus = 2;
        break;
    case P_EXPERT:
        hitBonus = 3;
        break;
    default:
        break;
    }
    const dexterity = acurr(state, A_DEX);
    if (dexterity < 4) hitBonus -= 3;
    else if (dexterity < 6) hitBonus -= 2;
    else if (dexterity < 8) hitBonus -= 1;
    else if (dexterity >= 14) hitBonus += dexterity - 14;
    return hitBonus;
}

export function zap_hit(ac, type, random = { rn2, rnd }, state = game) {
    const chance = random.rn2(20);
    const spell_bonus = type ? spell_hit_bonus(type, state) : 0;

    /* small chance for naked target to avoid being hit */
    if (!chance)
        return random.rnd(10) < ac + spell_bonus;

    /* very high armor protection does not achieve invulnerability */
    ac = AC_VALUE(ac, random);

    return (3 - chance < ac + spell_bonus);
}

// C ref: zap.c zhitu() (4561-4589), the braced block that turns the bolt into
// the two arguments losehp() reads at 4588: the killer string and the damage.
//
// It stands apart from zhitu() because nothing observes svk.killer until end.c
// done() names the death by it, and done() is unported. No screen, cursor or
// random-number call moves with the string, so a fresh differential cannot
// tell a right killer from a wrong one and the test that pins it is the only
// proof it is correct.
export function zhituLosehpArguments(type, abstyp, dam, fltxt, state = game) {
    const otmp = state.current_wand;
    /* fire horn and frost horn get handled as wands by caller */
    const verb = (abstyp < 10) /* wand */
        ? ((otmp && otmp.oclass === TOOL_CLASS) ? 'played' : 'zapped')
        : (abstyp < 20) ? 'cast'
            : (abstyp < 30) ? 'exhaled'
                : 'imagined'; /* should never happen */

    let kbuf;
    if (type < 0 || (type === 0 && state.gb?.buzzer)) {
        // C ref: mcastu.c death_inflicted_by() (358-382) and hacklib.c
        // strsubst(). The monster that fired the bolt names the killer.
        const buzzer = state.gb?.buzzer;
        if (buzzer) {
            // Simplified death_inflicted_by: use the buzzer's species name
            // with "a/an" for ordinary monsters, "the" for unique ones, and
            // the bare name for proper-name monsters.
            const mptr = buzzer.data;
            const name = mptr?.pmnames?.[2] ?? mptr?.pmnames?.[0]
                ?? 'something';
            let monName;
            if (the_unique_pm(mptr)) {
                monName = `the ${name}`;
            } else if (type_is_pname(mptr)) {
                monName = name;
            } else {
                monName = an(name);
            }
            kbuf = `${fltxt} ${verb} by ${monName}`;
        } else {
            kbuf = fltxt;
        }
    } else {
        /* FIXME: "zapped by herself" is suitable for a rebound;
           "zapped at herself" would be better if player explicitly
           targeted hero */
        kbuf = `${fltxt} ${verb} by ${uhim(state)}self`;
    }
    /* Half_spell_damage protection yields half-damage for wands & spells,
       including hero's own ricochets; breath attacks do full damage */
    if (dam && Half_spell_damage(state) && abstyp < 20)
        dam = Math.trunc((dam + 1) / 2);
    return { dam, kbuf };
}

// C ref: zap.c zhitu() (4400-4591), the damage a bolt does to the hero, and
// the only caller of burnarmor() this port reaches.
//
// The ZT_FIRE arm (4421-4439) is ported whole, including both !rn2(3) guards:
// the first hands the pack to zap.c destroy_items() and the second to
// apply.c ignite_items(). So is the tail below it, through the
// losehp(dam, kbuf, KILLED_BY_AN) at 4588 that kills the hero this bolt was
// aimed back at.
//
// `dam` and `orig_dam` are separate in C because a fire-resistant hero takes
// no damage but still has the full roll fed to ugolemeffects() and to
// destroy_items(). Only the else at 4428-4431 is ported, where the two are
// equal.
async function zhitu(type, nd, fltxt, sx, sy, state, random, rawEnv = {}) {
    // The monster-turn preflight reaches hero damage on a planning clone.  In
    // C burnarmor(), destroy_items() and ignite_items() all receive the same
    // live call context; forwarding it here keeps their messages and display
    // seams on the clone instead of writing into the live terminal (or
    // consuming its input while a planned message waits for --More--).
    const env = { ...rawEnv, state, random };
    let dam = 0;
    const abstyp = zaptype(type);
    let orig_dam = 0;

    // sx and sy are read by shieldeff() alone, and every arm that calls it
    // refuses above the call.
    void sx;
    void sy;

    switch (abstyp % 10) {
    case ZT_FIRE:
        orig_dam = random.d(nd, 6);
        if (Fire_resistance(state)) {
            // shieldeff() is a tmp_at() animation, monstseesu() the ledger of
            // what monsters noticed the hero shrug off, and ugolemeffects()
            // the iron golem that heals on fire. None is ported and no ported
            // hero resists fire.
            throw new UnsupportedZapError(
                "zhitu()'s fire-resistant hero, over ugolemeffects()",
            );
        }
        dam = orig_dam;
        monstunseesu(M_SEEN_FIRE, state);
        burn_away_slime(state);
        /* "body hit" */
        if (await burnarmor(state.youmonst, { ...env })) {
            if (!random.rn2(3))
                await destroy_items(state.youmonst, AD_FIRE, orig_dam,
                    { ...env });
            if (!random.rn2(3))
                await ignite_items(state.invent, { ...env });
        }
        break;

    default:
        throw new UnsupportedZapError(
            `zhitu() for damage type ${abstyp % 10}`,
        );
    }
    const killed = zhituLosehpArguments(type, abstyp, dam, fltxt, state);
    if (env.planning && !Upolyd(state.u)
        && killed.dam >= state.u.uhp
        && typeof env.planningDeath === 'function') {
        // C's losehp() enters end.c done() on this monster-turn death.  The
        // planning clone cannot run its urgent message or death query, so
        // carry the source damage write and attacker identity across the
        // existing atomic planning/live handoff used by mhitu.c.
        end_running(true, state);
        state.disp ??= {};
        state.disp.botl = true;
        state.u.uhp -= killed.dam;
        throw env.planningDeath(state.gb?.buzzer);
    }
    await losehp(killed.dam, killed.kbuf, KILLED_BY_AN, state, {
        ...env,
        fromMonster: type < 0 || Boolean(env.fromMonster),
        message: env.message,
    });
}

// C ref: zap.c zap_over_floor() (5140-5497), "location", "damage type plus
// {wand|spell|breath} info", "extra output if shop door is destroyed",
// "ignore any monster here", and "supplied when breaking a wand; or POT_OIL
// when a lit potion of oil explodes". Returns the amount the bolt's remaining
// range changes by.
//
// dobuzz() calls this for every square the bolt crosses, walls included. On
// ordinary room floor with nothing on it, every arm below is skipped and the
// answer is 0, which is why a ray across a plain room draws nothing here.
//
// The fire arm consumes a web through delfloortrap(), records the discarded
// melt_ice() call, invokes fountain.c dryup() through its canonical owner, and
// handles the water cloud/pit path. The cold,
// gas, lightning, and acid terrain arms, then the secret-door, closed-door,
// and floor-object tail, follow in source order.
export async function zap_over_floor(
    x, y,
    type,
    shopdamage,
    ignoremon,
    exploding_wand_typ,
    state = game,
    random = { rn2, rnd },
    rawEnv = {},
) {
    const env = { ...rawEnv, state, random };
    const message = env.planning ? async () => {}
        : (env.message ?? ttyPline);
    const norepMessage = env.planning ? async () => {}
        : (env.norepMessage ?? ttyNorep);
    const redrawAt = env.planning ? () => {}
        : (env.newsym ?? newsym);
    // hliquid() consumes the display stream. Keep the core random source in
    // `random` out of this environment when a planning caller omits an
    // explicit displayRandom callback.
    const liquid = (preferred) => hliquid(preferred, {
        state,
        displayRandom: env.displayRandom,
    });
    const lev = state.level.at(x, y);
    let rangemod = 0;
    const lavawall = lev.typ === LAVAWALL;
    const damgtype = zaptype(type) % 10;
    // C snapshots cansee() before create_gas_cloud() or the terrain mutation;
    // later messages and the post-effect redraw use this same source value.
    const seeIt = cansee(x, y, state);

    // 5157-5160's PHYS_EXPL_TYPE (hack.h:1470, -1) is explode.c's gas-spore
    // constant; ubuzz() cannot produce a negative type.
    if (type === PHYS_EXPL_TYPE) {
        /* This is explode.c's gas-spore physical explosion, not a zap. */
        return -1000;
    }

    switch (damgtype) {
    case ZT_FIRE: {
        const t = t_at(x, y, state);
        if (t && t.ttyp === WEB) {
            if (seeIt) await norepMessage('A web bursts into flames!', state, env);
            // delfloortrap() owns the trap unlink and actor state transition;
            // its boolean result is discarded by zap_over_floor() in C.
            delfloortrap(t, state);
            if (seeIt) redrawAt(x, y, state);
        }
        if (is_ice(x, y, state)) {
            // melt_ice() returns no value and has no ported owner yet.
            note_unported('zap.c melt_ice');
        } else if (is_pool(x, y, state)) {
            const onWaterLevel = Is_waterlevel(state.u.uz);
            let messageGiven = false;
            let evaporatedTrap = null;
            let msgtxt = !heroIsDeaf(state)
                ? 'You hear hissing gas.'
                : type >= 0 ? 'That seemed remarkably uneventful.' : null;

            // C ref: zap.c:5186. create_gas_cloud() is an existing region
            // owner; this caller supplies its live and planning operations so
            // the source's BFS draws and visible-region update are preserved.
            if (!onWaterLevel) {
                await create_gas_cloud(x, y, random.rnd(5), 0, {
                    ...env,
                    blockPoint: env.blockPoint
                        ?? ((cx, cy) => block_point(cx, cy, state)),
                    canSee: env.canSee
                        ?? ((cx, cy) => cansee(cx, cy, state)),
                    newsym: env.newsym ?? redrawAt,
                    message: async (text, cloudState) => {
                        await message(text, cloudState ?? state, env);
                    },
                });
                messageGiven = state.iflags?.last_msg
                    === PLNMSG_ENVELOPED_IN_GAS;
            }

            if (lev.typ !== POOL) {
                // C clears the local trap pointer for MOAT, DRAWBRIDGE_UP,
                // and WATER. The JavaScript floor tail has no later use for
                // that local pointer, so only the source's terrain message is
                // observable on this arm.
                if (onWaterLevel)
                    msgtxt = (seeIt || !heroIsDeaf(state))
                        ? 'Some water boils.' : null;
                else if (seeIt)
                    msgtxt = 'Some water evaporates.';
            } else {
                rangemod -= 3;
                lev.typ = ROOM;
                lev.flags = 0;
                evaporatedTrap = maketrap(x, y, PIT, env);
                if (seeIt) msgtxt = 'The water evaporates.';
            }
            if (msgtxt && !messageGiven)
                await norepMessage(msgtxt, state, env);

            // C forces hidden swimmers out of the water before newsym()
            // redraws the changed square, then lets the existing trap owners
            // decide whether the newly made pit catches its actor. This block
            // follows the evaporation message in zap.c.
            if (lev.typ === ROOM) {
                const mon = m_at(x, y, state);
                if (mon && is_swimmer(mon.data) && mon.mundetected)
                    mon.mundetected = false;
                redrawAt(x, y, state);
                if (evaporatedTrap && u_at(x, y, state)) {
                    await dotrap(evaporatedTrap, NO_TRAP_FLAGS, state);
                } else if (evaporatedTrap && mon) {
                    await mintrap(mon, NO_TRAP_FLAGS, {
                        ...env,
                        mInAir: env.mInAir ?? m_in_air,
                        heroDeaf: env.heroDeaf ?? heroIsDeaf,
                        youHear: env.youHear ?? youHear,
                        message: env.message ?? message,
                        redraw: env.redraw ?? redrawAt,
                    });
                }
            }
        } else if (IS_FOUNTAIN(lev.typ)) {
            await create_gas_cloud(x, y, random.rnd(3), 0, {
                ...env,
                blockPoint: env.blockPoint
                    ?? ((cx, cy) => block_point(cx, cy, state)),
                canSee: env.canSee
                    ?? ((cx, cy) => cansee(cx, cy, state)),
                newsym: env.newsym ?? redrawAt,
                message: async (text, cloudState) => {
                    await message(text, cloudState ?? state, env);
                },
            });
            if (seeIt)
                await message('Steam billows from the fountain.', state, env);
            rangemod -= 1;
            // C zap.c calls fountain.c dryup() directly after the steam
            // message.  Load the canonical owner lazily because fountain.js
            // already imports zap.js for elemental resistance.
            const { dryup } = await import('./fountain.js');
            await dryup(x, y, type > 0, state, { ...env, random });
        }
        break; /* ZT_FIRE */
    }

    case ZT_COLD:
        if (is_pool(x, y, state) || is_lava(x, y, state) || lavawall) {
            const lava = is_lava(x, y, state) || lavawall;
            const moat = is_moat(x, y, state);
            const temperature = Math.trunc(state.level?.flags?.temperature ?? 0);
            const chance = Math.max(2, 5 + temperature * 10);
            if (IS_WATERWALL(lev.typ) || (lavawall && random.rn2(chance))) {
                if (seeIt) {
                    await message(
                        `The ${liquid(lavawall ? 'lava' : 'water')} freezes for a moment.`,
                        state, env,
                    );
                } else if (!heroIsDeaf(state)) {
                    await message('You hear a soft crackling.', state, env);
                }
                rangemod -= 1000;
            } else {
                // C computes this before changing the drawbridge or terrain;
                // the string is specifically needed for a moat.
                const buf = waterbody_name(x, y, state, env);
                rangemod -= 3;
                const underMask = lev.flags ?? lev.drawbridgemask ?? 0;
                if (lev.typ === DRAWBRIDGE_UP) {
                    lev.flags = (underMask & ~DB_UNDER)
                        | (lava ? DB_FLOOR : DB_ICE);
                    lev.drawbridgemask = lev.flags;
                } else {
                    lev.icedpool = lava ? 0
                        : lev.typ === POOL ? ICED_POOL : ICED_MOAT;
                    if (lavawall) {
                        const vertical = (isok(x, y - 1)
                            && IS_WALL(state.level.at(x, y - 1).typ))
                            || (isok(x, y + 1)
                                && IS_WALL(state.level.at(x, y + 1).typ));
                        lev.typ = vertical ? VWALL : HWALL;
                        fix_wall_spines(
                            Math.max(0, x - 1), Math.max(0, y - 1),
                            Math.min(COLNO - 1, x + 1),
                            Math.min(ROWNO - 1, y + 1), state,
                        );
                    } else {
                        lev.typ = lava ? ROOM : ICE;
                    }
                }
                // bury_objs() discards its result and remains unported.
                note_unported('dig.c bury_objs');
                if (seeIt) {
                    await norepMessage(
                        lava ? `The ${liquid('lava')} cools and solidifies.`
                            : moat ? `The ${buf} is bridged with ice!`
                                : `The ${liquid('water')} freezes.`, state, env,
                    );
                    redrawAt(x, y, state);
                } else if (!lava && !heroIsDeaf(state)) {
                    await message('You hear a crackling sound.', state, env);
                }
                if (u_at(x, y, state)) {
                    if (state.u.uinwater) {
                        set_uinwater(false, state);
                        state.u.uundetected = 0;
                        if (typeof env.docrt === 'function') env.docrt(state);
                        else note_unported('display.c docrt');
                        state.vision_full_recalc = true;
                    } else if (state.u.utrap
                               && state.u.utraptype === TT_LAVA) {
                        if (typeof env.passesWalls === 'function'
                            ? env.passesWalls(state)
                            : Boolean(state.u?.uprops?.[0]?.extrinsic)) {
                            await message(
                                'You pass through the now-solid rock.', state, env,
                            );
                            reset_utrap(true, state);
                        } else {
                            set_utrap(random.rn1(50, 20), TT_INFLOOR, state);
                            await message(
                                'You are firmly stuck in the cooling rock.', state, env,
                            );
                        }
                    }
                } else {
                    const mon = m_at(x, y, state);
                    if (mon && is_swimmer(mon.data) && mon.mundetected) {
                        mon.mundetected = false;
                        redrawAt(x, y, state);
                    }
                }
                if (!lava) {
                    note_unported('zap.c start_melt_ice_timeout');
                    obj_ice_effects(x, y, true, env);
                }
            }
        } else if (is_ice(x, y, state)) {
            const meltTime = spot_time_left(x, y, MELT_ICE_AWAY, state);
            if (meltTime) {
                spot_stop_timers(x, y, MELT_ICE_AWAY, state);
                note_unported('zap.c start_melt_ice_timeout');
            }
        }
        break; /* ZT_COLD */

    case ZT_POISON_GAS:
        // Poison gas with range one is the green dragon/iron golem breath
        // arm.  Wall squares are deliberately ignored by C's ZAP_POS test.
        if (ZAP_POS(lev.typ)) {
            await create_gas_cloud(x, y, 1, 8, {
                ...env,
                allowPositiveDamage: true,
                blockPoint: env.blockPoint
                    ?? ((cx, cy) => block_point(cx, cy, state)),
                canSee: env.canSee
                    ?? ((cx, cy) => cansee(cx, cy, state)),
                newsym: env.newsym ?? redrawAt,
                message: async (text, cloudState) => {
                    await message(text, cloudState ?? state, env);
                },
            });
        }

    case ZT_LIGHTNING:
        /* FALLTHRU */
    case ZT_ACID:
        if (lev.typ === IRONBARS) {
            if (damgtype === ZT_LIGHTNING && random.rn2(10)) break;
            if ((lev.wall_info ?? 0) & W_NONDIGGABLE) {
                if (seeIt)
                    await norepMessage(
                        `The iron bars ${damgtype === ZT_ACID ? 'corrode' : 'melt'} somewhat but remain intact.`,
                        state, env,
                    );
            } else {
                rangemod -= 3;
                if (seeIt)
                    await norepMessage(
                        `The iron bars ${damgtype === ZT_ACID ? 'corrode away' : 'melt'}.`,
                        state, env,
                    );
                dissolve_bars(x, y, state);
                if (in_rooms(x, y, SHOPBASE, state).length) {
                    if (typeof env.addDamage === 'function')
                        await env.addDamage(
                            x, y, type >= 0 ? SHOP_BARS_COST : 0, state, env,
                        );
                    else note_unported('shk.c add_damage');
                    if (type >= 0) {
                        if (shopdamage && typeof shopdamage === 'object')
                            shopdamage.value = true;
                    }
                }
            }
        }
        break; /* ZT_ACID */

    default:
        break;
    }

    // 5376-5395 builds `yourzap` and `zapverb` for the door feedback alone.
    const yourzap = type >= 0 && !exploding_wand_typ;
    let zapverb = 'blast';
    if (!exploding_wand_typ) {
        const ztype = zaptype(type);
        if (ztype < 10) zapverb = 'bolt';
        else if (ztype < 20) zapverb = 'spell';
    } else if (exploding_wand_typ === POT_OIL
               || exploding_wand_typ === SCR_FIRE) {
        exploding_wand_typ = 0;
    }

    /* secret door gets revealed, converted into regular door */
    if (lev.typ === SDOOR) {
        cvt_sdoor_to_door(lev, state);
        recalc_block_point(x, y, state);
        redrawAt(x, y, state);
        if (seeIt) {
            await message(
                `${yourzap ? 'Your' : 'The'} ${zapverb} reveals a secret door.`,
                state, env,
            );
        } else if (Is_rogue_level(state.u?.uz)) {
            note_unported('dig.c draft_message');
        }
    }

    /* regular door absorbs remaining zap range, possibly gets destroyed */
    if (closed_door(x, y, state)) {
        rangemod = -1000;
        let newDoormask = -1;
        let seeText = null;
        let senseText = null;
        let hearText = null;
        switch (damgtype) {
        case ZT_FIRE:
            newDoormask = D_NODOOR;
            seeText = 'The door is consumed in flames!';
            senseText = 'You smell smoke.';
            break;
        case ZT_COLD:
            newDoormask = D_NODOOR;
            seeText = 'The door freezes and shatters!';
            hearText = 'You hear a deep cracking sound.';
            break;
        case ZT_DEATH:
            if (Math.abs(type) === 20 + ZT_DEATH) {
                newDoormask = D_NODOOR;
                seeText = 'The door disintegrates!';
                hearText = 'You hear crashing wood.';
            }
            break;
        case ZT_LIGHTNING:
            newDoormask = D_BROKEN;
            seeText = 'The door splinters!';
            hearText = 'You hear crackling.';
            break;
        default:
            if (exploding_wand_typ > 0
                && exploding_wand_typ === WAN_STRIKING) {
                newDoormask = D_BROKEN;
                seeText = 'The door crashes open!';
                senseText = 'You feel a burst of cool air.';
            } else if (seeIt) {
                await message(
                    exploding_wand_typ ? 'The door remains intact.'
                        : `The door absorbs ${yourzap ? 'your' : 'the'} ${zapverb}!`,
                    state, env,
                );
            } else {
                await message('You feel vibrations.', state, env);
            }
            break;
        }
        if (newDoormask >= 0) {
            if (in_rooms(x, y, SHOPBASE, state).length) {
                if (typeof env.addDamage === 'function') {
                    await env.addDamage(
                        x, y, type >= 0 ? SHOP_DOOR_COST : 0, state, env,
                    );
                } else {
                    note_unported('shk.c add_damage');
                }
                if (type >= 0 && shopdamage
                    && typeof shopdamage === 'object')
                    shopdamage.value = true;
            }
            lev.flags = newDoormask;
            lev.doormask = newDoormask;
            recalc_block_point(x, y, state);
            if (seeIt) {
                await message(seeText, state, env);
                redrawAt(x, y, state);
            } else if (senseText) {
                await message(senseText, state, env);
            } else if (hearText) {
                await message(hearText, state, env);
            }
            if (picking_at(x, y, state)) {
                await stop_occupation(state, { message: ttyPline });
                reset_pick(state);
            }
        }
    }

    if (OBJ_AT(x, y, state) && damgtype === ZT_FIRE) {
        const burned = await burn_floor_objects(x, y, false, type > 0, {
            ...env,
            state,
            random,
            igniteItems: env.igniteItems
                ?? ((head, igniteEnv) => ignite_items(head, igniteEnv)),
        });
        if (burned && couldsee(x, y, state)) {
            redrawAt(x, y, state);
            await message(
                `${heroIsBlind(state) ? 'You smell a whiff' : 'You see a puff'} of smoke.`,
                state, env,
            );
        }
    }
    if (!ignoremon) {
        const mon = m_at(x, y, state);
        if (mon) await wakeup(mon, type >= 0, { state, random });
    }
    return rangemod;
}

// C ref: zap.c disintegrate_mon() (5050-5095).  The caller intentionally
// consumes no damage from zhitm's MAGIC_COOKIE; this helper removes every
// non-protected carried item before delegating the ordinary monster death
// owner, preserving the source's no-corpse flags and killer direction.
async function disintegrate_mon(mon, type, fltxt, state, random, env) {
    const visible = canseemon(mon, state);
    const message = env.message ?? ttyPline;
    if (visible) {
        await message(
            `${monsterCommonName(mon, state)} is disintegrated!`, state, env,
        );
    }
    for (let obj = mon.minvent; obj;) {
        const next = obj.nobj;
        const protectedByProperty = objectType(obj, state).oc_oprop
            === DISINT_RES;
        const protectedByResist = protectedByProperty
            ? false : obj_resists(obj, 5, 50, { state, random });
        const protectedByQuest = is_quest_artifact(obj, state);
        const lifesaver = obj.otyp === AMULET_OF_LIFE_SAVING
            && (obj.owornmask ?? 0);
        if (!protectedByProperty && !protectedByResist
            && !protectedByQuest && !lifesaver)
            m_useupall(mon, obj, { state, random });
        obj = next;
    }
    const killEnv = {
        ...env,
        state,
        random,
        message,
        unsupported: env.unsupported
            ?? ((reason) => note_unported(`mon.c ${reason}`)),
    };
    if (type < 0)
        await monkilled(mon, null, -AD_RBRE, state, killEnv);
    else
        await xkilled(mon, XKILL_NOMSG | XKILL_NOCORPSE, state, killEnv);
    void fltxt;
}

// C ref: zap.c flashburn() (3060-3087). A lightning hit rolls its blindness
// duration once, reports the flash, then lets potion.c own the silent timer
// transition and its immediate vision-clear message.
async function flashburn(duration, viaLightning, state, env = {}) {
    const message = env.message ?? ttyPline;
    if (!resists_blnd(state.youmonst, state)) {
        await message('You are blinded by the flash!', state, env);
        await make_blinded(duration, false, state, { ...env, message });
        if (!heroIsBlind(state))
            await message('Your vision quickly clears.', state, env);
        return true;
    }
    if (!viaLightning && resists_blnd_by_arti(state.youmonst, state)) {
        note_unported('zap.c shieldeff');
        return true;
    }
    return false;
}

// C ref: zap.c's `buzzmonst:` arm inside dobuzz() (4864-4956).  The hero's
// mount reaches this label with `goto`, so both an ordinary monster and a
// steed must share reflection, zhitm, Rider/Death handling, disintegration,
// death ownership, and the sleeping-grabber release below.
async function buzzmonst(
    mon,
    type,
    nd,
    fltyp,
    damgtype,
    spellType,
    sayhit,
    saymiss,
    forcemiss,
    state,
    random,
    env,
) {
    const message = env.planning ? async () => {}
        : (env.message ?? ttyPline);
    state.gn ??= {};
    state.gn.notonhead = (mon.mx !== state.gb.bhitpos.x
        || mon.my !== state.gb.bhitpos.y);

    if (forcemiss
        || !zap_hit(find_mac(mon, state), spellType, random, state)) {
        if (saymiss
            || (canseemon(mon, state)
                && !(mon.m_ap_type
                    && (mon.m_ap_type & 0x7) !== 2 /* M_AP_MONSTER */)))
            await miss(flash_str(fltyp, false, state, random), mon, state, env);
        return { hit: false, reflected: false, clearGas: false, stop: false };
    }

    if (await mon_reflects(mon, null, state)) {
        const seen = cansee(mon.mx, mon.my, state);
        if (seen) {
            await hit(flash_str(fltyp, false, state, random), mon,
                exclam(0), state, env);
            // shieldeff(mon.mx, mon.my) is a visual animation with no game
            // state or RNG effect, so the shared owner has no call here.
            await mon_reflects(mon, 'But it reflects from %s %s!', state);
        }
        return { hit: true, reflected: true, clearGas: seen, stop: false };
    }

    const monCouldMove = mon.mcanmove;
    const zhitResult = await zhitm(mon, type, nd, state, random, env);
    const tmp = zhitResult.damage;
    const otmp = zhitResult.otmp;

    if (is_rider(mon.data)
        && Math.abs(type) === 20 + ZT_DEATH /* ZT_BREATH(ZT_DEATH) */) {
        if (canseemon(mon, state)) {
            await hit(flash_str(fltyp, false, state, random), mon,
                exclam(0), state, env);
            await message(`${Monnam(mon, state)} disintegrates.`, state, env);
            await message(
                `${s_suffix(Monnam(mon, state))} body reintegrates `
                + `before your eyes!`, state, env,
            );
            await message(`${Monnam(mon, state)} resurrects!`, state, env);
        }
        mon.mhp = mon.mhpmax;
        return { hit: true, reflected: false, clearGas: false, stop: true };
    }
    if (mon.data === state.mons?.[PM_DEATH] && damgtype === ZT_DEATH) {
        if (canseemon(mon, state)) {
            await hit(flash_str(fltyp, false, state, random), mon,
                exclam(0), state, env);
            await message(
                `${Monnam(mon, state)} absorbs the deadly `
                + `${Math.abs(type) === 20 + ZT_DEATH ? 'blast' : 'ray'}!`,
                state, env,
            );
            await message('It seems even stronger than before.', state, env);
        }
        return { hit: true, reflected: false, clearGas: false, stop: true };
    }

    if (tmp === 1000 /* MAGIC_COOKIE */) {
        await disintegrate_mon(mon, type,
            flash_str(fltyp, false, state, random), state, random, env);
    } else if (mon.mhp < 1) { /* DEADMONSTER */
        const killEnv = {
            ...env,
            state,
            random,
            message,
            unsupported: env.unsupported
                ?? ((what) => note_unported(`mon.c ${what}`)),
        };
        if (type < 0) {
            /* killed by another monster */
            await monkilled(mon,
                flash_str(fltyp, false, state, random), AD_RBRE, state,
                killEnv);
        } else {
            let xkflags = XKILL_GIVEMSG; /* killed(mon) */
            /* fire on highly flammable monsters: no corpse */
            if (damgtype === ZT_FIRE && completelyburns(mon.data))
                xkflags |= XKILL_NOCORPSE;
            await xkilled(mon, xkflags, state, killEnv);
        }
    } else {
        if (!otmp) {
            /* normal non-fatal hit */
            if (sayhit || canseemon(mon, state))
                await hit(flash_str(fltyp, false, state, random), mon,
                    exclam(tmp), state, env);
        } else {
            /* some armor was destroyed; no damage done */
            if (canseemon(mon, state)) {
                await message(
                    `${s_suffix(Monnam(mon, state))} `
                    + `${xnameFresh(otmp, state)} is disintegrated!`,
                    state, env,
                );
            }
            m_useup(mon, otmp, { state, random });
        }
        if (monCouldMove && !mon.mcanmove) { /* ZT_SLEEP */
            // slept_monst() releases a sleeping grabber.
            await slept_monst(mon, { ...env, message });
        }
        if (damgtype !== ZT_SLEEP)
            await wakeup(mon, type >= 0, { state, random });
    }
    return { hit: true, reflected: false, clearGas: false, stop: false };
}

// C ref: zap.c dobuzz() (4779-5037). One `while (range-- > 0)` loop that walks
// the bolt square by square, painting a transient glyph, running the floor
// effect, and stopping range short by 2 for a hit and by 1 for a bounce.
//
// `sayhit` and `saymiss` "report out of sight hit/miss events" and belong to
// the monster arm; `forcemiss` is muse.c's. ubuzz() passes TRUE, FALSE, FALSE.
//
// The monster arm (4864-4956) is ported through its shared buzzmonst label:
// zap_hit(), mon_reflects(), zhitm(), Rider resurrection, PM_DEATH absorption,
// disintegration, xkilled()/monkilled(), armor disintegration, and
// slept_monst(). Any still-unported callee is recorded at its source boundary.
//
// The arms that still stop, each before it changes state, draws or writes:
// u.uswallow (4802-4820), u.usteed (4959-4961), flashburn() (4988-4989),
// Is_airlevel (5008-5013) and pay_for_damage() (5028-5035).
export async function dobuzz(
    type,               /* 0..29 (by hero) or -39..-10 (by monster) */
    nd,                 /* damage strength ('number of dice') */
    sx, sy,             /* starting point */
    dx, dy,             /* direction delta */
    sayhit, saymiss,    /* report out of sight hit/miss events */
    forcemiss,
    state = game,
    random = { d, rn1, rn2, rnd, rne, rnl, rnz },
    rawEnv = {},
) {
    const env = { ...rawEnv, state, random };
    const message = env.planning ? async () => {}
        : (env.message ?? ttyPline);
    const redraw = env.planning ? () => {}
        : (env.redraw ?? newsym);
    const markInvisible = env.planning ? () => {}
        : (env.markInvisible ?? map_invisible);
    const unmarkInvisible = env.planning ? () => {}
        : (env.unmarkInvisible ?? unmap_invisible);
    const drawBeam = env.planning ? async () => {} : tmp_at;
    const delayOutput = env.planning ? async () => {} : nh_delay_output;
    const fltyp = zaptype(type);
    const damgtype = fltyp % 10;
    const spellType = type >= 10 && type < 20
        ? SPE_MAGIC_MISSILE + damgtype : 0;

    // C accepts every hero wand/spell/breath band (0..29), and every monster
    // spell/breath/wand band (-39..-10).  zaptype() normalizes all of them for
    // the beam glyph and damage switch; callers supply the source type.
    if (!((type >= 0 && type <= 29)
          || (type >= -39 && type <= -10)))
        throw new RangeError(`invalid zap type ${type}`);
    // C draws the beam colour before the first square when hallucinating.
    const hdmgtype = Hallucination(state) ? random.rn2(6) : damgtype;

    if (state.u.uswallow) {
        // C handles a hero's own ray inside the engulfer before it allocates
        // a beam or range.  A monster-origin ray has no effect in this state.
        if (type < 0) return;
        const engulfer = state.u.ustuck;
        const swallowedResult = await zhitm(
            engulfer, type, nd, state, random, env,
        );
        const swallowedDamage = swallowedResult.damage;
        if (!state.u.ustuck) {
            state.u.uswallow = 0;
        } else {
            await message(
                `${The(flash_str(fltyp, false, state, random), state)} rips into `
                + `${mon_nam(state.u.ustuck, state)}${exclam(swallowedDamage)}`,
                state,
            );
            if (swallowedDamage === 1000)
                state.u.ustuck.mhp = 0;
            if (state.u.ustuck.mhp < 1)
                await xkilled(state.u.ustuck, XKILL_GIVEMSG, state,
                    { state, random, message });
        }
        return;
    }
    // C ref: zap.c:4821-4822. When a monster fires, repaint the hero's cell
    // so the beam glyph replaces the hero glyph during the animation.
    if (type < 0)
        redraw(state.u.ux, state.u.uy, state);
    let range = random.rn1(7, 7);
    if (dx === 0 && dy === 0)
        range = 1;
    state.gb ??= {};
    const save_bhitpos = state.gb.bhitpos;
    // C's `boolean shopdamage`, taken by address. Only the door arm of
    // zap_over_floor() raises it and that arm stops, so the tail below reads
    // it back false on every reachable path.
    const shopdamage = { value: false };

    // C ref: zap.c:4793. fireball is true only for hero spell fire (type 11),
    // which is outside the supported range. gas_hit is set per iteration.
    const fireball = (type === 10 + ZT_FIRE);
    let gas_hit = false;

    await drawBeam(DISP_BEAM, zapdir_to_glyph(dx, dy, hdmgtype, state), state);
    while (range-- > 0) {
        const lsx = sx;
        sx += dx;
        const lsy = sy;
        sy += dy;
        let make_bounce = !isok(sx, sy) || state.level.at(sx, sy).typ === STONE;

        if (!make_bounce) {
            let mon = m_at(sx, sy, state);
            if (cansee(sx, sy, state)) {
                /* reveal/unreveal invisible monsters before tmp_at() */
                if (mon && !canSpotMonster(mon, state))
                    markInvisible(sx, sy, state);
                else if (!mon)
                    unmarkInvisible(sx, sy, state);
                if (ZAP_POS(state.level.at(sx, sy).typ)
                    || (isok(lsx, lsy) && cansee(lsx, lsy, state)))
                    await drawBeam(sx, sy, state);
                await delayOutput(state); /* wait a little */
            }

            /* hit() and miss() need gb.bhitpos to match the target */
            state.gb.bhitpos = { x: sx, y: sy };
            // C ref: zap.c:4852-4862. Fireballs damage only on explosion;
            // poison gas defers zap_over_floor until after hit/miss logic.
            gas_hit = (damgtype === ZT_POISON_GAS);
            if (!fireball && !gas_hit) {
                range += await zap_over_floor(
                    sx, sy, type, shopdamage, true, 0, state, random,
                    { ...env, newsym: redraw },
                );
            }
            /* zap with fire -> melt ice -> drown monster, so monster
               found and cached above might not be here any more */
            mon = m_at(sx, sy, state);

            if (mon) {
                // A hero fireball explodes on the square before an obstacle;
                // it never runs the ordinary monster arm in this loop.
                if (fireball) break;
                // C clears the ordinary monster's waiting strategy before
                // falling through to buzzmonst. The steed goto below skips
                // this statement, so keep the mutation at this caller rather
                // than putting it in the shared label helper.
                if (type >= 0)
                    mon.mstrategy &= ~STRAT_WAITMASK;
                // C ref: zap.c dobuzz() (4864-4956), the shared
                // `buzzmonst:` arm (the steed path jumps to this same label).
                const monsterResult = await buzzmonst(
                    mon, type, nd, fltyp, damgtype, spellType,
                    sayhit, saymiss, forcemiss, state, random, env,
                );
                if (monsterResult.stop)
                    break;
                if (monsterResult.reflected) {
                    dx = negate(dx);
                    dy = negate(dy);
                    if (monsterResult.clearGas)
                        gas_hit = false;
                }
                if (monsterResult.hit)
                    range -= 2;
            } else if (u_at(sx, sy, state) && range >= 0) {
                nomul(0, state);
                if (state.u.usteed && !random.rn2(3)
                    && !(await mon_reflects(state.u.usteed, null, state))) {
                    // C jumps to buzzmonst for the steed. The helper preserves
                    // the exact shared reflection, death, and wakeup path.
                    const steed = state.u.usteed;
                    const steedResult = await buzzmonst(
                        steed, type, nd, fltyp, damgtype, spellType,
                        sayhit, saymiss, forcemiss, state, random, env,
                    );
                    if (steedResult.stop)
                        break;
                    if (steedResult.reflected) {
                        dx = negate(dx);
                        dy = negate(dy);
                        if (steedResult.clearGas)
                            gas_hit = false;
                    }
                    if (steedResult.hit)
                        range -= 2;
                } else if (!forcemiss
                           && zap_hit(Math.trunc(state.u.uac), spellType,
                               random, state)) {
                    range -= 2;
                    // C ref: pline.c pline_dir() (113-123) over set_msg_dir()
                    // (83-89): the message is placed at the square the bolt
                    // came from, which vpline() reads back only when
                    // a11y.accessiblemsg is set. messageAt() is this port's
                    // one owner of that prefix.
                    //
                    // A vertical bolt has dx == dy == 0, so xytodir() answers
                    // DIR_ERR and cmd.c dirtocoord() leaves its coord alone.
                    // vpline() zeroes a11y.msg_loc at the top of every message
                    // it prints, so the coord set_msg_dir() then adds u.ux and
                    // u.uy to is (0, 0) and the message lands on the hero's
                    // own square.
                    const from = dirtocoord(xytodir(-dx, -dy))
                        ?? { x: 0, y: 0 };
                    await message(
                        messageAt(
                            `${The(
                                flash_str(fltyp, false, state, random), state,
                            )} hits you!`,
                            state.u.ux + from.x, state.u.uy + from.y, state,
                        ),
                        state,
                    );
                    if (Reflecting(state)) {
                        if (!heroIsBlind(state)) {
                            await ureflects(
                                'But %s reflects from your %s!', 'it', state,
                            );
                        } else {
                            await message(
                                'For some reason you are not affected.',
                                state,
                            );
                        }
                        monstseesu(M_SEEN_REFL, state);
                        dx = negate(dx);
                        dy = negate(dy);
                        // shieldeff(sx, sy) is a visual animation;
                        // skipped because it has no game-state or RNG effect.
                        gas_hit = false;
                    } else {
                        /* flash_str here only used for killer; suppress
                         * hallucination */
                        await zhitu(
                            type, nd, flash_str(fltyp, true, state, random), sx, sy,
                            state, random, env,
                        );
                        monstunseesu(M_SEEN_REFL, state);
                    }
                } else if (!heroIsBlind(state)) {
                    await message(
                        `${The(flash_str(fltyp, false, state, random), state)} whizzes `
                        + 'by you!',
                        state,
                    );
                } else if (damgtype === ZT_LIGHTNING) {
                    await message(
                        `Your ${body_part(ARM, state.youmonst)} tingles.`,
                        state,
                    );
                }
                if (damgtype === ZT_LIGHTNING) {
                    await flashburn(random.d(nd, 50), true, state,
                        { ...env, message });
                }
                await stop_occupation(state, { message: ttyPline });
                nomul(0, state);
            }
            // C ref: zap.c:4995-4996. Gas that missed or was not reflected
            // leaves a 1x1 cloud via the deferred zap_over_floor().
            if (gas_hit) {
                range += await zap_over_floor(
                    sx, sy, type, shopdamage, true, 0, state, random,
                    { ...env, newsym: redraw },
                );
            }

            if (!ZAP_POS(state.level.at(sx, sy).typ)
                || (closed_door(sx, sy, state) && range >= 0))
                make_bounce = true;
        }

        if (make_bounce) {
            const bchance = (!isok(sx, sy)
                             || state.level.at(sx, sy).typ === STONE) ? 10
                : (In_mines(state.u.uz)
                   && IS_WALL(state.level.at(sx, sy).typ)) ? 20
                    : 75;
            const visibleBounce = --range > 0 && isok(lsx, lsy)
                && cansee(lsx, lsy, state);
            if (visibleBounce || fireball) {
                if (Is_airlevel(state.u.uz)) { /* nothing to bounce off of */
                    await message(
                        `The ${flash_str(fltyp, false, state, random)} vanishes `
                        + 'into the aether!', state,
                    );
                    if (fireball) type = ZT_FIRE;
                    break;
                } else if (fireball) {
                    sx = lsx;
                    sy = lsy;
                    break;
                }
                await message(
                    `The ${flash_str(fltyp, false, state, random)} bounces!`, state,
                );
            }
            ({ dx, dy } = bounce_dir(
                sx, sy, dx, dy, bchance, state, random,
            ));
            await drawBeam(
                DISP_CHANGE, zapdir_to_glyph(dx, dy, hdmgtype, state), state,
            );
        }
    }
    await drawBeam(DISP_END, 0, state);
    if (fireball)
        await explode(sx, sy, type, random.d(12, 6), 0, EXPL_FIERY, state,
            env);
    if (shopdamage.value)
        note_unported('shk.c pay_for_damage');
    state.gb.bhitpos = save_bhitpos;
}

// C ref: zap.c ubuzz() (4758-4762). The hero's own ray, fired from their own
// square along u.dx/u.dy.
export async function ubuzz(
    type, nd, state = game, random = { d, rn1, rn2, rnd, rne, rnl, rnz },
) {
    return dobuzz(
        type, nd, state.u.ux, state.u.uy, state.u.dx, state.u.dy,
        true, false, false, state, random,
    );
}

// C ref: zap.c buzz() (4764-4768). A directed spell, breath, or zap from an
// explicit origin. Wraps dobuzz with sayhit=true, saymiss=false,
// forcemiss=false.
export async function buzz(
    type, nd, sx, sy, dx, dy,
    state = game, random = { d, rn1, rn2, rnd, rne, rnl, rnz },
) {
    return dobuzz(type, nd, sx, sy, dx, dy, true, false, false, state, random);
}

// C ref: zap.c ubreatheu() (3017-3022). Called when the poly'd hero uses a
// breath attack against self (direction '.').  Delegates to zhitu() with the
// hero-breath type offset and the hero's own coordinates.
export async function ubreatheu(
    mattk, state = game, random = { d, rn1, rn2, rnd, rne, rnl, rnz },
) {
    // C: int dtyp = 20 + mattk->adtyp - 1;  /* breath by hero */
    const dtyp = 20 + mattk.adtyp - 1;
    await zhitu(dtyp, mattk.damn, flash_str(dtyp, true, state),
        state.u.ux, state.u.uy, state, random);
}

// C ref: zap.c zapnodir() (2539-2596), restricted to the wand of secret door
// detection. Its findit() call is observable even when it finds nothing, so a
// seen wand goes through the shared discovery tail. Every other NODIR object
// retains the previous fail-closed boundary.
export async function zapnodir(obj, state = game) {
    let known = false;
    switch (obj.otyp) {
    case WAN_SECRET_DOOR_DETECTION:
        known = Boolean(obj.dknown);
        await findit(state);
        break;
    default:
        throw new UnsupportedZapError(
            'zapnodir() for a directionless wand',
        );
    }

    if (known) {
        if (!objectType(obj, state).oc_name_known)
            more_experienced(0, 10, state);
        learnwand(obj, state);
    }
}

// C ref: dig.c zap_dig() (1548-1754). The swallowed branch still stops at
// digests()/expels() because their message and relocation chain is not yet
// owned here; vertical digging skips the discarded-result dighole() call; and
// adjacent-pit liquid flow skips dighole()/pit_flow() after preserving their
// source predicates and consumed fillholetyp() draw. The normal horizontal
// and maze arms are complete through their beam animation, source terrain
// order, vision updates, and discarded shop/watch hooks.
function zapDigHardHelmet(helmet, state) {
    if (!helmet || !is_helmet(helmet, state)) return false;
    const type = objectType(helmet, state);
    return isMetallic(helmet, state) || type.oc_material === GLASS;
}

function zapDigMaybeHalfPhys(damage, state) {
    const property = state.u?.uprops?.[HALF_PHDAM];
    return property?.intrinsic || property?.extrinsic
        ? Math.trunc((damage + 1) / 2) : damage;
}

export async function zap_dig(
    state = game,
    random = { rn1, rnd, rn2 },
) {
    const u = state.u;
    if (u.uswallow) {
        const mtmp = u.ustuck;
        if (!is_whirly(mtmp?.data)) {
            const digestive = Boolean(
                dmgtype_fromattack(mtmp.data, AD_DGST, AT_ENGL),
            );
            if (digestive) {
                await ttyPline(
                    `You pierce ${s_suffix(mon_nam(mtmp, state))} `
                    + `${mbodypart(mtmp, STOMACH)} wall!`,
                    state,
                );
            }
            if (unique_corpstat(mtmp.data))
                mtmp.mhp = Math.trunc((mtmp.mhp + 1) / 2);
            else
                mtmp.mhp = 1;
            if (!digestive) {
                const enfolding = Boolean(
                    attacktype_fordmg(mtmp.data, AT_ENGL, AD_WRAP),
                );
                if (enfolding) {
                    await ttyPline(
                        `${Monnam(mtmp, state)} unfolds and you are released!`,
                        state,
                    );
                } else if (attacktype_fordmg(mtmp.data, AT_ENGL, AD_ANY)) {
                    await ttyPline(
                        `You get expelled from ${mon_nam(mtmp, state)} `
                        + 'with a squelch!',
                        state,
                    );
                } else {
                    note_unported('pline.c impossible');
                }
            }
            await expels(mtmp, { state });
        }
        return;
    }
    if (u.dz) {
        if (!Is_airlevel(u.uz) && !Is_waterlevel(u.uz) && !u.uinwater) {
            const stway = stairway_at(u.ux, u.uy, state);
            if (u.dz < 0 || stway) {
                if (stway) {
                    await ttyPline(
                        `The beam bounces off the ${stway.isladder ? 'ladder' : 'stairs'} `
                        + `and hits the ${ceiling(u.ux, u.uy, state)}.`,
                        state,
                    );
                }
                await ttyPline(
                    `You loosen a rock from the ${ceiling(u.ux, u.uy, state)}.`,
                    state,
                );
                await ttyPline(
                    `It falls on your ${body_part(HEAD, state.youmonst)}!`,
                    state,
                );
                const damage = random.rnd(
                    zapDigHardHelmet(state.uarmh, state) ? 2 : 6,
                );
                await losehp(
                    zapDigMaybeHalfPhys(damage, state),
                    'falling rock', KILLED_BY_AN, state,
                );
                const rock = mksobj_at(
                    ROCK, u.ux, u.uy, false, false,
                    objectGenerationEnv({ state, random }),
                );
                if (rock) {
                    xnameFresh(rock, state);
                    stackobj(rock, objectGenerationEnv({ state, random }));
                }
                newsym(u.ux, u.uy, state);
            } else {
                await watch_dig(null, u.ux, u.uy, true, { state });
                note_unported('dig.c dighole');
            }
        }
        return;
    }

    const trapWithHero = u.utrap && u.utraptype === TT_PIT
        ? t_at(u.ux, u.uy, state) : null;

    let shopdoor = false;
    let shopwall = false;
    let flowX = -1;
    let flowY = -1;
    let pitflow = false;
    let diridx = 8;
    if (trapWithHero) diridx = xytodir(u.dx, u.dy);
    const mazeDig = Boolean(
        state.level?.flags?.is_maze_lev && !Is_earthlevel(u.uz),
    );
    let zx = u.ux + u.dx;
    let zy = u.uy + u.dy;
    let digdepth = random.rn1(18, 8);

    await tmp_at(
        DISP_BEAM,
        map_glyphinfo(cmap_to_glyph(S_digbeam, state), state),
        state,
    );
    while (--digdepth >= 0) {
        if (!isok(zx, zy)) break;
        const room = state.level.at(zx, zy);
        await tmp_at(zx, zy, state);
        await nh_delay_output(state);

        if (trapWithHero) {
            const adjacentPit = t_at(zx, zy, state);
            if (diridx !== DIR_ERR
                && !conjoined_pits(adjacentPit, trapWithHero, false, state)) {
                digdepth = 0;
                let nextPit = adjacentPit;
                if (!(nextPit && is_pit(nextPit.ttyp))) {
                    const check = adj_pit_checks({ x: zx, y: zy }, state);
                    if (check.message)
                        await ttyPline(check.message, state);
                    if (check.allowed)
                        note_unported('dig.c dighole');
                    nextPit = t_at(zx, zy, state);
                }
                if (nextPit && is_pit(nextPit.ttyp)) {
                    trapWithHero.conjoined
                        = (trapWithHero.conjoined ?? 0) | (1 << diridx);
                    nextPit.conjoined
                        = (nextPit.conjoined ?? 0) | (1 << DIR_180(diridx));
                    flowX = zx;
                    flowY = zy;
                    pitflow = true;
                }
                if (is_pool(zx, zy, state) || is_lava(zx, zy, state)) {
                    flowX = zx - u.dx;
                    flowY = zy - u.dy;
                    pitflow = true;
                }
                break;
            }
        } else if (closed_door(zx, zy, state) || room.typ === SDOOR) {
            if (in_rooms(zx, zy, SHOPBASE, state).length) {
                note_unported('shk.c add_damage');
                shopdoor = true;
            }
            if (room.typ === SDOOR) {
                cvt_sdoor_to_door(room, state);
            } else if (cansee(zx, zy, state)) {
                await ttyPline('The door is razed!', state);
            }
            await watch_dig(null, zx, zy, true, { state });
            room.doormask = D_NODOOR;
            room.flags = D_NODOOR;
            recalc_block_point(zx, zy, state);
            digdepth -= 2;
            if (mazeDig) break;
        } else if (mazeDig) {
            if (IS_WALL(room.typ)) {
                if (!(room.wall_info & W_NONDIGGABLE)) {
                    if (in_rooms(zx, zy, SHOPBASE, state).length) {
                        note_unported('shk.c add_damage');
                        shopwall = true;
                    }
                    room.typ = ROOM;
                    room.flags = 0;
                    room.doormask = 0;
                    unblock_point(zx, zy, state);
                } else if (!heroIsBlind(state)) {
                    await ttyPline('The wall glows then fades.', state);
                }
                break;
            } else if (IS_TREE(room.typ)) {
                if (!(room.wall_info & W_NONDIGGABLE)) {
                    room.typ = ROOM;
                    room.flags = 0;
                    room.doormask = 0;
                    unblock_point(zx, zy, state);
                } else if (!heroIsBlind(state)) {
                    await ttyPline('The tree shudders but is unharmed.', state);
                }
                break;
            } else if (room.typ === STONE || room.typ === SCORR) {
                if (!(room.wall_info & W_NONDIGGABLE)) {
                    room.typ = CORR;
                    room.flags = 0;
                    room.doormask = 0;
                    unblock_point(zx, zy, state);
                } else if (!heroIsBlind(state)) {
                    await ttyPline('The rock glows then fades.', state);
                }
                break;
            }
        } else if (IS_OBSTRUCTED(room.typ)) {
            if (!may_dig(zx, zy, state)) break;
            if (IS_WALL(room.typ) || room.typ === SDOOR) {
                if (in_rooms(zx, zy, SHOPBASE, state).length) {
                    note_unported('shk.c add_damage');
                    shopwall = true;
                }
                await watch_dig(null, zx, zy, true, { state });
                if (state.level.flags?.is_cavernous_lev
                    && !in_town(zx, zy, state)) {
                    room.typ = CORR;
                    room.flags = 0;
                    room.doormask = 0;
                } else {
                    room.typ = DOOR;
                    room.doormask = D_NODOOR;
                    room.flags = D_NODOOR;
                }
                digdepth -= 2;
            } else if (IS_TREE(room.typ)) {
                room.typ = ROOM;
                room.flags = 0;
                room.doormask = 0;
                digdepth -= 2;
            } else {
                room.typ = CORR;
                room.flags = 0;
                room.doormask = 0;
                digdepth--;
            }
            unblock_point(zx, zy, state);
        }
        zx += u.dx;
        zy += u.dy;
    }
    await tmp_at(DISP_END, 0, state);
    if (pitflow && isok(flowX, flowY)) {
        const flowTrap = t_at(flowX, flowY, state);
        if (flowTrap && is_pit(flowTrap.ttyp)) {
            const filltyp = fillholetyp(flowTrap.tx, flowTrap.ty, true,
                state, random);
            if (filltyp !== ROOM) note_unported('dig.c pit_flow');
        }
    }
    if (shopdoor || shopwall)
        note_unported('shk.c pay_for_damage');
}

// C ref: zap.c zapsetup() (3413-3418).  The object-zap feedback flag is one
// shared state value, reset for every immediate wand before its callbacks run.
export function zapsetup(state = game) {
    state.go ??= {};
    state.go.obj_zapped = false;
}

// C ref: zap.c zapwrapup() (3421-3427).  System shock sets obj_zapped while a
// pile is being processed; its feedback is emitted only after the ray ends.
export async function zapwrapup(state = game, rawEnv = {}) {
    state.go ??= {};
    if (state.go.obj_zapped) {
        const message = rawEnv.message ?? ttyPline;
        await message('You feel shuddering vibrations.', state, rawEnv);
    }
    state.go.obj_zapped = false;
}

// C ref: zap.c zap_steed() (3087-3217).  The immediate polymorph arm uses the
// ordinary monster callback at the steed's coordinates; unsupported wand
// types still return false so we.effects can continue with its source test.
export async function zap_steed(obj, state = game, random = { rn2, rnd }, rawEnv = {}) {
    const steed = state.u?.usteed;
    if (!steed) return false;
    state.gb ??= {};
    state.gb.bhitpos = { x: steed.mx, y: steed.my };
    state.gn ??= {};
    state.gn.notonhead = false;
    if (obj.otyp !== WAN_POLYMORPH && obj.otyp !== SPE_POLYMORPH)
        return false;
    await bhitm(steed, obj, state, random, rawEnv);
    return true;
}

// C ref: zap.c zap_updown() (3219-3410).  Its polymorph path has no special
// terrain arm: the floor pile is processed on a downward zap, while an upward
// zap only reaches the hiding-under-object callback.
export async function zap_updown(obj, state = game,
    random = { rn2, rnd }, rawEnv = {}) {
    const x = state.u.ux;
    const y = state.u.uy;
    let disclose = false;
    if (state.u.dz > 0) {
        await bhitpile(obj, x, y, state, random, rawEnv, state.u.dz);
        zap_map(x, y, obj, state, random, rawEnv);
    } else if (state.u.dz < 0 && state.u.uundetected
               && hides_under(state.youmonst?.data)) {
        const top = state.level?.objects?.[x]?.[y];
        if (top && await bhito(top, obj, state, random, rawEnv)) {
            // C discards hideunder()'s return.  Hero concealment is an
            // explicit gap in the canonical monster owner, so record it
            // without running the throwing adapter.
            note_unported('mon.c hideunder');
            disclose = true;
        }
    }
    return disclose;
}

// C ref: zap.c weffects() (3430-3476), "called for various wand and spell
// effects - M. Stephenson". dozap()'s final else is its ported caller, so
// `obj` is a wand the hero aimed or a wand with no direction at all.
//
// The ray arm at 3463-3465 and the secret-door-detection part of the NODIR arm
// run. `disclose` turns a ray wand into "a wand of fire" after its effect has
// been seen. zapnodir() owns the equivalent discovery tail for its wand.
//
// hack.h:1477 BZ_OFS_WAN(otyp) is `abs(otyp - WAN_MAGIC_MISSILE) % 10` and
// :1480 BZ_U_WAND(bztyp) is `0 + bztyp`, so the six ray wands become dobuzz()
// types 0..5 in the order objects.h:1488 lists them.
export async function weffects(
    obj, state = game, random = { d, rn1, rn2, rnd, rne, rnl, rnz },
) {
    const otyp = obj.otyp;
    let disclose = false;
    const was_unkn = !objectType(obj, state).oc_name_known;
    const oc_dir = objectType(obj, state).oc_dir;

    await exercise(A_WIS, true, state, random);
    if (state.u.usteed && oc_dir !== NODIR && !state.u.dx && !state.u.dy
        && state.u.dz > 0 && await zap_steed(obj, state, random)) {
        disclose = true;
    } else if (oc_dir === IMMEDIATE) {
        // The immediate callback walk is source-complete for polymorph only.
        // Keep the established weffects() boundary at the caller for all
        // other object effects instead of fabricating a callback result.
        if (otyp !== WAN_POLYMORPH && otyp !== SPE_POLYMORPH)
            throw new UnsupportedZapError(
                `bhit() for immediate object type ${otyp}`,
            );
        zapsetup(state);
        if (state.u.uswallow) {
            await bhitm(state.u.ustuck, obj, state, random);
        } else if (state.u.dz) {
            disclose = await zap_updown(obj, state, random);
        } else {
            await bhit(
                state.u.dx,
                state.u.dy,
                random.rn1(8, 6),
                ZAPPED_WAND,
                bhitm,
                bhito,
                { obj },
                state,
                random,
            );
        }
        await zapwrapup(state);
    } else if (oc_dir === NODIR) {
        await zapnodir(obj, state);
    } else {
        /* neither immediate nor directionless */

        if (otyp === WAN_DIGGING || otyp === SPE_DIG) {
            await zap_dig(state, random);
        } else if (otyp >= SPE_MAGIC_MISSILE && otyp <= SPE_FINGER_OF_DEATH) {
            // A cast ray takes the same dobuzz(), at BZ_U_SPELL() types 10..19
            // and u.ulevel / 2 + 1 dice. spell.c casting is unported.
            throw new UnsupportedZapError('ubuzz() for a spell the hero cast');
        } else if (otyp >= WAN_MAGIC_MISSILE && otyp <= WAN_LIGHTNING) {
            await ubuzz(
                Math.abs(otyp - WAN_MAGIC_MISSILE) % 10,
                (otyp === WAN_MAGIC_MISSILE) ? 2 : 6,
                state, random,
            );
        } else {
            // C's impossible("weffects: unexpected spell or wand"), for a
            // directional object that is neither a dig nor a ray.
            throw new UnsupportedZapError(
                `weffects() for unexpected object type ${otyp}`,
            );
        }
        disclose = true;
    }
    if (disclose) {
        learnwand(obj, state);
        if (was_unkn)
            more_experienced(0, 10, state);
    }
}

// C ref: zap.c cancel_monst() (3150-3212). Cancellation effect on a monster
// or the hero. When called from Magicbane's Mb_hit, allow_cancel_kill and
// self_cancel are both false: inventory cancelling and clay-golem killing are
// skipped. Returns true if cancellation was not resisted.
export async function cancel_monst(
    mdef, obj, youattack, allow_cancel_kill, self_cancel, state = game,
) {
    const youdefend = (mdef === state.youmonst);

    // Resistance check
    if (youdefend
        ? (!youattack && Antimagic_cancel(state))
        : await resist(mdef, obj?.oclass ?? 0, 0, NOTELL, state))
        return false; /* resisted cancellation */

    if (self_cancel) {
        // Inventory cancelling (cancel_item on each item) is not ported.
        note_unported('zap.c cancel_item loop');
    }

    /* now handle special cases */
    if (youdefend) {
        // C's Upolyd is the current-form comparison, rather than a numeric
        // umonnum range test.  Cancellation has a special fatal clay-golem
        // branch before the Unchanging check.
        if (Upolyd(state.u)) {
            if (state.u.umonnum === PM_CLAY_GOLEM) {
                if (!heroIsBlind(state)) {
                    await ttyPline(
                        'Some writing vanishes from your head!', state,
                    );
                } else {
                    const hallucinating = Hallucination(state);
                    await ttyPline(
                        `You feel ${hallucinating ? 'dark' : 'light'} headed.`,
                        state,
                    );
                }
                state.u.mh = 0;
            }
            if (heroHasProperty(state, UNCHANGING) && state.u.mh > 0) {
                await ttyPline(
                    'Your amulet grows hot for a moment, then cools.', state,
                );
            } else {
                await rehumanize(state);
            }
        }
    } else {
        mdef.mcan = 1;
        /* force shapeshifter into its base form or mimic to unhide */
        await normal_shape(mdef, state);

        if (mdef.data === state.mons[PM_CLAY_GOLEM]) {
            // Display message for clay golem (allow_cancel_kill controls
            // whether the golem is killed; Magicbane passes false)
            if (allow_cancel_kill) {
                note_unported('zap.c cancel_monst kill path');
            }
        }
    }
    return true;
}

// Local helpers for cancel_monst to avoid importing from artifacts.js
// (which would create a tighter circular dependency).
function Antimagic_cancel(state) {
    const p = state.u?.uprops?.[ANTIMAGIC];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
