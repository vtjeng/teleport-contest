// Initial-level monster creation for ordinary rooms, themed-room fills,
// starting pets, and the temporary monsters used by Statuary.
// C ref: makemon.c makemon(), m_initthrow(), m_initweap(), m_initinv(), and
// mongets(); worn.c m_dowear(). The implementation fails closed outside the
// currently ported species and call shapes. Expanding that closed set means
// porting the corresponding complete source branches, not approximating their
// PRNG effects.

import {
    ACCESSIBLE,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    BLCORNER,
    COLNO,
    CROSSWALL,
    DOOR,
    G_GENOD,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    HWALL,
    I_SPECIAL,
    IS_LAVA,
    IS_POOL,
    isok,
    is_pit,
    LS_MONSTER,
    MFAST,
    MM_ANGRY,
    MM_ASLEEP,
    MM_EDOG,
    MM_FEMALE,
    MM_MALE,
    MM_NOCOUNTBIRTH,
    MM_NOGRP,
    MM_NOMSG,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_SEEN_NOTHING,
    MON_DETACH,
    NO_MINVENT,
    ONAME,
    ONAME_NO_FLAGS,
    OBJ_FLOOR,
    OBJ_MINVENT,
    OROOM,
    ROOMOFFSET,
    ROWNO,
    SCORR,
    SDOOR,
    SEE_INVIS,
    TDWALL,
    TLCORNER,
    TRWALL,
    TUWALL,
    THEMEROOM,
    W_AMUL,
    W_ARM,
    W_ARMC,
    W_ARMF,
    W_ARMG,
    W_ARMH,
    W_ARMS,
    W_ARMU,
    W_SADDLE,
    IS_WALL,
} from './const.js';
import { artifact_exists } from './artifacts.js';
import {
    can_saddle,
    newedog,
    put_saddle_on_mon,
} from './dog.js';
import { christen_monst, rndghostname } from './do_name.js';
import { level_difficulty, on_level } from './dungeon.js';
import { game } from './gstate.js';
import {
    add_to_minv,
    obfree,
    obj_extract_self,
    update_inventory,
} from './invent.js';
import { del_light_source, new_light_source } from './light.js';
import {
    newmonhp,
    peace_minded,
    propagate,
    rndmonnum,
    rndmonst,
    set_malign,
} from './makemon.js';
import {
    can_be_hatched,
    is_female,
    is_male,
    is_neuter,
} from './mondata.js';
import {
    m_at,
    newMonster,
    place_monster,
    remove_monster,
} from './monst.js';
import {
    AT_WEAP,
    G_FREQ,
    G_HELL,
    G_NOCORPSE,
    G_NOGEN,
    G_UNIQ,
    M1_AMORPHOUS,
    M1_ANIMAL,
    M1_HUMANOID,
    M1_MINDLESS,
    M1_NOHANDS,
    M1_UNSOLID,
    M2_DWARF,
    M2_DOMESTIC,
    M2_ELF,
    M2_GREEDY,
    M2_NASTY,
    M2_UNDEAD,
    M2_WERE,
    MZ_MEDIUM,
    MZ_SMALL,
    NON_PM,
    PM_ARCHEOLOGIST,
    PM_BLACK_LIGHT,
    PM_BLACK_UNICORN,
    PM_CAVE_SPIDER,
    PM_CENTIPEDE,
    PM_CHAMELEON,
    PM_CHICKATRICE,
    PM_COCKATRICE,
    PM_ELF,
    PM_FOG_CLOUD,
    PM_FOX,
    PM_GARTER_SNAKE,
    PM_GHOST,
    PM_GIANT_MIMIC,
    PM_GIANT_SPIDER,
    PM_GOBLIN,
    PM_GRAY_UNICORN,
    PM_GRID_BUG,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_KITTEN,
    PM_LARGE_MIMIC,
    PM_LICHEN,
    PM_LITTLE_DOG,
    PM_MANES,
    PM_MORDOR_ORC,
    PM_SMALL_MIMIC,
    PM_NEWT,
    PM_ORC_CAPTAIN,
    PM_ORC_SHAMAN,
    PM_PONY,
    PM_SEWER_RAT,
    PM_SKELETON,
    PM_SNAKE,
    PM_URUK_HAI,
    PM_WHITE_UNICORN,
    PM_WOOD_NYMPH,
    PM_WIZARD,
    PM_YELLOW_LIGHT,
    SPECIAL_PM,
    S_CENTAUR,
    S_EYE,
    S_GHOST,
    S_GNOME,
    S_GOLEM,
    S_HUMAN,
    S_HUMANOID,
    S_KOBOLD,
    S_KOP,
    S_LEPRECHAUN,
    S_LIGHT,
    S_MIMIC,
    S_MIMIC_DEF,
    S_MUMMY,
    S_NYMPH,
    S_OGRE,
    S_ORC,
    S_SNAKE,
    S_SPIDER,
    S_UNICORN,
    S_VORTEX,
} from './monsters.js';
import { mkobj, mkobj_at, mksobj, next_ident, weight } from './obj.js';
import {
    AKLYS,
    AMULET_CLASS,
    AMULET_OF_GUARDING,
    AMULET_OF_LIFE_SAVING,
    AMULET_OF_REFLECTION,
    ARM_BOOTS,
    ARM_CLOAK,
    ARM_GLOVES,
    ARM_HELM,
    ARM_SHIELD,
    ARM_SHIRT,
    ARM_SUIT,
    ARMOR_CLASS,
    ARROW,
    AXE,
    BATTLE_AXE,
    BOW,
    CLUB,
    COIN_CLASS,
    CORPSE,
    CROSSBOW,
    CROSSBOW_BOLT,
    DAGGER,
    DART,
    DUNCE_CAP,
    DWARVISH_CLOAK,
    DWARVISH_IRON_HELM,
    DWARVISH_MATTOCK,
    DWARVISH_MITHRIL_COAT,
    DWARVISH_ROUNDSHIELD,
    DWARVISH_SHORT_SWORD,
    DWARVISH_SPEAR,
    EGG,
    ELVEN_ARROW,
    ELVEN_BOOTS,
    ELVEN_BOW,
    ELVEN_BROADSWORD,
    ELVEN_CLOAK,
    ELVEN_DAGGER,
    ELVEN_LEATHER_HELM,
    ELVEN_MITHRIL_COAT,
    ELVEN_SHIELD,
    ELVEN_SHORT_SWORD,
    ELVEN_SPEAR,
    FIGURINE,
    FOOD_CLASS,
    GEM_CLASS,
    GOLD_PIECE,
    GLASS,
    HELM_OF_OPPOSITE_ALIGNMENT,
    IRON_SHOES,
    IRON,
    KNIFE,
    LEATHER,
    LONG_SWORD,
    LUCERN_HAMMER,
    MAXOCLASSES,
    MIRROR,
    MUMMY_WRAPPING,
    MITHRIL,
    ORCISH_ARROW,
    ORCISH_BOW,
    ORCISH_CHAIN_MAIL,
    ORCISH_CLOAK,
    ORCISH_DAGGER,
    ORCISH_HELM,
    ORCISH_SHIELD,
    ORCISH_SHORT_SWORD,
    PICK_AXE,
    POT_ACID,
    POT_BLINDNESS,
    POT_CONFUSION,
    POT_EXTRA_HEALING,
    POT_FULL_HEALING,
    POT_GAIN_LEVEL,
    POT_HEALING,
    POT_INVISIBILITY,
    POT_OBJECT_DETECTION,
    POT_PARALYSIS,
    POT_POLYMORPH,
    POT_SLEEPING,
    POT_SPEED,
    POTION_CLASS,
    RANDOM_CLASS,
    RING_CLASS,
    ROCK_CLASS,
    SCIMITAR,
    SCR_CREATE_MONSTER,
    SCR_EARTH,
    SCR_TELEPORTATION,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPBOOK_CLASS,
    SPEED_BOOTS,
    STATUE,
    STRANGE_OBJECT,
    TALLOW_CANDLE,
    TIN,
    TOOL_CLASS,
    TWO_HANDED_SWORD,
    URUK_HAI_SHIELD,
    WAN_COLD,
    WAN_CREATE_MONSTER,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_FIRE,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WAN_MAKE_INVISIBLE,
    WAN_POLYMORPH,
    WAN_SLEEP,
    WAN_SPEED_MONSTER,
    WAN_STRIKING,
    WAN_TELEPORTATION,
    WAND_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
} from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { enexto_core, goodpos } from './teleport.js';
import {
    S_altar,
    S_dnstair,
    S_grave,
    S_hcdoor,
    S_hwall,
    S_sink,
    S_throne,
    S_upstair,
    S_vcdoor,
    S_vwall,
} from './symbols.js';
import { begin_burn } from './timeout.js';
import { t_at } from './trap.js';

