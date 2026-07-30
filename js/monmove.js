// Monster movement decisions, actions, and item search.
// C ref: monmove.c.  Every function ported from that file lives here.
//
// Five functions here come from other C files and have not moved yet:
//   mon.c    mon_allowflags(), m_in_air(), mfndpos(), monnear()
//   trap.c   m_harmless_trap()
// mfndpos() and its helpers are about 540 lines and call back into can_fog(),
// monhaskey(), m_can_break_boulder(), closed_door(), accessible(), and
// onscary(), all of which are monmove.c and stay here.  Moving them to
// js/mon.js would make js/mon.js and this file import each other.
// m_harmless_trap() needs isSpecies() below, which duplicates speciesIs() in
// js/mondata.js; unify those two first, then the move is small.

import {
    ACCESSIBLE,
    ACCFOOD,
    AGGRAVATE_MONSTER,
    ALLOW_ALL,
    ALLOW_BARS,
    ALLOW_DIG,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_ROCK,
    ALLOW_SANCT,
    ALLOW_SSM,
    ALLOW_TM,
    ALLOW_TRAPS,
    ALLOW_U,
    ALLOW_WALL,
    ANTI_MAGIC,
    ARROW_TRAP,
    A_LAWFUL,
    A_STR,
    BEAR_TRAP,
    BOLT_LIM,
    BUSTDOOR,
    COLNO,
    CONFLICT,
    DART_TRAP,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DEAF,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    D_BROKEN,
    D_CLOSED,
    D_LOCKED,
    FAINTED,
    FIRE_TRAP,
    G_GENOD,
    HALLUC,
    HALLUC_RES,
    HOLE,
    ICE,
    INVIS,
    IRONBARS,
    IS_ALTAR,
    IS_DOOR,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_TREE,
    IS_WATERWALL,
    LANDMINE,
    LAVAPOOL,
    LAVAWALL,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    MANFOOD,
    MMOVE_DIED,
    MMOVE_DONE,
    MMOVE_MOVED,
    MMOVE_NOMOVES,
    MMOVE_NOTHING,
    MOAT,
    MTSZ,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    NEED_HTH_WEAPON,
    NEED_WEAPON,
    NOGARLIC,
    NOTONL,
    NO_WEAPON_WANTED,
    OPENDOOR,
    PIT,
    POISON_RES,
    POLY_TRAP,
    PROT_FROM_SHAPE_CHANGERS,
    P_AXE,
    P_PICK_AXE,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    ROOMOFFSET,
    ROWNO,
    RUST_TRAP,
    SHOPBASE,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    SQSRCHRADIUS,
    STATUE_TRAP,
    STEALTH,
    STONE,
    STONE_RES,
    STRAT_ARRIVE,
    STRAT_WAITFORU,
    STRAT_WAITMASK,
    TELEP_TRAP,
    TEMPLE,
    TRAPDOOR,
    TRAPNUM,
    UNLOCKDOOR,
    VIBRATING_SQUARE,
    WEB,
    WT_TOOMUCH_DIAGONAL,
    W_ARM,
    W_ARMS,
    W_NONDIGGABLE,
    isok,
} from './const.js';
import { ART_SUNSWORD } from './artifacts.js';
import { effective_attribute } from './attrib.js';
import { obj_resists } from './bury.js';
import { newsym } from './display.js';
import { dogfood } from './dogfood.js';
import { could_reach_item } from './dogmove.js';
import { on_level } from './dungeon.js';
import { bad_rock, may_dig, may_passwall } from './hack.js';
import { sengr_at, wipe_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { dist2, distmin, online2 } from './hacklib.js';
import { money_cnt } from './invent.js';
import { curr_mon_load, m_carrying, max_mon_load } from './mon.js';
import { can_carry } from './moncarry.js';
import {
    acidic,
    amorphous,
    attacktype,
    attacktype_fordmg,
    bigmonst,
    breathless,
    dmgtype,
    flesh_petrifies,
    haseyes,
    hides_under,
    is_animal,
    is_clinger,
    is_displacer,
    is_floater,
    is_flyer,
    is_giant,
    is_human,
    is_minion,
    is_rider,
    is_swimmer,
    is_undead,
    is_unicorn,
    is_vampshifter,
    is_wanderer,
    is_whirly,
    likes_gems,
    likes_gold,
    likes_lava,
    likes_magic,
    likes_objs,
    metallivorous,
    mindless,
    mon_knows_traps,
    monster_resists_element,
    needspick,
    noattacks,
    nohands,
    noncorporeal,
    nonliving,
    passes_bars,
    passes_walls,
    perceives,
    resist_conflict,
    slithy,
    throws_rocks,
    touch_petrifies,
    tunnels,
    unsolid,
    vegan,
    verysmall,
    webmaker,
    zombie_form,
} from './mondata.js';
import {
    m_at,
    mon_track_clear,
    place_monster,
    remove_monster,
} from './monst.js';
import {
    AD_CORR,
    AD_DRST,
    AD_RBRE,
    AD_RUST,
    AT_BREA,
    AT_WEAP,
    G_UNIQ,
    MS_LEADER,
    MZ_SMALL,
    PM_ANGEL,
    PM_BABY_PURPLE_WORM,
    PM_DISPLACER_BEAST,
    PM_ETTIN,
    PM_FLOATING_EYE,
    PM_FOG_CLOUD,
    PM_GHOUL,
    PM_GREMLIN,
    PM_GRID_BUG,
    PM_HEZROU,
    PM_IRON_GOLEM,
    PM_JABBERWOCK,
    PM_MINOTAUR,
    PM_PURPLE_WORM,
    PM_SHRIEKER,
    PM_SKELETON,
    PM_STALKER,
    PM_VROCK,
    PM_XORN,
    S_BAT,
    S_DOG,
    S_EEL,
    S_GHOST,
    S_HUMAN,
    S_LEPRECHAUN,
    S_LICH,
    S_LIGHT,
    S_NYMPH,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import { searches_for_item } from './muse.js';
import { isCandle, isContainer, objectType, sobj_at } from './obj.js';
import {
    AMULET_CLASS,
    ARMOR_CLASS,
    ARM_CLOAK,
    ARM_GLOVES,
    ARM_SHIRT,
    ARROW,
    AXE,
    BAG_OF_HOLDING,
    BAG_OF_TRICKS,
    BATTLE_AXE,
    BLINDFOLD,
    BOOMERANG,
    BOULDER,
    CANDY_BAR,
    CLOVE_OF_GARLIC,
    COIN_CLASS,
    CORPSE,
    CREDIT_CARD,
    CRYSKNIFE,
    DAGGER,
    DWARVISH_MATTOCK,
    FEDORA,
    FORTUNE_COOKIE,
    GEM_CLASS,
    GOLD_DRAGON_SCALES,
    GOLD_DRAGON_SCALE_MAIL,
    LEASH,
    LEATHER_JACKET,
    LEMBAS_WAFER,
    LOCK_PICK,
    LUMP_OF_ROYAL_JELLY,
    MAGIC_MARKER,
    MAGIC_WHISTLE,
    OILSKIN_SACK,
    PANCAKE,
    PICK_AXE,
    RING_CLASS,
    SACK,
    SCR_SCARE_MONSTER,
    SKELETON_KEY,
    SLING,
    STETHOSCOPE,
    TIN_OPENER,
    TIN_WHISTLE,
    TOOL_CLASS,
    TOWEL,
    VENOM_CLASS,
    WAN_STRIKING,
    WEAPON_CLASS,
} from './objects.js';
import {
    in_your_sanctuary,
    inhistemple,
    mon_aligntyp,
} from './priest.js';
import { m_in_out_region, visible_region_at } from './region.js';
import { rn2, rnd } from './rng.js';
import { in_rooms } from './rooms.js';
import { inhishop } from './shk.js';
import { collectMonsterMovementMessage } from './startup_a11y.js';
import { S_poisoncloud } from './symbols.js';
import { noteleport_level } from './teleport.js';
import { gettrack, hastrack } from './track.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { ttyPline } from './tty_message.js';
import { cansee, clear_path, couldsee } from './vision.js';
import { can_touch_safely, which_armor } from './weapon.js';
import * as M from './monsters.js';
import * as O from './objects.js';


function movementEnv(env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2, rnd };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('monster movement random injection requires rn2');
    const couldSee = env.couldSee ?? ((x, y) => couldsee(x, y, state));
    if (typeof couldSee !== 'function')
        throw new TypeError('monster movement couldSee must be a function');
    return {
        ...env,
        state,
        random,
        couldSee,
    };
}

function propertyActive(state, property, blockedMatters = false) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && (!blockedMatters || !value?.blocked);
}

function doorMask(location) {
    // rm.doormask aliases flags in C. doormask remains a compatibility input
    // for focused fixtures and older persisted state.
    return location?.flags || location?.doormask || 0;
}

function drawbridgeMask(location) {
    return location?.flags || location?.drawbridgemask || 0;
}

// C ref: monmove.c mon_track_add(). Index zero is the newest square.
export function mon_track_add(monster, x, y) {
    if (!Array.isArray(monster?.mtrack))
        throw new TypeError('mon_track_add requires monster tracking state');
    for (let index = monster.mtrack.length - 1; index > 0; --index) {
        monster.mtrack[index].x = monster.mtrack[index - 1].x;
        monster.mtrack[index].y = monster.mtrack[index - 1].y;
    }
    if (monster.mtrack.length) {
        monster.mtrack[0].x = x;
        monster.mtrack[0].y = y;
    }
}

// C ref: monmove.c m_avoid_kicked_loc(). Peaceful monsters remember the
// adjacent square most recently kicked by the hero while they can see and
// remain unaffected by confusion, stun, or Conflict.
export function m_avoid_kicked_loc(monster, x, y, state = game) {
    const kicked = state.gk?.kickedloc;
    return Boolean(
        (monster.mpeaceful || monster.mtame)
        && monster.mcansee
        && !monster.mconf
        && !monster.mstun
        && !propertyActive(state, CONFLICT, true)
        && isok(kicked?.x, kicked?.y)
        && x === kicked.x
        && y === kicked.y
        && dist2(x, y, state.u.ux, state.u.uy) <= 2
    );
}

// C ref: monmove.c m_avoid_soko_push_loc(). A peaceful monster avoids the
// square two steps from the hero when the intervening Sokoban square holds a
// boulder.
export function m_avoid_soko_push_loc(monster, x, y, state = game) {
    if (!state.level?.flags?.sokoban_rules
        || (!monster.mpeaceful && !monster.mtame)
        || monster.mconf
        || monster.mstun
        || propertyActive(state, CONFLICT, true)
        || dist2(x, y, state.u.ux, state.u.uy) !== 4) {
        return false;
    }
    return Boolean(sobj_at(
        BOULDER,
        x + Math.sign(state.u.ux - x),
        y + Math.sign(state.u.uy - y),
        state,
    ));
}

