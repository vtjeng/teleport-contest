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
    BLINDED,
    BY_COOKIE,
    COLNO,
    CONFUSION,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    FEMALE,
    CORR,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_EXCLUDE_SELECTABLE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    G_GONE,
    HALLUC,
    MALE,
    MM_FEMALE,
    MM_EDOG,
    MM_MINVIS,
    MM_MALE,
    MM_NOMSG,
    MM_NOEXCLAM,
    NO_MINVENT,
    NEUTRAL,
    NO_MM_FLAGS,
    ROWNO,
    ROOMOFFSET,
    LS_OBJECT,
    thats_enough_tries,
    SPE_LIM,
    W_BALL,
    W_CHAIN,
    WT_IRON_BALL_INCR,
    Is_rogue_level,
    Is_waterlevel,
    isok,
    ismnum,
    OBJ_AT,
    LL_CONDUCT,
    MAX_ERODE,
} from './const.js';
import {
    NON_PM,
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
    PM_XAN,
    S_EEL,
    S_MIMIC,
    S_WORM_TAIL,
    S_invisible,
} from './monsters.js';
import { makeplural } from './fruit.js';
import { mungspaces, strstri, upwords } from './hacklib.js';
import { game } from './gstate.js';
import {
    check_capacity,
    notice_mon_off,
    notice_mon_on,
} from './hack.js';
import { getobj, identify_pack, update_inventory, useup } from './invent.js';
import { getlin } from './windows.js';
import {
    is_female,
    is_male,
    can_chant,
    amorphous,
    is_whirly,
    hides_under,
    is_hider,
    name_to_monclass,
    name_to_monplus,
    unsolid,
    unique_corpstat,
} from './mondata.js';
import {
    can_saddle,
    initedog,
    put_saddle_on_mon,
    tamedog,
} from './dog.js';
import { makemon_runtime, newcham } from './makemon_create.js';
import { mkclass, rndmonst, set_malign } from './makemon.js';
import { monster_census } from './minion.js';
import { Monnam } from './do_name.js';
import { flash_mon } from './mon.js';
import { MAXMCLASSES } from './symbols.js';
import {
    ALCHEMY_SMOCK,
    BALL_CLASS,
    BRASS_LANTERN,
    CHAIN_CLASS,
    CAN_OF_GREASE,
    CANDY_BAR,
    COIN_CLASS,
    CORNUTHAUM,
    CREDIT_CARD,
    DUNCE_CAP,
    FORTUNE_COOKIE,
    HAWAIIAN_SHIRT,
    MAGIC_MARKER,
    MAGIC_LAMP,
    OIL_LAMP,
    RING_CLASS,
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
    SCR_TAMING,
    SCROLL_CLASS,
    SCR_DESTROY_ARMOR,
    SCR_ENCHANT_WEAPON,
    TOOL_CLASS,
    WAND_CLASS,
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
    WEAPON_CLASS,
} from './objects.js';
import {
    bcsign,
    greatest_erosion,
    is_flammable,
    is_weptool,
    mkobj,
    objectType,
    place_object,
} from './obj.js';
import { exercise } from './attrib.js';
import { wipeout_text } from './engrave.js';
import { do_mapping } from './detect.js';
import { level_tele, scrolltele } from './teleport.js';
import { lightdamage } from './zap.js';
import { discover_object } from './o_init.js';
import { more_experienced } from './exper.js';
import { rn1, rn2, rnl, rnd } from './rng.js';
import { ttyPline } from './tty_message.js';
import { newsym } from './display.js';
import { flooreffects, trycall } from './do.js';
import { y_n } from './cmd.js';
import {
    study_book,
} from './spell.js';
import { destroy_arm, some_armor, setwornEnv } from './do_wear.js';
import { setworn } from './worn.js';
import { chwepon } from './wield.js';
import {
    ART_ORB_OF_FATE,
    ART_SUNSWORD,
    artifact_light,
    is_art,
} from './artifacts.js';
import { del_light_source } from './light.js';
import { light_hits_gremlin } from './uhitm.js';
import { do_clear_area, vision_recalc } from './vision.js';
import { canSpotMonster } from './startup_a11y.js';
import { m_at } from './monst.js';
import { livelog_printf } from './pline.js';
import {
    an,
    simpleonames,
    singular,
    suit_simple_name,
    xnameFresh,
} from './objnam.js';
import { shk_your } from './shk.js';
import { pmname } from './do_name.js';
import { outrumor } from './random_text.js';
import { note_unported } from './unported.js';

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

