// Level trap selection, placement, and shallow-level victims.
// C ref: mklev.c occupied(), traptype_rnd(), traptype_roguelvl(), mktrap(),
// and mktrap_victim().

import {
    ARROW_TRAP,
    BEAR_TRAP,
    CORPSTAT_NONE,
    CORPSTAT_INIT,
    DART_TRAP,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DRAWBRIDGE_UP,
    FIRE_TRAP,
    HOLE,
    IS_FURNITURE,
    LANDMINE,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MAGIC_TRAP,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOFLAGS,
    MKTRAP_NOSPIDERONWEB,
    MKTRAP_NOVICTIM,
    MKTRAP_SEEN,
    MM_NOCOUNTBIRTH,
    MM_NOMSG,
    NO_MM_FLAGS,
    NO_TRAP,
    PIT,
    POOL,
    POLY_TRAP,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    SPIKED_PIT,
    SQKY_BOARD,
    STATUE_TRAP,
    TAINT_AGE,
    TELEP_TRAP,
    TRAPDOOR,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    TRAPNUM,
    VIBRATING_SQUARE,
    WATER,
    WEB,
    LAVAPOOL,
    LAVAWALL,
    MOAT,
    is_hole,
    is_pit,
    isok,
} from './const.js';
import {
    Can_fall_thru,
    Invocation_lev,
    level_difficulty,
    on_level,
} from './dungeon.js';
import { game } from './gstate.js';
import { add_to_container, obj_extract_self } from './invent.js';
import { makemon, mongone } from './makemon_create.js';
import { rndmonnum_adj } from './makemon.js';
import { is_rider } from './mondata.js';
import {
    PM_ARCHEOLOGIST,
    PM_DWARF,
    PM_ELF,
    PM_GIANT_SPIDER,
    PM_GNOME,
    PM_HUMAN,
    PM_ORC,
    PM_WIZARD,
    S_UNICORN,
} from './monsters.js';
import {
    curseFreeObject,
    dealloc_obj,
    mkobj,
    mksobj,
    place_object,
    sobj_at,
    weight,
} from './obj.js';
import {
    ACID_VENOM,
    AMULET_OF_YENDOR,
    ARMOR_CLASS,
    ARROW,
    BELL_OF_OPENING,
    BLINDING_VENOM,
    BOULDER,
    CANDELABRUM_OF_INVOCATION,
    CORPSE,
    CREAM_PIE,
    DART,
    EGG,
    EXPENSIVE_CAMERA,
    FOOD_CLASS,
    GEM_CLASS,
    GLASS,
    MELON,
    POTION_CLASS,
    ROCK,
    SPE_BOOK_OF_THE_DEAD,
    STATUE,
    TALLOW_CANDLE,
    TOOL_CLASS,
    WAX_CANDLE,
    WEAPON_CLASS,
} from './objects.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import { maketrap, t_at } from './trap.js';
import { mkcorpstat } from './corpstat.js';
import { begin_burn } from './timeout.js';

// include/monflag.h is_unicorn()'s likes_gems() predicate. Generated monster
// records retain the bit, but monsters.js does not currently export its name.
const M2_JEWELS = 0x20000000;

function levelTrapEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        random: env.random ?? { d, rn1, rn2, rnd, rne, rnz },
        hooks: env.hooks ?? {},
    };
}

function raisedDrawbridgeOver(location, terrain) {
    return location.typ === DRAWBRIDGE_UP
        && ((location.flags ?? 0) & DB_UNDER) === terrain;
}

function isPoolAt(x, y, state) {
    if (!isok(x, y)) return false;
    const location = state.level.at(x, y);
    if (location.typ === POOL || location.typ === MOAT
        || location.typ === WATER) return true;
    const current = state.u?.uz;
    return !on_level(current, state.juiblex_level)
        && raisedDrawbridgeOver(location, DB_MOAT);
}

function isLavaAt(x, y, state) {
    if (!isok(x, y)) return false;
    const location = state.level.at(x, y);
    return (location.typ === LAVAPOOL || location.typ === LAVAWALL)
        || raisedDrawbridgeOver(location, DB_LAVA);
}