const SUPPORTED_FLAGS = NO_MINVENT
    | MM_NOCOUNTBIRTH
    | MM_NOMSG
    | MM_ANGRY
    | MM_ASLEEP
    | MM_EDOG
    | MM_NOGRP
    | MM_MALE
    | MM_FEMALE;
const INITIAL_LEVEL_MONSTERS = new Set([
    PM_JACKAL,
    PM_FOX,
    PM_KOBOLD,
    PM_GOBLIN,
    PM_SEWER_RAT,
    PM_GRID_BUG,
    PM_LICHEN,
    PM_KOBOLD_ZOMBIE,
    PM_NEWT,
    PM_FOG_CLOUD,
    PM_WOOD_NYMPH,
    PM_GHOST,
    PM_SMALL_MIMIC,
    PM_LARGE_MIMIC,
    PM_GIANT_MIMIC,
    PM_LITTLE_DOG,
    PM_KITTEN,
    PM_PONY,
    PM_CAVE_SPIDER,
    PM_CENTIPEDE,
    PM_GIANT_SPIDER,
    PM_GARTER_SNAKE,
    PM_SNAKE,
    PM_WHITE_UNICORN,
    PM_GRAY_UNICORN,
    PM_BLACK_UNICORN,
    PM_YELLOW_LIGHT,
    PM_BLACK_LIGHT,
]);

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);

// include/monattk.h predicate used by muse.c's random-item selectors.
const AT_EXPL = 13;
// include/monflag.h creation-time predicates not yet exported by monsters.js.
const M1_WALLWALK = 0x00000008;
const M1_CONCEAL = 0x00000080;
const M1_SLITHY = 0x00080000;
const M2_LORD = 0x00000400;
const M2_PRINCE = 0x00000800;
const M2_STRONG = 0x04000000;
const M2_JEWELS = 0x20000000;
const MR_STONE = 0x80;
const MZ_LARGE = 3;
const MZ_HUGE = 4;

// makemon.c set_mimic_sym() source tables. The first two entries deliberately
// make furniture twice as likely as each ordinary object class.
const MIMIC_SYMBOLS = Object.freeze([
    MAXOCLASSES, MAXOCLASSES, RING_CLASS, WAND_CLASS, WEAPON_CLASS,
    FOOD_CLASS, COIN_CLASS, SCROLL_CLASS, POTION_CLASS, ARMOR_CLASS,
    AMULET_CLASS, TOOL_CLASS, ROCK_CLASS, GEM_CLASS, SPBOOK_CLASS,
    S_MIMIC_DEF, S_MIMIC_DEF,
]);
const MIMIC_FURNITURE = Object.freeze([
    S_upstair, S_upstair, S_dnstair, S_dnstair,
    S_altar, S_grave, S_throne, S_sink,
]);

export class UnsupportedMonsterCreationError extends Error {
    constructor(operation) {
        super(`unsupported initial-level monster creation: ${operation}`);
        this.name = 'UnsupportedMonsterCreationError';
        this.operation = operation;
    }
}

function creationEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { d, rn1, rn2, rnd, rne, rnz };
    const required = ['d', 'rn1', 'rn2', 'rnd', 'rne'];
    if (!required.every((name) => typeof random[name] === 'function')) {
        throw new TypeError(
            `monster creation random injection requires ${required.join(', ')}`,
        );
    }
    return { ...env, state, random };
}

function isRogueLevel(state) {
    return on_level(state.u?.uz, state.rogue_level);
}

// C ref: u_init.c's zeroed hero starts in dungeon zero and assigns level one;
// mklev.c uses that same coordinate pair for the first dungeon level.
function isInitialDungeonLevel(state) {
    return state.u?.uz?.dnum === 0 && state.u.uz.dlevel === 1;
}

function isArmed(species) {
    return species.mattk.some((attack) => attack.aatyp === AT_WEAP);
}

function setMimicCorpsenm(monster, value) {
    monster.mextra ??= {};
    monster.mextra.mcorpsenm = value;
}

function emitsLight(species) {
    return species?.mlet === S_LIGHT ? 1 : 0;
}

function canHideUnderObject(obj) {
    if (!obj || obj.where !== OBJ_FLOOR) return false;
    if (obj.oclass !== COIN_CLASS) return true;
    let quantity = 0;
    let current = obj;
    while (current?.oclass === COIN_CLASS) {
        quantity += current.quan;
        if (quantity >= 10) return true;
        current = current.nexthere;
    }
    return Boolean(current);
}

// C ref: mon.c hideunder(), restricted to the object-concealing spiders and
// snakes reachable from the Statuary D:1 reservoir.
function hideunder(monster, state) {
    const { mx: x, my: y } = monster;
    let hidden = false;
    const trap = t_at(x, y, state);
    if (monster !== state.u?.ustuck
        && !monster.mtrapped
        && (!trap || is_pit(trap.ttyp))
        && (monster.data.mflags1 & M1_CONCEAL)
        && !IS_POOL(state.level.at(x, y).typ)
        && !IS_LAVA(state.level.at(x, y).typ)) {
        let obj = state.level.objects[x][y];
        if (canHideUnderObject(obj)) {
            if (!(monster.data.mresists & MR_STONE)) {
                while (obj?.otyp === CORPSE
                    && (obj.corpsenm === PM_COCKATRICE
                        || obj.corpsenm === PM_CHICKATRICE)) {
                    obj = obj.nexthere;
                }
            }
            hidden = Boolean(obj);
        }
    }
    monster.mundetected = hidden;
    return hidden;
}