// C ref: monmove.c undesirable_disp(). Pet trap and cursed-square avoidance
// differs from the trap knowledge used by other monsters.
export function undesirable_disp(monster, x, y, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    if (typeof random.rn2 !== 'function')
        throw new TypeError('undesirable_disp requires rn2');
    const trap = t_at(x, y, state);
    const isPet = monster.mtame && !monster.isminion;
    if (isPet) {
        if (trap?.tseen && random.rn2(40)) return true;
        const cursedObjectAt = env.cursedObjectAt;
        if (typeof cursedObjectAt !== 'function') {
            throw new TypeError(
                'undesirable_disp requires cursedObjectAt for a pet',
            );
        }
        if (cursedObjectAt(x, y, state)) return true;
    } else if (trap && random.rn2(40)
        && mon_knows_traps(monster, trap.ttyp)) {
        return true;
    }
    return !accessible(x, y, state)
        && !(is_pool(x, y, state)
            && is_pool(monster.mx, monster.my, state));
}

// C ref: monmove.c should_displace(). A displacement square is useful only
// when it is the shortest route or no ordinary candidate remains.
export function should_displace(monster, data, goalX, goalY, env = {}) {
    const state = env.state ?? game;
    let withDisplacing = -1;
    let withoutDisplacing = -1;
    let ordinaryCount = 0;
    for (let index = 0; index < data.cnt; ++index) {
        const { x, y } = data.poss[index];
        const distance = dist2(x, y, goalX, goalY);
        if (m_at(x, y, state)
            && (data.info[index] & ALLOW_MDISP)
            && !(data.info[index] & ALLOW_M)
            && !undesirable_disp(monster, x, y, env)) {
            if (withDisplacing < 0 || distance < withDisplacing)
                withDisplacing = distance;
        } else {
            if (withoutDisplacing < 0 || distance < withoutDisplacing)
                withoutDisplacing = distance;
            ordinaryCount++;
        }
    }
    return withDisplacing >= 0
        && (withDisplacing < withoutDisplacing || !ordinaryCount);
}

// C ref: monmove.c closed_door().
export function closed_door(x, y, state = game) {
    const location = state.level?.at(x, y);
    return location?.typ === DOOR
        && Boolean(doorMask(location) & (D_LOCKED | D_CLOSED));
}

// C ref: monmove.c m_everyturn_effect(). This runs for each living on-map
// monster before its movement-ration check and for the hero near the end of
// each input cycle. createGasCloud owns create_gas_cloud().
export async function m_everyturn_effect(monster, env = {}) {
    const state = env.state ?? game;
    if (!isSpecies(monster, PM_FOG_CLOUD, state)) return;
    const isHero = monster === state.youmonst;
    const x = isHero ? state.u?.ux : monster.mx;
    const y = isHero ? state.u?.uy : monster.my;
    if (closed_door(x, y, state) || visible_region_at(x, y, state)) return;
    if (typeof env.createGasCloud !== 'function') {
        throw new TypeError(
            'm_everyturn_effect requires a createGasCloud operation',
        );
    }
    await env.createGasCloud(x, y, 1, 0, { ...env, state });
}

function requireDochugwOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function') {
        throw new TypeError(`dochugw requires a ${name} operation`);
    }
    return operation;
}

function heroHallucinating(state) {
    const hallucination = state.u?.uprops?.[HALLUC];
    const resistance = state.u?.uprops?.[HALLUC_RES];
    return Boolean(hallucination?.intrinsic)
        && !Boolean(resistance?.intrinsic || resistance?.extrinsic);
}

// C ref: monmove.c dochugw(). The injected dochug operation owns the complete
// monster action. canSpotMonster and stopOccupation retain display/sensing and
// command-state ownership. When an occupation is active, preflight those
// later seams before dochug can mutate the monster or game state.
export async function dochugw(monster, chug, env = {}) {
    const state = env.state ?? game;
    const occupation = state.occupation;
    const dochugOperation = chug
        ? requireDochugwOperation(env, 'dochug')
        : null;
    let canSpotMonster;
    let stopOccupation;
    if (occupation) {
        canSpotMonster = requireDochugwOperation(env, 'canSpotMonster');
        stopOccupation = requireDochugwOperation(env, 'stopOccupation');
    }
    const couldSee = env.couldSee
        ?? ((x, y) => couldsee(x, y, state));
    if (occupation && typeof couldSee !== 'function') {
        throw new TypeError('dochugw requires a couldSee operation');
    }

    const x = monster.mx;
    const y = monster.my;
    const alreadySawMonster = chug && occupation
        ? Boolean(canSpotMonster(monster, { ...env, state }))
        : false;
    const result = chug
        ? await dochugOperation(monster, { ...env, state })
        : 0;
    const threatRange = (BOLT_LIM + 1) * (BOLT_LIM + 1);

    if (state.occupation && !result
        && (heroHallucinating(state)
            || (!monster.mpeaceful && !noattacks(monster.data)))
        && dist2(monster.mx, monster.my, state.u?.ux, state.u?.uy)
            <= threatRange
        && (!alreadySawMonster
            || !couldSee(x, y, { ...env, state })
            || dist2(x, y, state.u?.ux, state.u?.uy) > threatRange)
        && canSpotMonster(monster, { ...env, state })
        && couldSee(monster.mx, monster.my, { ...env, state })
        && monster.mcanmove
        && !onscary(state.u?.ux, state.u?.uy, monster, state)) {
        await stopOccupation({ ...env, state });
    }

    return result;
}

function surfaceAt(x, y, state) {
    const location = state.level?.at(x, y);
    if (!location) return STONE;
    if (location.typ !== DRAWBRIDGE_UP) return location.typ;
    switch (drawbridgeMask(location) & DB_UNDER) {
    case DB_ICE: return ICE;
    case DB_LAVA: return LAVAPOOL;
    case DB_MOAT: return MOAT;
    default: return STONE;
    }
}

// C ref: monmove.c accessible(). Closed drawbridges use their underlying
// terrain through rm.h's SURFACE_AT macro.
export function accessible(x, y, state = game) {
    return ACCESSIBLE(surfaceAt(x, y, state)) && !closed_door(x, y, state);
}

// C ref: monmove.c monhaskey(). Credit cards can unlock but cannot lock.
export function monhaskey(monster, forUnlocking, state = game) {
    if (forUnlocking && m_carrying(monster, CREDIT_CARD, state)) return true;
    return Boolean(m_carrying(monster, SKELETON_KEY, state)
        || m_carrying(monster, LOCK_PICK, state));
}

// C ref: monmove.c m_can_break_boulder(). Riders do not spend special-action
// cooldown; the caller which fractures the boulder owns that later effect.
export function m_can_break_boulder(monster) {
    return is_rider(monster.data)
        || (!(monster.mspec_used ?? 0)
            && (monster.isshk
                || monster.ispriest
                || monster.data?.msound === MS_LEADER));
}

// C ref: mon.c mon_allowflags(). This returns only movement capabilities;
// mfndpos() owns applying them to individual neighboring squares. When
// Conflict is active, the source always makes exactly one resistance draw,
// even for a hostile monster which already has ALLOW_U.
export function mon_allowflags(monster, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rnd };
    const species = monster.data;
    const conflict = propertyActive(state, CONFLICT);
    const canOpen = !(nohands(species) || verysmall(species));
    const canUnlock = (canOpen && monhaskey(monster, true, state))
        || monster.iswiz || is_rider(species);
    const doorbuster = is_giant(species);
    let canTunnel = tunnels(species)
        && !on_level(state.u?.uz, state.rogue_level);

    if (canTunnel && needspick(species)
        && ((!monster.mpeaceful || conflict)
            && dist2(monster.mx, monster.my, monster.mux, monster.muy) <= 8)) {
        canTunnel = false;
    }

    let allowflags = 0;
    if (monster.mtame) {
        allowflags |= ALLOW_M | ALLOW_TRAPS | ALLOW_SANCT | ALLOW_SSM;
    } else if (monster.mpeaceful) {
        allowflags |= ALLOW_SANCT | ALLOW_SSM;
    } else {
        allowflags |= ALLOW_U;
    }
    if (conflict && !resist_conflict(monster, state, random))
        allowflags |= ALLOW_U;
    if (monster.isshk) allowflags |= ALLOW_SSM;
    if (monster.ispriest) allowflags |= ALLOW_SSM | ALLOW_SANCT;
    if (passes_walls(species)) allowflags |= ALLOW_ROCK | ALLOW_WALL;
    if (throws_rocks(species) || m_can_break_boulder(monster))
        allowflags |= ALLOW_ROCK;
    if (canTunnel) allowflags |= ALLOW_DIG;
    if (doorbuster) allowflags |= BUSTDOOR;
    if (canOpen) allowflags |= OPENDOOR;
    if (canUnlock) allowflags |= UNLOCKDOOR;
    if (passes_bars(species)
        && (monster !== state.u?.ustuck
            || unsolid(state.youmonst?.data)
            || verysmall(state.youmonst?.data))) {
        allowflags |= ALLOW_BARS;
    }
    if (is_minion(species) || is_rider(species))
        allowflags |= ALLOW_SANCT;
    if (is_unicorn(species) && !noteleport_level(monster, state))
        allowflags |= NOTONL;
    if (is_human(species) || species === state.mons?.[PM_MINOTAUR])
        allowflags |= ALLOW_SSM;
    if ((is_undead(species) && species?.mlet !== S_GHOST)
        || is_vampshifter(monster)) {
        allowflags |= NOGARLIC;
    }
    return allowflags;
}

function currentLevelHasCeiling(state) {
    return !inEndgame(state) || on_level(state.u?.uz, state.earth_level);
}

// C ref: mon.c m_in_air(). Clingers count only while concealed against a
// ceiling; ordinary flyers and floaters are unconditional.
export function m_in_air(monster, state = game) {
    return is_flyer(monster.data)
        || is_floater(monster.data)
        || (is_clinger(monster.data)
            && currentLevelHasCeiling(state)
            && monster.mundetected);
}

// mfndpos() never passes the hero to hack.c cant_squeeze_thru(). Preserve the
// complete monster branch without importing the later hero burden subsystem.
function monsterCantSqueezeThrough(monster, state) {
    const species = monster.data;
    if (passes_walls(species)) return 0;
    if (bigmonst(species)
        && !(amorphous(species) || is_whirly(species)
            || noncorporeal(species) || slithy(species)
            || can_fog(monster, state))) {
        return 1;
    }
    return curr_mon_load(monster, state) > WT_TOOMUCH_DIAGONAL ? 2 : 0;
}

function isPick(obj, state) {
    return Boolean(obj && objectType(obj, state).oc_skill === P_PICK_AXE);
}

function isAxe(obj, state) {
    return Boolean(obj && objectType(obj, state).oc_skill === P_AXE);
}

function monsterPoisonGasSafe(monster, state) {
    const species = monster.data;
    if (nonliving(species) || is_vampshifter(monster)
        || breathless(species)
        || isSpecies(monster, PM_HEZROU, state)
        || isSpecies(monster, PM_VROCK, state)) {
        return true;
    }
    if ((species?.mlet === S_EEL
        || on_level(state.u?.uz, state.water_level))
        && is_pool(monster.mx, monster.my, state)) {
        return true;
    }
    return attacktype_fordmg(species, AT_BREA, AD_DRST)
        || attacktype_fordmg(species, AT_BREA, AD_RBRE);
}

const FLOOR_TRIGGER_TRAPS = new Set([
    ARROW_TRAP,
    DART_TRAP,
    ROCKTRAP,
    SQKY_BOARD,
    BEAR_TRAP,
    LANDMINE,
    ROLLING_BOULDER_TRAP,
    SLP_GAS_TRAP,
    RUST_TRAP,
    FIRE_TRAP,
    PIT,
    SPIKED_PIT,
    HOLE,
    TRAPDOOR,
]);