function invocationPosition(x, y, state) {
    const current = state.u?.uz;
    const invocation = state.inv_pos;
    return Boolean(current && invocation
        && Invocation_lev(current, state)
        && invocation.x === x && invocation.y === y);
}

export function occupied(x, y, state = game) {
    const location = state.level?.at(x, y);
    if (!location) return false;
    return Boolean(t_at(x, y, state)
        || IS_FURNITURE(location.typ)
        || isLavaAt(x, y, state)
        || isPoolAt(x, y, state)
        || invocationPosition(x, y, state));
}

export function traptype_rnd(mktrapflags = MKTRAP_NOFLAGS, rawEnv = {}) {
    const env = levelTrapEnv(rawEnv);
    const { random, state } = env;
    const lvl = level_difficulty(state);
    let kind = random.rnd(TRAPNUM - 1);

    switch (kind) {
    case TRAPPED_DOOR:
    case TRAPPED_CHEST:
    case MAGIC_PORTAL:
    case VIBRATING_SQUARE:
        kind = NO_TRAP;
        break;
    case ROLLING_BOULDER_TRAP:
    case SLP_GAS_TRAP:
        if (lvl < 2) kind = NO_TRAP;
        break;
    case LEVEL_TELEP:
        if (lvl < 5 || state.level.flags.noteleport
            || on_level(state.u.uz, state.knox_level)) {
            kind = NO_TRAP;
        }
        break;
    case SPIKED_PIT:
        if (lvl < 5) kind = NO_TRAP;
        break;
    case LANDMINE:
        if (lvl < 6) kind = NO_TRAP;
        break;
    case WEB:
        if (lvl < 7 && !(mktrapflags & MKTRAP_NOSPIDERONWEB))
            kind = NO_TRAP;
        break;
    case STATUE_TRAP:
    case POLY_TRAP:
        if (lvl < 8) kind = NO_TRAP;
        break;
    case FIRE_TRAP:
        if (!state.dungeons[state.u.uz.dnum].flags.hellish)
            kind = NO_TRAP;
        break;
    case TELEP_TRAP:
        if (state.level.flags.noteleport) kind = NO_TRAP;
        break;
    case HOLE:
        if (random.rn2(7)) kind = NO_TRAP;
        break;
    default:
        break;
    }
    return kind;
}

export function traptype_roguelvl(rawEnv = {}) {
    const { random } = levelTrapEnv(rawEnv);
    switch (random.rn2(7)) {
    default:
        return BEAR_TRAP;
    case 1:
        return ARROW_TRAP;
    case 2:
        return DART_TRAP;
    case 3:
        return TRAPDOOR;
    case 4:
        return PIT;
    case 5:
        return SLP_GAS_TRAP;
    case 6:
        return RUST_TRAP;
    }
}

function protectedFromBreakage(obj, state) {
    if (obj.otyp === AMULET_OF_YENDOR
        || obj.otyp === SPE_BOOK_OF_THE_DEAD
        || obj.otyp === CANDELABRUM_OF_INVOCATION
        || obj.otyp === BELL_OF_OPENING) {
        return true;
    }
    return obj.otyp === CORPSE && obj.corpsenm >= 0
        && is_rider(state.mons[obj.corpsenm]);
}

// C ref: zap.c obj_resists() and dothrow.c breaktest(). This is reached only
// for possessions scattered by an exploded land mine, but its resistance draw
// remains part of mktrap_victim()'s observable PRNG order.
function breaktest(obj, env) {
    const { random, state } = env;
    const type = state.objects[obj.otyp];
    let nonbreakchance = 1;
    if (obj.oclass === ARMOR_CLASS && type.oc_material === GLASS)
        nonbreakchance = 90;
    if (protectedFromBreakage(obj, state)
        || random.rn2(100) < (obj.oartifact ? 99 : nonbreakchance)) {
        return false;
    }
    if (type.oc_material === GLASS && !obj.oartifact
        && obj.oclass !== GEM_CLASS) {
        return true;
    }
    if (obj.oclass === POTION_CLASS) return true;
    return obj.otyp === EXPENSIVE_CAMERA
        || obj.otyp === EGG
        || obj.otyp === CREAM_PIE
        || obj.otyp === MELON
        || obj.otyp === ACID_VENOM
        || obj.otyp === BLINDING_VENOM;
}

