// trap.js -- Trap allocation and map ownership.
// C ref: trap.c -- t_at(), hole_destination(), maketrap(), deltrap(),
// clear_conjoined_pits(), choose_trapnote(), set_utrap(), reset_utrap(),
// fill_pit(), float_down(), trapname().

import {
    BEAR_TRAP,
    BOLT_LIM,
    CORR,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    D_CLOSED,
    D_LOCKED,
    DOOR,
    DRAWBRIDGE_UP,
    FLYING,
    HOLE,
    IS_AIR,
    IS_FURNITURE,
    IS_LAVA,
    IS_POOL,
    IS_ROOM,
    IS_WALL,
    In_sokoban,
    Is_airlevel,
    Is_waterlevel,
    LADDER,
    LAVAWALL,
    LEVEL_TELEP,
    LEVITATION,
    MAGIC_PORTAL,
    MELT_ICE_AWAY,
    N_DIRS,
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
    WATER,
    WEB,
    W_SADDLE,
    ZAP_POS,
    is_hole,
    is_pit,
    is_xport,
    isok,
    xdir,
    ydir,
} from './const.js';
import { unearth_objs } from './bury.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { nomul, UnsupportedHeroMoveBoundaryError } from './hack.js';
import { stackobj } from './invent.js';
import { is_flyer } from './mondata.js';
import {
    mksobj,
    obj_ice_effects,
    place_object,
    sobj_at,
    weight,
} from './obj.js';
import { BOULDER } from './objects.js';
import { check_here, encumber_msg } from './pickup.js';
import { float_vs_flight } from './polyself.js';
import { rn1, rn2, rnd, rne } from './rng.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { trap_to_defsym } from './symbols.js';
import { is_ice, set_levltyp } from './terrain.js';
import { spot_stop_timers } from './timeout.js';

function trapEnv(env = {}) {
    return {
        ...env,
        state: env.state ?? game,
        random: env.random ?? { rn1, rn2, rnd, rne },
    };
}

