// Monster creation, during level generation and in play.
// C ref: makemon.c makemon(), m_initgrp(), m_initthrow(), m_initweap(),
// m_initinv(), and mongets(); worn.c m_dowear().

import {
    ALL_TRAPS,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    AM_NONE,
    BLCORNER,
    BOLT_LIM,
    COLNO,
    CROSSWALL,
    DELPHI,
    DF_NONE,
    DOOR,
    FODDERSHOP,
    G_GENOD,
    GP_AVOID_MONPOS,
    GP_CHECKSCARY,
    HOLE,
    HWALL,
    In_endgame,
    In_quest,
    In_mines,
    In_sokoban,
    In_V_tower,
    Is_earthlevel,
    Is_knox_level,
    Is_stronghold,
    LS_MONSTER,
    MM_NOTAIL,
    MM_ANGRY,
    MM_ASLEEP,
    MM_EDOG,
    MM_EGD,
    MM_EPRI,
    MM_EMIN,
    MM_ESHK,
    MM_FEMALE,
    MM_IGNOREWATER,
    MM_MALE,
    MM_MINVIS,
    MM_NOWAIT,
    MM_NOCOUNTBIRTH,
    MM_NOEXCLAM,
    MM_NOGRP,
    MM_NONAME,
    MM_NOMSG,
    MM_ADJACENTOK,
    MS_BRIBE,
    M_AP_NOTHING,
    M_AP_MONSTER,
    M_AP_TYPE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_SEEN_NOTHING,
    NO_MINVENT,
    A_LAWFUL,
    EMIN,
    ONAME,
    ONAME_NO_FLAGS,
    ONAME_RANDOM,
    ROOMOFFSET,
    ROT_CORPSE,
    ROWNO,
    SCORR,
    SDOOR,
    SHOPBASE,
    P_POLEARMS,
    PIT,
    STRAT_APPEARMSG,
    STRAT_CLOSE,
    STRAT_WAITFORU,
    TDWALL,
    TEMPLE,
    TLCORNER,
    TRWALL,
    TUWALL,
    TRAPDOOR,
    VAULT,
    W_ARMH,
    W_SADDLE,
    IS_WALL,
    ZOO,
} from './const.js';
import { isok } from './cmd_isok.js';
import { note_unported } from './unported.js';
import { ImpossibleCall, finish_steps } from './source_steps.js';
import {
    ART_DEMONBANE,
    ART_EXCALIBUR,
    artifact_exists,
} from './artifacts.js';
import { newemin } from './minion.js';
import { in_town } from './hack.js';
import {
    count_wsegs,
    get_wormno,
    initworm,
    place_worm_tail_randomly_steps,
} from './worm.js';
import {
    can_saddle,
    newedog,
    put_saddle_on_mon,
} from './dog.js';
import {
    Amonnam,
    christen_monst,
    oname,
    rndghostname,
} from './do_name.js';
import { newsym } from './display.js';
import {
    depth,
    In_hell,
    level_difficulty_steps,
    mapseen_room,
    on_level,
} from './dungeon.js';
import { deliver_obj_to_mon } from './dokick.js';
import { game } from './gstate.js';
import { upstart } from './hacklib.js';
import {
    add_to_container,
    add_to_minv,
    obfree,
} from './invent.js';
import { new_light_source } from './light.js';
import {
    newmcorpsenm,
    newmonhp_steps,
    peace_minded,
    propagate,
    rndmonnum,
    rndmonst_steps,
    set_malign,
} from './makemon.js';
import {
    can_be_hatched,
    emits_light,
    humanoid,
    is_demon,
    is_dprince,
    is_female,
    is_giant,
    is_lord,
    is_male,
    is_mercenary,
    is_minion,
    is_ndemon,
    is_bat,
    is_neuter,
    is_unicorn,
    mindless,
    mon_learns_traps,
    throws_rocks,
} from './mondata.js';
import { dochugw, set_apparxy } from './monmove.js';
import {
    dealloc_monst,
    hideunder,
    newcham,
    newcham_initial,
} from './mon.js';
import { mon_adjust_speed } from './worn.js';
import {
    m_at,
    newMonster,
    place_monster,
} from './monst.js';

