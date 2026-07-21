// artifacts.js -- artifact table and new-game artifact initialization.
// C refs: include/artifact.h, include/artilist.h, src/artifact.c
//          init_artifacts() and hack_artifacts().

import {
    A_NONE,
    A_CHAOTIC,
    A_LAWFUL,
    A_NEUTRAL,
    CONFLICT,
    INVIS,
    LAST_PROP,
    LEVITATION,
    NON_PM,
    ONAME_BONES,
    ONAME_GIFT,
    ONAME_KNOW_ARTI,
    ONAME_LEVEL_DEF,
    ONAME_NO_FLAGS,
    ONAME_RANDOM,
    ONAME_VIA_DIP,
    ONAME_VIA_NAMING,
    ONAME_WISH,
} from './const.js';
import { game } from './gstate.js';
import {
    M2_DEMON,
    M2_ELF,
    M2_GIANT,
    M2_ORC,
    M2_UNDEAD,
    M2_WERE,
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
    SILVER_MACE,
    SILVER_SABER,
    SKELETON_KEY,
    STRANGE_OBJECT,
    TSURUGI,
    WAR_HAMMER,
} from './objects.js';
import { aligns } from './roles.js';
import { rn2 } from './rng.js';
import { CLR_BRIGHT_BLUE, CLR_RED, NO_COLOR } from './terminal.js';

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

/** Port of artifact.c:permapoisoned(); currently only Grimtooth qualifies. */
export function permapoisoned(obj) {
    return Boolean(obj && obj.oartifact === ART_GRIMTOOTH);
}

/** Hook adapter for obj.js isPermanentlyPoisoned(). */
export function isPermanentlyPoisoned(obj) {
    return permapoisoned(obj);
}
