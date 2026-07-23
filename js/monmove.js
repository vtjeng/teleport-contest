// Monster movement decisions and shared movement predicates.
// C ref: monmove.c set_apparxy(), can_ooze(), and can_fog().

import {
    ACCESSIBLE,
    AGGRAVATE_MONSTER,
    ALLOW_ALL,
    ALLOW_BARS,
    ALLOW_DIG,
    ALLOW_M,
    ALLOW_MDISP,
    ALLOW_ROCK,
    ALLOW_SANCT,
    ALLOW_SSM,
    ALLOW_TRAPS,
    ALLOW_TM,
    ALLOW_U,
    ALLOW_WALL,
    A_LAWFUL,
    A_NONE,
    AM_SHRINE,
    Amask2align,
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    BOLT_LIM,
    BUSTDOOR,
    COLNO,
    CONFLICT,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DEAF,
    DISPLACED,
    DOOR,
    DRAWBRIDGE_UP,
    DART_TRAP,
    D_BROKEN,
    D_CLOSED,
    D_LOCKED,
    FAINTED,
    FIRE_TRAP,
    G_GENOD,
    HOLE,
    ICE,
    INVIS,
    IRONBARS,
    IS_ALTAR,
    IS_DOOR,
    IS_OBSTRUCTED,
    IS_STWALL,
    IS_WATERWALL,
    LANDMINE,
    LAVAPOOL,
    LAVAWALL,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPMASK,
    MOAT,
    NOGARLIC,
    NO_WEAPON_WANTED,
    NOTONL,
    OPENDOOR,
    PIT,
    POLY_TRAP,
    P_AXE,
    P_PICK_AXE,
    PROT_FROM_SHAPE_CHANGERS,
    ROOMOFFSET,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    ROWNO,
    RUST_TRAP,
    SHOPBASE,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    STATUE_TRAP,
    STEALTH,
    STONE,
    TELEP_TRAP,
    TEMPLE,
    TRAPDOOR,
    TRAPNUM,
    TREE,
    UNLOCKDOOR,
    VIBRATING_SQUARE,
    WEB,
    W_ARM,
    W_ARMS,
    W_NONDIGGABLE,
    W_NONPASSWALL,
    WT_TOOMUCH_DIAGONAL,
    isok,
} from './const.js';
import { ART_SUNSWORD } from './artifacts.js';
import { on_level } from './dungeon.js';
import { sengr_at } from './engrave.js';
import { game } from './gstate.js';
import { dist2, online2 } from './hacklib.js';
import { money_cnt } from './invent.js';
import { curr_mon_load, m_carrying } from './mon.js';
import {
    amorphous,
    attacktype_fordmg,
    bigmonst,
    breathless,
    dmgtype,
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
    is_whirly,
    likes_lava,
    mindless,
    mon_knows_traps,
    needspick,
    nohands,
    noncorporeal,
    nonliving,
    passes_bars,
    passes_walls,
    perceives,
    resist_conflict,
    slithy,
    throws_rocks,
    tunnels,
    unsolid,
    verysmall,
    webmaker,
    zombie_form,
} from './mondata.js';
import {
    AD_DRST,
    AD_CORR,
    AD_RBRE,
    AD_RUST,
    AT_BREA,
    G_UNIQ,
    MS_LEADER,
    MZ_SMALL,
    PM_ANGEL,
    PM_BABY_PURPLE_WORM,
    PM_DISPLACER_BEAST,
    PM_ETTIN,
    PM_FOG_CLOUD,
    PM_FLOATING_EYE,
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
    PM_VROCK,
    PM_XORN,
    S_DOG,
    S_EEL,
    S_GHOST,
    S_HUMAN,
    S_LEPRECHAUN,
    S_LICH,
    S_NYMPH,
    S_VAMPIRE,
    S_ZOMBIE,
} from './monsters.js';
import { m_at, mon_track_clear } from './monst.js';
import {
    isCandle,
    isContainer,
    objectType,
    sobj_at,
} from './obj.js';
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
    BOULDER,
    BOOMERANG,
    CANDY_BAR,
    COIN_CLASS,
    CLOVE_OF_GARLIC,
    CORPSE,
    CREDIT_CARD,
    CRYSKNIFE,
    DAGGER,
    DWARVISH_MATTOCK,
    FEDORA,
    FORTUNE_COOKIE,
    GEM_CLASS,
    GOLD_DRAGON_SCALE_MAIL,
    GOLD_DRAGON_SCALES,
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
    TOWEL,
    VENOM_CLASS,
} from './objects.js';
import { visible_region_at } from './region.js';
import { rn2, rnd } from './rng.js';
import { in_rooms } from './rooms.js';
import { S_poisoncloud } from './symbols.js';
import { noteleport_level } from './teleport.js';
import { hastrack } from './track.js';
import { is_lava, is_pool, t_at } from './trap.js';
import { couldsee } from './vision.js';
import { which_armor } from './weapon.js';

const ALGN_SINNED = -4;
const ROOM_STRING_SIZE = 5;

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

