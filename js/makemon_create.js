// Initial-level monster creation for ordinary rooms, themed-room fills
// including Mausoleum, starting pets, and Statuary's temporary monsters.
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
    BLINDED,
    BOLT_LIM,
    COLNO,
    CROSSWALL,
    DOOR,
    FODDERSHOP,
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
    MM_EPRI,
    MM_ESHK,
    MM_FEMALE,
    MM_MALE,
    MM_NOCOUNTBIRTH,
    MM_NOEXCLAM,
    MM_NOGRP,
    MM_NONAME,
    MM_NOMSG,
    M_AP_NOTHING,
    M_AP_MONSTER,
    M_AP_TYPE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_SEEN_NOTHING,
    MAX_NUM_WORMS,
    MON_DETACH,
    N_DIRS,
    NO_MINVENT,
    ONAME,
    ONAME_NO_FLAGS,
    OBJ_FLOOR,
    OBJ_MINVENT,
    OROOM,
    ROOMOFFSET,
    ROT_CORPSE,
    ROWNO,
    SCORR,
    SDOOR,
    SEE_INVIS,
    SHOPBASE,
    P_POLEARMS,
    PROT_FROM_SHAPE_CHANGERS,
    STRAT_APPEARMSG,
    STRAT_CLOSE,
    STRAT_WAITFORU,
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
    xdir,
    ydir,
} from './const.js';
import { artifact_exists } from './artifacts.js';
import { obj_resists } from './bury.js';
import {
    can_saddle,
    newedog,
    put_saddle_on_mon,
} from './dog.js';
import {
    Amonnam,
    christen_monst,
    rndghostname,
} from './do_name.js';
import { newsym } from './display.js';
import { depth, level_difficulty, on_level } from './dungeon.js';
import { game } from './gstate.js';
import { upstart } from './hacklib.js';
import {
    add_to_container,
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
    cantweararm,
    emits_light,
    is_female,
    is_giant,
    is_male,
    is_mercenary,
    is_ndemon,
    is_neuter,
    is_unicorn,
} from './mondata.js';
import { dochugw } from './monmove.js';
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
    M1_MINDLESS,
    M1_NOHANDS,
    M1_UNSOLID,
    M2_DWARF,
    M2_DOMESTIC,
    M2_ELF,
    M2_GREEDY,
    M2_NASTY,
    M3_CLOSE,
    M3_COVETOUS,
    M3_WAITFORU,
    M2_UNDEAD,
    MZ_MEDIUM,
    MZ_SMALL,
    NON_PM,
    LOW_PM,
    PM_ARCHEOLOGIST,
    PM_BLACK_LIGHT,
    PM_BLACK_UNICORN,
    PM_CAVE_SPIDER,
    PM_BUGBEAR,
    PM_CENTIPEDE,
    PM_CHAMELEON,
    PM_CHICKATRICE,
    PM_COCKATRICE,
    PM_DEMILICH,
    PM_DWARF_RULER,
    PM_DJINNI,
    PM_ELF,
    PM_ETTIN,
    PM_FOG_CLOUD,
    PM_FOX,
    PM_FOREST_CENTAUR,
    PM_GARTER_SNAKE,
    PM_GHOST,
    PM_GNOME_RULER,
    PM_GIANT,
    PM_GIANT_MUMMY,
    PM_GIANT_MIMIC,
    PM_GIANT_SPIDER,
    PM_GIANT_ZOMBIE,
    PM_GOBLIN,
    PM_GRAY_UNICORN,
    PM_GRID_BUG,
    PM_HOBBIT,
    PM_HOUSECAT,
    PM_HUMAN,
    PM_HOBGOBLIN,
    PM_JACKAL,
    PM_KOBOLD,
    PM_KOBOLD_MUMMY,
    PM_KOBOLD_ZOMBIE,
    PM_KITTEN,
    PM_KILLER_BEE,
    PM_LARGE_MIMIC,
    PM_LICH,
    PM_LICHEN,
    PM_LITTLE_DOG,
    PM_LONG_WORM,
    PM_MANES,
    PM_GIANT_EEL,
    PM_MORDOR_ORC,
    PM_SMALL_MIMIC,
    PM_NEWT,
    PM_NURSE,
    PM_ORC,
    PM_ORC_CAPTAIN,
    PM_ORC_SHAMAN,
    PM_OGRE_LEADER,
    PM_OGRE_TYRANT,
    PM_PONY,
    PM_QUANTUM_MECHANIC,
    PM_QUEEN_BEE,
    PM_SEWER_RAT,
    PM_SHOPKEEPER,
    PM_SOLDIER,
    PM_SKELETON,
    PM_SNAKE,
    PM_STALKER,
    PM_UMBER_HULK,
    PM_URUK_HAI,
    PM_VAMPIRE,
    PM_VAMPIRE_BAT,
    PM_VAMPIRE_LEADER,
    PM_WHITE_UNICORN,
    PM_WOLF,
    PM_WOOD_NYMPH,
    PM_WUMPUS,
    PM_WIZARD,
    PM_YELLOW_LIGHT,
    PM_YELLOW_MOLD,
    SPECIAL_PM,
    S_CENTAUR,
    S_DEMON,
    S_ELEMENTAL,
    S_EYE,
    S_GHOST,
    S_EEL,
    S_GIANT,
    S_GNOME,
    S_GOLEM,
    S_HUMAN,
    S_HUMANOID,
    S_JABBERWOCK,
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
    S_QUANTMECH,
    S_SNAKE,
    S_SPIDER,
    S_TROLL,
    S_VAMPIRE,
    S_VORTEX,
    S_WRAITH,
} from './monsters.js';
import {
    ARM_BONUS,
    WrappingAllowed,
    mkobj,
    mkobj_at,
    mksobj,
    next_ident,
    rnd_class,
    set_corpsenm,
    weight,
} from './obj.js';
import { vtense } from './objnam.js';
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
    BEC_DE_CORBIN,
    BOULDER,
    BOW,
    CLUB,
    COIN_CLASS,
    CORPSE,
    CROSSBOW,
    CROSSBOW_BOLT,
    DAGGER,
    DART,
    DENTED_POT,
    DILITHIUM_CRYSTAL,
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
    FLINT,
    FOOD_CLASS,
    GEM_CLASS,
    GLAIVE,
    GOLD_PIECE,
    GLASS,
    HELMET,
    HIGH_BOOTS,
    HELM_OF_OPPOSITE_ALIGNMENT,
    IRON_SHOES,
    IRON,
    KNIFE,
    K_RATION,
    LARGE_BOX,
    C_RATION,
    LEATHER,
    LEATHER_ARMOR,
    LEATHER_CLOAK,
    LEATHER_GLOVES,
    LARGE_SHIELD,
    LOW_BOOTS,
    LONG_SWORD,
    LUCERN_HAMMER,
    LUCKSTONE,
    LUMP_OF_ROYAL_JELLY,
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
    PARTISAN,
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
    RANSEUR,
    RING_MAIL,
    RING_CLASS,
    ROCK,
    ROCK_CLASS,
    SCIMITAR,
    SKELETON_KEY,
    SHORT_SWORD,
    SMALL_SHIELD,
    SPEAR,
    SCR_CREATE_MONSTER,
    SCR_EARTH,
    SCR_TELEPORTATION,
    SCROLL_CLASS,
    SLIME_MOLD,
    SLING,
    SPBOOK_CLASS,
    SPETUM,
    SPEED_BOOTS,
    STATUE,
    STUDDED_LEATHER_ARMOR,
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
import { newepri } from './priest.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { enexto_core, goodpos } from './teleport.js';
import {
    canSeeMonster,
    canSpotMonster,
    mhidden_description,
    messageAt,
    sensesMonster,
} from './startup_a11y.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { block_point, cansee, couldsee, does_block } from './vision.js';
import { get_shop_item } from './shknam.js';
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
import { begin_burn, stop_timer } from './timeout.js';
import { t_at } from './trap.js';
import { which_armor } from './worn.js';

const SUPPORTED_FLAGS = NO_MINVENT
    | MM_NOCOUNTBIRTH
    | MM_NOMSG
    | MM_NOEXCLAM
    | MM_ANGRY
    | MM_ASLEEP
    | MM_EDOG
    | MM_EPRI
    | MM_ESHK
    | MM_NOGRP
    | MM_NONAME
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
    PM_NURSE,
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
    PM_SHOPKEEPER,
]);

const STARTING_PETS = new Set([PM_LITTLE_DOG, PM_KITTEN, PM_PONY]);
const TUTORIAL_LEVEL_MONSTERS = new Set([
    PM_LICHEN,
    PM_WOLF,
    PM_YELLOW_MOLD,
]);

// include/monattk.h predicate used by muse.c's random-item selectors.
const AT_EXPL = 13;
// include/monflag.h creation-time predicates not yet exported by monsters.js.
const M1_WALLWALK = 0x00000008;
const M1_CONCEAL = 0x00000080;
const M1_SLITHY = 0x00080000;
const M2_NOPOLY = 0x00000001;
const M2_LORD = 0x00000400;
const M2_PRINCE = 0x00000800;
const M2_SHAPESHIFTER = 0x00004000;
const M2_STRONG = 0x04000000;
const MR_STONE = 0x80;
// include/monflag.h random-generation group flags.
const G_LGROUP = 0x0040;
const G_SGROUP = 0x0080;

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