function beginGeneratedCandleBurn(obj, env) {
    const beginBurn = env.hooks.beginBurn ?? begin_burn;
    beginBurn(obj, false, env);
}

export function mktrap_victim(trap, rawEnv = {}) {
    const env = levelTrapEnv(rawEnv);
    const { random, state } = env;
    const lvl = level_difficulty(state);
    const kind = trap.ttyp;
    const { tx: x, ty: y } = trap;
    let obj = null;

    switch (kind) {
    case ARROW_TRAP:
        obj = mksobj(ARROW, true, false, env);
        obj.opoisoned = 0;
        break;
    case DART_TRAP:
        obj = mksobj(DART, true, false, env);
        break;
    case ROCKTRAP:
        obj = mksobj(ROCK, true, false, env);
        break;
    default:
        break;
    }
    if (obj) place_object(obj, x, y, env);

    do {
        let objectClass;
        switch (random.rn2(4)) {
        case 0:
            objectClass = WEAPON_CLASS;
            break;
        case 1:
            objectClass = TOOL_CLASS;
            break;
        case 2:
            objectClass = FOOD_CLASS;
            break;
        default:
            objectClass = GEM_CLASS;
            break;
        }
        obj = mkobj(objectClass, false, env);
        curseFreeObject(obj, env);
        if (trap.ttyp === PIT && breaktest(obj, env)) {
            dealloc_obj(obj, env);
        } else {
            place_object(obj, x, y, env);
        }
    } while (!random.rn2(5));

    let victim;
    switch (random.rn2(15)) {
    case 0:
        victim = PM_ELF;
        if (kind === SLP_GAS_TRAP && !(lvl <= 2 && random.rn2(2)))
            victim = PM_HUMAN;
        break;
    case 1:
    case 2:
        victim = PM_DWARF;
        break;
    case 3:
    case 4:
    case 5:
        victim = PM_ORC;
        break;
    case 6:
    case 7:
    case 8:
    case 9:
        victim = PM_GNOME;
        if (!random.rn2(10)) {
            obj = mksobj(
                random.rn2(4) ? TALLOW_CANDLE : WAX_CANDLE,
                true,
                false,
                env,
            );
            obj.quan = 1;
            obj.owt = weight(obj, env);
            curseFreeObject(obj, env);
            place_object(obj, x, y, env);
            if (!state.level.at(x, y).lit)
                beginGeneratedCandleBurn(obj, env);
        }
        break;
    default:
        victim = PM_HUMAN;
        break;
    }
    if (victim === PM_HUMAN && random.rn2(25)) {
        victim = random.rn1(
            PM_WIZARD - PM_ARCHEOLOGIST,
            PM_ARCHEOLOGIST,
        );
    }
    const corpse = mkcorpstat(
        CORPSE,
        null,
        victim,
        x,
        y,
        CORPSTAT_INIT,
        env,
    );
    corpse.age -= TAINT_AGE + 1;
    return corpse;
}

function roomCoordinate(croom, coordinate, env) {
    const choose = env.hooks.somexyspace;
    if (typeof choose !== 'function')
        throw new Error('mktrap requires room-coordinate selection');
    return choose(croom, coordinate, env);
}

function mazeCoordinate(coordinate, env) {
    const choose = env.hooks.mazexy;
    if (typeof choose !== 'function')
        throw new Error('mktrap requires maze-coordinate selection');
    choose(coordinate, env);
}

function isCoalignedUnicorn(species, state) {
    return species.mlet === S_UNICORN
        && (species.mflags2 & M2_JEWELS)
        && Math.sign(state.u.ualign.type) === Math.sign(species.maligntyp);
}

