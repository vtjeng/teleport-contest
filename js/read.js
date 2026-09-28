// read.js -- reading scrolls and spellbooks, plus monster-creation helpers.
// C refs: src/read.c text helpers, read_ok(), doread(), seffects(),
// cant_revive(), create_particular_parse(), create_particular_creation(),
// and create_particular(). doread() keeps the source-ordered readable-object
// dispatch, literacy handling, spellbook early return, and scroll in_use /
// effect / consumption sequence. Effect helpers still marked with
// note_unported() are void callees; the command continues as C does while
// recording their source gaps.
// wizcmds.c wiz_genesis() calls the monster-creation helpers.

import {
    A_WIS,
    A_CON,
    ALL_SPELLS,
    BLINDED,
    BY_COOKIE,
    COLNO,
    CONFUSION,
    INVIS,
    SEE_INVIS,
    DEAF,
    UNCHANGING,
    DISP_BEAM,
    DISP_END,
    EXPL_FIERY,
    HALF_SPDAM,
    HAND,
    HEAD,
    LEG,
    IS_AIR,
    IS_OBSTRUCTED,
    KILLED_BY_AN,
    KILLED_BY,
    GENOCIDED,
    POLY_REVERT,
    POLYMORPH,
    FAINTED,
    M_SEEN_FIRE,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FEMALE,
    CORR,
    COST_DEGRD,
    COST_DECHNT,
    COST_UNCURS,
    COST_UNCHRG,
    PLNMSG_TOWER_OF_FLAME,
    GETOBJ_ALLOWCNT,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    G_GONE,
    G_EXTINCT,
    G_GENOD,
    HALLUC,
    HALLUC_RES,
    MALE,
    MM_FEMALE,
    MM_EDOG,
    MM_MINVIS,
    MM_MALE,
    MM_NOMSG,
    MM_NOEXCLAM,
    NO_MINVENT,
    NEUTRAL,
    NOTELL,
    NO_MM_FLAGS,
    ROWNO,
    ROOMOFFSET,
    LS_OBJECT,
    thats_enough_tries,
    SPE_LIM,
    HALF_PHDAM,
    A_STR,
    LEFT_RING,
    RIGHT_RING,
    nothing_happens,
    STOMACH,
    W_BALL,
    W_ART,
    W_ARTI,
    W_CHAIN,
    W_ARMH,
    W_ARM,
    W_SADDLE,
    TT_BURIEDBALL,
    WT_IRON_BALL_INCR,
    Is_rogue_level,
    Is_waterlevel,
    engulfing_u,
    isok,
    ismnum,
    OBJ_AT,
    u_at,
    LL_CONDUCT,
    LL_GENOCIDE,
    MAX_ERODE,
    OBJ_FREE,
    OBJ_INVENT,
    Upolyd,
    Ugender,
    plur,
} from './const.js';
import {
    PM_SAMURAI,
    PM_NINJA,
    LOW_PM,
    G_NOCORPSE,
    G_UNIQ,
    NON_PM,
    PM_ACID_BLOB,
    PM_ALIGNED_CLERIC,
    PM_ANGEL,
    PM_DOPPELGANGER,
    PM_BARBED_DEVIL,
    PM_FIRE_ANT,
    PM_FLESH_GOLEM,
    PM_GIANT_BAT,
    PM_GUARD,
    PM_BLACK_LIGHT,
    PM_GREMLIN,
    PM_HELL_HOUND,
    PM_HIGH_CLERIC,
    PM_HUMAN_ZOMBIE,
    PM_IMP,
    PM_LARGE_MIMIC,
    PM_LEOCROTTA,
    PM_LONG_WORM,
    PM_LONG_WORM_TAIL,
    PM_MARILITH,
    PM_PIRANHA,
    PM_PYROLISK,
    PM_SCORPION,
    PM_SHOPKEEPER,
    PM_STALKER,
    PM_TOURIST,
    PM_YELLOW_LIGHT,
    PM_WATER_MOCCASIN,
    PM_WIZARD,
    PM_XAN,
    MS_GUARDIAN,
    MS_LEADER,
    MS_NEMESIS,
    S_EEL,
    S_HUMAN,
    S_MIMIC,
    S_WORM_TAIL,
    S_invisible,
} from './monsters.js';
import { makeplural } from './fruit.js';
import {
    mungspaces,
    dist2,
    s_suffix,
    strstri,
    upstart,
    upwords,
} from './hacklib.js';
import { game } from './gstate.js';
import {
    check_capacity,
    losehp,
    notice_mon_off,
    notice_mon_on,
} from './hack.js';
import {
    getobj, identify_pack, obfree, stackobj, update_inventory, useup,
} from './invent.js';
import { getlin } from './windows.js';
import {
    is_female,
    is_male,
    is_demon,
    is_human,
    is_vampire,
    is_vampshifter,
    type_is_pname,
    can_chant,
    amorphous,
    is_whirly,
    hides_under,
    is_hider,
    name_to_monclass,
    name_to_monplus,
    mhim,
    noncorporeal,
    passes_walls,
    unsolid,
    unique_corpstat,
    monstseesu,
    monstunseesu,
} from './mondata.js';
import {
    can_saddle,
    initedog,
    put_saddle_on_mon,
    tamedog,
} from './dog.js';
import { makemon_runtime, newcham } from './makemon_create.js';
import {
    create_critters,
    mkclass,
    rndmonst,
    set_malign,
} from './makemon.js';
import { monster_census } from './minion.js';
import { Monnam, hcolor, hliquid, mon_nam } from './do_name.js';
import {
    flash_mon, setmangry, wake_nearto, wakeup,
} from './mon.js';
import {
    MAXMCLASSES, S_goodpos,
} from './symbols.js';
import { DEFAULT_PRIMARY_SYMBOLS, SYM_OFF_M } from './symbol_data.js';
import {
    ALCHEMY_SMOCK,
    ARMOR_CLASS,
    BALL_CLASS,
    BOULDER,
    BRASS_LANTERN,
    CHAIN_CLASS,
    CAN_OF_GREASE,
    BELL_OF_OPENING,
    CANDY_BAR,
    COIN_CLASS,
    GEM_CLASS,
    LEASH,
    LOADSTONE,
    POT_WATER,
    CORNUTHAUM,
    CREDIT_CARD,
    DUNCE_CAP,
    FORTUNE_COOKIE,
    HAWAIIAN_SHIRT,
    MAGIC_MARKER,
    MAGIC_LAMP,
    OIL_LAMP,
    RING_CLASS,
    CRYSTAL_BALL,
    HORN_OF_PLENTY,
    BAG_OF_TRICKS,
    TINNING_KIT,
    EXPENSIVE_CAMERA,
    MAGIC_FLUTE,
    MAGIC_HARP,
    FROST_HORN,
    FIRE_HORN,
    DRUM_OF_EARTHQUAKE,
    SCR_AMNESIA,
    SCR_BLANK_PAPER,
    SCR_CHARGING,
    SCR_CONFUSE_MONSTER,
    SCR_CREATE_MONSTER,
    SCR_EARTH,
    SCR_ENCHANT_ARMOR,
    SCR_FIRE,
    SCR_FOOD_DETECTION,
    SCR_GENOCIDE,
    SCR_GOLD_DETECTION,
    SCR_MAIL,
    SCR_SCARE_MONSTER,
    SCR_STINKING_CLOUD,
    BLACK_DRAGON_SCALES,
    BLACK_DRAGON_SCALE_MAIL,
    ELVEN_BOOTS,
    ELVEN_CLOAK,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ELVEN_SHIELD,
    GRAY_DRAGON_SCALES,
    GRAY_DRAGON_SCALE_MAIL,
    SHIELD_OF_REFLECTION,
    SILVER_DRAGON_SCALES,
    SILVER_DRAGON_SCALE_MAIL,
    SCR_TAMING,
    ROCK,
    SCROLL_CLASS,
    SCR_DESTROY_ARMOR,
    SCR_ENCHANT_WEAPON,
    TOOL_CLASS,
    WAND_CLASS,
    WAN_WISHING,
    WAN_NOTHING,
    WAN_CANCELLATION,
    WAN_DEATH,
    WAN_POLYMORPH,
    WAN_UNDEAD_TURNING,
    WAN_COLD,
    WAN_FIRE,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WEAPON_CLASS,
    NODIR,
    SCR_IDENTIFY,
    SCR_LIGHT,
    SCR_MAGIC_MAPPING,
    SCR_PUNISHMENT,
    SCR_REMOVE_CURSE,
    SCR_TELEPORTATION,
    SPE_CAUSE_FEAR,
    SPE_BLANK_PAPER,
    SPE_BOOK_OF_THE_DEAD,
    SPE_CHARM_MONSTER,
    SPE_CONFUSE_MONSTER,
    SPE_DETECT_FOOD,
    SPE_CREATE_MONSTER,
    SPE_IDENTIFY,
    SPE_MAGIC_MAPPING,
    SPE_NOVEL,
    SPE_REMOVE_CURSE,
    SPBOOK_CLASS,
    T_SHIRT,
} from './objects.js';
import {
    bcsign,
    greatest_erosion,
    Is_dragon_scales,
    is_flammable,
    is_shield,
    is_weptool,
    bless,
    blessorcurse,
    curse,
    uncurse,
    costly_alteration,
    maybe_adjust_light,
    mkobj,
    mksobj,
    objectType,
    uslinging,
    place_object,
    weight,
} from './obj.js';
import { adjalign, exercise } from './attrib.js';
import { wipeout_text } from './engrave.js';
import {
    do_mapping,
    food_detect,
    gold_detect,
    trap_detect,
} from './detect.js';
import { level_tele, scrolltele } from './teleport.js';
import { Fire_resistance, lightdamage, resist } from './zap.js';
import { discover_object } from './o_init.js';
import { more_experienced } from './exper.js';
import { d, rn1, rn2, rne, rnl, rnd } from './rng.js';
import { ttyPline, ttyUrgentPline } from './tty_message.js';
import {
    cmap_to_glyph, map_invisible, newsym, tmp_at,
} from './display.js';
import { flooreffects, trycall } from './do.js';
import { y_n } from './cmd.js';
import {
    study_book,
    losespells,
} from './spell.js';
import {
    Ring_gone,
    Ring_off,
    Ring_on,
    adj_abon,
    destroy_arm,
    some_armor,
    setwornEnv,
} from './do_wear.js';
import { setworn, which_armor } from './worn.js';
import { chwepon } from './wield.js';
import {
    ART_ORB_OF_FATE,
    ART_SUNSWORD,
    artifact_light,
    is_art,
} from './artifacts.js';
import { arti_light_radius, del_light_source } from './light.js';
import { light_hits_gremlin } from './uhitm.js';
import {
    block_point, cansee, do_clear_area, does_block, unblock_point,
    vision_recalc,
} from './vision.js';
import { canSpotMonster } from './startup_a11y.js';
import { m_at } from './monst.js';
import { hard_helmet } from './do_wear.js';
import { dmgval, drain_weapon_skill } from './weapon.js';
import { objectGenerationEnv } from './object_generation.js';
import { body_part, mbodypart } from './polyself.js';
import { make_confused, strange_feeling } from './potion.js';
// read.js -> monmove.js -> muse.js -> read.js is a function-body-only cycle:
// these imported helpers are first read during gameplay.
import { closed_door, monflee, youHear } from './monmove.js';
import {
    avoid_ceiling, ceiling, has_ceiling, on_level,
} from './dungeon.js';
import { heroUnaware, livelog_printf, verbalize } from './pline.js';
import {
    an,
    simpleonames,
    singular,
    suit_simple_name,
    Yname2,
    Tobjnam,
    otense,
    donameFresh,
    The,
    erosion_matters,
    vtense,
    Yobjnam2,
    xnameFresh,
} from './objnam.js';
import { alter_cost, shk_your } from './shk.js';
import { pmname } from './do_name.js';
import { outrumor } from './random_text.js';
import { note_unported } from './unported.js';
import { getpos } from './getpos.js';
import { explode } from './explode.js';
import { create_gas_cloud, valid_cloud_pos } from './region.js';
import { end_burn } from './timeout.js';
import { encumber_msg } from './pickup.js';
import { remove_worn_item } from './steal.js';

// Retained for narrower effect-family branches that still fail closed. The
// source-ordered doread() and seffects() dispatches use note_unported() for
// whole void effect callees that have not been implemented yet.
export class UnsupportedReadError extends Error {
    constructor(branch) {
        super(`reading requires ${branch}`);
        this.name = 'UnsupportedReadError';
        this.branch = branch;
    }
}

const SHIRT_MESSAGES = Object.freeze([
    'I explored the Dungeons of Doom and all I got was this lousy T-shirt!',
    'Is that Mjollnir in your pocket or are you just happy to see me?',
    "It's not the size of your sword, it's how #enhance'd you are with it.",
    "Madame Elvira's House O' Succubi Lifetime Customer",
    "Madame Elvira's House O' Succubi Employee of the Month",
    'Ludios Vault Guards Do It In Small, Dark Rooms',
    'Yendor Military Soldiers Do It In Large Groups',
    'I survived Yendor Military Boot Camp',
    'Ludios Accounting School Intra-Mural Lacrosse Team',
    'Oracle(TM) Fountains 10th Annual Wet T-Shirt Contest',
    'Hey, black dragon!  Disintegrate THIS!',
    "I'm With Stupid -->",
    "Don't blame me, I voted for Izchak!",
    "Don't Panic",
    'Furinkan High School Athletic Dept.',
    'Hel-LOOO, Nurse!',
    '=^.^=',
    '100% goblin hair - do not wash',
    'Aberzombie and Fitch',
    'cK -- Cockatrice touches the Kop',
    "Don't ask me, I only adventure here",
    'Down with pants!',
    'd, your dog or a killer?',
    'FREE PUG AND NEWT!',
    'Go team ant!',
    'Got newt?',
    'Hello, my darlings!',
    'Hey!  Nymphs!  Steal This T-Shirt!',
    'I <3 Dungeon of Doom',
    'I <3 Maud',
    'I am a Valkyrie.  If you see me running, try to keep up.',
    'I am not a pack rat - I am a collector',
    'I bounced off a rubber tree',
    'Plunder Island Brimstone Beach Club',
    'If you can read this, I can hit you with my polearm',
    "I'm confused!",
    'I scored with the princess',
    'I want to live forever or die in the attempt.',
    'Lichen Park',
    'LOST IN THOUGHT - please send search party',
    'Meat is Mordor',
    'Minetown Better Business Bureau',
    'Minetown Watch',
    "Ms. Palm's House of Negotiable Affection--A Very Reputable"
        + ' House Of Disrepute',
    'Protection Racketeer',
    'Real men love Crom',
    'Somebody stole my Mojo!',
    'The Hellhound Gang',
    'The Werewolves',
    'They Might Be Storm Giants',
    'Weapons don\'t kill people, I kill people',
    'White Zombie',
    "You're killing me!",
    'Anhur State University - Home of the Fighting Fire Ants!',
    'FREE HUGS',
    'Serial Ascender',
    'Real men are valkyries',
    "Young Men's Cavedigging Association",
    'Occupy Fort Ludios',
    "I couldn't afford this T-shirt so I stole it!",
    'Mind flayers suck',
    "I'm not wearing any pants",
    'Down with the living!',
    'Pudding farmer',
    'Vegetarian',
    'Hello, I\'m War!',
    'It is better to light a candle than to curse the darkness',
    'It is easier to curse the darkness than to light a candle',
    'rock--paper--scissors--lizard--Spock!',
    '/Valar morghulis/ -- /Valar dohaeris/',
]);

const HAWAIIAN_MOTIFS = Object.freeze([
    'flamingo', 'parrot', 'toucan', 'bird of paradise',
    'sea turtle', 'tropical fish', 'jellyfish', 'giant eel',
    'water nymph', 'plumeria', 'orchid', 'hibiscus flower',
    'palm tree', 'hula dancer', 'sailboat', 'ukulele',
]);

const HAWAIIAN_BACKGROUNDS = Object.freeze([
    'purple', 'yellow', 'red', 'blue', 'orange', 'black', 'green',
    'abstract', 'geometric', 'patterned', 'naturalistic',
]);

const APRON_MESSAGES = Object.freeze([
    'Kiss the cook',
    "I'm making SCIENCE!",
    "Don't mess with the chef",
    "Don't make me poison you",
    "Gehennom's Kitchen",
    'Rat: The other white meat',
    'If you can\'t stand the heat, get out of Gehennom!',
    'If we weren\'t meant to eat animals, why are they made out of meat?',
    "If you don't like the food, I'll stab you",
    'I am an alchemist; if you see me running, try to catch up...',
]);

