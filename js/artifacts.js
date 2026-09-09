// artifacts.js -- artifact table and new-game artifact initialization.
// C refs: include/artifact.h, include/artilist.h, src/artifact.c
//          init_artifacts() and hack_artifacts().

import {
    A_NONE,
    A_CHAOTIC,
    A_LAWFUL,
    A_NEUTRAL,
    ANTIMAGIC,
    BLINDED,
    BLND_RES,
    COLD_RES,
    CONFUSION,
    CONFLICT,
    DISINT_RES,
    DRAIN_RES,
    ECMD_CANCEL,
    ECMD_OK,
    ECMD_TIME,
    ENERGY_REGENERATION,
    FIRE_RES,
    GETOBJ_EXCLUDE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    GETOBJ_ALLOWCNT,
    HALF_PHDAM,
    HALF_SPDAM,
    HALLUC,
    Has_contents,
    HALLUC_RES,
    I_SPECIAL,
    INVIS,
    LAST_PROP,
    LEVITATION,
    Never_mind,
    NON_PM,
    nothing_happens,
    nothing_seems_to_happen,
    ONAME_BONES,
    ONAME_GIFT,
    ONAME_KNOW_ARTI,
    ONAME_LEVEL_DEF,
    ONAME_NO_FLAGS,
    ONAME_RANDOM,
    ONAME_VIA_DIP,
    ONAME_VIA_NAMING,
    ONAME_WISH,
    PICK_ONE,
    POISON_RES,
    PROTECTION,
    REFLECTING,
    REGENERATION,
    SEARCHING,
    SHOCK_RES,
    SICK,
    SICK_ALL,
    SLIMED,
    STEALTH,
    STONE_RES,
    STUNNED,
    TELEPORT_CONTROL,
    TIMEOUT,
    Upolyd,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ART,
    W_ARTI,
    W_ARMU,
    W_RINGL,
    W_RINGR,
    W_SWAPWEP,
    W_TOOL,
    W_WEP,
    WARNING,
    WARN_OF_MON,
    A_CON,
    A_WIS,
    D_TRAPPED,
    IS_ALTAR,
    IS_DOOR,
    KILLED_BY,
    MIGR_RANDOM,
    ismnum,
    In_endgame,
    In_quest,
    isok,
    W_BALL,
    W_QUIVER,
    NOTELL,
    engulfing_u,
    NECK,
} from './const.js';
import { game } from './gstate.js';
import {
    AT_MAGC,
    LOW_PM,
    M2_DEMON,
    M2_ELF,
    M2_GIANT,
    M2_ORC,
    M2_UNDEAD,
    M2_WERE,
    M3_COVETOUS,
    MS_NEMESIS,
    PM_ARCHEOLOGIST,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_CLAY_GOLEM,
    PM_CLERIC,
    PM_ELF,
    PM_HEALER,
    PM_KNIGHT,
    PM_MONK,
    PM_ORC,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_TOURIST,
    PM_VALKYRIE,
    PM_WIZARD,
    PM_JABBERWOCK,
    PM_WATER_ELEMENTAL,
    S_DRAGON,
    S_IMP,
    S_OGRE,
    S_TROLL,
} from './monsters.js';
import {
    ACID_VENOM,
    AMULET_OF_ESP,
    ARROW,
    ATHAME,
    BAG_OF_TRICKS,
    BATTLE_AXE,
    BELL_OF_OPENING,
    BLACK_DRAGON_SCALES,
    BLINDING_VENOM,
    BLUE_DRAGON_SCALES,
    BOW,
    BROADSWORD,
    CREDIT_CARD,
    CRYSTAL_BALL,
    ELVEN_BROADSWORD,
    ELVEN_DAGGER,
    FAKE_AMULET_OF_YENDOR,
    GOLD_DRAGON_SCALES,
    GOLD_DRAGON_SCALE_MAIL,
    GRAY_DRAGON_SCALE_MAIL,
    GRAY_DRAGON_SCALES,
    GREEN_DRAGON_SCALES,
    HELM_OF_BRILLIANCE,
    KATANA,
    LARGE_BOX,
    LEASH,
    LENSES,
    LONG_SWORD,
    LUCKSTONE,
    MACE,
    MIRROR,
    MORNING_STAR,
    NUM_OBJECTS,
    OBJ_DESCR,
    ORANGE_DRAGON_SCALES,
    ORCISH_DAGGER,
    QUARTERSTAFF,
    RED_DRAGON_SCALES,
    RING_CLASS,
    RIN_INCREASE_DAMAGE,
    RUNESWORD,
    SCR_TAMING,
    SILVER,
    SILVER_MACE,
    SILVER_SABER,
    SKELETON_KEY,
    SPE_CONE_OF_COLD,
    SPE_FIREBALL,
    STRANGE_OBJECT,
    TOOL_CLASS,
    TSURUGI,
    WAND_CLASS,
    WAR_HAMMER,
    WEAPON_CLASS,
    WHITE_DRAGON_SCALES,
    YELLOW_DRAGON_SCALES,
} from './objects.js';

import { fuzzymatch, lcase, s_suffix, upstart } from './hacklib.js';
import { aligns } from './roles.js';
import { d, rn2, rnd, rn2_on_display_rng, rnz } from './rng.js';
import { CLR_BRIGHT_BLUE, CLR_RED, NO_COLOR } from './terminal.js';
import { ttyPline } from './tty_message.js';
import { note_unported } from './unported.js';
import { freeinv, getobj, hold_another_object, nxtobj, obj_extract_self, obfree, update_inventory } from './invent.js';
import {
    aobjnam, bare_artifactname, distant_name, killer_xname, otense, simple_typename,
    the, The, Tobjnam, vtense, xnameFresh, yname,
} from './objnam.js';
import { getdir } from './cmd.js';
import {
    amorphous, attacktype, bigmonst, defended, has_head, hates_silver,
    is_demon, is_dlord, is_dprince, monster_resists_element,
    noncorporeal, nonliving, resists_drli, sticks,
} from './mondata.js';
import { In_hell, Invocation_lev, depth, dunlevs_in_dungeon, ledger_no, surface } from './dungeon.js';
import { cansee, couldsee } from './vision.js';
import { next_to_u } from './apply_next_to_u.js';
import { glyph_at, glyph_is_trap, map_invisible, newsym } from './display.js';
import { losehp, nomul, spoteffects } from './hack.js';
import { float_down, t_at } from './trap.js';
import { level_tele } from './teleport.js';
import { align_str, enlightenment } from './insight.js';
import { carried, Is_dragon_armor, Is_dragon_mail, mksobj, objectType, weight } from './obj.js';
import { obj_shuffle_range, observe_object } from './o_init.js';
import { capitalizedMonsterName, monsterCommonName } from './do_name.js';
import { cancel_monst, resist, Fire_resistance, Cold_resistance } from './zap.js';
import { healmon, migrate_mon, set_ustuck, wake_nearto } from './mon.js';
import { monflee } from './monmove.js';
import { throwit } from './dothrow.js';
import { P_SKILL, spell_skilltype } from './startup_skills.js';
import { spelleffects } from './spell.js';
import { seffects } from './read.js';
import { charge_ok } from './read.js';
import { healup, make_blinded } from './potion.js';
import { dropx, maybe_lvltport_feedback, goto_level } from './do.js';
import { select_menu } from './windows.js';
import { clr2colorname } from './coloratt.js';
import { exercise } from './attrib.js';
import { body_part, mbodypart } from './polyself.js';
import { monhp_per_lvl } from './makemon.js';
import { losexp } from './exper.js';
import { destroy_items } from './zap_destroy_items.js';
import { ignite_items } from './apply_catch_lit.js';
import { burn_away_slime } from './timeout.js';
import { remove_worn_item } from './steal.js';
import { On_stairs } from './stairs.js';

// C refs: artifact.c defends() and defends_when_carried(). Artifact attack,
// defense, and carry records all use the same damage-type encoding.
export function artifact_defends(
    obj,
    damageType,
    state = game,
    carried = false,
) {
    if (!obj?.oartifact) return false;
    const artifact = state.artilist?.[obj.oartifact];
    if (!artifact) {
        throw new Error(
            `artifact defense requires artifact ${obj.oartifact} data`,
        );
    }
    return artifact[carried ? 'cary' : 'defn']?.adtyp === damageType;
}

export const SPFX_NONE = 0x00000000;
export const SPFX_NOGEN = 0x00000001;
export const SPFX_RESTR = 0x00000002;
export const SPFX_INTEL = 0x00000004;
export const SPFX_SPEAK = 0x00000008;
export const SPFX_SEEK = 0x00000010;
export const SPFX_WARN = 0x00000020;
export const SPFX_ATTK = 0x00000040;
export const SPFX_DEFN = 0x00000080;
export const SPFX_DRLI = 0x00000100;
export const SPFX_SEARCH = 0x00000200;
export const SPFX_BEHEAD = 0x00000400;
export const SPFX_HALRES = 0x00000800;
export const SPFX_ESP = 0x00001000;
export const SPFX_STLTH = 0x00002000;
export const SPFX_REGEN = 0x00004000;
export const SPFX_EREGEN = 0x00008000;
export const SPFX_HSPDAM = 0x00010000;
export const SPFX_HPHDAM = 0x00020000;
export const SPFX_TCTRL = 0x00040000;
export const SPFX_LUCK = 0x00080000;
export const SPFX_DMONS = 0x00100000;
export const SPFX_DCLAS = 0x00200000;
export const SPFX_DFLAG1 = 0x00400000;
export const SPFX_DFLAG2 = 0x00800000;
export const SPFX_DALIGN = 0x01000000;
export const SPFX_DBONUS = 0x01f00000;
export const SPFX_XRAY = 0x02000000;
export const SPFX_REFLECT = 0x04000000;
export const SPFX_PROTECT = 0x08000000;

export const TAMING = LAST_PROP + 1;
export const HEALING = TAMING + 1;
export const ENERGY_BOOST = HEALING + 1;
export const UNTRAP = ENERGY_BOOST + 1;
export const CHARGE_OBJ = UNTRAP + 1;
export const LEV_TELE = CHARGE_OBJ + 1;
export const CREATE_PORTAL = LEV_TELE + 1;
export const ENLIGHTENING = CREATE_PORTAL + 1;
export const CREATE_AMMO = ENLIGHTENING + 1;
export const BANISH = CREATE_AMMO + 1;
export const FLING_POISON = BANISH + 1;
export const FIRESTORM = FLING_POISON + 1;
export const SNOWSTORM = FIRESTORM + 1;
export const BLINDING_RAY = SNOWSTORM + 1;

export const ART_NONARTIFACT = 0;
export const ART_EXCALIBUR = 1;
export const ART_STORMBRINGER = 2;
export const ART_MJOLLNIR = 3;
export const ART_CLEAVER = 4;
export const ART_GRIMTOOTH = 5;
export const ART_ORCRIST = 6;
export const ART_STING = 7;
export const ART_MAGICBANE = 8;
export const ART_FROST_BRAND = 9;
export const ART_FIRE_BRAND = 10;
export const ART_DRAGONBANE = 11;
export const ART_DEMONBANE = 12;
export const ART_WEREBANE = 13;
export const ART_GRAYSWANDIR = 14;
export const ART_GIANTSLAYER = 15;
export const ART_OGRESMASHER = 16;
export const ART_TROLLSBANE = 17;
export const ART_VORPAL_BLADE = 18;
export const ART_SNICKERSNEE = 19;
export const ART_SUNSWORD = 20;
export const ART_ORB_OF_DETECTION = 21;
export const ART_HEART_OF_AHRIMAN = 22;
export const ART_SCEPTRE_OF_MIGHT = 23;
export const ART_STAFF_OF_AESCULAPIUS = 24;
export const ART_MAGIC_MIRROR_OF_MERLIN = 25;
export const ART_EYES_OF_THE_OVERWORLD = 26;
export const ART_MITRE_OF_HOLINESS = 27;
export const ART_LONGBOW_OF_DIANA = 28;
export const ART_MASTER_KEY_OF_THIEVERY = 29;
export const ART_TSURUGI_OF_MURAMASA = 30;
export const ART_YENDORIAN_EXPRESS_CARD = 31;
export const ART_ORB_OF_FATE = 32;
export const ART_EYE_OF_THE_AETHIOPICA = 33;
export const AFTER_LAST_ARTIFACT = 34;
export const NROFARTIFACTS = AFTER_LAST_ARTIFACT - 1;

const AD_PHYS = 0;
const AD_MAGM = 1;
const AD_FIRE = 2;
const AD_COLD = 3;
const AD_SLEE = 4;
const AD_DISN = 5;
const AD_ELEC = 6;
const AD_DRST = 7;
const AD_ACID = 8;
const AD_BLND = 11;
const AD_STUN = 12;
const AD_SLOW = 13;
const AD_PLYS = 14;
const AD_DRLI = 15;
const AD_STON = 18;
const AD_WERE = 29;
const AD_DISE = 33;
const AD_HALU = 36;

const NO_ATTK = Object.freeze({ aatyp: 0, adtyp: 0, damn: 0, damd: 0 });

function attack(adtyp, damn, damd) {
    return { aatyp: 0, adtyp, damn, damd };
}

function artifact(
    name, otyp, spfx, cspfx, mtype, attk, defn, cary, invProp,
    alignment, role, race, genSpe, giftValue, cost, acolor,
) {
    return {
        otyp,
        name,
        spfx,
        cspfx,
        mtype,
        attk,
        defn,
        cary,
        inv_prop: invProp,
        alignment,
        role,
        race,
        gen_spe: genSpe,
        gift_value: giftValue,
        cost,
        acolor,
    };
}

function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
}

