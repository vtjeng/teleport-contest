// Initial-level monster creation for ordinary rooms, themed-room fills, and
// starting pets.
// C ref: makemon.c makemon(), m_initthrow(), m_initweap(), m_initinv(), and
// mongets(); worn.c m_dowear(). The implementation fails closed outside the
// species and call shapes reachable during ordinary-room filling, the Ghost
// themed fill, and starting-pet creation. Fog clouds, wood nymphs, and the
// three mimic sizes support the Cloud, Garden, and Storeroom fills.
// Expanding the closed set means porting the corresponding complete source
// branches, not approximating their PRNG effects.

import {
    ACCESSIBLE,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    BLCORNER,
    CROSSWALL,
    DOOR,
    G_GENOD,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    HWALL,
    I_SPECIAL,
    isok,
    MM_ANGRY,
    MM_ASLEEP,
    MM_EDOG,
    MM_FEMALE,
    MM_MALE,
    MM_NOCOUNTBIRTH,
    MM_NOGRP,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_SEEN_NOTHING,
    NO_MINVENT,
    ONAME,
    ONAME_NO_FLAGS,
    OBJ_MINVENT,
    ROOMOFFSET,
    SCORR,
    SDOOR,
    SEE_INVIS,
    TDWALL,
    TLCORNER,
    TRWALL,
    TUWALL,
    W_AMUL,
    W_ARMH,
    IS_WALL,
} from './const.js';
import { artifact_exists } from './artifacts.js';
import { newedog } from './dog.js';
import { christen_monst, rndghostname } from './do_name.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import {
    add_to_minv,
    obfree,
    obj_extract_self,
    update_inventory,
} from './invent.js';
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
import { m_at, newMonster, place_monster } from './monst.js';
import {
    AT_WEAP,
    M1_ANIMAL,
    M1_MINDLESS,
    M1_NOHANDS,
    M2_DOMESTIC,
    M2_GREEDY,
    MZ_SMALL,
    NON_PM,
    PM_ELF,
    PM_FOG_CLOUD,
    PM_FOX,
    PM_GHOST,
    PM_GOBLIN,
    PM_GRID_BUG,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_ZOMBIE,
    PM_KITTEN,
    PM_LICHEN,
    PM_LITTLE_DOG,
    PM_SMALL_MIMIC,
    PM_LARGE_MIMIC,
    PM_GIANT_MIMIC,
    PM_NEWT,
    PM_PONY,
    PM_SEWER_RAT,
    PM_SKELETON,
    PM_WOOD_NYMPH,
    PM_ARCHEOLOGIST,
    PM_WIZARD,
    G_NOCORPSE,
    S_GHOST,
    S_KOBOLD,
    S_KOP,
    S_MUMMY,
    S_MIMIC,
    S_MIMIC_DEF,
    S_NYMPH,
    S_ORC,
} from './monsters.js';
import { mkobj, mksobj, next_ident, weight } from './obj.js';
import {
    AMULET_CLASS,
    AMULET_OF_LIFE_SAVING,
    ARMOR_CLASS,
    COIN_CLASS,
    CORPSE,
    DART,
    EGG,
    FIGURINE,
    FOOD_CLASS,
    GEM_CLASS,
    GOLD_PIECE,
    MAXOCLASSES,
    MIRROR,
    ORCISH_DAGGER,
    ORCISH_HELM,
    POT_EXTRA_HEALING,
    POT_FULL_HEALING,
    POT_GAIN_LEVEL,
    POT_HEALING,
    POT_INVISIBILITY,
    POT_OBJECT_DETECTION,
    POT_POLYMORPH,
    POT_SPEED,
    POTION_CLASS,
    RING_CLASS,
    ROCK_CLASS,
    SCR_CREATE_MONSTER,
    SCR_TELEPORTATION,
    SCROLL_CLASS,
    SLIME_MOLD,
    SPBOOK_CLASS,
    STATUE,
    STRANGE_OBJECT,
    TIN,
    TOOL_CLASS,
    WAN_CREATE_MONSTER,
    WAN_DIGGING,
    WAN_MAKE_INVISIBLE,
    WAN_POLYMORPH,
    WAN_SPEED_MONSTER,
    WAN_TELEPORTATION,
    WAND_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { enexto_core } from './teleport.js';
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

const SUPPORTED_FLAGS = NO_MINVENT
    | MM_NOCOUNTBIRTH
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
]);

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);

