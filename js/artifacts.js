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
} from './const.js';
import { game } from './gstate.js';
import {
    M2_DEMON,
    M2_ELF,
    M2_GIANT,
    M2_ORC,
    M2_UNDEAD,
    M2_WERE,
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
    RUNESWORD,
    SILVER_MACE,
    SILVER_SABER,
    SKELETON_KEY,
    STRANGE_OBJECT,
    TSURUGI,
    WAR_HAMMER,
} from './objects.js';
import { aligns, races, roles } from './roles.js';
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

// defsym.h MONSYM indices; artifact mtype stores the monster class index.
const S_DRAGON = 30;
const S_OGRE = 41;
const S_TROLL = 46;

function roleMnum(filecode) {
    const role = roles.find((candidate) => candidate.filecode === filecode);
    if (!role) throw new Error(`missing pinned role ${filecode}`);
    return role.mnum;
}

function raceMnum(noun) {
    const race = races.find((candidate) => candidate.noun === noun);
    if (!race) throw new Error(`missing pinned race ${noun}`);
    return race.mnum;
}

const PM_ARCHEOLOGIST = roleMnum('Arc');
const PM_BARBARIAN = roleMnum('Bar');
const PM_CAVE_DWELLER = roleMnum('Cav');
const PM_HEALER = roleMnum('Hea');
const PM_KNIGHT = roleMnum('Kni');
const PM_MONK = roleMnum('Mon');
const PM_CLERIC = roleMnum('Pri');
const PM_ROGUE = roleMnum('Rog');
const PM_RANGER = roleMnum('Ran');
const PM_SAMURAI = roleMnum('Sam');
const PM_TOURIST = roleMnum('Tou');
const PM_VALKYRIE = roleMnum('Val');
const PM_WIZARD = roleMnum('Wiz');
const PM_ELF = raceMnum('elf');
const PM_ORC = raceMnum('orc');

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