// C ref: trap.c mk_trap_statue(). The temporary monster exists solely to
// generate the living statue's inventory, which is transferred before the
// monster follows the ordinary mongone()/dmonsfree() detachment lifecycle.
function mk_trap_statue(x, y, env) {
    const { state } = env;
    let tryCount = 10;
    let mndx;
    do {
        mndx = rndmonnum_adj(3, 6, env);
    } while (--tryCount > 0
        && isCoalignedUnicorn(state.mons[mndx], state));

    const statue = mkcorpstat(
        STATUE,
        null,
        state.mons[mndx],
        x,
        y,
        CORPSTAT_NONE,
        env,
    );
    const monster = makemon(
        state.mons[statue.corpsenm],
        0,
        0,
        MM_NOCOUNTBIRTH | MM_NOMSG,
        env,
    );
    if (!monster) return statue;

    while (monster.minvent) {
        const obj = monster.minvent;
        obj.owornmask = 0;
        obj_extract_self(obj, env);
        add_to_container(statue, obj, env);
    }
    statue.owt = weight(statue, env);
    mongone(monster, env);
    return statue;
}

export function mktrap(
    num,
    mktrapflags = MKTRAP_NOFLAGS,
    croom = null,
    tm = null,
    rawEnv = {},
) {
    const baseEnv = levelTrapEnv(rawEnv);
    const env = {
        ...baseEnv,
        hooks: {
            makeTrapStatue: mk_trap_statue,
            ...(baseEnv.hooks ?? {}),
        },
    };
    const { random, state } = env;
    if (!tm && !croom && !(mktrapflags & MKTRAP_MAZEFLAG)) return null;
    if (tm && (isPoolAt(tm.x, tm.y, state) || isLavaAt(tm.x, tm.y, state)))
        return null;

    let kind;
    if (num > NO_TRAP && num < TRAPNUM) {
        kind = num;
    } else if (on_level(state.u.uz, state.rogue_level)) {
        kind = traptype_roguelvl(env);
    } else if (state.dungeons[state.u.uz.dnum].flags.hellish
        && !random.rn2(5)) {
        kind = FIRE_TRAP;
    } else {
        do {
            kind = traptype_rnd(mktrapflags, env);
        } while (kind === NO_TRAP);
    }

    if (is_hole(kind) && !Can_fall_thru(state.u.uz, state))
        kind = ROCKTRAP;

    const coordinate = { x: 0, y: 0 };
    if (tm) {
        coordinate.x = tm.x;
        coordinate.y = tm.y;
    } else {
        let tryct = 0;
        const avoidBoulder = is_pit(kind) || is_hole(kind);
        do {
            if (++tryct > 200) return null;
            if (mktrapflags & MKTRAP_MAZEFLAG) {
                mazeCoordinate(coordinate, env);
            } else if (croom && !roomCoordinate(croom, coordinate, env)) {
                return null;
            }
        } while (occupied(coordinate.x, coordinate.y, state)
            || (avoidBoulder
                && sobj_at(BOULDER, coordinate.x, coordinate.y, state)));
    }

    const trap = maketrap(coordinate.x, coordinate.y, kind, env);
    kind = trap?.ttyp ?? NO_TRAP;
    if (kind === WEB && !(mktrapflags & MKTRAP_NOSPIDERONWEB)) {
        const makeMonster = env.hooks.makeMonster;
        if (typeof makeMonster !== 'function') {
            throw new Error(
                'mktrap requires general monster creation for a web spider',
            );
        }
        makeMonster(
            state.mons[PM_GIANT_SPIDER],
            coordinate.x,
            coordinate.y,
            NO_MM_FLAGS,
            env,
        );
    }
    if (trap && (mktrapflags & MKTRAP_SEEN)) trap.tseen = true;
    if (kind === MAGIC_PORTAL
        && (state.u.ucamefrom?.dnum || state.u.ucamefrom?.dlevel)) {
        trap.dst = { ...state.u.ucamefrom };
    }

    const lvl = level_difficulty(state);
    if (state.in_mklev
        && kind !== NO_TRAP
        && !(mktrapflags & MKTRAP_NOVICTIM)
        && lvl <= random.rnd(4)
        && kind !== SQKY_BOARD
        && kind !== RUST_TRAP
        && !(kind === ROLLING_BOULDER_TRAP
            && trap.launch.x === trap.tx && trap.launch.y === trap.ty)
        && !is_pit(kind)
        && (kind < HOLE || kind === MAGIC_TRAP)) {
        if (kind === LANDMINE) {
            trap.ttyp = PIT;
            trap.tseen = true;
        }
        mktrap_victim(trap, env);
    }
    return trap;
}
