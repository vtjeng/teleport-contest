// trap.js -- Trap allocation and map ownership.
// C ref: trap.c -- t_at(), hole_destination(), maketrap(), choose_trapnote().

import {
    CORR,
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
    VIBRATING_SQUARE,
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

function pitTerrain(x, y, env) {
    const { state } = env;
    const location = state.level.at(x, y);
    let buried = state.level.buriedobjlist;
    while (buried && (buried.ox !== x || buried.oy !== y))
        buried = buried.nobj;
    if (buried && typeof env.unearthObjects !== 'function')
        throw new Error('maketrap requires the buried-object subsystem');
    let clearFlags = true;

    if (location.typ === DRAWBRIDGE_UP) {
        // Drawbridge state is not reachable during ordinary D:1 room filling.
        // Require its owner rather than silently discarding drawbridge flags.
        if (typeof env.openDrawbridgeFloor !== 'function') {
            throw new Error('maketrap requires drawbridge terrain support');
        }
        env.openDrawbridgeFloor(x, y, env);
        clearFlags = false;
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
    env.unearthObjects?.(x, y, env);
    env.recalculateBlockPoint?.(x, y, env);
}

// C ref: trap.c maketrap(). This owns the level trap list and implements the
// core branches used by ordinary D:1 generation. Object, drawbridge, and
// launch subsystems which are not yet ported fail explicitly at their source
// boundary.
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
        || IS_POOL(location.typ) || IS_LAVA(location.typ)
        || (IS_FURNITURE(location.typ) && typ !== PIT && typ !== HOLE)
        || (location.typ === DRAWBRIDGE_UP && typ === MAGIC_PORTAL)
        || (IS_AIR(location.typ) && typ !== MAGIC_PORTAL)
        || (typ === LEVEL_TELEP && on_level(state.u?.uz, state.knox_level))) {
        return null;
    } else {
        trap = { tx: x, ty: y };
    }

    resetTrap(trap, typ);
    switch (typ) {
    case SQKY_BOARD:
        trap.tnote = choose_trapnote(trap, env);
        break;
    case STATUE_TRAP:
        if (typeof env.makeTrapStatue !== 'function')
            throw new Error('maketrap requires the statue-trap subsystem');
        env.makeTrapStatue(x, y, env);
        break;
    case ROLLING_BOULDER_TRAP:
        if (typeof env.makeRollingBoulderLaunch !== 'function') {
            throw new Error(
                'maketrap requires the rolling-boulder launch subsystem',
            );
        }
        env.makeRollingBoulderLaunch(trap, x, y, env);
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