// C ref: makemon.c set_mimic_sym(), for ordinary and themed initial rooms.
// The descriptor which requested the Storeroom mimic overwrites m_ap_type and
// mappearance only. All RNG, temporary-object allocation, fruit state, and any
// mcorpsenm overlay established here remain intact.
function set_mimic_sym(monster, normalized) {
    const { random, state } = normalized;
    const x = monster.mx;
    const y = monster.my;
    const object = state.level.objects?.[x]?.[y];
    let appearance;
    let appearanceType;

    const location = state.level.at(x, y);
    if (object) {
        appearanceType = M_AP_OBJECT;
        appearance = object.otyp;
    } else if (location.typ === DOOR || IS_WALL(location.typ)
               || location.typ === SDOOR || location.typ === SCORR) {
        appearanceType = M_AP_FURNITURE;
        const leftType = state.level.at(x - 1, y)?.typ;
        const horizontal = x !== 0 && [
            HWALL,
            TLCORNER,
            TRWALL,
            BLCORNER,
            TDWALL,
            CROSSWALL,
            TUWALL,
        ].includes(leftType);
        appearance = isRogueLevel(state)
            ? horizontal ? S_hwall : S_vwall
            : horizontal ? S_hcdoor : S_vcdoor;
    } else {
        const roomIndex = (state.level.at(x, y)?.roomno ?? 0) - ROOMOFFSET;
        const roomType = roomIndex >= 0
            ? state.level.rooms?.[roomIndex]?.rtype ?? 0
            : null;
        if (roomType !== OROOM && roomType !== THEMEROOM) {
            throw new UnsupportedMonsterCreationError(
                `mimic room type ${roomType ?? 'none'}`,
            );
        }

        const symbol = MIMIC_SYMBOLS[random.rn2(MIMIC_SYMBOLS.length)];
        if (symbol === MAXOCLASSES) {
            appearanceType = M_AP_FURNITURE;
            appearance = MIMIC_FURNITURE[
                random.rn2(MIMIC_FURNITURE.length)
            ];
        } else {
            appearanceType = M_AP_OBJECT;
            if (symbol === S_MIMIC_DEF) {
                appearance = STRANGE_OBJECT;
            } else if (symbol === COIN_CLASS) {
                appearance = GOLD_PIECE;
            } else {
                const temporary = mkobj(symbol, false, normalized);
                appearance = temporary.otyp;
                obfree(temporary, null, normalized);
            }
        }
    }

    monster.m_ap_type = appearanceType;
    monster.mappearance = appearance;
    if (appearanceType === M_AP_OBJECT
        && (appearance === STATUE || appearance === FIGURINE
            || appearance === CORPSE || appearance === EGG
            || appearance === TIN)) {
        let species = rndmonnum(normalized);
        const noCorpse = Boolean(
            state.mvitals[species]?.mvflags & G_NOCORPSE,
        );
        if (appearance === CORPSE && noCorpse) {
            species = random.rn1(
                PM_WIZARD - PM_ARCHEOLOGIST + 1,
                PM_ARCHEOLOGIST,
            );
        } else if ((appearance === EGG
                    && can_be_hatched(species, normalized) === NON_PM)
                   || (appearance === TIN && noCorpse)) {
            species = NON_PM;
        }
        setMimicCorpsenm(monster, species);
    } else if (appearanceType === M_AP_OBJECT
               && appearance === SLIME_MOLD) {
        setMimicCorpsenm(monster, state.context.current_fruit);
        state.flags.made_fruit = true;
    } else if (appearanceType === M_AP_FURNITURE
               && appearance === S_altar) {
        const alignment = random.rn2(3) - 1;
        setMimicCorpsenm(
            monster,
            alignment < 0 ? AM_CHAOTIC
                : alignment > 0 ? AM_LAWFUL : AM_NEUTRAL,
        );
    } else if (monster.mextra && 'mcorpsenm' in monster.mextra) {
        monster.mextra.mcorpsenm = NON_PM;
    }
}

function isStatuaryReservoirSpecies(species) {
    return species.pmidx >= 0
        && species.pmidx < SPECIAL_PM
        && species.pmidx !== PM_CHAMELEON
        && species.difficulty >= 3
        && species.difficulty <= 7
        && Boolean(species.geno & G_FREQ)
        && !(species.geno & (G_NOGEN | G_UNIQ | G_HELL));
}

function assertSupportedSpecies(species) {
    if (!species
        || (!INITIAL_LEVEL_MONSTERS.has(species.pmidx)
            && !isStatuaryReservoirSpecies(species))) {
        throw new UnsupportedMonsterCreationError(
            `monster ${species?.pmidx ?? 'null'}`,
        );
    }
}

function preflightCreation(ptr, x, y, mmflags, normalized) {
    const { state } = normalized;
    const randomCoordinates = x === 0 && y === 0;
    if (!Number.isInteger(mmflags) || mmflags < 0)
        throw new TypeError('makemon flags must be a nonnegative integer');
    if (mmflags & ~SUPPORTED_FLAGS) {
        throw new UnsupportedMonsterCreationError(
            `mmflags 0x${(mmflags & ~SUPPORTED_FLAGS).toString(16)}`,
        );
    }
    if (!isInitialDungeonLevel(state)) {
        throw new UnsupportedMonsterCreationError(
            'outside initial dungeon level',
        );
    }
    if (randomCoordinates && !state.in_mklev) {
        throw new UnsupportedMonsterCreationError(
            'random coordinates outside mklev',
        );
    }
    const startingPetCall = !state.in_mklev
        && Boolean(ptr)
        && STARTING_PETS.has(ptr.pmidx)
        && x === state.u?.ux
        && y === state.u?.uy
        && mmflags === (MM_EDOG | NO_MINVENT);
    if (!state.in_mklev && !startingPetCall)
        throw new UnsupportedMonsterCreationError('outside mklev');
    if (state.in_mklev && (mmflags & MM_EDOG)) {
        throw new UnsupportedMonsterCreationError(
            'edog creation during mklev',
        );
    }
    if (!startingPetCall && !randomCoordinates
        && (!isok(x, y) || !ACCESSIBLE(state.level?.at(x, y)?.typ))) {
        throw new UnsupportedMonsterCreationError(
            `non-accessible location <${x},${y}>`,
        );
    }
    if (!ptr && !(mmflags & MM_NOGRP))
        throw new UnsupportedMonsterCreationError('random monster groups');
    if (!Array.isArray(state.mons) || !Array.isArray(state.mvitals))
        throw new Error('makemon requires initialized monster globals');
    if (!state.context || !Number.isInteger(state.context.ident)
        || state.context.ident <= 0
        || state.context.ident > 0xffff_ffff) {
        throw new Error('makemon requires initialized context.ident');
    }
    if (!state.u?.ualign || !state.urace)
        throw new Error('makemon requires initialized hero alignment and race');
    if (!(mmflags & NO_MINVENT)
        && (state.migrating_objs || state.gm?.migrating_objs)) {
        throw new UnsupportedMonsterCreationError('migrating object delivery');
    }
    if (ptr) {
        assertSupportedSpecies(ptr);
        if (state.mons[ptr.pmidx] !== ptr) {
            throw new UnsupportedMonsterCreationError(
                'monster record outside the mutable catalog',
            );
        }
    }
}