function trapResistance(monster, trap, env) {
    if (typeof env.resistsTrapEffect !== 'function') {
        throw new TypeError(
            'm_harmless_trap requires resistsTrapEffect for this trap type',
        );
    }
    return Boolean(env.resistsTrapEffect(monster, trap.ttyp, env));
}

// C ref: trap.c m_harmless_trap(). Elemental and antimagic equipment defense
// stays with its artifact/equipment owner and is requested only on those three
// branches; every shape, flight, and ordinary-trap clause is local.
export function m_harmless_trap(monster, trap, env = {}) {
    const state = env.state ?? game;
    const species = monster.data;
    const sokoban = Boolean(state.level?.flags?.sokoban_rules);
    if (!sokoban && FLOOR_TRIGGER_TRAPS.has(trap.ttyp)
        && (is_floater(species) || is_flyer(species))) {
        return true;
    }

    switch (trap.ttyp) {
    case ARROW_TRAP:
    case DART_TRAP:
    case ROCKTRAP:
    case SQKY_BOARD:
    case LANDMINE:
    case ROLLING_BOULDER_TRAP:
    case TELEP_TRAP:
    case LEVEL_TELEP:
    case MAGIC_PORTAL:
    case POLY_TRAP:
        return false;
    case BEAR_TRAP:
        return species.msize <= MZ_SMALL || amorphous(species)
            || is_whirly(species) || unsolid(species);
    case SLP_GAS_TRAP:
    case FIRE_TRAP:
    case ANTI_MAGIC:
        return trapResistance(monster, trap, { ...env, state });
    case RUST_TRAP:
        return !isSpecies(monster, PM_IRON_GOLEM, state);
    case PIT:
    case SPIKED_PIT:
    case HOLE:
    case TRAPDOOR:
        return is_clinger(species) && !sokoban;
    case WEB:
        return amorphous(species) || webmaker(species)
            || is_whirly(species) || unsolid(species);
    case STATUE_TRAP:
    case MAGIC_TRAP:
    case VIBRATING_SQUARE:
        return true;
    default:
        return false;
    }
}

function fixedTeleportTrap(trap) {
    return trap.ttyp === TELEP_TRAP
        && isok(trap.teledest?.x, trap.teledest?.y);
}

function wormCross(x1, y1, x2, y2, state) {
    if (Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) !== 1
        || x1 === x2 || y1 === y2) {
        return false;
    }
    const worm = m_at(x1, y2, state);
    if (!worm || m_at(x2, y1, state) !== worm) return false;
    const segments = state.level?.worms?.[worm.wormno]?.segments ?? [];
    for (let index = 0; index + 1 < segments.length; ++index) {
        const current = segments[index];
        const next = segments[index + 1];
        if (current.x === x1 && current.y === y2)
            return next.x === x2 && next.y === y1;
        if (current.x === x2 && current.y === y1)
            return next.x === x1 && next.y === y2;
    }
    return false;
}

function onWizardTowerLevel(state) {
    const level = state.u?.uz;
    return on_level(level, state.wiz1_level)
        || on_level(level, state.wiz2_level)
        || on_level(level, state.wiz3_level);
}

function inWizardTower(x, y, state) {
    if (!onWizardTowerLevel(state)) return false;
    const bounds = state.dndest;
    if (!bounds?.nlx) return false;
    return x >= bounds.nlx && x <= bounds.nhx
        && y >= bounds.nly && y <= bounds.nhy;
}

function zombieMaker(monster, state) {
    if (monster.mcan) return false;
    if (monster.data?.mlet === S_LICH) return true;
    if (monster.data?.mlet !== S_ZOMBIE) return false;
    return !isSpecies(monster, PM_GHOUL, state)
        && !isSpecies(monster, PM_SKELETON, state);
}

function uniqueCorpstat(species) {
    return Boolean((species?.geno ?? 0) & G_UNIQ);
}

function mmTwoWayAggression(attacker, defender, state) {
    if (onWizardTowerLevel(state)) {
        const heroInside = inWizardTower(state.u?.ux, state.u?.uy, state);
        if (heroInside
            ? (!inWizardTower(attacker.mx, attacker.my, state)
                || !inWizardTower(defender.mx, defender.my, state))
            : (inWizardTower(attacker.mx, attacker.my, state)
                || inWizardTower(defender.mx, defender.my, state))) {
            return 0;
        }
    }
    if (zombieMaker(attacker, state)
        && zombie_form(defender.data) >= 0) {
        if (attacker.mgenmklev && defender.mgenmklev) return 0;
        if (!on_level(state.u?.uz, state.stronghold_level)
            && !uniqueCorpstat(attacker.data)
            && !uniqueCorpstat(defender.data)) {
            return ALLOW_M | ALLOW_TM;
        }
    }
    return 0;
}

function mmAggression(attacker, defender, state) {
    if (attacker.mtame && defender.mtame) return 0;
    if ((isSpecies(attacker, PM_PURPLE_WORM, state)
        || isSpecies(attacker, PM_BABY_PURPLE_WORM, state))
        && isSpecies(defender, PM_SHRIEKER, state)) {
        return ALLOW_M | ALLOW_TM;
    }
    return mmTwoWayAggression(attacker, defender, state)
        | mmTwoWayAggression(defender, attacker, state);
}

function wormSegmentCount(monster, state) {
    if (!monster.wormno) return 0;
    const count = state.level?.worms?.[monster.wormno]?.segments?.length ?? 0;
    return Math.max(0, count - 1);
}

function mmDisplacement(attacker, defender, state) {
    const attackerSpecies = attacker.data;
    const defenderSpecies = defender.data;
    if (is_displacer(attackerSpecies)
        && (!is_displacer(defenderSpecies)
            || attacker.m_lev > defender.m_lev)
        && !(attacker.mx !== defender.mx && attacker.my !== defender.my
            && isSpecies(defender, PM_GRID_BUG, state))
        && !defender.mtrapped
        && (!defender.wormno || !wormSegmentCount(defender, state))
        && (is_rider(attackerSpecies)
            || attackerSpecies.msize >= defenderSpecies.msize)) {
        return ALLOW_MDISP;
    }
    return 0;
}

// C ref: mon.c mfndpos()'s `memset(data, 0, sizeof(struct mfndposdata))`. Each
// C call site declares a fresh local, and so does each caller here, so the
// nine slots are rebuilt rather than reused.
function resetMfndposData(data) {
    if (!data || typeof data !== 'object')
        throw new TypeError('mfndpos requires an output data object');
    data.cnt = 0;
    data.poss = Array.from({ length: 9 }, () => ({ x: 0, y: 0 }));
    data.info = new Array(9).fill(0);
}

function snapshotProperty(target, key) {
    return {
        owned: Object.hasOwn(target, key),
        value: target[key],
    };
}

function restoreProperty(target, key, snapshot) {
    if (snapshot.owned) target[key] = snapshot.value;
    else delete target[key];
}

function snapshotMfndposMutation(monster, data) {
    // A caller mid-call holds the nine slots resetMfndposData() built, so the
    // per-slot values are worth restoring. A caller that has not reached that
    // point yet passes whatever it declared, and the property snapshots below
    // restore the arrays themselves.
    const reusablePositions = Array.isArray(data.poss) && data.poss.length === 9
        && data.poss.every((position) => position && typeof position === 'object');
    const reusableInfo = Array.isArray(data.info) && data.info.length === 9;
    return {
        mux: snapshotProperty(monster, 'mux'),
        muy: snapshotProperty(monster, 'muy'),
        cnt: snapshotProperty(data, 'cnt'),
        poss: snapshotProperty(data, 'poss'),
        positions: reusablePositions
            ? data.poss.map((position) => ({
                position,
                x: snapshotProperty(position, 'x'),
                y: snapshotProperty(position, 'y'),
            }))
            : null,
        info: snapshotProperty(data, 'info'),
        infoValues: reusableInfo ? data.info.slice() : null,
    };
}

function restoreMfndposMutation(monster, data, snapshot) {
    restoreProperty(monster, 'mux', snapshot.mux);
    restoreProperty(monster, 'muy', snapshot.muy);
    restoreProperty(data, 'cnt', snapshot.cnt);
    restoreProperty(data, 'poss', snapshot.poss);
    if (snapshot.positions) {
        for (const entry of snapshot.positions) {
            restoreProperty(entry.position, 'x', entry.x);
            restoreProperty(entry.position, 'y', entry.y);
        }
    }
    restoreProperty(data, 'info', snapshot.info);
    if (snapshot.infoValues) {
        for (let index = 0; index < snapshot.infoValues.length; ++index)
            data.info[index] = snapshot.infoValues[index];
    }
}

function hasAdjacentResistanceTrap(monster, state) {
    for (const trap of state.level?.traps ?? []) {
        if (Math.abs(trap.tx - monster.mx) > 1
            || Math.abs(trap.ty - monster.my) > 1
            || (trap.tx === monster.mx && trap.ty === monster.my)) {
            continue;
        }
        if (trap.ttyp === SLP_GAS_TRAP
            || trap.ttyp === FIRE_TRAP
            || trap.ttyp === ANTI_MAGIC) {
            return true;
        }
    }
    return false;
}