// The dummy entry at 0 and otyp-zero terminator match artilist[] exactly.
// ARTILIST_TEMPLATE is immutable; init_artifacts() clones it for each game.
export const ARTILIST_TEMPLATE = deepFreeze([
    artifact('', STRANGE_OBJECT, 0, 0, 0, NO_ATTK, NO_ATTK, NO_ATTK, 0,
        A_NONE, NON_PM, NON_PM, 0, 0, 0, NO_COLOR),
    artifact('Excalibur', LONG_SWORD,
        SPFX_NOGEN | SPFX_RESTR | SPFX_SEEK | SPFX_DEFN | SPFX_INTEL
            | SPFX_SEARCH,
        0, 0, attack(AD_PHYS, 5, 10), attack(AD_DRLI, 0, 0), NO_ATTK, 0,
        A_LAWFUL, PM_KNIGHT, NON_PM, 0, 10, 4000, NO_COLOR),
    artifact('Stormbringer', RUNESWORD,
        SPFX_RESTR | SPFX_ATTK | SPFX_DEFN | SPFX_INTEL | SPFX_DRLI,
        0, 0, attack(AD_DRLI, 5, 2), attack(AD_DRLI, 0, 0), NO_ATTK, 0,
        A_CHAOTIC, NON_PM, NON_PM, 0, 9, 8000, NO_COLOR),
    artifact('Mjollnir', WAR_HAMMER, SPFX_RESTR | SPFX_ATTK,
        0, 0, attack(AD_ELEC, 5, 24), NO_ATTK, NO_ATTK, 0,
        A_NEUTRAL, PM_VALKYRIE, NON_PM, 0, 8, 4000, NO_COLOR),
    artifact('Cleaver', BATTLE_AXE, SPFX_RESTR,
        0, 0, attack(AD_PHYS, 3, 6), NO_ATTK, NO_ATTK, 0,
        A_NEUTRAL, PM_BARBARIAN, NON_PM, 0, 8, 1500, NO_COLOR),
    artifact('Grimtooth', ORCISH_DAGGER,
        SPFX_RESTR | SPFX_WARN | SPFX_DFLAG2,
        0, M2_ELF, attack(AD_PHYS, 2, 6), attack(AD_DRST, 0, 0), NO_ATTK,
        FLING_POISON, A_CHAOTIC, NON_PM, PM_ORC, 0, 5, 1200, CLR_RED),
    artifact('Orcrist', ELVEN_BROADSWORD, SPFX_WARN | SPFX_DFLAG2,
        0, M2_ORC, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_CHAOTIC, NON_PM, PM_ELF, 3, 4, 2000, CLR_BRIGHT_BLUE),
    artifact('Sting', ELVEN_DAGGER, SPFX_WARN | SPFX_DFLAG2,
        0, M2_ORC, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_CHAOTIC, NON_PM, PM_ELF, 3, 1, 800, CLR_BRIGHT_BLUE),
    artifact('Magicbane', ATHAME, SPFX_RESTR | SPFX_ATTK | SPFX_DEFN,
        0, 0, attack(AD_STUN, 3, 4), attack(AD_MAGM, 0, 0), NO_ATTK, 0,
        A_NEUTRAL, PM_WIZARD, NON_PM, 0, 7, 3500, NO_COLOR),
    artifact('Frost Brand', LONG_SWORD, SPFX_RESTR | SPFX_ATTK | SPFX_DEFN,
        0, 0, attack(AD_COLD, 5, 0), attack(AD_COLD, 0, 0), NO_ATTK,
        SNOWSTORM, A_NONE, NON_PM, NON_PM, 0, 9, 3000, NO_COLOR),
    artifact('Fire Brand', LONG_SWORD, SPFX_RESTR | SPFX_ATTK | SPFX_DEFN,
        0, 0, attack(AD_FIRE, 5, 0), attack(AD_FIRE, 0, 0), NO_ATTK,
        FIRESTORM, A_NONE, NON_PM, NON_PM, 0, 5, 3000, NO_COLOR),
    artifact('Dragonbane', BROADSWORD,
        SPFX_RESTR | SPFX_DCLAS | SPFX_REFLECT,
        0, S_DRAGON, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_NONE, NON_PM, NON_PM, 2, 5, 500, NO_COLOR),
    artifact('Demonbane', SILVER_MACE, SPFX_RESTR | SPFX_DFLAG2,
        0, M2_DEMON, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, BANISH,
        A_LAWFUL, PM_CLERIC, NON_PM, 1, 3, 2500, NO_COLOR),
    artifact('Werebane', SILVER_SABER, SPFX_RESTR | SPFX_DFLAG2,
        0, M2_WERE, attack(AD_PHYS, 5, 0), attack(AD_WERE, 0, 0), NO_ATTK, 0,
        A_NONE, NON_PM, NON_PM, 1, 4, 1500, NO_COLOR),
    artifact('Grayswandir', SILVER_SABER, SPFX_RESTR | SPFX_HALRES,
        0, 0, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_LAWFUL, NON_PM, NON_PM, 0, 10, 8000, NO_COLOR),
    artifact('Giantslayer', LONG_SWORD, SPFX_RESTR | SPFX_DFLAG2,
        0, M2_GIANT, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_NEUTRAL, NON_PM, NON_PM, 2, 4, 200, NO_COLOR),
    artifact('Ogresmasher', WAR_HAMMER, SPFX_RESTR | SPFX_DCLAS,
        0, S_OGRE, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_NONE, NON_PM, NON_PM, 2, 1, 200, NO_COLOR),
    artifact('Trollsbane', MORNING_STAR,
        SPFX_RESTR | SPFX_DCLAS | SPFX_REGEN,
        0, S_TROLL, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, 0,
        A_NONE, NON_PM, NON_PM, 2, 1, 200, NO_COLOR),
    artifact('Vorpal Blade', LONG_SWORD, SPFX_RESTR | SPFX_BEHEAD,
        0, 0, attack(AD_PHYS, 5, 1), NO_ATTK, NO_ATTK, 0,
        A_NEUTRAL, NON_PM, NON_PM, 1, 5, 4000, NO_COLOR),
    artifact('Snickersnee', KATANA, SPFX_RESTR,
        0, 0, attack(AD_PHYS, 0, 8), NO_ATTK, NO_ATTK, 0,
        A_LAWFUL, PM_SAMURAI, NON_PM, 0, 8, 1200, NO_COLOR),
    artifact('Sunsword', LONG_SWORD, SPFX_RESTR | SPFX_DFLAG2,
        0, M2_UNDEAD, attack(AD_PHYS, 5, 0), attack(AD_BLND, 0, 0), NO_ATTK,
        BLINDING_RAY, A_LAWFUL, NON_PM, NON_PM, 0, 6, 1500, NO_COLOR),
    artifact('The Orb of Detection', CRYSTAL_BALL,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL, SPFX_ESP | SPFX_HSPDAM,
        0, NO_ATTK, NO_ATTK, attack(AD_MAGM, 0, 0), INVIS,
        A_LAWFUL, PM_ARCHEOLOGIST, NON_PM, 0, 12, 2500, NO_COLOR),
    artifact('The Heart of Ahriman', LUCKSTONE,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL, SPFX_STLTH,
        0, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, LEVITATION,
        A_NEUTRAL, PM_BARBARIAN, NON_PM, 0, 12, 2500, NO_COLOR),
    artifact('The Sceptre of Might', MACE,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_DALIGN,
        0, 0, attack(AD_PHYS, 5, 0), attack(AD_MAGM, 0, 0), NO_ATTK,
        CONFLICT, A_LAWFUL, PM_CAVE_DWELLER, NON_PM,
        0, 12, 2500, NO_COLOR),
    artifact('The Staff of Aesculapius', QUARTERSTAFF,
        SPFX_NOGEN | SPFX_RESTR | SPFX_ATTK | SPFX_INTEL | SPFX_DRLI
            | SPFX_REGEN,
        0, 0, attack(AD_DRLI, 0, 0), attack(AD_DRLI, 0, 0), NO_ATTK,
        HEALING, A_NEUTRAL, PM_HEALER, NON_PM, 0, 12, 5000, NO_COLOR),
    artifact('The Magic Mirror of Merlin', MIRROR,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_SPEAK, SPFX_ESP,
        0, NO_ATTK, NO_ATTK, attack(AD_MAGM, 0, 0), 0,
        A_LAWFUL, PM_KNIGHT, NON_PM, 0, 12, 1500, NO_COLOR),
    artifact('The Eyes of the Overworld', LENSES,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_XRAY,
        0, 0, NO_ATTK, attack(AD_MAGM, 0, 0), NO_ATTK, ENLIGHTENING,
        A_NEUTRAL, PM_MONK, NON_PM, 0, 12, 2500, NO_COLOR),
    artifact('The Mitre of Holiness', HELM_OF_BRILLIANCE,
        SPFX_NOGEN | SPFX_RESTR | SPFX_DFLAG2 | SPFX_INTEL | SPFX_PROTECT,
        0, M2_UNDEAD, NO_ATTK, NO_ATTK, attack(AD_FIRE, 0, 0), ENERGY_BOOST,
        A_LAWFUL, PM_CLERIC, NON_PM, 0, 12, 2000, NO_COLOR),
    artifact('The Longbow of Diana', BOW,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_REFLECT, SPFX_ESP,
        0, attack(AD_PHYS, 5, 0), NO_ATTK, NO_ATTK, CREATE_AMMO,
        A_CHAOTIC, PM_RANGER, NON_PM, 0, 12, 4000, NO_COLOR),
    artifact('The Master Key of Thievery', SKELETON_KEY,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_SPEAK,
        SPFX_WARN | SPFX_TCTRL | SPFX_HPHDAM,
        0, NO_ATTK, NO_ATTK, NO_ATTK, UNTRAP,
        A_CHAOTIC, PM_ROGUE, NON_PM, 0, 12, 3500, NO_COLOR),
    artifact('The Tsurugi of Muramasa', TSURUGI,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_BEHEAD | SPFX_LUCK
            | SPFX_PROTECT,
        0, 0, attack(AD_PHYS, 0, 8), NO_ATTK, NO_ATTK, 0,
        A_LAWFUL, PM_SAMURAI, NON_PM, 0, 12, 4500, NO_COLOR),
    artifact('The Platinum Yendorian Express Card', CREDIT_CARD,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_DEFN,
        SPFX_ESP | SPFX_HSPDAM,
        0, NO_ATTK, NO_ATTK, attack(AD_MAGM, 0, 0), CHARGE_OBJ,
        A_NEUTRAL, PM_TOURIST, NON_PM, 0, 12, 7000, NO_COLOR),
    artifact('The Orb of Fate', CRYSTAL_BALL,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL | SPFX_LUCK,
        SPFX_WARN | SPFX_HSPDAM | SPFX_HPHDAM,
        0, NO_ATTK, NO_ATTK, NO_ATTK, LEV_TELE,
        A_NEUTRAL, PM_VALKYRIE, NON_PM, 0, 12, 3500, NO_COLOR),
    artifact('The Eye of the Aethiopica', AMULET_OF_ESP,
        SPFX_NOGEN | SPFX_RESTR | SPFX_INTEL, SPFX_EREGEN | SPFX_HSPDAM,
        0, NO_ATTK, attack(AD_MAGM, 0, 0), NO_ATTK, CREATE_PORTAL,
        A_NEUTRAL, PM_WIZARD, NON_PM, 0, 12, 4000, NO_COLOR),
    artifact(null, 0, 0, 0, 0, NO_ATTK, NO_ATTK, NO_ATTK, 0,
        A_NONE, NON_PM, NON_PM, 0, 0, 0, NO_COLOR),
]);

export function createArtifactTable() {
    return ARTILIST_TEMPLATE.map((entry) => ({
        ...entry,
        attk: { ...entry.attk },
        defn: { ...entry.defn },
        cary: { ...entry.cary },
    }));
}

function zeroArtiInfo() {
    return {
        exists: 0,
        found: 0,
        gift: 0,
        wish: 0,
        named: 0,
        viadip: 0,
        lvldef: 0,
        bones: 0,
        rndm: 0,
    };
}

function initialAlignment(state) {
    const index = state.flags?.initalign;
    const alignment = aligns[index];
    if (!alignment) {
        throw new Error('init_artifacts requires role_init alignment state');
    }
    return alignment.value;
}

/** Apply artifact.c:hack_artifacts() to an initialized per-game table. */
export function hack_artifacts(state = game) {
    const artilist = state.artilist;
    const roleSwitch = state.urole?.mnum;
    if (!Array.isArray(artilist) || artilist.length <= NROFARTIFACTS) {
        throw new Error('hack_artifacts requires an initialized artilist');
    }
    if (!Number.isInteger(roleSwitch)) {
        throw new Error('hack_artifacts requires state.urole from role_init');
    }
    const alignmnt = initialAlignment(state);

    for (let index = 1; artilist[index].otyp; ++index) {
        const art = artilist[index];
        if (art.role === roleSwitch && art.alignment !== A_NONE)
            art.alignment = alignmnt;
    }

    if (roleSwitch !== PM_KNIGHT)
        artilist[ART_EXCALIBUR].role = NON_PM;

    const questArtifact = state.urole.questarti;
    if (questArtifact) {
        if (!Number.isInteger(questArtifact)
            || questArtifact <= ART_NONARTIFACT
            || questArtifact > NROFARTIFACTS) {
            throw new RangeError(`invalid quest artifact ${questArtifact}`);
        }
        artilist[questArtifact].alignment = alignmnt;
        artilist[questArtifact].role = roleSwitch;
    }

    return artilist;
}

/** Port of artifact.c:init_artifacts(); it intentionally makes no RNG calls. */
export function init_artifacts(state = game) {
    state.artiexist = Array.from(
        { length: NROFARTIFACTS + 1 },
        zeroArtiInfo,
    );
    state.artidisco = Array(NROFARTIFACTS).fill(0);
    state.artilist = createArtifactTable();
    hack_artifacts(state);
    return state.artilist;
}

// C ref: artifact.c save_artifacts() (119-130). In C, this writes artiexist
// and artidisco to the binary save file via Sfo macros. In JS, the save system
// serializes state.artiexist and state.artidisco as JSON (see save.js), so
// this function participates in the save protocol without binary I/O.
export function save_artifacts(state = game) {
    return {
        artiexist: state.artiexist,
        artidisco: state.artidisco,
    };
}

// C ref: artifact.c restore_artifacts() (133-148). In C, this reads artiexist
// and artidisco from the save file and then calls hack_artifacts() to redo
// non-saved special cases. In JS, restore.js assigns the arrays from the
// snapshot; this function applies the post-restore fixup.
export function restore_artifacts(snapshot, state = game) {
    if (snapshot.artiexist) state.artiexist = snapshot.artiexist;
    if (snapshot.artidisco) state.artidisco = snapshot.artidisco;
    hack_artifacts(state);
}

// C ref: artifact.c found_artifact() (409-421). Marks an existing artifact
// as found by the hero. C's impossible() calls catch index errors; JS throws
// instead.
export function found_artifact(a, state = game) {
    artifactTables(state);
    if (a < 1 || a > NROFARTIFACTS) {
        throw new RangeError(
            `found_artifact: invalid artifact index! (${a})`,
        );
    } else if (!state.artiexist[a].exists) {
        throw new Error(
            `found_artifact: artifact doesn't exist yet? (${a})`,
        );
    } else {
        state.artiexist[a].found = 1;
    }
}

// C refs: artifact.c find_artifact() (422-459). Calls found_artifact() and
// generates a livelog event. The browser port has no livelog sink; the
// persisted artiexist[].found bit is the gameplay state consumed by later
// naming and disclosure.
export function find_artifact(obj, state = game) {
    const index = Math.trunc(obj?.oartifact ?? ART_NONARTIFACT);
    if (index === ART_NONARTIFACT) return false;
    artifactTables(state);
    if (index < 1 || index > NROFARTIFACTS || !state.artilist[index]?.otyp)
        throw new RangeError(`invalid artifact index ${index}`);
    if (!state.artiexist[index].exists)
        throw new Error(`artifact ${index} does not exist`);
    if (state.artiexist[index].found) return false;
    state.artiexist[index].found = 1;
    return true;
}

// Thrown where artifact.c reaches a display branch this port has not ported.
export class UnsupportedArtifactDisplayError extends Error {
    constructor(branch) {
        super(`artifact display requires ${branch}`);
        this.name = 'UnsupportedArtifactDisplayError';
        this.branch = branch;
    }
}

// C ref: artifact.c disp_artifact_discoveries() (1146-1174). Returns how many
// artifacts the hero has discovered, writing one line for each into the text
// window dodiscovered() supplies. C passes a `winid tmpwin` and calls
// `putstr(tmpwin, ...)`; the JS caller provides a local putstr function.
// The optional `putstr` parameter writes each discovered artifact line.
export function disp_artifact_discoveries(state = game, putstr = null) {
    let cnt = 0;
    for (let i = 0; i < NROFARTIFACTS; i++) {
        if (state.artidisco[i] === 0)
            break;
        const m = state.artidisco[i];
        if (putstr) {
            const name = artiname(m, state);
            const art = state.artilist[m];
            const alignStr = align_str(art.alignment);
            const typeName = simple_typename(art.otyp, state);
            if (cnt === 0) putstr(true, 'Artifacts');
            putstr(false, `  ${name} (${alignStr} ${typeName})`);
        }
        ++cnt;
    }
    return cnt;
}

function monsterAlignment(monster) {
    const raw = monster.ispriest
        ? monster.mextra?.epri?.shralign
        : monster.isminion
            ? monster.mextra?.emin?.min_align
            : monster.data?.maligntyp;
    if (raw === A_NONE) return A_NONE;
    return Math.sign(raw ?? 0);
}

function isMonsterPlayer(monster) {
    const pmidx = monster.data?.pmidx ?? monster.mnum;
    return pmidx >= PM_ARCHEOLOGIST && pmidx <= PM_WIZARD;
}

