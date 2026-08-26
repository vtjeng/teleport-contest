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
    COLD_RES,
    CONFLICT,
    DISINT_RES,
    DRAIN_RES,
    ECMD_OK,
    ENERGY_REGENERATION,
    FIRE_RES,
    HALF_PHDAM,
    HALF_SPDAM,
    HALLUC,
    HALLUC_RES,
    INVIS,
    LAST_PROP,
    LEVITATION,
    NON_PM,
    POISON_RES,
    PROTECTION,
    REFLECTING,
    REGENERATION,
    SEARCHING,
    SHOCK_RES,
    STEALTH,
    TELEPAT,
    TELEPORT_CONTROL,
    ONAME_BONES,
    ONAME_GIFT,
    ONAME_KNOW_ARTI,
    ONAME_LEVEL_DEF,
    ONAME_NO_FLAGS,
    ONAME_RANDOM,
    ONAME_VIA_DIP,
    ONAME_VIA_NAMING,
    ONAME_WISH,
    Upolyd,
    W_ARM,
    W_ART,
    W_WEP,
    ismnum,
} from './const.js';
import { game } from './gstate.js';
import {
    M2_DEMON,
    M2_ELF,
    M2_GIANT,
    M2_ORC,
    M2_UNDEAD,
    M2_WERE,
    M3_COVETOUS,
    PM_ARCHEOLOGIST,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
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
    S_DRAGON,
    S_OGRE,
    S_TROLL,
} from './monsters.js';
import {
    AMULET_OF_ESP,
    ATHAME,
    BATTLE_AXE,
    BOW,
    BROADSWORD,
    CREDIT_CARD,
    CRYSTAL_BALL,
    ELVEN_BROADSWORD,
    ELVEN_DAGGER,
    GOLD_DRAGON_SCALES,
    GOLD_DRAGON_SCALE_MAIL,
    HELM_OF_BRILLIANCE,
    KATANA,
    LENSES,
    LONG_SWORD,
    LUCKSTONE,
    MACE,
    MIRROR,
    MORNING_STAR,
    ORCISH_DAGGER,
    QUARTERSTAFF,
    RIN_INCREASE_DAMAGE,
    RUNESWORD,
    SILVER,
    SILVER_MACE,
    SILVER_SABER,
    SKELETON_KEY,
    STRANGE_OBJECT,
    TSURUGI,
    WAR_HAMMER,
} from './objects.js';

import { fuzzymatch, lcase } from './hacklib.js';
import { aligns } from './roles.js';
import { rn2 } from './rng.js';
import { CLR_BRIGHT_BLUE, CLR_RED, NO_COLOR } from './terminal.js';

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
const AD_DISN = 5;
const AD_ELEC = 6;
const AD_DRST = 7;
const AD_BLND = 11;
const AD_STUN = 12;
const AD_DRLI = 15;
const AD_WERE = 29;

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

// C refs: artifact.c found_artifact() and find_artifact(). The browser port
// has no livelog sink; the persisted artiexist[].found bit is the gameplay
// state consumed by later naming and disclosure.
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