// C ref: makemon.c makemon_rnd_goodpos(). The initial-level loader skips the
// source's visibility pass and stair fallback, so after 50 sampled pairs it
// performs one x-major scan from the last sampled offsets.
function makemon_rnd_goodpos(ptr, gpflags, normalized) {
    const { random } = normalized;
    const fakemon = ptr ? newMonster({ data: ptr }) : null;
    let nx;
    let ny;
    let good;
    let tryct = 0;

    do {
        nx = random.rn1(COLNO - 3, 2);
        ny = random.rn2(ROWNO);
        good = goodpos(nx, ny, fakemon, gpflags | GP_AVOID_MONPOS, normalized);
    } while (++tryct < 50 && !good);

    if (good) return { x: nx, y: ny };

    const xofs = nx;
    const yofs = ny;
    for (let dx = 0; dx < COLNO; ++dx) {
        for (let dy = 0; dy < ROWNO; ++dy) {
            nx = ((dx + xofs) % (COLNO - 1)) + 1;
            ny = ((dy + yofs) % (ROWNO - 1)) + 1;
            if (goodpos(
                nx,
                ny,
                fakemon,
                gpflags | GP_AVOID_MONPOS,
                normalized,
            )) {
                return { x: nx, y: ny };
            }
        }
    }
    return null;
}

function addFreshMonsterObject(monster, obj, normalized) {
    const merged = add_to_minv(monster, obj, normalized);
    if (merged) {
        throw new UnsupportedMonsterCreationError(
            'new monster inventory object merged unexpectedly',
        );
    }
    return obj;
}

function monsterWears(monster, mask) {
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.owornmask & mask) return obj;
    }
    return null;
}

// C ref: makemon.c mongets(). No reachable species is a demon, lawful minion,
// or player monster. Gnome rulers do use the source prince-quality floor.
function mongets(monster, otyp, normalized) {
    if (!otyp) return null;
    assertSupportedSpecies(monster.data);
    const obj = mksobj(otyp, true, false, normalized);
    if (monster.data.mflags2 & M2_PRINCE) {
        if (obj.oclass === WEAPON_CLASS && obj.spe < 1) obj.spe = 1;
        else if (obj.oclass === ARMOR_CLASS && obj.spe < 0) obj.spe = 0;
    }
    return addFreshMonsterObject(monster, obj, normalized);
}

// C ref: makemon.c m_initthrow().
function m_initthrow(monster, otyp, quantityRange, normalized) {
    const obj = mksobj(otyp, true, false, normalized);
    obj.quan = normalized.random.rn1(quantityRange, 3);
    obj.owt = weight(obj, normalized);
    if (otyp === ORCISH_ARROW) obj.opoisoned = true;
    return addFreshMonsterObject(monster, obj, normalized);
}

// C ref: makemon.c m_initweap().
function m_initweap(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    assertSupportedSpecies(ptr);
    if (isRogueLevel(state)) return;
    if (!isArmed(ptr)) {
        throw new UnsupportedMonsterCreationError(
            `m_initweap for unarmed monster ${ptr.pmidx}`,
        );
    }

    switch (ptr.mlet) {
    case S_HUMAN:
        if (ptr.mflags2 & M2_ELF) {
            if (random.rn2(2)) {
                mongets(
                    monster,
                    random.rn2(2) ? ELVEN_MITHRIL_COAT : ELVEN_CLOAK,
                    normalized,
                );
            }
            if (random.rn2(2)) {
                mongets(monster, ELVEN_LEATHER_HELM, normalized);
            } else if (!random.rn2(4)) {
                mongets(monster, ELVEN_BOOTS, normalized);
            }
            if (random.rn2(2)) mongets(monster, ELVEN_DAGGER, normalized);
            switch (random.rn2(3)) {
            case 0:
                if (!random.rn2(4))
                    mongets(monster, ELVEN_SHIELD, normalized);
                if (random.rn2(3))
                    mongets(monster, ELVEN_SHORT_SWORD, normalized);
                mongets(monster, ELVEN_BOW, normalized);
                m_initthrow(monster, ELVEN_ARROW, 12, normalized);
                break;
            case 1:
                mongets(monster, ELVEN_BROADSWORD, normalized);
                if (random.rn2(2))
                    mongets(monster, ELVEN_SHIELD, normalized);
                break;
            case 2:
                if (random.rn2(2)) {
                    mongets(monster, ELVEN_SPEAR, normalized);
                    mongets(monster, ELVEN_SHIELD, normalized);
                }
                break;
            }
        } else if (!(ptr.mflags2 & M2_WERE)) {
            throw new UnsupportedMonsterCreationError(
                `human weapon branch ${ptr.pmidx}`,
            );
        }
        break;
    case S_HUMANOID:
        if (ptr.mflags2 & M2_DWARF) {
            if (random.rn2(7))
                mongets(monster, DWARVISH_CLOAK, normalized);
            if (random.rn2(7)) mongets(monster, IRON_SHOES, normalized);
            if (!random.rn2(4)) {
                mongets(monster, DWARVISH_SHORT_SWORD, normalized);
                if (random.rn2(2)) {
                    mongets(monster, DWARVISH_MATTOCK, normalized);
                } else {
                    mongets(
                        monster,
                        random.rn2(2) ? AXE : DWARVISH_SPEAR,
                        normalized,
                    );
                    mongets(monster, DWARVISH_ROUNDSHIELD, normalized);
                }
                mongets(monster, DWARVISH_IRON_HELM, normalized);
                if (!random.rn2(3))
                    mongets(monster, DWARVISH_MITHRIL_COAT, normalized);
            } else {
                mongets(
                    monster,
                    !random.rn2(3) ? PICK_AXE : DAGGER,
                    normalized,
                );
            }
        }
        break;
    case S_KOBOLD:
        if (!random.rn2(4)) m_initthrow(monster, DART, 12, normalized);
        break;
    case S_ORC:
        if (random.rn2(2)) mongets(monster, ORCISH_HELM, normalized);
        switch (ptr.pmidx !== PM_ORC_CAPTAIN
            ? ptr.pmidx
            : random.rn2(2) ? PM_MORDOR_ORC : PM_URUK_HAI) {
        case PM_MORDOR_ORC:
            if (!random.rn2(3)) mongets(monster, SCIMITAR, normalized);
            if (!random.rn2(3))
                mongets(monster, ORCISH_SHIELD, normalized);
            if (!random.rn2(3)) mongets(monster, KNIFE, normalized);
            if (!random.rn2(3))
                mongets(monster, ORCISH_CHAIN_MAIL, normalized);
            break;
        case PM_URUK_HAI:
            if (!random.rn2(3))
                mongets(monster, ORCISH_CLOAK, normalized);
            if (!random.rn2(3))
                mongets(monster, ORCISH_SHORT_SWORD, normalized);
            if (!random.rn2(3)) mongets(monster, IRON_SHOES, normalized);
            if (!random.rn2(3)) {
                mongets(monster, ORCISH_BOW, normalized);
                m_initthrow(monster, ORCISH_ARROW, 12, normalized);
            }
            if (!random.rn2(3))
                mongets(monster, URUK_HAI_SHIELD, normalized);
            break;
        default:
            if (ptr.pmidx !== PM_ORC_SHAMAN && random.rn2(2)) {
                mongets(
                    monster,
                    ptr.pmidx === PM_GOBLIN || !random.rn2(2)
                        ? ORCISH_DAGGER
                        : SCIMITAR,
                    normalized,
                );
            }
            break;
        }
        break;
    case S_OGRE:
        mongets(
            monster,
            !random.rn2(12) ? BATTLE_AXE : CLUB,
            normalized,
        );
        break;
    case S_CENTAUR:
        if (random.rn2(2)) {
            mongets(monster, CROSSBOW, normalized);
            m_initthrow(monster, CROSSBOW_BOLT, 12, normalized);
        }
        break;
    default:
        if (ptr.mlet !== S_GNOME) {
            throw new UnsupportedMonsterCreationError(
                `weapon class ${ptr.mlet}`,
            );
        }
        {
            const bias = Number(Boolean(ptr.mflags2 & M2_LORD))
                + 2 * Number(Boolean(ptr.mflags2 & M2_PRINCE))
                + Number(Boolean(ptr.mflags2 & M2_NASTY));
            switch (random.rnd(14 - 2 * bias)) {
            case 1:
                if (ptr.mflags2 & M2_STRONG)
                    mongets(monster, BATTLE_AXE, normalized);
                else m_initthrow(monster, DART, 12, normalized);
                break;
            case 2:
                if (ptr.mflags2 & M2_STRONG) {
                    mongets(monster, TWO_HANDED_SWORD, normalized);
                } else {
                    mongets(monster, CROSSBOW, normalized);
                    m_initthrow(monster, CROSSBOW_BOLT, 12, normalized);
                }
                break;
            case 3:
                mongets(monster, BOW, normalized);
                m_initthrow(monster, ARROW, 12, normalized);
                break;
            case 4:
                if (ptr.mflags2 & M2_STRONG)
                    mongets(monster, LONG_SWORD, normalized);
                else m_initthrow(monster, DAGGER, 3, normalized);
                break;
            case 5:
                mongets(
                    monster,
                    ptr.mflags2 & M2_STRONG ? LUCERN_HAMMER : AKLYS,
                    normalized,
                );
                break;
            default:
                break;
            }
        }
        break;
    }

    if (monster.m_lev > random.rn2(75))
        mongets(monster, rnd_offensive_item(monster, normalized), normalized);
}