// C ref: mon.c mfndpos(). Candidate iteration is x-major then y-major, and
// each call rebuilds the caller's nine `poss` and `info` slots, as C's memset
// of a caller-declared local does. `info[i]` describes what accepting
// `poss[i]` entails rather than echoing `initialFlags`: ALLOW_U/ALLOW_M and
// ALLOW_TM mark attacks, ALLOW_MDISP marks displacement, ALLOW_SSM and
// ALLOW_SANCT mark protected squares, ALLOW_ROCK marks a boulder,
// ALLOW_TRAPS marks a harmful or fixed teleport trap, and NOGARLIC/NOTONL mark
// garlic or alignment with the remembered hero. Discovering an adjacent hero
// updates `monster.mux`/`muy` before an absent ALLOW_U rejects that square.
function mfndposCore(monster, data, initialFlags, env = {}) {
    const state = env.state ?? game;
    const species = monster.data;
    const onScaryCheck = env.onScary ?? onscary;
    const sanctuaryCheck = env.inYourSanctuary ?? in_your_sanctuary;
    const harmlessTrap = env.mHarmlessTrap ?? m_harmless_trap;
    const aggression = env.mmAggression ?? mmAggression;
    const displacement = env.mmDisplacement ?? mmDisplacement;
    resetMfndposData(data);

    const x = monster.mx;
    const y = monster.my;
    const currentLocation = state.level?.at?.(x, y);
    if (!currentLocation)
        throw new RangeError('mfndpos monster is outside the current map');
    const nowType = currentLocation.typ;
    const noDiagonal = isSpecies(monster, PM_GRID_BUG, state);
    let wantPool = species.mlet === S_EEL;
    const poolOkay = (!on_level(state.u?.uz, state.water_level)
            && m_in_air(monster, state))
        || (is_swimmer(species) && !wantPool);
    let lavaOkay = m_in_air(monster, state) || likes_lava(species);
    if (isSpecies(monster, PM_FLOATING_EYE, state)) lavaOkay = false;
    let flags = initialFlags | 0;
    let throughDoor = Boolean(flags & (ALLOW_WALL | BUSTDOOR));
    const poisonGasOkay = monsterPoisonGasSafe(monster, state);
    const currentGas = visible_region_at(x, y, state);
    const inPoisonGas = currentGas?.glyph === S_poisoncloud;
    let rockOkay = false;
    let treeOkay = false;

    if (flags & ALLOW_DIG) {
        const weapon = monster.mw;
        if (!needspick(species)) {
            rockOkay = treeOkay = true;
        } else if (weapon?.cursed
            && monster.weapon_check === NO_WEAPON_WANTED) {
            rockOkay = isPick(weapon, state);
            treeOkay = isAxe(weapon, state);
        } else {
            rockOkay = Boolean(m_carrying(monster, PICK_AXE, state)
                || (m_carrying(monster, DWARVISH_MATTOCK, state)
                    && !which_armor(monster, W_ARMS)));
            treeOkay = Boolean(m_carrying(monster, AXE, state)
                || (m_carrying(monster, BATTLE_AXE, state)
                    && !which_armor(monster, W_ARMS)));
        }
        if (rockOkay || treeOkay) throughDoor = true;
    }

    let count = 0;
    for (;;) {
        if (monster.mconf) {
            flags |= ALLOW_ALL;
            flags &= ~NOTONL;
        }
        if (!monster.mcansee) flags |= ALLOW_SSM;
        const maxX = Math.min(x + 1, COLNO - 1);
        const maxY = Math.min(y + 1, ROWNO - 1);
        for (let nx = Math.max(1, x - 1); nx <= maxX; ++nx) {
            for (let ny = Math.max(0, y - 1); ny <= maxY; ++ny) {
                if (nx === x && ny === y) continue;
                const location = state.level.at(nx, ny);
                const nextType = location.typ;
                if (IS_OBSTRUCTED(nextType)
                    && !((flags & ALLOW_WALL)
                        && may_passwall(nx, ny, state))
                    && !((IS_TREE(nextType, state)
                        ? treeOkay : rockOkay) && may_dig(nx, ny, state))) {
                    continue;
                }
                if (IS_OBSTRUCTED(nextType) && rockOkay
                    && !mindless(species)
                    && (monster.mpeaceful || monster.mtame)
                    && (in_rooms(nx, ny, TEMPLE, state)[0]
                        || in_rooms(nx, ny, SHOPBASE, state)[0])
                    && !(in_rooms(x, y, TEMPLE, state)[0]
                        || in_rooms(x, y, SHOPBASE, state)[0])) {
                    continue;
                }
                if (IS_WATERWALL(nextType) && !is_swimmer(species)) continue;
                if (nextType === IRONBARS
                    && (!(flags & ALLOW_BARS)
                        || (((location.wall_info ?? 0) & W_NONDIGGABLE)
                            && (dmgtype(species, AD_RUST)
                                || dmgtype(species, AD_CORR))))) {
                    continue;
                }
                if (IS_DOOR(nextType)
                    && !((amorphous(species) || can_fog(monster, state))
                        && !(state.u?.uswallow
                            && state.u?.ustuck === monster))
                    && ((((doorMask(location) & D_CLOSED)
                            && !(flags & OPENDOOR))
                        || ((doorMask(location) & D_LOCKED)
                            && !(flags & UNLOCKDOOR)))
                        && !throughDoor)) {
                    continue;
                }
                const nextGas = visible_region_at(nx, ny, state);
                if (!poisonGasOkay && !inPoisonGas
                    && nextGas?.glyph === S_poisoncloud) {
                    continue;
                }
                const diagonal = nx !== x && ny !== y;
                if (diagonal
                    && (noDiagonal
                        || (IS_DOOR(nowType)
                            && (doorMask(currentLocation) & ~D_BROKEN))
                        || (IS_DOOR(nextType)
                            && (doorMask(location) & ~D_BROKEN))
                        || ((IS_DOOR(nowType) || IS_DOOR(nextType))
                            && on_level(state.u?.uz, state.rogue_level))
                        || (m_at(x, ny, state) && m_at(nx, y, state)
                            && wormCross(x, y, nx, ny, state)
                            && !m_at(nx, ny, state)
                            && (nx !== state.u?.ux || ny !== state.u?.uy)))) {
                    continue;
                }
                if ((!lavaOkay || !(flags & ALLOW_WALL))
                    && nextType === LAVAWALL) {
                    continue;
                }
                if (!(poolOkay || is_pool(nx, ny, state) === wantPool)
                    || !(lavaOkay || !is_lava(nx, ny, state))) {
                    continue;
                }

                const monsterSeesHero = monster.mcansee
                    && (!propertyActive(state, INVIS, true)
                        || perceives(species));
                const checkObject = Boolean(
                    state.level?.objects?.[nx]?.[ny],
                );
                let displacedX = nx;
                let displacedY = ny;
                if (propertyActive(state, DISPLACED) && monsterSeesHero
                    && monster.mux === nx && monster.muy === ny) {
                    displacedX = state.u.ux;
                    displacedY = state.u.uy;
                }

                data.info[count] = 0;
                if (onScaryCheck(displacedX, displacedY, monster, state)) {
                    if (!(flags & ALLOW_SSM)) continue;
                    data.info[count] |= ALLOW_SSM;
                }
                const heroAt = state.u?.ux === nx && state.u?.uy === ny;
                if (heroAt || (nx === monster.mux && ny === monster.muy)) {
                    if (heroAt) {
                        monster.mux = state.u.ux;
                        monster.muy = state.u.uy;
                    }
                    if (!(flags & ALLOW_U)) continue;
                    data.info[count] |= ALLOW_U;
                } else {
                    const occupant = m_at(nx, ny, state);
                    if (occupant) {
                        const monsterFlags = flags
                            | aggression(monster, occupant, state);
                        if (monsterFlags & ALLOW_M) {
                            data.info[count] |= ALLOW_M;
                            if (occupant.mtame) {
                                if (!(monsterFlags & ALLOW_TM)) continue;
                                data.info[count] |= ALLOW_TM;
                            }
                        } else {
                            flags &= ~ALLOW_MDISP;
                            const displacementFlags = flags
                                | displacement(monster, occupant, state);
                            if (!(displacementFlags & ALLOW_MDISP)) continue;
                            data.info[count] |= ALLOW_MDISP;
                        }
                    }
                    if (state.level?.flags?.has_temple
                        && in_rooms(nx, ny, TEMPLE, state)[0]
                        && !in_rooms(x, y, TEMPLE, state)[0]
                        && sanctuaryCheck(null, nx, ny, state)) {
                        if (!(flags & ALLOW_SANCT)) continue;
                        data.info[count] |= ALLOW_SANCT;
                    }
                }
                if (checkObject && sobj_at(CLOVE_OF_GARLIC, nx, ny, state)) {
                    if (flags & NOGARLIC) continue;
                    data.info[count] |= NOGARLIC;
                }
                if (checkObject && sobj_at(BOULDER, nx, ny, state)) {
                    if (!(flags & ALLOW_ROCK)) continue;
                    data.info[count] |= ALLOW_ROCK;
                }
                if (monsterSeesHero
                    && online2(nx, ny, monster.mux, monster.muy)) {
                    if (flags & NOTONL) continue;
                    data.info[count] |= NOTONL;
                }
                if (diagonal && bad_rock(species, x, ny, state)
                    && bad_rock(species, nx, y, state)
                    && monsterCantSqueezeThrough(monster, state)) {
                    continue;
                }
                const trap = t_at(nx, ny, state);
                if (trap) {
                    if (trap.ttyp >= TRAPNUM || trap.ttyp === 0) continue;
                    if (fixedTeleportTrap(trap) && hastrack(nx, ny, state)) {
                        data.info[count] |= ALLOW_TRAPS;
                    } else if (!harmlessTrap(monster, trap, { ...env, state })) {
                        if (!(flags & ALLOW_TRAPS)
                            && mon_knows_traps(monster, trap.ttyp)) {
                            continue;
                        }
                        data.info[count] |= ALLOW_TRAPS;
                    }
                }
                data.poss[count].x = nx;
                data.poss[count].y = ny;
                ++count;
            }
        }
        if (!count && wantPool && !is_pool(x, y, state)) {
            wantPool = false;
            continue;
        }
        break;
    }
    data.cnt = count;
    return count;
}

export function mfndpos(monster, data, initialFlags, env = {}) {
    if (!data || typeof data !== 'object')
        throw new TypeError('mfndpos requires an output data object');
    const state = env.state ?? game;
    // Trap resistance can throw after earlier candidates have already written
    // monster.mux/muy and data, so an adjacent resistance trap means the call
    // needs a rollback point. Both callers reach it: m_move() supplies a
    // resistsTrapEffect that raises the unported-path error, and the pet path
    // supplies none, so the operation's presence says nothing about whether it
    // throws. Snapshot on the trap alone, which leaves every other
    // neighborhood on the allocation-free path. No other throw from the core
    // is rolled back.
    const usesDefaultHarmlessTrap = env.mHarmlessTrap == null
        || env.mHarmlessTrap === m_harmless_trap;
    const snapshot = usesDefaultHarmlessTrap
        && hasAdjacentResistanceTrap(monster, state)
        ? snapshotMfndposMutation(monster, data)
        : null;
    try {
        return mfndposCore(monster, data, initialFlags, env);
    } catch (error) {
        if (snapshot) restoreMfndposMutation(monster, data, snapshot);
        throw error;
    }
}

function isArmorCategory(obj, category, state) {
    return obj.oclass === ARMOR_CLASS
        && objectType(obj, state).oc_armcat === category;
}

// C ref: monmove.c stuff_prevents_passage(). Keep the source's `otyp ==
// COIN_CLASS` test: in this source tree, that names the generic coin slot.
function stuffPreventsPassage(monster, state) {
    const chain = monster === state.youmonst
        ? state.invent
        : monster.minvent;
    for (let obj = chain; obj; obj = obj.nobj) {
        const typ = obj.otyp;

        if (typ === COIN_CLASS && obj.quan > 100) return true;
        if (obj.oclass !== GEM_CLASS
            && !(typ >= ARROW && typ <= BOOMERANG)
            && !(typ >= DAGGER && typ <= CRYSKNIFE)
            && typ !== SLING
            && !isArmorCategory(obj, ARM_CLOAK, state)
            && typ !== FEDORA
            && !isArmorCategory(obj, ARM_GLOVES, state)
            && typ !== LEATHER_JACKET
            && typ !== CREDIT_CARD
            && !isArmorCategory(obj, ARM_SHIRT, state)
            && !(typ === CORPSE
                && verysmall(state.mons?.[obj.corpsenm]))
            && typ !== FORTUNE_COOKIE
            && typ !== CANDY_BAR
            && typ !== PANCAKE
            && typ !== LEMBAS_WAFER
            && typ !== LUMP_OF_ROYAL_JELLY
            && obj.oclass !== AMULET_CLASS
            && obj.oclass !== RING_CLASS
            && obj.oclass !== VENOM_CLASS
            && typ !== SACK
            && typ !== BAG_OF_HOLDING
            && typ !== BAG_OF_TRICKS
            && !isCandle(obj)
            && typ !== OILSKIN_SACK
            && typ !== LEASH
            && typ !== STETHOSCOPE
            && typ !== BLINDFOLD
            && typ !== TOWEL
            && typ !== TIN_WHISTLE
            && typ !== MAGIC_WHISTLE
            && typ !== MAGIC_MARKER
            && typ !== TIN_OPENER
            && typ !== SKELETON_KEY
            && typ !== LOCK_PICK) {
            return true;
        }
        if (isContainer(obj) && obj.cobj) return true;
    }
    return false;
}