// Compatibility exports for callers that historically imported these mon.c
// helpers through the level-creation module.  Their canonical implementation
// is in js/mon.js alongside the rest of mon.c.
export {
    accept_newcham_form,
    hideunder,
    newcham,
    newcham_distress,
    preflight_newcham_distress,
} from './mon.js';
export { set_mon_data } from './mondata.js';
import {
    AT_WEAP,
    G_NOCORPSE,
    M1_AMORPHOUS,
    M1_ANIMAL,
    M1_MINDLESS,
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
    MS_GUARDIAN,
    MS_LEADER,
    MS_NEMESIS,
    MS_PRIEST,
    NON_PM,
    PM_ABBOT,
    PM_ACOLYTE,
    PM_ALIGNED_CLERIC,
    PM_ANGEL,
    PM_APPRENTICE,
    PM_ARCH_LICH,
    PM_ARCHEOLOGIST,
    PM_ATTENDANT,
    PM_BALROG,
    PM_BLACK_LIGHT,
    PM_CROESUS,
    PM_CHIEFTAIN,
    PM_CLERIC,
    PM_MONK,
    PM_DISPATER,
    PM_ELF,
    PM_ELVEN_MONARCH,
    PM_ETTIN,
    PM_FOREST_CENTAUR,
    PM_GHOST,
    PM_GIANT,
    PM_GOBLIN,
    PM_GUIDE,
    PM_HIGH_CLERIC,
    PM_HOBBIT,
    PM_HORNED_DEVIL,
    PM_HOUSECAT,
    PM_HUMAN,
    PM_HUNTER,
    PM_ASMODEUS,
    PM_ICE_DEVIL,
    PM_LONG_WORM,
    PM_RAVEN,
    PM_MANES,
    PM_MASTER_LICH,
    PM_MINOTAUR,
    PM_GIANT_EEL,
    PM_GUARD,
    PM_NAZGUL,
    PM_MORDOR_ORC,
    PM_NEANDERTHAL,
    PM_CAPTAIN,
    PM_LIEUTENANT,
    PM_NINJA,
    PM_ORC,
    PM_ORC_CAPTAIN,
    PM_ORC_SHAMAN,
    PM_ORCUS,
    PM_OGRE_LEADER,
    PM_PESTILENCE,
    PM_OGRE_TYRANT,
    PM_PAGE,
    PM_QUANTUM_MECHANIC,
    PM_ROSHI,
    PM_SERGEANT,
    PM_SHOPKEEPER,
    PM_SOLDIER,
    PM_SALAMANDER,
    PM_STALKER,
    PM_STUDENT,
    PM_THUG,
    PM_URUK_HAI,
    PM_VLAD_THE_IMPALER,
    PM_WARRIOR,
    PM_WATCH_CAPTAIN,
    PM_WATCHMAN,
    PM_WUMPUS,
    PM_WIZARD,
    PM_WIZARD_OF_YENDOR,
    PM_YEENOGHU,
    S_ANGEL,
    S_BAT,
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
    S_LICH,
    S_LIZARD,
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
    S_VORTEX,
    S_WRAITH,
    S_ZOMBIE,
} from './monsters.js';
import {
    ARM_BONUS,
    curse,
    mkobj,
    mkobj_at,
    mksobj,
    next_ident,
    rnd_class,
    set_corpsenm,
    weight,
} from './obj.js';
import { objectGenerationEnv } from './object_generation.js';
import { vtense } from './objnam.js';
import {
    AKLYS,
    AMULET_CLASS,
    AMULET_OF_LIFE_SAVING,
    ARM_HELM,
    ARMOR_CLASS,
    ARROW,
    ATHAME,
    AXE,
    BANDED_MAIL,
    BATTLE_AXE,
    BEC_DE_CORBIN,
    BELL_OF_OPENING,
    BOULDER,
    BOW,
    BROADSWORD,
    BULLWHIP,
    BUGLE,
    CANDELABRUM_OF_INVOCATION,
    CHAIN_MAIL,
    CLOAK_OF_MAGIC_RESISTANCE,
    CLOAK_OF_PROTECTION,
    CLUB,
    COIN_CLASS,
    CORPSE,
    CROSSBOW,
    CRYSTAL_BALL,
    CRYSTAL_PLATE_MAIL,
    CROSSBOW_BOLT,
    CREAM_PIE,
    DAGGER,
    DART,
    DENTED_POT,
    DILITHIUM_CRYSTAL,
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
    FLAIL,
    FLINT,
    FOOD_CLASS,
    GEM_CLASS,
    GLAIVE,
    GOLD_PIECE,
    GLASS,
    HELMET,
    HIGH_BOOTS,
    IRON_SHOES,
    IRON,
    KNIFE,
    K_RATION,
    LARGE_BOX,
    C_RATION,
    LEATHER_ARMOR,
    LEATHER_CLOAK,
    LEATHER_GLOVES,
    LEATHER_JACKET,
    LARGE_SHIELD,
    LOW_BOOTS,
    LONG_SWORD,
    LUCERN_HAMMER,
    LUCKSTONE,
    LUMP_OF_ROYAL_JELLY,
    MACE,
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
    PLATE_MAIL,
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
    POT_SICKNESS,
    POT_SLEEPING,
    POT_SPEED,
    POTION_CLASS,
    QUARTERSTAFF,
    RANDOM_CLASS,
    RANSEUR,
    RUBBER_HOSE,
    RING_MAIL,
    RING_CLASS,
    RIN_INVISIBILITY,
    ROCK,
    ROBE,
    ROCK_CLASS,
    SCIMITAR,
    SKELETON_KEY,
    SHORT_SWORD,
    SHURIKEN,
    SHIELD_OF_REFLECTION,
    SILVER_MACE,
    SILVER_SABER,
    SMALL_SHIELD,
    SPEAR,
    SPLINT_MAIL,
    SCR_CREATE_MONSTER,
    SCR_EARTH,
    SCR_TELEPORTATION,
    SCROLL_CLASS,
    SLIME_MOLD,
    SLING,
    SPBOOK_CLASS,
    SPE_DIG,
    SPETUM,
    STATUE,
    STILETTO,
    STUDDED_LEATHER_ARMOR,
    STRANGE_OBJECT,
    TALLOW_CANDLE,
    TIN,
    TIN_WHISTLE,
    TOOL_CLASS,
    TWO_HANDED_SWORD,
    TRIDENT,
    URUK_HAI_SHIELD,
    WAN_COLD,
    WAN_CREATE_MONSTER,
    WAN_DEATH,
    WAN_DIGGING,
    WAN_FIRE,
    WAN_LIGHTNING,
    WAN_MAGIC_MISSILE,
    WAN_MAKE_INVISIBLE,
    WAN_NOTHING,
    WAN_POLYMORPH,
    WAN_SLEEP,
    WAN_SPEED_MONSTER,
    WAN_STRIKING,
    WAN_TELEPORTATION,
    WAND_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
} from './objects.js';
import { mon_aligntyp, newepri } from './priest.js';
import { newegd } from './vault.js';
import { coreRandom } from './rng.js';
import { enexto_core, goodpos, noteleport_level } from './teleport.js';
import { mhidden_description, messageAt } from './startup_a11y.js';
import { ttyNorep, ttyPline } from './tty_message.js';
import { impossible_printer } from './pline.js';
import { block_point, cansee, couldsee, does_block } from './vision.js';
import { get_shop_item } from './shknam.js';
import {
    S_altar,
    S_dnstair,
    S_fountain,
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
import {
    t_at,
} from './trap.js';
import {
    extract_from_minvent,
    m_dowear_steps,
    mon_set_minvis,
    which_armor,
} from './worn.js';
import { canseemon, canspotmon, sensemon } from './display.js';
import { Blind, Protection_from_shape_changers, See_invisible } from './youprop.js';

// include/monattk.h predicate used by muse.c's random-item selectors.
const AT_EXPL = 13;
// include/monflag.h creation-time predicates not yet exported by monsters.js.
const M1_WALLWALK = 0x00000008;
const M1_SLITHY = 0x00080000;
const M2_NOPOLY = 0x00000001;
const M2_LORD = 0x00000400;
const M2_PRINCE = 0x00000800;
const M2_SHAPESHIFTER = 0x00004000;
const M2_STRONG = 0x04000000;
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

export function creationEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? coreRandom;
    const required = ['d', 'rn1', 'rn2', 'rnd', 'rne'];
    if (!required.every((name) => typeof random[name] === 'function')) {
        throw new TypeError(
            `monster creation random injection requires ${required.join(', ')}`,
        );
    }
    return { ...env, state, random };
}

export function isRogueLevel(state) {
    return on_level(state.u?.uz, state.rogue_level);
}

function isArmed(species) {
    return species.mattk.some((attack) => attack.aatyp === AT_WEAP);
}

// C ref: makemon.c m_initweap(), S_OGRE (makemon.c:446-451).  The tyrant
// reaches this through mkroom.c mk_zoo_thronemon()'s high-difficulty arm.
export function ogreWeaponDivisor(species) {
    return species?.pmidx === PM_OGRE_TYRANT ? 3
        : species?.pmidx === PM_OGRE_LEADER ? 6
            : 12;
}