function rejectsRandomUseItems(species) {
    return Boolean(species.mflags1 & (M1_MINDLESS | M1_ANIMAL))
        || species.mattk.some((attack) => attack.aatyp === AT_EXPL)
        || species.mlet === S_GHOST
        || species.mlet === S_KOP;
}

function noTeleportLevel(state) {
    if (state.level.flags.noteleport) return true;
    const stasisUntil = state.level.flags.stasis_until;
    return Number.isInteger(stasisUntil)
        && stasisUntil >= Math.trunc(state.moves ?? 0);
}

function isNonliving(species) {
    return Boolean(species.mflags2 & M2_UNDEAD)
        || species.pmidx === PM_MANES
        || species.mlet === S_GOLEM
        || species.mlet === S_VORTEX;
}

function isFloater(species) {
    return species.mlet === S_EYE || species.mlet === S_LIGHT;
}

function isHardHelmet(obj, state) {
    if (!obj || armorCategory(obj, state) !== ARM_HELM) return false;
    const material = state.objects[obj.otyp].oc_material;
    return (material >= IRON && material <= MITHRIL) || material === GLASS;
}

// C ref: muse.c rnd_offensive_item().
function rnd_offensive_item(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (rejectsRandomUseItems(ptr)) return 0;
    if (ptr.difficulty > 7 && !random.rn2(35)) return WAN_DEATH;

    switch (random.rn2(
        9 - Number(ptr.difficulty < 4) + 4 * Number(ptr.difficulty > 6),
    )) {
    case 0: {
        const helmet = monsterWears(monster, W_ARMH);
        if (isHardHelmet(helmet, state)
            || (ptr.mflags1 & (M1_AMORPHOUS | M1_WALLWALK | M1_UNSOLID))
            || ptr.mlet === S_GHOST) {
            return SCR_EARTH;
        }
    }
    // Fall through like muse.c when earth would hit the monster too.
    case 1: return WAN_STRIKING;
    case 2: return POT_ACID;
    case 3: return POT_CONFUSION;
    case 4: return POT_BLINDNESS;
    case 5: return POT_SLEEPING;
    case 6: return POT_PARALYSIS;
    case 7:
    case 8: return WAN_MAGIC_MISSILE;
    case 9: return WAN_SLEEP;
    case 10: return WAN_FIRE;
    case 11: return WAN_COLD;
    case 12: return WAN_LIGHTNING;
    default: throw new Error('rnd_offensive_item selected an invalid case');
    }
}

// C ref: muse.c rnd_defensive_item().
function rnd_defensive_item(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (rejectsRandomUseItems(ptr)) return 0;
    const difficulty = ptr.difficulty;
    let trycnt = 0;
    while (true) {
        switch (random.rn2(
            8 + Number(difficulty > 3)
                + Number(difficulty > 6)
                + Number(difficulty > 8),
        )) {
        case 6:
        case 9:
            if (noTeleportLevel(state) && ++trycnt < 2) continue;
            if (!random.rn2(3)) return WAN_TELEPORTATION;
            return SCR_TELEPORTATION;
        case 0:
        case 1:
            return SCR_TELEPORTATION;
        case 8:
        case 10:
            if (!random.rn2(3)) return WAN_CREATE_MONSTER;
            return SCR_CREATE_MONSTER;
        case 2:
            return SCR_CREATE_MONSTER;
        case 3:
            return POT_HEALING;
        case 4:
            return POT_EXTRA_HEALING;
        case 5:
            return POT_FULL_HEALING;
        case 7:
            if (state.u.uz.dnum === state.sokoban_dnum && random.rn2(4))
                continue;
            if (isFloater(ptr)
                || monster.isshk
                || monster.isgd
                || monster.ispriest) {
                return 0;
            }
            return WAN_DIGGING;
        default:
            throw new Error('rnd_defensive_item selected an invalid case');
        }
    }
}

