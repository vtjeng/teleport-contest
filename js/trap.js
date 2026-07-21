// trap.js -- Trap allocation and map ownership.
// C ref: trap.c -- t_at(), hole_destination(), maketrap(), choose_trapnote().

import {
    BEAR_TRAP,
    CORR,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DOOR,
    DRAWBRIDGE_UP,
    HOLE,
    IS_AIR,
    IS_FURNITURE,
    IS_LAVA,
    IS_POOL,
    IS_ROOM,
    IS_WALL,
    LADDER,
    LEVEL_TELEP,
    MAGIC_PORTAL,
    MELT_ICE_AWAY,
    PIT,
    ROLLING_BOULDER_TRAP,
    ROOM,
    SCORR,
    SDOOR,
    SPIKED_PIT,
    SQKY_BOARD,
    STAIRS,
    STATUE_TRAP,
    STONE,
    TELEP_TRAP,
    TRAPDOOR,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    TT_BEARTRAP,
    TT_LAVA,
    TT_NONE,
    TT_PIT,
    TT_WEB,
    VIBRATING_SQUARE,
    WEB,
    is_pit,
    isok,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { rn2 } from './rng.js';

function trapEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        random: env.random ?? { rn2 },
    };
}

function capability(env, name) {
    return env[name] ?? env.hooks?.[name];
}

function drawbridgeFlags(location) {
    // `flags` is the live struct-rm union slot; drawbridgemask is retained as
    // a compatibility input for older state fixtures.
    return location.flags || location.drawbridgemask || 0;
}

function drawbridgeUnder(location) {
    return drawbridgeFlags(location) & DB_UNDER;
}

// C refs: dbridge.c is_pool(), is_lava(), and is_pool_or_lava(). A raised
// drawbridge's tile type describes the closed span, not the terrain below it.
function isPoolAt(location, state) {
    if (location.typ !== DRAWBRIDGE_UP) return IS_POOL(location.typ);
    return drawbridgeUnder(location) === DB_MOAT
        && !on_level(state.u?.uz, state.juiblex_level);
}

function isLavaAt(location) {
    return IS_LAVA(location.typ)
        || (location.typ === DRAWBRIDGE_UP
            && drawbridgeUnder(location) === DB_LAVA);
}

export function t_at(x, y, state = game) {
    for (const trap of state.level?.traps ?? []) {
        if (trap.tx === x && trap.ty === y) return trap;
    }
    return null;
}

function choose_trapnote(current, env) {
    const used = Array(12).fill(false);
    for (const trap of env.state.level?.traps ?? []) {
        if (trap !== current && trap.ttyp === SQKY_BOARD)
            used[trap.tnote] = true;
    }

    const available = [];
    for (let note = 0; note < used.length; ++note) {
        if (!used[note]) available.push(note);
    }
    return available.length > 0
        ? available[env.random.rn2(available.length)]
        : env.random.rn2(12);
}

// C ref: trap.c dng_bottom() and hole_destination(). The quest and Gehennom
// cutoffs matter outside the initial dungeon even though ordinary D:1 traps
// only use the ordinary-dungeon branch.
function hole_destination(destination, env) {
    const { state, random } = env;
    const current = state.u?.uz;
    const dungeon = state.dungeons?.[current?.dnum];
    if (!current || !dungeon)
        throw new Error('hole_destination requires initialized dungeon state');

    let bottom = dungeon.num_dunlevs;
    const questLocate = state.qlocate_level;
    if (questLocate && current.dnum === questLocate.dnum) {
        const deepestReached = Math.trunc(dungeon.dunlev_ureached ?? 0);
        if (deepestReached < questLocate.dlevel)
            bottom = questLocate.dlevel;
    } else if (dungeon.flags?.hellish && !state.u?.uevent?.invoked) {
        --bottom;
    }

    destination.dnum = current.dnum;
    destination.dlevel = current.dlevel;
    while (destination.dlevel < bottom) {
        ++destination.dlevel;
        if (random.rn2(4)) break;
    }
}

function resetTrap(trap, typ) {
    trap.vl = {};
    trap.launch = { x: -1, y: -1 };
    trap.dst = { dnum: -1, dlevel: -1 };
    trap.teledest = { x: 0, y: 0 };
    trap.madeby_u = false;
    trap.once = false;
    trap.tseen = typ === HOLE;
    trap.ttyp = typ;
    trap.tnote = 0;
    trap.conjoined = 0;
}

function buriedObjectAt(x, y, state) {
    let buried = state.level.buriedobjlist;
    while (buried && (buried.ox !== x || buried.oy !== y))
        buried = buried.nobj;
    return buried;
}

function preflightPitTerrain(x, y, env) {
    const location = env.state.level.at(x, y);
    if (buriedObjectAt(x, y, env.state)
        && typeof capability(env, 'unearthObjects') !== 'function') {
        throw new Error('maketrap requires the buried-object subsystem');
    }
    if (location.typ === DRAWBRIDGE_UP
        && drawbridgeUnder(location) === DB_ICE) {
        if (typeof capability(env, 'objIceEffects') !== 'function') {
            throw new Error(
                'maketrap requires obj_ice_effects for drawbridge ice',
            );
        }
        if (typeof capability(env, 'spotStopTimers') !== 'function') {
            throw new Error(
                'maketrap requires spot_stop_timers for drawbridge ice',
            );
        }
    }
}

function preflightHoleDestination(env) {
    const current = env.state.u?.uz;
    if (!current || !env.state.dungeons?.[current.dnum]) {
        throw new Error(
            'hole_destination requires initialized dungeon state',
        );
    }
}