const CANDY_WRAPPERS = Object.freeze([
    '', 'Apollo', 'Moon Crunchy', 'Snacky Cake', 'Chocolate Nuggie',
    'The Small Bar', 'Crispy Yum Yum', 'Nilla Crunchie', 'Berry Bar',
    'Choco Nummer', 'Om-nom', 'Fruity Oaty', 'Wonka Bar',
]);

// C refs: read.c erode_obj_text(), tshirt_text(), hawaiian_motif(),
// hawaiian_design(), apron_text(), and candy_wrapper_text(). C fills caller
// buffers; these functions return equivalent strings and keep source names.
export function erode_obj_text(obj, text, state = game) {
    const erosion = greatest_erosion(obj);
    if (!erosion) return text;
    const count = Math.trunc(text.length * erosion / (2 * MAX_ERODE));
    const seed = (Math.trunc(obj.o_id ?? 0)
        ^ (Math.trunc(state.ubirthday ?? 0) >>> 0)) >>> 0;
    return wipeout_text(text, count, seed, { state });
}

export function tshirt_text(tshirt, state = game) {
    const text = SHIRT_MESSAGES[
        Math.trunc(tshirt.o_id ?? 0) % SHIRT_MESSAGES.length
    ];
    return erode_obj_text(tshirt, text, state);
}

export function hawaiian_motif(shirt, state = game) {
    const seed = (Math.trunc(shirt.o_id ?? 0)
        ^ (Math.trunc(state.ubirthday ?? 0) >>> 0)) >>> 0;
    return HAWAIIAN_MOTIFS[seed % HAWAIIAN_MOTIFS.length];
}

export function hawaiian_design(shirt, state = game) {
    const backgroundSeed = (Math.trunc(shirt.o_id ?? 0)
        ^ ~Math.trunc(state.ubirthday ?? 0)) >>> 0;
    const background = HAWAIIAN_BACKGROUNDS[
        backgroundSeed % HAWAIIAN_BACKGROUNDS.length
    ];
    return `${makeplural(hawaiian_motif(shirt, state))} on ${an(background)} background`;
}

export function apron_text(apron, state = game) {
    const text = APRON_MESSAGES[
        Math.trunc(apron.o_id ?? 0) % APRON_MESSAGES.length
    ];
    return erode_obj_text(apron, text, state);
}

export function candy_wrapper_text(obj) {
    const index = Math.trunc(obj.spe ?? 0) % CANDY_WRAPPERS.length;
    return CANDY_WRAPPERS[index];
}

// C ref: read.c read_ok() (313-322). Scrolls and spellbooks appear as likely
// choices. Other carried objects remain selectable but are omitted from the
// suggested-letter set, and the hands/self sentinel is excluded.
export function read_ok(obj) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.oclass === SCROLL_CLASS || obj.oclass === SPBOOK_CLASS)
        return GETOBJ_SUGGEST;
    return GETOBJ_DOWNPLAY;
}

// C ref: read.c cap_spe() (80-86). Keep rechargeable charges within the
// signed source limit after an effect has finished.
export function cap_spe(obj) {
    if (obj && Math.abs(obj.spe) > SPE_LIM)
        obj.spe = Math.sign(obj.spe) * SPE_LIM;
}

// C ref: read.c stripspe() (652-664). Message and shop bookkeeping precede
// the charge/age mutation, as in the source.
async function stripspe(obj, state = game) {
    if (obj.blessed || obj.spe <= 0) {
        await ttyPline(nothing_happens, state);
    } else {
        await ttyPline(`${Yobjnam2(obj, 'vibrate', state)} briefly.`, state);
        sourceCostlyAlteration(obj, COST_UNCHRG, state);
        obj.spe = 0;
        if (obj.otyp === OIL_LAMP || obj.otyp === BRASS_LANTERN)
            obj.age = 0;
    }
}

function heroIsBlind(state) {
    return propertyActive(BLINDED, state);
}

// C refs: read.c p_glow1/2/3() (667-685). Blindness changes both the verb and
// whether the color formatter is called, which can affect hallucination RNG.
async function p_glow1(obj, state = game) {
    const verb = heroIsBlind(state) ? 'vibrate' : 'glow';
    await ttyPline(`${Yobjnam2(obj, verb, state)} briefly.`, state);
}

async function p_glow2(obj, color, state = game) {
    const blind = heroIsBlind(state);
    const verb = blind ? 'vibrate' : 'glow';
    const suffix = blind ? '' : ` ${hcolor(color, state)}`;
    await ttyPline(`${Yobjnam2(obj, verb, state)}${suffix} for a moment.`, state);
}

async function p_glow3(obj, color, state = game) {
    const blind = heroIsBlind(state);
    const verb = blind ? 'vibrate' : 'glow';
    const suffix = blind ? '' : ` ${hcolor(color, state)}`;
    await ttyPline(`${Yobjnam2(obj, verb, state)} feebly${suffix} for a moment.`, state);
}

// C ref: read.c charge_ok() (689-724). Filter for getobj() when choosing an
// object to recharge: wands are suggested, identified chargeable rings and
// tools are suggested, and everything else is excluded but selectable.
export function charge_ok(obj) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.oclass === WAND_CLASS) return GETOBJ_SUGGEST;
    if (obj.oclass === RING_CLASS && objectType(obj.otyp).oc_charged
        && obj.dknown && objectType(obj.otyp).oc_name_known)
        return GETOBJ_SUGGEST;
    if (is_weptool(obj)) return GETOBJ_EXCLUDE;
    if (obj.oclass === TOOL_CLASS) {
        if (obj.otyp === BRASS_LANTERN
            || obj.otyp === OIL_LAMP
            || (obj.otyp === MAGIC_LAMP
                && !objectType(MAGIC_LAMP).oc_name_known))
            return GETOBJ_SUGGEST;
        if (objectType(obj.otyp).oc_charged)
            return (obj.dknown && objectType(obj.otyp).oc_name_known)
                ? GETOBJ_SUGGEST : GETOBJ_DOWNPLAY;
        return GETOBJ_EXCLUDE;
    }
    return GETOBJ_EXCLUDE_SELECTABLE;
}

function maybeHalfPhysical(damage, state) {
    const half = state.u?.uprops?.[HALF_PHDAM];
    return half?.intrinsic || half?.extrinsic
        ? Math.trunc((damage + 1) / 2) : damage;
}

// C ref: read.c recharge() (729-1008). Keep object class order, short-circuit
// tests, mutations, messages, and random draws in source order. Side-effect
// helpers whose C results are discarded remain named gaps where their JS
// owner is not yet available.
export async function recharge(obj, curseBless, state = game) {
    let n;
    const isCursed = curseBless < 0;
    const isBlessed = curseBless > 0;

    if (obj.oclass === WAND_CLASS) {
        const type = objectType(obj, state);
        const limit = obj.otyp === WAN_WISHING ? 1
            : type.oc_dir !== NODIR ? 8 : 15;

        if (obj.spe === -1) obj.spe = 0;
        n = Math.trunc(obj.recharged ?? 0);
        if (n > 0 && (obj.otyp === WAN_WISHING
            || n * n * n > rn2(7 * 7 * 7))) {
            await wand_explode(obj, rnd(limit), state);
            return;
        }
        obj.recharged = n + 1;
        if (isCursed) {
            await stripspe(obj, state);
        } else {
            n = limit === 1 ? 1 : rn1(5, limit + 1 - 5);
            if (!isBlessed) n = rnd(n);
            if (obj.spe < n) obj.spe = n;
            else obj.spe++;
            if (obj.otyp === WAN_WISHING && obj.spe > 3) {
                await wand_explode(obj, 1, state);
                return;
            }
            if (limit === 1) await p_glow3(obj, 'blue', state);
            else if (obj.spe >= limit) await p_glow2(obj, 'blue', state);
            else await p_glow1(obj, state);
        }
    } else if (obj.oclass === RING_CLASS
        && objectType(obj, state).oc_charged) {
        // C chooses the adjustment before testing for destruction.
        const adjustment = isBlessed ? rnd(3)
            : isCursed ? -rnd(2) : 1;
        const isOn = obj === state.uleft || obj === state.uright;
        let explodes = obj.spe > rn2(7);
        if (!explodes) explodes = obj.spe <= -5;

        if (explodes) {
            await ttyPline(
                `${Yobjnam2(obj, 'pulsate', state)} momentarily, then `
                + `${otense(obj, 'explode')}!`, state,
            );
            if (isOn) await Ring_gone(obj, state);
            n = rnd(3 * Math.abs(obj.spe));
            useup(obj, { state });
            await losehp(
                maybeHalfPhysical(n, state), 'exploding ring',
                KILLED_BY_AN, state,
            );
        } else {
            const mask = isOn
                ? obj === state.uleft ? LEFT_RING : RIGHT_RING
                : 0;
            await ttyPline(
                `${Yname2(obj, state)} spins `
                + `${adjustment < 0 ? 'counter' : ''}clockwise for a moment.`,
                state,
            );
            if (adjustment < 0)
                sourceCostlyAlteration(obj, COST_DECHNT, state);
            if (isOn) await Ring_off(obj, state);
            obj.spe += adjustment;
            if (isOn) {
                setworn(obj, mask, setwornEnv(state));
                await Ring_on(obj, state);
            }
            if (adjustment > 0 && obj.unpaid)
                alter_cost(obj, 0, state);
        }
    } else if (obj.oclass === TOOL_CLASS) {
        const rechrg = Math.trunc(obj.recharged ?? 0);
        if (objectType(obj, state).oc_charged && rechrg < 7)
            obj.recharged = rechrg + 1;

        switch (obj.otyp) {
        case BELL_OF_OPENING:
            if (isCursed) await stripspe(obj, state);
            else if (isBlessed) obj.spe += rnd(3);
            else obj.spe++;
            if (obj.spe > 5) obj.spe = 5;
            break;
        case MAGIC_MARKER:
        case TINNING_KIT:
        case EXPENSIVE_CAMERA:
            if (isCursed) {
                await stripspe(obj, state);
            } else if (rechrg && obj.otyp === MAGIC_MARKER) {
                obj.recharged = 1;
                if (obj.spe < 3)
                    await ttyPline('Your marker seems permanently dried out.', state);
                else
                    await ttyPline(nothing_happens, state);
            } else if (isBlessed) {
                n = rn1(16, 15);
                if (obj.spe + n <= 50) obj.spe = 50;
                else if (obj.spe + n <= 75) obj.spe = 75;
                else if (obj.spe + n > 127) obj.spe = 127;
                else obj.spe += n;
                await p_glow2(obj, 'blue', state);
            } else {
                n = rn1(11, 10);
                if (obj.spe + n <= 50) obj.spe = 50;
                else if (obj.spe + n > SPE_LIM) obj.spe = SPE_LIM;
                else obj.spe += n;
                await p_glow2(obj, 'white', state);
            }
            break;
        case OIL_LAMP:
        case BRASS_LANTERN:
            if (isCursed) {
                await stripspe(obj, state);
                if (obj.lamplit) {
                    if (!heroIsBlind(state))
                        await ttyPline(`${Tobjnam(obj, 'go', state)} out!`, state);
                    end_burn(obj, true, { state });
                }
            } else if (isBlessed) {
                obj.spe = 1;
                obj.age = 1500;
                await p_glow2(obj, 'blue', state);
            } else {
                obj.spe = 1;
                obj.age += 750;
                if (obj.age > 1500) obj.age = 1500;
                await p_glow1(obj, state);
            }
            break;
        case CRYSTAL_BALL:
            if (obj.spe === -1) obj.spe = 0;
            if (isCursed) {
                if (!obj.cursed) {
                    await p_glow2(obj, 'black', state);
                    curse(obj, { state });
                } else {
                    await ttyPline(`${Yobjnam2(obj, 'vibrate', state)} briefly.`, state);
                }
                if (obj.spe > 0)
                    sourceCostlyAlteration(obj, COST_UNCHRG, state);
                obj.spe = 0;
            } else if (isBlessed) {
                obj.spe = 7;
                await p_glow2(obj, obj.blessed ? 'blue' : 'light blue', state);
                if (!obj.blessed) await bless(obj, { state });
            } else if (obj.spe < 7 || obj.cursed) {
                n = rnd(2);
                obj.spe = Math.min(obj.spe + n, 7);
                if (!obj.cursed) {
                    await p_glow1(obj, state);
                } else {
                    await p_glow2(obj, 'amber', state);
                    await uncurse(obj, { state });
                }
            } else {
                await ttyPline(nothing_happens, state);
            }
            break;
        case HORN_OF_PLENTY:
        case BAG_OF_TRICKS:
        case CAN_OF_GREASE:
            if (isCursed) {
                await stripspe(obj, state);
            } else if (isBlessed) {
                obj.spe += obj.spe <= 10 ? rn1(10, 6) : rn1(5, 6);
                if (obj.spe > 50) obj.spe = 50;
                await p_glow2(obj, 'blue', state);
            } else {
                obj.spe += rn1(5, 2);
                if (obj.spe > 50) obj.spe = 50;
                await p_glow1(obj, state);
            }
            break;
        case MAGIC_FLUTE:
        case MAGIC_HARP:
        case FROST_HORN:
        case FIRE_HORN:
        case DRUM_OF_EARTHQUAKE:
            if (isCursed) {
                await stripspe(obj, state);
            } else if (isBlessed) {
                obj.spe += d(2, 4);
                if (obj.spe > 20) obj.spe = 20;
                await p_glow2(obj, 'blue', state);
            } else {
                obj.spe += rnd(4);
                if (obj.spe > 20) obj.spe = 20;
                await p_glow1(obj, state);
            }
            break;
        default:
            await ttyPline('You have a feeling of loss.', state);
            break;
        }
    } else {
        await ttyPline('You have a feeling of loss.', state);
    }

    cap_spe(obj);
}

// C ref: read.c seffect_charging() (1788-1827). The boolean is the JS form of
// C's `struct obj **` consumption channel used by seffects().
export async function seffect_charging(scroll, state = game) {
    const otyp = scroll.otyp;
    const blessed = Boolean(scroll.blessed);
    const cursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);
    const alreadyKnown = scroll.oclass === SPBOOK_CLASS
        || objectType(otyp, state).oc_name_known;

    if (confused) {
        if (cursed) {
            await ttyPline('You feel discharged.', state);
            state.u.uen = 0;
        } else {
            await ttyPline('You feel charged up!', state);
            state.u.uen += d(blessed ? 6 : 4, 4);
            if (state.u.uen > state.u.uenmax)
                state.u.uenmax = state.u.uen;
            else
                state.u.uen = state.u.uenmax;
        }
        state.disp ??= {};
        state.disp.botl = true;
        return false;
    }

    if (!alreadyKnown) {
        await ttyPline('This is a charging scroll.', state);
        learnscroll(scroll, state);
    }
    useup(scroll, { state });
    const target = await getobj(
        'charge', charge_ok, GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state,
    );
    if (target)
        await recharge(target, cursed ? -1 : blessed ? 1 : 0, state);
    return true;
}

// C ref: read.c wand_explode() (2414-2456). The object is consumed after the
// fatal-damage check just as C orders it; exercise() owns its trailing
// encumbrance callback for Strength.
export async function wand_explode(obj, charge, state = game) {
    const expl = !charge ? 'suddenly' : 'vibrates violently and';
    let n;
    let sides;
    if (!charge) charge = 2;
    n = obj.spe + charge;
    if (n < 2) n = 2;
    switch (obj.otyp) {
    case WAN_WISHING:
        sides = 12;
        break;
    case WAN_CANCELLATION:
    case WAN_DEATH:
    case WAN_POLYMORPH:
    case WAN_UNDEAD_TURNING:
        sides = 10;
        break;
    case WAN_COLD:
    case WAN_FIRE:
    case WAN_LIGHTNING:
    case WAN_MAGIC_MISSILE:
        sides = 8;
        break;
    case WAN_NOTHING:
        sides = 4;
        break;
    default:
        sides = 6;
        break;
    }
    const damage = d(n, sides);
    obj.in_use = true;
    await ttyPline(`${Yname2(obj, state)} ${expl} explodes!`, state);
    await losehp(
        maybeHalfPhysical(damage, state), 'exploding wand',
        KILLED_BY_AN, state,
    );
    useup(obj, { state });
    await exercise(
        A_STR, false, state, { rn2 },
        { encumberMessage: encumber_msg },
    );
}