// Compatibility wrapper: delegates to the C-named bane_applies(). The
// old callers (touch_artifact, retouch_object) pass the artifact record
// directly; bane_applies() accepts the same shape.
function artifactBaneApplies(artifact, monster, yours, state) {
    return bane_applies(artifact, monster, state);
}

// C ref: artifact.c touch_artifact() (908-976). C's `touch_blasted` is a
// file-scope static set here and read by retouch_object() to decide whether
// to inflict its own additional damage.
let touch_blasted = false;

// C ref: youprop.h:57. Antimagic is the intrinsic or the extrinsic.
function Antimagic(state) {
    const p = state.u?.uprops?.[ANTIMAGIC];
    return Boolean(p?.intrinsic || p?.extrinsic);
}

// C ref: youprop.h:341. Half_physical_damage.
function Maybe_Half_Phys(dmg, state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return (halved?.intrinsic || halved?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: youprop.h:401. Hate_silver: lycanthrope or silver-hating species.
function Hate_silver(state) {
    return (state.u.ulycn >= LOW_PM)
        || hates_silver(state.youmonst?.data);
}

// C ref: youprop.h:240. Levitation property (intrinsic or extrinsic, not
// blocked).
function Levitation(state) {
    const value = state.u?.uprops?.[LEVITATION];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}

export async function touch_artifact(obj, monster, env = game) {
    const index = Math.trunc(obj?.oartifact ?? ART_NONARTIFACT);
    touch_blasted = false;
    if (index === ART_NONARTIFACT) return true;
    const state = artifactTables(env);
    if (index < 1 || index > NROFARTIFACTS
        || !state.artilist[index].otyp) {
        throw new RangeError(`invalid artifact index ${index}`);
    }

    const artifact = state.artilist[index];
    const yours = monster === state.youmonst;
    /* all quest artifacts are self-willed; if this ever changes, `badclass'
       will have to be extended to explicitly include quest artifacts */
    const selfWilled = Boolean(artifact.spfx & SPFX_INTEL);
    let badclass = false;
    let badalign = false;
    if (yours) {
        badclass = selfWilled
            && ((artifact.role !== NON_PM
                 && state.urole.mnum !== artifact.role)
                || (artifact.race !== NON_PM
                    && state.urace.mnum !== artifact.race));
        badalign = Boolean(artifact.spfx & SPFX_RESTR)
            && artifact.alignment !== A_NONE
            && (artifact.alignment !== state.u.ualign.type
                || state.u.ualign.record < 0);
    } else if (!(Boolean((monster.data?.mflags3 ?? 0) & M3_COVETOUS)
                 || isMonsterPlayer(monster))) {
        badclass = selfWilled
            && artifact.role !== NON_PM
            && index !== ART_EXCALIBUR;
        badalign = Boolean(artifact.spfx & SPFX_RESTR)
            && artifact.alignment !== A_NONE
            && artifact.alignment !== monsterAlignment(monster);
    }
    /* an M3_WANTSxxx monster or a fake player leaves both false */
    /* weapons which attack specific categories of monsters are
       bad for them even if their alignments happen to match */
    if (!badalign)
        badalign = artifactBaneApplies(artifact, monster, yours, state);

    if (((badclass || badalign) && selfWilled)
        || (badalign && (!yours || !randomFromEnv(env)(4)))) {
        if (!yours) return false;
        // C ref: artifact.c:951-959. Blast the hero.
        await ttyPline(
            `You are blasted by ${s_suffix(the(xnameFresh(obj, state), state))} power!`,
            state);
        touch_blasted = true;
        let dmg = d(Antimagic(state) ? 2 : 4, selfWilled ? 10 : 4);
        /* add half (maybe quarter) of the usual silver damage bonus */
        if (state.objects[obj.otyp].oc_material === SILVER
            && Hate_silver(state)) {
            const tmp = rnd(10);
            dmg += Maybe_Half_Phys(tmp, state);
        }
        const buf = `touching ${artifact.name}`;
        await losehp(dmg, buf, KILLED_BY, state);
        await exercise(A_WIS, false, state);
    }

    /* can pick it up unless you're totally non-synch'd with the artifact */
    if (badclass && badalign && selfWilled) {
        if (yours) {
            // C ref: artifact.c:965-968. Evade message.
            if (!carried(obj))
                await ttyPline(
                    `${Tobjnam(obj, 'evade', state)} your grasp!`, state);
            else
                await ttyPline(
                    `${Tobjnam(obj, 'are', state)} beyond your control!`,
                    state);
        }
        return false;
    }

    return true;
}

// The seam every monster-side C caller of touch_artifact() reaches instead of
// touch_artifact() itself: mon.c can_touch_safely() in js/weapon.js, and mon.c
// meatmetal() through js/monmove.js select_postmove_object_action(). Both call
// touch_artifact() directly in C, so they share this one wrapper.
//
// The ART_NONARTIFACT return above is repeated here because it is the half
// that is settled: an ordinary object is touchable, and asking costs no draw,
// no message, and no state. For an artifact the wrapper asks the caller
// instead of the port above. Answering from the port would let a monster
// carry, wield or eat an artifact, and nothing downstream of that decision has
// ever run against a C recording. QUALITY.json holds the wiring as
// touch-artifact-ported-but-unwired; until it lands, every caller injects a
// refusal, and the segment stops on its last matching screen.
export function artifactTouchable(obj, monster, env) {
    if (!obj.oartifact) return true;
    if (typeof env.touchArtifact !== 'function') {
        throw new TypeError(
            'artifact touch requires a touchArtifact operation',
        );
    }
    return Boolean(env.touchArtifact(obj, monster, env));
}

const ORIGIN_FLAGS = Object.freeze([
    [ONAME_WISH, 'wish'],
    [ONAME_GIFT, 'gift'],
    [ONAME_VIA_DIP, 'viadip'],
    [ONAME_VIA_NAMING, 'named'],
    [ONAME_LEVEL_DEF, 'lvldef'],
    [ONAME_BONES, 'bones'],
    [ONAME_RANDOM, 'rndm'],
]);

const ORIGIN_MASK = ORIGIN_FLAGS.reduce(
    (mask, [flag]) => mask | flag,
    0,
);

function stateFromEnv(value) {
    if (value == null) return game;
    return value.state ?? value;
}

function artifactTables(value) {
    const state = stateFromEnv(value);
    if (!Array.isArray(state.artilist)
        || state.artilist.length <= NROFARTIFACTS
        || !Array.isArray(state.artiexist)
        || state.artiexist.length <= NROFARTIFACTS) {
        throw new Error('artifact operation requires init_artifacts()');
    }
    return state;
}

/** Port of artifact.c:artiname(). */
export function artiname(artinum, state = game) {
    const normalized = artifactTables(state);
    if (artinum <= ART_NONARTIFACT || artinum > NROFARTIFACTS)
        return '';
    return normalized.artilist[artinum].name;
}

// C ref: artifact.c get_artifact(). C answers a pointer into artilist[] and
// uses the dummy row at ART_NONARTIFACT for "no artifact"; this answers that
// same row, so `=== artilist[ART_NONARTIFACT]` reads the way C's test does.
export function get_artifact(obj, state = game) {
    const normalized = artifactTables(state);
    const index = Math.trunc(obj?.oartifact ?? ART_NONARTIFACT);
    if (index > ART_NONARTIFACT && index <= NROFARTIFACTS)
        return normalized.artilist[index];
    return normalized.artilist[ART_NONARTIFACT];
}

/** Port of artifact.c:spec_ability(). */
export function spec_ability(otmp, abil, state = game) {
    const normalized = artifactTables(state);
    const artifact = get_artifact(otmp, normalized);
    return artifact !== normalized.artilist[ART_NONARTIFACT]
        && (artifact.spfx & abil) !== 0;
}

/** Port of artifact.c:confers_luck(). */
export function confers_luck(obj, state = game) {
    /* might as well check for this too */
    if (obj.otyp === LUCKSTONE) return true;

    return Boolean(obj.oartifact) && spec_ability(obj, SPFX_LUCK, state);
}

// C ref: artifact.c arti_reflects() (537-553). Returns true when an artifact
// grants reflection, either by being worn (SPFX_REFLECT in spfx) or by just
// being carried (SPFX_REFLECT in cspfx).
export function arti_reflects(obj, state = game) {
    const arti = get_artifact(obj, state);
    if (arti !== state.artilist[ART_NONARTIFACT]) {
        /* while being worn */
        if ((obj.owornmask & ~W_ART) && (arti.spfx & SPFX_REFLECT))
            return true;
        /* just being carried */
        if (arti.cspfx & SPFX_REFLECT)
            return true;
    }
    return false;
}

// The extrinsic each artifact damage type grants, as the seven-way chain at
// artifact.c:733-746 assigns it. A type absent from this map leaves C's `mask`
// null and writes nothing, which is what an artifact with no carry effect
// (cary.adtyp AD_PHYS) does.
const ARTIFACT_RESISTANCE_PROPERTY = new Map([
    [AD_FIRE, FIRE_RES],
    [AD_COLD, COLD_RES],
    [AD_ELEC, SHOCK_RES],
    [AD_MAGM, ANTIMAGIC],
    [AD_DISN, DISINT_RES],
    [AD_DRST, POISON_RES],
    [AD_DRLI, DRAIN_RES],
]);

// The spfx bits that are nothing but an extrinsic mask write, in the order
// artifact.c:781-880 tests them. The bits left out each drive display or
// vision work as well, and set_artifact_intrinsic() refuses those below.
const ARTIFACT_SPFX_PROPERTY = [
    [SPFX_SEARCH, SEARCHING],
    [SPFX_STLTH, STEALTH],
    [SPFX_REGEN, REGENERATION],
    [SPFX_TCTRL, TELEPORT_CONTROL],
    [SPFX_EREGEN, ENERGY_REGENERATION],
    [SPFX_HSPDAM, HALF_SPDAM],
    [SPFX_HPHDAM, HALF_PHDAM],
    [SPFX_PROTECT, PROTECTION],
];

// C ref: artifact.c set_artifact_intrinsic() (715-892). Toggles the extrinsic
// properties an artifact confers when worn or carried.
//
// Paths:
// - W_ART (carried): reads cary and cspfx; the "off" survey loops are not yet
//   ported, so only the "on" half is handled.
// - W_WEP and other worn masks: reads defn and spfx; handles both on and off.
//   The "off" survey loops at 748-761 and 771-779 only fire for W_ART, so they
//   do not apply here.
//
// Display-affecting spfx bits (ESP, WARN, XRAY) stop this port: they call
// see_monsters() or set vision_full_recalc, neither of which is ported.
// SPFX_HALRES is handled directly: the mask write that make_hallucinated()
// performs is inlined, and the state-transition branch (hero is currently
// hallucinating when the mask changes) is refused.
export function set_artifact_intrinsic(otmp, on, wp_mask, state = game) {
    const normalized = artifactTables(state);
    const oart = get_artifact(otmp, normalized);

    if (oart === normalized.artilist[ART_NONARTIFACT]) return;

    if (wp_mask === W_ART && !on) {
        // The "off" path for carried artifacts surveys inventory to avoid
        // clearing a property another carried artifact also grants, and may
        // shut down an invoked power. Neither is ported.
        throw new UnsupportedArtifactDisplayError(
            'set_artifact_intrinsic() removing a carried artifact',
        );
    }

    // Select fields: carried reads cary/cspfx, worn reads defn/spfx.
    const dtyp = (wp_mask !== W_ART) ? oart.defn.adtyp : oart.cary.adtyp;
    const spfx = (wp_mask !== W_ART) ? oart.spfx : oart.cspfx;

    // ---- Display-affecting spfx: refuse before writing any mask ----
    // Read these first so a refusal does not leave extrinsics half-changed.
    // artifact.c:798-805 (SPFX_ESP) calls recalc_telepat_range + see_monsters.
    // artifact.c:824-840 (SPFX_WARN) calls see_monsters and sets warntype.
    // artifact.c:859-866 (SPFX_XRAY) sets xray_range and vision_full_recalc.
    if (spfx & (SPFX_ESP | SPFX_WARN | SPFX_XRAY)) {
        throw new UnsupportedArtifactDisplayError(
            'an artifact that changes what the hero sees (ESP/WARN/XRAY)',
        );
    }

    // artifact.c:787-797 (SPFX_HALRES): make_hallucinated((long) !on, ...,
    // wp_mask). When mask != 0, make_hallucinated only toggles
    // EHalluc_resistance, then checks HHallucination to decide whether the
    // display changed. If the hero is currently hallucinating, the function
    // would call see_monsters(), see_objects(), see_traps(), update_inventory(),
    // and print a message, none of which is ported. When the hero is not
    // hallucinating, make_hallucinated is just the mask write.
    if (spfx & SPFX_HALRES) {
        if (normalized.u.uprops[HALLUC].intrinsic) {
            throw new UnsupportedArtifactDisplayError(
                'toggling hallucination resistance while hallucinating',
            );
        }
        // Inline make_hallucinated's mask-only path: when !xtime (on=true),
        // set the resistance; when xtime (on=false), clear it.
        if (on)
            normalized.u.uprops[HALLUC_RES].extrinsic |= wp_mask;
        else
            normalized.u.uprops[HALLUC_RES].extrinsic &= ~wp_mask;
    }

    /* effects from the defn field */
    const property = ARTIFACT_RESISTANCE_PROPERTY.get(dtyp);
    if (property !== undefined)
        extrinsicMaskToggle(normalized, property, wp_mask, on);

    for (const [bit, prop] of ARTIFACT_SPFX_PROPERTY) {
        if (spfx & bit) extrinsicMaskToggle(normalized, prop, wp_mask, on);
    }

    // artifact.c:867-872: SPFX_REFLECT is guarded on `wp_mask & W_WEP`.
    if ((spfx & SPFX_REFLECT) && (wp_mask & W_WEP)) {
        extrinsicMaskToggle(normalized, REFLECTING, wp_mask, on);
    }

    // artifact.c:880-885: invoked-power shutdown. Only for W_ART and !on,
    // which is already refused above.

    // artifact.c:887-892: Sunsword blindness resistance, guarded on W_WEP.
    if (wp_mask === W_WEP && otmp.oartifact === ART_SUNSWORD) {
        extrinsicMaskToggle(normalized, BLND_RES, wp_mask, on);
    }
}

function extrinsicMaskToggle(state, property, wp_mask, on) {
    const prop = state.u.uprops[property];
    if (on)
        prop.extrinsic |= wp_mask;
    else
        prop.extrinsic &= ~wp_mask;
}

// C ref: artifact.c dispose_of_orig_obj() (312-320). Frees the original
// pre-replacement object when mk_artifact() creates a new one.
export function dispose_of_orig_obj(obj) {
    if (!obj) return;
    obj_extract_self(obj);
    obfree(obj, null);
}

// C ref: artifact.c artifact_name(). Answers the artifact whose name the
// player's text spells, or null. C reports the object type through a `short *`
// out-parameter; this writes it into `otyp_p.otyp` instead, so a caller that
// wants only the name passes null the way C passes `(short *) 0`.
//
// The returned string is the artilist[] entry's own name, not the caller's
// text, so the answer carries the canonical capitalization even when the
// player typed none. objnam.c relies on that: readobjnam()'s typfnd: tail
// compares the two pointers to tell a wish that named an artifact from a wish
// that merely asked for a label.
export function artifact_name(name, otyp_p, fuzzy, state = game) {
    // C reads artilist[] and nothing else here, so this checks only that
    // table; artifactTables() would also demand the artiexist[] record that
    // tracks which artifacts have been made, which this answer does not read.
    const artilist = stateFromEnv(state).artilist;
    if (!Array.isArray(artilist))
        throw new Error('artifact_name requires an initialized artilist');
    let sought = String(name);

    if (lcase(sought.slice(0, 4)) === 'the ')
        sought = sought.slice(4);

    for (let index = 1; artilist[index].otyp; ++index) {
        const art = artilist[index];
        let aname = art.name;
        if (lcase(aname.slice(0, 4)) === 'the ')
            aname = aname.slice(4);
        // C's " -" ignore set drops both spaces and dashes, so "grand master"
        // and "grandmaster" reach the same entry.
        if (!fuzzy
            ? lcase(sought) === lcase(aname)
            : fuzzymatch(sought, aname, ' -', true)) {
            if (otyp_p) otyp_p.otyp = art.otyp;
            return art.name;
        }
    }

    return null;
}

/** Port of artifact.c:exist_artifact(). Artifact names compare exactly. */
export function exist_artifact(otyp, name, state = game) {
    const normalized = artifactTables(state);
    if (!otyp || !name) return false;
    for (let index = 1; normalized.artilist[index].otyp; ++index) {
        const art = normalized.artilist[index];
        if (art.otyp === otyp && art.name === name)
            return Boolean(normalized.artiexist[index].exists);
    }
    return false;
}

/** Port of artifact.c:artifact_origin(). */
export function artifact_origin(obj, flags, state = game) {
    const normalized = artifactTables(state);
    const index = Math.trunc(obj?.oartifact ?? 0);
    if (!index) return;
    if (index < 1 || index > NROFARTIFACTS
        || !normalized.artilist[index].otyp) {
        throw new RangeError(`invalid artifact index ${index}`);
    }

    const info = normalized.artiexist[index] = zeroArtiInfo();
    info.exists = 1;
    if (flags & ONAME_KNOW_ARTI) info.found = 1;

    let origins = 0;
    for (const [flag, field] of ORIGIN_FLAGS) {
        if (flags & flag) {
            info[field] = 1;
            ++origins;
        }
    }
    // Other oname() control bits, such as ONAME_SKIP_INVUPD, do not describe
    // provenance and are ignored here by the source.
    if (origins !== 1) {
        throw new RangeError(`invalid artifact origin flags ${flags}`);
    }
}

/** Port of artifact.c:artifact_exists() for object-name ownership. */
export function artifact_exists(
    obj,
    name,
    exists,
    flags = ONAME_NO_FLAGS,
    state = game,
) {
    const normalized = artifactTables(state);
    if (!obj || !name) return obj;

    for (let index = 1; normalized.artilist[index].otyp; ++index) {
        const art = normalized.artilist[index];
        if (art.otyp !== obj.otyp || art.name !== name) continue;

        obj.oartifact = exists ? index : ART_NONARTIFACT;
        obj.age = 0;
        if (obj.otyp === RIN_INCREASE_DAMAGE) obj.spe = 0;
        if (exists) {
            let originFlags = flags;
            if (!(originFlags & ORIGIN_MASK)) originFlags |= ONAME_RANDOM;
            artifact_origin(obj, originFlags, normalized);
        } else {
            normalized.artiexist[index] = zeroArtiInfo();
        }
        break;
    }
    return obj;
}

/** Port of artifact.c:nartifact_exist(). */
export function nartifact_exist(state = game) {
    const normalized = artifactTables(state);
    let count = 0;
    for (let index = 1; index <= NROFARTIFACTS; ++index) {
        if (normalized.artiexist[index].exists) ++count;
    }
    return count;
}

function onameArtifact(obj, name, state) {
    // C oname() retains an existing artifact's name and rejects a duplicate.
    if (obj.oartifact || exist_artifact(obj.otyp, name, state)) return obj;
    obj.oextra ??= {};
    obj.oextra.oname = name;
    artifact_exists(obj, name, true, ONAME_NO_FLAGS, state);
    return obj;
}

function randomFromEnv(env) {
    const random = env?.random?.rn2 ?? rn2;
    if (typeof random !== 'function')
        throw new TypeError('artifact random injection requires rn2');
    return random;
}

/**
 * Port the existing-object/A_NONE branch of artifact.c:mk_artifact().
 *
 * This is the complete branch used by obj.js during random object creation.
 * Alignment-specific divine gifts create a new object and use role skills;
 * that distinct branch is outside the initial-level object path.
 */
export function mk_artifact(
    obj,
    alignment = A_NONE,
    maxGiftValue = 99,
    adjustSpe = false,
    env = null,
) {
    if (alignment !== A_NONE) {
        throw new RangeError(
            'aligned mk_artifact gifts are not implemented by the object hook',
        );
    }
    const state = artifactTables(env);
    if (!obj) return obj;
    const objectType = state.objects?.[obj.otyp];
    if (!objectType)
        throw new RangeError(`invalid artifact base object type ${obj.otyp}`);

    const unique = Boolean(objectType.oc_unique);
    const eligible = [];
    for (let index = 1; state.artilist[index].otyp; ++index) {
        const art = state.artilist[index];
        if (state.artiexist[index].exists) continue;
        if ((art.spfx & SPFX_NOGEN) || unique) continue;
        if (art.gift_value > maxGiftValue
            && art.role !== state.urole?.mnum) {
            continue;
        }
        // Role, race, alignment, SPFX_RESTR, and weapon skill only constrain
        // the source's by-alignment gift branch, not existing-object conversion.
        if (art.otyp === obj.otyp) eligible.push(index);
    }

    if (eligible.length) {
        const selected = eligible[randomFromEnv(env)(eligible.length)];
        if (!Number.isInteger(selected))
            throw new RangeError('artifact rn2 result was outside its bound');
        const art = state.artilist[selected];
        obj.oeroded = 0;
        obj.oeroded2 = 0;
        obj = onameArtifact(obj, art.name, state);
        // oname() normally set both fields already. The source deliberately
        // repeats them here so preserve that ownership boundary.
        obj.oartifact = selected;
        artifact_origin(obj, ONAME_RANDOM, state);
        if (adjustSpe) {
            const newSpe = Math.trunc(obj.spe) + art.gen_spe;
            if (newSpe >= -10 && newSpe < 10) obj.spe = newSpe;
        }
    }
    if (permapoisoned(obj)) obj.opoisoned = true;
    return obj;
}

/** Hook adapter for obj.js makeArtifact(). */
export function makeArtifact(obj, options = {}) {
    return mk_artifact(
        obj,
        options.alignment ?? A_NONE,
        options.maxGiftValue ?? 99,
        Boolean(options.adjustSpe),
        options.env ?? null,
    );
}

/** Hook adapter for obj.js artifactCount(). */
export function artifactCount(env = game) {
    return nartifact_exist(env);
}

// C ref: artifact.c shade_glare() (552-571). Whether an object can hurt a
// shade at all. weapon.c dmgval():306-307 and uhitm.c
// hmon_hitmon_weapon_ranged():892 are the readers; the comment above the C
// function records that the blessed-versus-undead bonus is deliberately not
// part of the answer.
//
// C reads the artifact through get_artifact(), which has no port; every caller
// here indexes state.artilist the way artifact_defends() above does. Index 0 is
// the ART_NONARTIFACT row, whose spfx is 0, so it fails the mask test that
// C's `arti != &artilist[ART_NONARTIFACT]` guards.
export function shade_glare(obj, state = game) {
    /* any silver object is effective */
    if (state.objects?.[obj.otyp]?.oc_material === SILVER) return true;
    /* non-silver artifacts with bonus against undead also are effective */
    const arti = state.artilist?.[obj.oartifact];
    if (obj.oartifact !== ART_NONARTIFACT && (arti?.spfx & SPFX_DFLAG2)
        && arti?.mtype === M2_UNDEAD)
        return true;
    /* [if there was anything with special bonus against noncorporeals,
       it would be effective too] */
    /* otherwise, harmless to shades */
    return false;
}

// C ref: artifact.c restrict_name() (575-624). Prevents the player from
// naming an object with the name of a restricted artifact whose type matches
// or could match (undiscovered items of the same shuffled-description pool).
export function restrict_name(otmp, name, state = game) {
    if (!name) return false;
    const objects = state.objects;
    const artilist = state.artilist;
    const otyp = otmp.otyp;
    const ocls = objects[otyp].oc_class;

    let sought = name;
    if (sought.length >= 4
        && sought.slice(0, 4).toLowerCase() === 'the ')
        sought = sought.slice(4);
    if (!sought) return false;

    /* decide what types of objects are the same as otyp;
       if it's been discovered, then only itself matches;
       otherwise, include all other undiscovered objects
       of the same class which have the same description
       or share the same pool of shuffled descriptions */
    const sametype = new Uint8Array(NUM_OBJECTS);
    sametype[otyp] = 1;
    if (!objects[otyp].oc_name_known) {
        const odesc = OBJ_DESCR(objects[otyp], state);
        if (odesc !== null) {
            const [lo, hi] = obj_shuffle_range(otyp, state);
            const bases = state.svb?.bases;
            const base = bases ? bases[ocls] : 0;
            for (let i = base; i < NUM_OBJECTS; i++) {
                if (objects[i].oc_class !== ocls) break;
                if (!objects[i].oc_name_known) {
                    const other = OBJ_DESCR(objects[i], state);
                    if (other !== null
                        && (odesc === other || (i >= lo && i <= hi)))
                        sametype[i] = 1;
                }
            }
        }
    }

    for (let a = 1; artilist[a].otyp; a++) {
        if (!sametype[artilist[a].otyp]) continue;
        let aname = artilist[a].name;
        if (aname.length >= 4
            && aname.slice(0, 4).toLowerCase() === 'the ')
            aname = aname.slice(4);
        if (aname === sought)
            return ((artilist[a].spfx & (SPFX_NOGEN | SPFX_RESTR)) !== 0
                    || otmp.quan > 1);
    }
    return false;
}

// C ref: artifact.c attacks() (626-633).
export function attacks(adtyp, otmp, state = game) {
    const weap = get_artifact(otmp, state);
    if (weap !== state.artilist[ART_NONARTIFACT])
        return weap.attk.adtyp === adtyp;
    return false;
}

// C ref: artifact.c defends() (636-685). Checks whether an artifact or
// dragon armor defends against a particular damage type.
export function defends(adtyp, otmp, state = game) {
    if (!otmp) return false;
    const weap = get_artifact(otmp, state);
    if (weap !== state.artilist[ART_NONARTIFACT])
        return weap.defn.adtyp === adtyp;
    if (Is_dragon_armor(otmp)) {
        let otyp = otmp.otyp;
        /* convert mail to scales to simplify testing */
        if (Is_dragon_mail(otmp))
            otyp += GRAY_DRAGON_SCALES - GRAY_DRAGON_SCALE_MAIL;
        switch (adtyp) {
        case AD_MAGM: return (otyp === GRAY_DRAGON_SCALES);
        case AD_HALU: return (otyp === GOLD_DRAGON_SCALES);
        case AD_FIRE: return (otyp === RED_DRAGON_SCALES);
        case AD_COLD: return (otyp === WHITE_DRAGON_SCALES);
        case AD_DRST: case AD_DISE: return (otyp === GREEN_DRAGON_SCALES);
        case AD_SLEE: case AD_PLYS: return (otyp === ORANGE_DRAGON_SCALES);
        case AD_DISN: case AD_DRLI: return (otyp === BLACK_DRAGON_SCALES);
        case AD_ELEC: case AD_SLOW: return (otyp === BLUE_DRAGON_SCALES);
        case AD_ACID: case AD_STON: return (otyp === YELLOW_DRAGON_SCALES);
        default: break;
        }
    }
    return false;
}

// C ref: artifact.c defends_when_carried() (687-695). Used for monsters.
export function defends_when_carried(adtyp, otmp, state = game) {
    const weap = get_artifact(otmp, state);
    if (weap !== state.artilist[ART_NONARTIFACT])
        return weap.cary.adtyp === adtyp;
    return false;
}

// C ref: artifact.c protects() (698-714). Determine whether an item confers
// Protection, either through its object property or its artifact flags.
export function protects(otmp, being_worn, state = game) {
    if (being_worn && state.objects[otmp.otyp].oc_oprop === PROTECTION)
        return true;
    const arti = get_artifact(otmp, state);
    if (arti === state.artilist[ART_NONARTIFACT])
        return false;
    return ((arti.cspfx & SPFX_PROTECT) !== 0
            || (being_worn && (arti.spfx & SPFX_PROTECT) !== 0));
}

// C ref: artifact.c arti_immune() (979-991). Returns true when the artifact
// itself is immune to a given damage type.
export function arti_immune(obj, dtyp, state = game) {
    const weap = get_artifact(obj, state);
    if (weap === state.artilist[ART_NONARTIFACT])
        return false;
    if (dtyp === AD_PHYS)
        return false; /* nothing is immune to phys dmg */
    return (weap.attk.adtyp === dtyp
            || weap.defn.adtyp === dtyp
            || weap.cary.adtyp === dtyp);
}

// C ref: artifact.c spec_applies() (1009-1063). Decides whether an artifact's
// special attacks apply against mtmp. The full version handles all five
// DBONUS categories plus the SPFX_ATTK resistance checks.

// Hero resistance helpers (youprop.h patterns). Fire_resistance and
// Cold_resistance are imported from zap.js; the rest follow the same pattern.
function Shock_resistance(state) {
    const p = state.u?.uprops?.[SHOCK_RES];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
function Poison_resistance(state) {
    const p = state.u?.uprops?.[POISON_RES];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
function Drain_resistance(state) {
    const p = state.u?.uprops?.[DRAIN_RES];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
export function Stone_resistance(state) {
    const p = state.u?.uprops?.[STONE_RES];
    return Boolean(p?.intrinsic || p?.extrinsic);
}

function spec_applies(weap, mtmp, state = game) {
    if (!(weap.spfx & (SPFX_DBONUS | SPFX_ATTK)))
        return (weap.attk.adtyp === AD_PHYS);

    const yours = (mtmp === state.youmonst);
    const ptr = mtmp.data;

    if (weap.spfx & SPFX_DMONS) {
        return (ptr.pmidx === weap.mtype);
    } else if (weap.spfx & SPFX_DCLAS) {
        return (weap.mtype === ptr.mlet);
    } else if (weap.spfx & SPFX_DFLAG1) {
        return ((ptr.mflags1 & weap.mtype) !== 0);
    } else if (weap.spfx & SPFX_DFLAG2) {
        return (((ptr.mflags2 & weap.mtype) !== 0)
                || (yours
                    && ((!Upolyd(state.u)
                         && ((state.urace?.selfmask ?? 0) & weap.mtype))
                        || ((weap.mtype & M2_WERE)
                            && ismnum(state.u.ulycn)))));
    } else if (weap.spfx & SPFX_DALIGN) {
        return yours ? (state.u.ualign.type !== weap.alignment)
                     : (ptr.maligntyp === A_NONE
                        || Math.sign(ptr.maligntyp) !== weap.alignment);
    } else if (weap.spfx & SPFX_ATTK) {
        if (defended(mtmp, weap.attk.adtyp, state))
            return false;

        switch (weap.attk.adtyp) {
        case AD_FIRE:
            return !(yours ? Fire_resistance(state)
                           : monster_resists_element(mtmp, FIRE_RES, state));
        case AD_COLD:
            return !(yours ? Cold_resistance(state)
                           : monster_resists_element(mtmp, COLD_RES, state));
        case AD_ELEC:
            return !(yours ? Shock_resistance(state)
                           : monster_resists_element(mtmp, SHOCK_RES, state));
        case AD_MAGM:
        case AD_STUN:
            return !(yours ? Antimagic(state)
                           : (rn2(100) < ptr.mr));
        case AD_DRST:
            return !(yours ? Poison_resistance(state)
                           : monster_resists_element(mtmp, POISON_RES, state));
        case AD_DRLI:
            return !(yours ? Drain_resistance(state)
                           : resists_drli(mtmp, state));
        case AD_STON:
            return !(yours ? Stone_resistance(state)
                           : monster_resists_element(mtmp, STONE_RES, state));
        default:
            throw new Error('Weird weapon special attack.');
        }
    }
    return false;
}

// C ref: artifact.c bane_applies() (993-1007). Checks whether an artifact's
// DBONUS flags apply against a monster, using only the DBONUS portion of spfx.
function bane_applies(oart, mon, state = game) {
    if (oart !== state.artilist[ART_NONARTIFACT]
            && (oart.spfx & SPFX_DBONUS) !== 0) {
        const atmp = { ...oart, spfx: oart.spfx & SPFX_DBONUS };
        if (spec_applies(atmp, mon, state))
            return true;
    }
    return false;
}

// C ref: artifact.c spec_m2() (1065-1074). Return the M2 flags of monster
// that an artifact's special attacks apply against.
export function spec_m2(otmp, state = game) {
    const artifact = get_artifact(otmp, state);
    if (artifact !== state.artilist[ART_NONARTIFACT])
        return artifact.mtype;
    return 0;
}

// C ref: artifact.c spec_abon() (1076-1089). Special attack bonus (to-hit).
export function spec_abon(otmp, mon, state = game) {
    const weap = get_artifact(otmp, state);
    /* no need for an extra check for `NO_ATTK' because this will
       always return 0 for any artifact which has that attribute */
    if (weap !== state.artilist[ART_NONARTIFACT]
            && weap.attk.damn && spec_applies(weap, mon, state))
        return rnd(weap.attk.damn);
    return 0;
}

// C ref: artifact.c spec_dbon() (1091-1111). Special damage bonus.
// Sets state.spec_dbon_applies as a side effect, read later by artifact_hit
// and Mb_hit.
export function spec_dbon(otmp, mon, tmp, state = game) {
    const weap = get_artifact(otmp, state);
    if ((weap === state.artilist[ART_NONARTIFACT])
        || (weap.attk.adtyp === AD_PHYS /* check for `NO_ATTK' */
            && weap.attk.damn === 0 && weap.attk.damd === 0))
        state.spec_dbon_applies = false;
    else if (is_art(otmp, ART_GRIMTOOTH))
        /* Grimtooth has SPFX settings to warn against elves but we want its
           damage bonus to apply to all targets, so bypass spec_applies() */
        state.spec_dbon_applies = true;
    else
        state.spec_dbon_applies = spec_applies(weap, mon, state);

    if (state.spec_dbon_applies)
        return weap.attk.damd ? rnd(weap.attk.damd) : Math.max(tmp, 1);
    return 0;
}

// C ref: artifact.c discover_artifact() (1113-1128). Add identified artifact
// to discoveries list.
export function discover_artifact(m, state = game) {
    artifactTables(state);
    /* look for this artifact in the discoveries list;
       if we hit an empty slot then it's not present, so add it */
    for (let i = 0; i < NROFARTIFACTS; i++) {
        if (state.artidisco[i] === 0 || state.artidisco[i] === m) {
            state.artidisco[i] = m;
            return;
        }
    }
    /* there is one slot per artifact, so we should never reach the
       end without either finding the artifact or an empty slot... */
    throw new Error(`couldn't discover artifact (${m})`);
}

// C ref: artifact.c undiscovered_artifact() (1130-1143). Used to decide
// whether an artifact has been fully identified.
export function undiscovered_artifact(m, state = game) {
    artifactTables(state);
    /* look for this artifact in the discoveries list;
       if we hit an empty slot then it's undiscovered */
    for (let i = 0; i < NROFARTIFACTS; i++) {
        if (state.artidisco[i] === m)
            return false;
        else if (state.artidisco[i] === 0)
            break;
    }
    return true;
}

// C ref: artifact.c dump_artifact_info() (1177-1213). Display a list of
// artifacts and their status flags in a text window. Uses putstr, which the
// JS port represents as ttyPline.
export async function dump_artifact_info(state = game) {
    artifactTables(state);
    await ttyPline('Artifacts', state);
    for (let m = 1; m <= NROFARTIFACTS; ++m) {
        const e = state.artiexist[m];
        const flags = `[${e.exists ? 'exists;' : ''}${e.found ? ' hero knows;' : ''
            }${e.gift ? ' gift' : ''}${e.wish ? ' wish' : ''
            }${e.named ? ' named' : ''}${e.viadip ? ' viadip' : ''
            }${e.lvldef ? ' lvldef' : ''}${e.bones ? ' bones' : ''
            }${e.rndm ? ' random' : ''}]`;
        const name = artiname(m, state);
        /* "The Platinum Yendorian Express Card" is 35 characters */
        const padded = (name + ' '.repeat(36)).slice(0, 36);
        await ttyPline(`  ${padded}${flags}`, state);
    }
}

// C ref: artifact.c Mb_hit() (1264-1445). Called when someone is being hit
// by Magicbane. Returns true if a message was given.
//
// The mb_verb table and MB_* constants are local to this function's scope.
const MB_INDEX_PROBE = 0;
const MB_INDEX_STUN = 1;
const MB_INDEX_SCARE = 2;
const MB_INDEX_CANCEL = 3;
const MB_MAX_DIEROLL = 8;
const mb_verb = [
    ['probe', 'stun', 'scare', 'cancel'],
    ['prod', 'amaze', 'tickle', 'purge'],
];
// C decl.h:44 fakename[2] = { "mon", "you" }; vtense() uses it to choose
// verb conjugation without being fooled by assigned names ending in 's'.
const fakename = ['mon', 'you'];

export async function Mb_hit(
    magr, mdef, mb, dmgptr, dieroll, vis, hittee, state = game,
) {
    const youattack = (magr === state.youmonst);
    const youdefend = (mdef === state.youmonst);
    let resisted = false;
    let do_stun;
    let result = false;
    let scare_dieroll = Math.trunc(MB_MAX_DIEROLL / 2);

    /* the most severe effects are less likely at higher enchantment */
    if (mb.spe >= 3)
        scare_dieroll = Math.trunc(scare_dieroll / (1 << Math.trunc(mb.spe / 3)));
    /* if target successfully resisted the artifact damage bonus,
       reduce overall likelihood of the assorted special effects */
    if (!state.spec_dbon_applies)
        dieroll += 1;

    /* might stun even when attempting a more severe effect, but
       in that case it will only happen if the other effect fails */
    do_stun = (Math.max(mb.spe, 0) < rn2(state.spec_dbon_applies ? 11 : 7));

    let attack_indx = MB_INDEX_PROBE;
    dmgptr.value += rnd(4); /* (2..3)d4 */
    if (do_stun) {
        attack_indx = MB_INDEX_STUN;
        dmgptr.value += rnd(4); /* (3..4)d4 */
    }
    if (dieroll <= scare_dieroll) {
        attack_indx = MB_INDEX_SCARE;
        dmgptr.value += rnd(4); /* (3..5)d4 */
    }
    if (dieroll <= Math.trunc(scare_dieroll / 2)) {
        attack_indx = MB_INDEX_CANCEL;
        dmgptr.value += rnd(4); /* (4..6)d4 */
    }

    /* give the hit message prior to inflicting the effects */
    const halluc = (state.u?.uprops?.[HALLUC]?.intrinsic ?? 0) !== 0
        && !(state.u?.uprops?.[HALLUC_RES]?.intrinsic ?? 0)
        && !(state.u?.uprops?.[HALLUC_RES]?.extrinsic ?? 0);
    const verb = mb_verb[halluc ? 1 : 0][attack_indx];
    if (youattack || youdefend || vis) {
        result = true;
        await ttyPline(
            `The magic-absorbing blade ${vtense(null, verb)} ${hittee.value}!`,
            state);
        /* assume probing has some sort of noticeable feedback
           even if it is being done by one monster to another */
        if (attack_indx === MB_INDEX_PROBE) {
            note_unported('mondata.c canspotmon');
            // canspotmon check for map_invisible skipped
        }
    }

    /* now perform special effects */
    switch (attack_indx) {
    case MB_INDEX_CANCEL: {
        const old_mdat = youdefend ? state.youmonst.data : mdef.data;
        if (!await cancel_monst(mdef, mb, youattack, false, false, state)) {
            resisted = true;
        } else {
            do_stun = false;
            if (youdefend) {
                if (state.youmonst.data !== old_mdat)
                    dmgptr.value = 0; /* rehumanized, so no more damage */
                if (state.u.uenmax > 0) {
                    state.u.uenmax--;
                    if (state.u.uen > 0)
                        state.u.uen--;
                    state.disp.botl = true;
                    await ttyPline('You lose magical energy!', state);
                }
            } else {
                /* canceled shapeshifter/vamp may have changed forms */
                if (mdef.data !== old_mdat)
                    hittee.value = monsterCommonName(mdef, state);
                if (mdef.data === state.mons[PM_CLAY_GOLEM])
                    mdef.mhp = 1; /* cancelled clay golems will die */
                if (youattack && attacktype(mdef.data, AT_MAGC)) {
                    state.u.uenmax++;
                    if (state.u.uenmax > state.u.uenpeak)
                        state.u.uenpeak = state.u.uenmax;
                    state.u.uen++;
                    state.disp.botl = true;
                    await ttyPline('You absorb magical energy!', state);
                }
            }
        }
        break;
    }
    case MB_INDEX_SCARE:
        if (youdefend) {
            if (Antimagic(state)) {
                resisted = true;
            } else {
                nomul(-3, state);
                state.multi_reason = 'being scared stiff';
                state.nomovemsg = '';
                if (magr && magr === state.u.ustuck
                    && sticks(state.youmonst.data)) {
                    set_ustuck(null, state);
                    await ttyPline(
                        `You release ${monsterCommonName(magr, state)}!`,
                        state);
                }
            }
        } else {
            if (rn2(2) && await resist(mdef, WEAPON_CLASS, 0, NOTELL, state)) {
                resisted = true;
            } else {
                await monflee(mdef, 3, false, (mdef.mhp > dmgptr.value), state);
            }
        }
        if (!resisted)
            do_stun = false;
        break;

    case MB_INDEX_STUN:
        do_stun = true; /* (this is redundant...) */
        break;

    case MB_INDEX_PROBE:
        if (youattack && (mb.spe === 0 || !rn2(3 * Math.abs(mb.spe)))) {
            await ttyPline(`The ${verb} is insightful.`, state);
            /* pre-damage status */
            note_unported('zap.c probe_monster');
        }
        break;
    }

    /* stun if that was selected and a worse effect didn't occur */
    if (do_stun) {
        if (youdefend) {
            note_unported('timeout.c make_stunned');
        } else {
            mdef.mstun = 1;
        }
        /* avoid extra stun message below if we used mb_verb["stun"] above */
        if (attack_indx === MB_INDEX_STUN)
            do_stun = false;
    }

    /* lastly, all this magic can be confusing... */
    let do_confuse = !rn2(12);
    if (do_confuse) {
        if (youdefend) {
            note_unported('timeout.c make_confused');
        } else {
            mdef.mconf = 1;
        }
    }

    /* now give message(s) describing side-effects; Use fakename
       so vtense() won't be fooled by assigned name ending in 's' */
    const fakeidx = youdefend ? 1 : 0;
    if (youattack || youdefend || vis) {
        hittee.value = upstart(hittee.value); /* capitalize */
        if (resisted) {
            await ttyPline(
                `${hittee.value} ${vtense(fakename[fakeidx], 'resist')}!`,
                state);
            note_unported('pager.c shieldeff');
        }
        if ((do_stun || do_confuse) && state.flags?.verbose) {
            let buf = '';
            if (do_stun)
                buf += 'stunned';
            if (do_stun && do_confuse)
                buf += ' and ';
            if (do_confuse)
                buf += 'confused';
            await ttyPline(
                `${hittee.value} ${vtense(fakename[fakeidx], 'are')} ${buf}${(do_stun && do_confuse) ? '!' : '.'}`,
                state);
        }
    }

    return result;
}

// C ref: artifact.c FATAL_DAMAGE_MODIFIER (63). Local to artifact.c.
const FATAL_DAMAGE_MODIFIER = 200;

// Local property helpers, following the pattern used in uhitm.js and other
// combat modules. Each mirrors one youprop.h macro.
function Blind(state) {
    const value = state.u?.uprops?.[BLINDED];
    return Boolean(value?.intrinsic || value?.extrinsic) && !value?.blocked;
}
function Hallucination(state) {
    const halluc = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(halluc?.intrinsic)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}
function Slimed(state) {
    return Boolean(state.u?.uprops?.[SLIMED]?.intrinsic);
}

// C ref: artifact.c artifact_hit() (1447-1726). The main artifact combat
// handler. Returns true when it did something special (in which case the
// caller skips the normal hit message). Modifies dmgptr.value in place.
//
// magr may be null when a thrown artifact hits the hero (C callers in
// dothrow.c and mthrowu.c pass (struct monst *) 0).
export async function artifact_hit(
    magr, mdef, otmp, dmgptr, dieroll, state = game,
) {
    const youattack = (magr === state.youmonst);
    const youdefend = (mdef === state.youmonst);
    const vis = (!youattack && magr && cansee(magr.mx, magr.my, state))
              || (!youdefend && cansee(mdef.mx, mdef.my, state))
              || (youattack && engulfing_u(mdef, state) && !Blind(state));
    let realizes_damage;
    let wepdesc;
    let hittee = youdefend ? 'you' : monsterCommonName(mdef, state);

    /* The following takes care of most of the damage, but not all--
     * the exception being for level draining, which is specially
     * handled.  Messages are done in this function, however. */
    dmgptr.value += spec_dbon(otmp, mdef, dmgptr.value, state);

    if (youattack && youdefend) {
        // C: impossible("attacking yourself with weapon?");
        return false;
    }

    realizes_damage = (youdefend || vis
                       /* feel the effect even if not seen */
                       || (youattack && mdef === state.u.ustuck));

    /* the four basic attacks: fire, cold, shock and missiles */
    if (attacks(AD_FIRE, otmp, state)) {
        if (realizes_damage) {
            const verb = !state.spec_dbon_applies
                ? 'hits'
                : (mdef.data === state.mons[PM_WATER_ELEMENTAL])
                    ? 'vaporizes part of'
                    : 'burns';
            const punct = !state.spec_dbon_applies ? '.' : '!';
            await ttyPline(`The fiery blade ${verb} ${hittee}${punct}`, state);
        }
        if (!rn2(4)) {
            const env = { state, random: { rn2, rnd, d } };
            const itemdmg = await destroy_items(mdef, AD_FIRE, dmgptr.value, env);
            if (!youdefend)
                dmgptr.value += itemdmg; /* item destruction dmg */
            await ignite_items(mdef.minvent, env);
        }
        if (youdefend && Slimed(state))
            burn_away_slime(state);
        return realizes_damage;
    }
    if (attacks(AD_COLD, otmp, state)) {
        if (realizes_damage) {
            const verb = !state.spec_dbon_applies ? 'hits' : 'freezes';
            const punct = !state.spec_dbon_applies ? '.' : '!';
            await ttyPline(
                `The ice-cold blade ${verb} ${hittee}${punct}`, state);
        }
        if (!rn2(4)) {
            const env = { state, random: { rn2, rnd, d } };
            const itemdmg = await destroy_items(mdef, AD_COLD, dmgptr.value, env);
            if (!youdefend)
                dmgptr.value += itemdmg; /* item destruction dmg */
        }
        return realizes_damage;
    }
    if (attacks(AD_ELEC, otmp, state)) {
        if (realizes_damage) {
            const extra = !state.spec_dbon_applies
                ? '' : '!  Lightning strikes';
            const punct = !state.spec_dbon_applies ? '.' : '!';
            await ttyPline(
                `The massive hammer hits${extra} ${hittee}${punct}`, state);
        }
        if (state.spec_dbon_applies)
            await wake_nearto(mdef.mx, mdef.my, 4 * 4, { state });
        if (!rn2(5)) {
            const env = { state, random: { rn2, rnd, d } };
            const itemdmg = await destroy_items(mdef, AD_ELEC, dmgptr.value, env);
            if (!youdefend)
                dmgptr.value += itemdmg; /* item destruction dmg */
        }
        return realizes_damage;
    }
    if (attacks(AD_MAGM, otmp, state)) {
        if (realizes_damage) {
            const extra = !state.spec_dbon_applies
                ? '' : '!  A hail of magic missiles strikes';
            const punct = !state.spec_dbon_applies ? '.' : '!';
            await ttyPline(
                `The imaginary widget hits${extra} ${hittee}${punct}`, state);
        }
        return realizes_damage;
    }

    if (attacks(AD_STUN, otmp, state) && dieroll <= MB_MAX_DIEROLL) {
        /* Magicbane's special attacks (possibly modifies hittee[]) */
        const hitteeRef = { value: hittee };
        return await Mb_hit(magr, mdef, otmp, dmgptr, dieroll, vis,
                            hitteeRef, state);
    }

    if (!state.spec_dbon_applies) {
        /* since damage bonus didn't apply, nothing more to do;
           no further attacks have side-effects on inventory */
        return false;
    }

    /* We really want "on a natural 20" but Nethack does it in
       reverse from AD&D. */
    if (spec_ability(otmp, SPFX_BEHEAD, state)) {
        if (is_art(otmp, ART_TSURUGI_OF_MURAMASA) && dieroll === 1) {
            wepdesc = 'The razor-sharp blade';
            /* not really beheading, but so close, why add another SPFX */
            if (youattack && engulfing_u(mdef, state)) {
                await ttyPline(
                    `You slice ${monsterCommonName(mdef, state)} wide open!`,
                    state);
                dmgptr.value = 2 * mdef.mhp + FATAL_DAMAGE_MODIFIER;
                return true;
            }
            if (!youdefend) {
                /* allow normal cutworm() call to add extra damage */
                if (state.gn.notonhead)
                    return false;

                if (bigmonst(mdef.data)) {
                    if (youattack) {
                        await ttyPline(
                            `You slice deeply into ${monsterCommonName(mdef, state)}!`,
                            state);
                    } else if (vis) {
                        await ttyPline(
                            `${capitalizedMonsterName(magr, state)} cuts deeply into ${hittee}!`,
                            state);
                    }
                    dmgptr.value *= 2;
                    return true;
                }
                dmgptr.value = 2 * mdef.mhp + FATAL_DAMAGE_MODIFIER;
                await ttyPline(
                    `${wepdesc} cuts ${monsterCommonName(mdef, state)} in half!`,
                    state);
                observe_object(otmp, state);
                return true;
            } else {
                if (bigmonst(state.youmonst.data)) {
                    await ttyPline(
                        `${magr ? capitalizedMonsterName(magr, state) : wepdesc} cuts deeply into you!`,
                        state);
                    dmgptr.value *= 2;
                    return true;
                }

                /* Players with negative AC's take less damage instead
                 * of just not getting hit.  We must add a large enough
                 * value to the damage so that this reduction in
                 * damage does not prevent death. */
                dmgptr.value = 2 * (Upolyd(state) ? state.u.mh : state.u.uhp)
                             + FATAL_DAMAGE_MODIFIER;
                await ttyPline(`${wepdesc} cuts you in half!`, state);
                observe_object(otmp, state);
                return true;
            }
        } else if (is_art(otmp, ART_VORPAL_BLADE)
                   && (dieroll === 1
                       || mdef.data === state.mons[PM_JABBERWOCK])) {
            const behead_msg = ['%wepdesc beheads %target!',
                                '%wepdesc decapitates %target!'];

            if (youattack && engulfing_u(mdef, state))
                return false;
            wepdesc = state.artilist[ART_VORPAL_BLADE].name;
            if (!youdefend) {
                if (!has_head(mdef.data) || state.gn.notonhead
                    || state.u.uswallow) {
                    if (youattack) {
                        await ttyPline(
                            `Somehow, you miss ${monsterCommonName(mdef, state)} wildly.`,
                            state);
                    } else if (vis) {
                        await ttyPline(
                            `Somehow, ${monsterCommonName(magr, state)} misses wildly.`,
                            state);
                    }
                    dmgptr.value = 0;
                    return youattack || vis;
                }
                if (noncorporeal(mdef.data) || amorphous(mdef.data)) {
                    await ttyPline(
                        `${wepdesc} slices through ${s_suffix(monsterCommonName(mdef, state))} ${mbodypart(mdef, NECK)}.`,
                        state);
                    return true;
                }
                dmgptr.value = 2 * mdef.mhp + FATAL_DAMAGE_MODIFIER;
                // C: ROLL_FROM(behead_msg) = behead_msg[rn2(2)]
                const msg = behead_msg[rn2(2)];
                await ttyPline(
                    msg.replace('%wepdesc', wepdesc)
                       .replace('%target', monsterCommonName(mdef, state)),
                    state);
                if (Hallucination(state) && !state.flags.female)
                    await ttyPline(
                        "Good job Henry, but that wasn't Anne.", state);
                observe_object(otmp, state);
                return true;
            } else {
                if (!has_head(state.youmonst.data)) {
                    await ttyPline(
                        `Somehow, ${magr ? monsterCommonName(magr, state) : wepdesc} misses you wildly.`,
                        state);
                    dmgptr.value = 0;
                    return true;
                }
                if (noncorporeal(state.youmonst.data)
                    || amorphous(state.youmonst.data)) {
                    await ttyPline(
                        `${wepdesc} slices through your ${body_part(NECK, state.youmonst)}.`,
                        state);
                    return true;
                }
                dmgptr.value = 2 * (Upolyd(state) ? state.u.mh : state.u.uhp)
                             + FATAL_DAMAGE_MODIFIER;
                // C: ROLL_FROM(behead_msg) = behead_msg[rn2(2)]
                const msg = behead_msg[rn2(2)];
                await ttyPline(
                    msg.replace('%wepdesc', wepdesc)
                       .replace('%target', 'you'),
                    state);
                observe_object(otmp, state);
                /* Should amulets fall off? */
                return true;
            }
        }
    }
    if (spec_ability(otmp, SPFX_DRLI, state)) {
        /* some non-living creatures (golems, vortices) are vulnerable to
           life drain effects so can get "<Arti> draws the <life>" feedback */
        const life = nonliving(mdef.data) ? 'animating force' : 'life';

        if (!youdefend) {
            const m_lev = mdef.m_lev | 0; /* will be 0 for 1d4 mon */
            const mhpmax = mdef.mhpmax;
            let drain = monhp_per_lvl(mdef); /* usually 1d8 */
            /* note: DRLI attack uses 2d6, attacker doesn't get healed */

            /* stop draining HP if it drops too low (still drains level;
               also caller still inflicts regular weapon damage) */
            if (mhpmax - drain <= m_lev)
                drain = (mhpmax > m_lev) ? (mhpmax - (m_lev + 1)) : 0;

            if (vis) {
                /* call distant_name() for possible side-effects even if
                   the result won't be printed */
                const otmpname = distant_name(otmp, xnameFresh, state);

                if (is_art(otmp, ART_STORMBRINGER)) {
                    await ttyPline(
                        `The ${hcolor('black', state)} blade draws the ${life} from ${monsterCommonName(mdef, state)}!`,
                        state);
                } else {
                    await ttyPline(
                        `${The(otmpname, state)} draws the ${life} from ${monsterCommonName(mdef, state)}!`,
                        state);
                }
            }
            if (mdef.m_lev === 0) {
                /* losing a level when at 0 is fatal */
                dmgptr.value = 2 * mdef.mhp + FATAL_DAMAGE_MODIFIER;
            } else {
                dmgptr.value += drain;
                mdef.mhpmax -= drain;
                mdef.m_lev--;
            }

            if (drain > 0) {
                /* drain: was target's damage, now heal attacker by half */
                drain = Math.trunc((drain + 1) / 2); /* drain/2 rounded up */
                if (youattack) {
                    healup(drain, 0, false, false, state);
                } else {
                    // C: assert(magr != 0);
                    healmon(magr, drain, 0);
                }
            }
            return vis;
        } else { /* youdefend */
            const oldhpmax = state.u.uhpmax;

            if (Blind(state)) {
                await ttyPline(
                    `You feel an ${is_art(otmp, ART_STORMBRINGER) ? 'unholy blade' : 'object'} drain your ${life}!`,
                    state);
            } else {
                /* call distant_name() for possible side-effects even if
                   the result won't be printed */
                const otmpname = distant_name(otmp, xnameFresh, state);

                if (is_art(otmp, ART_STORMBRINGER)) {
                    await ttyPline(
                        `The ${hcolor('black', state)} blade drains your ${life}!`,
                        state);
                } else {
                    await ttyPline(
                        `${The(otmpname, state)} drains your ${life}!`,
                        state);
                }
            }
            await losexp('life drainage', state);
            if (magr && magr.mhp < magr.mhpmax) {
                healmon(magr, Math.trunc((Math.abs(oldhpmax - state.u.uhpmax) + 1) / 2), 0);
            }
            return true;
        }
    }
    return false;
}

// --- artifact.c invoke functions (C lines 1727-2260) ---

// C ref: artifact.c invoke_ok() (1727-1745). Filter for getobj() when choosing
// an object to invoke.
function invoke_ok(obj) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.oartifact || objectType(obj.otyp).oc_unique
        || (obj.otyp === FAKE_AMULET_OF_YENDOR && !obj.known))
        return GETOBJ_SUGGEST;
    if (obj.otyp === CRYSTAL_BALL)
        return GETOBJ_SUGGEST;
    return GETOBJ_EXCLUDE;
}

// C ref: artifact.c doinvoke() (1749-1759). The #invoke command handler.
export async function doinvoke(state = game) {
    const obj = await getobj('invoke', invoke_ok, GETOBJ_PROMPT, state);
    if (!obj) return ECMD_CANCEL;
    const objp = { obj };
    if (!await retouch_object(objp, false, state))
        return ECMD_TIME;
    return await arti_invoke(objp.obj, state);
}

// C ref: artifact.c nothing_special() (1761-1766).
async function nothing_special(obj, state) {
    if (carried(obj)) {
        await ttyPline(
            'You feel a surge of power, but nothing seems to happen.', state);
    }
}

// C ref: artifact.c invoke_taming() (1768-1777).
async function invoke_taming(obj, state) {
    const pseudo = { ...state.zeroobj, otyp: SCR_TAMING };
    await seffects(pseudo, state);
    return ECMD_TIME;
}

// C ref: artifact.c invoke_healing() (1779-1815).
async function invoke_healing(obj, state) {
    const u = state.u;
    let healamt = Math.trunc((u.uhpmax + 1 - u.uhp) / 2);
    const creamed = u.ucreamed ?? 0;

    if (Upolyd(state))
        healamt = Math.trunc((u.mhmax + 1 - u.mh) / 2);

    // C: Sick = u.uprops[SICK].intrinsic, Slimed = u.uprops[SLIMED].intrinsic,
    // BlindedTimeout = u.uprops[BLINDED].intrinsic & TIMEOUT.
    const blindProp = u.uprops?.[BLINDED] ?? { intrinsic: 0, extrinsic: 0 };
    const blindedTimeout = blindProp.intrinsic & TIMEOUT;
    const sick = (u.uprops?.[SICK]?.intrinsic ?? 0) !== 0;
    const slimed = (u.uprops?.[SLIMED]?.intrinsic ?? 0) !== 0;
    const hBlinded = blindProp.intrinsic;

    if (healamt || sick || slimed || blindedTimeout > creamed) {
        const prefix = (!healamt && !sick && !slimed
            && (hBlinded & ~TIMEOUT) !== 0) ? 'slightly ' : '';
        await ttyPline(`You feel ${prefix}better.`, state);
    } else {
        await nothing_special(obj, state);
        return ECMD_TIME;
    }
    if (healamt > 0) {
        if (Upolyd(state))
            u.mh += healamt;
        else
            u.uhp += healamt;
    }
    if (sick) {
        note_unported('eat.c make_sick');
    }
    if (slimed) {
        note_unported('hack.c make_slimed');
    }
    if (blindedTimeout > creamed)
        await make_blinded(creamed, false, state);
    state.disp ??= {};
    state.disp.botl = true;
    return ECMD_TIME;
}

// C ref: artifact.c invoke_energy_boost() (1817-1835).
async function invoke_energy_boost(obj, state) {
    const u = state.u;
    let epboost = Math.trunc((u.uenmax + 1 - u.uen) / 2);
    if (epboost > 120) epboost = 120;
    else if (epboost < 12) epboost = u.uenmax - u.uen;
    if (epboost) {
        u.uen += epboost;
        state.disp ??= {};
        state.disp.botl = true;
        await ttyPline('You feel re-energized.', state);
    } else {
        await nothing_special(obj, state);
        return ECMD_TIME;
    }
    return ECMD_TIME;
}

// C ref: artifact.c invoke_untrap() (1837-1845).
async function invoke_untrap(obj, state) {
    // untrap() is a large interactive function in trap.c, not yet ported.
    note_unported('trap.c untrap');
    obj.age = 0;
    return ECMD_CANCEL;
}

// C ref: artifact.c invoke_charge_obj() (1847-1864).
async function invoke_charge_obj(obj, state) {
    const oart = get_artifact(obj, state);
    const otmp = await getobj('charge', charge_ok,
        GETOBJ_PROMPT | GETOBJ_ALLOWCNT, state);
    if (!otmp) {
        obj.age = 0;
        return ECMD_CANCEL;
    }
    // recharge() is in read.c, not yet ported; its return is discarded.
    note_unported('read.c recharge');
    update_inventory(state);
    return ECMD_TIME;
}

// C ref: artifact.c invoke_create_portal() (1866-1931).
async function invoke_create_portal(obj, state) {
    const u = state.u;
    let num_ok_dungeons = 0;
    let last_ok_dungeon = 0;
    const items = [];

    for (let i = 0; i < state.n_dgns; i++) {
        if (!state.dungeons[i].dunlev_ureached) continue;
        if (Number.isInteger(state.tutorial_dnum) && i === state.tutorial_dnum)
            continue;
        items.push({
            value: i + 1,
            label: state.dungeons[i].dname,
        });
        num_ok_dungeons++;
        last_ok_dungeon = i;
    }

    let chosen;
    if (num_ok_dungeons > 1) {
        const selected = await select_menu(state, {
            title: 'Open a portal to which dungeon?',
            items,
            how: PICK_ONE,
            cancelValue: null,
        });
        if (!selected || selected.length <= 0) {
            await nothing_special(obj, state);
            return ECMD_TIME;
        }
        chosen = selected[0].value - 1;
    } else {
        chosen = last_ok_dungeon;
    }

    const newlev = { dnum: chosen, dlevel: 0 };
    if (state.dungeons[chosen].depth_start >= depth(u.uz, state))
        newlev.dlevel = state.dungeons[chosen].entry_lev;
    else
        newlev.dlevel = state.dungeons[chosen].dunlev_ureached;

    if (u.uhave?.amulet || In_endgame(u.uz) || In_endgame(newlev)
        || newlev.dnum === u.uz.dnum || !next_to_u(state)) {
        await ttyPline('You feel very disoriented for a moment.', state);
    } else {
        const blind = (u.uprops?.[44]?.intrinsic ?? 0) !== 0
            || (u.uprops?.[44]?.extrinsic ?? 0) !== 0;
        if (!blind)
            await ttyPline('You are surrounded by a shimmering sphere!', state);
        else
            await ttyPline('You feel weightless for a moment.', state);
        await goto_level(newlev, false, false, false, state);
    }
    return ECMD_TIME;
}

// C ref: artifact.c invoke_create_ammo() (1933-1960).
async function invoke_create_ammo(obj, state) {
    let otmp = mksobj(ARROW, true, false, state);
    if (!otmp) {
        await nothing_special(obj, state);
        return ECMD_TIME;
    }
    otmp.blessed = obj.blessed;
    otmp.cursed = obj.cursed;
    otmp.bknown = obj.bknown;
    otmp.oeroded = 0;
    otmp.oeroded2 = 0;
    if (obj.blessed) {
        if (otmp.spe < 0) otmp.spe = 0;
        otmp.quan += rnd(10);
    } else if (obj.cursed) {
        if (otmp.spe > 0) otmp.spe = 0;
    } else {
        otmp.quan += rnd(5);
    }
    otmp.owt = weight(otmp, state);
    otmp = await hold_another_object(otmp, 'Suddenly %s out.',
        aobjnam(otmp, 'fall', state), null, state);
    return ECMD_TIME;
}

// C ref: artifact.c invoke_banish() (1962-2019).
async function invoke_banish(obj, state) {
    let nvanished = 0;
    let nstayed = 0;
    const u = state.u;

    for (let mtmp = state.fmon; mtmp; mtmp = mtmp.nmon) {
        let chance = 1;
        if (mtmp.mhp < 1 || !isok(mtmp.mx, mtmp.my)) continue;
        if (!is_demon(mtmp.data) && mtmp.data?.mlet !== S_IMP) continue;
        if (!couldsee(mtmp.mx, mtmp.my, state)) continue;
        if (mtmp.data?.msound === MS_NEMESIS) continue;

        if (In_quest(u.uz) && !state.quest_status?.killed_nemesis)
            chance += 10;
        if (is_dprince(mtmp.data)) chance += 2;
        if (is_dlord(mtmp.data)) chance++;

        mtmp.msleeping = 0;
        mtmp.mtame = 0;
        mtmp.mpeaceful = 0;
        if (chance <= 1 || !rn2(chance)) {
            const inhell = In_hell(u.uz, state);
            if (!inhell) {
                nvanished++;
                // find_hell remains unported; retain its selected destination
                // shape while handing the migration itself to mon.c's helper.
                note_unported('dungeon.c find_hell');
                const dest = {
                    dnum: state.valley_level?.dnum ?? 0,
                    dlevel: 0,
                };
                dest.dlevel = rn2(dunlevs_in_dungeon(dest, state));
                migrate_mon(mtmp, ledger_no(dest, state), MIGR_RANDOM, state);
            } else {
                note_unported('teleport.c u_teleport_mon');
            }
        } else {
            nstayed++;
        }
    }

    if (nvanished) {
        let subject = 'demons';
        if (nvanished === 1) subject = 'demon';
        const article = nstayed
            ? (nvanished > nstayed ? 'Most of the' : 'Some of the')
            : 'The';
        await ttyPline(
            `${article} ${subject} ${vtense(subject, 'disappear')} in a cloud of brimstone!`,
            state);
    }
    return ECMD_TIME;
}

// C ref: artifact.c invoke_fling_poison() (2021-2037).
async function invoke_fling_poison(obj, state) {
    if (await getdir(null, state)) {
        const venom = rn2(2) ? BLINDING_VENOM : ACID_VENOM;
        const otmp = mksobj(venom, true, false, state);
        otmp.spe = 1;
        await throwit(otmp, 0, false, null, state);
    } else {
        await ttyPline(Never_mind, state);
        obj.age = state.moves;
        return ECMD_CANCEL;
    }
    return ECMD_TIME;
}

// C ref: artifact.c invoke_storm_spell() (2039-2051).
async function invoke_storm_spell(obj, state) {
    const oart = get_artifact(obj, state);
    const storm = oart.inv_prop === SNOWSTORM
        ? SPE_CONE_OF_COLD : SPE_FIREBALL;
    const skill = spell_skilltype(storm, state);
    // Temporarily set skill to P_EXPERT
    const slots = state.u.weapon_skills;
    const slot = slots?.[skill];
    const saved = slot?.skill ?? 0;
    if (slot) slot.skill = 4; // P_EXPERT
    await spelleffects(storm, false, true, state);
    if (slot) slot.skill = saved;
    return ECMD_TIME;
}

// C ref: artifact.c invoke_blinding_ray() (2053-2086).
async function invoke_blinding_ray(obj, state) {
    if (await getdir(null, state)) {
        if (state.u.dx || state.u.dy) {
            note_unported('artifact.c do_blinding_ray');
        } else if (state.u.dz) {
            note_unported('light.c litroom');
            await ttyPline(nothing_seems_to_happen, state);
        } else {
            const damg = obj.blessed ? 15 : !obj.cursed ? 10 : 5;
            // rnd(damg) consumed by flashburn argument
            rnd(damg);
            note_unported('zap.c flashburn');
            note_unported('light.c lightdamage');
            await ttyPline(nothing_seems_to_happen, state);
        }
    } else {
        await ttyPline(Never_mind, state);
        obj.age = state.moves;
        return ECMD_CANCEL;
    }
    return ECMD_TIME;
}

// C ref: artifact.c arti_invoke_cost_pw() (2090-2102).
function arti_invoke_cost_pw(obj, state) {
    const oart = get_artifact(obj, state);
    if (oart.inv_prop === FLING_POISON
        || oart.inv_prop === BLINDING_RAY) {
        return 5 * 5; // SPELL_LEV_PW(5) = 5 * 5
    }
    return -1;
}

// C ref: artifact.c arti_invoke_cost() (2105-2128).
async function arti_invoke_cost(obj, state) {
    if (obj.age > state.moves) {
        const pw_cost = arti_invoke_cost_pw(obj, state);
        if (pw_cost < 0 || state.u.uen < pw_cost) {
            await ttyPline(
                `You feel that ${the(xnameFresh(obj, state), state)} ${otense(obj, 'are')} ignoring you.`,
                state);
            obj.age += d(3, 10);
            return false;
        } else {
            await ttyPline('You feel drained...', state);
            state.u.uen -= pw_cost;
            state.disp ??= {};
            state.disp.botl = true;
        }
    } else {
        obj.age = state.moves + rnz(100);
    }
    return true;
}

// C ref: artifact.c arti_invoke() (2130-2232).
async function arti_invoke(obj, state = game) {
    let res = ECMD_OK;

    if (!obj) {
        // impossible("arti_invoke without obj")
        return ECMD_OK;
    }
    const oart = get_artifact(obj, state);
    if (oart === state.artilist[ART_NONARTIFACT] || !oart.inv_prop) {
        if (obj.otyp === CRYSTAL_BALL) {
            note_unported('apply.c use_crystal_ball');
        } else {
            await ttyPline(nothing_happens, state);
        }
        return ECMD_TIME;
    }

    if (oart.inv_prop > LAST_PROP) {
        if (!await arti_invoke_cost(obj, state))
            return ECMD_TIME;

        switch (oart.inv_prop) {
        case TAMING: res = await invoke_taming(obj, state); break;
        case HEALING: res = await invoke_healing(obj, state); break;
        case ENERGY_BOOST: res = await invoke_energy_boost(obj, state); break;
        case UNTRAP: res = await invoke_untrap(obj, state); break;
        case CHARGE_OBJ: res = await invoke_charge_obj(obj, state); break;
        case LEV_TELE: await level_tele(state); res = ECMD_TIME; break;
        case CREATE_PORTAL: res = await invoke_create_portal(obj, state); break;
        case ENLIGHTENING:
            await enlightenment(2 /* MAGICENLIGHTENMENT */, 0 /* ENL_GAMEINPROGRESS */, state);
            res = ECMD_TIME;
            break;
        case CREATE_AMMO: res = await invoke_create_ammo(obj, state); break;
        case BANISH: res = await invoke_banish(obj, state); break;
        case FLING_POISON: res = await invoke_fling_poison(obj, state); break;
        case SNOWSTORM:
        case FIRESTORM: res = await invoke_storm_spell(obj, state); break;
        case BLINDING_RAY: res = await invoke_blinding_ray(obj, state); break;
        default:
            // impossible("Unknown invoke power %d.", oart.inv_prop)
            break;
        }
        return res;
    }

    // Property toggle (inv_prop <= LAST_PROP)
    const prop = state.u.uprops[oart.inv_prop] ??= {
        intrinsic: 0, extrinsic: 0,
    };
    prop.extrinsic ^= W_ARTI;
    const eprop = prop.extrinsic;
    const iprop = prop.intrinsic;
    const on = (eprop & W_ARTI) !== 0;

    if (on && obj.age > state.moves) {
        prop.extrinsic ^= W_ARTI;
        await ttyPline(
            `You feel that ${the(xnameFresh(obj, state), state)} ${otense(obj, 'are')} ignoring you.`,
            state);
        obj.age += d(3, 10);
        return ECMD_TIME;
    } else if (!on) {
        obj.age = state.moves + rnz(100);
    }

    if ((eprop & ~W_ARTI) || iprop) {
        await nothing_special(obj, state);
        return ECMD_TIME;
    }
    switch (oart.inv_prop) {
    case CONFLICT:
        if (on)
            await ttyPline('You feel like a rabble-rouser.', state);
        else
            await ttyPline('You feel the tension decrease around you.', state);
        break;
    case LEVITATION:
        if (on) {
            note_unported('hack.c float_up');
            await spoteffects(false, state);
        } else {
            await float_down(I_SPECIAL | TIMEOUT, W_ARTI, state);
        }
        break;
    case INVIS: {
        // BInvis: extrinsic/intrinsic blocking invisibility
        const bInvis = (state.u.uprops?.[INVIS]?.extrinsic ?? 0)
            & ~(W_ARTI | W_ART);
        const blind = (state.u.uprops?.[44]?.intrinsic ?? 0) !== 0
            || (state.u.uprops?.[44]?.extrinsic ?? 0) !== 0;
        if (bInvis || blind) {
            await nothing_special(obj, state);
            return ECMD_TIME;
        }
        newsym(state.u.ux, state.u.uy);
        const halluc = (state.u.uprops?.[HALLUC]?.intrinsic ?? 0) !== 0
            || (state.u.uprops?.[HALLUC]?.extrinsic ?? 0) !== 0;
        if (on)
            await ttyPline(
                `Your body takes on a ${halluc ? 'normal' : 'strange'} transparency...`,
                state);
        else
            await ttyPline('Your body seems to unfade...', state);
        break;
    }
    }

    return ECMD_TIME;
}

// C ref: artifact.c finesse_ahriman() (2235-2260). Checks whether freeing
// this object from inventory would cause levitation to end.
export function finesse_ahriman(obj, state = game) {
    const oart = get_artifact(obj, state);
    if (oart === state.artilist[ART_NONARTIFACT]) return false;

    const levProp = state.u.uprops?.[LEVITATION]
        ?? { intrinsic: 0, extrinsic: 0 };
    // Not levitating, or not an artifact that confers levitation via invoke
    if (!(levProp.intrinsic || levProp.extrinsic)
        || oart.inv_prop !== LEVITATION
        || !(levProp.extrinsic & W_ARTI))
        return false;

    // Probe: clear I_SPECIAL|TIMEOUT and W_ARTI, check if still levitating
    const saveIntrinsic = levProp.intrinsic;
    const saveExtrinsic = levProp.extrinsic;
    levProp.intrinsic &= ~(I_SPECIAL | TIMEOUT);
    levProp.extrinsic &= ~W_ARTI;
    const result = !(levProp.intrinsic || levProp.extrinsic);
    levProp.intrinsic = saveIntrinsic;
    levProp.extrinsic = saveExtrinsic;
    return result;
}

// C ref: artifact.c artifact_light() (2263-2275). Whether an object lights the
// map without burning fuel. C's second clause reads
// `get_artifact(obj) != &artilist[ART_NONARTIFACT] && is_art(obj, ART_SUNSWORD)`;
// the first conjunct is redundant, because is_art() already requires
// obj->oartifact to equal ART_SUNSWORD and get_artifact() maps every index in
// 1..NROFARTIFACTS to a real entry. Both of C's helpers tolerate a null object,
// which is why callers such as uhitm.c hmon_hitmon_do_hit():1411 pass one
// unguarded.
export function artifact_light(obj) {
    if (obj && (obj.otyp === GOLD_DRAGON_SCALE_MAIL
                || obj.otyp === GOLD_DRAGON_SCALES)
        && (obj.owornmask & W_ARM) !== 0)
        return true;

    return obj?.oartifact === ART_SUNSWORD;
}

// C ref: artifact.c arti_speak() (2279-2296). A speaking artifact (SPFX_SPEAK
// set) whispers a rumor from the rumors file when wielded. The only two
// speaking artifacts are Sting and Orcrist (both SPFX_WARN_OF_MON |
// SPFX_SPEAK). This port handles the early return for non-speaking artifacts
// and stops at the speaking path, which needs getrumor() and verbalize1().
export function arti_speak(obj, state = game) {
    const normalized = artifactTables(state);
    const oart = get_artifact(obj, normalized);
    /* Is this a speaking artifact? */
    if (oart === normalized.artilist[ART_NONARTIFACT]
        || !(oart.spfx & SPFX_SPEAK))
        return ECMD_OK; /* nothing happened */

    // The speaking path reads a rumor and verbalize1()s it. getrumor() and
    // verbalize1() are not ported.
    throw new UnsupportedArtifactDisplayError('a speaking artifact (arti_speak)');
}

// --- artifact.c functions (C lines 2299-2502) ---

// C ref: artifact.c artifact_has_invprop() (2299-2305).
export function artifact_has_invprop(otmp, inv_prop, state = game) {
    const arti = get_artifact(otmp, state);
    return arti !== state.artilist[ART_NONARTIFACT]
        && arti.inv_prop === inv_prop;
}

// C ref: artifact.c arti_cost() (2308-2317). Returns the price the hero
// paid for an artifact or unique item.
export function arti_cost(otmp, state = game) {
    if (!otmp.oartifact)
        return objectType(otmp.otyp, state).oc_cost;
    if (state.artilist[otmp.oartifact]?.cost)
        return state.artilist[otmp.oartifact].cost;
    return 100 * objectType(otmp.otyp, state).oc_cost;
}

// C ref: artifact.c abil_to_adtyp() (2319-2341). Maps a property index to
// the damage type that property's extrinsic confers. The C version compares
// pointer identity; this port compares the property index directly.
function abil_to_adtyp(propIdx) {
    switch (propIdx) {
    case FIRE_RES: return AD_FIRE;
    case COLD_RES: return AD_COLD;
    case SHOCK_RES: return AD_ELEC;
    case ANTIMAGIC: return AD_MAGM;
    case DISINT_RES: return AD_DISN;
    case POISON_RES: return AD_DRST;
    case DRAIN_RES: return AD_DRLI;
    default: return 0;
    }
}

// C ref: artifact.c abil_to_spfx() (2343-2370). Maps a property index to
// the SPFX flag that property's extrinsic confers.
function abil_to_spfx(propIdx) {
    switch (propIdx) {
    case SEARCHING: return SPFX_SEARCH;
    case HALLUC_RES: return SPFX_HALRES;
    case 30 /* TELEPAT */: return SPFX_ESP;
    case STEALTH: return SPFX_STLTH;
    case REGENERATION: return SPFX_REGEN;
    case TELEPORT_CONTROL: return SPFX_TCTRL;
    case WARN_OF_MON: return SPFX_WARN;
    case WARNING: return SPFX_WARN;
    case ENERGY_REGENERATION: return SPFX_EREGEN;
    case HALF_SPDAM: return SPFX_HSPDAM;
    case HALF_PHDAM: return SPFX_HPHDAM;
    case REFLECTING: return SPFX_REFLECT;
    default: return 0;
    }
}

// C ref: artifact.c what_gives() (2372-2424). Returns the first inventory
// item conveying a particular intrinsic identified by property index.
export function what_gives(propIdx, state = game) {
    const u = state.u;
    const dtyp = abil_to_adtyp(propIdx);
    const spfx = abil_to_spfx(propIdx);
    const wornmask = W_ARM | W_ARMC | W_ARMH | W_ARMS
        | W_ARMG | W_ARMF | W_ARMU
        | W_AMUL | W_RINGL | W_RINGR | W_TOOL
        | W_ART | W_ARTI
        | (u.twoweap ? W_SWAPWEP : 0);
    const abilValue = u.uprops?.[propIdx]?.extrinsic ?? 0;
    const wornbits = wornmask & abilValue;

    for (let obj = state.invent; obj; obj = obj.nobj) {
        if (obj.oartifact
            && (propIdx !== WARN_OF_MON
                || state.context?.warntype?.obj)) {
            const art = get_artifact(obj, state);
            if (art !== state.artilist[ART_NONARTIFACT]) {
                if (dtyp) {
                    if (art.cary?.adtyp === dtyp
                        || (art.defn?.adtyp === dtyp
                            && (obj.owornmask & ~(W_ART | W_ARTI))))
                        return obj;
                }
                if (spfx) {
                    if ((art.cspfx & spfx) === spfx)
                        return obj;
                    if ((art.spfx & spfx) === spfx && obj.owornmask)
                        return obj;
                }
                if (obj === u.uwep && propIdx === BLND_RES
                    && (abilValue & W_WEP) !== 0)
                    return obj;
            }
        } else {
            if (wornbits && wornbits === (wornmask & obj.owornmask))
                return obj;
        }
    }
    return null;
}

// C ref: artifact.c glow_color() (2426-2433).
export function glow_color(arti_indx, state = game) {
    const colornum = state.artilist[arti_indx]?.acolor ?? 0;
    const colorstr = clr2colorname(colornum);
    return hcolor(colorstr, state);
}

// Hallucination color table (shared with do_name.c hcolor).
const hcolors = Object.freeze([
    'ultraviolet', 'infrared', 'bluish-orange',
    'reddish-green', 'dark white', 'light black', 'sky blue-Loss',
    'pinkish-cyan', 'indigo-Loss', 'colorless',
    'white', 'black', 'hot pink', 'chartreuse', 'periwinkle',
    'mellow yellow', 'sarcoline', 'incarnadine', 'sinoper',
    'zinnober', 'smaragdine', 'woad', 'watchet',
    'keppel', 'feldgrau', 'glaucous', 'gamboge',
    'falun red', 'aureolin', 'celadon', 'erin', 'coquelicot',
    'nattier blue', 'mikado yellow', 'amaranth', 'viridian',
    'feldgrau', 'amaranth', 'zinnober', 'smaragdine',
    'coquelicot', 'glaucous', 'gamboge',
    'bistre', 'ecru', 'fulvous', 'tekhelet', 'selective yellow',
]);

// C ref: do_name.c hcolor() (1460-1466).
function hcolor(colorpref, state) {
    const halluc = (state.u?.uprops?.[HALLUC]?.intrinsic ?? 0) !== 0
        || (state.u?.uprops?.[HALLUC]?.extrinsic ?? 0) !== 0;
    return (halluc || !colorpref)
        ? hcolors[rn2_on_display_rng(hcolors.length)]
        : colorpref;
}

// C ref: artifact.c glow_verbs[] (2436-2438).
const glow_verbs = Object.freeze([
    'quiver', 'flicker', 'glimmer', 'gleam',
]);

// C ref: artifact.c glow_strength() (2441-2448).
export function glow_strength(count) {
    return (count > 12) ? 3 : (count > 4) ? 2 : (count > 0) ? 1 : 0;
}

// C ref: artifact.c glow_verb() (2450-2462).
export function glow_verb(count, ingsfx) {
    let verb = glow_verbs[glow_strength(count)];
    if (ingsfx) verb += 'ing';
    return verb;
}

// C ref: artifact.c Sting_effects() (2465-2502). Warning glow for Sting,
// Orcrist, and Grimtooth.
export async function Sting_effects(orc_count, state = game) {
    const uwep = state.u?.uwep;
    if (uwep
        && (uwep.oartifact === ART_STING
            || uwep.oartifact === ART_ORCRIST
            || uwep.oartifact === ART_GRIMTOOTH)) {
        const warn_cnt = state.warn_obj_cnt ?? 0;
        const oldstr = glow_strength(warn_cnt);
        const newstr = glow_strength(orc_count);

        const blind = (state.u.uprops?.[44]?.intrinsic ?? 0) !== 0
            || (state.u.uprops?.[44]?.extrinsic ?? 0) !== 0;

        if (orc_count === -1 && warn_cnt > 0) {
            await ttyPline(
                `${bare_artifactname(uwep, state)} is ${glow_verb(blind ? 0 : warn_cnt, true)}.`,
                state);
        } else if (newstr > 0 && newstr !== oldstr) {
            await maybe_lvltport_feedback(state);

            if (!blind)
                await ttyPline(
                    `${bare_artifactname(uwep, state)} ${otense(uwep, glow_verb(orc_count, false))} ${glow_color(uwep.oartifact, state)}${(newstr > oldstr) ? '!' : '.'}`,
                    state);
            else if (oldstr === 0)
                await ttyPline(
                    `${bare_artifactname(uwep, state)} ${otense(uwep, glow_verb(0, false))} slightly.`,
                    state);
        } else if (orc_count === 0 && warn_cnt > 0) {
            await ttyPline(
                `${bare_artifactname(uwep, state)} stops ${glow_verb(blind ? 0 : warn_cnt, true)}.`,
                state);
        }
    }
}

/** Port of artifact.c:permapoisoned(); currently only Grimtooth qualifies. */
export function permapoisoned(obj) {
    return Boolean(obj && obj.oartifact === ART_GRIMTOOTH);
}

/** Hook adapter for obj.js isPermanentlyPoisoned(). */
export function isPermanentlyPoisoned(obj) {
    return permapoisoned(obj);
}

// C ref: artifact.c retouch_object() (2508-2591). After a transformation
// (alignment change, lycanthropy, polymorph) that might affect item access,
// test whether the hero can still handle `obj`. Returns 1 if the hero can
// keep the object, 0 if not (item is unworn and possibly dropped). `loseit`
// controls whether the object is dropped when the hero can no longer touch it.
export async function retouch_object(objp, loseit, state = game) {
    let obj = objp.obj;

    /* allow hero in silver-hating form to try to perform invocation ritual */
    if (obj.otyp === BELL_OF_OPENING
        && invocation_pos(state) && !On_stairs(state.u.ux, state.u.uy, state)) {
        return 1;
    }

    if (await touch_artifact(obj, state.youmonst, state)) {
        let dmg = 0;
        const ag = (state.objects[obj.otyp].oc_material === SILVER
            && Hate_silver(state));
        // bane_applies only matters for artifacts; non-artifacts have no
        // artifact entry, so bane is always false for them.
        const bane = obj.oartifact
            ? artifactBaneApplies(
                get_artifact(obj, state), state.youmonst, true, state)
            : false;

        /* nothing else to do if hero can successfully handle this object */
        if (!ag && !bane) return 1;

        /* hero can't handle this object, but didn't get touch_artifact()'s
           "<obj> evades your grasp|control" message; give an alternate one */
        await ttyPline(
            `You can't handle ${yname(obj, state)}${obj.owornmask ? ' anymore' : ''}!`,
            state);
        /* also inflict damage unless touch_artifact() already did so */
        if (!touch_blasted) {
            let what = killer_xname(obj, state);

            if (ag && !obj.oartifact && !bane) {
                /* 'obj' is silver; for rings and wands it ended up that
                   way due to randomization at start of game; showing this
                   game's silver item without stating that it is silver
                   potentially leads to confusion about cause of death */
                if (obj.oclass === RING_CLASS)
                    what = 'a silver ring';
                else if (obj.oclass === WAND_CLASS)
                    what = 'a silver wand';
                /* for anything else, stick with killer_xname() */
            }
            /* damage is somewhat arbitrary; half the usual 1d20 physical
               for silver, 1d10 magical for <foo>bane, potentially both */
            if (ag) {
                const tmp = rnd(10);
                dmg += Maybe_Half_Phys(tmp, state);
            }
            if (bane)
                dmg += rnd(10);
            const buf = `handling ${what}`;
            await losehp(dmg, buf, KILLED_BY, state);
            await exercise(A_CON, false, state);
        }
    }

    /* removing a worn item might result in loss of levitation,
       dropping the hero onto a polymorph trap or into water or
       lava and potentially dropping or destroying the item */
    if (obj.owornmask) {
        remove_worn_item(obj, false, state);
        let found = false;
        for (let otmp = state.invent; otmp; otmp = otmp.nobj) {
            if (otmp === obj) { found = true; break; }
        }
        if (!found)
            objp.obj = obj = null;
    }

    /* if we still have it and caller wants us to drop it, do so now */
    if (loseit && obj) {
        if (Levitation(state)) {
            freeinv(obj, { state });
            note_unported('dothrow.c hitfloor');
        } else {
            /* dropx gives a message if a dropped item lands on an altar;
               we provide one for other terrain */
            if (!IS_ALTAR(state.level.at(state.u.ux, state.u.uy).typ))
                await ttyPline(
                    `${Tobjnam(obj, 'fall', state)} to the ${surface(state.u.ux, state.u.uy, state)}.`,
                    state);
            await dropx(obj, { state });
        }
        objp.obj = obj = null; /* no longer in inventory */
    }
    return 0;
}

// C ref: artifact.c invocation_pos() check used by retouch_object().
// hack.c invocation_pos() (982-985): Invocation_lev && x == inv_pos.x && y == inv_pos.y.
function invocation_pos(state) {
    return Invocation_lev(state.u.uz, state)
        && state.u.ux === state.inv_pos?.x
        && state.u.uy === state.inv_pos?.y;
}

// obj.h:337 Is_container(o): object type is between LARGE_BOX and BAG_OF_TRICKS.
function Is_container(obj) {
    return obj.otyp >= LARGE_BOX && obj.otyp <= BAG_OF_TRICKS;
}

// C ref: artifact.c untouchable() (2598-2637). Test one worn/wielded item or
// artifact for touchability after a form or alignment change. Returns true if
// the item failed the touch test.
async function untouchable(obj, drop_untouchable, state = game) {
    const wearmask = ~(W_QUIVER | (state.u.twoweap ? 0 : W_SWAPWEP) | W_BALL);

    const beingworn = obj
        && (((obj.owornmask & wearmask) !== 0)
            /* some items in use don't have any wornmask setting */
            || (obj.oclass === TOOL_CLASS
                && (obj.lamplit
                    || (obj.otyp === LEASH && obj.leashmon)
                    || (Is_container(obj) && Has_contents(obj)))));

    let carryeffect, invoked;
    if (obj.oartifact) {
        const art = get_artifact(obj, state);
        carryeffect = Boolean(art.cary?.adtyp || art.cspfx);
        invoked = (art.inv_prop > 0 && art.inv_prop <= LAST_PROP
            && ((state.u.uprops[art.inv_prop].extrinsic & W_ARTI) !== 0));
    } else {
        carryeffect = false;
        invoked = false;
    }

    if (beingworn || carryeffect || invoked) {
        const objp = { obj };
        if (!await retouch_object(objp, drop_untouchable, state)) {
            /* "<artifact> is beyond your control" or "you can't handle
               <object>" has been given and it is now unworn/unwielded
               and possibly dropped (depending upon caller); if dropped,
               carried effect was turned off, else we leave that alone;
               we turn off invocation property here if still carried */
            if (invoked && objp.obj)
                await arti_invoke(objp.obj, state); /* reverse #invoke */
            return true;
        }
    }
    return false;
}

// C ref: artifact.c count_surround_traps() (2708-2750). Count hidden traps
// in the 3x3 area around (x, y). Visible traps are excluded; door traps and
// trapped containers count. Used by mkot_trap_warn().
export function count_surround_traps(x, y, state = game) {
    let ret = 0;

    for (let dx = x - 1; dx < x + 2; ++dx) {
        for (let dy = y - 1; dy < y + 2; ++dy) {
            if (!isok(dx, dy)) continue;
            /* If a trap is shown here, don't count it; the hero
             * should be expecting it.  But if there is a trap here
             * that's not shown, either undiscovered or covered by
             * something, do count it. */
            const glyph = glyph_at(dx, dy, state);
            if (glyph_is_trap(glyph)) continue;
            if (t_at(dx, dy, state)) {
                ++ret;
                continue;
            }
            const levp = state.level.at(dx, dy);
            if (IS_DOOR(levp.typ) && (levp.doormask & D_TRAPPED) !== 0) {
                ++ret;
                continue;
            }
            for (let o = state.level.objects?.[dx]?.[dy]; o; o = o.nexthere) {
                if (Is_container(o) && o.otrapped) {
                    ++ret; /* we're counting locations, so just */
                    break; /* count the first one in a pile     */
                }
            }
        }
    }
    return ret;
}

// C ref: artifact.c mkot_trap_warn() (2753-2769). Sense adjacent traps
// when wielding the Master Key of Thievery without wearing gloves.
export async function mkot_trap_warn(state = game) {
    const heat = [
        'cool', 'slightly warm', 'warm', 'very warm',
        'hot', 'very hot', 'like fire',
    ];

    if (!state.uarmg && state.uwep
        && is_art(state.uwep, ART_MASTER_KEY_OF_THIEVERY)) {
        const ntraps = count_surround_traps(state.u.ux, state.u.uy, state);

        if (ntraps !== (state.mkot_trap_warn_count ?? 0)) {
            const idx = Math.min(ntraps, heat.length - 1);
            await ttyPline(
                `The Key feels ${heat[idx]}${(ntraps > 3) ? '!' : '.'}`,
                state);
        }
        state.mkot_trap_warn_count = ntraps;
    } else {
        state.mkot_trap_warn_count = 0;
    }
}

// C ref: artifact.c is_magic_key() (2774-2786). The Master Key of Thievery
// acts as a magic key when its bless/curse state meets role-dependent criteria:
// not cursed for rogues, blessed for non-rogues. `mon` is the wielder; null
// means non-rogue is assumed, and youmonst means check the hero's own role.
export function is_magic_key(mon, obj, state = game) {
    if (obj && obj.oartifact === ART_MASTER_KEY_OF_THIEVERY) {
        const isRogue = (mon === state.youmonst)
            ? (state.urole?.mnum === PM_ROGUE)
            : (mon && mon.data === state.mons?.[PM_ROGUE]);
        if (isRogue)
            return !obj.cursed; /* a rogue; non-cursed suffices for magic */
        /* not a rogue; key must be blessed to behave as a magic one */
        return Boolean(obj.blessed);
    }
    return false;
}

// C ref: artifact.c has_magic_key() (2790-2805). Figure out whether `mon`
// (usually the hero) is carrying the Master Key of Thievery in magic-key
// state. Returns the key object if found, null otherwise.
export function has_magic_key(mon, state = game) {
    const key = state.artilist[ART_MASTER_KEY_OF_THIEVERY].otyp;

    if (!mon) mon = state.youmonst;
    // C loop: for (o = invent; o; o = nxtobj(o, key, FALSE)). The first
    // iteration checks `o` which could be any object; subsequent iterations
    // walk from `o` via nxtobj which skips to the next skeleton key.
    for (let o = (mon === state.youmonst) ? state.invent : mon.minvent;
         o; o = nxtobj(o, key, false)) {
        if (is_magic_key(mon, o, state))
            return o;
    }
    return null;
}

// C ref: artifact.c is_art() (2808-2814). Simple check whether an object
// is a specific artifact.
export function is_art(obj, art) {
    if (obj && obj.oartifact === art) return true;
    return false;
}