function heroTrapNeedsReset(x, y, typ, env) {
    const hero = env.state.u;
    if (!hero?.utrap || hero.ux !== x || hero.uy !== y) return false;
    switch (hero.utraptype) {
    case TT_BEARTRAP: return typ !== BEAR_TRAP;
    case TT_WEB: return typ !== WEB;
    case TT_PIT: return !is_pit(typ);
    case TT_LAVA: return !isLavaAt(env.state.level.at(x, y));
    default: return false;
    }
}

function preflightTrapCreation(x, y, typ, resetHero, env) {
    if (resetHero && typeof capability(env, 'resetUtrap') !== 'function') {
        throw new Error('maketrap requires hero-trap reset support');
    }
    switch (typ) {
    case STATUE_TRAP:
        if (typeof capability(env, 'makeTrapStatue') !== 'function')
            throw new Error('maketrap requires the statue-trap subsystem');
        break;
    case ROLLING_BOULDER_TRAP:
        if (typeof capability(env, 'makeRollingBoulderLaunch')
            !== 'function') {
            throw new Error(
                'maketrap requires the rolling-boulder launch subsystem',
            );
        }
        break;
    case PIT:
    case SPIKED_PIT:
        preflightPitTerrain(x, y, env);
        break;
    case HOLE:
    case TRAPDOOR:
        preflightHoleDestination(env);
        preflightPitTerrain(x, y, env);
        break;
    default:
        break;
    }
}

function resetHeroTrap(env) {
    capability(env, 'resetUtrap')(false, env);
    if (env.state.u.utrap || env.state.u.utraptype !== TT_NONE) {
        throw new Error(
            'maketrap resetUtrap must clear u.utrap and u.utraptype',
        );
    }
}

function pitTerrain(x, y, env) {
    const { state } = env;
    const location = state.level.at(x, y);
    let clearFlags = true;

    if (location.typ === DRAWBRIDGE_UP) {
        const wasIce = drawbridgeUnder(location) === DB_ICE;
        location.flags = (drawbridgeFlags(location) & ~DB_UNDER) | DB_FLOOR;
        clearFlags = false;
        if (wasIce) {
            capability(env, 'objIceEffects')(x, y, true, env);
            capability(env, 'spotStopTimers')(
                x,
                y,
                MELT_ICE_AWAY,
                env,
            );
        }
    } else if (IS_ROOM(location.typ)) {
        location.typ = ROOM;
    } else if (location.typ === STONE || location.typ === SCORR) {
        location.typ = CORR;
    } else if (IS_WALL(location.typ) || location.typ === SDOOR) {
        location.typ = state.level.flags?.is_maze_lev
            ? ROOM
            : state.level.flags?.is_cavernous_lev ? CORR : DOOR;
    }

    if (clearFlags) location.flags = 0;
    capability(env, 'unearthObjects')?.(x, y, env);
    capability(env, 'recalculateBlockPoint')?.(x, y, env);
}

// C ref: trap.c maketrap(). This owns the level trap list and implements the
// core branches used by ordinary D:1 generation. Object and launch subsystems
// which are not yet ported fail explicitly at their source boundary.
export function maketrap(x, y, typ, rawEnv = {}) {
    const env = trapEnv(rawEnv);
    const { state } = env;
    const location = state.level?.at(x, y);
    if (!location || typ === TRAPPED_DOOR || typ === TRAPPED_CHEST)
        return null;

    let trap = t_at(x, y, state);
    const oldplace = Boolean(trap);
    if (trap) {
        if (trap.ttyp === MAGIC_PORTAL || trap.ttyp === VIBRATING_SQUARE)
            return null;
    } else if (location.typ === LADDER || location.typ === STAIRS
        || isPoolAt(location, state) || isLavaAt(location)
        || (IS_FURNITURE(location.typ) && typ !== PIT && typ !== HOLE)
        || (location.typ === DRAWBRIDGE_UP && typ === MAGIC_PORTAL)
        || (IS_AIR(location.typ) && typ !== MAGIC_PORTAL)
        || (typ === LEVEL_TELEP && on_level(state.u?.uz, state.knox_level))) {
        return null;
    } else {
        trap = { tx: x, ty: y };
    }

    const resetHero = oldplace && heroTrapNeedsReset(x, y, typ, env);
    preflightTrapCreation(x, y, typ, resetHero, env);
    if (resetHero) resetHeroTrap(env);
    resetTrap(trap, typ);
    switch (typ) {
    case SQKY_BOARD:
        trap.tnote = choose_trapnote(trap, env);
        break;
    case STATUE_TRAP:
        capability(env, 'makeTrapStatue')(x, y, env);
        break;
    case ROLLING_BOULDER_TRAP:
        capability(env, 'makeRollingBoulderLaunch')(trap, x, y, env);
        break;
    case PIT:
    case SPIKED_PIT:
        trap.conjoined = 0;
        pitTerrain(x, y, env);
        break;
    case HOLE:
    case TRAPDOOR:
        hole_destination(trap.dst, env);
        pitTerrain(x, y, env);
        break;
    case TELEP_TRAP: {
        const launchplace = state.launchplace;
        if (launchplace && isok(launchplace.x, launchplace.y)) {
            trap.teledest.x = (state.xstart ?? 0) + launchplace.x;
            trap.teledest.y = (state.ystart ?? 0) + launchplace.y;
        }
        break;
    }
    default:
        break;
    }

    if (!oldplace) state.level.traps.unshift(trap);
    return trap;
}