function propertyActive(property, state) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

// C ref: read.c seffect_confuse_monster() (1399-1451). `Confusion` is
// HConfusion, so this effect tests and updates only the intrinsic timeout;
// blindness/invisibility, by contrast, use their full property predicates.
export async function seffect_confuse_monster(sobj, state = game, env = {}) {
    const random = env.random ?? { rn1, rn2, rnd };
    const message = env.message ?? ttyPline;
    const confusion = state.u.uprops[CONFUSION] ??= {
        intrinsic: 0,
        extrinsic: 0,
    };
    const hconfusion = confusion.intrinsic ?? 0;
    const sblessed = Boolean(sobj.blessed);
    const scursed = Boolean(sobj.cursed);
    const confused = hconfusion !== 0;
    // youprop.h: Invisible is Invis && !See_invisible.
    const seeInvisible = state.u.uprops[SEE_INVIS];
    const altfeedback = propertyActive(BLINDED, state)
        || (propertyActive(INVIS, state)
            && !seeInvisible?.intrinsic && !seeInvisible?.extrinsic);
    const hands = makeplural(body_part(HAND, state.youmonst));

    if (state.youmonst?.data?.mlet !== S_HUMAN || scursed) {
        if (!hconfusion) {
            let prefix = 'You feel';
            if (Math.trunc(state.multi ?? 0) < 0) {
                const { unconscious } = await import('./trap.js');
                if (unconscious(state) || state.u?.uhs === FAINTED)
                    prefix = 'You dream that you feel';
            }
            await message(`${prefix} confused.`, state);
        }
        await make_confused(
            hconfusion + random.rnd(100), false, state, { message },
        );
    } else if (confused) {
        if (!sblessed) {
            await message(
                `Your ${hands} begin to ${altfeedback
                    ? 'tingle' : `glow ${hcolor('purple', state)}`}.`,
                state,
            );
            await make_confused(
                hconfusion + random.rnd(100), false, state, { message },
            );
        } else {
            await message(
                `A ${altfeedback ? 'faint buzz'
                    : `${hcolor('red', state)} glow`} surrounds your `
                    + `${body_part(HEAD, state.youmonst)}.`,
                state,
            );
            await make_confused(0, true, state, { message });
        }
    } else {
        // read.c distinguishes scrolls (starting increment 3) from the
        // spell.c duplicate, whose pseudo-object has SPBOOK_CLASS.
        let incr = sobj.oclass === SCROLL_CLASS ? 3 : 0;
        if (!sblessed) {
            if (altfeedback) {
                await message(
                    `Your ${hands} tingle${state.u.umconf ? ' even more' : ''}.`,
                    state,
                );
            } else if (!state.u.umconf) {
                await message(
                    `Your ${hands} begin to glow ${hcolor('red', state)}.`,
                    state,
                );
            } else {
                await message(
                    `The ${hcolor('red', state)} glow of your ${hands} intensifies.`,
                    state,
                );
            }
            incr += random.rnd(2);
        } else {
            if (altfeedback) {
                await message(
                    `Your ${hands} tingle ${state.u.umconf
                        ? 'even more' : 'very'} sharply.`,
                    state,
                );
            } else {
                await message(
                    `Your ${hands} glow ${state.u.umconf
                        ? 'an even more' : 'a'} brilliant ${hcolor('red', state)}.`,
                    state,
                );
            }
            incr += random.rn1(8, 2);
        }
        // Repeated uses become less effective after the C threshold.
        if (state.u.umconf >= 40) incr = 1;
        state.u.umconf += incr;
    }
}

// C ref: read.c seffect_scare_monster() (1454-1485). C's fmon chain is
// represented by level.monlist; the effect silently asks zap.c:resist()
// whether visible monsters flee, and emits sound feedback only for a scroll
// or an empty non-pet count. Spell callers share this effect through seffects().
export async function seffect_scare_monster(sobj, state = game) {
    const confused = propertyActive(CONFUSION, state);
    let count = 0;

    for (let mtmp = state.level?.monlist ?? state.fmon;
        mtmp; mtmp = mtmp.nmon) {
        if (mtmp.mhp < 1) continue; /* DEADMONSTER() */
        if (!cansee(mtmp.mx, mtmp.my, state)) continue;

        if (confused || sobj.cursed) {
            mtmp.mflee = 0;
            mtmp.mfrozen = 0;
            mtmp.msleeping = 0;
            mtmp.mcanmove = 1;
        } else if (!(await resist(
            mtmp, sobj.oclass, 0, NOTELL, state,
        ))) {
            // C discards monflee()'s void result but still performs its full
            // state and output effects. It can draw for a fleeing vrock.
            await monflee(mtmp, 0, false, false, {
                state,
                createGasCloud: (x, y, size, damage, effectEnv) =>
                    create_gas_cloud(x, y, size, damage, {
                        ...effectEnv,
                        blockPoint: (cx, cy) => block_point(cx, cy, state),
                        unblockPoint: (cx, cy) =>
                            unblock_point(cx, cy, state),
                        doesBlock: (cx, cy, location) =>
                            does_block(cx, cy, location, state),
                        canSee: (cx, cy) => cansee(cx, cy, state),
                        newsym: (cx, cy) => newsym(cx, cy, state),
                        message: ttyPline,
                    }),
            });
        }
        if (!mtmp.mtame) count++;
    }

    if (sobj.otyp === SCR_SCARE_MONSTER || !count) {
        // In the recorder build, sounds.h defines Soundeffect as a no-op;
        // the source-visible feedback is You_hear below.
        const sound = confused || sobj.cursed
            ? 'sad wailing' : 'maniacal laughter';
        const distance = !count ? 'in the distance' : 'close by';
        const line = youHear(`${sound} ${distance}.`, state);
        if (line) await ttyPline(line, state);
    }
}

// The existing destroy-armor helper covers only an ordinary, unknown scroll
// with exactly one worn, flammable armor object. seffects() records a gap on
// its other source arms until that effect family is ported whole.
function oneWornFlammableArmor(state) {
    const worn = [
        state.uarm,
        state.uarmc,
        state.uarmh,
        state.uarms,
        state.uarmg,
        state.uarmf,
        state.uarmu,
    ].filter(Boolean);
    return worn.length === 1 && is_flammable(worn[0], state);
}

// C ref: read.c maybe_tame() (1044-1063). Its signed result is consumed by
// seffect_taming(): a cursed scroll can return -1 for a peaceful target that
// became hostile, while ordinary taming returns 1 only when disposition or
// tameness changed. C discards tamedog()'s pointer but still performs its
// state and message effects.
async function maybe_tame(monster, scroll, state) {
    const wasTame = Boolean(monster.mtame);
    const wasPeaceful = Boolean(monster.mpeaceful);

    if (scroll.cursed) {
        await setmangry(monster, false, { state });
        if (wasPeaceful && !monster.mpeaceful) return -1;
    } else {
        // read.c passes the fake object's actual class; a shopkeeper still
        // reaches tamedog() after resisting the ordinary magic check.
        if (!(await resist(monster, scroll.oclass, 0, NOTELL, state))
            || monster.isshk) {
            await tamedog(monster, scroll, false, { state });
        }

        if ((!wasPeaceful && monster.mpeaceful)
            || wasTame !== Boolean(monster.mtame)) {
            return 1;
        }
    }
    return 0;
}

// C ref: read.c seffect_taming() (1679-1721). The nested x-then-y traversal,
// swallowed target, steed fallback, visible-result accumulation, and
// knowledge update follow C order. Spell and artifact callers use this same
// source-owned effect through seffects().
export async function seffect_taming(scroll, state = game) {
    state.gk ??= {};
    const confused = propertyActive(CONFUSION, state);
    let candidates;
    let results;
    let visResults;

    if (state.u.uswallow) {
        candidates = 1;
        results = visResults = await maybe_tame(
            state.u.ustuck, scroll, state,
        );
    } else {
        const bound = confused ? 5 : 1;
        candidates = 0;
        results = 0;
        visResults = 0;
        for (let i = -bound; i <= bound; ++i) {
            for (let j = -bound; j <= bound; ++j) {
                const x = state.u.ux + i;
                const y = state.u.uy + j;
                if (!isok(x, y)) continue;

                const monster = m_at(x, y, state)
                    || (!i && !j ? state.u.usteed : null);
                if (!monster) continue;

                ++candidates;
                const result = await maybe_tame(monster, scroll, state);
                results += result;
                if (canSpotMonster(monster, state))
                    visResults += result;
            }
        }
    }

    if (!results) {
        await ttyPline(
            `Nothing interesting ${!candidates ? 'happens' : 'seems to happen'}.`,
            state,
        );
    } else {
        await ttyPline(
            `${The('neighborhood', state)} ${visResults ? 'is' : 'seems'} `
                + `${results < 0 ? 'un' : ''}friendlier.`,
            state,
        );
        if (visResults > 0) state.gk.known = true;
    }
}

function solidPunishmentTarget(state) {
    const species = state.youmonst?.data;
    // read.c:3036-3044 has separate amorphous, whirly and unsolid fall-away
    // arms. They are outside this divergence, as is placement while swallowed;
    // admit only the solid, visible first-read arm here. A previously attached
    // ball is handled by punish() before these checks and needs no species test.
    return !propertyActive(BLINDED, state)
        && !state.u?.uswallow
        && species
        && !amorphous(species)
        && !is_whirly(species)
        && !unsolid(species);
}

function punishmentReadAdmitted(scroll, confused, state) {
    if (scroll.oclass !== SCROLL_CLASS || scroll.otyp !== SCR_PUNISHMENT)
        return false;
    // doread()'s blind guard at read.c:561-575 allows a scroll only after its
    // description has been seen. The guilty and repeated-ball arms do not
    // need the blind ball-and-chain display setup; the first creation arm
    // remains sighted.
    if (propertyActive(BLINDED, state)
        && !confused && !scroll.blessed && !state.uball) return false;
    if (confused || scroll.blessed || state.uball) return true;
    return solidPunishmentTarget(state);
}

// C ref: read.c punish() (3019-3062), plus the solid, non-swallowed
// placebc_core() arm required by its scroll caller. Reuse-ball, fall-away,
// swallowed and blind display branches remain outside this divergence.
export async function punish(scroll, state = game) {
    const cursedLevy = scroll?.cursed ? 1 : 0;

    await ttyPline('You are being punished for your misbehavior!', state);
    if (state.uball) {
        await ttyPline('Your iron ball gets heavier.', state);
        state.uball.owt += WT_IRON_BALL_INCR * (1 + cursedLevy);
        return;
    }

    if (!solidPunishmentTarget(state)) {
        throw new UnsupportedReadError(
            'punish() fall-away, swallowed, or blind branch',
        );
    }

    // C makes and wears the chain before making and wearing the ball. mkobj()
    // owns the exact rnd(1000), next_ident() and erosion draw sequence for each
    // generic class; setworn() owns the state.uball/state.uchain pointers.
    const chain = mkobj(CHAIN_CLASS, true, { state });
    setworn(chain, W_CHAIN, setwornEnv(state));
    const ball = mkobj(BALL_CLASS, true, { state });
    setworn(ball, W_BALL, setwornEnv(state));

    // placebc_core(): ball first establishes BCPOS_CHAIN, then chain is placed
    // above it. The source checks floor effects before either object is placed;
    // the existing ordinary-floor implementation covers this witness and
    // fails closed on its other square-specific arms.
    const floorEffects = {
        state,
        unsupported: (reason) => {
            throw new UnsupportedReadError(`punish() floor effect: ${reason}`);
        },
    };
    await flooreffects(chain, state.u.ux, state.u.uy, '', floorEffects);
    await flooreffects(ball, state.u.ux, state.u.uy, '', floorEffects);
    // The glyph is sampled before newsym() paints the objects.
    place_object(ball, state.u.ux, state.u.uy, { state });
    state.u.bc_order = 1; // BCPOS_CHAIN from ball.c:108.
    place_object(chain, state.u.ux, state.u.uy, { state });
    const glyph = state.level.at(state.u.ux, state.u.uy).glyph;
    state.u.bglyph = glyph;
    state.u.cglyph = glyph;
    newsym(state.u.ux, state.u.uy);
    // punish() calls newsym() again after placebc(); preserve that source call.
    newsym(state.u.ux, state.u.uy);
}

// C ref: read.c seffect_punishment() (1976-1988). The effect is known as soon
// as read, while blessed or confused scrolls stop after the guilt message and
// leave the scroll for doread() to consume.
export async function seffect_punishment(scroll, state = game) {
    if (scroll?.otyp !== SCR_PUNISHMENT || scroll.oclass !== SCROLL_CLASS)
        throw new UnsupportedReadError('the selected punishment-scroll branch');
    state.gk.known = true;
    if (scroll.blessed || propertyActive(CONFUSION, state)) {
        await ttyPline('You feel guilty.', state);
        return;
    }
    await punish(scroll, state);
}

function recordLiteracy(state, description) {
    state.u.uconduct ??= {};
    if (!state.u.uconduct.literate)
        livelog_printf(LL_CONDUCT, description, state);
    state.u.uconduct.literate
        = Math.trunc(state.u.uconduct.literate ?? 0) + 1;
}