function heroHasProperty(state, property) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

// C ref: muse.c rnd_misc_item(). No inventory-enabled shape-changer in this
// initial-generation slice is a vampire shifter.
function rnd_misc_item(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (rejectsRandomUseItems(ptr)) return 0;
    if (ptr.difficulty < 6 && !random.rn2(30))
        return random.rn2(6) ? POT_POLYMORPH : WAN_POLYMORPH;
    if (!random.rn2(40) && !isNonliving(ptr))
        return AMULET_OF_LIFE_SAVING;

    switch (random.rn2(3)) {
    case 0:
        if (monster.isgd) return 0;
        return random.rn2(6) ? POT_SPEED : WAN_SPEED_MONSTER;
    case 1:
        if (monster.mpeaceful && !heroHasProperty(state, SEE_INVIS)) return 0;
        return random.rn2(6) ? POT_INVISIBILITY : WAN_MAKE_INVISIBLE;
    case 2:
        return POT_GAIN_LEVEL;
    default:
        throw new Error('rnd_misc_item selected an invalid case');
    }
}

function findMonsterGold(monster) {
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.oclass === COIN_CLASS) return obj;
    }
    return null;
}

// C ref: makemon.c mkmonmoney().
function mkmonmoney(monster, amount, normalized) {
    if (amount <= 0) return null;
    const gold = mksobj(GOLD_PIECE, false, false, normalized);
    gold.quan = amount;
    gold.owt = weight(gold, normalized);
    return addFreshMonsterObject(monster, gold, normalized);
}

// C ref: makemon.c m_initinv().
function m_initinv(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    assertSupportedSpecies(ptr);
    if (isRogueLevel(state)) return;

    if (ptr.mlet === S_NYMPH) {
        if (!random.rn2(2)) mongets(monster, MIRROR, normalized);
        if (!random.rn2(2))
            mongets(monster, POT_OBJECT_DETECTION, normalized);
    } else if (ptr.mlet === S_MUMMY) {
        if (random.rn2(7)) mongets(monster, MUMMY_WRAPPING, normalized);
    } else if (ptr.mlet === S_LEPRECHAUN) {
        mkmonmoney(
            monster,
            random.d(level_difficulty(state), 30),
            normalized,
        );
    } else if (ptr.mlet === S_GNOME
        && !random.rn2(60)) {
        const candle = mksobj(
            random.rn2(4) ? TALLOW_CANDLE : WAX_CANDLE,
            true,
            false,
            normalized,
        );
        candle.quan = 1;
        candle.owt = weight(candle, normalized);
        addFreshMonsterObject(monster, candle, normalized);
        if (!state.level.at(monster.mx, monster.my).lit)
            begin_burn(candle, false, normalized);
    }

    if (monster.m_lev > random.rn2(50)) {
        mongets(monster, rnd_defensive_item(monster, normalized), normalized);
    }
    if (monster.m_lev > random.rn2(100)) {
        mongets(monster, rnd_misc_item(monster, normalized), normalized);
    }
    if ((ptr.mflags2 & M2_GREEDY)
        && !findMonsterGold(monster)
        && !random.rn2(5)) {
        mkmonmoney(
            monster,
            random.d(level_difficulty(state), monster.minvent ? 5 : 10),
            normalized,
        );
    }
}

function armorBonus(obj, state) {
    const base = state.objects?.[obj.otyp]?.a_ac;
    if (!Number.isInteger(base)) {
        throw new Error('m_dowear requires initialized armor data');
    }
    const erosion = Math.max(obj.oeroded ?? 0, obj.oeroded2 ?? 0);
    return base + obj.spe - Math.min(erosion, base);
}

function monsterWornObject(monster, mask) {
    let worn = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (!(obj.owornmask & mask)) continue;
        if (worn) {
            throw new Error(
                `m_dowear found multiple worn slot 0x${mask.toString(16)}`,
            );
        }
        worn = obj;
    }
    return worn;
}

function armorCategory(obj, state) {
    return obj.oclass === ARMOR_CLASS
        ? state.objects?.[obj.otyp]?.oc_armcat
        : undefined;
}

function slipsArmor(species) {
    return species.mlet === S_VORTEX
        || species.mlet === S_GHOST
        || species.msize <= MZ_SMALL;
}

function cantWearArmor(species) {
    if (slipsArmor(species)) return true;
    return species.msize >= MZ_LARGE
        || (species.msize > MZ_SMALL
            && !(species.mflags1 & M1_HUMANOID));
}

function wrappingAllowed(species) {
    return Boolean(species.mflags1 & M1_HUMANOID)
        && species.msize >= MZ_SMALL
        && species.msize <= MZ_HUGE
        && species.mlet !== S_GHOST
        && species.mlet !== S_CENTAUR;
}

function monsterHasHorns(species) {
    return species.pmidx === PM_WHITE_UNICORN
        || species.pmidx === PM_GRAY_UNICORN
        || species.pmidx === PM_BLACK_UNICORN;
}

function isFlimsy(obj, state) {
    const material = state.objects?.[obj.otyp]?.oc_material;
    return Number.isInteger(material) && material <= LEATHER;
}

function armorExtraPreference(monster, obj) {
    return obj.otyp === SPEED_BOOTS && monster.permspeed !== MFAST ? 20 : 0;
}

// C ref: worn.c update_mon_extrinsics(), for effects reachable from the
// currently supported creation-time armor set.
function updateMonsterArmorEffects(monster, obj, on, state) {
    if (obj.otyp === MUMMY_WRAPPING) {
        monster.invis_blkd = on;
        monster.minvis = on ? false : Boolean(monster.perminvis);
    }
    if (obj.otyp === SPEED_BOOTS) {
        let hasSpeedBoots = false;
        for (let current = monster.minvent; current; current = current.nobj) {
            if ((current.owornmask & W_ARMF)
                && current.otyp === SPEED_BOOTS) {
                hasSpeedBoots = true;
                break;
            }
        }
        monster.mspeed = hasSpeedBoots ? MFAST : monster.permspeed;
    }
}