function propertyActive(property, state) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
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

// C ref: read.c seffect_remove_curse() (1489-1605). Only the cursed-scroll
// branch (lines 1505-1506) is ported: it prints the You_feel message and
// "The scroll disintegrates." and skips the uncursed/blessed invent-traversal
// loop. The function never nulls sobjp, so seffects() returns 0 and the
// caller handles useup.
export async function seffect_remove_curse(scroll, state = game) {
    if (scroll.otyp !== SCR_REMOVE_CURSE || !scroll.cursed) {
        throw new UnsupportedReadError(
            'the selected remove-curse branch',
        );
    }
    const confused = propertyActive(CONFUSION, state);
    const halluc = propertyActive(HALLUC, state);
    // C ref: pline.c You_feel() prepends "You feel " (or "You dream that
    // you feel " when Unaware, which cannot happen while reading).
    await ttyPline(
        'You feel '
        + (!halluc
            ? (!confused ? 'like someone is helping you.'
                : 'like you need some help.')
            : (!confused ? 'in touch with the Universal Oneness.'
                : 'the power of the Force against you!')),
        state,
    );
    await ttyPline('The scroll disintegrates.', state);
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

// C ref: read.c seffect_identify() (2055-2099), restricted to an unknown,
// sighted, unconfused, unblessed, uncursed identify scroll. Both ordinary-scroll
// rn2(5) outcomes are retained because the zero result spends a second rn2(5).
export async function seffect_identify(scroll, state = game) {
    if (scroll.otyp !== SCR_IDENTIFY || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || objectType(scroll, state).oc_name_known
        || scroll.quan !== 1) {
        throw new UnsupportedReadError('the selected identify-scroll branch');
    }

    useup(scroll, { state, hooks: {} });
    await ttyPline('This is an identify scroll.', state);
    learnscrolltyp(SCR_IDENTIFY, state);

    let cval = 1;
    if (rn2(5) === 0) cval = rn2(5);
    await identify_pack(cval, true, state);
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
async function litroom(on, object, state) {
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

// C ref: read.c seffects() (2194-2290). Preserve the complete source switch,
// its pre-dispatch Wisdom exercise, post-effect inventory refresh, and
// `sobj ? 0 : 1` return. C's effect helpers are void and receive `&sobj`;
// helpers not yet ported are explicit gaps rather than command refusals.
export async function seffects(scroll, state = game) {
    state.gk ??= {};
    if (objectType(scroll, state).oc_magic)
        await exercise(A_WIS, true, state, { rn2 });

    const confused = propertyActive(CONFUSION, state);
    switch (scroll.otyp) {
    case SCR_MAIL:
        note_unported('read.c seffect_mail');
        break;
    case SCR_ENCHANT_ARMOR:
        note_unported('read.c seffect_enchant_armor');
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
        note_unported('read.c seffect_confuse_monster');
        break;
    case SCR_SCARE_MONSTER:
    case SPE_CAUSE_FEAR:
        note_unported('read.c seffect_scare_monster');
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
        if (scroll.otyp === SCR_REMOVE_CURSE && scroll.cursed)
            await seffect_remove_curse(scroll, state);
        else
            note_unported('read.c seffect_remove_curse');
        break;
    case SCR_CREATE_MONSTER:
    case SPE_CREATE_MONSTER:
        note_unported('read.c seffect_create_monster');
        break;
    case SCR_ENCHANT_WEAPON:
        if (!scroll.blessed && !scroll.cursed && !confused
            && !propertyActive(BLINDED, state)
            && !propertyActive(HALLUC, state) && state.uwep
            && (state.uwep.oclass === WEAPON_CLASS
                || is_weptool(state.uwep, state))
            && !state.uwep.oartifact && !state.uwep.oeroded
            && !state.uwep.oeroded2 && state.uwep.spe <= 5
            && can_chant(state.youmonst, state)) {
            await seffect_enchant_weapon(scroll, state);
        } else {
            note_unported('read.c seffect_enchant_weapon');
        }
        break;
    case SCR_TAMING:
    case SPE_CHARM_MONSTER:
        note_unported('read.c seffect_taming');
        break;
    case SCR_GENOCIDE:
        note_unported('read.c seffect_genocide');
        break;
    case SCR_LIGHT:
        await seffect_light(scroll, state);
        break;
    case SCR_TELEPORTATION:
        await seffect_teleportation(scroll, state);
        break;
    case SCR_GOLD_DETECTION:
        note_unported('read.c seffect_gold_detection');
        break;
    case SCR_FOOD_DETECTION:
    case SPE_DETECT_FOOD:
        note_unported('read.c seffect_food_detection');
        break;
    case SCR_IDENTIFY:
    case SPE_IDENTIFY:
        if (scroll.otyp === SCR_IDENTIFY && !scroll.blessed
            && !scroll.cursed && !confused
            && !objectType(scroll, state).oc_name_known
            && scroll.quan === 1) {
        await seffect_identify(scroll, state);
        update_inventory({ state });
            scroll = null;
        } else {
            note_unported('read.c seffect_identify');
        }
        break;
    case SCR_CHARGING:
        note_unported('read.c seffect_charging');
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
        note_unported('read.c seffect_amnesia');
        break;
    case SCR_FIRE:
        note_unported('read.c seffect_fire');
        break;
    case SCR_EARTH:
        note_unported('read.c seffect_earth');
        break;
    case SCR_PUNISHMENT:
        if (punishmentReadAdmitted(scroll, confused, state))
            await seffect_punishment(scroll, state);
        else
            note_unported('read.c seffect_punishment');
        break;
    case SCR_STINKING_CLOUD:
        note_unported('read.c seffect_stinking_cloud');
        break;
    default:
        note_unported('read.c seffects default');
        break;
    }

    if (!scroll) update_inventory({ state });
    return scroll ? 0 : 1;
}

// C ref: read.c seffect_enchant_weapon() (1627-1676), restricted to the
// ordinary uncursed positive branch. The source chooses `s = 1` below its
// soft upper limit, passes that value to wield.c chwepon(), and leaves the
// scroll for doread() to consume after the effect returns.
export async function seffect_enchant_weapon(scroll, state = game) {
    const uwep = state.uwep;
    if (scroll.otyp !== SCR_ENCHANT_WEAPON
        || scroll.oclass !== SCROLL_CLASS
        || scroll.blessed || scroll.cursed
        || propertyActive(CONFUSION, state)
        || propertyActive(BLINDED, state)
        || propertyActive(HALLUC, state)
        || !uwep
        || (uwep.oclass !== WEAPON_CLASS && !is_weptool(uwep, state))
        || uwep.oartifact || uwep.oeroded || uwep.oeroded2
        || uwep.spe > 5
        || !can_chant(state.youmonst, state)) {
        throw new UnsupportedReadError(
            'the selected ordinary enchant-weapon branch',
        );
    }
    await chwepon(scroll, 1, state);
    if (state.uwep && Math.abs(state.uwep.spe) > SPE_LIM)
        state.uwep.spe = Math.sign(state.uwep.spe) * SPE_LIM;
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