// C ref: read.c doread() (330-646). Preserve the full readable-object
// dispatch, spellbook early return, and scroll in_use / seffects / useup order.
// Unsupported void effect callees are explicit gaps in seffects(); this
// command does not refuse a selected readable object.
export async function doread(state = game) {
    state.gk ??= {};
    state.gk.known = false;
    if (await check_capacity(null, state)) return ECMD_OK;

    const scroll = await getobj('read', read_ok, GETOBJ_PROMPT, state);
    if (!scroll) return ECMD_CANCEL;
    const otyp = scroll.otyp;
    scroll.pickup_prev = false;

    if (otyp === FORTUNE_COOKIE) {
        if (state.flags?.verbose)
            await ttyPline(
                'You break up the cookie and throw away the pieces.', state,
            );
        await outrumor(bcsign(scroll), BY_COOKIE, state);
        if (!propertyActive(BLINDED, state))
            recordLiteracy(
                state,
                'became literate by reading a fortune cookie',
            );
        useup(scroll, { state, hooks: {} });
        return ECMD_TIME;
    }

    if (otyp === T_SHIRT || otyp === ALCHEMY_SMOCK
        || otyp === HAWAIIAN_SHIRT) {
        if (propertyActive(BLINDED, state)) {
            await ttyPline("You can't feel any Braille writing.", state);
            return ECMD_OK;
        }
        if ((otyp === T_SHIRT || otyp === HAWAIIAN_SHIRT)
            && state.uarm && scroll === state.uarmu) {
            const owner = scroll.unpaid ? 'That' : 'Your';
            await ttyPline(
                owner + ' shirt is obscured by '
                + shk_your(state.uarm, state)
                + suit_simple_name(state.uarm, state) + '.',
                state,
            );
            return ECMD_OK;
        }
        if (otyp === HAWAIIAN_SHIRT) {
            await ttyPline(
                (state.flags?.verbose ? 'The design' : 'It')
                    + ' features ' + hawaiian_design(scroll, state) + '.',
                state,
            );
            return ECMD_TIME;
        }
        recordLiteracy(
            state,
            'became literate by reading '
                + (otyp === T_SHIRT ? 'a T-shirt' : 'an apron'),
        );
        const text = otyp === T_SHIRT
            ? tshirt_text(scroll, state) : apron_text(scroll, state);
        const endpunct = state.flags?.verbose && text
            && !/[.!?]$/u.test(text) ? '.' : '';
        if (state.flags?.verbose) await ttyPline('It reads:', state);
        await ttyPline('"' + text + '"' + endpunct, state);
        return ECMD_TIME;
    }

    if ((otyp === DUNCE_CAP || otyp === CORNUTHAUM)
        && state.urole?.mnum === PM_TOURIST) {
        const capText = otyp === DUNCE_CAP ? 'DUNCE' : 'WIZZARD';
        if (Math.trunc(scroll.o_id ?? 0) % 3) {
            await ttyPline(
                "You can't find anything to read on this "
                    + simpleonames(scroll, state) + '.',
                state,
            );
            return ECMD_OK;
        }
        await ttyPline(
            (propertyActive(BLINDED, state)
                ? 'You feel lettering' : 'There is writing')
                + ' on the ' + simpleonames(scroll, state)
                + '.  It reads:  ' + capText + '.',
            state,
        );
        recordLiteracy(
            state,
            'became literate by reading '
                + (otyp === DUNCE_CAP ? 'a dunce cap' : 'a cornuthaum'),
        );
        await trycall(scroll, state);
        return ECMD_TIME;
    }

    if (otyp === CREDIT_CARD) {
        const blind = propertyActive(BLINDED, state);
        if (blind) {
            await ttyPline('You feel the embossed numbers:', state);
        } else {
            if (state.flags?.verbose) await ttyPline('It reads:', state);
            const cardMessages = [
                'Leprechaun Gold Tru$t - Shamrock Card',
                'Magic Memory Vault Charge Card',
                'Larn National Bank',
                'First Bank of Omega',
                'Bank of Zork - Frobozz Magic Card',
                "Ankh-Morpork Merchant's Guild Barter Card",
                "Ankh-Morpork Thieves' Guild Unlimited Transaction Card",
                'Ransmannsby Moneylenders Association',
                'Bank of Gehennom - 99% Interest Card',
                'Yendorian Express - Copper Card',
                'Yendorian Express - Silver Card',
                'Yendorian Express - Gold Card',
                'Yendorian Express - Mithril Card',
                'Yendorian Express - Platinum Card',
            ];
            const cardIndex = Math.trunc(scroll.o_id ?? 0);
            const card = scroll.oartifact
                ? cardMessages.at(-1)
                : cardMessages[cardIndex % (cardMessages.length - 1)];
            await ttyPline('"' + card + '"', state);
        }
        const id = Math.trunc(scroll.o_id ?? 0);
        const number = String(id % 89 + 10) + '0' + String(id % 4) + ' '
            + String((id * 499) % 899999 + 100000) + String(id % 10) + '1 '
            + '0' + String(Number(id % 3 === 0)) + String(id * 7 % 10) + '0'
            + (state.flags?.verbose || blind ? '.' : '');
        await ttyPline('"' + number + '"', state);
        recordLiteracy(state, 'became literate by reading a credit card');
        return ECMD_TIME;
    }

    if (otyp === CAN_OF_GREASE) {
        await ttyPline(
            'This ' + singular(scroll, xnameFresh, state) + ' has no label.',
            state,
        );
        return ECMD_OK;
    }

    if (otyp === MAGIC_MARKER) {
        if (propertyActive(BLINDED, state)) {
            await ttyPline("You can't feel any Braille writing.", state);
            return ECMD_OK;
        }
        if (state.flags?.verbose) await ttyPline('It reads:', state);
        const redMonsters = [
            PM_FIRE_ANT, PM_PYROLISK, PM_HELL_HOUND, PM_IMP,
            PM_LARGE_MIMIC, PM_LEOCROTTA, PM_SCORPION, PM_XAN,
            PM_GIANT_BAT, PM_WATER_MOCCASIN, PM_FLESH_GOLEM,
            PM_BARBED_DEVIL, PM_MARILITH, PM_PIRANHA,
        ];
        const monsterIndex = Math.trunc(scroll.o_id ?? 0)
            % redMonsters.length;
        const species = state.mons[redMonsters[monsterIndex]];
        await ttyPline(
            '"Magic Marker(TM) ' + upwords(pmname(species, NEUTRAL))
                + ' Red Ink Marker Pen.  Water Soluble."',
            state,
        );
        recordLiteracy(state, 'became literate by reading a magic marker');
        return ECMD_TIME;
    }

    if (scroll.oclass === COIN_CLASS) {
        if (propertyActive(BLINDED, state))
            await ttyPline('You feel the embossed words:', state);
        else if (state.flags?.verbose)
            await ttyPline('You read:', state);
        await ttyPline('"1 Zorkmid.  857 GUE.  In Frobs We Trust."', state);
        recordLiteracy(
            state,
            "became literate by reading a coin's engravings",
        );
        return ECMD_TIME;
    }

    if (is_art(scroll, ART_ORB_OF_FATE)) {
        if (propertyActive(BLINDED, state))
            await ttyPline('You feel the engraved signature:', state);
        else
            await ttyPline('It is signed:', state);
        await ttyPline('"Odin."', state);
        recordLiteracy(
            state,
            'became literate by reading the divine signature of Odin',
        );
        return ECMD_TIME;
    }

    if (otyp === CANDY_BAR) {
        if (propertyActive(BLINDED, state)) {
            await ttyPline("You can't feel any Braille writing.", state);
            return ECMD_OK;
        }
        const wrapper = candy_wrapper_text(scroll);
        if (!wrapper) {
            await ttyPline("The candy bar's wrapper is blank.", state);
            return ECMD_OK;
        }
        await ttyPline('The wrapper reads: "' + wrapper + '".', state);
        recordLiteracy(state, 'became literate by reading a candy bar wrapper');
        return ECMD_TIME;
    }

    if (scroll.oclass !== SCROLL_CLASS && scroll.oclass !== SPBOOK_CLASS) {
        await ttyPline('That is a silly thing to read.', state);
        return ECMD_OK;
    }

    if (propertyActive(BLINDED, state) && otyp !== SPE_BOOK_OF_THE_DEAD) {
        let what = '';
        if (otyp === SPE_NOVEL) {
            // Unseen novels are already distinguishable from unseen books.
            what = 'words';
        } else if (scroll.oclass === SPBOOK_CLASS) {
            what = 'mystic runes';
        } else if (!scroll.dknown) {
            what = 'formula on the scroll';
        }
        if (what) {
            await ttyPline('Being blind, you cannot read the ' + what + '.', state);
            return ECMD_OK;
        }
    }

    let confused = propertyActive(CONFUSION, state);
    if (otyp === SCR_MAIL) {
        confused = false;
        state.u.uconduct ??= {};
        if (!state.u.uconduct.literate && !scroll.spe) {
            const answer = await y_n(
                'Reading mail will violate "illiterate" conduct.  Read anyway?',
                state,
            );
            if (answer !== 'y' && answer !== 'y'.charCodeAt(0))
                return ECMD_OK;
        }
    }

    const countsLiteracy = otyp !== SPE_BOOK_OF_THE_DEAD
        && otyp !== SPE_NOVEL
        && otyp !== SPE_BLANK_PAPER
        && otyp !== SCR_BLANK_PAPER;
    if (countsLiteracy) {
        const readable = scroll.oclass === SPBOOK_CLASS ? 'a book'
            : scroll.oclass === SCROLL_CLASS ? 'a scroll' : 'something';
        recordLiteracy(state, 'became literate by reading ' + readable);
    }

    if (scroll.oclass === SPBOOK_CLASS) {
        return await study_book(scroll, state, {
            message: ttyPline,
            prompt: y_n,
        }) ? ECMD_TIME : ECMD_OK;
    }

    scroll.in_use = true;
    const nodisappear = otyp === SCR_FIRE
        || (otyp === SCR_REMOVE_CURSE && scroll.cursed);
    const silently = !can_chant(state.youmonst, state);
    if (otyp !== SCR_BLANK_PAPER) {
        if (propertyActive(BLINDED, state)) {
            await ttyPline(
                nodisappear
                    ? 'You ' + (silently ? 'cogitate' : 'pronounce')
                        + ' the formula on the scroll.'
                    : 'As you ' + (silently ? 'cogitate' : 'pronounce')
                        + ' the formula on it, the scroll disappears.',
                state,
            );
        } else {
            await ttyPline(
                nodisappear
                    ? 'You read the scroll.'
                    : 'As you read the scroll, it disappears.',
                state,
            );
        }
        if (confused) {
            if (propertyActive(HALLUC, state)) {
                await ttyPline('Being so trippy, you screw up...', state);
            } else {
                await ttyPline(
                    'Being confused, you '
                        + (silently ? 'misunderstand' : 'mispronounce')
                        + ' the magic words...',
                    state,
                );
            }
        }
    }

    const consumedByEffect = await seffects(scroll, state);
    if (!consumedByEffect) {
        if (!objectType(scroll, state).oc_name_known) {
            if (state.gk.known) {
                learnscroll(scroll, state);
            } else {
                await trycall(scroll, state);
            }
        }
        scroll.in_use = false;
        if (otyp !== SCR_BLANK_PAPER)
            useup(scroll, { state, hooks: {} });
    }
    return ECMD_TIME;
}

// C ref: read.c seffect_enchant_armor() (1115-1293). The returned boolean is
// the source's `struct obj **` consumption channel: no armor calls
// strange_feeling() and clears the caller's scroll pointer; every other arm
// leaves useup() to doread().
export async function seffect_enchant_armor(scroll, state = game, env = {}) {
    const sobj = scroll;
    const sblessed = Boolean(sobj.blessed);
    const scursed = Boolean(sobj.cursed);
    const confused = propertyActive(CONFUSION, state);
    const random = env.random ?? { rn2, rnd };
    const message = env.message ?? ttyPline;
    const effectEnv = { ...env, state, message };
    const otmp = some_armor(state.youmonst, state, random);

    if (!otmp) {
        await strange_feeling(
            sobj,
            propertyActive(BLINDED, state)
                ? 'Your skin feels warm for a moment.'
                : 'Your skin glows then fades.',
            state,
        );
        await exercise(A_CON, !scursed, state, { rn2: random.rn2 }, {
            encumberMessage: encumber_msg,
        });
        await exercise(A_STR, !scursed, state, { rn2: random.rn2 }, {
            encumberMessage: encumber_msg,
        });
        return true;
    }

    if (confused) {
        const oldErodeproof = Boolean(otmp.oerodeproof);
        const newErodeproof = !scursed;
        const blind = propertyActive(BLINDED, state);
        otmp.oerodeproof = false;
        if (blind) {
            otmp.rknown = false;
            await ttyPline(
                `${Yobjnam2(otmp, 'feel', state)} warm for a moment.`, state,
            );
        } else {
            otmp.rknown = true;
            const surface = scursed ? 'mottled' : 'shimmering';
            const color = hcolor(scursed ? 'black' : 'golden', state);
            const objectLayer = scursed
                ? 'glow' : is_shield(otmp, state) ? 'layer' : 'shield';
            await ttyPline(
                `${Yobjnam2(otmp, 'are', state)} covered by a ${surface} `
                + `${color} ${objectLayer}!`,
                state,
            );
        }
        if (newErodeproof && (otmp.oeroded || otmp.oeroded2)) {
            otmp.oeroded = 0;
            otmp.oeroded2 = 0;
            await ttyPline(
                `${Yobjnam2(otmp, blind ? 'feel' : 'look', state)} `
                + 'as good as new!',
                state,
            );
        }
        if (oldErodeproof && !newErodeproof) {
            // C restores the old flag before shop billing.
            otmp.oerodeproof = true;
            sourceCostlyAlteration(otmp, COST_DEGRD, state);
        }
        otmp.oerodeproof = newErodeproof;
        return false;
    }

    const specialArmor = otmp.otyp === ELVEN_LEATHER_HELM
        || otmp.otyp === ELVEN_MITHRIL_COAT
        || otmp.otyp === ELVEN_CLOAK
        || otmp.otyp === ELVEN_SHIELD
        || otmp.otyp === ELVEN_BOOTS
        || (state.urole?.mnum === PM_WIZARD && otmp.otyp === CORNUTHAUM);
    let sameColor = scursed
        ? otmp.otyp === BLACK_DRAGON_SCALE_MAIL
            || otmp.otyp === BLACK_DRAGON_SCALES
        : otmp.otyp === SILVER_DRAGON_SCALE_MAIL
            || otmp.otyp === SILVER_DRAGON_SCALES
            || otmp.otyp === SHIELD_OF_REFLECTION;
    const blind = propertyActive(BLINDED, state);
    if (blind) sameColor = false;

    // C first tests whether a very highly enchanted item evaporates; that
    // random draw precedes all enchantment-power draws below.
    let s = scursed ? -otmp.spe : otmp.spe;
    if (s > (specialArmor ? 5 : 3) && random.rn2(s)) {
        otmp.in_use = true;
        const verb = otense(otmp, blind ? 'vibrate' : 'glow');
        const separator = !blind && !sameColor ? ' ' : '';
        const color = blind || sameColor
            ? '' : hcolor(scursed ? 'black' : 'silver', state);
        const evaporate = otense(otmp, 'evaporate');
        await ttyPline(
            `${Yname2(otmp, state)} violently ${verb}${separator}${color} `
            + `for a while, then ${evaporate}.`,
            state,
        );
        await remove_worn_item(otmp, false, state, effectEnv);
        useup(otmp, { state });
        return false;
    }
    if (s < -100) s = -100; // read.c avoids overflow in (4 - s) / 2.

    s = Math.trunc((4 - s) / 2);
    if (specialArmor) ++s;
    if (!objectType(otmp, state).oc_magic) ++s;
    if (sblessed) ++s;
    if (s <= 0) {
        s = 0;
        if (otmp.spe > 0 && !random.rn2(otmp.spe)) s = 1;
    } else {
        s = random.rnd(s);
    }
    if (s > 11) s = 11;
    if (scursed) s = -s;

    if (s >= 0 && Is_dragon_scales(otmp)) {
        const wasLit = Boolean(otmp.lamplit);
        const oldLight = artifact_light(otmp)
            ? arti_light_radius(otmp, state) : 0;

        await ttyPline(`${Yname2(otmp, state)} merges and hardens!`, state);
        setworn(null, W_ARM, setwornEnv(state));
        otmp.otyp += GRAY_DRAGON_SCALE_MAIL - GRAY_DRAGON_SCALES;
        otmp.lamplit = false;
        if (sblessed) {
            ++otmp.spe;
            cap_spe(otmp);
            if (!otmp.blessed) await bless(otmp, effectEnv);
        } else if (otmp.cursed) {
            await uncurse(otmp, effectEnv);
        }
        otmp.known = true;
        setworn(otmp, W_ARM, setwornEnv(state));
        if (otmp.unpaid) alter_cost(otmp, 0, state);
        otmp.lamplit = wasLit;
        if (oldLight)
            await maybe_adjust_light(otmp, oldLight, effectEnv);
        return false;
    }

    const glowVerb = otense(otmp, blind ? 'vibrate' : 'glow');
    const separator = !blind && !sameColor ? ' ' : '';
    const color = blind || sameColor
        ? '' : hcolor(scursed ? 'black' : 'silver', state);
    const duration = s * s > 1 ? 'while' : 'moment';
    await ttyPline(
        `${Yname2(otmp, state)} ${s === 0 ? 'violently ' : ''}`
        + `${glowVerb}${separator}${color} for a ${duration}.`,
        state,
    );

    if (s < 0)
        sourceCostlyAlteration(otmp, COST_DECHNT, state);
    if (scursed && !otmp.cursed)
        await curse(otmp, effectEnv);
    else if (sblessed && !otmp.blessed)
        await bless(otmp, effectEnv);
    else if (!scursed && otmp.cursed)
        await uncurse(otmp, effectEnv);
    if (s) {
        const oldSpe = otmp.spe;
        otmp.spe += s;
        cap_spe(otmp);
        s = otmp.spe - oldSpe;
        if (s) adj_abon(otmp, s, state, { random });
        state.gk.known = Boolean(otmp.known);
        if (s > 0 && otmp.unpaid) alter_cost(otmp, 0, state);
    }

    if (otmp.spe > (specialArmor ? 5 : 3)
        && (specialArmor || !random.rn2(7))) {
        await ttyPline(
            `${Yobjnam2(otmp, 'suddenly vibrate', state)} `
            + `${blind ? 'again' : 'unexpectedly'}.`,
            state,
        );
    }
    return false;
}

// C ref: read.c seffect_destroy_armor() (1324-1396). Covers the ordinary,
// uncursed and unblessed fallback that calls do_wear.c destroy_arm().
// some_armor() is deliberately called before destroy_arm(), as in C; the
// single worn suit in this slice means that selection has no random draw.
export async function seffect_destroy_armor(scroll, state = game) {
    if (scroll.otyp !== SCR_DESTROY_ARMOR
        || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || objectType(scroll, state).oc_name_known
        || propertyActive(CONFUSION, state)
        || propertyActive(BLINDED, state)
        || !can_chant(state.youmonst, state)
        || !oneWornFlammableArmor(state)) {
        throw new UnsupportedReadError(
            'the selected destroy-armor fallback branch',
        );
    }
    if (!some_armor(state.youmonst, state, { rn2 })) {
        throw new UnsupportedReadError(
            'destroy-armor with no selected armor',
        );
    }
    if (!await destroy_arm(state, { rn2, rnl })) {
        throw new UnsupportedReadError(
            'destroy-armor with no effective erosion',
        );
    }
    state.gk.known = true;
}