// include/monattk.h predicate used by muse.c's random-item selectors.
const AT_EXPL = 13;

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

// C ref: makemon.c set_mimic_sym(), for ordinary and themed initial rooms.
// The descriptor which requested the Storeroom mimic overwrites this shape,
// but all RNG, temporary-object allocation, and fruit state here occur first.
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
        if (roomType !== 0 && roomType !== 1) {
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

function assertSupportedSpecies(species) {
    if (!species || !INITIAL_LEVEL_MONSTERS.has(species.pmidx)) {
        throw new UnsupportedMonsterCreationError(
            `monster ${species?.pmidx ?? 'null'}`,
        );
    }
}

function preflightCreation(ptr, x, y, mmflags, normalized) {
    const { state } = normalized;
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
    if (x === 0 && y === 0)
        throw new UnsupportedMonsterCreationError('random coordinates');
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
    if (ptr && STARTING_PETS.has(ptr.pmidx) && !startingPetCall) {
        throw new UnsupportedMonsterCreationError(
            'pet species outside starting-pet call',
        );
    }
    if (!startingPetCall
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

function addFreshMonsterObject(monster, obj, normalized) {
    const merged = add_to_minv(monster, obj, normalized);
    if (merged) {
        throw new UnsupportedMonsterCreationError(
            'new monster inventory object merged unexpectedly',
        );
    }
    return obj;
}

// C ref: makemon.c mongets(). The reachable species are neither demons,
// lawful minions, player monsters, nor princes, so source postprocessing is
// empty before mpickobj() links the fresh object.
function mongets(monster, otyp, normalized) {
    if (!otyp) return null;
    assertSupportedSpecies(monster.data);
    const obj = mksobj(otyp, true, false, normalized);
    return addFreshMonsterObject(monster, obj, normalized);
}

// C ref: makemon.c m_initthrow().
function m_initthrow(monster, otyp, quantityRange, normalized) {
    const obj = mksobj(otyp, true, false, normalized);
    obj.quan = normalized.random.rn1(quantityRange, 3);
    obj.owt = weight(obj, normalized);
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
    case S_KOBOLD:
        if (!random.rn2(4)) m_initthrow(monster, DART, 12, normalized);
        break;
    case S_ORC:
        if (ptr.pmidx !== PM_GOBLIN) {
            throw new UnsupportedMonsterCreationError(
                `orc weapon branch ${ptr.pmidx}`,
            );
        }
        if (random.rn2(2)) mongets(monster, ORCISH_HELM, normalized);
        if (random.rn2(2)) mongets(monster, ORCISH_DAGGER, normalized);
        break;
    default:
        throw new UnsupportedMonsterCreationError(
            `weapon class ${ptr.mlet}`,
        );
    }

    // Every source branch reaches the rare offensive-item check. Level-zero
    // monsters cannot pass it, but the draw is still observable.
    if (monster.m_lev > random.rn2(75)) {
        throw new UnsupportedMonsterCreationError('random offensive item');
    }
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

// C ref: muse.c rnd_defensive_item(). Only the wood-nymph path can reach
// item selection in this initial-level slice. Fog clouds are mindless and
// ghosts are rejected by monster class before this function consumes RNG.
function rnd_defensive_item(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (rejectsRandomUseItems(ptr)) return 0;
    if (ptr.pmidx !== PM_WOOD_NYMPH) {
        throw new UnsupportedMonsterCreationError(
            `random defensive item for monster ${ptr.pmidx}`,
        );
    }

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

// C ref: muse.c rnd_misc_item(). Wood nymphs are living, non-vampiric,
// hostile non-guards, so all source predicates below retain their ordinary
// result while their short-circuit order stays visible.
function rnd_misc_item(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (rejectsRandomUseItems(ptr)) return 0;
    if (ptr.pmidx !== PM_WOOD_NYMPH) {
        throw new UnsupportedMonsterCreationError(
            `random miscellaneous item for monster ${ptr.pmidx}`,
        );
    }

    if (ptr.difficulty < 6 && !random.rn2(30))
        return random.rn2(6) ? POT_POLYMORPH : WAN_POLYMORPH;
    if (!random.rn2(40)) return AMULET_OF_LIFE_SAVING;

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

// C ref: makemon.c m_initinv(). The level-one ordinary reservoir retains its
// prior fail-closed rare-item boundary; the three themed-fill species carry
// their complete source behavior.
function m_initinv(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    assertSupportedSpecies(ptr);
    if (isRogueLevel(state)) return;

    if (ptr.mlet === S_NYMPH) {
        if (!random.rn2(2)) mongets(monster, MIRROR, normalized);
        if (!random.rn2(2))
            mongets(monster, POT_OBJECT_DETECTION, normalized);
    }

    if (monster.m_lev > random.rn2(50)) {
        mongets(monster, rnd_defensive_item(monster, normalized), normalized);
    }
    if (monster.m_lev > random.rn2(100)) {
        mongets(monster, rnd_misc_item(monster, normalized), normalized);
    }
    if (ptr.mflags2 & M2_GREEDY) {
        throw new UnsupportedMonsterCreationError('gold-carrying monster');
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

// C ref: worn.c m_dowear()/m_dowear_type(). Within the supported inventory
// set, an orcish helm and amulet of life saving are the only wearable objects.
// Neither has an applicable creation-time extrinsic side effect.
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
    let amulet = null;
    let wornAmulet = null;
    let wornHelm = null;
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj.where !== OBJ_MINVENT || obj.ocarry !== monster) {
            throw new Error('m_dowear found invalid monster inventory ownership');
        }
        if (obj.otyp === AMULET_OF_LIFE_SAVING) {
            amulet ??= obj;
            if (obj.owornmask & W_AMUL) {
                if (wornAmulet) {
                    throw new Error('m_dowear found multiple worn amulets');
                }
                wornAmulet = obj;
            }
        } else if (obj.otyp === ORCISH_HELM) {
            if (obj.owornmask & W_ARMH) {
                if (wornHelm) {
                    throw new Error('m_dowear found multiple worn helmets');
                }
                wornHelm = obj;
            }
        } else if (obj.oclass === AMULET_CLASS
            || obj.oclass === ARMOR_CLASS) {
            throw new UnsupportedMonsterCreationError(
                `wearing object ${obj.otyp}`,
            );
        }
    }

    // m_dowear_type(W_AMUL) keeps an occupied life-saving slot without even
    // considering another amulet.
    if (!wornAmulet && amulet) {
        monster.misc_worn_check |= W_AMUL;
        amulet.owornmask |= W_AMUL;
    }

    // m_dowear_type(W_ARMH) retains ties and replaces only with a strictly
    // better unworn helm.  extra_pref() is zero for every supported helmet.
    let bestHelm = wornHelm;
    if (!wornHelm?.cursed) {
        for (let obj = monster.minvent; obj; obj = obj.nobj) {
            if (obj.otyp !== ORCISH_HELM || obj.owornmask) continue;
            if (!bestHelm
                || armorBonus(obj, state) > armorBonus(bestHelm, state)) {
                bestHelm = obj;
            }
        }
    }
    if (bestHelm && bestHelm !== wornHelm) {
        if (wornHelm) wornHelm.owornmask &= ~W_ARMH;
        monster.misc_worn_check |= W_ARMH;
        bestHelm.owornmask |= W_ARMH;
    }
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
        // C's extract_from_minvent(..., TRUE, TRUE) removes worn state before
        // freeing the object.  No supported creation-time worn item grants an
        // extrinsic, so the remaining local effects are the two worn masks and
        // check_gear_next_turn()'s I_SPECIAL reassessment flag.
        obj_extract_self(obj, normalized);
        obj.owornmask = 0;
        if (unwornmask) {
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
// call shapes needed by fill_ordinary_room(), the Ghost themed fill, and
// dog.c:makedog().
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
    if (byHero && !state.in_mklev) {
        const gpflags = GP_CHECKSCARY | GP_AVOID_MONPOS;
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
    } else if (ptr.mlet === S_ORC && state.urace.mnum === PM_ELF) {
        monster.mpeaceful = false;
    } else if (ptr.mlet === S_NYMPH
        && random.rn2(5)
        && !state.u.uhave.amulet) {
        monster.msleeping = true;
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
        if (!saddleRoll && (ptr.mflags2 & M2_DOMESTIC)) {
            throw new UnsupportedMonsterCreationError('initial saddle');
        }
    }

    return monster;
}