// C ref: artifact.c disp_artifact_discoveries(). Returns how many artifacts
// the hero has discovered, writing one line for each into the text window
// dodiscovered() supplies. discover_artifact() is the only writer of
// artidisco[] and is not ported, so this loop always exits on the first empty
// slot and writes nothing; that is why it takes no window. Naming an entry
// needs artiname(), align_str(), and simple_typename(), none of them ported.
export function disp_artifact_discoveries(state = game) {
    let i = 0;
    for (; i < NROFARTIFACTS; i++) {
        if (state.artidisco[i] === 0)
            break;
        throw new UnsupportedArtifactDisplayError('artiname()');
    }
    return i;
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

// C ref: artifact.c bane_applies()/spec_applies(). touch_artifact() only asks
// this about SPFX_DBONUS category artifacts, so none of the attack-resistance
// cases (including their random magic-resistance check) can execute here.
// `yours` is spec_applies()'s own boolean, which two of the five categories
// read; it is passed in rather than recomputed so both callers agree on it.
function artifactBaneApplies(artifact, monster, yours, state) {
    if (!(artifact.spfx & SPFX_DBONUS)) return false;
    const species = monster.data ?? {};
    if (artifact.spfx & SPFX_DMONS)
        return species.pmidx === artifact.mtype;
    if (artifact.spfx & SPFX_DCLAS)
        return species.mlet === artifact.mtype;
    if (artifact.spfx & SPFX_DFLAG1)
        return Boolean((species.mflags1 ?? 0) & artifact.mtype);
    if (artifact.spfx & SPFX_DFLAG2) {
        // The hero's own race counts as well as the form she is wearing, and
        // a lycanthrope answers to M2_WERE whatever shape she is in.
        return Boolean((species.mflags2 ?? 0) & artifact.mtype)
            || Boolean(yours
                && ((!Upolyd(state.u)
                     && ((state.urace?.selfmask ?? 0) & artifact.mtype))
                    || ((artifact.mtype & M2_WERE)
                        && ismnum(state.u.ulycn))));
    }
    if (artifact.spfx & SPFX_DALIGN) {
        if (yours) return state.u.ualign.type !== artifact.alignment;
        const alignment = monsterAlignment(monster);
        return alignment === A_NONE || alignment !== artifact.alignment;
    }
    return false;
}

// C ref: artifact.c touch_artifact(). C's `touch_blasted` is set here and read
// only by retouch_object(), which is unported; the blast that sets it is
// refused below, so the flag would never leave its initial FALSE and no field
// carries it.
//
// Two arms stop this port, both of them a hero's, and they differ in what the
// stop costs. The self-willed route and the evade arm reach their stop before
// any draw. The badalign-only route does not: its guard is
// `badalign && (!yours || !rn2(4))`, so artifact.c:945's rn2(4) is spent
// inside the branch condition and necessarily precedes the throw. C spends it
// too, so that refusal leaves the random-number log matching C rather than
// untouched -- which is the property that matters, and is not the same as
// leaving the game where it found it. The detailed statement is at the guard
// itself; do not restate a stronger claim here.
export function touch_artifact(obj, monster, env = game) {
    const state = artifactTables(env);
    const index = Math.trunc(obj?.oartifact ?? ART_NONARTIFACT);
    if (index === ART_NONARTIFACT) return true;
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

    // C's `!yours` short-circuits before the rn2(4) for a monster, so only a
    // hero out of step with the artifact spends a draw here -- and she spends
    // it whether or not the blast follows.
    if (((badclass || badalign) && selfWilled)
        || (badalign && (!yours || !randomFromEnv(env)(4)))) {
        if (!yours) return false;
        // artifact.c:951-959 prints "You are blasted by <artifact>'s power!",
        // rolls d(Antimagic ? 2 : 4, self_willed ? 10 : 4) plus a silver
        // bonus, and spends it through losehp() and exercise().
        throw new UnsupportedArtifactDisplayError('an artifact blast');
    }

    /* can pick it up unless you're totally non-synch'd with the artifact */
    if (badclass && badalign && selfWilled) {
        if (yours) {
            // artifact.c:965-968 prints "<Artifact> evades your grasp!" or
            // "<Artifact> are beyond your control!" through Tobjnam().
            throw new UnsupportedArtifactDisplayError('an artifact that evades');
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
        extrinsicMaskToggle(normalized, BLINDED, wp_mask, on);
    }
}

function extrinsicMaskToggle(state, property, wp_mask, on) {
    const prop = state.u.uprops[property];
    if (on)
        prop.extrinsic |= wp_mask;
    else
        prop.extrinsic &= ~wp_mask;
}

// Backward-compatible alias: the carried (W_ART, on=true) path only sets.
function extrinsicMask(state, property, wp_mask) {
    extrinsicMaskToggle(state, property, wp_mask, true);
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

/** Port of artifact.c:permapoisoned(); currently only Grimtooth qualifies. */
export function permapoisoned(obj) {
    return Boolean(obj && obj.oartifact === ART_GRIMTOOTH);
}

/** Hook adapter for obj.js isPermanentlyPoisoned(). */
export function isPermanentlyPoisoned(obj) {
    return permapoisoned(obj);
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