// C ref: read.c seffect_remove_curse() (1489-1605). Inventory traversal saves
// each next pointer before changing BUC because curse() can drop the active
// secondary weapon from that chain. Source uses HConfusion and Hallucination
// (intrinsic timeout, unless resisted), and always leaves the scroll pointer
// intact for doread() to consume it.
export async function seffect_remove_curse(scroll, state = game, env = {}) {
    const otyp = scroll.otyp;
    const sblessed = Boolean(scroll.blessed);
    const scursed = Boolean(scroll.cursed);
    const confused = Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
    const hallucination = Boolean(state.u?.uprops?.[HALLUC]?.intrinsic)
        && !(state.u?.uprops?.[HALLUC_RES]?.intrinsic
            || state.u?.uprops?.[HALLUC_RES]?.extrinsic);
    const random = {
        rn1, rn2, rnd, rne,
        ...(env.random ?? {}),
    };

    // pline.c:You_feel() chooses its prefix from youprop.h:Unaware before
    // formatting this source's text. Keep that boundary ahead of all effects.
    const feeling = !hallucination
        ? (!confused ? 'like someone is helping you.'
            : 'like you need some help.')
        : (!confused ? 'in touch with the Universal Oneness.'
            : 'the power of the Force against you!');
    await ttyPline(
        `${heroUnaware(state) ? 'You dream that you feel' : 'You feel'} ${feeling}`,
        state,
    );

    if (scursed) {
        await ttyPline('The scroll disintegrates.', state);
    } else {
        for (let obj = state.invent; obj;) {
            // C caches obj->nobj before any BUC operation that can move obj.
            const next = obj.nobj;
            if (obj.oclass === COIN_CLASS) {
                obj = next;
                continue;
            }
            // The single object pointer is the same scroll/fake spellbook.
            // Do not clear its BUC-known bit before doread()/spelleffects.
            if (obj === scroll && obj.quan === 1) {
                obj = next;
                continue;
            }

            let wornmask = (obj.owornmask ?? 0) & ~(W_BALL | W_ART | W_ARTI);
            if (wornmask && !sblessed) {
                // These auxiliary slots count as worn only when they are in
                // active use, matching read.c's slot-specific exclusions.
                if (obj === state.uswapwep) {
                    if (!state.u?.twoweap) wornmask = 0;
                } else if (obj === state.uquiver) {
                    if (obj.oclass === WEAPON_CLASS) {
                        if (!objectType(obj, state).oc_merge) wornmask = 0;
                    } else if (obj.oclass === GEM_CLASS) {
                        if (!uslinging(state)) wornmask = 0;
                    } else {
                        wornmask = 0;
                    }
                }
            }

            if (sblessed || wornmask || obj.otyp === LOADSTONE
                || (obj.otyp === LEASH && obj.leashmon)) {
                const shopWater = Boolean(obj.unpaid)
                    && obj.otyp === POT_WATER;
                if (confused) {
                    await blessorcurse(obj, 2, { ...env, state, random });
                    // C explicitly forgets the BUC state even on a failed
                    // blessorcurse roll, before any shop-price adjustment.
                    obj.bknown = 0;
                    if (shopWater && (obj.cursed || obj.blessed))
                        alter_cost(obj, 0, state);
                } else if (obj.cursed) {
                    if (shopWater)
                        sourceCostlyAlteration(obj, COST_UNCURS, state);
                    await uncurse(obj, { ...env, state });
                    if (obj.bknown && otyp === SCR_REMOVE_CURSE)
                        learnscrolltyp(SCR_REMOVE_CURSE, state);
                }
            }
            obj = next;
        }

        // read.c treats a worn steed saddle as part of the hero's inventory,
        // after the carried-object chain, but applies different feedback.
        const saddle = state.u?.usteed
            ? which_armor(state.u.usteed, W_SADDLE, state) : null;
        if (saddle) {
            if (confused) {
                await blessorcurse(saddle, 2, { ...env, state, random });
                saddle.bknown = 0;
            } else if (saddle.cursed) {
                await uncurse(saddle, { ...env, state });
                if (!propertyActive(BLINDED, state)) {
                    await ttyPline(
                        `${Yobjnam2(saddle, 'glow', state)} ${hcolor('amber', state)}.`,
                        state,
                    );
                    saddle.bknown = hallucination ? 0 : 1;
                } else {
                    saddle.bknown = 0;
                }
            }
        }
    }

    // These C callees have void results; their separate object/chain teardown
    // source remains unported, so keep the gap and continue following C's
    // unconditional later message and final inventory refresh.
    if (Boolean(state.uball) && !confused)
        note_unported('read.c unpunish');
    if (state.u?.utrap && state.u.utraptype === TT_BURIEDBALL) {
        note_unported('dig.c buried_ball_to_freedom');
        await ttyPline(
            `The clasp on your ${body_part(LEG, state.youmonst)} vanishes.`,
            state,
        );
    }
    update_inventory({ state });
}

// C ref: read.c seffect_teleportation() (2015-2032). Re-read the live
// confusion property here, after both reading messages, as C does. The calm
// ordinary scrolltele() branch reaches teleport.c's uncontrolled safe_teleds
// path; confused or cursed scrolls retain the level_tele() branch.
export async function seffect_teleportation(scroll, state = game) {
    const scursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);
    if (confused || scursed) {
        await level_tele(state);
        /* gives "materialize on different/same level!" message, must
           be a teleport scroll */
        state.gk.known = true;
        return;
    }
    await scrolltele(scroll, state);
}

// C ref: read.c learnscroll() (68-76). teleport.c:scrolltele() calls this
// immediately before its uncontrolled teleport attempt; spellbooks are not
// scrolls and are deliberately ignored here.
export function learnscroll(scroll, state = game) {
    if (scroll.oclass !== SPBOOK_CLASS)
        learnscrolltyp(scroll.otyp, state);
}

// C ref: read.c learnscrolltyp() (58-68).
export function learnscrolltyp(scrolltyp, state = game) {
    if (!state.objects[scrolltyp].oc_name_known) {
        discover_object(scrolltyp, true, true, true, state, {
            random: { rn2 }, hooks: {},
        });
        more_experienced(0, 10, state);
        return true;
    }
    return false;
}

// C ref: read.c seffect_identify() (2055-2099). A scroll is consumed before
// learning its own type; a spellbook is left alone and is already known.
export async function seffect_identify(scroll, state = game) {
    const otyp = scroll.otyp;
    const isScroll = scroll.oclass === SCROLL_CLASS;
    const sblessed = Boolean(scroll.blessed);
    const scursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);
    const alreadyKnown = scroll.oclass === SPBOOK_CLASS
        || objectType(otyp, state).oc_name_known;

    if (isScroll) {
        // C consumes the scroll before its self-identification can refresh
        // the permanent inventory, and before testing whether anything else
        // remains to identify.
        useup(scroll, { state, hooks: {} });
        if (confused || (scursed && !alreadyKnown)) {
            await ttyPline('You identify this as an identify scroll.', state);
        } else if (!alreadyKnown) {
            await ttyPline('This is an identify scroll.', state);
        }
        if (!alreadyKnown) learnscrolltyp(SCR_IDENTIFY, state);
        if (confused || (scursed && !alreadyKnown)) return true;
    }

    if (state.invent) {
        let cval = 1;
        if (sblessed || (!scursed && rn2(5) === 0)) {
            cval = rn2(5);
            if (cval === 1 && sblessed
                && ((state.u.uluck ?? 0) + (state.u.moreluck ?? 0)) > 0)
                cval++;
        }
        await identify_pack(cval, !alreadyKnown, state);
    } else {
        await ttyPline(
            `You're not carrying anything${isScroll ? ' else' : ''} to be identified.`,
            state,
        );
    }
    return isScroll;
}

// C ref: read.c set_lit() (2471-2488).  The callback keeps the permanent
// terrain lighting in level.map and records gremlins for litroom()'s delayed
// light damage.  Mobile object sources are removed by the same coordinate
// check as light.c snuff_light_source().
function set_lit(x, y, lit, state, gremlins) {
    if (!isok(x, y)) return;
    const location = state.level?.at(x, y);
    if (!location) return;
    if (lit) {
        location.lit = true;
        const monster = m_at(x, y, state);
        if (monster?.data?.pmidx === PM_GREMLIN)
            gremlins.push(monster);
        return;
    }
    location.lit = false;
    // C's snuff_light_source() only removes an object source and leaves
    // artifact light alone.  Deleting through light.js preserves its list
    // ownership and vision invalidation contract.
    for (let source = state.gl?.light_base ?? null; source;) {
        const next = source.next;
        if (source.type === LS_OBJECT && source.x === x && source.y === y
            && source.id?.lamplit && !artifact_light(source.id)) {
            try {
                del_light_source(source.type, source.id, state);
            } catch {
                // A stale source is already equivalent to C's absent source.
            }
        }
        source = next;
    }
}

// C ref: read.c litroom() (2491-2634), for the light-scroll call.  The map
// callback, rogue-room exception, redraw sequencing, and no-op water/swallow
// guard follow the source.  Artifact-light BUC transitions belong to
// artifact.c impact_arti_light(); those objects remain lit here, as C's
// artifact branch does when that helper elects not to extinguish them.
export async function litroom(on, object, state) {
    const blessedEffect = Boolean(
        object && object.oclass === SCROLL_CLASS && object.blessed,
    );
    const swallowed = Boolean(state.u?.uswallow);
    const noOp = swallowed || Boolean(state.u?.uinwater)
        || Is_waterlevel(state.u?.uz);
    const gremlins = [];

    if (!on) {
        let stillLit = 0;
        for (let current = state.invent; current; current = current.nobj) {
            if (!current.lamplit) continue;
            if (!artifact_light(current)) {
                current.lamplit = false;
                for (let source = state.gl?.light_base ?? null; source;) {
                    const next = source.next;
                    if (source.type === LS_OBJECT && source.id === current) {
                        try {
                            del_light_source(source.type, source.id, state);
                        } catch {
                            // The source can already have gone stale.
                        }
                    }
                    source = next;
                }
            }
            if (current.lamplit) ++stillLit;
        }
        if (!propertyActive(BLINDED, state)) {
            if (stillLit) await ttyPline('The ambient light seems dimmer.', state);
            else if (swallowed) {
                await ttyPline('It seems even darker in here than before.', state);
            } else {
                await ttyPline('You are surrounded by darkness!', state);
            }
        }
    } else {
        if (swallowed) {
            if (!propertyActive(BLINDED, state)) {
                const engulfer = state.u.ustuck;
                const name = engulfer ? Monnam(engulfer, state) : 'It';
                if (engulfer?.data && is_whirly(engulfer.data)) {
                    await ttyPline(`${name} shines briefly.`, state);
                } else if (engulfer?.data) {
                    await ttyPline(`${name} glistens.`, state);
                }
            }
        } else if (!propertyActive(BLINDED, state)
            && (!Is_rogue_level(state.u?.uz)
                || state.level?.at(state.u.ux, state.u.uy)?.typ !== CORR)) {
            await ttyPline(
                `A lit field ${noOp ? 'briefly ' : ''}surrounds you!`, state,
            );
        }
    }

    if (noOp) return;

    if (Is_rogue_level(state.u?.uz)) {
        const roomNumber = (state.level.at(state.u.ux, state.u.uy)?.roomno ?? 0)
            - ROOMOFFSET;
        const room = state.level.rooms?.[roomNumber];
        if (room) {
            for (let x = room.lx - 1; x <= room.hx + 1; ++x) {
                for (let y = room.ly - 1; y <= room.hy + 1; ++y)
                    set_lit(x, y, on, state, gremlins);
            }
            room.rlit = Boolean(on);
        }
    } else if (object?.oartifact === ART_SUNSWORD) {
        // A scroll can never reach this arm through doread(), but
        // seffect_light() keeps the source test for direct callers and source
        // parity.
        set_lit(state.u.ux, state.u.uy, true, state, gremlins);
    } else {
        do_clear_area(
            state.u.ux, state.u.uy, blessedEffect ? 9 : 5,
            (x, y, value) => set_lit(x, y, value, state, gremlins),
            on ? true : null,
            state,
        );
    }

    if (!propertyActive(BLINDED, state)) {
        vision_recalc(2, {
            state,
            redraw: (x, y) => newsym(x, y),
        });
    }
    state.vision_full_recalc = 1;

    // C drains the temporary gremlin list after the delayed vision pass.
    // uhitm.c owns the shared wake, death and remembered-invisible effects.
    for (const monster of gremlins) {
        if (monster.mhp < 1) continue;
        const damage = rnd(5);
        await light_hits_gremlin(monster, damage, state);
    }
}

// C ref: read.c seffect_light() (1741-1785).  This is the complete source
// branch: calm scrolls illuminate or darken the room and can hurt a gremlin;
// confused scrolls surround the hero with cancelled tame yellow/black
// lights, including the genocide fallback and visibility knowledge update.
export async function seffect_light(scroll, state = game) {
    if (scroll?.otyp !== SCR_LIGHT || scroll.oclass !== SCROLL_CLASS)
        throw new UnsupportedReadError('the selected light-scroll branch');
    state.gk ??= {};
    const blessed = Boolean(scroll.blessed);
    const cursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);

    if (!confused) {
        if (!propertyActive(BLINDED, state)) state.gk.known = true;
        await litroom(!cursed, scroll, state);
        if (!cursed && await lightdamage(scroll, true, 5, state))
            state.gk.known = true;
        return;
    }

    const pm = cursed ? PM_BLACK_LIGHT : PM_YELLOW_LIGHT;
    const vital = (state.svm?.mvitals ?? state.mvitals)?.[pm];
    if ((vital?.mvflags ?? 0) & G_GONE) {
        await ttyPline('Tiny lights sparkle in the air momentarily.', state);
        return;
    }
    const numLights = rn1(2, 3) + (blessed ? 2 : 0);
    let sawLights = false;
    for (let i = 0; i < numLights; ++i) {
        const monster = await makemon_runtime(
            state.mons[pm], state.u.ux, state.u.uy,
            MM_EDOG | NO_MINVENT | MM_NOMSG,
            { state },
        );
        if (!monster) continue;
        initedog(monster, true, { state });
        monster.msleeping = false;
        monster.mcan = true;
        if (canSpotMonster(monster, state)) sawLights = true;
        newsym(monster.mx, monster.my);
    }
    if (sawLights) {
        await ttyPline('Lights appear all around you!', state);
        state.gk.known = true;
    }
}

// C ref: read.c seffect_magic_mapping() (2102-2153), restricted to an
// ordinary uncursed scroll on a mappable level.
export async function seffect_magic_mapping(scroll, state = game) {
    if (scroll.otyp !== SCR_MAGIC_MAPPING || scroll.blessed || scroll.cursed
        || state.level?.flags?.nommap) {
        throw new UnsupportedReadError('the selected magic-mapping branch');
    }
    state.gk.known = true;
    await ttyPline('A map coalesces in your mind!', state);
    notice_mon_off(state);
    try {
        await do_mapping(state);
    } finally {
        notice_mon_on(state);
    }
}