export function permanentlyInvisible(species) {
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

export function redrawSquare(x, y, normalized) {
    if (typeof normalized.hooks?.newsym === 'function') {
        normalized.hooks.newsym(x, y, normalized);
    } else if (normalized.state === game) {
        newsym(x, y);
    }
}

function runtimeAppearanceMessage(monster, mmflags, normalized) {
    const { state } = normalized;
    if (mmflags & MM_NOMSG) return null;
    // C ref: makemon.c:1477. read.c create_particular_creation() suppresses
    // surprise unless an explicit gender conflicts with the typed name.
    let exclaim = !(mmflags & MM_NOEXCLAM);
    const appearance = M_AP_TYPE(monster);
    let name = null;
    if ((canseemon(monster, state)
            && (appearance === M_AP_NOTHING
                || appearance === M_AP_MONSTER))
        || sensemon(monster, state)) {
        name = Amonnam(monster, {
            state,
            displayRandom: normalized.displayRandom,
        });
    } else if (canseemon(monster, state)) {
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

// C ref: makemon.c set_mimic_sym(). Covers all location-based branches:
// objects on floor, doors/walls, maze levels, corridors, ZOO/VAULT, DELPHI,
// TEMPLE, shops, and ordinary/themed rooms.
// The descriptor which requested the Storeroom mimic overwrites m_ap_type and
// mappearance only. All RNG, temporary-object allocation, fruit state, and any
// mcorpsenm overlay established here remain intact.
export function set_mimic_sym(monster, normalized) {
    const { random, state } = normalized;
    if (!monster || Protection_from_shape_changers(state.u)) return;
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
    } else if (state.level.flags.is_maze_lev
               && !(In_mines(state.u.uz, state)
                   && in_town(state.u.ux, state.u.uy, state))
               && !In_sokoban(state.u.uz, state) && random.rn2(2)) {
        appearanceType = M_AP_OBJECT;
        appearance = STATUE;
    } else {
        const roomIndex = (state.level.at(x, y)?.roomno ?? 0) - ROOMOFFSET;
        const roomType = roomIndex >= 0
            ? mapseen_room(roomIndex, state)?.rtype ?? 0
            : 0;
        // C's s_sym. The two shop arms that set ap_type and appear straight
        // from the shop's stock leave it undefined, which is how this port
        // spells C's two `goto assign_sym` jumps being skipped.
        let symbol;
        if (roomIndex < 0 && !t_at(x, y, state)) {
            appearanceType = M_AP_OBJECT;
            appearance = BOULDER;
        } else if (roomType === ZOO || roomType === VAULT) {
            appearanceType = M_AP_OBJECT;
            appearance = GOLD_PIECE;
        } else if (roomType === DELPHI) {
            if (random.rn2(2)) {
                appearanceType = M_AP_OBJECT;
                appearance = STATUE;
            } else {
                appearanceType = M_AP_FURNITURE;
                appearance = S_fountain;
            }
        } else if (roomType === TEMPLE) {
            appearanceType = M_AP_FURNITURE;
            appearance = S_altar;
        } else if (roomType >= SHOPBASE) {
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
                // C constructs and frees the whole temporary object before
                // choosing the mimic's separate species overlay. Retain
                // constructor and cleanup owners for statues, figurines,
                // container contents and timed objects on runtime callers.
                const objectEnv = objectGenerationEnv(normalized);
                const temporary = mkobj(symbol, false, objectEnv);
                appearance = temporary.otyp;
                obfree(temporary, null, objectEnv);
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
        newmcorpsenm(monster);
        monster.mextra.mcorpsenm = species;
    } else if (appearanceType === M_AP_OBJECT
               && appearance === SLIME_MOLD) {
        newmcorpsenm(monster);
        monster.mextra.mcorpsenm = state.context.current_fruit;
        state.flags.made_fruit = true;
    } else if (appearanceType === M_AP_FURNITURE
               && appearance === S_altar) {
        const alignment = random.rn2(3) - 1;
        newmcorpsenm(monster);
        // C makemon.c:2538-2542 chooses alignment before the Gehennom
        // override, even when the extra draw makes this altar unaligned.
        monster.mextra.mcorpsenm = In_hell(state.u.uz, state) && random.rn2(3)
            ? AM_NONE
            : alignment < 0 ? AM_CHAOTIC
                : alignment > 0 ? AM_LAWFUL : AM_NEUTRAL;
    } else if (monster.mextra && 'mcorpsenm' in monster.mextra) {
        monster.mextra.mcorpsenm = NON_PM;
    }

    // C's tail re-evaluates the square only after the disguise and any
    // species overlay have consumed all their randomness. Callers may supply
    // their own hooks here because vision.c's compact transparency index is
    // shared outside the game-state object.
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

// makemon() reads these globals unconditionally; a missing one is a broken
// caller or test setup, not a game state.
function requireCreationState(mmflags, state) {
    if (!Number.isInteger(mmflags) || mmflags < 0)
        throw new TypeError('makemon flags must be a nonnegative integer');
    if (!Array.isArray(state.mons) || !Array.isArray(state.mvitals))
        throw new Error('makemon requires initialized monster globals');
    if (!state.context || !Number.isInteger(state.context.ident)
        || state.context.ident <= 0
        || state.context.ident > 0xffff_ffff) {
        throw new Error('makemon requires initialized context.ident');
    }
    if (!state.u?.ualign || !state.urace)
        throw new Error('makemon requires initialized hero alignment and race');
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
    const firstScanStage = state.in_mklev || Blind(state.u) ? 1 : 0;
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
function m_initgrp(monster, countBound, mmflags, normalized) {
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
async function m_initgrp_runtime(
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

// C ref: makemon.c mongets(). Lawful minions receive uncursed, nonnegative,
// proofed gear; the separate prince-quality floor follows that normalization.
export function mongets(monster, otyp, normalized) {
    if (!otyp) return null;
    const obj = mksobj(otyp, true, false, normalized);
    if (monster.data.mlet === S_DEMON) {
        if (obj.blessed) curse(obj, normalized);
    } else if (is_minion(monster.data)
               && mon_aligntyp(monster) === A_LAWFUL) {
        obj.cursed = false;
        if (obj.spe < 0) obj.spe = 0;
        obj.oerodeproof = true;
        obj.oeroded = obj.oeroded2 = 0;
    }
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
            // C ref: makemon.c:188-225. Each mercenary rank gets distinct
            // weapons; the default covers miscellaneous mercenaries.
            let w1 = 0;
            let w2 = 0;
            switch (ptr.pmidx) {
            case PM_WATCHMAN:
            case PM_SOLDIER:
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
                break;
            case PM_SERGEANT:
                w1 = random.rn2(2) ? FLAIL : MACE;
                break;
            case PM_LIEUTENANT:
                w1 = random.rn2(2) ? BROADSWORD : LONG_SWORD;
                break;
            case PM_CAPTAIN:
            case PM_WATCH_CAPTAIN:
                w1 = random.rn2(2) ? LONG_SWORD : SILVER_SABER;
                break;
            default:
                if (!random.rn2(4)) w1 = DAGGER;
                if (!random.rn2(7)) w2 = SPEAR;
                break;
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
            // C ref: makemon.c:257-262. Elven Monarchs may receive a
            // pick-axe and rarely a crystal ball.
            if (ptr.pmidx === PM_ELVEN_MONARCH) {
                if (random.rn2(3)
                    || (state.in_mklev && Is_earthlevel(state.u?.uz, state)))
                    mongets(monster, PICK_AXE, normalized);
                if (!random.rn2(50))
                    mongets(monster, CRYSTAL_BALL, normalized);
            }
        } else if (ptr.msound === MS_PRIEST
                   || (state.urole?.mnum === PM_CLERIC
                       && (ptr.msound === MS_LEADER
                           || ptr.msound === MS_NEMESIS))) {
            // C ref: makemon.c:263-269. Priests and Cleric quest
            // representatives receive a mace with rnd(3) enchantment,
            // 50% cursed. Bypasses mongets to skip normal mksobj_init.
            const obj = mksobj(MACE, false, false, normalized);
            obj.spe = random.rnd(3);
            if (!random.rn2(2)) curse(obj, normalized);
            addFreshMonsterObject(monster, obj, normalized);
        } else if (ptr.pmidx === PM_NINJA) {
            // C ref: makemon.c:270-272.
            mongets(monster, random.rn2(4) ? SHURIKEN : DART, normalized);
            mongets(monster, random.rn2(4) ? SHORT_SWORD : AXE, normalized);
        } else if (ptr.msound === MS_GUARDIAN) {
            // C ref: makemon.c:273-326. Quest "guardians" receive role-
            // specific gear. Each case makes its own rn2 calls for weapon
            // and armor selection.
            switch (ptr.pmidx) {
            case PM_STUDENT:
            case PM_ATTENDANT:
            case PM_ABBOT:
            case PM_ACOLYTE:
            case PM_GUIDE:
            case PM_APPRENTICE:
                if (random.rn2(2))
                    mongets(monster,
                        random.rn2(3) ? DAGGER : KNIFE, normalized);
                if (random.rn2(5))
                    mongets(monster,
                        random.rn2(3) ? LEATHER_JACKET
                                      : LEATHER_CLOAK, normalized);
                if (random.rn2(3))
                    mongets(monster,
                        random.rn2(3) ? LOW_BOOTS : HIGH_BOOTS, normalized);
                if (random.rn2(3))
                    mongets(monster, POT_HEALING, normalized);
                break;
            case PM_CHIEFTAIN:
            case PM_PAGE:
            case PM_ROSHI:
            case PM_WARRIOR:
                mongets(monster,
                    random.rn2(3) ? LONG_SWORD : SHORT_SWORD, normalized);
                mongets(monster,
                    random.rn2(3) ? CHAIN_MAIL : LEATHER_ARMOR, normalized);
                if (random.rn2(2))
                    mongets(monster,
                        random.rn2(2) ? LOW_BOOTS : HIGH_BOOTS, normalized);
                if (!random.rn2(3))
                    mongets(monster, LEATHER_CLOAK, normalized);
                if (!random.rn2(3)) {
                    mongets(monster, BOW, normalized);
                    m_initthrow(monster, ARROW, 12, normalized);
                }
                break;
            case PM_HUNTER:
                mongets(monster,
                    random.rn2(3) ? SHORT_SWORD : DAGGER, normalized);
                if (random.rn2(2))
                    mongets(monster,
                        random.rn2(2) ? LEATHER_JACKET
                                      : LEATHER_ARMOR, normalized);
                mongets(monster, BOW, normalized);
                m_initthrow(monster, ARROW, 12, normalized);
                break;
            case PM_THUG:
                mongets(monster, CLUB, normalized);
                mongets(monster,
                    random.rn2(3) ? DAGGER : KNIFE, normalized);
                if (random.rn2(2))
                    mongets(monster, LEATHER_GLOVES, normalized);
                mongets(monster,
                    random.rn2(2) ? LEATHER_JACKET
                                  : LEATHER_ARMOR, normalized);
                break;
            case PM_NEANDERTHAL:
                mongets(monster, CLUB, normalized);
                mongets(monster, LEATHER_ARMOR, normalized);
                break;
            }
        }
        // Shopkeepers, were-creatures, and other non-elf, non-mercenary,
        // non-priest, non-guardian humans (all G_NOGEN) receive no weapons
        // from m_initweap. C breaks here without a further else arm.
        break;
    case S_ANGEL:
        // C ref: makemon.c:330-360. Humanoid angels get a blessed, erodeproof
        // weapon (long sword or silver mace) and a shield.
        if (humanoid(ptr)) {
            const typ = random.rn2(3) ? LONG_SWORD : SILVER_MACE;
            const nam = typ === LONG_SWORD ? 'Sunsword' : 'Demonbane';
            let otmp = mksobj(typ, false, false, normalized);
            if ((!random.rn2(20) || is_lord(ptr))
                && Math.sign(monster.isminion
                    ? EMIN(monster)?.min_align
                    : ptr.maligntyp) === A_LAWFUL) {
                otmp = oname(otmp, nam, ONAME_RANDOM, normalized);
            }
            otmp.blessed = true;
            otmp.cursed = false;
            otmp.oerodeproof = true;
            otmp.spe = random.rn2(4);
            if (typ === SILVER_MACE) otmp.spe += 3;
            addFreshMonsterObject(monster, otmp, normalized);

            const shield = mksobj(
                !random.rn2(4) || is_lord(ptr)
                    ? SHIELD_OF_REFLECTION : LARGE_SHIELD,
                false, false, normalized,
            );
            shield.oerodeproof = true;
            shield.spe = 0;
            addFreshMonsterObject(monster, shield, normalized);
        }
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
    case S_KOP:
        // C ref: makemon.c:402-409. Keystone Kops may receive cream pies,
        // then a club or rubber hose; preserve both gates and their order.
        if (!random.rn2(4)) m_initthrow(monster, CREAM_PIE, 2, normalized);
        if (!random.rn2(3)) {
            mongets(
                monster,
                random.rn2(2) ? CLUB : RUBBER_HOSE,
                normalized,
            );
        }
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
    case S_KOBOLD:
        if (!random.rn2(4)) m_initthrow(monster, DART, 12, normalized);
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
    case S_ZOMBIE:
        // C ref: makemon.c:489-494. Zombies get a chance at leather armor
        // and a knife or short sword.
        if (!random.rn2(4))
            mongets(monster, LEATHER_ARMOR, normalized);
        if (!random.rn2(4))
            mongets(monster, random.rn2(3) ? KNIFE : SHORT_SWORD, normalized);
        break;
    case S_LIZARD:
        // C ref: makemon.c:495-499. Salamanders choose one weapon from
        // their three-way spear/trident/stiletto distribution.
        if (ptr.pmidx === PM_SALAMANDER) {
            mongets(
                monster,
                random.rn2(7) ? SPEAR
                    : random.rn2(3) ? TRIDENT : STILETTO,
                normalized,
            );
        }
        break;
    case S_DEMON:
        // C ref: makemon.c:500-524. Specific named demons (Balrog, Orcus,
        // Horned Devil, Dispater, Yeenoghu) receive special weapons.
        switch (ptr.pmidx) {
        case PM_BALROG:
            mongets(monster, BULLWHIP, normalized);
            mongets(monster, BROADSWORD, normalized);
            break;
        case PM_ORCUS:
            mongets(monster, WAN_DEATH, normalized);
            break;
        case PM_HORNED_DEVIL:
            mongets(
                monster,
                random.rn2(4) ? TRIDENT : BULLWHIP,
                normalized,
            );
            break;
        case PM_DISPATER:
            mongets(monster, WAN_STRIKING, normalized);
            break;
        case PM_YEENOGHU:
            mongets(monster, FLAIL, normalized);
            break;
        }
        // Non-demons in class S_DEMON (djinni, mail daemon) break here so
        // a later vanish drops no object. Actual demons (water demon, etc.)
        // fall through to the default general-weapon roll.
        if (!is_demon(ptr))
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

function isNonliving(species) {
    return Boolean(species.mflags2 & M2_UNDEAD)
        || species.pmidx === PM_MANES
        || species.mlet === S_GOLEM
        || species.mlet === S_VORTEX;
}

function isFloater(species) {
    return species.mlet === S_EYE || species.mlet === S_LIGHT;
}

function armorCategory(obj, state) {
    return obj.oclass === ARMOR_CLASS
        ? state.objects?.[obj.otyp]?.oc_armcat
        : undefined;
}

function isHardHelmet(obj, state) {
    if (!obj || armorCategory(obj, state) !== ARM_HELM) return false;
    const material = state.objects[obj.otyp].oc_material;
    return (material >= IRON && material <= MITHRIL) || material === GLASS;
}

// C ref: muse.c rnd_offensive_item().
export function rnd_offensive_item(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (rejectsRandomUseItems(ptr)) return 0;
    if (ptr.difficulty > 7 && !random.rn2(35)) return WAN_DEATH;

    switch (random.rn2(
        9 - Number(ptr.difficulty < 4) + 4 * Number(ptr.difficulty > 6),
    )) {
    case 0: {
        const helmet = which_armor(monster, W_ARMH, state);
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
    }
    /*NOTREACHED*/
    return 0;
}

// C ref: muse.c rnd_defensive_item().
export function rnd_defensive_item(monster, normalized) {
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
            if (noteleport_level(monster, state) && ++trycnt < 2) continue;
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
            return ptr.pmidx !== PM_PESTILENCE
                ? POT_FULL_HEALING : POT_SICKNESS;
        case 7:
            // C's Sokoban macro is the level's sokoban_rules flag, which a
            // Sokoban level file sets wherever it is loaded and solving clears.
            if (state.level.flags.sokoban_rules && random.rn2(4))
                continue;
            if (isFloater(ptr)
                || monster.isshk
                || monster.isgd
                || monster.ispriest) {
                return 0;
            }
            return WAN_DIGGING;
        }
        /* rn2()'s bound keeps the switch within its cases */
        return 0;
    }
}


// C ref: muse.c rnd_misc_item(). No inventory-enabled shape-changer in this
// initial-generation slice is a vampire shifter.
export function rnd_misc_item(monster, normalized) {
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
        if (monster.mpeaceful && !See_invisible(state.u)) return 0;
        return random.rn2(6) ? POT_INVISIBILITY : WAN_MAKE_INVISIBLE;
    case 2:
        return POT_GAIN_LEVEL;
    }
    /*NOTREACHED*/
    return 0;
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

// C ref: makemon.c m_initinv(). Its own impossible() and
// level_difficulty()'s are steps (js/source_steps.js).
function* m_initinv_steps(monster, normalized) {
    const { random, state } = normalized;
    const ptr = monster.data;
    if (isRogueLevel(state)) return;

    if (ptr.mlet === S_HUMAN && is_mercenary(ptr)) {
        // C ref: makemon.c:602-701. Each mercenary rank starts at a
        // different mac; the body armor branch depends on it.
        let mac;
        switch (ptr.pmidx) {
        case PM_GUARD:        mac = -1; break;
        case PM_SOLDIER:      mac =  3; break;
        case PM_SERGEANT:     mac =  0; break;
        case PM_LIEUTENANT:   mac = -2; break;
        case PM_CAPTAIN:      mac = -3; break;
        case PM_WATCHMAN:     mac =  3; break;
        case PM_WATCH_CAPTAIN: mac = -2; break;
        default:
            yield new ImpossibleCall(`odd mercenary ${ptr.pmidx}?`);
            mac = 0;
            break;
        }
        let obj;
        const addArmorClass = () => {
            if (obj) mac += ARM_BONUS(obj, state);
            obj = null;
        };

        // C ref: makemon.c:638-648. Body armor depends on mac.
        if (mac < -1 && random.rn2(5)) {
            obj = mongets(
                monster,
                random.rn2(5) ? PLATE_MAIL : CRYSTAL_PLATE_MAIL,
                normalized,
            );
        } else if (mac < 3 && random.rn2(5)) {
            obj = mongets(
                monster,
                random.rn2(3) ? SPLINT_MAIL : BANDED_MAIL,
                normalized,
            );
        } else if (random.rn2(5)) {
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

        // C ref: makemon.c:682-701.
        if (ptr.pmidx === PM_WATCH_CAPTAIN) {
            // better weapon rather than extra gear
        } else if (ptr.pmidx === PM_WATCHMAN) {
            if (random.rn2(3))
                mongets(monster, TIN_WHISTLE, normalized);
        } else if (ptr.pmidx === PM_GUARD) {
            const whistle = mksobj(TIN_WHISTLE, true, false, normalized);
            curse(whistle, normalized);
            addFreshMonsterObject(monster, whistle, normalized);
        } else {
            if (!random.rn2(3)) mongets(monster, K_RATION, normalized);
            if (!random.rn2(2)) mongets(monster, C_RATION, normalized);
            if (ptr.pmidx !== PM_SOLDIER && !random.rn2(3))
                mongets(monster, BUGLE, normalized);
        }
    } else if (ptr.mlet === S_HUMAN
               && (ptr.msound === MS_PRIEST
                   || (state.urole?.mnum === PM_CLERIC
                       && (ptr.msound === MS_LEADER
                           || ptr.msound === MS_NEMESIS)))) {
        // C ref: makemon.c:721-727. Priests and Cleric quest
        // representatives receive a robe or cloak, small shield, and gold.
        mongets(
            monster,
            random.rn2(7) ? ROBE
                : random.rn2(3) ? CLOAK_OF_PROTECTION
                    : CLOAK_OF_MAGIC_RESISTANCE,
            normalized,
        );
        mongets(monster, SMALL_SHIELD, normalized);
        mkmonmoney(monster, random.rn1(10, 20), normalized);
    } else if (ptr.mlet === S_HUMAN
               && state.urole?.mnum === PM_MONK
               && (ptr.msound === MS_LEADER
                   || ptr.msound === MS_NEMESIS)) {
        // C ref: makemon.c:728-729. Monk quest leaders and nemeses receive a
        // robe, with a one-in-eleven chance of a cloak of magic resistance.
        mongets(
            monster,
            random.rn2(11) ? ROBE : CLOAK_OF_MAGIC_RESISTANCE,
            normalized,
        );
    } else if (ptr.mlet === S_NYMPH) {
        if (!random.rn2(2)) mongets(monster, MIRROR, normalized);
        if (!random.rn2(2))
            mongets(monster, POT_OBJECT_DETECTION, normalized);
    } else if (ptr.mlet === S_GIANT && ptr.pmidx === PM_MINOTAUR) {
        // C ref: makemon.c:738-741. A minotaur gets a wand of digging with
        // a one-in-eight chance, or unconditionally on the Earth level while
        // generating a level. This arm precedes the generic giant gemstone
        // arm even though minotaurs share S_GIANT.
        if (!random.rn2(8)
            || (state.in_mklev && Is_earthlevel(state.u?.uz, state))) {
            mongets(monster, WAN_DIGGING, normalized);
        }
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
    } else if (ptr.mlet === S_WRAITH && ptr.pmidx === PM_NAZGUL) {
        // C ref: makemon.c:752-759. Every Nazgul starts with a cursed
        // invisibility ring; mksobj() consumes next_ident before the BUC
        // mutation, then mpickobj() links the object to the monster.
        const ring = mksobj(
            RIN_INVISIBILITY,
            false,
            false,
            normalized,
        );
        curse(ring, normalized);
        addFreshMonsterObject(monster, ring, normalized);
    } else if (ptr.mlet === S_LICH) {
        // C ref: makemon.c:759-771. Master liches rarely receive an athame
        // or empty wand; arch-liches can receive a higher-quality weapon.
        if (ptr.pmidx === PM_MASTER_LICH && !random.rn2(13)) {
            mongets(
                monster,
                random.rn2(7) ? ATHAME : WAN_NOTHING,
                normalized,
            );
        } else if (ptr.pmidx === PM_ARCH_LICH && !random.rn2(3)) {
            const obj = mksobj(
                random.rn2(3) ? ATHAME : QUARTERSTAFF,
                true,
                !random.rn2(13),
                normalized,
            );
            if (obj.spe < 2) obj.spe = random.rnd(3);
            if (!random.rn2(4)) obj.oerodeproof = true;
            addFreshMonsterObject(monster, obj, normalized);
        }
    } else if (ptr.mlet === S_MUMMY) {
        if (random.rn2(7)) mongets(monster, MUMMY_WRAPPING, normalized);
    } else if (ptr.mlet === S_LEPRECHAUN) {
        mkmonmoney(
            monster,
            random.d(yield* level_difficulty_steps(state), 30),
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
    } else if (ptr.mlet === S_DEMON) {
        if (ptr.pmidx === PM_ICE_DEVIL && !random.rn2(4)) {
            mongets(monster, SPEAR, normalized);
        } else if (ptr.pmidx === PM_ASMODEUS) {
            mongets(monster, WAN_COLD, normalized);
            mongets(monster, WAN_FIRE, normalized);
        }
    } else if (ptr.mlet === S_GNOME
        && !random.rn2(
            (In_mines(state.u.uz, state) && state.in_mklev) ? 20 : 60,
        )) {
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
                add_to_container(box, catcorpse, objectGenerationEnv(normalized));
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
            random.d(
                yield* level_difficulty_steps(state),
                monster.minvent ? 5 : 10,
            ),
            normalized,
        );
    }
}

// worn.c owns the monster equipment selector. Keep this re-export for the
// level-creation callers that historically imported it from this module.
export { m_dowear, racial_exception, update_mon_extrinsics } from './worn.js';

// C ref: mkobj.c discard_minvent(). Each object leaves through worn.c
// extract_from_minvent(..., TRUE, TRUE), loses any artifact bookkeeping when
// the caller asks, and is freed by obfree(). Extraction is synchronous unless
// one of its steps must wait (a wielded light source's "stops shining"
// message, for one); only then does this answer a promise, and the next
// object waits for it.
export function discard_minvent(monster, uncreateArtifacts, env = {}) {
    const normalized = creationEnv(env);
    const discard = (obj) => {
        if (uncreateArtifacts && obj.oartifact) {
            artifact_exists(
                obj,
                ONAME(obj),
                false,
                ONAME_NO_FLAGS,
                normalized.state,
            );
        }
        // mkobj.c obfree() stops the object's timers and deletes its light
        // source through timeout.c and light.c directly; supply those owners
        // unless the caller brought its own.
        obfree(obj, null, objectGenerationEnv(normalized));
    };
    const discardRest = () => {
        let obj;
        while ((obj = monster.minvent)) {
            const current = obj;
            const extracted = extract_from_minvent(
                monster,
                current,
                true,
                true,
                normalized,
            );
            if (extracted && typeof extracted.then === 'function') {
                return extracted.then(() => {
                    discard(current);
                    return discardRest();
                });
            }
            discard(current);
        }
        return monster;
    };
    return discardRest();
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
            dealloc_monst(current);
            ++removed;
        } else {
            previous = current;
        }
        current = next;
    }
    state.iflags.purge_monsters = 0;
    if (removed !== expected) {
        // impossible("dmonsfree: %d removed doesn't match %d pending on %s",
        // ...); this synchronous function cannot wait on the print.
        note_unported('pline.c impossible');
    }
    return removed;
}

function initializeGender(monster, ptr, mmflags, random, state) {
    const femaleok = !is_male(ptr) && !is_neuter(ptr);
    const maleok = !is_female(ptr) && !is_neuter(ptr);
    if (is_female(ptr) || ((mmflags & MM_FEMALE) && femaleok)) {
        monster.female = true;
    } else if (is_male(ptr) || ((mmflags & MM_MALE) && maleok)) {
        monster.female = false;
    } else if (ptr.msound === MS_LEADER
               && state.urole?.ldrnum === ptr.pmidx) {
        // C ref: makemon.c:1267-1271.  role_init() has already selected and
        // stored a quest leader's gender for the pager; creation reuses it
        // instead of drawing a second random gender.
        monster.female = Boolean(state.svq?.quest_status?.ldrgend);
    } else if (ptr.msound === MS_NEMESIS
               && state.urole?.neminum === ptr.pmidx) {
        // C ref: makemon.c:1267-1273.  A quest nemesis that can have any
        // gender uses role_init()'s saved choice, so this branch is drawless.
        monster.female = Boolean(state.svq?.quest_status?.nemgend);
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

// Bounded explicit-target form of mon.c:newcham() for
// sp_lev.c:create_monster(). The caller has just created an implicitly shifted
// waiting vampire, so it normally has no attached inventory.  The common
// mon.c implementation remains the canonical owner of the transition.
export function restore_waiting_vampire(monster, rawEnv = {}) {
    const normalized = creationEnv(rawEnv);
    const { state } = normalized;
    // The caller has checked that the monster is a vampire or vampire lord
    // shifted out of its S_VAMPIRE form; mon.c pickvampshape() made it a
    // vampire bat, fog cloud or wolf.
    const mndx = monster.cham;
    const target = state.mons[mndx];
    if (state.mvitals[mndx].mvflags & G_GENOD) return false;
    if (monster.data === target) return false;
    // Explicit-target newcham is hybrid: synchronous for an ordinary
    // no-message transition and Promise-returning when a caller supplied an
    // asynchronous floor/attachment owner is reached.
    return newcham(monster, target, normalized);
}

// C ref: zap.c revive():991-994, the explicit-target newcham() used after a
// unique corpse without saved traits is substituted with a doppelganger.
// The common mon.c owner handles inventory and attachments.  This caller
// discards the newcham return, as zap.c does.
export async function newcham_revival(monster, target, rawEnv = {}) {
    const normalized = creationEnv(rawEnv);
    const { state } = normalized;
    if (state.mvitals[target.pmidx].mvflags & G_GENOD) return false;
    if (monster.data === target) return false;
    return await newcham(monster, target, normalized);
}

function* finishMonsterInventoryAndStrategySteps(
    monster,
    ptr,
    allowMinvent,
    mmflags,
    normalized,
) {
    const { random, state } = normalized;
    if (allowMinvent) {
        if (isArmed(ptr)) m_initweap(monster, normalized);
        yield* m_initinv_steps(monster, normalized);
        yield* m_dowear_steps(monster, true, normalized);

        const saddleRoll = random.rn2(100);
        if (!saddleRoll && (ptr.mflags2 & M2_DOMESTIC)
            && can_saddle(monster)
            && !which_armor(monster, W_SADDLE, state)) {
            put_saddle_on_mon(null, monster, normalized);
        }
    } else {
        if (monster.minvent) discard_minvent(monster, true, normalized);
        monster.minvent = null;
    }

    // C ref: makemon.c makemon() (1457-1466). Revived monsters pass
    // MM_NOWAIT and therefore retain no waiting or covetous strategy bits.
    if (ptr.mflags3 && !(mmflags & MM_NOWAIT)) {
        if (ptr.mflags3 & M3_WAITFORU)
            monster.mstrategy |= STRAT_WAITFORU;
        if (ptr.mflags3 & M3_CLOSE)
            monster.mstrategy |= STRAT_CLOSE;
        if (ptr.mflags3 & (M3_WAITFORU | M3_CLOSE | M3_COVETOUS))
            monster.mstrategy |= STRAT_APPEARMSG;
    }
    if (allowMinvent && state.gm?.migrating_objs)
        deliver_obj_to_mon(monster, 1, DF_NONE, normalized); // in case of waiting items
}

async function finishRuntimeCreationTail(monster, mmflags, normalized) {
    const { state } = normalized;
    redrawSquare(monster.mx, monster.my, normalized);
    const appearance = runtimeAppearanceMessage(monster, mmflags, normalized);
    if (appearance) {
        await normalized.norepMessage(appearance, state, normalized);
    }
    await makemonOccupationCheck(monster, normalized);
}

// C ref: makemon.c makemon() (1502-1504), outside mklev: "if discernable and
// a threat, stop fiddling while Rome burns".  dochugw() calls allmain.c
// stop_occupation() directly; a caller's hook stands in for it only when the
// caller supplies one.
async function makemonOccupationCheck(monster, normalized) {
    const { state } = normalized;
    if (!state.go?.occupation) return;
    const stopOccupation = typeof normalized.hooks?.stopOccupation
        === 'function'
        ? normalized.hooks.stopOccupation
        : async (_monster, hookEnv) => {
            const { stop_occupation } = await import('./allmain.js');
            await stop_occupation(state, {
                ...hookEnv,
                message: hookEnv.message ?? ttyPline,
            });
        };
    await dochugw(monster, false, {
        ...normalized,
        state,
        canSpotMonster: (subject) => canspotmon(subject, state),
        couldSee: (x, y) => couldsee(x, y, state),
        stopOccupation: () => stopOccupation(monster, normalized),
    });
}

// C ref: makemon.c makemon() (1147-1512). Like C, it admits every species,
// coordinate and flag combination; the result depends only on the arguments
// and the level. It returns null where C returns NULL: generation is disabled,
// no square is free, rndmonst() finds no candidate, or the species is
// genocided. Outside level creation the synchronous body stops after
// set_malign(); makemon_runtime() and makemon_revival() run the rest.
export function makemon(ptr, x, y, mmflags = 0, env = {}) {
    const normalized = creationEnv(env);
    return finish_steps(
        makemon_steps(ptr, x, y, mmflags, normalized),
        normalized.onImpossible,
    );
}

function* makemon_steps(ptr, x, y, mmflags, normalized) {
    const { random, state } = normalized;
    requireCreationState(mmflags, state);

    if (state.iflags?.debug_mongen
        || (state.level.flags.rndmongen === false && !ptr)) {
        return null;
    }
    const byHero = x === state.u.ux && y === state.u.uy;
    const allowtail = !(mmflags & MM_NOTAIL);
    // C makemon.c:1162 carries this caller flag into every placement check.
    const gpflags = GP_CHECKSCARY | GP_AVOID_MONPOS
        | (mmflags & MM_IGNOREWATER);
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
    // C: impossible("makemon trying to create a monster at <%d,%d>?").
    if (!isok(x, y)) {
        note_unported('pline.c impossible');
        return null;
    }
    // Does a monster already exist at the position?
    if (m_at(x, y, state)) {
        const coordinate = (mmflags & MM_ADJACENTOK)
            ? enexto_core(x, y, ptr, gpflags, normalized)
            : null;
        if (!coordinate) return null;
        x = coordinate.x;
        y = coordinate.y;
    }

    const anymon = !ptr;
    if (anymon) {
        let attempts = 0;
        do {
            ptr = yield* rndmonst_steps(normalized);
            if (!ptr) return null;
        } while (++attempts <= 50
            && ((attempts === 1
                && throws_rocks(ptr)
                && In_sokoban(state.u.uz, state))
                || !goodpos(
                    x,
                    y,
                    newMonster({ data: ptr }),
                    gpflags,
                    normalized,
                )));
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
    if (mmflags & MM_EGD) newegd(monster);
    if (mmflags & MM_EPRI) newepri(monster);
    if (mmflags & MM_ESHK) neweshk(monster);
    if (mmflags & MM_EMIN) newemin(monster);
    if (mmflags & MM_EDOG) newedog(monster);
    monster.msleeping = Boolean(mmflags & MM_ASLEEP);
    monster.nmon = state.level.monlist;
    state.level.monlist = monster;
    monster.m_id = next_ident(normalized);
    monster.data = ptr;
    monster.mnum = mndx;
    // C ref: makemon.c:1253-1255. Quest chat identifies a leader by this
    // persistent id, so record it immediately after next_ident() just as C
    // does, before later monster initialization can observe the new monster.
    if (ptr.msound === MS_LEADER
        && state.urole?.ldrnum === mndx) {
        state.svq ??= {};
        state.svq.quest_status ??= {};
        state.svq.quest_status.leader_m_id = monster.m_id;
    }
    yield* newmonhp_steps(monster, mndx, normalized);
    initializeGender(monster, ptr, mmflags, random, state);

    // C ref: makemon.c:1281-1293.  Monsters created on certain levels
    // start knowing about traps there, and locations where monsters are
    // already experienced with wands set mwandexp.
    if (In_sokoban(state.u.uz, state) && !mindless(ptr)) {
        mon_learns_traps(monster, PIT);
        mon_learns_traps(monster, HOLE);
    }
    if (Is_stronghold(state.u.uz, state) && !mindless(ptr)) {
        mon_learns_traps(monster, TRAPDOOR);
    }
    // Quest leader and nemesis both know about all trap types.
    if (ptr.msound === MS_LEADER || ptr.msound === MS_NEMESIS) {
        mon_learns_traps(monster, ALL_TRAPS);
    }
    // Locations where monsters are already experienced with wands.
    if (Is_stronghold(state.u.uz, state) || Is_knox_level(state.u.uz, state)
        || In_endgame(state.u.uz, state) || In_hell(state.u.uz, state)
        || In_V_tower(state.u.uz, state) || In_quest(state.u.uz, state)) {
        monster.mwandexp = true;
    }

    place_monster(monster, x, y, state);
    monster.mcansee = true;
    monster.mcanmove = true;
    monster.mgenmklev = Boolean(state.in_mklev);
    monster.seen_resistance = M_SEEN_NOTHING;
    monster.mpeaceful = (mmflags & MM_ANGRY)
        ? false
        : peace_minded(ptr, normalized);
    // C makemon.c:1300 calls mon_set_minvis() only after placement, so a
    // create_particular() MM_MINVIS request updates both the visible glyph
    // and the monster's permanent-invisibility state in source order.
    if (mmflags & MM_MINVIS) mon_set_minvis(monster, false, state);
    if (ptr.mlet === S_MIMIC) {
        set_mimic_sym(monster, normalized);
    } else if (ptr.mlet === S_SPIDER || ptr.mlet === S_SNAKE) {
        if (state.in_mklev) {
            if (x && y) mkobj_at(RANDOM_CLASS, x, y, true, normalized);
            hideunder(monster, { state });
        }
    } else if (startsPermanentlyInvisible(ptr)) {
        monster.perminvis = true;
        monster.minvis = true;
    } else if (ptr.mlet === S_EEL) {
        if (state.in_mklev) hideunder(monster, { state });
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
    } else if (ptr.mlet === S_BAT
        && In_hell(state.u.uz, state)
        && is_bat(ptr)) {
        // C makemon.c:1343-1346 calls worn.c mon_adjust_speed(mtmp, 2, 0)
        // for bats created in Gehennom.  The adjust=2 arm is silent and its
        // return value is discarded by the source caller.
        void mon_adjust_speed(monster, 2, null, state, {
            ...normalized,
            silent: true,
        });
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
    // C ref: makemon.c:1351-1384. Special inventory item for specific
    // monsters, given via mongets after the shapechanger and ghost blocks.
    let mitem = STRANGE_OBJECT;
    if (mndx === PM_VLAD_THE_IMPALER) mitem = CANDELABRUM_OF_INVOCATION;
    monster.cham = NON_PM;
    const naturalShape = pm_to_cham(mndx, state);
    let initialShape = false;
    if (!Protection_from_shape_changers(state.u)
        && naturalShape !== NON_PM) {
        monster.cham = naturalShape;
        // C ref: makemon.c:1361. Vlad stays in his normal form so he
        // can carry the Candelabrum of Invocation.
        if (mndx !== PM_VLAD_THE_IMPALER) {
            initialShape = newcham_initial(monster, normalized);
        }
    }
    const initialChanged = yield initialShape;
    if (initialChanged) allowMinvent = false;
    if (naturalShape === NON_PM) {
        if (mndx === PM_WIZARD_OF_YENDOR) {
            monster.iswiz = true;
            state.context.no_of_wizards
                = (state.context.no_of_wizards || 0) + 1;
            if (state.context.no_of_wizards === 1
                && on_level(state.u?.uz, state.earth_level))
                mitem = SPE_DIG;
        } else if (mndx === PM_GHOST) {
            // C ref: makemon.c -- MM_NONAME suppresses the random ghost name.
            // savebones() passes MM_NONAME and then christen_monst separately.
            if (!(mmflags & MM_NONAME)) {
                christen_monst(monster, rndghostname(normalized), {
                    state,
                });
            }
        } else if (mndx === PM_CROESUS) {
            mitem = TWO_HANDED_SWORD;
        } else if (ptr.msound === MS_NEMESIS) {
            mitem = BELL_OF_OPENING;
        } else if (mndx === PM_PESTILENCE) {
            mitem = POT_SICKNESS;
        }
    }
    if (mitem !== STRANGE_OBJECT && allowMinvent)
        mongets(monster, mitem, normalized);
    if (state.in_mklev
        && mklevSleeperSpecies(ptr)
        && !state.u.uhave.amulet
        && random.rn2(5)) {
        monster.msleeping = true;
    }
    if (byHero && !state.in_mklev) {
        // C makemon.c calls newsym() and then set_apparxy() here, using the
        // original byyou flag even after enexto() moved the monster away from
        // the hero's square. Preserve both source calls so displaced and
        // unseen heroes consume the same placement draw as C.
        redrawSquare(monster.mx, monster.my, normalized);
        set_apparxy(monster, normalized);
    }
    // C ref: makemon.c:1397-1402. Demon princes who use the bribe sound
    // start peaceful and permanently invisible, unless the hero wields
    // Excalibur or Demonbane. This follows the byyou newsym() above, which
    // draws the prince while he is still visible (and so overwrites a
    // remembered 'I' under him), and precedes initial inventory, so it also
    // controls rnd_misc_item()'s peaceful-monster branch without a draw.
    if (is_dprince(ptr) && ptr.msound === MS_BRIBE) {
        monster.mpeaceful = true;
        monster.minvis = true;
        monster.perminvis = true;
        monster.mavenge = false;
        if (state.uwep?.oartifact === ART_EXCALIBUR
            || state.uwep?.oartifact === ART_DEMONBANE) {
            monster.mpeaceful = false;
            monster.mtame = false;
        }
    }
    // C ref: makemon.c:1403-1404. A wielded beaked polearm pacifies ravens.
    if (mndx === PM_RAVEN && state.uwep?.otyp === BEC_DE_CORBIN)
        monster.mpeaceful = true;
    // C ref: makemon.c:1405-1408.
    if (mndx === PM_LONG_WORM) {
        monster.wormno = get_wormno(state);
        if (monster.wormno) {
            initworm(monster, allowtail ? random.rn2(5) : 0, {
                ...normalized,
                state,
            });
            if (count_wsegs(monster, state))
                yield* place_worm_tail_randomly_steps(monster, x, y, normalized);
        }
    }
    // C ref: makemon.c:1410-1428. Aligned/high clerics made without a
    // priest or minion extension, and one third of Angels without an
    // explicit minion extension, become roamer minions before set_malign.
    // Keep the ternary's Angel-only gate draw in source order.
    const defaultMinionData = (
        mndx === PM_ALIGNED_CLERIC || mndx === PM_HIGH_CLERIC
    )
        ? !(mmflags & (MM_EPRI | MM_EMIN))
        : mndx === PM_ANGEL
            && !(mmflags & MM_EMIN)
            && !random.rn2(3);
    if (defaultMinionData) {
        newemin(monster);
        const emin = EMIN(monster);
        monster.isminion = true;
        emin.min_align = random.rn2(3) - 1;
        emin.renegade = (mmflags & MM_ANGRY)
            ? true
            : !random.rn2(3);
        monster.mpeaceful = emin.min_align === state.u.ualign.type
            ? !emin.renegade
            : emin.renegade;
    }
    set_malign(monster, state);

    // sp_lev.c fills special rooms after level_finalize_topology() clears
    // in_mklev.  That call is still part of level creation, identified by
    // fill_special_room()'s marker, so it must skip only makemon_runtime's
    // continuation bookkeeping and still run C's post-creation tail.
    if (!state.in_mklev && !normalized._specialRoomFill) {
        // makemon_runtime() and makemon_revival() supply a fresh
        // continuation for every runtime call.
        Object.assign(normalized.runtimeContinuation, {
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
            m_initgrp(monster, 3, mmflags, normalized);
        } else if (ptr.geno & G_LGROUP) {
            m_initgrp(
                monster,
                random.rn2(3) ? 10 : 3,
                mmflags,
                normalized,
            );
        }
    }
    yield* finishMonsterInventoryAndStrategySteps(
        monster,
        ptr,
        allowMinvent,
        mmflags,
        normalized,
    );

    if (!state.in_mklev && normalized._specialRoomFill) {
        // C's post-finalization fill still redraws the created monster,
        // emits its normal appearance line when visible, and checks the
        // active occupation.  Use the same asynchronous owner as runtime
        // creation, with default message sinks for the level builder.
        yield finishRuntimeCreationTail(monster, mmflags, {
            ...normalized,
            message: normalized.message ?? ttyPline,
            norepMessage: normalized.norepMessage ?? ttyNorep,
        });
        return monster;
    }

    return monster;
}

// Async adapter for makemon.c's runtime suffix.  The synchronous constructor
// stops immediately after set_malign(); this continuation then preserves C's
// awaited recursive group tails, parent inventory, and final output order.
export async function makemon_runtime(ptr, x, y, mmflags = 0, env = {}) {
    const message = env.message === undefined ? ttyPline : env.message;
    const norepMessage = env.norepMessage === undefined
        ? ttyNorep
        : env.norepMessage;
    if (typeof message !== 'function' || typeof norepMessage !== 'function') {
        throw new TypeError('makemon_runtime requires message operations');
    }
    const runtimeContinuation = { claimed: false };
    // This caller waits, so level_difficulty()'s impossible() for dungeon -1
    // prints where C prints it (js/source_steps.js).
    const normalized = creationEnv({
        ...env,
        message,
        norepMessage,
        runtimeContinuation,
        onImpossible: impossible_printer(env.state ?? game),
    });
    const maybeMonster = makemon(ptr, x, y, mmflags, normalized);
    const monster = maybeMonster && typeof maybeMonster.then === 'function'
        ? await maybeMonster : maybeMonster;
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
            await m_initgrp_runtime(
                monster,
                3,
                mmflags,
                normalized,
            );
        } else if (selected.geno & G_LGROUP) {
            await m_initgrp_runtime(
                monster,
                normalized.random.rn2(3) ? 10 : 3,
                mmflags,
                normalized,
            );
        }
    }
    await finish_steps(finishMonsterInventoryAndStrategySteps(
        monster,
        selected,
        allowMinvent,
        mmflags,
        normalized,
    ), normalized.onImpossible);
    await finishRuntimeCreationTail(monster, mmflags, normalized);
    return monster;
}

// C ref: makemon.c makemon(). C has one makemon(), which runs its tail after
// set_malign() (groups, inventory, newsym(), the appearance message and the
// occupation check) by testing in_mklev; the port splits that into makemon()
// for level creation and makemon_runtime() for everything else. A function
// that C runs both inside and outside level creation calls this instead, so
// the choice is made where C makes it. Such functions are the level builders
// a level program reaches through #wizloadlua (wizcmds.c wiz_load_lua() ->
// nhlua.c load_lua(), which never sets in_mklev), and sp_lev.c
// fill_special_room() when lspo_finalize_level() calls it after
// level_finalize_topology() has cleared in_mklev (#wizloaddes), which the
// _specialRoomFill marker identifies. The result is the monster or null
// during level creation and a Promise otherwise, so the caller accepts
// either. scripts/makemon-level-creation.test.mjs lists the callers that may
// still call makemon() directly, with the C call chain that keeps each one
// inside level creation.
export function makemon_by_context(ptr, x, y, mmflags = 0, env = {}) {
    const state = env.state ?? game;
    return state.in_mklev || env._specialRoomFill
        ? makemon(ptr, x, y, mmflags, env)
        : makemon_runtime(ptr, x, y, mmflags, env);
}

// C ref: makemon.c makemon(), the synchronous runtime call shape used by
// zap.c revive()/montraits(). NO_MINVENT makes the inventory tail drawless,
// MM_NOMSG suppresses the appearance line, and MM_NOWAIT suppresses the
// species' initial waiting strategy. MM_NOWAIT also makes makemon() leave any
// unrelated hero occupation alone.
export function makemon_revival(ptr, x, y, mmflags, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const runtimeContinuation = { claimed: false };
    // Every caller accepts a promise, so level_difficulty()'s impossible()
    // for dungeon -1 prints where C prints it (js/source_steps.js).
    const normalized = creationEnv({
        ...rawEnv,
        state,
        revival: true,
        runtimeContinuation,
        onImpossible: impossible_printer(state),
    });
    const finish = (monster) => {
        if (!monster) return null;
        if (!runtimeContinuation.claimed
            || runtimeContinuation.monster !== monster) {
            throw new Error('revival continuation was not claimed');
        }
        const afterInventory = () => {
            redrawSquare(monster.mx, monster.my, normalized);
            // Every revival caller passes MM_NOMSG, so makemon()'s appearance
            // message never applies; its occupation check still does.
            if (state.go?.occupation) {
                return makemonOccupationCheck(monster, normalized)
                    .then(() => monster);
            }
            return monster;
        };
        const stocked = finish_steps(finishMonsterInventoryAndStrategySteps(
            monster,
            runtimeContinuation.ptr,
            runtimeContinuation.allowMinvent,
            mmflags,
            normalized,
        ), normalized.onImpossible);
        return stocked && typeof stocked.then === 'function'
            ? stocked.then(afterInventory) : afterInventory();
    };
    const maybeMonster = makemon(ptr, x, y, mmflags, normalized);
    return maybeMonster && typeof maybeMonster.then === 'function'
        ? maybeMonster.then(finish) : finish(maybeMonster);
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