// C ref: monmove.c can_ooze().
export function can_ooze(monster, state = game) {
    return amorphous(monster.data)
        && !stuffPreventsPassage(monster, state);
}

export { is_vampshifter };

// C ref: monmove.c can_fog().
export function can_fog(monster, state = game) {
    return !(state.mvitals?.[PM_FOG_CLOUD]?.mvflags & G_GENOD)
        && is_vampshifter(monster)
        && !propertyActive(state, PROT_FROM_SHAPE_CHANGERS)
        && !stuffPreventsPassage(monster, state);
}

function isSpecies(monster, pmidx, state) {
    return monster.data === state.mons?.[pmidx]
        || monster.data?.pmidx === pmidx;
}

function isLawfulMinion(monster) {
    return is_minion(monster.data)
        && mon_aligntyp(monster) === A_LAWFUL;
}

function inHell(state) {
    const dnum = state.u?.uz?.dnum;
    return Boolean(state.dungeons?.[dnum]?.flags?.hellish);
}

function inEndgame(state) {
    return state.u?.uz?.dnum != null
        && state.u.uz.dnum === state.astral_level?.dnum;
}

function visibleObjectAt(x, y, state) {
    return state.level?.objects?.[x]?.[y] ?? null;
}

// C ref: monmove.c onscary().
export function onscary(x, y, monster, state = game) {
    const auditoryScare = x === 0 && y === 0;
    const magicalScare = !auditoryScare;

    if (monster.iswiz || isLawfulMinion(monster)
        || isSpecies(monster, PM_ANGEL, state)
        || is_rider(monster.data)) {
        return false;
    }

    if (magicalScare
        && (monster.data?.mlet === S_HUMAN
            || Boolean(monster.data?.geno & G_UNIQ))) {
        return false;
    }

    if ((monster.isshk && inhishop(monster, state))
        || (monster.ispriest && inhistemple(monster, state))) {
        return false;
    }

    if (auditoryScare) return true;

    const location = state.level?.at(x, y);
    if (IS_ALTAR(location?.typ)
        && (monster.data?.mlet === S_VAMPIRE
            || is_vampshifter(monster))) {
        return true;
    }

    if (sobj_at(SCR_SCARE_MONSTER, x, y, state)) return true;

    const engraving = sengr_at('Elbereth', x, y, true, state);
    const imageAtSquare = propertyActive(state, DISPLACED)
        && monster.mux === x && monster.muy === y;
    return Boolean(engraving
        && ((state.u?.ux === x && state.u?.uy === y)
            || imageAtSquare
            || (engraving.guardobjects && visibleObjectAt(x, y, state)))
        && !(monster.isshk || monster.isgd || !monster.mcansee
            || monster.mpeaceful
            || isSpecies(monster, PM_MINOTAUR, state)
            || inHell(state) || inEndgame(state)));
}

// C ref: mon.c monnear(). Grid bugs alone cannot use diagonal adjacency.
export function monnear(monster, x, y, state = game) {
    const distance = dist2(monster.mx, monster.my, x, y);
    if (distance === 2 && isSpecies(monster, PM_GRID_BUG, state))
        return false;
    return distance < 3;
}

function artifactLight(obj) {
    return Boolean(obj
        && ((((obj.otyp === GOLD_DRAGON_SCALE_MAIL
                    || obj.otyp === GOLD_DRAGON_SCALES)
                && (obj.owornmask & W_ARM))
            || obj.oartifact === ART_SUNSWORD)));
}

function fleesLight(monster, normalized) {
    const { couldSee, state } = normalized;
    return isSpecies(monster, PM_GREMLIN, state)
        && ((state.uwep?.lamplit && artifactLight(state.uwep))
            || (state.uarm?.lamplit && artifactLight(state.uarm)))
        && monster.mcansee
        && couldSee(monster.mx, monster.my);
}

function heroUnaware(state) {
    if (Math.trunc(state.multi ?? 0) >= 0) return false;
    const noMoveMessage = state.nomovemsg ?? state.gn?.nomovemsg ?? '';
    const unconscious = Boolean(state.u?.usleep
        || noMoveMessage.startsWith('You awake')
        || noMoveMessage.startsWith('You regain con')
        || noMoveMessage.startsWith('You are consci'));
    return unconscious || state.u?.uhs === FAINTED;
}

function heroDeaf(state) {
    return propertyActive(state, DEAF)
        || Boolean(state.u?.uroleplay?.deaf);
}

function fleeingLightSource(state) {
    if (artifactLight(state.uwep)) return state.uwep;
    if (artifactLight(state.uarm)) return state.uarm;
    return null;
}

function requireFleeOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`monflee requires a ${name} operation`);
    return operation;
}

// C ref: monmove.c monflee(). fleeMessage owns the exact naming and terminal
// calls for the five source kinds below. releaseHero owns release_hero(), and
// createGasCloud owns create_gas_cloud(). Required downstream operations are
// checked before release or flee-state mutation.
export async function monflee(
    monster,
    fleeTime,
    first,
    showMessage,
    env = {},
) {
    if (monster.mhp < 1) return;

    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    const couldSee = env.couldSee ?? ((x, y) => couldsee(x, y, state));
    const checksFleeingLight = env.fleesLight ?? fleesLight;
    // C's `first` means "only establish fear if not already fleeing"; false
    // permits an existing flee state to be refreshed or extended.
    const mayEnterOrRefreshFleeState = !first || !monster.mflee;
    const checksMessage = mayEnterOrRefreshFleeState
        && !monster.mflee && showMessage;
    const createsGas = mayEnterOrRefreshFleeState
        && isSpecies(monster, PM_VROCK, state) && !monster.mspec_used;

    if (!Array.isArray(monster.mtrack))
        throw new TypeError('monflee requires monster tracking state');
    const releaseHero = monster === state.u?.ustuck
        ? requireFleeOperation(env, 'releaseHero')
        : null;
    const canSeeMonster = checksMessage
        ? requireFleeOperation(env, 'canSeeMonster')
        : null;
    const fleeMessage = checksMessage
        ? requireFleeOperation(env, 'fleeMessage')
        : null;
    const createGasCloud = createsGas
        ? requireFleeOperation(env, 'createGasCloud')
        : null;
    if (checksMessage) {
        if (typeof checksFleeingLight !== 'function'
            || typeof couldSee !== 'function') {
            throw new TypeError('monflee light predicates must be functions');
        }
        if (typeof random.rn2 !== 'function')
            throw new TypeError('monflee random injection requires rn2');
    } else if (createsGas && typeof random.rn2 !== 'function') {
        throw new TypeError('monflee random injection requires rn2');
    }
    const normalized = {
        ...env,
        state,
        random,
        couldSee,
    };

    if (releaseHero) await releaseHero(monster, normalized);

    if (mayEnterOrRefreshFleeState) {
        if (!fleeTime) {
            monster.mfleetim = 0;
        } else if (!monster.mflee || monster.mfleetim) {
            fleeTime += Math.trunc(monster.mfleetim ?? 0);
            if (fleeTime === 1) ++fleeTime;
            monster.mfleetim = Math.min(fleeTime, 127);
        }

        if (!monster.mflee && showMessage
            && canSeeMonster(monster, normalized)
            && (monster.m_ap_type & M_AP_TYPMASK) !== M_AP_FURNITURE
            && (monster.m_ap_type & M_AP_TYPMASK) !== M_AP_OBJECT) {
            let message;
            if (!monster.mcanmove || !monster.data?.mmove) {
                message = { kind: 'immobile-flinch' };
            } else if (checksFleeingLight(monster, normalized)) {
                if (heroUnaware(state)) {
                    message = { kind: 'frightened' };
                } else if (random.rn2(10) || heroDeaf(state)) {
                    message = {
                        kind: 'painful-light',
                        lightSource: fleeingLightSource(state),
                    };
                } else {
                    message = { kind: 'bright-light' };
                }
            } else {
                message = { kind: 'turns-to-flee' };
            }
            await fleeMessage(monster, message, normalized);
        }

        if (createsGas) {
            monster.mspec_used = 75 + random.rn2(25);
            await createGasCloud(
                monster.mx,
                monster.my,
                5,
                8,
                normalized,
            );
        }
        monster.mflee = true;
    }
    mon_track_clear(monster);
}

// C ref: monmove.c disturb(). wakeMessage owns wake_msg(), including its
// visibility-dependent message. It is preflighted before the first possible
// random draw so an unavailable output owner cannot advance the PRNG stream.
export async function disturb(monster, env = {}) {
    const normalized = movementEnv(env);
    const { couldSee, random, state } = normalized;

    if (!couldSee(monster.mx, monster.my)
        || dist2(monster.mx, monster.my, state.u.ux, state.u.uy) > 100) {
        return 0;
    }
    const stealthyHero = propertyActive(state, STEALTH, true);
    if (stealthyHero && !isSpecies(monster, PM_ETTIN, state)) return 0;
    if (typeof env.wakeMessage !== 'function')
        throw new TypeError('disturb requires a wakeMessage operation');

    if (stealthyHero && !random.rn2(10)) return 0;
    const hardToWake = monster.data?.mlet === S_NYMPH
        || isSpecies(monster, PM_JABBERWOCK, state)
        || monster.data?.mlet === S_LEPRECHAUN;
    if (hardToWake && random.rn2(50)) return 0;

    const readilyAwakened = propertyActive(state, AGGRAVATE_MONSTER)
        || monster.data?.mlet === S_DOG
        || monster.data?.mlet === S_HUMAN;
    if (!readilyAwakened) {
        if (random.rn2(7)
            || (monster.m_ap_type & M_AP_TYPMASK) === M_AP_FURNITURE
            || (monster.m_ap_type & M_AP_TYPMASK) === M_AP_OBJECT) {
            return 0;
        }
    }

    await env.wakeMessage(monster, !monster.mpeaceful, normalized);
    monster.msleeping = false;
    return 1;
}

// C ref: monmove.c distfleeck(). monflee() owns messages, release behavior,
// Vrock gas, and track clearing, so callers supply that complete operation.
export async function distfleeck(monster, env = {}) {
    const normalized = movementEnv(env);
    const { random, state } = normalized;
    const onScary = env.onScary ?? onscary;
    const checksFleeingLight = env.fleesLight ?? fleesLight;
    const inSanctuary = env.inYourSanctuary ?? in_your_sanctuary;
    if (typeof random.rnd !== 'function')
        throw new TypeError('distfleeck random injection requires rnd');
    if (typeof onScary !== 'function'
        || typeof checksFleeingLight !== 'function'
        || typeof inSanctuary !== 'function') {
        throw new TypeError('distfleeck predicate injections must be functions');
    }
    if (typeof env.monFlee !== 'function')
        throw new TypeError('distfleeck requires a monFlee operation');

    const braveGremlin = random.rn2(5) === 0;
    const inrange = dist2(
        monster.mx,
        monster.my,
        monster.mux,
        monster.muy,
    ) <= BOLT_LIM * BOLT_LIM;
    const nearby = inrange
        && monnear(monster, monster.mux, monster.muy, state);

    const seesWrongSquare = !monster.mcansee
        || (propertyActive(state, INVIS, true) && !perceives(monster.data));
    const scaryX = seesWrongSquare ? monster.mux : state.u.ux;
    const scaryY = seesWrongSquare ? monster.muy : state.u.uy;
    const sawScary = onScary(
        scaryX,
        scaryY,
        monster,
        state,
    );
    const scared = nearby
        && (sawScary
            || (checksFleeingLight(monster, normalized)
                && !braveGremlin)
            || (!monster.mpeaceful
                && inSanctuary(
                    monster,
                    0,
                    0,
                    state,
                )));

    if (scared) {
        const fleeTime = random.rnd(random.rn2(7) ? 10 : 100);
        await env.monFlee(monster, fleeTime, true, true, normalized);
    }
    return { inrange, nearby, scared: Boolean(scared) };
}