// C ref: monmove.c closed_door().
export function closed_door(x, y, state = game) {
    const location = state.level?.at(x, y);
    return location?.typ === DOOR
        && Boolean(doorMask(location) & (D_LOCKED | D_CLOSED));
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

function isTreeTerrain(type, state) {
    return type === TREE
        || (type === STONE && state.level?.flags?.arboreal);
}

// C refs: hack.c may_dig() and may_passwall().
export function may_dig(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !((IS_STWALL(location.typ) || isTreeTerrain(location.typ, state))
        && ((location.wall_info ?? 0) & W_NONDIGGABLE));
}

export function may_passwall(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    return !(IS_STWALL(location.typ)
        && ((location.wall_info ?? 0) & W_NONPASSWALL));
}

// C ref: hack.c bad_rock(), specialized only by its supplied monster species.
export function bad_rock(species, x, y, state = game) {
    const location = state.level?.at?.(x, y);
    if (!location) return true;
    return Boolean(
        (state.level?.flags?.sokoban_rules && sobj_at(BOULDER, x, y, state))
        || (IS_OBSTRUCTED(location.typ)
            && (!tunnels(species) || needspick(species)
                || !may_dig(x, y, state))
            && !(passes_walls(species) && may_passwall(x, y, state))),
    );
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

function hasReusablePositionBuffer(poss) {
    if (!Array.isArray(poss) || poss.length !== 9) return false;
    for (let index = 0; index < poss.length; ++index) {
        if (!poss[index] || typeof poss[index] !== 'object') return false;
    }
    return true;
}

function resetMfndposData(data) {
    if (!data || typeof data !== 'object')
        throw new TypeError('mfndpos requires an output data object');
    data.cnt = 0;
    if (!hasReusablePositionBuffer(data.poss)) {
        data.poss = Array.from({ length: 9 }, () => ({ x: 0, y: 0 }));
    } else {
        for (const position of data.poss) {
            position.x = 0;
            position.y = 0;
        }
    }
    if (!Array.isArray(data.info) || data.info.length !== 9)
        data.info = new Array(9).fill(0);
    else
        data.info.fill(0);
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
    const reusablePositions = hasReusablePositionBuffer(data.poss);
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

// C ref: mon.c mfndpos(). Candidate iteration is x-major then y-major; the
// caller-owned `poss` and `info` arrays are fixed scratch buffers and are
// reused after their first initialization. `info[i]` describes what accepting
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
                    && !((isTreeTerrain(nextType, state)
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
    // A missing resistance owner can be discovered after earlier candidates
    // mutate knowledge and output. Snapshot only that exceptional reachable
    // neighborhood so ordinary hot-path calls keep allocation-free buffers.
    const usesDefaultHarmlessTrap = env.mHarmlessTrap == null
        || env.mHarmlessTrap === m_harmless_trap;
    const snapshot = usesDefaultHarmlessTrap
        && typeof env.resistsTrapEffect !== 'function'
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

function monsterAlignment(monster) {
    let alignment = monster.ispriest
        ? monster.mextra?.epri?.shralign
        : monster.isminion
            ? monster.mextra?.emin?.min_align
            : monster.data?.maligntyp;
    if (alignment === A_NONE) return A_NONE;
    alignment = Math.sign(alignment ?? 0);
    return alignment;
}

function isLawfulMinion(monster) {
    return is_minion(monster.data)
        && monsterAlignment(monster) === A_LAWFUL;
}

function altarMask(location) {
    return location?.altarmask ?? location?.flags ?? 0;
}

function hasShrine(priest, state) {
    if (!priest?.ispriest) return false;
    const extension = priest.mextra?.epri;
    const location = state.level?.at(
        extension?.shrpos?.x,
        extension?.shrpos?.y,
    );
    const mask = altarMask(location);
    return IS_ALTAR(location?.typ)
        && Boolean(mask & AM_SHRINE)
        && extension.shralign === Amask2align(mask & ~AM_SHRINE);
}

function histempleAt(priest, x, y, state) {
    const extension = priest?.mextra?.epri;
    return Boolean(priest?.ispriest
        && extension
        && extension.shroom === (in_rooms(x, y, TEMPLE, state)[0] ?? 0)
        && on_level(extension.shrlevel, state.u?.uz));
}

function inhistemple(priest, state) {
    return Boolean(priest?.ispriest
        && histempleAt(priest, priest.mx, priest.my, state)
        && hasShrine(priest, state));
}

function inhishop(shopkeeper, state) {
    const extension = shopkeeper?.mextra?.eshk;
    return Boolean(extension
        && on_level(extension.shoplevel, state.u?.uz)
        && in_rooms(
            shopkeeper.mx,
            shopkeeper.my,
            SHOPBASE,
            state,
        ).includes(extension.shoproom));
}

function templeOccupied(roomBuffer, state) {
    for (let index = 0; index < ROOM_STRING_SIZE; ++index) {
        const roomNumber = Math.trunc(roomBuffer?.[index] ?? 0);
        if (!roomNumber) break;
        if (state.level?.rooms?.[roomNumber - ROOMOFFSET]?.rtype === TEMPLE)
            return roomNumber;
    }
    return 0;
}

function findPriest(roomNumber, state) {
    for (let monster = state.level?.monlist ?? null;
        monster;
        monster = monster.nmon) {
        if (monster.mhp < 1) continue;
        if (monster.ispriest
            && monster.mextra?.epri?.shroom === roomNumber
            && histempleAt(monster, monster.mx, monster.my, state)) {
            return monster;
        }
    }
    return null;
}

// C ref: priest.c in_your_sanctuary().
export function in_your_sanctuary(
    monster,
    x = 0,
    y = 0,
    state = game,
) {
    if (monster) {
        if (is_minion(monster.data) || is_rider(monster.data)) return false;
        x = monster.mx;
        y = monster.my;
    }
    if (state.u?.ualign?.record <= ALGN_SINNED) return false;
    const roomNumber = templeOccupied(state.u?.urooms, state);
    if (!roomNumber
        || roomNumber !== (in_rooms(x, y, TEMPLE, state)[0] ?? 0)) {
        return false;
    }
    const priest = findPriest(roomNumber, state);
    return Boolean(priest
        && hasShrine(priest, state)
        && monsterAlignment(priest) === state.u?.ualign?.type
        && priest.mpeaceful);
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