function m_dowear_type(
    monster,
    mask,
    creation,
    state,
    racialException = false,
) {
    const old = monsterWornObject(monster, mask);
    if (old?.cursed) return;
    if (old && mask === W_AMUL && old.otyp !== AMULET_OF_GUARDING) return;
    let best = old;

    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (mask === W_AMUL) {
            if (obj.oclass !== AMULET_CLASS
                || (obj.otyp !== AMULET_OF_LIFE_SAVING
                    && obj.otyp !== AMULET_OF_REFLECTION
                    && obj.otyp !== AMULET_OF_GUARDING)) {
                continue;
            }
            if (!best || obj.otyp !== AMULET_OF_GUARDING) {
                best = obj;
                if (best.otyp !== AMULET_OF_GUARDING) break;
            }
            continue;
        }

        const category = armorCategory(obj, state);
        if ((mask === W_ARMU && category !== ARM_SHIRT)
            || (mask === W_ARMC && category !== ARM_CLOAK)
            || (mask === W_ARMH && category !== ARM_HELM)
            || (mask === W_ARMS && category !== ARM_SHIELD)
            || (mask === W_ARMG && category !== ARM_GLOVES)
            || (mask === W_ARMF && category !== ARM_BOOTS)
            || (mask === W_ARM && category !== ARM_SUIT)) {
            continue;
        }
        if (mask === W_ARMC
            && monster.data.msize > MZ_MEDIUM
            && obj.otyp !== MUMMY_WRAPPING) {
            continue;
        }
        if (mask === W_ARMC
            && monster.minvis
            && obj.otyp === MUMMY_WRAPPING
            && !heroHasProperty(state, SEE_INVIS)
            && !creation) {
            continue;
        }
        if (mask === W_ARMH
            && obj.otyp === HELM_OF_OPPOSITE_ALIGNMENT
            && (monster.ispriest || monster.isminion)) {
            continue;
        }
        if (mask === W_ARMH
            && monsterHasHorns(monster.data)
            && !isFlimsy(obj, state)) {
            continue;
        }
        // No currently supported Statuary species has the hobbit/elven-suit
        // racial exception, so a race-exception suit remains ineligible.
        if (mask === W_ARM && racialException) continue;
        if (obj.owornmask) continue;
        if (best
            && armorBonus(best, state) + armorExtraPreference(monster, best)
                >= armorBonus(obj, state)
                    + armorExtraPreference(monster, obj)) {
            continue;
        }
        best = obj;
    }

    if (!best || best === old) return;
    if (old) {
        old.owornmask = 0;
        updateMonsterArmorEffects(monster, old, false, state);
    }
    monster.misc_worn_check |= mask;
    best.owornmask |= mask;
    if ((best.otyp === HELM_OF_OPPOSITE_ALIGNMENT
        || best.otyp === DUNCE_CAP) && !best.cursed) {
        best.cursed = true;
        best.blessed = false;
    }
    updateMonsterArmorEffects(monster, best, true, state);
}

// C ref: worn.c m_dowear()/m_dowear_type(), restricted to creation-time
// behavior and the species and equipment reachable from initial generation.
export function m_dowear(monster, creation = false, env = {}) {
    const state = env.state ?? game;
    const species = monster.data;
    const bodyFlags = species.mflags1 ?? 0;
    if (species.msize < MZ_SMALL
        || (bodyFlags & M1_NOHANDS)
        || (bodyFlags & M1_ANIMAL)) {
        return monster;
    }
    if ((bodyFlags & M1_MINDLESS)
        && (!creation
            || (species.mlet !== S_MUMMY
                && species.pmidx !== PM_SKELETON))) {
        return monster;
    }
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.where !== OBJ_MINVENT || obj.ocarry !== monster) {
            throw new Error('m_dowear found invalid monster inventory ownership');
        }
    }

    m_dowear_type(monster, W_AMUL, creation, state);
    const canWearArmor = !cantWearArmor(species);
    if (canWearArmor && !(monster.misc_worn_check & W_ARM))
        m_dowear_type(monster, W_ARMU, creation, state);
    if (canWearArmor || wrappingAllowed(species))
        m_dowear_type(monster, W_ARMC, creation, state);
    m_dowear_type(monster, W_ARMH, creation, state);
    if (!monster.mw || !state.objects?.[monster.mw.otyp]?.oc_bimanual)
        m_dowear_type(monster, W_ARMS, creation, state);
    m_dowear_type(monster, W_ARMG, creation, state);
    if (!(bodyFlags & M1_SLITHY) && species.mlet !== S_CENTAUR)
        m_dowear_type(monster, W_ARMF, creation, state);
    m_dowear_type(monster, W_ARM, creation, state, !canWearArmor);
    return monster;
}

// C ref: mkobj.c discard_minvent().  The currently supported makemon()
// species cannot receive invocation artifacts or other special objects which
// mdrop_special_objs() would preserve on the floor.  Artifact bookkeeping is
// still reversed here before each generated inventory object is uncreated.
export function discard_minvent(monster, uncreateArtifacts, env = {}) {
    const normalized = creationEnv(env);
    while (monster.minvent) {
        const obj = monster.minvent;
        const unwornmask = obj.owornmask;
        // C's extract_from_minvent(..., TRUE, TRUE) unlinks and clears the worn
        // mask before reversing live-monster effects. Dead monsters skip that
        // reversal but still clear their masks and schedule a gear check.
        obj_extract_self(obj, normalized);
        obj.owornmask = 0;
        if (unwornmask) {
            if (monster.mhp >= 1) {
                updateMonsterArmorEffects(
                    monster,
                    obj,
                    false,
                    normalized.state,
                );
            }
            monster.misc_worn_check &= ~unwornmask;
            monster.misc_worn_check |= I_SPECIAL;
        }
        if (uncreateArtifacts && obj.oartifact) {
            artifact_exists(
                obj,
                ONAME(obj),
                false,
                ONAME_NO_FLAGS,
                normalized.state,
            );
        }
        obfree(obj, null, normalized);
    }
    return monster;
}

function monsterOnLevelChain(monster, state) {
    for (let current = state.level?.monlist ?? null;
        current;
        current = current.nmon) {
        if (current === monster) return true;
    }
    return false;
}

// C refs: mon.c mon_leaving_level(), m_detach(), and mongone(). This is the
// level-generation subset used to discard a temporary monster after its
// inventory has been transferred elsewhere. The dead monster stays linked on
// level.monlist until dmonsfree(), just as C's fmon does.
export function mongone(monster, env = {}) {
    const normalized = creationEnv(env);
    const { state } = normalized;
    if (!monster || typeof monster !== 'object')
        throw new TypeError('mongone requires a monster instance');
    if (!monsterOnLevelChain(monster, state))
        throw new Error('mongone: monster is not on the level chain');
    if (monster.mstate & MON_DETACH)
        throw new Error('mongone: monster is already detached');
    if (monster.isgd || monster.mleashed || monster.wormno
        || monster.iswiz || state.u?.ustuck === monster
        || state.u?.usteed === monster) {
        throw new UnsupportedMonsterCreationError(
            'temporary monster with unsupported departure state',
        );
    }

    monster.mhp = 0;
    discard_minvent(monster, false, normalized);

    if (monster.mx > 0 && emitsLight(monster.data))
        del_light_source(LS_MONSTER, monster, state);

    const onmap = isok(monster.mx, monster.my)
        && m_at(monster.mx, monster.my, state) === monster;
    if (onmap) {
        remove_monster(monster.mx, monster.my, state);
        monster.mundetected = false;
        if (monster.m_ap_type) {
            monster.m_ap_type = 0;
            monster.mappearance = 0;
            if (monster.mextra && 'mcorpsenm' in monster.mextra)
                monster.mextra.mcorpsenm = NON_PM;
        }
    }
    monster.mtrapped = false;
    monster.mstate |= MON_DETACH;
    state.iflags ??= {};
    state.iflags.purge_monsters = (state.iflags.purge_monsters ?? 0) + 1;
    return monster;
}