// C ref: monmove.c set_apparxy(). Decide where a monster thinks the hero is.
export function set_apparxy(monster, env = {}) {
    const normalized = movementEnv(env);
    const { couldSee, random, state } = normalized;
    const { u } = state;
    let mx = monster.mux;
    let my = monster.muy;
    const heroMoney = money_cnt(state.invent ?? null);

    // Pets know the hero's smell. A grabber or a monster whose remembered
    // square still contains the hero also keeps exact knowledge.
    if (monster.mtame || monster === u.ustuck
        || (mx === u.ux && my === u.uy)) {
        monster.mux = u.ux;
        monster.muy = u.uy;
        return;
    }

    const notseen = !monster.mcansee
        || (propertyActive(state, INVIS, true) && !perceives(monster.data));
    const notthere = propertyActive(state, DISPLACED)
        && !isSpecies(monster, PM_DISPLACER_BEAST, state);
    let displacement;
    if (u.uinwater) {
        displacement = 1;
    } else if (notseen) {
        // Xorns can smell the valuable metal in the hero's gold.
        displacement = isSpecies(monster, PM_XORN, state) && heroMoney
            ? 0
            : 1;
    } else if (notthere) {
        displacement = couldSee(mx, my) ? 2 : 1;
    } else {
        displacement = 0;
    }

    if (!displacement) {
        monster.mux = u.ux;
        monster.muy = u.uy;
        return;
    }

    const foundHero = notseen
        ? !random.rn2(3)
        : notthere
            ? !random.rn2(4)
            : false;

    if (foundHero) {
        mx = u.ux;
        my = u.uy;
    } else {
        let tryCount = 0;
        do {
            if (++tryCount > 200) {
                mx = u.ux;
                my = u.uy;
                break;
            }
            mx = u.ux - displacement
                + random.rn2(2 * displacement + 1);
            my = u.uy - displacement
                + random.rn2(2 * displacement + 1);
        } while (!isok(mx, my)
            || (displacement !== 2
                && mx === monster.mx && my === monster.my)
            || ((mx !== u.ux || my !== u.uy)
                && !passes_walls(monster.data)
                && !(accessible(mx, my, state)
                    || (closed_door(mx, my, state)
                        && (can_ooze(monster, state)
                            || can_fog(monster, state)))))
            || !couldSee(mx, my));
    }

    monster.mux = mx;
    monster.muy = my;
}

// ---- monmove.c dochug(), ordinary-monster path, and its pre-move
// ---- AT_WEAP weapon gate ----
function activeProperty(state, property, blockedMatters = true) {
    const value = state.u?.uprops?.[property];
    return Boolean(value?.intrinsic || value?.extrinsic)
        && (!blockedMatters || !value?.blocked);
}

function requireDochugOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`dochug requires a ${name} operation`);
    return operation;
}

// C ref: monmove.c dochug(), pre-move AT_WEAP gate. Weapon selection and
// wield state remain owned by weapon.js through the injected operation.
export async function wield_pre_move_weapon(monster, range, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if ((monster.mpeaceful && !activeProperty(state, CONFLICT, false))
        || !range.inrange
        || dist2(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) > 8
        || !attacktype(monster.data, AT_WEAP)) {
        return false;
    }

    const current = monster.mw;
    const currentIsPick = current
        && (current.oclass === WEAPON_CLASS
            || current.oclass === TOOL_CLASS)
        && objectType(current, state).oc_skill === P_PICK_AXE;
    if ((range.scared && currentIsPick)
        || monster.weapon_check !== NEED_WEAPON) {
        return false;
    }
    if (monster.mtrapped && !range.nearby) {
        const selectRangedWeapon = requireDochugOperation(
            rawEnv,
            'selectRangedWeapon',
        );
        if (await selectRangedWeapon(monster, rawEnv)) return false;
    }

    monster.weapon_check = NEED_HTH_WEAPON;
    const wieldMonsterItem = requireDochugOperation(rawEnv, 'wieldMonsterItem');
    return Boolean(await wieldMonsterItem(monster, rawEnv));
}

// C ref: monmove.c dochug().  One function for tame and non-tame monsters,
// as in C.  Steps C runs that this does not are listed with the source
// condition that keeps them unreachable behind the current action boundary:
//   quest_stat_check(), quest_talk()      no quest monster is reachable
//   mconf/mstun recovery draws            assertSimpleActionState() rejects
//                                         mconf and mstun
//   m_respond(), is_covetous() tactics    the boundary rejects both
//   release_hero(), u.ustuck              no hero-grabbing monster is reachable
//   Demonic Blackmail, watch_on_duty(),   the boundary rejects shopkeepers,
//   mind_blast()                          guards, priests, and AT_MAGC
//   killer bee jelly, gelcube_digests()   the boundary rejects both species
//   castmu() undirected spell             the boundary rejects AT_MAGC
//   mon_offmap(), wormhitu(), cuss()      unreachable on a fresh D:1 level
// A timed fleeing state is reachable for a starting pet after do_attack()'s
// safe_pet refusal. Other fleeing monsters remain behind the action boundary.
export async function dochug(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const preflight = requireDochugOperation(rawEnv, 'preflight');
    const usePreMoveItems = requireDochugOperation(rawEnv, 'usePreMoveItems');
    const moveMonster = requireDochugOperation(rawEnv, 'moveMonster');
    const attackHero = requireDochugOperation(rawEnv, 'attackHero');
    const wakeMessage = requireDochugOperation(rawEnv, 'wakeMessage');
    const monFlee = requireDochugOperation(rawEnv, 'monFlee');
    const monsterCanSeeHero = requireDochugOperation(
        rawEnv,
        'monsterCanSeeHero',
    );
    const distanceAndFear = rawEnv.distanceAndFear ?? distfleeck;
    const disturbMonster = rawEnv.disturbMonster ?? disturb;
    const setApparentHero = rawEnv.setApparentHero ?? set_apparxy;
    const wipeEngraving = rawEnv.wipeEngraving ?? wipe_engr_at;
    const wieldPreMoveWeapon = rawEnv.wieldPreMoveWeapon
        ?? wield_pre_move_weapon;
    const redraw = rawEnv.redraw ?? newsym;
    const env = { ...rawEnv, state, random };
    const hallucinating = () => activeProperty(state, HALLUC)
        && !activeProperty(state, HALLUC_RES);

    // PHASE ONE: pre-movement adjustments.
    preflight(monster, state);
    monster.mstrategy &= ~STRAT_ARRIVE;
    if ((monster.mstrategy & STRAT_WAITFORU)
        && (monsterCanSeeHero(monster, state)
            || monster.mhp < monster.mhpmax)) {
        monster.mstrategy &= ~STRAT_WAITFORU;
    }
    if (!monster.mcanmove || (monster.mstrategy & STRAT_WAITMASK)) {
        if (hallucinating()) redraw(monster.mx, monster.my);
        return 0;
    }
    if (monster.msleeping
        && !await disturbMonster(monster, { ...env, wakeMessage })) {
        if (hallucinating()) redraw(monster.mx, monster.my);
        return 0;
    }

    wipeEngraving(monster.mx, monster.my, 1, false, env);
    if (monster.mflee) {
        // C evaluates !rn2(40) before can_teleport(), so starting dogs, cats,
        // and ponies consume this draw even though they cannot teleport.
        random.rn2(40);
        // m_respond() is inert for all three starting-pet species.
        if (!monster.mfleetim
            && monster.mhp === monster.mhpmax
            && !random.rn2(25)) {
            monster.mflee = false;
        }
    }

    // PHASE TWO: special movements and actions.
    setApparentHero(monster, env);
    let range = await distanceAndFear(monster, { ...env, monFlee });
    if (await usePreMoveItems(monster, env)) return 1;
    if (await wieldPreMoveWeapon(monster, range, env)) return 0;

    // PHASE THREE: movement.  C's disjunction also carries a leprechaun gold
    // term and (Conflict && !iswiz) between is_wanderer and !mcansee; both are
    // unported, so a reachable Conflict or leprechaun would shift the
    // !mcansee draw.  Neither is reachable behind the current boundary.
    const mayMove = !range.nearby
        || monster.mflee
        || range.scared
        || monster.mconf
        || monster.mstun
        || (monster.minvis && !random.rn2(3))
        || (is_wanderer(monster.data) && !random.rn2(4))
        || (!monster.mcansee && !random.rn2(4))
        || monster.mpeaceful;
    let status = MMOVE_NOTHING;
    let panicattk = false;
    if (mayMove) {
        status = await moveMonster(monster, env);
        if (status !== MMOVE_DIED) {
            range = await distanceAndFear(monster, { ...env, monFlee });
        }
        if (status === MMOVE_DIED) return 1;
        if (status === MMOVE_MOVED) {
            // C also releases a confused grabber, disturbs buried zombies,
            // and returns early for a helpless or engulfing monster; none is
            // reachable here.
            if (!range.nearby
                && range.inrange
                && !range.scared
                && !monster.mpeaceful
                && attacktype(monster.data, AT_WEAP)) {
                const postMoveRangedAttack = requireDochugOperation(
                    rawEnv,
                    'postMoveRangedAttack',
                );
                await postMoveRangedAttack(monster, env);
            }
            return 0;
        }
        // MMOVE_NOTHING, MMOVE_DONE, and MMOVE_NOMOVES all reach here.  C
        // redraws a hallucinated monster that did not move.  MMOVE_NOMOVES
        // additionally sets panicattk when the monster is scared: a cornered
        // monster attacks even though fear would otherwise stop it.
        if (status === MMOVE_NOMOVES && range.scared) panicattk = true;
        if (hallucinating()) redraw(monster.mx, monster.my);
    }

    // PHASE FOUR: standard attacks.  A peaceful monster, including every pet,
    // fails this gate in C too.  C's `Conflict && !resist_conflict()` disjunct
    // is unreachable here: assertSimpleScanState() refuses an active CONFLICT
    // before the scan starts.  So is C's `u.uhp > 0` term, since a dead hero
    // ends the turn before monsters move.  The gate admits a monster anywhere
    // inside BOLT_LIM, not only an adjacent one, because mhitu.c mattacku()
    // runs its range2 arms -- AT_WEAP's thrwmu(), AT_BREA, AT_SPIT and
    // AT_GAZE -- for a monster that only thinks it is near.
    if (status !== MMOVE_DONE
        && !monster.mpeaceful
        && ((range.inrange && !range.scared) || panicattk)
        && !noattacks(monster.data)) {
        await attackHero(monster, env);
    }
    return 0;
}