function capability(env, name) {
    return env[name] ?? env.hooks?.[name] ?? DEFAULT_CAPABILITIES[name];
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

export function is_pool(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    return Boolean(location && isPoolAt(location, state));
}

export function is_lava(x, y, state = game) {
    const location = state.level?.at?.(x, y);
    return Boolean(location && isLavaAt(location));
}

// C ref: dbridge.c is_pool_or_lava() (76-83).
export function is_pool_or_lava(x, y, state = game) {
    return is_pool(x, y, state) || is_lava(x, y, state);
}

function closedDoor(location) {
    const mask = location.flags || location.doormask || 0;
    return location.typ === DOOR
        && Boolean(mask & (D_CLOSED | D_LOCKED));
}

function clearLaunchPath(coordinate, distance, dx, dy, env) {
    let { x, y } = coordinate;
    while (distance-- > 0) {
        x += dx;
        y += dy;
        if (!isok(x, y)) return false;
        const location = env.state.level.at(x, y);
        if (!ZAP_POS(location.typ) || closedDoor(location)) return false;
        const trap = t_at(x, y, env.state);
        if (trap && (is_pit(trap.ttyp)
            || is_hole(trap.ttyp)
            || is_xport(trap.ttyp))) {
            return false;
        }
    }
    coordinate.x = x;
    coordinate.y = y;
    return true;
}

// mthrowu.c:linedup(..., 1) for an explicitly supplied launch offset.  The
// boulderhandling=1 branch ignores intervening boulders, so only terrain and
// the source's orthogonal-or-diagonal range contract matter here.
function explicitLaunchCoordinate(trap, env) {
    const offset = env.state.launchplace;
    if (!offset) return null;
    const target = {
        x: trap.tx + offset.x,
        y: trap.ty + offset.y,
    };
    if (!isok(target.x, target.y)) return null;
    const dx = target.x - trap.tx;
    const dy = target.y - trap.ty;
    const distance = Math.max(Math.abs(dx), Math.abs(dy));
    if (!distance || distance >= BOLT_LIM
        || (dx && dy && Math.abs(dx) !== Math.abs(dy))) {
        return null;
    }
    const sx = Math.sign(dx);
    const sy = Math.sign(dy);
    for (let step = 1; step < distance; ++step) {
        const location = env.state.level.at(
            trap.tx + sx * step,
            trap.ty + sy * step,
        );
        if (!ZAP_POS(location.typ) || closedDoor(location)
            || location.typ === WATER || location.typ === LAVAWALL) {
            return null;
        }
    }
    return target;
}

// trap.c:find_random_launch_coord(). The path is tested in both directions
// because a rolling boulder must pass through the trigger square and continue
// to the mirrored endpoint.
function findRandomLaunchCoordinate(trap, env) {
    if (!trap || env.state.level.flags?.sokoban_rules) return null;
    const explicit = explicitLaunchCoordinate(trap, env);
    if (explicit) return explicit;

    let distance = env.random.rn1(5, 4);
    let direction = env.random.rn2(N_DIRS);
    let trycount = 0;
    while (distance >= 2) {
        const dx = xdir[direction];
        const dy = ydir[direction];
        const launch = { x: trap.tx, y: trap.ty };
        const endpoint = env.state.level.at(
            trap.tx + distance * dx,
            trap.ty + distance * dy,
        );
        let success = endpoint
            && !isPoolAt(endpoint, env.state)
            && !isLavaAt(endpoint)
            && clearLaunchPath(launch, distance, dx, dy, env);
        const opposite = { x: trap.tx, y: trap.ty };
        if (!clearLaunchPath(opposite, distance, -dx, -dy, env))
            success = false;
        if (success) return launch;
        direction = (direction + 1) % N_DIRS;
        if (++trycount % N_DIRS === 0) --distance;
    }
    return null;
}

// trap.c:mkroll_launch() rolling-boulder subset.
function makeRollingBoulderLaunch(trap, x, y, env) {
    const launch = findRandomLaunchCoordinate(trap, env) ?? { x, y };
    if (launch.x !== x || launch.y !== y) {
        const boulder = mksobj(BOULDER, true, false, env);
        boulder.quan = 1;
        boulder.owt = weight(boulder, env);
        place_object(boulder, launch.x, launch.y, env);
        stackobj(boulder, env);
    }
    trap.launch.x = launch.x;
    trap.launch.y = launch.y;
    trap.launch2 = {
        x: x - (launch.x - x),
        y: y - (launch.y - y),
    };
    capability(env, 'newsym')?.(launch.x, launch.y, env);
    return true;
}

const DEFAULT_CAPABILITIES = Object.freeze({
    makeRollingBoulderLaunch,
    objIceEffects: obj_ice_effects,
    spotStopTimers(x, y, action, env) {
        spot_stop_timers(x, y, action, env.state);
    },
    unearthObjects: unearth_objs,
});

export function t_at(x, y, state = game) {
    for (const trap of state.level?.traps ?? []) {
        if (trap.tx === x && trap.ty === y) return trap;
    }
    return null;
}

// C ref: trap.c uteetering_at_seen_pit() (6647-6653). TRUE when the hero
// escaped a pit and stands on its edge, which is why the u.utrap test excludes
// a hero still caught in one.
export function uteetering_at_seen_pit(trap, state = game) {
    const u = state.u;
    return Boolean(trap && is_pit(trap.ttyp) && trap.tseen
        && trap.tx === u?.ux && trap.ty === u?.uy
        && !(u.utrap && u.utraptype === TT_PIT));
}

// C ref: trap.c uescaped_shaft() (6659-6664). TRUE when the hero is standing
// on a known hole or trap door without having fallen through it.
export function uescaped_shaft(trap, state = game) {
    const u = state.u;
    return Boolean(trap && is_hole(trap.ttyp) && trap.tseen
        && trap.tx === u?.ux && trap.ty === u?.uy);
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
    if (buriedObjectAt(x, y, env.state)
        && typeof capability(env, 'unearthObjects') !== 'function') {
        throw new Error('maketrap requires the buried-object subsystem');
    }
    if (is_ice(x, y, env.state)) {
        if (typeof capability(env, 'objIceEffects') !== 'function') {
            throw new Error(
                'maketrap requires obj_ice_effects when removing ice',
            );
        }
        if (typeof capability(env, 'spotStopTimers') !== 'function') {
            throw new Error(
                'maketrap requires spot_stop_timers when removing ice',
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
        set_levltyp(x, y, ROOM, env);
    } else if (location.typ === STONE || location.typ === SCORR) {
        set_levltyp(x, y, CORR, env);
    } else if (IS_WALL(location.typ) || location.typ === SDOOR) {
        set_levltyp(x, y, state.level.flags?.is_maze_lev
            ? ROOM
            : state.level.flags?.is_cavernous_lev ? CORR : DOOR, env);
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

// C ref: trap.c deltrap() (6529-6548). Unlinks a trap from the level's trap
// list. C walks gf.ftrap to find the predecessor and panics when the trap is
// not on the list; the port keeps the same list as an array, in the same
// order (maketrap() prepends, as C does), so the unlink is one splice and the
// panic becomes a thrown Error.
//
// dealloc_trap() has no counterpart: C frees the record, JavaScript lets it go.
export function deltrap(trap, state = game) {
    clear_conjoined_pits(trap);
    const traps = state.level.traps;
    const index = traps.indexOf(trap);
    if (index < 0) throw new Error('deltrap: no preceding trap!');
    traps.splice(index, 1);
    const uz = state.u?.uz;
    if (uz && In_sokoban(uz) && (trap.ttyp === PIT || trap.ttyp === HOLE)) {
        // trap.c:6545-6546 calls maybe_finish_sokoban(), which awards the
        // Sokoban prize and its luck bonus. Nothing of that is ported.
        throw new UnsupportedHeroMoveBoundaryError(
            'maybe_finish_sokoban() after removing a Sokoban pit or hole',
        );
    }
}

// C ref: trap.c clear_conjoined_pits() (6578-6603). Every trap this port
// creates has `conjoined` set to 0 -- maketrap() clears it for PIT and
// SPIKED_PIT and resetTrap() clears it for every other type -- and the
// mklev.c conjoined-pit generation is not ported (js/mklev.js:2899-2901), so
// the mask is always empty and the neighbour loop has nothing to walk. It
// refuses rather than silently skipping the unlink if that ever changes.
function clear_conjoined_pits(trap) {
    if (trap && is_pit(trap.ttyp) && trap.conjoined) {
        throw new UnsupportedHeroMoveBoundaryError(
            'unlinking a conjoined pit',
        );
    }
}

// C ref: trap.c count_traps() (6516-6528). Returns the number of traps of
// the given type on the current level. Walks the level trap list (C's
// gf.ftrap chain) and counts matches.
export function count_traps(ttyp, state = game) {
    let ret = 0;
    for (const trap of state.level?.traps ?? []) {
        if (trap.ttyp === ttyp) ret++;
    }
    return ret;
}

// ── Hero trap state and the descent out of levitation (C ref: trap.c) ──

// youprop.h:242 Levitation and :253 Flying, spelled out here for the same
// reason every other file in this port spells them out: the macros read three
// fields of one property and Flying adds a steed term. They are exported for
// js/trap_effects.js alone, which holds the rest of trap.c's port and needs
// the same two macros in dotrap() and trapeffect_bear_trap(); a second copy
// there would be a second copy inside one C file.
export function Levitation(state) {
    const levitation = state.u.uprops[LEVITATION];
    return Boolean((levitation.intrinsic || levitation.extrinsic)
                   && !levitation.blocked);
}

export function Flying(state) {
    const flying = state.u.uprops[FLYING];
    return Boolean((flying.intrinsic || flying.extrinsic
                    || (state.u.usteed && is_flyer(state.u.usteed.data)))
                   && !flying.blocked);
}

// C ref: trap.c unconscious() (6775-6786). The larger half of youprop.h:399
// Unaware, which is `gm.multi < 0 && (unconscious() || is_fainted())`; eat.c
// is_fainted() is the other half and is one field read, so each caller spells
// Unaware out around this.
//
// C reads the pending gn.nomovemsg to tell an immobilized hero apart from an
// insensible one: only the three messages that announce coming round mean the
// hero was not there for what happened. A hero with no message scheduled has
// gn.nomovemsg NULL, and C's `gn.nomovemsg &&` makes that answer FALSE.
export function unconscious(state = game) {
    if (Math.trunc(state.multi ?? 0) >= 0) return false;

    const nomovemsg = state.nomovemsg ?? '';
    return Boolean(state.u?.usleep)
        || nomovemsg.startsWith('You awake')
        || nomovemsg.startsWith('You regain con')
        || nomovemsg.startsWith('You are consci');
}

// C ref: trap.c set_utrap() (1030-1043). The `!u.utrap ^ !tim` test fires only
// when the hero enters or leaves a trap, so releasing an untrapped hero writes
// no status-line flag of its own; float_vs_flight() writes one regardless.
export function set_utrap(tim, typ, state = game) {
    const u = state.u;
    if (Boolean(!u.utrap) !== Boolean(!tim)) {
        state.disp ??= {};
        state.disp.botl = true;
    }
    u.utrap = tim;
    u.utraptype = tim ? typ : TT_NONE;
    float_vs_flight(state);
}

// C ref: trap.c reset_utrap() (1045-1057). Two call sites are ported and they
// disagree about `msg`: teleport.c teleds() passes FALSE, and hack.c
// domove_core():2835 passes TRUE for the hero who has just worked free of a
// bear trap. So float_up() and the "You can fly." line below it are live
// refusals rather than unreachable ones -- scripts/hero-bear-trap.test.mjs
// reaches the first of them -- and both stop rather than being dropped.
export function reset_utrap(msg, state = game) {
    const was_Lev = Levitation(state);
    const was_Fly = Flying(state);

    set_utrap(0, 0, state);

    if (msg) {
        if (!was_Lev && Levitation(state))
            throw new UnsupportedHeroMoveBoundaryError(
                'reset_utrap() resuming levitation',
            );
        if (!was_Fly && Flying(state))
            throw new UnsupportedHeroMoveBoundaryError(
                'reset_utrap() resuming flight',
            );
    }
}

// C ref: trap.c fill_pit() (4010-4021). A boulder resting on a pit or hole
// settles into it when the hero leaves the square.
export function fill_pit(x, y, state = game) {
    const trap = t_at(x, y, state);
    if (trap && (is_pit(trap.ttyp) || is_hole(trap.ttyp))
        && sobj_at(BOULDER, x, y, state)) {
        // obj_extract_self() then flooreffects(otmp, x, y, "settle"), which
        // fills the pit, may break the boulder and can drown or burn it. None
        // of flooreffects() is ported.
        throw new UnsupportedHeroMoveBoundaryError(
            'fill_pit() settling a boulder into a pit',
        );
    }
}

// C ref: trap.c float_down() (4024-4177). dismount_steed() is the only ported
// caller and passes hmask 0 with emask W_SADDLE, so no levitation source is
// actually cleared and the whole "float gently to the surface" block at
// 4109-4146 is suppressed by its `!(emask & W_SADDLE)` guard. What remains
// reachable is the status-line flag, nomul(0), encumber_msg() and the deferred
// pickup(1) that dismount_steed() relies on -- spoteffects() skips its own
// pickup while gi.in_steed_dismounting is set, so this call is the only one.
export async function float_down(hmask, emask, state = game) {
    const u = state.u;
    const levitation = u.uprops[LEVITATION];

    levitation.intrinsic &= ~hmask;
    levitation.extrinsic &= ~emask;
    if (Levitation(state))
        return 0; /* maybe another ring/potion/boots */
    if (levitation.blocked) {
        // The BLevitation arm gives terrain- or trap-specific feedback and
        // returns before every side effect below it.
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() with levitation blocked',
        );
    }
    state.disp ??= {};
    state.disp.botl = true;
    nomul(0, state); /* stop running or resting */
    if (u.uprops[FLYING].blocked) {
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() into controlled flight',
        );
    }
    if (u.uswallow) {
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() while engulfed',
        );
    }
    if (state.uball) {
        // The Punished arm can move the hero onto the ball's square.
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() with a punishing ball',
        );
    }
    if (!Flying(state)) {
        if (u.ustuck) {
            throw new UnsupportedHeroMoveBoundaryError(
                'float_down() while held',
            );
        }
        if (is_pool(u.ux, u.uy, state) || is_lava(u.ux, u.uy, state)) {
            // drown() and lava_effects() own these squares.
            throw new UnsupportedHeroMoveBoundaryError(
                'float_down() into water or lava',
            );
        }
    }
    const trap = t_at(u.ux, u.uy, state);
    if (Is_airlevel(u.uz) || Is_waterlevel(u.uz)) {
        // "You begin to tumble in place." is printed even under W_SADDLE.
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() on the air or water level',
        );
    }
    if (u.uinwater) {
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() underwater',
        );
    }
    if (!(emask & W_SADDLE)) {
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() landing messages',
        );
    }

    /* levitation gives maximum carrying capacity, so having it end
       potentially triggers greater encumbrance */
    await encumber_msg(state);

    if (trap) {
        // The switch here ends in dotrap(), and a HOLE or TRAPDOOR arm can
        // leave the level before the pickup below runs.
        throw new UnsupportedHeroMoveBoundaryError(
            'float_down() onto a trap',
        );
    }
    // C ref: pickup(1). js/hack.js spoteffects() documents why check_here()
    // stands for the whole of pickup() at this boundary.
    await check_here(false, state);
    return 1;
}

// C ref: trap.c trapname() (7099-7155), the live return at 7154 alone.
//
// C's second parameter, `override`, only suppresses the hallucinating branch
// at 7106-7152. That branch draws rn2_on_display_rng() once and can build a
// name from the hero's role and rank, so it is unported and the parameter is
// left off rather than carried dead: every caller here formats the true name.
// Monnam(), which shares mintrap()'s escape line at C 3771-3772, carries the
// same gap -- js/do_name.js monsterCommonName() drops the saddle adjective for
// a hallucinating hero and returns the true species name -- so the line as a
// whole is correct exactly while the hero is not hallucinating.
//
// defsyms[].explanation is generated as CMAP_EXPLANATIONS, so this reads the
// table the symbol set is built from rather than a copy of it. trap_to_defsym()
// rejects NO_TRAP and anything at or past TRAPNUM, which is C's own indexable
// range.
export function trapname(ttyp) {
    return CMAP_EXPLANATIONS[trap_to_defsym(ttyp)];
}