// C refs: read.c drop_boulder_on_player() (2294-2338) and
// drop_boulder_on_monster() (2341-2414). The first helper may redirect a
// swallowed-player hit to the monster helper; both use flooreffects()'s
// consumed result before placing a surviving rock.
export async function drop_boulder_on_player(
    confused,
    helmetProtects,
    byu,
    skipUswallow,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn1, rn2, rnd, rne };
    const env = objectGenerationEnv({ ...rawEnv, state, random });

    if (state.u?.uswallow && !skipUswallow) {
        await drop_boulder_on_monster(
            state.u.ux,
            state.u.uy,
            confused,
            byu,
            env,
        );
        return;
    }

    const rock = mksobj(confused ? ROCK : BOULDER, false, false, env);
    if (!rock) return;
    rock.quan = confused ? random.rn1(5, 2) : 1;
    rock.owt = weight(rock, { state });

    let damage = 0;
    const species = state.youmonst?.data;
    if (!amorphous(species) && !passes_walls(species)
        && !noncorporeal(species) && !unsolid(species)) {
        await ttyPline(`You are hit by ${donameFresh(rock, state)}!`, state);
        damage = Math.trunc(dmgval(rock, state.youmonst, state, env)
            * rock.quan);
        if (state.uarmh && helmetProtects) {
            if (hard_helmet(state.uarmh, state)) {
                await ttyPline(
                    'Fortunately, you are wearing a hard helmet.', state,
                );
                if (damage > 2) damage = 2;
            } else if (state.flags?.verbose) {
                await ttyPline(
                    `${Yname2(state.uarmh, state)} does not protect you.`,
                    state,
                );
            }
        }
    }

    await wake_nearto(state.u.ux, state.u.uy, 4 * 4, { ...env, state });
    // C performs floor effects before hp loss, preserving object and bhitpos
    // order even when the boulder lands in a trap or pool.
    if (!await flooreffects(rock, state.u.ux, state.u.uy, 'fall', env)) {
        place_object(rock, state.u.ux, state.u.uy, env);
        stackobj(rock, env);
        newsym(state.u.ux, state.u.uy, state);
    }
    if (damage) {
        const halfPhysical = state.u?.uprops?.[HALF_SPDAM];
        const adjusted = halfPhysical?.intrinsic || halfPhysical?.extrinsic
            ? Math.trunc((damage + 1) / 2) : damage;
        await losehp(adjusted, 'scroll of earth', KILLED_BY_AN, state, env);
    }
}

export async function drop_boulder_on_monster(
    x,
    y,
    confused,
    byu,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn1, rn2, rnd, rne };
    const env = objectGenerationEnv({ ...rawEnv, state, random });
    const rock = mksobj(confused ? ROCK : BOULDER, false, false, env);
    if (!rock) return false;
    rock.quan = confused ? random.rn1(5, 2) : 1;
    rock.owt = weight(rock, { state });

    const monster = m_at(x, y, state);
    const species = monster?.data;
    if (monster && !amorphous(species) && !passes_walls(species)
        && !noncorporeal(species) && !unsolid(species)) {
        const helmet = which_armor(monster, W_ARMH, state);
        let damage;
        if (cansee(x, y, state)) {
            await ttyPline(
                `${Monnam(monster, state)} is hit by `
                    + `${donameFresh(rock, state)}!`,
                state,
            );
            if (monster.minvis && !canSpotMonster(monster, state))
                map_invisible(monster.mx, monster.my, state);
        } else if (engulfing_u(monster, state)) {
            const line = youHear(
                `something hit ${s_suffix(mon_nam(monster, state))} `
                    + `${mbodypart(monster, STOMACH)} over your `
                    + `${body_part(HEAD, state.youmonst)}!`,
                state,
            );
            if (line) await ttyPline(line, state);
        }

        damage = Math.trunc(dmgval(rock, monster, state, env) * rock.quan);
        if (helmet) {
            if (hard_helmet(helmet, state)) {
                if (canSpotMonster(monster, state)) {
                    await ttyPline(
                        `Fortunately, ${mon_nam(monster, state)} is wearing `
                            + 'a hard helmet.',
                        state,
                    );
                } else {
                    const line = youHear('a clanging sound.', state);
                    if (line) await ttyPline(line, state);
                }
                if (damage > 2) damage = 2;
            } else if (canSpotMonster(monster, state)) {
                await ttyPline(
                    `${Monnam(monster, state)}'s ${xnameFresh(helmet, state)} `
                        + `does not protect ${mhim(monster, { state })}.`,
                    state,
                );
            }
        }
        monster.mhp -= damage;
        if (monster.mhp < 1) {
            if (byu) {
                note_unported('mon.c killed');
            } else {
                await ttyPline(`${Monnam(monster, state)} is killed.`, state);
                note_unported('mon.c mondied');
            }
        } else {
            await wakeup(monster, byu, { ...env, state });
        }
        await wake_nearto(x, y, 4 * 4, { ...env, state });
    } else if (engulfing_u(monster, state)) {
        obfree(rock, null, env);
        // Source read.c redirects the rock to the swallowed player and
        // returns true because the monster-square rock was freed.
        await drop_boulder_on_player(confused, true, false, true, env);
        return true;
    }

    if (!await flooreffects(rock, x, y, 'fall', env)) {
        place_object(rock, x, y, env);
        stackobj(rock, env);
        newsym(x, y, state);
    }
    return true;
}

// C ref: read.c seffect_earth() (1919-1975). Snapshot the scroll state before
// messages or rock creation. Its neighborhood traversal is x-major, then
// y-major; the helper return values are accumulated exactly as C does.
export async function seffect_earth(scroll, state = game) {
    const blessed = Boolean(scroll?.blessed);
    const cursed = Boolean(scroll?.cursed);
    const confused = propertyActive(CONFUSION, state);
    const level = state.u?.uz;
    const inEndgame = level?.dnum != null
        && level.dnum === state.astral_level?.dnum;
    const earthLevel = on_level(level, state.earth_level);

    if (Is_rogue_level(level)
        || !has_ceiling(level, state)
        || (inEndgame && !earthLevel)) return;

    let boulderCount = 0;
    if (state.u?.uswallow) {
        const line = youHear('rumbling.', state);
        if (line) await ttyPline(line, state);
    } else if (!avoid_ceiling(level, state)) {
        await ttyPline(
            `The ${ceiling(state.u.ux, state.u.uy, state)} rumbles `
                + `${blessed ? 'around' : 'above'} you!`,
            state,
        );
    } else {
        const material = blessed ? makeplural('avalanche') : an('avalanche');
        await ttyPline(
            `${upstart(material)} of boulders `
                + `${vtense(material, 'materialize')} `
                + `${blessed ? 'around' : 'above'} you!`,
            state,
        );
    }
    state.gk.known = true;
    note_unported('trap.c sokoban_guilt');

    if (!cursed) {
        for (let x = state.u.ux - 1; x <= state.u.ux + 1; x++) {
            for (let y = state.u.uy - 1; y <= state.u.uy + 1; y++) {
                if (!isok(x, y)) continue;
                if (closed_door(x, y, state)) continue;
                const typ = state.level.at(x, y)?.typ;
                if (IS_OBSTRUCTED(typ) || IS_AIR(typ)
                    || (x === state.u.ux && y === state.u.uy)) continue;
                boulderCount += Number(await drop_boulder_on_monster(
                    x,
                    y,
                    confused,
                    true,
                    { state },
                ));
            }
        }
    }
    if (!blessed) {
        await drop_boulder_on_player(confused, !cursed, true, false, { state });
    } else if (!boulderCount) {
        await ttyPline('But nothing else happens.', state);
    }
}

// C ref: read.c can_center_cloud() (1080-1085). This is a pure target filter:
// valid_cloud_pos(), cansee(), and hack.h distu() (the squared distance from
// the hero, strictly less than 32) decide whether the square can center an
// explosion. The existing read.c:valid_cloud_pos port remains in region.js;
// keep this read.c caller here rather than duplicating that source unit.
export function can_center_cloud(x, y, state = game) {
    if (!valid_cloud_pos(x, y, state)) return false;
    return cansee(x, y, state)
        && dist2(x, y, state.u.ux, state.u.uy) < 32;
}

// C ref: read.c display_stinking_cloud_positions() (1087-1111). Both
// do_stinking_cloud() and blessed seffect_fire() install this getpos callback.
export async function display_stinking_cloud_positions(onOff, state = game) {
    if (onOff) {
        const dist = 6;
        await tmp_at(DISP_BEAM, cmap_to_glyph(S_goodpos, state), state);
        for (let dx = -dist; dx <= dist; ++dx) {
            for (let dy = -dist; dy <= dist; ++dy) {
                const x = state.u.ux + dx;
                const y = state.u.uy + dy;
                if (u_at(x, y, state)) continue;
                if (can_center_cloud(x, y, state))
                    await tmp_at(x, y, state);
            }
        }
    } else {
        await tmp_at(DISP_END, 0, state);
    }
}

// C ref: read.c do_stinking_cloud() (3082-3111).  Its getpos callbacks live
// only for this target selection; getpos() writes the selected coord in place
// and a negative result is the one cancellation branch that suppresses the
// cloud entirely.
export async function do_stinking_cloud(sobj, mentionStinking, state = game) {
    await ttyPline(
        `Where do you want to center the ${mentionStinking ? 'stinking ' : ''}cloud?`,
        state,
    );
    const cc = { x: state.u.ux, y: state.u.uy };
    state.getpos_hilitefunc = (onOff, callbackState = state) => (
        display_stinking_cloud_positions(onOff, callbackState)
    );
    state.getpos_getvalid = (x, y, callbackState = state) => (
        can_center_cloud(x, y, callbackState)
    );
    let getposResult;
    try {
        getposResult = await getpos(cc, true, 'the desired position', state);
    } finally {
        // C resets getpos_sethilite(NULL, NULL) at the end of getpos().
        state.getpos_hilitefunc = null;
        state.getpos_getvalid = null;
    }

    if (getposResult < 0) {
        await ttyPline('Never mind.', state);
        return;
    }
    if (!can_center_cloud(cc.x, cc.y, state)) {
        if (propertyActive(HALLUC, state)) {
            await ttyPline('Ugh... someone cut the cheese.', state);
        } else {
            await ttyPline(
                `${sobj.oclass === SCROLL_CLASS
                    ? 'The scroll crumbles with' : 'You smell'} a whiff of rotten eggs.`,
                state,
            );
        }
        return;
    }

    const cloudSign = bcsign(sobj);
    await create_gas_cloud(
        cc.x,
        cc.y,
        15 + 10 * cloudSign,
        8 + 4 * cloudSign,
        {
            state,
            random: { rn2 },
            blockPoint: (x, y) => block_point(x, y, state),
            canSee: (x, y) => cansee(x, y, state),
            newsym: (x, y) => newsym(x, y, state),
            message: ttyPline,
        },
    );
}

// C ref: read.c seffect_fire() (1850-1917). C passes the consumed scroll by
// address, so seffects() sets its local pointer to null after this call.
export async function seffect_fire(scroll, state = game) {
    const otyp = scroll.otyp;
    const sblessed = Boolean(scroll.blessed);
    const confused = propertyActive(CONFUSION, state);
    const alreadyKnown = scroll.oclass === SPBOOK_CLASS
        || objectType(scroll, state).oc_name_known;
    const cc = { x: state.u.ux, y: state.u.uy };
    const cval = bcsign(scroll);
    let dam = Math.trunc((2 * (rn1(3, 3) + 2 * cval) + 1) / 3);

    useup(scroll, { state, hooks: {} });
    if (!alreadyKnown) learnscrolltyp(SCR_FIRE, state);

    if (confused) {
        if (state.u?.uinwater) {
            await ttyPline(
                `A little ${hliquid('water', { state })} around you vaporizes.`,
                state,
            );
        } else if (Fire_resistance(state)) {
            // display.c shieldeff() returns void and is still a named gap.
            note_unported('display.c shieldeff');
            monstseesu(M_SEEN_FIRE, state);
            const hands = makeplural(body_part(HAND, state.youmonst));
            if (!propertyActive(BLINDED, state)) {
                await ttyPline(
                    `Oh, look, what a pretty fire in your ${hands}.`, state,
                );
            } else {
                await ttyPline(`You feel a pleasant warmth in your ${hands}.`,
                    state);
            }
        } else {
            monstunseesu(M_SEEN_FIRE, state);
            const hands = makeplural(body_part(HAND, state.youmonst));
            await ttyPline(
                `The scroll catches fire and you burn your ${hands}.`, state,
            );
            await losehp(1, 'scroll of fire', KILLED_BY_AN, state);
        }
        return;
    }

    if (state.u?.uinwater) {
        await ttyPline(
            `${The(hliquid('water', { state }), state)} around you vaporizes violently!`,
            state,
        );
    } else {
        if (sblessed) {
            if (!alreadyKnown)
                await ttyPline('This is a scroll of fire!', state);
            dam *= 5;
            await ttyPline('Where do you want to center the explosion?', state);

            // getpos_sethilite() in getpos.c installs these callbacks for the
            // duration of getpos(); JS stores the same callback contract on
            // the owning game state. getpos() writes cc in source order.
            state.getpos_hilitefunc = (onOff, callbackState = state) => (
                display_stinking_cloud_positions(onOff, callbackState)
            );
            state.getpos_getvalid = (x, y, callbackState = state) => (
                can_center_cloud(x, y, callbackState)
            );
            try {
                await getpos(cc, true, 'the desired position', state);
            } finally {
                // C getpos() always finishes with getpos_sethilite(NULL,NULL).
                state.getpos_hilitefunc = null;
                state.getpos_getvalid = null;
            }
            if (!can_center_cloud(cc.x, cc.y, state)) {
                // C's fire-scroll caller discards getpos()'s return code; an
                // escape or out-of-range position falls back to the hero.
                cc.x = state.u.ux;
                cc.y = state.u.uy;
            }
        }
        if (u_at(cc.x, cc.y, state)) {
            await ttyPline('The scroll erupts in a tower of flame!', state);
            state.iflags ??= {};
            state.iflags.last_msg = PLNMSG_TOWER_OF_FLAME;
            // timeout.c burn_away_slime() returns void and its JS port is
            // incomplete for the active Slimed branch; retain the source gap.
            note_unported('timeout.c burn_away_slime');
        }
    }

    // read.c's local ZT_SPELL_O_FIRE is 11; explode.c derives AD_FIRE and
    // the "tower of flame" description from that type plus SCROLL_CLASS.
    const ZT_SPELL_O_FIRE = 11;
    await explode(
        cc.x, cc.y, ZT_SPELL_O_FIRE, dam, SCROLL_CLASS, EXPL_FIERY, state,
    );
}

// C ref: monflag.h G_GENO (200). The monster table keeps genocide eligibility
// in `geno`; mvitals uses the separate G_GENOD flag from const.js.
const G_GENO = 0x0020;

async function youFeelDeadInside(state) {
    let prefix = 'You feel';
    if (Math.trunc(state.multi ?? 0) < 0) {
        const { unconscious } = await import('./trap.js');
        if (unconscious(state) || state.u?.uhs === FAINTED)
            prefix = 'You dream that you feel';
    }
    const { udeadinside } = await import('./polyself.js');
    await ttyPline(`${prefix} ${udeadinside(state)} inside.`, state);
}

const GENOCIDE_REALLY = 1;
const GENOCIDE_PLAYER = 2;
const GENOCIDE_ONTHRONE = 4;