// ---- monmove.c mon_would_take_item(), mon_would_consume_item(), and
// ---- m_search_items() ----
const PRACTICAL = new Set([
    O.WEAPON_CLASS,
    O.ARMOR_CLASS,
    O.GEM_CLASS,
    O.FOOD_CLASS,
]);
const MAGICAL = new Set([
    O.AMULET_CLASS,
    O.POTION_CLASS,
    O.SCROLL_CLASS,
    O.WAND_CLASS,
    O.RING_CLASS,
    O.SPBOOK_CLASS,
]);
const CORPSE_EATERS = new Set([
    M.PM_PURPLE_WORM,
    M.PM_BABY_PURPLE_WORM,
    M.PM_GHOUL,
    M.PM_PIRANHA,
]);

function isMercenary(species) {
    return Boolean((species?.mflags2 ?? 0) & M.M2_MERC);
}

function prizeObject(obj, state) {
    const tracking = state.context?.achieveo;
    return Boolean(tracking
        && ((tracking.mines_prize_oid
            && obj.o_id === tracking.mines_prize_oid)
            || (tracking.soko_prize_oid
                && obj.o_id === tracking.soko_prize_oid)));
}

function inHisShop(shopkeeper, state) {
    const eshk = shopkeeper?.mextra?.eshk;
    return Boolean(eshk
        && on_level(eshk.shoplevel, state.u?.uz)
        && in_rooms(
            shopkeeper.mx,
            shopkeeper.my,
            SHOPBASE,
            state,
        ).includes(eshk.shoproom));
}

function costlySpot(x, y, state) {
    if (!state.level?.flags?.has_shop) return false;
    const room = in_rooms(x, y, SHOPBASE, state)[0];
    const shopkeeper = room >= ROOMOFFSET
        ? state.level.rooms?.[room - ROOMOFFSET]?.resident
        : null;
    const location = state.level.at(x, y);
    const eshk = shopkeeper?.mextra?.eshk;
    return Boolean(shopkeeper && inHisShop(shopkeeper, state)
        && location?.roomno === room && !location.edge
        && state.level.rooms?.[room - ROOMOFFSET]?.rtype >= SHOPBASE
        && (x !== eshk.shk.x || y !== eshk.shk.y));
}

function artifactTouchable(obj, monster, env) {
    if (!obj.oartifact) return true;
    if (typeof env.touchArtifact !== 'function') {
        throw new TypeError(
            'postmov object selection requires a touchArtifact operation',
        );
    }
    return Boolean(env.touchArtifact(obj, monster, env));
}

export function mon_would_take_item(monster, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const species = monster.data;
    const type = objectType(obj, state);
    const percentLoad = Math.trunc(
        curr_mon_load(monster) * 100 / max_mon_load(monster),
    );

    if (obj === state.uball || obj === state.uchain) return false;
    if (monster.mtame && obj.cursed) return false;
    if (is_unicorn(species) && type.oc_material !== O.GEMSTONE) return false;
    if (!mindless(species) && !is_animal(species) && percentLoad < 75
        && searches_for_item(monster, obj, state)) {
        return true;
    }
    if (likes_gold(species) && obj.otyp === O.GOLD_PIECE
        && percentLoad < 95) return true;
    if (likes_gems(species) && obj.oclass === O.GEM_CLASS
        && type.oc_material !== O.MINERAL && percentLoad < 85) return true;
    if (likes_objs(species) && PRACTICAL.has(obj.oclass)
        && percentLoad < 75) return true;
    if (likes_magic(species) && MAGICAL.has(obj.oclass)
        && percentLoad < 85) return true;
    if (throws_rocks(species) && obj.otyp === O.BOULDER
        && percentLoad < 50 && !state.level?.flags?.sokoban_rules) return true;
    if (species?.pmidx === M.PM_GELATINOUS_CUBE
        && obj.oclass !== O.ROCK_CLASS && obj.oclass !== O.BALL_CLASS
        && !(obj.otyp === O.CORPSE
            && touch_petrifies(state.mons?.[obj.corpsenm]))) return true;
    return false;
}

export function mon_would_consume_item(monster, obj, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    if (obj.otyp === O.CORPSE
        && !touch_petrifies(state.mons?.[obj.corpsenm])
        && CORPSE_EATERS.has(monster.data?.pmidx)) return true;

    const edog = monster.mextra?.edog;
    if (monster.mtame && edog) {
        const foodType = dogfood(monster, obj, { ...rawEnv, state });
        return foodType < MANFOOD
            && (foodType < ACCFOOD || edog.hungrytime <= state.moves);
    }
    return false;
}

// C refs: monmove.c postmov(); mon.c meatmetal(), meatcorpse(), and
// mpickstuff(). Clone-only planning runs this read-only selector before any
// live action; the live postmov() adapter repeats its selection and PRNG calls
// after movement output, track updates, and redraws.
export function select_postmove_object_action(
    monster,
    x,
    y,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const env = { ...rawEnv, state, random };
    const objects = state.level?.objects?.[x]?.[y] ?? null;
    if (!objects || !monster.mcanmove) return null;

    // Tests and bounded preflight callers may ask about another square. Give
    // source predicates those coordinates without mutating the real monster.
    const subject = monster.mx === x && monster.my === y
        ? monster
        : { ...monster, mx: x, my: y };
    const species = subject.data;

    if (!subject.mtame && metallivorous(species)) {
        const rustMonster = species?.pmidx === M.PM_RUST_MONSTER;
        for (let obj = objects; obj; obj = obj.nexthere) {
            const material = objectType(obj, state).oc_material;
            if ((rustMonster && material !== O.IRON)
                || obj.otyp === O.AMULET_OF_STRANGULATION
                || obj.otyp === O.RIN_SLOW_DIGESTION
                || (obj.opoisoned
                    && !monster_resists_element(
                        subject,
                        POISON_RES,
                        state,
                    ))) {
                continue;
            }
            if (material >= O.IRON && material <= O.MITHRIL
                && !obj_resists(obj, 5, 95, env)
                && artifactTouchable(obj, subject, env)) {
                return {
                    kind: rustMonster && obj.oerodeproof
                        ? 'reject rustproof metal'
                        : 'eat metal',
                    object: obj,
                };
            }
        }
    }

    if (!subject.mtame && CORPSE_EATERS.has(species?.pmidx)) {
        for (let obj = objects; obj; obj = obj.nexthere) {
            if (obj.otyp !== O.CORPSE) continue;
            const corpseSpecies = state.mons?.[obj.corpsenm];
            if (!corpseSpecies || vegan(corpseSpecies)
                || (flesh_petrifies(corpseSpecies)
                    && !monster_resists_element(
                        subject,
                        STONE_RES,
                        state,
                    ))) {
                continue;
            }
            return {
                kind: is_rider(corpseSpecies)
                    ? 'revive rider corpse'
                    : 'eat corpse',
                object: obj,
            };
        }
    }

    if (subject.isshk && inHisShop(subject, state)) return null;
    if (!subject.mtame && in_rooms(x, y, SHOPBASE, state).length
        && random.rn2(25)) {
        return null;
    }
    const canReach = rawEnv.couldReachItem ?? could_reach_item;
    if (!canReach(subject, x, y, state)) return null;

    for (let obj = objects; obj; obj = obj.nexthere) {
        if (prizeObject(obj, state)
            || !mon_would_take_item(subject, obj, env)) {
            continue;
        }
        if (obj.otyp === O.CORPSE && species?.mlet !== M.S_NYMPH) {
            const corpseSpecies = state.mons?.[obj.corpsenm];
            if (corpseSpecies && !touch_petrifies(corpseSpecies)
                && obj.corpsenm !== M.PM_LIZARD
                && !acidic(corpseSpecies)) {
                continue;
            }
        }
        if (!can_touch_safely(subject, obj, env)) continue;
        // C's carryamt. mpickstuff() compares it with obj->quan to decide
        // whether to split, so the caller that performs the pickup needs the
        // value this loop already computed rather than a second call.
        const carryamt = can_carry(subject, obj, env);
        if (carryamt === 0) continue;
        return { kind: 'pick up', object: obj, carryamt };
    }
    return null;
}

export function m_search_items(
    monster,
    initialGoalX,
    initialGoalY,
    initialApproach,
    rawEnv = {},
) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const env = { ...rawEnv, state, random };
    const canReach = rawEnv.couldReachItem ?? could_reach_item;
    const canSee = rawEnv.canSee ?? cansee;
    const mCanSee = rawEnv.monsterCanSee ?? clear_path;
    const isCostly = rawEnv.costlySpot ?? costlySpot;
    let goalX = initialGoalX;
    let goalY = initialGoalY;
    let approach = initialApproach;
    let selectedObject = null;
    let minRadius = SQSRCHRADIUS;
    const originX = monster.mx;
    const originY = monster.my;

    if (distmin(monster.mux, monster.muy, originX, originY)
        < SQSRCHRADIUS && !monster.mpeaceful) minRadius--;
    if (!monster.mpeaceful && isMercenary(monster.data)) minRadius = 1;
    if (in_rooms(originX, originY, SHOPBASE, state).length
        && (random.rn2(25) || monster.isshk)) {
        return finishSearch();
    }

    const highX = Math.min(COLNO - 1, originX + minRadius);
    const highY = Math.min(ROWNO - 1, originY + minRadius);
    const lowX = Math.max(1, originX - minRadius);
    const lowY = Math.max(0, originY - minRadius);
    for (let x = lowX; x <= highX; ++x) {
        for (let y = lowY; y <= highY; ++y) {
            if (!state.level.objects[x]?.[y]
                || minRadius < distmin(originX, originY, x, y)
                || !canReach(monster, x, y, state)
                || (hides_under(monster.data) && canSee(x, y, state))) continue;

            const occupant = m_at(x, y, state);
            if (occupant && (occupant.msleeping || !occupant.mcanmove
                || occupant.mundetected
                || (occupant.mappearance && !occupant.iswiz)
                || !occupant.data?.mmove)) continue;
            if (onscary(x, y, monster, state)) continue;

            const trap = t_at(x, y, state);
            if (trap && mon_knows_traps(monster, trap.ttyp)) {
                if (goalX === x && goalY === y) {
                    goalX = monster.mux;
                    goalY = monster.muy;
                }
                continue;
            }
            if (!mCanSee(originX, originY, x, y)) continue;

            const costly = isCostly(x, y, state);
            for (let obj = state.level.objects[x][y];
                obj;
                obj = obj.nexthere) {
                if (obj.otyp === O.ROCK || prizeObject(obj, state)
                    || (costly && !obj.no_charge)) continue;
                const wanted = mon_would_take_item(monster, obj, env)
                    && can_carry(monster, obj, env) > 0;
                if ((wanted
                    || mon_would_consume_item(monster, obj, env))
                    && can_touch_safely(monster, obj, env)) {
                    minRadius = distmin(originX, originY, x, y);
                    selectedObject = obj;
                    goalX = obj.ox;
                    goalY = obj.oy;
                    if (goalX === originX && goalY === originY) {
                        return {
                            approach,
                            complete: true,
                            goalX,
                            goalY,
                            object: selectedObject,
                        };
                    }
                    break;
                }
            }
        }
    }
    return finishSearch();

    function finishSearch() {
        if (minRadius < SQSRCHRADIUS && approach === -1) {
            if (distmin(
                originX,
                originY,
                monster.mux,
                monster.muy,
            ) <= 3) {
                goalX = monster.mux;
                goalY = monster.muy;
            } else {
                approach = 1;
            }
        }
        return {
            approach,
            complete: false,
            goalX,
            goalY,
            object: selectedObject,
        };
    }
}