// C ref: mon.c dmonsfree(). Dead non-guard nodes are unlinked in place, and
// the source checks that their count matches iflags.purge_monsters.
export function dmonsfree(state = game) {
    if (!state.level || !Object.hasOwn(state.level, 'monlist'))
        throw new Error('dmonsfree requires an initialized level monster list');
    state.iflags ??= {};
    const expected = state.iflags.purge_monsters ?? 0;
    let removed = 0;
    let previous = null;
    let current = state.level.monlist;
    while (current) {
        const next = current.nmon;
        if (current.mhp < 1 && !current.isgd) {
            if (previous) previous.nmon = next;
            else state.level.monlist = next;
            current.nmon = null;
            ++removed;
        } else {
            previous = current;
        }
        current = next;
    }
    state.iflags.purge_monsters = 0;
    if (removed !== expected) {
        throw new Error(
            `dmonsfree: ${removed} removed does not match ${expected} pending`,
        );
    }
    return removed;
}

function initializeGender(monster, ptr, mmflags, random) {
    const femaleok = !is_male(ptr) && !is_neuter(ptr);
    const maleok = !is_female(ptr) && !is_neuter(ptr);
    if (is_female(ptr) || ((mmflags & MM_FEMALE) && femaleok)) {
        monster.female = true;
    } else if (is_male(ptr) || ((mmflags & MM_MALE) && maleok)) {
        monster.female = false;
    } else {
        monster.female = femaleok ? Boolean(random.rn2(2)) : false;
    }
}

// C ref: makemon.c makemon(). This implements the level-one, explicit-square
// call shapes needed by fill_ordinary_room(), the Ghost, Cloud, Garden, and
// Storeroom themed fills, dog.c:makedog(), plus the level-generation random
// coordinate shape needed by temporary Statuary monsters.
//
// After supported-call validation, source no-creation outcomes return null:
// generation is disabled, the square is occupied, selection has no candidate,
// or the species is genocided. Unsupported modes throw
// UnsupportedMonsterCreationError; invalid arguments or state fail validation.
export function makemon(ptr, x, y, mmflags = 0, env = {}) {
    const normalized = creationEnv(env);
    const { random, state } = normalized;
    preflightCreation(ptr, x, y, mmflags, normalized);

    if (state.iflags?.debug_mongen
        || (state.level.flags.rndmongen === false && !ptr)) {
        return null;
    }
    const byHero = x === state.u.ux && y === state.u.uy;
    const gpflags = GP_CHECKSCARY | GP_AVOID_MONPOS;
    if (x === 0 && y === 0) {
        const coordinate = makemon_rnd_goodpos(ptr, gpflags, normalized);
        if (!coordinate) return null;
        x = coordinate.x;
        y = coordinate.y;
    } else if (byHero && !state.in_mklev) {
        const coordinate = enexto_core(
            state.u.ux,
            state.u.uy,
            ptr,
            gpflags,
            normalized,
        ) ?? enexto_core(
            state.u.ux,
            state.u.uy,
            ptr,
            gpflags & ~GP_CHECKSCARY,
            normalized,
        );
        if (!coordinate) return null;
        x = coordinate.x;
        y = coordinate.y;
    }
    if (m_at(x, y, state)) return null;

    const anymon = !ptr;
    if (anymon) {
        ptr = rndmonst(normalized);
        if (!ptr) return null;
        assertSupportedSpecies(ptr);
    }
    const mndx = ptr.pmidx;
    if (state.mvitals[mndx].mvflags & G_GENOD) return null;

    // makemon.c deliberately ignores propagate()'s result. An explicitly
    // requested extinct species remains creatable after the genocide check;
    // propagate() still applies enabled birth-count side effects.
    propagate(
        mndx,
        !(mmflags & MM_NOCOUNTBIRTH),
        false,
        normalized,
    );
    const monster = newMonster();
    if (mmflags & MM_EDOG) newedog(monster);
    monster.msleeping = Boolean(mmflags & MM_ASLEEP);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    monster.m_id = next_ident(normalized);
    monster.data = ptr;
    monster.mnum = mndx;
    newmonhp(monster, mndx, normalized);
    initializeGender(monster, ptr, mmflags, random);

    place_monster(monster, x, y, state);
    monster.mcansee = true;
    monster.mcanmove = true;
    monster.mgenmklev = Boolean(state.in_mklev);
    monster.seen_resistance = M_SEEN_NOTHING;
    monster.mpeaceful = (mmflags & MM_ANGRY)
        ? false
        : peace_minded(ptr, normalized);
    if (ptr.mlet === S_MIMIC) {
        set_mimic_sym(monster, normalized);
    } else if (ptr.mlet === S_SPIDER || ptr.mlet === S_SNAKE) {
        if (state.in_mklev) {
            if (x && y) mkobj_at(RANDOM_CLASS, x, y, true, normalized);
            hideunder(monster, state);
        }
    } else if (ptr.mlet === S_LIGHT) {
        if (mndx === PM_BLACK_LIGHT) {
            monster.perminvis = true;
            monster.minvis = true;
        }
    } else if (ptr.mlet === S_LEPRECHAUN) {
        monster.msleeping = true;
    } else if (ptr.mlet === S_ORC && state.urace.mnum === PM_ELF) {
        monster.mpeaceful = false;
    } else if (ptr.mlet === S_NYMPH
        && random.rn2(5)
        && !state.u.uhave.amulet) {
        monster.msleeping = true;
    } else if (ptr.mlet === S_UNICORN
        && (ptr.mflags2 & M2_JEWELS)
        && Math.sign(state.u.ualign.type) === Math.sign(ptr.maligntyp)) {
        monster.mpeaceful = true;
    }
    const lightRange = emitsLight(monster.data);
    if (lightRange) {
        new_light_source(
            monster.mx,
            monster.my,
            lightRange,
            LS_MONSTER,
            monster,
            state,
        );
    }
    monster.cham = NON_PM;
    if (mndx === PM_GHOST) {
        christen_monst(monster, rndghostname(normalized), {
            updateInventory: () => update_inventory(normalized),
        });
    }
    if (byHero && !state.in_mklev) {
        // makemon.c calls set_apparxy() here. At initial startup the hero is
        // visible and undisplaced, so the source result is exact and drawless.
        monster.mux = state.u.ux;
        monster.muy = state.u.uy;
    }
    set_malign(monster, state);

    if (!(mmflags & NO_MINVENT)) {
        if (isArmed(ptr)) m_initweap(monster, normalized);
        m_initinv(monster, normalized);
        m_dowear(monster, true, normalized);

        const saddleRoll = random.rn2(100);
        if (!saddleRoll && (ptr.mflags2 & M2_DOMESTIC)
            && can_saddle(monster)
            && !monsterWears(monster, W_SADDLE)) {
            put_saddle_on_mon(null, monster, normalized);
        }
    }

    return monster;
}