// C ref: read.c do_class_genocide() (2638-2820). The class parser fallback,
// retry accounting, eligibility scan, and self-genocide order follow C. Its
// mongone() and kill_genocided_monsters() calls discard void results and stay
// named source gaps until those owning mon.c paths are ported.
export async function do_class_genocide(state = game) {
    let llDone = false;
    let feelDead = false;
    let gameover = false;
    const mvitals = state.svm?.mvitals ?? state.mvitals;

    for (let attempt = 0; ; ++attempt) {
        if (attempt >= 5) {
            await ttyPline(thats_enough_tries, state);
            return;
        }
        let prompt = 'What class of monsters do you want to genocide?';
        if (attempt > 0) {
            prompt += ` [enter ${state.iflags?.cmdassist
                ? 'the symbol or name representing a class, or ?'
                : "'?' to see previous genocides"}]`;
        }
        const buf = mungspaces(await getlin(prompt, state) ?? '');
        if (!buf) {
            const suggestion = attempt + 1 < 5
                ? "Type letter (or punctuation) or name used for a class of monsters or 'none'"
                : 'No class of monsters specified';
            await ttyPline(`${suggestion}.`, state);
            continue;
        }
        if (buf[0] === '\x1b'
            || ['none', "'none'", 'nothing']
                .some((word) => buf.toLowerCase() === word)) {
            livelog_printf(LL_GENOCIDE,
                'declined to perform class genocide', state);
            return;
        }
        if (buf === '?' || buf === "'?'") {
            const { list_genocided } = await import('./insight.js');
            await list_genocided('g', false, state);
            --attempt;
            continue;
        }

        let monsterClass = name_to_monclass(buf, null, { state });
        if (!monsterClass) {
            const mndx = name_to_monplus(buf, { state }).mnum;
            if (mndx !== NON_PM)
                monsterClass = state.mons[mndx].mlet;
        }
        let immuneCount = 0;
        let goneCount = 0;
        let goodCount = 0;
        for (let i = LOW_PM; i < state.mons.length; ++i) {
            const species = state.mons[i];
            if (species.mlet !== monsterClass) continue;
            if (!(species.geno & G_GENO)) ++immuneCount;
            else if (mvitals[i].mvflags & G_GENOD) ++goneCount;
            else ++goodCount;
        }
        const roleClass = state.mons[state.urole.mnum]?.mlet;
        const raceClass = state.mons[state.urace.mnum]?.mlet;
        if (!goodCount && monsterClass !== roleClass
            && monsterClass !== raceClass) {
            if (goneCount) {
                await ttyPline('All such monsters are already nonexistent.', state);
            } else if (immuneCount || monsterClass === S_invisible) {
                await ttyPline("You aren't permitted to genocide such monsters.",
                    state);
            } else if (state.wizard && buf[0] === '*') {
                let count = 0;
                for (let monster = state.level?.monlist ?? state.fmon;
                    monster;) {
                    const next = monster.nmon;
                    if (monster.mhp >= 1) {
                        note_unported('mon.c mongone');
                        ++count;
                    }
                    monster = next;
                }
                await ttyPline(`Eliminated ${count} monster${plur(count)}.`, state);
                return;
            } else {
                await ttyPline(`That ${buf.length === 1 ? 'symbol' : 'response'} does not represent any monster.`, state);
            }
            continue;
        }

        for (let i = LOW_PM; i < state.mons.length; ++i) {
            const species = state.mons[i];
            if (species.mlet !== monsterClass) continue;
            const name = makeplural(species.pmnames[NEUTRAL]);
            if (i === state.urole.mnum || i === state.urace.mnum
                || ((species.geno & G_GENO)
                    && !(mvitals[i].mvflags & G_GENOD))) {
                if (!llDone) {
                    const { num_genocides } = await import('./insight.js');
                    const already = num_genocides(state);
                    const symbol = String.fromCharCode(
                        DEFAULT_PRIMARY_SYMBOLS[SYM_OFF_M + monsterClass],
                    );
                    if (!already) {
                        const heroPossessive = state.flags?.female ? 'her' : 'his';
                        livelog_printf(
                            LL_CONDUCT | LL_GENOCIDE,
                            `performed ${heroPossessive} first genocide (class ${symbol})`,
                            state,
                        );
                    } else {
                        livelog_printf(LL_GENOCIDE,
                            `genocided class ${symbol}`, state);
                    }
                    llDone = true;
                }
                mvitals[i].mvflags |= G_GENOD | G_NOCORPSE;
                note_unported('mon.c kill_genocided_monsters');
                await update_inventory({ state });
                await ttyPline(`Wiped out all ${name}.`, state);
                if (Upolyd(state.u)
                    && is_vampshifter(state.youmonst)
                    && !is_vampire(state.youmonst?.data)
                    && (i === state.u.umonnum
                        || i === state.youmonst.cham)) {
                    const { polyself } = await import('./polyself.js');
                    await polyself(POLY_REVERT, state);
                }
                if (Upolyd(state.u) && i === state.u.umonnum) {
                    state.u.mh = -1;
                    if (propertyActive(UNCHANGING, state)) {
                        if (!feelDead) {
                            await ttyUrgentPline('You die.', state);
                            feelDead = true;
                        }
                        gameover = true;
                    } else {
                        const { rehumanize } = await import('./polyself.js');
                        await rehumanize(state);
                    }
                }
                if (i === state.urole.mnum || i === state.urace.mnum) {
                    state.u.uhp = -1;
                    if (Upolyd(state.u)) {
                        if (!feelDead) {
                            await youFeelDeadInside(state);
                            feelDead = true;
                        }
                    } else {
                        if (!feelDead) {
                            await ttyUrgentPline('You die.', state);
                            feelDead = true;
                        }
                        gameover = true;
                    }
                }
            } else if (mvitals[i].mvflags & G_GENOD) {
                if (!gameover)
                    await ttyPline(`${upstart(name)} are already nonexistent.`, state);
            } else if (!gameover) {
                const { quest_info } = await import('./questpgr.js');
                if ((species.msound !== MS_LEADER
                        || quest_info(MS_LEADER, state) === i)
                    && (species.msound !== MS_NEMESIS
                        || quest_info(MS_NEMESIS, state) === i)
                    && (species.msound !== MS_GUARDIAN
                        || quest_info(MS_GUARDIAN, state) === i)
                    && (i !== PM_NINJA
                        || state.urole.mnum === PM_SAMURAI)) {
                    const named = type_is_pname(species);
                    let unique = Boolean(species.geno & G_UNIQ);
                    if (i === PM_HIGH_CLERIC) unique = false;
                    await ttyPline(`You aren't permitted to genocide ${unique && !named ? 'the ' : ''}${unique || named ? species.pmnames[NEUTRAL] : name}.`, state);
                }
            }
        }
        if (gameover || state.u.uhp === -1) {
            state.killer ??= { format: KILLED_BY_AN, name: '' };
            state.killer.format = KILLED_BY_AN;
            state.killer.name = 'scroll of genocide';
            if (gameover) {
                const { done } = await import('./end.js');
                await done(GENOCIDED, state);
            }
        }
        return;
    }
}

// C ref: read.c do_genocide() (2826-3015). `how` is the source bitfield,
// preserving the cursed free-pass and confusion/throne forced-genocide arms.
export async function do_genocide(how, state = game) {
    const really = Boolean(how & GENOCIDE_REALLY);
    const player = Boolean(how & GENOCIDE_PLAYER);
    const onThrone = Boolean(how & GENOCIDE_ONTHRONE);
    const mvitals = state.svm?.mvitals ?? state.mvitals;
    let killPlayer = 0;
    let mndx;
    let ptr;
    let buf;
    if (player) {
        mndx = state.u.umonster;
        ptr = state.mons[mndx];
        buf = pmname(ptr, Ugender(state));
        ++killPlayer;
    } else {
        buf = '';
        for (let attempt = 0; ; ++attempt) {
            if (attempt >= 5) {
                if (!really && (ptr = rndmonst({ state }))) break;
                await ttyPline(thats_enough_tries, state);
                return;
            }
            let prompt = 'What type of monster do you want to genocide?';
            if (attempt > 0) {
                prompt += ` [enter ${state.iflags?.cmdassist
                    ? 'the name of a type of monster, or ?'
                    : "'?' to see previous genocides"}]`;
            }
            buf = mungspaces(await getlin(prompt, state) ?? '');
            if (!buf) {
                const suggestion = attempt + 1 < 5
                    ? "Type the name of a type of monster or 'none'"
                    : 'No type of monster specified';
                await ttyPline(`${suggestion}.`, state);
                continue;
            }
            if (buf[0] === '\x1b'
                || ['none', "'none'", 'nothing']
                    .some((word) => buf.toLowerCase() === word)) {
                if (!really && (ptr = rndmonst({ state }))) break;
                livelog_printf(LL_GENOCIDE,
                    'declined to perform genocide', state);
                return;
            }
            if (buf === '?' || buf === "'?'") {
                const { list_genocided } = await import('./insight.js');
                await list_genocided('g', false, state);
                --attempt;
                continue;
            }

            mndx = name_to_monplus(buf, { state }).mnum;
            if (mndx === NON_PM || (mvitals[mndx].mvflags & G_GENOD)) {
                await ttyPline(`Such creatures ${mndx === NON_PM
                    ? 'do not' : 'no longer'} exist in this world.`, state);
                continue;
            }
            ptr = state.mons[mndx];
            if (Upolyd(state.u)
                && is_vampshifter(state.youmonst)
                && !is_vampire(state.youmonst?.data)
                && (mndx === state.u.umonnum
                    || mndx === state.youmonst.cham)) {
                const { polyself } = await import('./polyself.js');
                await polyself(POLY_REVERT, state);
            }
            if (mndx === state.urole.mnum || mndx === state.urace.mnum) {
                ++killPlayer;
                break;
            }
            if (is_human(ptr)) adjalign(-Math.sign(state.u.ualign.type), state);
            if (is_demon(ptr)) adjalign(Math.sign(state.u.ualign.type), state);
            if (!(ptr.geno & G_GENO)) {
                const deafness = state.u?.uprops?.[DEAF];
                const deaf = Boolean(deafness?.intrinsic || deafness?.extrinsic
                    || state.u?.uroleplay?.deaf);
                if (!deaf) {
                    if (state.flags?.verbose)
                        await ttyPline('A thunderous voice booms through the caverns:', state);
                    await verbalize('No, mortal!  That will not be done.', state);
                }
                continue;
            }
            if (propertyActive(UNCHANGING, state)
                && ptr === state.youmonst.data) ++killPlayer;
            break;
        }
        mndx = ptr.pmidx;
    }

    let which = 'all ';
    const realName = ptr.pmnames[NEUTRAL];
    if (propertyActive(HALLUC, state)) {
        if (Upolyd(state.u)) {
            buf = pmname(state.youmonst.data,
                state.flags?.female ? FEMALE : MALE);
        } else {
            buf = (state.flags?.female && state.urole.name.f)
                ? state.urole.name.f : state.urole.name.m;
            buf = buf[0].toLowerCase() + buf.slice(1);
        }
    } else {
        buf = realName;
        if ((ptr.geno & G_UNIQ) && ptr.pmidx !== PM_HIGH_CLERIC)
            which = type_is_pname(ptr) ? '' : 'the ';
    }

    if (really) {
        const { num_genocides } = await import('./insight.js');
        if (!num_genocides(state)) {
            const heroPossessive = state.flags?.female ? 'her' : 'his';
            livelog_printf(
                LL_CONDUCT | LL_GENOCIDE,
                `performed ${heroPossessive} first genocide (${makeplural(realName)})`,
                state,
            );
        } else {
            livelog_printf(LL_GENOCIDE,
                `genocided ${makeplural(realName)}`, state);
        }
        mvitals[mndx].mvflags |= G_GENOD | G_NOCORPSE;
        await ttyPline(`Wiped out ${which}${which !== 'all '
            ? buf : makeplural(buf)}.`, state);
        if (killPlayer) {
            state.u.uhp = -1;
            if (player) {
                state.killer ??= { format: KILLED_BY, name: '' };
                state.killer.format = KILLED_BY;
                state.killer.name = 'genocidal confusion';
            } else if (onThrone) {
                state.killer ??= { format: KILLED_BY_AN, name: '' };
                state.killer.format = KILLED_BY_AN;
                state.killer.name = 'imperious order';
            } else {
                state.killer ??= { format: KILLED_BY_AN, name: '' };
                state.killer.format = KILLED_BY_AN;
                state.killer.name = 'scroll of genocide';
            }
            if (Upolyd(state.u) && ptr !== state.youmonst.data) {
                const { delayed_killer } = await import('./end.js');
                delayed_killer(POLYMORPH, state.killer.format,
                    state.killer.name, state);
                await youFeelDeadInside(state);
            } else {
                const { done } = await import('./end.js');
                await done(GENOCIDED, state);
            }
        } else if (ptr === state.youmonst.data) {
            const { rehumanize } = await import('./polyself.js');
            await rehumanize(state);
        }
        note_unported('mon.c kill_genocided_monsters');
        await update_inventory({ state });
    } else {
        let count = 0;
        const census = monster_census(false, { state });
        if (!(ptr.geno & G_UNIQ)
            && !(mvitals[mndx].mvflags & (G_GENOD | G_EXTINCT))) {
            for (let i = rn1(3, 4); i > 0; --i) {
                const monster = await makemon_runtime(
                    ptr, state.u.ux, state.u.uy, NO_MINVENT | MM_NOMSG,
                    { state },
                );
                if (!monster) break;
                ++count;
                if (mvitals[mndx].mvflags & G_EXTINCT) break;
            }
        }
        if (count) {
            count = monster_census(false, { state }) - census;
            await ttyPline(`Sent in ${count > 1 ? 'some ' : ''}${count > 1
                ? makeplural(buf) : an(buf)}.`, state);
        } else {
            await ttyPline('Nothing happens.', state);
        }
    }
}

// C ref: read.c seffect_genocide() (1722-1738). The helper never nulls the
// caller's object pointer, so seffects() retains its normal consumption path.
export async function seffect_genocide(scroll, state = game) {
    const blessed = Boolean(scroll.blessed);
    const cursed = Boolean(scroll.cursed);
    const alreadyKnown = scroll.oclass === SPBOOK_CLASS
        || objectType(scroll, state).oc_name_known;
    if (!alreadyKnown)
        await ttyPline('You have found a scroll of genocide!', state);
    state.gk ??= {};
    state.gk.known = true;
    if (blessed) {
        await do_class_genocide(state);
    } else {
        const how = Number(!cursed)
            | (propertyActive(CONFUSION, state) ? 2 : 0);
        await do_genocide(how, state);
    }
}

// C ref: read.c seffect_stinking_cloud() (1991-2002). The wrapper only
// identifies the scroll and marks the effect known; do_stinking_cloud() owns
// target selection and cloud creation without consuming the scroll pointer.
export async function seffect_stinking_cloud(scroll, state = game) {
    const alreadyKnown = scroll.oclass === SPBOOK_CLASS
        || objectType(scroll, state).oc_name_known;
    if (!alreadyKnown)
        await ttyPline('You have found a scroll of stinking cloud!', state);
    state.gk ??= {};
    state.gk.known = true;
    await do_stinking_cloud(scroll, alreadyKnown, state);
}

// C ref: read.c seffect_gold_detection() (2035-2043). C selects trap
// detection for confusion or a cursed scroll and otherwise selects gold;
// each helper's 1 result means its strange-feeling path consumed `sobj`.
async function seffect_gold_detection(scroll, state = game) {
    const confused = propertyActive(CONFUSION, state);
    const consumed = (confused || scroll.cursed)
        ? await trap_detect(scroll, state)
        : await gold_detect(scroll, state);
    return Boolean(consumed);
}

// C ref: read.c seffect_food_detection() (2046-2052). The returned detection
// result is consumed by `seffects` to keep its local object pointer contract.
async function seffect_food_detection(scroll, state = game) {
    return Boolean(await food_detect(scroll, state));
}

// C ref: read.c forget() and seffect_amnesia(). Amnesia clears only the
// remembered ball/chain contact and monster recognition specified by C;
// blessed scrolls retain spell knowledge but still drain weapon training.
async function forget(howmuch, state, random, message) {
    if (state.uball) state.u.bc_felt = 0;

    if (howmuch & ALL_SPELLS)
        await losespells(state, { random });

    await drain_weapon_skill(random.rnd(howmuch ? 5 : 3), state, {
        random,
        message,
    });

    for (let monster = state.level?.monlist ?? state.fmon;
        monster; monster = monster.nmon) {
        if (monster !== state.u.usteed && monster !== state.u.ustuck)
            monster.meverseen = false;
    }
    for (let monster = state.gm?.migrating_mons;
        monster; monster = monster.nmon)
        monster.meverseen = false;
}

export async function seffect_amnesia(
    scroll,
    state = game,
    { random = { rn2, rnd, rnl }, message = ttyPline } = {},
) {
    const blessed = Boolean(scroll.blessed);
    state.gk ??= {};
    state.gk.known = true;
    await forget(blessed ? 0 : ALL_SPELLS, state, random, message);

    if (propertyActive(HALLUC, state)) {
        await message(
            'Your mind releases itself from mundane concerns.', state,
        );
    } else if (String(state.plname ?? '').slice(0, 4).toLowerCase() === 'maud') {
        await message(
            'As your mind turns inward on itself, you forget everything else.',
            state,
        );
    } else if (random.rn2(2)) {
        await message('Who was that Maud person anyway?', state);
    } else {
        await message(
            'Thinking of Maud you forget everything else.', state,
        );
    }
    await exercise(A_WIS, false, state, random);
}

// C ref: read.c seffects() (2194-2290). Preserve the complete source switch,
// its pre-dispatch Wisdom exercise, post-effect inventory refresh, and
// `sobj ? 0 : 1` return. C's effect helpers are void and receive `&sobj`;
// helpers not yet ported are explicit gaps rather than command refusals.
//
// C ref: read.c seffect_create_monster() (1606-1623). The count expression's
// short-circuit draws precede the consumed create_critters() visibility result.
async function seffect_create_monster(scroll, state = game,
    random = { rn2, rnd }) {
    const blessed = Boolean(scroll.blessed);
    const cursed = Boolean(scroll.cursed);
    const confused = propertyActive(CONFUSION, state);
    const count = 1
        + ((confused || cursed) ? 12 : 0)
        + ((blessed || random.rn2(73)) ? 0 : random.rnd(4));
    if (await create_critters(
        count,
        confused ? state.mons[PM_ACID_BLOB] : null,
        false,
        state,
        { random },
    )) {
        state.gk.known = true;
    }
}