// ---- monmove.c m_move(), ordinary not_special path through postmov() ----
function requireMoveOperation(env, name) {
    const operation = env[name];
    if (typeof operation !== 'function')
        throw new TypeError(`m_move requires a ${name} operation`);
    return operation;
}

function lineTerrain(monster, state) {
    const goalX = monster.mux;
    const goalY = monster.muy;
    const deltaX = goalX - monster.mx;
    const deltaY = goalY - monster.my;
    if ((!deltaX && !deltaY)
        || !online2(goalX, goalY, monster.mx, monster.my)
        || distmin(deltaX, deltaY, 0, 0) >= BOLT_LIM) {
        return { blocked: false, clear: false, boulders: 0 };
    }

    const stepX = Math.sign(deltaX);
    const stepY = Math.sign(deltaY);
    let x = monster.mx;
    let y = monster.my;
    let boulders = 0;
    do {
        x += stepX;
        y += stepY;
        const location = state.level?.at(x, y);
        if (!location || IS_OBSTRUCTED(location.typ)
            || IS_WATERWALL(location.typ)
            || location.typ === LAVAWALL
            || closed_door(x, y, state)) {
            return { blocked: true, clear: false, boulders };
        }
        if (sobj_at(BOULDER, x, y, state)) boulders++;
    } while (x !== goalX || y !== goalY);
    return { blocked: false, clear: boulders === 0, boulders };
}

// C refs: mthrowu.c lined_up()/linedup(), as used only by m_move()'s item
// search admission. The current fresh-game boundary cannot polymorph the hero,
// so m_lined_up()'s Upolyd concealment draw is not reachable here.
export function monsterItemSearchInLine(monster, env = {}) {
    const state = env.state ?? game;
    const random = env.random ?? { rn2 };
    const terrain = lineTerrain(monster, state);
    if (!online2(monster.mx, monster.my, monster.mux, monster.muy)
        || distmin(
            monster.mx,
            monster.my,
            monster.mux,
            monster.muy,
        ) >= BOLT_LIM) {
        return false;
    }

    const goalIsHero = monster.mux === state.u.ux
        && monster.muy === state.u.uy;
    if ((goalIsHero && couldsee(monster.mx, monster.my, state))
        || (!goalIsHero && terrain.clear)) {
        return true;
    }
    if (terrain.blocked
        || (!terrain.clear && terrain.boulders === 0)) {
        return false;
    }

    const ignoresBoulders = throws_rocks(monster.data)
        || Boolean(m_carrying(monster, WAN_STRIKING, state));
    return ignoresBoulders
        || random.rn2(2 + terrain.boulders) < 2;
}

// C ref: monmove.c m_move().  Covers the prologue, the tame dog_move()
// dispatch, and the ordinary not_special path through postmov().  Not covered:
// the hides_under() early return, the wormno branch, the is_covetous() tactics
// branch, m_move_aggress(), displacement, and boulder breaking.  Those remain
// explicit seams until their source owners connect.
export async function m_move(monster, rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? { rn2 };
    const resolveTrappedMonster = requireMoveOperation(
        rawEnv,
        'resolveTrappedMonster',
    );
    const resistsTrapEffect = requireMoveOperation(
        rawEnv,
        'resistsTrapEffect',
    );
    const postMonsterMove = requireMoveOperation(rawEnv, 'postMonsterMove');
    const finishEating = requireMoveOperation(rawEnv, 'finishEating');
    const movePet = requireMoveOperation(rawEnv, 'movePet');
    const unsupported = requireMoveOperation(rawEnv, 'unsupported');
    const env = { ...rawEnv, state, random };
    const oldX = monster.mx;
    const oldY = monster.my;

    // C ref: m_move() prologue.  mintrap() runs first, then the meating
    // countdown, then hides_under (which the boundary rejects), then
    // set_apparxy(), then the tame dispatch.
    if (monster.mtrapped && await resolveTrappedMonster(monster, env))
        return MMOVE_NOTHING;
    if (monster.meating) {
        --monster.meating;
        if (monster.meating <= 0) finishEating(monster);
        return MMOVE_DONE;
    }
    set_apparxy(monster, env);
    if (monster.mtame) {
        // C: `return postmov(mtmp, ptr, omx, omy, dog_move(mtmp, after), ...)`.
        // dochug() is the only reachable caller and passes after == 0.
        const petStatus = await movePet(monster, false, env);
        return await postMonsterMove(monster, oldX, oldY, petStatus, env);
    }
    let goalX = monster.mux;
    let goalY = monster.muy;
    let approach = monster.mflee ? -1 : 1;

    if (monster.mconf) {
        approach = 0;
    } else {
        const sourceSquare = state.level.at(oldX, oldY);
        const goalSquare = state.level.at(goalX, goalY);
        const shouldSee = couldsee(oldX, oldY, state)
            && (goalSquare.lit || !sourceSquare.lit)
            && dist2(oldX, oldY, goalX, goalY) <= 36;
        if (!monster.mcansee
            || (shouldSee && activeProperty(state, INVIS)
                && !perceives(monster.data) && random.rn2(11))
            || state.u.uundetected
            || (monster.mpeaceful && !monster.isshk)
            || ((monster.data?.pmidx === PM_STALKER
                || monster.data?.mlet === S_BAT
                || monster.data?.mlet === S_LIGHT)
                && !random.rn2(3))) {
            approach = 0;
        }
        if (!shouldSee && haseyes(monster.data)) {
            const track = gettrack(oldX, oldY, state);
            if (track) {
                goalX = track.x;
                goalY = track.y;
            }
        }
    }

    let getItems = false;
    const passesPeacefulGate = !monster.mpeaceful || !random.rn2(10);
    if (passesPeacefulGate
        && !on_level(state.u?.uz, state.rogue_level)) {
        const linedUp = (
            rawEnv.itemSearchInLine ?? monsterItemSearchInLine
        )(monster, env);
        const throwRange = throws_rocks(state.youmonst?.data)
            ? 20
            : Math.trunc(effective_attribute(state, A_STR) / 2) + 1;
        const inLine = linedUp
            && distmin(oldX, oldY, monster.mux, monster.muy) <= throwRange;
        getItems = approach !== 1 || !inLine;
    }
    if (getItems) {
        const search = (rawEnv.searchItems ?? m_search_items)(
            monster,
            goalX,
            goalY,
            approach,
            env,
        );
        goalX = search.goalX;
        goalY = search.goalY;
        approach = search.approach;
        if (search.complete) {
            return postMonsterMove(
                monster,
                oldX,
                oldY,
                MMOVE_DONE,
                env,
            );
        }
    }

    const data = { cnt: 0, poss: [], info: [] };
    const count = mfndpos(
        monster,
        data,
        mon_allowflags(monster, env),
        { ...env, resistsTrapEffect },
    );
    if (!count && !is_unicorn(monster.data)) return MMOVE_NOMOVES;

    let nextX = oldX;
    let nextY = oldY;
    let chosen = -1;
    let choiceCount = 0;
    let moved = MMOVE_NOTHING;
    let nearestDistance = dist2(oldX, oldY, goalX, goalY);
    if (!monster.mpeaceful && state.level.flags?.shortsighted
        && nearestDistance > (couldsee(oldX, oldY, state) ? 144 : 36)
        && approach === 1) {
        approach = 0;
    }

    let avoidLine = false;
    if (is_unicorn(monster.data) && rawEnv.noTeleportLevel?.(monster)) {
        // C ref: monmove.c:1941-1943, `for (i = 0; i < cnt; i++)`. The bound
        // matters: resetMfndposData() zero-fills all nine info slots, and a
        // zero slot satisfies !(info & NOTONL), so scanning the tail past
        // count would set avoidLine on every call that reaches here.
        for (let index = 0; index < count; ++index) {
            if (!(data.info[index] & NOTONL)) avoidLine = true;
        }
    }
    const betterWithDisplacing = should_displace(
        monster,
        data,
        goalX,
        goalY,
        env,
    );
    const trackLimit = Math.min(MTSZ, count - 1);
    for (let index = 0; index < count; ++index) {
        if (avoidLine && (data.info[index] & NOTONL)) continue;
        const { x, y } = data.poss[index];
        if (rawEnv.avoidKicked?.(monster, x, y, env)) continue;
        if (m_at(x, y, state)
            && (data.info[index] & ALLOW_MDISP)
            && !(data.info[index] & ALLOW_M)
            && !betterWithDisplacing) {
            continue;
        }
        let rejectTrack = false;
        if (approach !== 0) {
            for (let trackIndex = 0;
                trackIndex < trackLimit;
                ++trackIndex) {
                if (x === monster.mtrack[trackIndex].x
                    && y === monster.mtrack[trackIndex].y
                    && random.rn2(4 * (count - trackIndex))) {
                    rejectTrack = true;
                    break;
                }
            }
        }
        if (rejectTrack) continue;

        const distance = dist2(x, y, goalX, goalY);
        const nearer = distance < nearestDistance;
        if ((approach === 1 && nearer)
            || (approach === -1 && !nearer)
            || (!approach && !random.rn2(++choiceCount))
            || moved === MMOVE_NOTHING) {
            nextX = x;
            nextY = y;
            nearestDistance = distance;
            chosen = index;
            moved = MMOVE_MOVED;
        }
    }
    if (moved === MMOVE_NOTHING) {
        return postMonsterMove(
            monster,
            oldX,
            oldY,
            moved,
            env,
        );
    }
    if (data.info[chosen] & ALLOW_U) {
        nextX = monster.mux;
        nextY = monster.muy;
    }
    if (nextX === state.u.ux && nextY === state.u.uy) {
        monster.mux = state.u.ux;
        monster.muy = state.u.uy;
        return MMOVE_NOTHING;
    }
    const attacksImage = nextX === monster.mux && nextY === monster.muy;
    if ((data.info[chosen] & ALLOW_M) || attacksImage) {
        if (!m_at(nextX, nextY, state)) return MMOVE_DONE;
        unsupported('ordinary monster aggression');
    }
    if (data.info[chosen] & ALLOW_MDISP)
        unsupported('ordinary monster displacement');
    const mayCrossRegion = rawEnv.mayCrossRegion ?? m_in_out_region;
    if (!await mayCrossRegion(monster, nextX, nextY, env))
        return MMOVE_DONE;
    if (data.info[chosen] & ALLOW_ROCK)
        unsupported('ordinary monster boulder breaking');

    remove_monster(oldX, oldY, state);
    place_monster(monster, nextX, nextY, state);
    const movementMessage = collectMonsterMovementMessage(
        monster,
        oldX,
        oldY,
        state,
    );
    if (movementMessage && !env.planning) {
        const message = rawEnv.message ?? ttyPline;
        await message(movementMessage, state, env);
    }
    mon_track_add(monster, oldX, oldY);
    return postMonsterMove(
        monster,
        oldX,
        oldY,
        MMOVE_MOVED,
        env,
    );
}