// C ref: shknam.c neweshk(). makemon() calls this before assigning m_id, so
// parentmid deliberately starts at zero just like the source structure.
export function neweshk(monster) {
    if (!monster || typeof monster !== 'object')
        throw new TypeError('neweshk requires a monster instance');
    monster.mextra ??= {};
    monster.mextra.eshk = {
        parentmid: monster.m_id,
        robbed: 0,
        credit: 0,
        debit: 0,
        loan: 0,
        shoptype: 0,
        shoproom: 0,
        following: false,
        surcharge: false,
        dismiss_kops: false,
        shk: { x: 0, y: 0 },
        shd: { x: 0, y: 0 },
        shoplevel: { dnum: 0, dlevel: 0 },
        billct: 0,
        bill: [],
        bill_p: null,
        break_seq: 0,
        seq_peaceful: false,
        visitct: 0,
        customer: '',
        shknam: '',
    };
    return monster.mextra.eshk;
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

// dat/dungeon.lua names dungeon zero "The Dungeons of Doom", the main dungeon
// the hero starts in and descends through. It is the only dungeon whose levels
// this port generates: every branch off it -- the Gnomish Mines, Sokoban, the
// quest, Gehennom and the endgame -- has generation code of its own.
//
// Within it, the species allowlist below is what actually bounds the port, and
// it applies to every created monster whether the caller names the species or
// rndmonst() chooses it, so a level deep enough to roll something the port has
// not verified stops on that species rather than on its depth.
function isMainDungeonLevel(state) {
    return state.u?.uz?.dnum === 0;
}

function isTutorialLevel(state) {
    return state.u?.uz?.dnum === state.tutorial_dnum
        && state.u.uz.dlevel === 1;
}

function isArmed(species) {
    return species.mattk.some((attack) => attack.aatyp === AT_WEAP);
}

// C ref: makemon.c m_initweap(), S_OGRE.  The tyrant mapping is retained
// here even though that species remains outside the admitted D:5 reservoir.
export function ogreWeaponDivisor(species) {
    return species?.pmidx === PM_OGRE_TYRANT ? 3
        : species?.pmidx === PM_OGRE_LEADER ? 6
            : 12;
}

function setMimicCorpsenm(monster, value) {
    monster.mextra ??= {};
    monster.mextra.mcorpsenm = value;
}

function permanentlyInvisible(species) {
    return species?.pmidx === PM_STALKER
        || species?.pmidx === PM_BLACK_LIGHT;
}

// C ref: makemon.c makemon(), the shared S_LIGHT/S_ELEMENTAL switch arm.
// The class half matters: ordinary elementals do not inherit invisibility.
export function startsPermanentlyInvisible(species) {
    return (species?.mlet === S_LIGHT || species?.mlet === S_ELEMENTAL)
        && (species?.pmidx === PM_STALKER
            || species?.pmidx === PM_BLACK_LIGHT);
}

function redrawSquare(x, y, normalized) {
    if (typeof normalized.hooks?.newsym === 'function') {
        normalized.hooks.newsym(x, y, normalized);
    } else if (normalized.state === game) {
        newsym(x, y);
    }
}

function runtimeAppearanceMessage(monster, mmflags, normalized) {
    const { state } = normalized;
    if (mmflags & MM_NOMSG) return null;
    // C ref: makemon.c:1477. #wizgenesis is the one caller that passes
    // MM_NOEXCLAM, and read.c create_particular_creation() passes it on every
    // creation; every other admitted call shape leaves the surprise in.
    let exclaim = !(mmflags & MM_NOEXCLAM);
    const appearance = M_AP_TYPE(monster);
    let name = null;
    if ((canSeeMonster(monster, state)
            && (appearance === M_AP_NOTHING
                || appearance === M_AP_MONSTER))
        || sensesMonster(monster, state)) {
        name = Amonnam(monster, {
            state,
            displayRandom: normalized.displayRandom,
        });
    } else if (canSeeMonster(monster, state)) {
        // This condition is retained to mirror makemon.c's `else if
        // (canseemon())`, even though canSeeMonster() is also the first
        // condition's left operand. Furniture and object appearances are the
        // cases where the appearance-type test makes the first arm false.
        name = upstart(mhidden_description(monster, state, {
            includePrefix: false,
            includeArticle: true,
            showAlternateMonster: true,
        }));
    }
    if (!name) return null;
    // C ref: makemon.c:1483-1484. In C a mimic already wearing another
    // species' shape is a surprise however it was made, so it takes the
    // exclaiming form back even under MM_NOEXCLAM.
    //
    // set_mimic_sym() writes only M_AP_FURNITURE and M_AP_OBJECT, but keep the
    // source arm for explicit callers which supply an M_AP_MONSTER form.
    if (appearance === M_AP_MONSTER) exclaim = true;
    const distance = (monster.mx - state.u.ux) ** 2
        + (monster.my - state.u.uy) ** 2;
    const suffix = distance <= 2 ? ' next to you'
        : distance <= BOLT_LIM * BOLT_LIM ? ' close by' : '';
    return messageAt(
        `${name}${exclaim ? ' suddenly' : ''} ${vtense(name, 'appear')}`
        + `${suffix}${exclaim ? '!' : '.'}`,
        monster.mx,
        monster.my,
        state,
    );
}

function wormSlots(state) {
    if (!state.level)
        throw new Error('worm lifecycle requires an initialized level');
    if (!Object.hasOwn(state.level, 'worms')) {
        state.level.worms = Array(MAX_NUM_WORMS).fill(null);
    }
    if (!Array.isArray(state.level.worms)
        || state.level.worms.length !== MAX_NUM_WORMS) {
        throw new Error('worm lifecycle found invalid level worm slots');
    }
    return state.level.worms;
}

// C ref: worm.c get_wormno(). Slot zero remains reserved.
function get_wormno(state) {
    const slots = wormSlots(state);
    for (let wormno = 1; wormno < MAX_NUM_WORMS; ++wormno) {
        if (!slots[wormno]) return wormno;
    }
    return 0;
}

// C ref: worm.c initworm(). The array order is the source linked-list order,
// from the visible tail to the hidden segment co-located with the head.
function initworm(monster, segmentCount, state) {
    const slots = wormSlots(state);
    if (!monster.wormno || slots[monster.wormno])
        throw new Error('initworm requires a newly allocated worm slot');
    const segments = Array.from(
        { length: segmentCount + 1 },
        () => ({ x: 0, y: 0 }),
    );
    const head = segments[segments.length - 1];
    head.x = monster.mx;
    head.y = monster.my;
    slots[monster.wormno] = { segments };
}

// C ref: trap.c rnd_nextto_goodpos(). Fisher-Yates consumes rn2(8) through
// rn2(1) before any candidate is checked.
function rnd_nextto_goodpos(x, y, monster, normalized) {
    const directions = Array.from({ length: N_DIRS }, (_, index) => index);
    for (let count = N_DIRS; count > 0; --count) {
        const selected = normalized.random.rn2(count);
        const swap = directions[selected];
        directions[selected] = directions[count - 1];
        directions[count - 1] = swap;
    }
    for (const direction of directions) {
        const nx = x + xdir[direction];
        const ny = y + ydir[direction];
        if (goodpos(nx, ny, monster, 0, normalized)) return { x: nx, y: ny };
    }
    return null;
}

// C ref: worm.c place_worm_tail_randomly(). Reversing the segment chain as
// coordinates are chosen leaves the list in tail-to-head order.
function place_worm_tail_randomly(monster, x, y, normalized) {
    const record = wormSlots(normalized.state)[monster.wormno];
    if (!record?.segments?.length)
        throw new Error('place_worm_tail_randomly requires an initialized tail');
    if (record.segments.length === 1) {
        record.segments[0].x = monster.mx;
        record.segments[0].y = monster.my;
        return;
    }

    const unplaced = record.segments;
    const hiddenHead = unplaced[0];
    hiddenHead.x = x;
    hiddenHead.y = y;
    const placed = [hiddenHead];
    let previousX = x;
    let previousY = y;
    for (let index = 1; index < unplaced.length; ++index) {
        const next = rnd_nextto_goodpos(
            previousX,
            previousY,
            monster,
            normalized,
        );
        if (!next) break;
        const segment = unplaced[index];
        segment.x = previousX = next.x;
        segment.y = previousY = next.y;
        normalized.state.level.monsters[next.x][next.y] = monster;
        placed.unshift(segment);
        redrawSquare(next.x, next.y, normalized);
    }
    record.segments = placed;
}

// C ref: worm.c remove_worm(). This removes coordinate occupancy but retains
// the segment record until wormgone() releases its slot.
export function remove_worm(monster, normalized) {
    const record = wormSlots(normalized.state)[monster.wormno];
    if (!record?.segments?.length)
        throw new Error('remove_worm requires an initialized tail');
    for (const segment of record.segments) {
        if (!segment.x) continue;
        remove_monster(segment.x, segment.y, normalized.state);
        redrawSquare(segment.x, segment.y, normalized);
        segment.x = 0;
    }
}

// C ref: worm.c wormgone(). remove_worm() has already cleared map occupancy
// in mongone()'s m_detach path, so only the owned tail state remains here.
export function wormgone(monster, state) {
    const wormno = monster.wormno;
    const slots = wormSlots(state);
    if (!wormno || !slots[wormno])
        throw new Error('wormgone requires an allocated worm slot');
    monster.wormno = 0;
    slots[wormno] = null;
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

// C ref: makemon.c set_mimic_sym(), restricted to the ordinary and themed
// initial-room arms and the `rt >= SHOPBASE` shop arm.
// The descriptor which requested the Storeroom mimic overwrites m_ap_type and
// mappearance only. All RNG, temporary-object allocation, fruit state, and any
// mcorpsenm overlay established here remain intact.
export function set_mimic_sym(monster, normalized) {
    const { random, state } = normalized;
    if (!monster || heroHasProperty(state, PROT_FROM_SHAPE_CHANGERS)) return;
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
        // C's s_sym. The two shop arms that set ap_type and appear straight
        // from the shop's stock leave it undefined, which is how this port
        // spells C's two `goto assign_sym` jumps being skipped.
        let symbol;
        if (roomType >= SHOPBASE) {
            // C ref: makemon.c:2467-2486. Deeper shops disguise their mimics
            // as stock more often: the strange object wins on rn2(10) >= 2 at
            // depth two, so four shop mimics in five are one.
            if (random.rn2(10) >= depth(state.u.uz, state)) {
                symbol = S_MIMIC_DEF;
            } else {
                const stock = get_shop_item(roomType - SHOPBASE, random);
                if (stock < 0) {
                    // A negated iprobs[] itype names one object type, so the
                    // mimic wears that type itself rather than a draw from its
                    // class. Four rows carry such entries, read from the
                    // generated table: the delicatessen, quality apparel and
                    // accessories, the health food store with five, and the
                    // lighting store with nine. The last is unreachable in
                    // play, its shtypes[] prob being 0, so mkshop()'s roll
                    // never lands on it.
                    appearanceType = M_AP_OBJECT;
                    appearance = -stock;
                } else if (roomType === FODDERSHOP && stock > MAXOCLASSES) {
                    // The health food store's VEGETARIAN_CLASS. C declines to
                    // pick among every vegetarian food and takes one of two.
                    //
                    // Neither clause of this test can be told from a wrong
                    // version of itself against shtypes[] as generated. The
                    // health food store is the only row listing an itype above
                    // MAXOCLASSES, and it lists nothing else non-negative, so
                    // the two clauses are true on exactly the same inputs and
                    // `&&`, `||` and either clause alone all agree.
                    appearanceType = M_AP_OBJECT;
                    appearance = random.rn2(2)
                        ? LUMP_OF_ROYAL_JELLY
                        : SLIME_MOLD;
                } else {
                    // A general store's iprobs[] answers RANDOM_CLASS, so 42%
                    // of shops reroll here over syms[] without its two
                    // furniture entries.
                    //
                    // The `|| stock >= MAXOCLASSES` clause is unreachable
                    // against shtypes[] as generated: no row lists an itype
                    // equal to MAXOCLASSES, and the one row above it, the
                    // health food store's VEGETARIAN_CLASS, is claimed by the
                    // FODDERSHOP arm above.
                    symbol = (stock === RANDOM_CLASS || stock >= MAXOCLASSES)
                        ? MIMIC_SYMBOLS[
                            random.rn2(MIMIC_SYMBOLS.length - 2) + 2
                        ]
                        : stock;
                }
            }
        } else if (roomType !== OROOM && roomType !== THEMEROOM) {
            throw new UnsupportedMonsterCreationError(
                `mimic room type ${roomType ?? 'none'}`,
            );
        } else {
            symbol = MIMIC_SYMBOLS[random.rn2(MIMIC_SYMBOLS.length)];
        }

        // C's assign_sym label.
        if (symbol === MAXOCLASSES) {
            appearanceType = M_AP_FURNITURE;
            appearance = MIMIC_FURNITURE[
                random.rn2(MIMIC_FURNITURE.length)
            ];
        } else if (symbol !== undefined) {
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

    // C's tail re-evaluates the square only after the disguise and any
    // species overlay have consumed all their randomness. Runtime monster
    // planning supplies clone-owned hooks here because vision.c's compact
    // transparency index is shared outside the game-state object.
    const doesBlock = normalized.hooks?.doesBlock
        ?? ((bx, by, cell, env) => does_block(
            bx,
            by,
            cell,
            env.state,
        ));
    if (doesBlock(x, y, location, normalized)) {
        const blockPoint = normalized.hooks?.blockPoint
            ?? ((bx, by, env) => block_point(bx, by, env.state));
        blockPoint(x, y, normalized);
    }
}

// On the initial level, trap.c:rndmonnum_adj(3, 6) admits source difficulties
// 3 through 7. The remaining predicates mirror rndmonst()'s viable reservoir.
function isStatuaryReservoirSpecies(species) {
    return species.pmidx >= 0
        && species.pmidx < SPECIAL_PM
        && species.difficulty >= 3
        && species.difficulty <= 7
        && Boolean(species.geno & G_FREQ)
        && !(species.geno & (G_NOGEN | G_UNIQ | G_HELL));
}

// The selected ordinary level-teleport boundary generates through D:5. Its
// rndmonst() reservoir extends below and above the D:1 set but remains in the
// common non-unique, non-hell generated band. Inventory initialization still
// fail-closes by source weapon class when a later species needs a new branch.
function isOrdinaryD5ReservoirSpecies(species) {
    return species.pmidx >= 0
        && species.pmidx < SPECIAL_PM
        && species.difficulty >= 0
        && species.difficulty <= 9
        && Boolean(species.geno & G_FREQ)
        && !(species.geno & (G_NOGEN | G_UNIQ | G_HELL));
}

// dat/themerms.lua's Mausoleum chooses one of these four classes through
// mkclass(..., G_NOGEN).  On D:1 the source can reach both ordinary liches,
// every mummy, both non-unique vampires, and every generated zombie; the
// zero-frequency skeleton and hell-only master liches remain unreachable.
function isMausoleumSpecies(species) {
    const mndx = species.pmidx;
    return (mndx >= PM_LICH && mndx <= PM_DEMILICH)
        || (mndx >= PM_KOBOLD_MUMMY && mndx <= PM_GIANT_MUMMY)
        || (mndx >= PM_VAMPIRE && mndx <= PM_VAMPIRE_LEADER)
        || (mndx >= PM_KOBOLD_ZOMBIE && mndx <= PM_GIANT_ZOMBIE);
}

function assertSupportedSpecies(species) {
    const courtSpecies = species
        && (species.pmidx === PM_BUGBEAR
            || species.pmidx === PM_DWARF_RULER
            || species.pmidx === PM_GNOME_RULER
            || species.pmidx === PM_HOBGOBLIN
            || species.mlet === S_KOBOLD
            || species.mlet === S_GNOME
            || species.mlet === S_ORC);
    const beehiveSpecies = species
        && (species.pmidx === PM_QUEEN_BEE
            || species.pmidx === PM_KILLER_BEE);
    if (!species
        || (!INITIAL_LEVEL_MONSTERS.has(species.pmidx)
            && !TUTORIAL_LEVEL_MONSTERS.has(species.pmidx)
            && !isStatuaryReservoirSpecies(species)
            && !isOrdinaryD5ReservoirSpecies(species)
            && !isMausoleumSpecies(species)
            && !courtSpecies
            && !beehiveSpecies
            && species.pmidx !== PM_DJINNI
            && species.pmidx !== PM_UMBER_HULK)) {
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
    const mainDungeonLevel = isMainDungeonLevel(state);
    const tutorialLevel = isTutorialLevel(state);
    const runtimeRandomCall = mainDungeonLevel
        && !state.in_mklev
        && randomCoordinates
        && !ptr
        && mmflags === 0;
    const runtimeGroupCall = mainDungeonLevel
        && !state.in_mklev
        && !randomCoordinates
        && Boolean(ptr)
        && mmflags === MM_NOGRP;
    if (!mainDungeonLevel && !tutorialLevel) {
        throw new UnsupportedMonsterCreationError(
            'outside the main dungeon',
        );
    }
    if (tutorialLevel
        && (!state.in_mklev
            || randomCoordinates
            || !ptr
            || !TUTORIAL_LEVEL_MONSTERS.has(ptr.pmidx))) {
        throw new UnsupportedMonsterCreationError(
            'unsupported tutorial monster creation',
        );
    }
    if (randomCoordinates && !state.in_mklev && !runtimeRandomCall) {
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
    const djinniBottleCall = !state.in_mklev
        && ptr?.pmidx === PM_DJINNI
        && x === state.u?.ux
        && y === state.u?.uy
        && mmflags === MM_NOMSG;
    // read.c create_particular_creation():3315 names the species the player
    // typed and places it on the hero's own square, so makemon() reaches the
    // enexto() arm below. Its mmflags is MM_NOEXCLAM plus at most one gender
    // bit, and the three values below are the whole of what that expression
    // can build: MM_MINVIS and a second gender bit both need a parse arm
    // js/read.js refuses.
    const createParticularCall = !state.in_mklev
        && Boolean(ptr)
        && x === state.u?.ux
        && y === state.u?.uy
        && (mmflags === MM_NOEXCLAM
            || mmflags === (MM_NOEXCLAM | MM_MALE)
            || mmflags === (MM_NOEXCLAM | MM_FEMALE));
    const runtimeCall = startingPetCall || djinniBottleCall
        || runtimeRandomCall || runtimeGroupCall || createParticularCall;
    if (runtimeCall
        && (!normalized.runtimeContinuation
            || typeof normalized.runtimeContinuation !== 'object')) {
        throw new UnsupportedMonsterCreationError(
            'runtime creation without its async tail owner',
        );
    }
    if (runtimeCall && state.go?.occupation
        && typeof normalized.hooks?.stopOccupation !== 'function') {
        throw new UnsupportedMonsterCreationError(
            'runtime creation while an occupation lacks stopOccupation',
        );
    }
    const shopkeeperCall = state.in_mklev
        && ptr?.pmidx === PM_SHOPKEEPER
        && !randomCoordinates
        && mmflags === MM_ESHK;
    if ((mmflags & MM_ESHK) && !shopkeeperCall) {
        throw new UnsupportedMonsterCreationError(
            'shopkeeper extension outside shkinit',
        );
    }
    if (ptr?.pmidx === PM_SHOPKEEPER && !shopkeeperCall) {
        throw new UnsupportedMonsterCreationError(
            'shopkeeper creation outside shkinit',
        );
    }
    if (!state.in_mklev && !runtimeCall) {
        throw new UnsupportedMonsterCreationError('outside mklev');
    }
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
    if (!ptr && !(mmflags & MM_NOGRP) && !state.in_mklev
        && !runtimeRandomCall) {
        throw new UnsupportedMonsterCreationError('random monster groups');
    }
    if (!Array.isArray(state.mons) || !Array.isArray(state.mvitals))
        throw new Error('makemon requires initialized monster globals');
    if (!state.context || !Number.isInteger(state.context.ident)
        || state.context.ident <= 0
        || state.context.ident > 0xffff_ffff) {
        throw new Error('makemon requires initialized context.ident');
    }
    if (!state.u?.ualign || !state.urace)
        throw new Error('makemon requires initialized hero alignment and race');
    if (ptr?.pmidx === PM_CHAMELEON
        && !heroHasProperty(state, PROT_FROM_SHAPE_CHANGERS)) {
        if (isRogueLevel(state)) {
            throw new UnsupportedMonsterCreationError(
                'initial chameleon on the rogue level',
            );
        }
        if (!state.gl || !Object.hasOwn(state.gl, 'light_base')) {
            throw new Error(
                'initial chameleon requires initialized light globals',
            );
        }
    }
    if (!(mmflags & NO_MINVENT)
        && (state.migrating_objs || state.gm?.migrating_objs)) {
        throw new UnsupportedMonsterCreationError('migrating object delivery');
    }
    if (ptr) {
        // When makemon is called with a null ptr during mklev, the rndmonst
        // loop selects a species that may be outside the allowlist. The
        // _rndmonMklev flag, set in the rndmonst loop and inherited by
        // m_initgrp recursive calls, bypasses the allowlist for that lineage.
        if (!normalized._rndmonMklev) assertSupportedSpecies(ptr);
        if (state.mons[ptr.pmidx] !== ptr) {
            throw new UnsupportedMonsterCreationError(
                'monster record outside the mutable catalog',
            );
        }
    }
}

function heroIsBlind(state) {
    const blind = state.u?.uprops?.[BLINDED];
    return Boolean((blind?.intrinsic || blind?.extrinsic) && !blind?.blocked);
}

// C ref: makemon.c makemon_rnd_goodpos(). Level generation skips the
// visibility pass and stair fallback. Runtime generation first avoids every
// square in sight, then relaxes that constraint while retaining goodpos().
function makemon_rnd_goodpos(ptr, gpflags, normalized) {
    const { random, state } = normalized;
    const fakemon = ptr ? newMonster({ data: ptr }) : null;
    let nx;
    let ny;
    let good;
    let tryct = 0;

    do {
        nx = random.rn1(COLNO - 3, 2);
        ny = random.rn2(ROWNO);
        good = !state.in_mklev && cansee(nx, ny, state)
            ? false
            : goodpos(
                nx,
                ny,
                fakemon,
                gpflags | GP_AVOID_MONPOS,
                normalized,
            );
    } while (++tryct < 50 && !good);

    if (good) return { x: nx, y: ny };

    const xofs = nx;
    const yofs = ny;
    const firstScanStage = state.in_mklev || heroIsBlind(state) ? 1 : 0;
    let scanFlags = gpflags | GP_AVOID_MONPOS;
    for (let scanStage = firstScanStage; scanStage < 2; ++scanStage) {
        const visibleSquaresAllowed = scanStage === 1;
        // C clears GP_CHECKSCARY for the sighted unseen scan and deliberately
        // keeps it cleared for both the stair fallback and final visible scan.
        if (!visibleSquaresAllowed) scanFlags &= ~GP_CHECKSCARY;
        for (let dx = 0; dx < COLNO; ++dx) {
            for (let dy = 0; dy < ROWNO; ++dy) {
                nx = ((dx + xofs) % (COLNO - 1)) + 1;
                ny = ((dy + yofs) % (ROWNO - 1)) + 1;
                if (!visibleSquaresAllowed && cansee(nx, ny, state)) continue;
                if (goodpos(
                    nx,
                    ny,
                    fakemon,
                    scanFlags,
                    normalized,
                )) {
                    return { x: nx, y: ny };
                }
            }
        }
        if (!visibleSquaresAllowed && (!ptr || ptr.mmove)) {
            for (let stairway = state.stairs; stairway;
                stairway = stairway.next) {
                if (stairway.tolev?.dnum === state.u.uz.dnum
                    && random.rn2(2) === 0) {
                    nx = stairway.sx;
                    ny = stairway.sy;
                    break;
                }
            }
            if (goodpos(
                nx,
                ny,
                fakemon,
                scanFlags,
                normalized,
            )) {
                return { x: nx, y: ny };
            }
        }
    }
    return null;
}

// C ref: makemon.c m_initgrp(). Runtime random generation can create a small
// or large hostile group before the original monster receives inventory.
function initializeMonsterGroup(monster, countBound, mmflags, normalized) {
    const { random, state } = normalized;
    const divisor = state.u.ulevel < 3 ? 4 : state.u.ulevel < 5 ? 2 : 1;
    let count = Math.trunc(random.rnd(countBound) / divisor);
    if (!count) count = 1;
    let coordinate = { x: monster.mx, y: monster.my };

    while (count-- > 0) {
        if (peace_minded(monster.data, normalized)) continue;
        const nextCoordinate = enexto_core(
            coordinate.x,
            coordinate.y,
            monster.data,
            GP_CHECKSCARY | mmflags,
            normalized,
        ) ?? enexto_core(
            coordinate.x,
            coordinate.y,
            monster.data,
            mmflags,
            normalized,
        );
        if (!nextCoordinate) continue;
        coordinate = nextCoordinate;
        const groupMonster = makemon(
            monster.data,
            coordinate.x,
            coordinate.y,
            mmflags | MM_NOGRP,
            normalized,
        );
        if (groupMonster) {
            groupMonster.mpeaceful = false;
            groupMonster.mavenge = false;
            set_malign(groupMonster, state);
        }
    }
}

// Runtime m_initgrp() has to await each recursive makemon() tail before the
// loop can advance: that tail can stop at a tty --More-- prompt.  C applies
// the forced-hostile correction only after the recursive call returns.
async function initializeRuntimeMonsterGroup(
    monster,
    countBound,
    mmflags,
    normalized,
) {
    const { random, state } = normalized;
    const divisor = state.u.ulevel < 3 ? 4 : state.u.ulevel < 5 ? 2 : 1;
    let count = Math.trunc(random.rnd(countBound) / divisor);
    if (!count) count = 1;
    let coordinate = { x: monster.mx, y: monster.my };

    while (count-- > 0) {
        if (peace_minded(monster.data, normalized)) continue;
        const nextCoordinate = enexto_core(
            coordinate.x,
            coordinate.y,
            monster.data,
            GP_CHECKSCARY | mmflags,
            normalized,
        ) ?? enexto_core(
            coordinate.x,
            coordinate.y,
            monster.data,
            mmflags,
            normalized,
        );
        if (!nextCoordinate) continue;
        coordinate = nextCoordinate;
        const groupMonster = await makemon_runtime(
            monster.data,
            coordinate.x,
            coordinate.y,
            mmflags | MM_NOGRP,
            normalized,
        );
        if (groupMonster) {
            groupMonster.mpeaceful = false;
            groupMonster.mavenge = false;
            set_malign(groupMonster, state);
        }
    }
}

function addFreshMonsterObject(monster, obj, normalized) {
    const merged = add_to_minv(monster, obj, normalized);
    // C ref: mpickobj().  Merging and freeing the new object is ordinary
    // success; mongets() exposes that by returning null to its caller.
    return merged ? null : obj;
}

// C ref: makemon.c mongets(). Gnome rulers use the source prince-quality
// floor. Species generated during level creation can be any rndmonst result.
export function mongets(monster, otyp, normalized) {
    if (!otyp) return null;
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
    if (isRogueLevel(state)) return;
    if (!isArmed(ptr)) return;

    switch (ptr.mlet) {
    case S_DEMON:
        // C ref: makemon.c:502-523. The only admitted demon-class species is
        // a djinni, whose data does not carry M2_DEMON; it leaves this arm
        // before the general weapon roll so a later vanish drops no object.
        break;
    case S_GIANT:
        // C ref: makemon.c:180-185. Ettins get clubs, other giants get
        // boulders. Only non-ettins roll for a two-handed weapon.
        if (random.rn2(2)) {
            mongets(
                monster,
                ptr.pmidx !== PM_ETTIN ? BOULDER : CLUB,
                normalized,
            );
        }
        if (ptr.pmidx !== PM_ETTIN && !random.rn2(5)) {
            mongets(
                monster,
                random.rn2(2) ? TWO_HANDED_SWORD : BATTLE_AXE,
                normalized,
            );
        }
        break;
    case S_HUMAN:
        if (is_mercenary(ptr)) {
            // C ref: makemon.c:188-225. Soldiers and watchmen share one arm;
            // other mercenary types (sergeant, lieutenant, captain) have
            // distinct weapons but are all G_NOGEN, so they cannot appear
            // from rndmonst. Use the soldier/watchman arm for all types.
            let w1 = 0;
            let w2 = 0;
            if (!random.rn2(3)) {
                do {
                    w1 = random.rn1(
                        BEC_DE_CORBIN - PARTISAN + 1,
                        PARTISAN,
                    );
                } while (state.objects[w1].oc_skill !== P_POLEARMS);
                w2 = random.rn2(2) ? DAGGER : KNIFE;
            } else {
                w1 = random.rn2(2) ? SPEAR : SHORT_SWORD;
            }
            if (w1) mongets(monster, w1, normalized);
            if (!w2 && w1 !== DAGGER && !random.rn2(4)) w2 = KNIFE;
            if (w2) mongets(monster, w2, normalized);
        } else if (ptr.mflags2 & M2_ELF) {
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
        }
        // Shopkeepers, were-creatures, and other non-elf, non-mercenary
        // humans (priests, quest guardians, all G_NOGEN) receive no weapons
        // from m_initweap. C breaks here without an else arm.
        break;
    case S_HUMANOID:
        if (ptr.pmidx === PM_HOBBIT) {
            switch (random.rn2(3)) {
            case 0:
                mongets(monster, DAGGER, normalized);
                break;
            case 1:
                mongets(monster, ELVEN_DAGGER, normalized);
                break;
            case 2:
                mongets(monster, SLING, normalized);
                m_initthrow(
                    monster,
                    !random.rn2(4) ? FLINT : ROCK,
                    6,
                    normalized,
                );
                break;
            }
            if (!random.rn2(10))
                mongets(monster, ELVEN_MITHRIL_COAT, normalized);
            if (!random.rn2(10))
                mongets(monster, DWARVISH_CLOAK, normalized);
        } else if (ptr.mflags2 & M2_DWARF) {
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
            !random.rn2(ogreWeaponDivisor(ptr)) ? BATTLE_AXE : CLUB,
            normalized,
        );
        break;
    case S_TROLL:
        if (!random.rn2(2)) {
            switch (random.rn2(4)) {
            case 0:
                mongets(monster, RANSEUR, normalized);
                break;
            case 1:
                mongets(monster, PARTISAN, normalized);
                break;
            case 2:
                mongets(monster, GLAIVE, normalized);
                break;
            case 3:
                mongets(monster, SPETUM, normalized);
                break;
            }
        }
        break;
    case S_CENTAUR:
        if (random.rn2(2)) {
            if (ptr.pmidx === PM_FOREST_CENTAUR) {
                mongets(monster, BOW, normalized);
                m_initthrow(monster, ARROW, 12, normalized);
            } else {
                mongets(monster, CROSSBOW, normalized);
                m_initthrow(monster, CROSSBOW_BOLT, 12, normalized);
            }
        }
        break;
    case S_WRAITH:
        mongets(monster, KNIFE, normalized);
        mongets(monster, LONG_SWORD, normalized);
        break;
    default:
        // C ref: makemon.c:526-567. The general case applies to gnomes and
        // every other armed species not handled by a specific case above.
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
        const helmet = which_armor(monster, W_ARMH);
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
export function mkmonmoney(monster, amount, normalized) {
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
    if (isRogueLevel(state)) return;

    if (ptr.mlet === S_HUMAN && is_mercenary(ptr)) {
        // C ref: makemon.c:602-701. All mercenary types are G_NOGEN; only
        // PM_SOLDIER is reachable from rndmonst. Use mac=3 (soldier value)
        // for all types, matching the ported armor rounds.
        let mac = 3;
        let obj;
        const addArmorClass = () => {
            if (obj) mac += ARM_BONUS(obj, state);
            obj = null;
        };

        if (random.rn2(5)) {
            obj = mongets(
                monster,
                random.rn2(3) ? RING_MAIL : STUDDED_LEATHER_ARMOR,
                normalized,
            );
        } else {
            obj = mongets(monster, LEATHER_ARMOR, normalized);
        }
        addArmorClass();

        if (mac < 10 && random.rn2(3)) {
            obj = mongets(monster, HELMET, normalized);
        } else if (mac < 10 && random.rn2(2)) {
            obj = mongets(monster, DENTED_POT, normalized);
        }
        addArmorClass();

        if (mac < 10 && random.rn2(3)) {
            obj = mongets(monster, SMALL_SHIELD, normalized);
        } else if (mac < 10 && random.rn2(2)) {
            obj = mongets(monster, LARGE_SHIELD, normalized);
        }
        addArmorClass();

        if (mac < 10 && random.rn2(3)) {
            obj = mongets(monster, LOW_BOOTS, normalized);
        } else if (mac < 10 && random.rn2(2)) {
            obj = mongets(monster, HIGH_BOOTS, normalized);
        }
        addArmorClass();

        if (mac < 10 && random.rn2(3)) {
            obj = mongets(monster, LEATHER_GLOVES, normalized);
        } else if (mac < 10 && random.rn2(2)) {
            obj = mongets(monster, LEATHER_CLOAK, normalized);
        }
        addArmorClass();

        if (!random.rn2(3)) mongets(monster, K_RATION, normalized);
        if (!random.rn2(2)) mongets(monster, C_RATION, normalized);
    } else if (ptr.mlet === S_NYMPH) {
        if (!random.rn2(2)) mongets(monster, MIRROR, normalized);
        if (!random.rn2(2))
            mongets(monster, POT_OBJECT_DETECTION, normalized);
    } else if (ptr.mlet === S_GIANT && is_giant(ptr)) {
        // C ref: makemon.c:738-750. All true giants carry gems. The
        // minotaur arm (WAN_DIGGING) is for G_NOGEN species only.
        for (let count = random.rn2(Math.trunc(monster.m_lev / 2));
            count > 0;
            --count) {
            const obj = mksobj(
                rnd_class(
                    DILITHIUM_CRYSTAL,
                    LUCKSTONE - 1,
                    normalized,
                ),
                false,
                false,
                normalized,
            );
            obj.quan = random.rn1(2, 3);
            obj.owt = weight(obj, normalized);
            addFreshMonsterObject(monster, obj, normalized);
        }
    } else if (ptr.mlet === S_MUMMY) {
        if (random.rn2(7)) mongets(monster, MUMMY_WRAPPING, normalized);
    } else if (ptr.mlet === S_LEPRECHAUN) {
        mkmonmoney(
            monster,
            random.d(level_difficulty(state), 30),
            normalized,
        );
    } else if (ptr.pmidx === PM_SHOPKEEPER) {
        mongets(monster, SKELETON_KEY, normalized);
        switch (random.rn2(4)) {
        case 0:
            mongets(monster, WAN_MAGIC_MISSILE, normalized);
            // FALLTHROUGH
        case 1:
            mongets(monster, POT_EXTRA_HEALING, normalized);
            // FALLTHROUGH
        case 2:
            mongets(monster, POT_HEALING, normalized);
            // FALLTHROUGH
        case 3:
            mongets(monster, WAN_STRIKING, normalized);
            break;
        }
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
        const carriedCandle = addFreshMonsterObject(
            monster,
            candle,
            normalized,
        );
        if (carriedCandle
            && !state.level.at(monster.mx, monster.my).lit) {
            begin_burn(carriedCandle, false, normalized);
        }
    } else if (ptr.mlet === S_QUANTMECH) {
        // C ref: makemon.c:776-795. Schrodinger's cat in a large box.
        if (!random.rn2(20) && ptr.pmidx === PM_QUANTUM_MECHANIC) {
            const box = mksobj(LARGE_BOX, false, false, normalized);
            const catcorpse = mksobj(CORPSE, true, false, normalized);
            if (catcorpse) {
                box.spe = 1; // flag for SchroedingersBox
                set_corpsenm(catcorpse, PM_HOUSECAT, normalized);
                stop_timer(ROT_CORPSE, catcorpse, state, normalized);
                add_to_container(box, catcorpse, normalized);
                box.owt = weight(box, normalized);
            }
            addFreshMonsterObject(monster, box, normalized);
        }
    }

    if (ptr.pmidx === PM_SOLDIER && random.rn2(13)) return;

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

function uniqueWornObject(monster, mask) {
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

// The supported initial-level subset contains only these horned species.
function supportedSpeciesHasHorns(species) {
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

// C ref: worn.c racial_exception().  raceptr(monster) is monster.data for a
// non-hero monster; the source currently has one acceptable combination and
// no unacceptable ones.
export function racial_exception(monster, obj) {
    if (monster.data.pmidx === PM_HOBBIT
        && (obj.otyp === ELVEN_LEATHER_HELM
            || obj.otyp === ELVEN_MITHRIL_COAT
            || obj.otyp === ELVEN_CLOAK
            || obj.otyp === ELVEN_SHIELD
            || obj.otyp === ELVEN_BOOTS)) {
        return 1;
    }
    return 0;
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
    env,
    racialException = false,
) {
    const state = env.state;
    // C ref: worn.c m_dowear_type():814. A monster part-way through putting
    // something on chooses nothing more this turn.
    if (monster.mfrozen) return;
    const old = uniqueWornObject(monster, mask);
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
            && supportedSpeciesHasHorns(monster.data)
            && !isFlimsy(obj, state)) {
            continue;
        }
        if (mask === W_ARM && racialException
            && racial_exception(monster, obj) < 1) {
            continue;
        }
        if (obj.owornmask) continue;
        if (best
            && ARM_BONUS(best, state) + armorExtraPreference(monster, best)
                >= ARM_BONUS(obj, state)
                    + armorExtraPreference(monster, obj)) {
            continue;
        }
        best = obj;
    }

    if (!best || best === old) return;
    if (!creation) {
        // C ref: worn.c m_dowear_type():912-960. Outside creation the same
        // choice costs a turn and is announced: C prints "<Mon> [removes
        // <old> and ]puts on <new>." through pline_mon(), adds both pieces'
        // oc_delay to mfrozen and clears mcanmove, and may print an artifact
        // light or a sudden-invisibility line. None of that is ported, and
        // the creation-time effect below is not a substitute for it, so a
        // live wearer goes to its caller's boundary instead.
        wearArmorOperation(env)(monster, best, old, env);
        return;
    }
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

// The wearing effect outside monster creation. movemon_singlemon()'s
// I_SPECIAL arm is the only caller that passes creation = false, and it comes
// from a fail-closed boundary, so the operation is required rather than
// defaulted: silently doing nothing there would drop a turn C spends.
function wearArmorOperation(env) {
    const operation = env.wearArmor;
    if (typeof operation !== 'function') {
        throw new TypeError(
            'm_dowear outside creation requires a wearArmor operation',
        );
    }
    return operation;
}

// C ref: worn.c m_dowear()/m_dowear_type(). The selection is complete for the
// species and equipment reachable from initial generation; only the
// creation-time effect is ported, and wearArmorOperation() owns the rest.
export function m_dowear(monster, creation = false, env = {}) {
    const state = env.state ?? game;
    const wearEnv = { ...env, state };
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

    m_dowear_type(monster, W_AMUL, creation, wearEnv);
    const canWearArmor = !cantweararm(species);
    if (canWearArmor && !(monster.misc_worn_check & W_ARM))
        m_dowear_type(monster, W_ARMU, creation, wearEnv);
    if (canWearArmor || WrappingAllowed(species))
        m_dowear_type(monster, W_ARMC, creation, wearEnv);
    m_dowear_type(monster, W_ARMH, creation, wearEnv);
    if (!monster.mw || !state.objects?.[monster.mw.otyp]?.oc_bimanual)
        m_dowear_type(monster, W_ARMS, creation, wearEnv);
    m_dowear_type(monster, W_ARMG, creation, wearEnv);
    if (!(bodyFlags & M1_SLITHY) && species.mlet !== S_CENTAUR)
        m_dowear_type(monster, W_ARMF, creation, wearEnv);
    // C ref: worn.c m_dowear():792-795 splits this into two calls, passing
    // FALSE when can_wear_armor holds and RACE_EXCEPTION (TRUE) when it does
    // not. The suit slot itself is never skipped, so the branch carries no
    // information beyond the negation folded in here: a form that cannot wear
    // a suit is the one form allowed a racial exception to that refusal.
    m_dowear_type(monster, W_ARM, creation, wearEnv, !canWearArmor);
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

// C refs: mon.c mongone() (3266-3283), with mon_leaving_level() (2695-2730)
// and m_detach() (2733-2803) merged into it for the due_to_death FALSE case.
// This is the level-generation subset used to discard a temporary monster
// after its inventory has been transferred elsewhere. The dead monster stays
// linked on level.monlist until dmonsfree(), just as C's fmon does.
//
// js/mon.js holds the separate mon_leaving_level() and m_detach() the kill
// path uses. This copy does not call them because m_detach() is async there
// and the level build that reaches this function is synchronous throughout;
// js/mon.js states the split in full above its killed() group. The two are
// not interchangeable in the other direction either: the mimic reveal at
// 2721-2722 is ported inline here and refused there.
export function mongone(monster, env = {}) {
    const normalized = creationEnv(env);
    const { state } = normalized;
    if (!monster || typeof monster !== 'object')
        throw new TypeError('mongone requires a monster instance');
    if (!monsterOnLevelChain(monster, state))
        throw new Error('mongone: monster is not on the level chain');
    if (monster.mstate & MON_DETACH)
        throw new Error('mongone: monster is already detached');
    if (monster.isgd || monster.mleashed
        || monster.iswiz || state.u?.ustuck === monster
        || state.u?.usteed === monster) {
        throw new UnsupportedMonsterCreationError(
            'temporary monster with unsupported departure state',
        );
    }

    monster.mhp = 0;
    // C ref: steal.c mdrop_special_objs(). Even with both resistance
    // percentages set to zero, obj_resists() consumes rn2(100) for each
    // ordinary inventory object before mongone() discards it. The admitted
    // temporary-monster callers cannot create protected or quest objects.
    for (let obj = monster.minvent; obj; obj = obj.nobj) {
        if (obj_resists(obj, 0, 0, normalized)) {
            throw new UnsupportedMonsterCreationError(
                'temporary monster carrying a protected object',
            );
        }
    }
    discard_minvent(monster, false, normalized);

    if (monster.mx > 0 && emits_light(monster.data))
        del_light_source(LS_MONSTER, monster, state);

    const onmap = isok(monster.mx, monster.my)
        && m_at(monster.mx, monster.my, state) === monster;
    monster.mtrapped = false;
    if (onmap) {
        if (monster.wormno) remove_worm(monster, normalized);
        else remove_monster(monster.mx, monster.my, state);
        monster.mundetected = false;
        if (monster.m_ap_type) {
            monster.m_ap_type = 0;
            monster.mappearance = 0;
            if (monster.mextra && 'mcorpsenm' in monster.mextra)
                monster.mextra.mcorpsenm = NON_PM;
        }
        redrawSquare(monster.mx, monster.my, normalized);
    }
    if (monster.wormno) wormgone(monster, state);
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

function pm_to_cham(mndx, state) {
    const species = state.mons?.[mndx];
    return species && (species.mflags2 & M2_SHAPESHIFTER) ? mndx : NON_PM;
}

function isPlaceholderForm(mndx) {
    return mndx === PM_ORC || mndx === PM_GIANT
        || mndx === PM_ELF || mndx === PM_HUMAN;
}

function pick_animal(normalized) {
    const animals = [];
    for (let mndx = LOW_PM; mndx < SPECIAL_PM; ++mndx) {
        if (normalized.state.mons[mndx].mflags1 & M1_ANIMAL)
            animals.push(mndx);
    }
    if (!animals.length)
        throw new Error('pick_animal requires at least one animal form');
    return animals[normalized.random.rn2(animals.length)];
}

// C ref: mon.c pickvampshape(), for the ordinary vampire variants reachable
// from the Mausoleum's class descriptor.
export function pick_vampire_shape(monster, normalized) {
    const { random, state } = normalized;
    const uppercaseOnly = isRogueLevel(state);
    let mndx = NON_PM;
    if (monster.cham === PM_VAMPIRE_LEADER
        && !random.rn2(10)
        && !uppercaseOnly) {
        const typ = state.level.at(monster.mx, monster.my).typ;
        if (!IS_POOL(typ) && !IS_LAVA(typ)) mndx = PM_WOLF;
    }
    if (mndx === NON_PM) {
        mndx = !random.rn2(4) && !uppercaseOnly
            ? PM_FOG_CLOUD : PM_VAMPIRE_BAT;
    }
    if ((state.mvitals[mndx].mvflags & G_GENOD)
        || (monster.data !== state.mons[monster.cham]
            && !random.rn2(4))) {
        return monster.cham;
    }
    return mndx;
}

// C ref: mon.c select_newcham_form(), for the ordinary chameleon and the two
// non-unique vampires reachable during initial themed-room generation.
function select_newcham_form(monster, normalized) {
    let mndx = NON_PM;
    if (monster.cham === PM_CHAMELEON) {
        if (!normalized.random.rn2(3)) mndx = pick_animal(normalized);
    } else if (monster.cham === PM_VAMPIRE
               || monster.cham === PM_VAMPIRE_LEADER) {
        return pick_vampire_shape(monster, normalized);
    } else {
        throw new UnsupportedMonsterCreationError(
            `initial shapechanger ${monster.cham}`,
        );
    }
    if (mndx === NON_PM) {
        mndx = normalized.random.rn1(
            SPECIAL_PM - LOW_PM,
            LOW_PM,
        );
    }
    return mndx;
}

// C ref: mon.c accept_newcham_form(). Random initial selection cannot return
// an endgame player-monster because those records begin at SPECIAL_PM.
function accept_newcham_form(monster, mndx, state) {
    if (!Number.isInteger(mndx) || mndx < LOW_PM || mndx >= SPECIAL_PM)
        return null;
    const species = state.mons[mndx];
    if (state.mvitals[mndx].mvflags & G_GENOD) return null;
    if (isPlaceholderForm(mndx)) return null;
    if ((species.mflags2 & M2_SHAPESHIFTER)
        && mndx === monster.cham) {
        return species;
    }
    return species.mflags2 & M2_NOPOLY ? null : species;
}

// C ref: mon.c mgender_from_permonst(). A natural chameleon is not a vampire
// shifter, but vampire target forms still suppress the ordinary 10% flip.
function mgender_from_permonst(monster, species, random) {
    if (is_male(species)) {
        monster.female = false;
    } else if (is_female(species)) {
        monster.female = true;
    } else if (!is_neuter(species)
               && !random.rn2(10)
               && species.mlet !== S_VAMPIRE
               && monster.cham !== PM_VAMPIRE
               && monster.cham !== PM_VAMPIRE_LEADER) {
        monster.female = !monster.female;
    }
}

// C ref: mondata.c set_mon_data(). Only unused movement in a slower form is
// prorated; faster forms retain the already accumulated movement.
export function set_mon_data(monster, species) {
    const oldSpeed = monster.data?.mmove ?? 0;
    monster.data = species;
    monster.mnum = species.pmidx;
    if (monster.movement && species.mmove < oldSpeed) {
        monster.movement *= species.mmove;
        if (oldSpeed > 0)
            monster.movement = Math.trunc(monster.movement / oldSpeed);
    }
}

// C ref: mon.c newcham(), for the just-created supported natural
// shapechangers. These paths have no inventory, leash, disguise, tail, or
// hero attachment. The same state transition handles makemon()'s random
// initial form and sp_lev.c:create_monster()'s explicit waiting-vampire
// reversion.
function apply_newcham_form(monster, target, normalized) {
    const { random, state } = normalized;
    const olddata = monster.data;
    if (target === olddata) return false;

    mgender_from_permonst(monster, target, random);
    const oldHp = monster.mhp;
    const oldMax = monster.mhpmax;
    newmonhp(monster, target.pmidx, normalized);
    monster.mhp = Math.trunc(oldHp * monster.mhp / oldMax);
    if (monster.mhp < 0 || monster.mhp > monster.mhpmax)
        monster.mhp = monster.mhpmax;
    if (!monster.mhp) monster.mhp = 1;

    set_mon_data(monster, target);

    const oldLight = emits_light(olddata);
    const newLight = emits_light(target);
    if (oldLight !== newLight) {
        if (oldLight)
            del_light_source(LS_MONSTER, monster, state);
        if (newLight) {
            new_light_source(
                monster.mx,
                monster.my,
                newLight,
                LS_MONSTER,
                monster,
                state,
            );
        }
    }
    if (!monster.perminvis || permanentlyInvisible(olddata))
        monster.perminvis = permanentlyInvisible(target);
    monster.minvis = monster.invis_blkd ? false : monster.perminvis;
    if (monster.mundetected) hideunder(monster, state);

    if (target.pmidx === PM_LONG_WORM) {
        monster.wormno = get_wormno(state);
        if (monster.wormno) {
            initworm(monster, random.rn2(5), state);
            place_worm_tail_randomly(
                monster,
                monster.mx,
                monster.my,
                normalized,
            );
        }
    }

    monster.meverseen = false;
    redrawSquare(monster.mx, monster.my, normalized);
    // possibly_unwield(), mon_break_armor(), and mselftouch() are drawless for
    // this empty inventory; check_gear_next_turn() still schedules a recheck.
    monster.misc_worn_check |= I_SPECIAL;
    return true;
}

// C ref: mon.c newcham(..., NULL, NO_NC_FLAGS). Chameleon targets span the
// polymorphable pre-SPECIAL_PM catalog; vampires use their controlled bat,
// fog-cloud, and wolf target set.
function newcham_initial(monster, normalized) {
    const { state } = normalized;
    let target = null;
    for (let attempt = 0; attempt < 20 && !target; ++attempt) {
        target = accept_newcham_form(
            monster,
            select_newcham_form(monster, normalized),
            state,
        );
    }
    return target ? apply_newcham_form(monster, target, normalized) : false;
}

function distressShapechangeName(monster) {
    const assigned = monster.mextra?.mgivenname;
    if (assigned) return String(assigned);
    const names = monster.data?.pmnames ?? [];
    return names[monster.female ? 1 : 0] ?? names[2] ?? 'monster';
}

function distressShapechangeArticle(name) {
    const text = String(name);
    const lower = text.toLowerCase();
    if (lower === 'molten lava' || lower === 'iron bars' || lower === 'ice'
        || lower.startsWith('the ')) {
        return '';
    }
    const first = lower[0] ?? '';
    const vowel = 'aeiou'.includes(first);
    const oneException = lower.startsWith('one')
        && (!lower[3] || '-_ '.includes(lower[3]));
    const longU = lower.startsWith('eu')
        || lower.startsWith('uke')
        || lower.startsWith('ukulele')
        || lower.startsWith('unicorn')
        || lower.startsWith('uranium')
        || lower.startsWith('useful');
    const pronouncedX = first === 'x'
        && !'aeiou'.includes(lower[1] ?? '');
    return (vowel && !oneException && !longU) || pronouncedX ? 'an' : 'a';
}

function distressShapechangeOldName(monster) {
    const assigned = monster.mextra?.mgivenname;
    if (assigned) {
        const text = String(assigned);
        return text ? text[0].toUpperCase() + text.slice(1) : text;
    }
    const name = distressShapechangeName(monster);
    const article = monster.mtame ? 'Your' : 'The';
    return `${article} ${name}`;
}

function distressShapechangeNewName(monster) {
    const name = distressShapechangeName(monster);
    return `${distressShapechangeArticle(name)} ${name}`.trim();
}

function requiredDistressShapechangeOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(
            `newcham_distress requires a ${name} operation`,
        );
    }
    return operation;
}

function preflightDistressShapechange(monster, normalized) {
    const { state } = normalized;
    const supportedShifter = monster?.cham === PM_CHAMELEON
        || monster?.cham === PM_VAMPIRE
        || monster?.cham === PM_VAMPIRE_LEADER;
    if (!supportedShifter) {
        throw new UnsupportedMonsterCreationError(
            `distress shapechanger ${monster?.cham}`,
        );
    }
    // The initial-D:1 forms admitted here are empty-inventory chameleons and
    // Mausoleum vampires. General newcham() has additional owners for worm
    // teardown, disguise, leash/steed/engulfment, armor, wielding, and
    // self-touch. Refuse those states before selection can consume RNG.
    if (monster.minvent || monster.wormno || monster.m_ap_type
        || monster.mleashed || state.u?.ustuck === monster
        || state.u?.usteed === monster) {
        throw new UnsupportedMonsterCreationError(
            'distress shapechanger attachment state',
        );
    }
    if (!Number.isInteger(monster.mhpmax) || monster.mhpmax <= 0
        || !Number.isInteger(monster.mhp) || monster.mhp <= 0) {
        throw new TypeError(
            'newcham_distress requires positive integer hit points',
        );
    }
}

export function preflight_newcham_distress(monster, rawEnv = {}) {
    const normalized = creationEnv(rawEnv);
    preflightDistressShapechange(monster, normalized);
    requiredDistressShapechangeOperation(normalized, 'canSpotMonster');
    requiredDistressShapechangeOperation(normalized, 'message');
    return true;
}

// C ref: mon.c newcham(..., NC_SHOW_MSG), bounded to the empty-inventory
// natural shapechangers which can originate while D:1 is being built.
// Selection, HP reroll/scaling, form state, redraw, and visibility-dependent
// feedback retain source order. The broader attachment and equipment cases
// remain explicit seams in preflightDistressShapechange().
export async function newcham_distress(
    monster,
    target = null,
    rawEnv = {},
) {
    const normalized = creationEnv(rawEnv);
    const { state } = normalized;
    preflightDistressShapechange(monster, normalized);
    const canSpotMonster = requiredDistressShapechangeOperation(
        normalized,
        'canSpotMonster',
    );
    const message = requiredDistressShapechangeOperation(
        normalized,
        'message',
    );

    const seenOrSensed = Boolean(canSpotMonster(monster, normalized));
    const oldName = distressShapechangeOldName(monster);
    let selected = target;
    if (selected == null) {
        for (let attempt = 0; attempt < 20 && !selected; ++attempt) {
            selected = accept_newcham_form(
                monster,
                select_newcham_form(monster, normalized),
                state,
            );
        }
        if (!selected) return false;
    } else {
        const mndx = selected.pmidx;
        if (!Number.isInteger(mndx)
            || state.mons?.[mndx] !== selected) {
            throw new TypeError(
                'newcham_distress target must be a catalog monster',
            );
        }
        if (state.mvitals[mndx].mvflags & G_GENOD) return false;
    }
    if (!apply_newcham_form(monster, selected, normalized)) return false;

    const canSpotNow = Boolean(canSpotMonster(monster, normalized));
    if (!canSpotNow) {
        if (seenOrSensed)
            await message(`${oldName} disappears!`, state, normalized);
    } else if (!seenOrSensed) {
        const newName = distressShapechangeNewName(monster);
        const appeared = newName
            ? newName[0].toUpperCase() + newName.slice(1)
            : newName;
        await message(`${appeared} appears!`, state, normalized);
    } else {
        await message(
            `${oldName} turns into ${distressShapechangeNewName(monster)}!`,
            state,
            normalized,
        );
    }
    return true;
}

// Bounded explicit-target form of mon.c:newcham() for
// sp_lev.c:create_monster(). The caller has just created an implicitly shifted
// waiting vampire, so none of general newcham()'s inventory, tail, disguise,
// leash, steed, or hero-attachment branches may be live.
export function restore_waiting_vampire(monster, rawEnv = {}) {
    const normalized = creationEnv(rawEnv);
    const { state } = normalized;
    const isVampireShifter = monster?.cham === PM_VAMPIRE
        || monster?.cham === PM_VAMPIRE_LEADER;
    const isSupportedShift = monster?.mnum === PM_VAMPIRE_BAT
        || monster?.mnum === PM_FOG_CLOUD
        || monster?.mnum === PM_WOLF;
    const hasUnsupportedAttachment = Boolean(
        monster?.minvent
        || monster?.wormno
        || monster?.m_ap_type
        || monster?.mleashed
        || state.u?.ustuck === monster
        || state.u?.usteed === monster,
    );
    if (!isVampireShifter || !isSupportedShift
        || monster.data?.mlet === S_VAMPIRE
        || hasUnsupportedAttachment) {
        throw new UnsupportedMonsterCreationError(
            'waiting-vampire reversion state',
        );
    }
    const mndx = monster.cham;
    const target = state.mons?.[mndx];
    if (!target || target.pmidx !== mndx)
        throw new UnsupportedMonsterCreationError('waiting-vampire target');
    if (state.mvitals[mndx].mvflags & G_GENOD) return false;
    return apply_newcham_form(monster, target, normalized);
}

function finishMonsterInventoryAndStrategy(
    monster,
    ptr,
    allowMinvent,
    normalized,
) {
    const { random } = normalized;
    if (allowMinvent) {
        if (isArmed(ptr)) m_initweap(monster, normalized);
        m_initinv(monster, normalized);
        m_dowear(monster, true, normalized);

        const saddleRoll = random.rn2(100);
        if (!saddleRoll && (ptr.mflags2 & M2_DOMESTIC)
            && can_saddle(monster)
            && !which_armor(monster, W_SADDLE)) {
            put_saddle_on_mon(null, monster, normalized);
        }
    } else {
        if (monster.minvent) discard_minvent(monster, true, normalized);
        monster.minvent = null;
    }

    // C ref: makemon.c makemon() (1457-1466). MM_NOWAIT is not among this
    // port's admitted flags, so every supported call takes the ordinary arm.
    if (ptr.mflags3) {
        if (ptr.mflags3 & M3_WAITFORU)
            monster.mstrategy |= STRAT_WAITFORU;
        if (ptr.mflags3 & M3_CLOSE)
            monster.mstrategy |= STRAT_CLOSE;
        if (ptr.mflags3 & (M3_WAITFORU | M3_CLOSE | M3_COVETOUS))
            monster.mstrategy |= STRAT_APPEARMSG;
    }
    // deliver_obj_to_mon() is excluded in preflightCreation() whenever a
    // supported call allows inventory and migrating objects are present.
}

async function finishRuntimeCreationTail(monster, mmflags, normalized) {
    const { state } = normalized;
    redrawSquare(monster.mx, monster.my, normalized);
    const appearance = runtimeAppearanceMessage(monster, mmflags, normalized);
    if (appearance) {
        await normalized.norepMessage(appearance, state, normalized);
    }
    await dochugw(monster, false, {
        ...normalized,
        state,
        canSpotMonster: (subject) => canSpotMonster(subject, state),
        couldSee: (x, y) => couldsee(x, y, state),
        stopOccupation: () => normalized.hooks.stopOccupation(
            monster,
            normalized,
        ),
    });
}

// C ref: makemon.c makemon(). This implements the level-one, explicit-square
// call shapes needed by fill_ordinary_room(), the Ghost, Cloud, Garden, and
// Storeroom themed fills, dog.c:makedog(), plus the level-generation random
// coordinate shape needed by temporary Statuary monsters. Outside mklev(), it
// also admits the exact initial-D:1 random-generation call
// makemon(NULL, 0, 0, NO_MM_FLAGS), that call's explicit-coordinate,
// MM_NOGRP recursive group members, and read.c create_particular_creation()'s
// named species on the hero's own square under MM_NOEXCLAM.
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
        let attempts = 0;
        // During mklev, rndmonst draws from the full reservoir, which includes
        // species outside the allowlist.  Mark the env so preflightCreation
        // skips assertSupportedSpecies for this lineage (group members created
        // by m_initgrp inherit the same env via creationEnv spread).
        if (state.in_mklev) normalized._rndmonMklev = true;
        do {
            ptr = rndmonst(normalized);
            if (!ptr) return null;
            if (!normalized._rndmonMklev) assertSupportedSpecies(ptr);
        } while (++attempts <= 50
            && !goodpos(
                x,
                y,
                newMonster({ data: ptr }),
                gpflags,
                normalized,
            ));
    }
    const mndx = ptr.pmidx;
    let allowMinvent = !(mmflags & NO_MINVENT);
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
    if (mmflags & MM_ESHK) neweshk(monster);
    if (mmflags & MM_EPRI) newepri(monster);
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
    } else if (startsPermanentlyInvisible(ptr)) {
        monster.perminvis = true;
        monster.minvis = true;
    } else if (ptr.mlet === S_EEL) {
        if (state.in_mklev) hideunder(monster, state);
    } else if (ptr.mlet === S_LEPRECHAUN) {
        monster.msleeping = true;
    } else if (ptr.mlet === S_JABBERWOCK || ptr.mlet === S_NYMPH) {
        if (random.rn2(5) && !state.u.uhave.amulet) {
            monster.msleeping = true;
        }
    } else if (ptr.mlet === S_ORC && state.urace.mnum === PM_ELF) {
        monster.mpeaceful = false;
    } else if (is_unicorn(ptr)
        && Math.sign(state.u.ualign.type) === Math.sign(ptr.maligntyp)) {
        monster.mpeaceful = true;
    }
    const lightRange = emits_light(monster.data);
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
    const naturalShape = pm_to_cham(mndx, state);
    if (!heroHasProperty(state, PROT_FROM_SHAPE_CHANGERS)
        && naturalShape !== NON_PM) {
        monster.cham = naturalShape;
        if (newcham_initial(monster, normalized)) allowMinvent = false;
    } else if (mndx === PM_GHOST) {
        // C ref: makemon.c -- MM_NONAME suppresses the random ghost name.
        // savebones() passes MM_NONAME and then christen_monst separately.
        if (!(mmflags & MM_NONAME)) {
            christen_monst(monster, rndghostname(normalized), {
                updateInventory: () => update_inventory(normalized),
            });
        }
    }
    if (state.in_mklev
        && mklevSleeperSpecies(ptr)
        && !state.u.uhave.amulet
        && random.rn2(5)) {
        monster.msleeping = true;
    }
    if (byHero && !state.in_mklev) {
        // makemon.c calls set_apparxy() here. At initial startup the hero is
        // visible and undisplaced, so the source result is exact and drawless.
        monster.mux = state.u.ux;
        monster.muy = state.u.uy;
    }
    set_malign(monster, state);

    if (!state.in_mklev) {
        const continuation = normalized.runtimeContinuation;
        if (!continuation || continuation.claimed) {
            throw new UnsupportedMonsterCreationError(
                'runtime creation without an unused async continuation',
            );
        }
        Object.assign(continuation, {
            claimed: true,
            monster,
            ptr,
            anymon,
            allowMinvent,
        });
        return monster;
    }

    if (anymon && !(mmflags & MM_NOGRP)) {
        if ((ptr.geno & G_SGROUP) && random.rn2(2)) {
            initializeMonsterGroup(monster, 3, mmflags, normalized);
        } else if (ptr.geno & G_LGROUP) {
            initializeMonsterGroup(
                monster,
                random.rn2(3) ? 10 : 3,
                mmflags,
                normalized,
            );
        }
    }
    finishMonsterInventoryAndStrategy(
        monster,
        ptr,
        allowMinvent,
        normalized,
    );

    return monster;
}

// Async adapter for makemon.c's runtime suffix.  The synchronous constructor
// stops immediately after set_malign(); this continuation then preserves C's
// awaited recursive group tails, parent inventory, and final output order.
export async function makemon_runtime(ptr, x, y, mmflags = 0, env = {}) {
    const message = env.message === undefined ? ttyPline : env.message;
    const norepMessage = env.norepMessage === undefined
        ? env.message === undefined ? ttyNorep : message
        : env.norepMessage;
    if (typeof message !== 'function' || typeof norepMessage !== 'function') {
        throw new TypeError('makemon_runtime requires message operations');
    }
    const runtimeContinuation = { claimed: false };
    const normalized = creationEnv({
        ...env,
        message,
        norepMessage,
        runtimeContinuation,
    });
    const monster = makemon(ptr, x, y, mmflags, normalized);
    if (!monster) return null;
    if (!runtimeContinuation.claimed
        || runtimeContinuation.monster !== monster) {
        throw new Error('makemon runtime continuation was not claimed');
    }
    const {
        anymon,
        allowMinvent,
        ptr: selected,
    } = runtimeContinuation;
    if (anymon && !(mmflags & MM_NOGRP)) {
        if ((selected.geno & G_SGROUP) && normalized.random.rn2(2)) {
            await initializeRuntimeMonsterGroup(
                monster,
                3,
                mmflags,
                normalized,
            );
        } else if (selected.geno & G_LGROUP) {
            await initializeRuntimeMonsterGroup(
                monster,
                normalized.random.rn2(3) ? 10 : 3,
                mmflags,
                normalized,
            );
        }
    }
    finishMonsterInventoryAndStrategy(
        monster,
        selected,
        allowMinvent,
        normalized,
    );
    await finishRuntimeCreationTail(monster, mmflags, normalized);
    return monster;
}

// C ref: makemon.c makemon() (1385-1392), species half of the mklev-only
// sleeping predicate. Keeping it pure lets the non-random long-worm and
// giant-eel membership be pinned without widening either creation lifecycle.
export function mklevSleeperSpecies(species) {
    const mndx = species?.pmidx;
    return is_ndemon(species)
        || mndx === PM_WUMPUS
        || mndx === PM_LONG_WORM
        || mndx === PM_GIANT_EEL;
}