export async function seffects(scroll, state = game, env = {}) {
    state.gk ??= {};
    const random = env.random ?? { rn1, rn2, rnd, rnl };
    if (objectType(scroll, state).oc_magic)
        await exercise(A_WIS, true, state, random);

    const confused = propertyActive(CONFUSION, state);
    switch (scroll.otyp) {
    case SCR_MAIL:
        note_unported('read.c seffect_mail');
        break;
    case SCR_ENCHANT_ARMOR:
        if (await seffect_enchant_armor(scroll, state, { ...env, random }))
            scroll = null;
        break;
    case SCR_DESTROY_ARMOR:
        if (!scroll.blessed && !scroll.cursed
            && !objectType(scroll, state).oc_name_known && !confused
            && !propertyActive(BLINDED, state)
            && can_chant(state.youmonst, state)
            && oneWornFlammableArmor(state)) {
            await seffect_destroy_armor(scroll, state);
        } else {
            note_unported('read.c seffect_destroy_armor');
        }
        break;
    case SCR_CONFUSE_MONSTER:
    case SPE_CONFUSE_MONSTER:
        await seffect_confuse_monster(scroll, state, { ...env, random });
        break;
    case SCR_SCARE_MONSTER:
    case SPE_CAUSE_FEAR:
        await seffect_scare_monster(scroll, state);
        break;
    case SCR_BLANK_PAPER:
        if (propertyActive(BLINDED, state)) {
            await ttyPline(
                "You don't remember there being any magic words on this scroll.",
                state,
            );
        } else {
            await ttyPline('This scroll seems to be blank.', state);
        }
        state.gk.known = true;
        break;
    case SCR_REMOVE_CURSE:
    case SPE_REMOVE_CURSE:
        await seffect_remove_curse(scroll, state, { ...env, random });
        break;
    case SCR_CREATE_MONSTER:
    case SPE_CREATE_MONSTER:
        await seffect_create_monster(scroll, state, random);
        break;
    case SCR_ENCHANT_WEAPON:
        if (await seffect_enchant_weapon(scroll, state)) scroll = null;
        break;
    case SCR_TAMING:
    case SPE_CHARM_MONSTER:
        await seffect_taming(scroll, state);
        break;
    case SCR_GENOCIDE:
        await seffect_genocide(scroll, state);
        break;
    case SCR_LIGHT:
        await seffect_light(scroll, state);
        break;
    case SCR_TELEPORTATION:
        await seffect_teleportation(scroll, state);
        break;
    case SCR_GOLD_DETECTION:
        if (await seffect_gold_detection(scroll, state)) scroll = null;
        break;
    case SCR_FOOD_DETECTION:
    case SPE_DETECT_FOOD:
        if (await seffect_food_detection(scroll, state)) scroll = null;
        break;
    case SCR_IDENTIFY:
    case SPE_IDENTIFY:
        if (await seffect_identify(scroll, state)) scroll = null;
        break;
    case SCR_CHARGING:
        if (await seffect_charging(scroll, state)) scroll = null;
        break;
    case SCR_MAGIC_MAPPING:
    case SPE_MAGIC_MAPPING:
        if (scroll.otyp === SCR_MAGIC_MAPPING && !scroll.blessed
            && !scroll.cursed && !state.level?.flags?.nommap) {
            await seffect_magic_mapping(scroll, state);
        } else {
            note_unported('read.c seffect_magic_mapping');
        }
        break;
    case SCR_AMNESIA:
        await seffect_amnesia(scroll, state, { random });
        break;
    case SCR_FIRE:
        await seffect_fire(scroll, state);
        scroll = null;
        break;
    case SCR_EARTH:
        await seffect_earth(scroll, state);
        break;
    case SCR_PUNISHMENT:
        if (punishmentReadAdmitted(scroll, confused, state))
            await seffect_punishment(scroll, state);
        else
            note_unported('read.c seffect_punishment');
        break;
    case SCR_STINKING_CLOUD:
        await seffect_stinking_cloud(scroll, state);
        break;
    default:
        note_unported('read.c seffects default');
        break;
    }

    if (!scroll) update_inventory({ state });
    return scroll ? 0 : 1;
}

// C ref: read.c seffect_enchant_weapon() (1627-1676). Return whether its
// `struct obj **` output cleared the scroll pointer; seffects() uses that to
// preserve the source's strange_feeling()/useup() contract.
export async function seffect_enchant_weapon(scroll, state = game) {
    const sobj = scroll;
    const sblessed = Boolean(sobj.blessed);
    const scursed = Boolean(sobj.cursed);
    const confused = propertyActive(CONFUSION, state);
    const uwep = state.uwep;

    // Confusion turns a weapon enchantment into the source rustproofing
    // operation, except for armor and objects objnam.c says do not erode.
    if (confused && uwep && erosion_matters(uwep, state)
        && uwep.oclass !== ARMOR_CLASS) {
        const oldErodeproof = Boolean(uwep.oerodeproof);
        const newErodeproof = !scursed;
        const blind = propertyActive(BLINDED, state);
        uwep.oerodeproof = 0;
        if (blind) {
            uwep.rknown = false;
            await ttyPline('Your weapon feels warm for a moment.', state);
        } else {
            uwep.rknown = true;
            await ttyPline(
                `${Yobjnam2(uwep, 'are', state)} covered by a ${scursed ? 'mottled' : 'shimmering'} `
                + `${hcolor(scursed ? 'purple' : 'golden', state)} ${scursed ? 'glow' : 'shield'}!`,
                state,
            );
        }
        if (newErodeproof && (uwep.oeroded || uwep.oeroded2)) {
            uwep.oeroded = 0;
            uwep.oeroded2 = 0;
            await ttyPline(
                `${Yobjnam2(uwep, blind ? 'feel' : 'look', state)} as good as new!`,
                state,
            );
        }
        if (oldErodeproof && !newErodeproof) {
            // C restores the old flag before asking the shop subsystem to
            // price the change, then applies the new false value below.
            uwep.oerodeproof = 1;
            sourceCostlyAlteration(uwep, COST_DEGRD, state);
        }
        uwep.oerodeproof = newErodeproof ? 1 : 0;
        return false;
    }

    // C evaluates the ternary in this order; in particular, the high-skill
    // chance precedes the blessed amount and must draw rn2(spe) first.
    const s = scursed ? -1
        : !uwep ? 1
            : uwep.spe >= 9 ? (rn2(uwep.spe) === 0 ? 1 : 0)
                : sblessed ? rnd(3 - Math.trunc(uwep.spe / 3))
                    : 1;
    const consumed = !(await chwepon(sobj, s, state));
    if (state.uwep)
        cap_spe(state.uwep);
    return consumed;
}

// C ref: shk.c costly_alteration() is a void call here. Its JS port only owns
// the source fast path for free/inventory objects without an unpaid bill.
function sourceCostlyAlteration(obj, alterType, state) {
    if ((obj.where === OBJ_FREE || obj.where === OBJ_INVENT) && !obj.unpaid) {
        costly_alteration(obj, alterType, { state });
    } else {
        note_unported('shk.c costly_alteration');
    }
}

// C ref: read.c cant_revive() (3111-3134).
//
// C answers through an `int *mtype` the caller owns; JavaScript has no such
// pointer, so the substituted species comes back beside the boolean as
// `{ changed, mtype }`. All four of C's callers read both halves:
// bones.c:156, trap.c:746, read.c:3262 and zap.c:982.
//
// `from_obj` is the corpse or statue a revival came from, and only the
// unique-species arm looks at it. A unique corpse with saved monster traits is
// allowed to revive as itself; without them it becomes a doppelganger.
export function cant_revive(mtype, revival, from_obj, state = game) {
    /* SHOPKEEPERS can be revived now */
    if (mtype === PM_GUARD || (mtype === PM_SHOPKEEPER && !revival)
        || mtype === PM_HIGH_CLERIC || mtype === PM_ALIGNED_CLERIC
        || mtype === PM_ANGEL) {
        return { changed: true, mtype: PM_HUMAN_ZOMBIE };
    } else if (mtype === PM_LONG_WORM_TAIL) { /* for create_particular() */
        return { changed: true, mtype: PM_LONG_WORM };
    } else if (unique_corpstat(state.mons?.[mtype])
        && (!from_obj || !from_obj.oextra?.omonst)) {
        /* unique corpses (from bones or wizard mode wish) or
           statues (bones or any wish) end up as shapechangers */
        return { changed: true, mtype: PM_DOPPELGANGER };
    }
    return { changed: false, mtype };
}

// read.c:3162, whose comment at 3163-3164 gives the reason: the most the
// command will make is one monster per map cell, (0..ROWNO-1) x (1..COLNO-1).
const QUAN_LIMIT = ROWNO * (COLNO - 1);

// C ref: read.c create_particular_parse() (3137-3251).  The C function edits
// the answer buffer in place; replacing matched qualifier bytes with spaces
// preserves the subsequent mungspaces() and name-lookup behavior.
function blankWord(text, offset, length) {
    return text.slice(0, offset) + ' '.repeat(length)
        + text.slice(offset + length);
}

export function create_particular_parse(str, state = game) {
    if (typeof str !== 'string')
        throw new TypeError('monster request must be text');
    let bufp = str;
    const d = {
        quan: 1 + ((state.multi > 0) ? state.multi : 0),
        monclass: MAXMCLASSES,
        which: state.urole.mnum,
        fem: -1,
        genderconf: -1,
        randmonst: false,
        maketame: false,
        makepeaceful: false,
        makehostile: false,
        sleeping: false,
        saddled: false,
        invisible: false,
        hidden: false,
    };

    const countMatch = bufp.match(/^\d+/u);
    if (countMatch) {
        d.quan = Number.parseInt(countMatch[0], 10);
        bufp = bufp.slice(countMatch[0].length);
        while (bufp.startsWith(' ')) bufp = bufp.slice(1);
    }
    if (d.quan < 1 || d.quan > QUAN_LIMIT)
        d.quan = QUAN_LIMIT - monster_census(false, { state });

    for (const [word, field] of [
        ['saddled ', 'saddled'],
        ['sleeping ', 'sleeping'],
        ['invisible ', 'invisible'],
        ['hidden ', 'hidden'],
        ['female ', 'fem'],
        ['male ', 'fem'],
    ]) {
        const offset = strstri(bufp, word);
        if (offset < 0) continue;
        d[field] = field === 'fem'
            ? word === 'female ' ? FEMALE : MALE
            : true;
        bufp = blankWord(bufp, offset, word.length);
    }
    bufp = mungspaces(bufp);

    if (strstri(bufp, 'tame ') === 0) {
        d.maketame = true;
        bufp = bufp.slice(5);
    } else if (strstri(bufp, 'peaceful ') === 0) {
        d.makepeaceful = true;
        bufp = bufp.slice(9);
    } else if (strstri(bufp, 'hostile ') === 0) {
        d.makehostile = true;
        bufp = bufp.slice(8);
    }

    if (state.wizard && (bufp === '*' || bufp === 'random')) {
        d.randmonst = true;
        return d;
    }

    const named = name_to_monplus(bufp, { state, gender: NEUTRAL });
    d.which = named.mnum;
    if (d.fem === MALE || d.fem === FEMALE) {
        if (named.gender !== NEUTRAL && d.fem !== named.gender)
            d.genderconf = named.gender;
    } else {
        d.fem = named.gender;
    }
    if (ismnum(d.which)) return d;

    const mndxRef = { value: d.which };
    d.monclass = name_to_monclass(bufp, mndxRef, { state });
    d.which = mndxRef.value;
    if (ismnum(d.which)) {
        d.monclass = MAXMCLASSES;
        return d;
    }
    if (d.monclass === S_invisible) {
        d.which = PM_STALKER;
        d.monclass = MAXMCLASSES;
        return d;
    }
    if (d.monclass === S_WORM_TAIL) {
        d.which = PM_LONG_WORM;
        d.monclass = MAXMCLASSES;
        return d;
    }
    if (d.monclass > 0) {
        d.which = state.urole.mnum;
        return d;
    }
    return false;
}

// C ref: read.c create_particular_creation() (3252-3371).  Every requested
// state change occurs after the awaited makemon() lifecycle has completed.
async function create_particular_creation(d, state = game) {
    let madeany = false;
    let firstchoice = NON_PM;
    let whichpm = null;
    if (!d.randmonst) {
        firstchoice = d.which;
        const revived = cant_revive(d.which, false, null, state);
        d.which = revived.mtype;
        if (revived.changed && firstchoice !== PM_LONG_WORM_TAIL) {
            const original = state.mons[firstchoice]?.pmnames?.[NEUTRAL]
                ?? state.mons[firstchoice]?.pmnames?.[MALE] ?? '';
            const replacement = state.mons[revived.mtype]?.pmnames?.[NEUTRAL]
                ?? state.mons[revived.mtype]?.pmnames?.[MALE] ?? '';
            const answer = await y_n(
                `Creating ${replacement} instead; force ${original}?`, state,
            );
            // cmd.c y_n() returns the accepted key byte, not a one-character
            // JavaScript string.  Keep the affirmative force branch aligned
            // with the numeric response contract used by yn_function().
            if (answer === 'y'.charCodeAt(0)) d.which = firstchoice;
        }
        whichpm = state.mons[d.which];
    }

    for (let i = 0; i < d.quan; ++i) {
        if (d.monclass !== MAXMCLASSES)
            whichpm = mkclass(d.monclass, 0, { state });
        else if (d.randmonst)
            whichpm = rndmonst({ state });

        let mmflags = NO_MM_FLAGS;
        if (d.genderconf === -1) {
            if (d.fem !== -1 && (!whichpm
                || (!is_male(whichpm) && !is_female(whichpm)))) {
                mmflags |= d.fem === FEMALE ? MM_FEMALE
                    : d.fem === MALE ? MM_MALE : 0;
            }
            mmflags |= MM_NOEXCLAM;
        } else {
            mmflags |= d.fem === FEMALE ? MM_FEMALE : MM_MALE;
        }
        if (d.invisible) mmflags |= MM_MINVIS;

        const mtmp = await makemon_runtime(
            whichpm, state.u.ux, state.u.uy, mmflags,
            { state, _createParticular: true },
        );
        if (!mtmp) {
            if (d.monclass === MAXMCLASSES && !d.randmonst) break;
            continue;
        }
        const mx = mtmp.mx;
        const my = mtmp.my;
        if (d.maketame) {
            await tamedog(mtmp, null, false, { state });
        } else if (d.makepeaceful || d.makehostile) {
            mtmp.mtame = 0;
            mtmp.mpeaceful = d.makepeaceful;
            set_malign(mtmp, state);
        }
        if (d.saddled && can_saddle(mtmp) && !which_armor(mtmp, W_SADDLE))
            await put_saddle_on_mon(null, mtmp, { state });
        if (d.hidden
            && ((is_hider(mtmp.data) && mtmp.data.mlet !== S_MIMIC)
                || (hides_under(mtmp.data) && OBJ_AT(mx, my, state))
                || (mtmp.data.mlet === S_EEL && is_pool(mx, my, state)))) {
            mtmp.mundetected = 1;
        }
        if (d.sleeping) mtmp.msleeping = 1;
        if ((d.hidden || d.invisible) && !canSpotMonster(mtmp, state))
            await flash_mon(mtmp, state);
        madeany = true;
        if (mtmp.cham !== NON_PM && firstchoice !== NON_PM
            && mtmp.cham !== firstchoice)
            await newcham(mtmp, state.mons[firstchoice], { state });
    }
    return madeany;
}

// C ref: read.c create_particular() (3372-3411).  Parse failures return FALSE
// and are retried with the same prompt growth and diagnostics as the source.
export async function create_particular(state = game) {
    let prompt = 'Create what kind of monster?';
    let tryct = 5;
    let altmsg = 0;
    do {
        const buf = await getlin(prompt, state);
        const bufp = mungspaces(buf);
        if (bufp[0] === '\x1B') return false;
        const d = create_particular_parse(bufp, state);
        if (d) return create_particular_creation(d, state);
        if (bufp || altmsg || tryct < 2)
            await ttyPline("I've never heard of such monsters.", state);
        else {
            await ttyPline('Try again (type * for random, ESC to cancel).', state);
            ++altmsg;
        }
        if (tryct === 5) prompt += ' [type name or symbol]';
    } while (--tryct > 0);
    await ttyPline(thats_enough_tries, state);
    return false;
}
