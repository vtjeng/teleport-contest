// trap.js -- Trap allocation, map ownership, the #untrap command,
// trap-opening/closing, trapped-chest handling, and pit adjacency.
// C ref: trap.c -- t_at(), hole_destination(), maketrap(), deltrap(),
// conjoined_pits(), clear_conjoined_pits(), adj_nonconjoined_pit(),
// choose_trapnote(), set_utrap(), reset_utrap(), fill_pit(), float_down(),
// trapname(), dountrap(), could_untrap(), untrap_prob(), cnv_trap_obj(),
// into_vs_onto(), move_into_trap(), try_disarm(), reward_untrap(),
// disarm_holdingtrap(), disarm_landmine(), unsqueak_ok(),
// disarm_squeaky_board(), disarm_shooting_trap(), try_lift(),
// help_monster_out(), disarm_box(), untrap_box(), untrap(),
// openholdingtrap(), closeholdingtrap(), openfallingtrap(), chest_trap().

import {
    A_CON,
    A_DEX,
    A_LAWFUL,
    A_STR,
    A_WIS,
    ARM,
    ARROW_TRAP,
    BEAR_TRAP,
    BLINDED,
    BOLT_LIM,
    CONFUSION,
    CORR,
    DIR_180,
    DIR_ERR,
    D_BROKEN,
    D_CLOSED,
    D_ISOPEN,
    D_LOCKED,
    D_NODOOR,
    D_TRAPPED,
    DART_TRAP,
    DB_FLOOR,
    DB_ICE,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DISMOUNT_FELL,
    DOOR,
    DRAWBRIDGE_UP,
    ECMD_OK,
    ECMD_TIME,
    FAILEDUNTRAP,
    FINGER,
    FLYING,
    FORCETRAP,
    FREE_ACTION,
    FUMBLING,
    GETOBJ_DOWNPLAY,
    GETOBJ_EXCLUDE,
    GETOBJ_PROMPT,
    GETOBJ_SUGGEST,
    HALF_PHDAM,
    HALLUC,
    HALLUC_RES,
    HAND,
    HOLE,
    HVY_ENCUMBER,
    IS_AIR,
    IS_DOOR,
    IS_FURNITURE,
    IS_LAVA,
    IS_POOL,
    IS_ROOM,
    IS_WALL,
    In_sokoban,
    Is_airlevel,
    KILLED_BY_AN,
    Is_waterlevel,
    LADDER,
    LANDMINE,
    LAVAWALL,
    LEVEL_TELEP,
    LEVITATION,
    M_SEEN_ELEC,
    MAGIC_PORTAL,
    MAXULEV,
    MELT_ICE_AWAY,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_TYPE,
    NOWEBMSG,
    N_DIRS,
    PASSES_WALLS,
    PIT,
    P_BASIC,
    P_RIDING,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    ROOM,
    SCORR,
    SDOOR,
    SHOCK_RES,
    SHOPBASE,
    SPIKED_PIT,
    SQKY_BOARD,
    STAIRS,
    STATUE_TRAP,
    STONE,
    STUNNED,
    TELEP_TRAP,
    TEST_MOVE,
    TRAPDOOR,
    TRAPPED_CHEST,
    TRAPPED_DOOR,
    TIMEOUT,
    Trap_Effect_Finished,
    TT_BEARTRAP,
    TT_BURIEDBALL,
    TT_INFLOOR,
    TT_LAVA,
    TT_NONE,
    TT_PIT,
    TT_WEB,
    VIBRATING_SQUARE,
    WATER,
    WEB,
    WT_TOOMUCH_DIAGONAL,
    W_SADDLE,
    ZAP_POS,
    helpless,
    is_hole,
    is_pit,
    is_xport,
    isok,
    xdir,
    ydir,
} from './const.js';
import { is_art, ART_STING, attacks, has_magic_key, Stone_resistance } from './artifacts.js';
import { exercise, adjalign, acurr, poisoned } from './attrib.js';
import { unearth_objs } from './bury.js';
import { getdir, xytodir } from './cmd.js';
import {
    capitalizedMonsterName, monsterCommonName, mon_pmname,
    noit_Monnam, y_monnam, rndcolor,
} from './do_name.js';
import { abuse_dog } from './dog.js';
import { on_level, level_difficulty, u_on_newpos, surface } from './dungeon.js';
import { done } from './end.js';
import { can_reach_floor } from './engrave.js';
import { more_experienced, newexplevel } from './exper.js';
import { makeplural } from './fruit.js';
import { game } from './gstate.js';
import {
    near_capacity, calc_capacity, check_capacity, inv_weight, weight_cap,
    test_move, spoteffects, bad_rock,
    nomul, losehp, You_can_move_again,
    UnsupportedHeroMoveBoundaryError,
} from './hack.js';
import { sgn, upstart } from './hacklib.js';
import { stackobj, getobj, useup, delete_contents, delobj, currency } from './invent.js';
import { get_obj_location } from './light.js';
import { Is_box, stumble_on_door_mimic, ynq } from './lock.js';
import { set_malign } from './makemon.js';
import { killed, wake_nearby, wakeup } from './mon.js';
import {
    is_flyer, nohands, webmaker, sticks, bigmonst, mindless,
    touch_petrifies, unique_corpstat, poly_when_stoned,
} from './mondata.js';
import { stagger, monstseesu, monstunseesu } from './mondata.js';
import { AD_ELEC, AD_FIRE, S_HUMAN, PM_STONE_GOLEM, PM_RANGER, PM_ROGUE } from './monsters.js';
import { m_at } from './monst.js';
import { observe_object } from './o_init.js';
import {
    mksobj,
    obj_ice_effects,
    is_blade,
    objectType,
    place_object,
    sobj_at,
    weight,
} from './obj.js';
import {
    bare_artifactname, safe_qbuf, ansimpleoname, the, xnameFresh,
    donameFresh, Tobjnam,
} from './objnam.js';
import { ARROW, BEARTRAP, BOULDER, CAN_OF_GREASE, DART, LAND_MINE, POTION_CLASS, POT_OIL } from './objects.js';
import { check_here, encumber_msg } from './pickup.js';
import { make_hallucinated } from './potion.js';
import { float_vs_flight, body_part, polymon } from './polyself.js';
import { create_gas_cloud } from './region.js';
import { d, rn1, rn2, rnd, rne, rnl } from './rng.js';
import { in_rooms } from './rooms.js';
import { dismount_steed, Punished } from './steed.js';
import { P_SKILL } from './startup_skills.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { trap_to_defsym } from './symbols.js';
import { is_ice, set_levltyp } from './terrain.js';
import { spot_stop_timers } from './timeout.js';
import { dotrap, mintrap } from './trap_effects.js';
import { ttyPline } from './tty_message.js';
import { stumble_onto_mimic } from './uhitm.js';
import { note_unported } from './unported.js';
import { unblock_point, vision_recalc, cansee, canseemon } from './vision.js';
import { welded } from './wield.js';
import { bimanual } from './worn.js';
import { newsym, bot } from './display.js';
import { m_next2u } from './mhitu.js';
import { destroy_items } from './zap_destroy_items.js';
import { costly_spot, shop_keeper, inside_shop } from './shk.js';

// Env object for poisoned() calls inside chest_trap and other trap functions.
function poisonedEnv(state) {
    return {
        random: { rn2, d, rnd, rn1 },
        message: (text) => ttyPline(text, state),
        losehp: (n, knam, k_format) => losehp(n, knam, k_format, state),
        done: (how) => done(how, state),
        encumberMessage: (s) => encumber_msg(s),
    };
}

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

// C ref: trap.c conjoined_pits() (6552-6579). Check whether two adjacent
// pit traps are conjoined (linked in a direction pair). The hero must be
// entering trap2 while trapped in a pit at trap1.
export function conjoined_pits(trap2, trap1, u_entering_trap2, state = game) {
    if (!trap1 || !trap2)
        return false;
    if (!isok(trap2.tx, trap2.ty) || !isok(trap1.tx, trap1.ty)
        || !is_pit(trap2.ttyp)
        || !is_pit(trap1.ttyp)
        || (u_entering_trap2 && !(state.u.utrap && state.u.utraptype === TT_PIT)))
        return false;
    const dx = sgn(trap2.tx - trap1.tx);
    const dy = sgn(trap2.ty - trap1.ty);
    const diridx = xytodir(dx, dy);
    if (diridx !== DIR_ERR) {
        const adjidx = DIR_180(diridx);
        if ((trap1.conjoined & (1 << diridx))
            && (trap2.conjoined & (1 << adjidx)))
            return true;
    }
    return false;
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

// C ref: trap.c adj_nonconjoined_pit() (6604-6620). Checks whether the hero
// is moving from one pit to an adjacent pit that is NOT conjoined with it.
export function adj_nonconjoined_pit(adjtrap, state = game) {
    const trap_with_u = t_at(state.u.ux0, state.u.uy0, state);
    if (trap_with_u && adjtrap && state.u.utrap
        && state.u.utraptype === TT_PIT
        && is_pit(trap_with_u.ttyp) && is_pit(adjtrap.ttyp)) {
        if (xytodir(state.u.dx, state.u.dy) !== DIR_ERR)
            return true;
    }
    return false;
}

// C ref: trap.c join_adjacent_pits() (6622-6647). Dead code in C (inside
// #if 0). Recursively marks all neighbouring pit traps as conjoined. Not
// called from anywhere in the C source.
// function join_adjacent_pits(trap, state = game) { /* #if 0 in C */ }

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

// ── #untrap command and disarm subsystem (C ref: trap.c 5248-6096) ──

// C ref: decl.c c_common_strings.c_the_your, indexed by madeby_u.
const the_your = ['the', 'your'];

// Hero property helpers, local to this file. Each mirrors its youprop.h macro.
function Blind(state) {
    const v = state.u?.uprops?.[BLINDED];
    return Boolean(v?.intrinsic || v?.extrinsic) && !v?.blocked;
}
function Confusion(state) {
    return Boolean(state.u?.uprops?.[CONFUSION]?.intrinsic);
}
function Hallucination(state) {
    const h = state.u?.uprops?.[HALLUC];
    const r = state.u?.uprops?.[HALLUC_RES];
    return Boolean((h?.intrinsic || h?.extrinsic) && !h?.blocked
                   && !(r?.intrinsic || r?.extrinsic));
}
function Stunned(state) {
    return Boolean(state.u?.uprops?.[STUNNED]?.intrinsic);
}
function Fumbling(state) {
    return Boolean(state.u?.uprops?.[FUMBLING]?.intrinsic
                   || state.u?.uprops?.[FUMBLING]?.extrinsic);
}
function Passes_walls(state) {
    const p = state.u?.uprops?.[PASSES_WALLS];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
function Free_action(state) {
    const p = state.u?.uprops?.[FREE_ACTION];
    return Boolean(p?.intrinsic || p?.extrinsic);
}
// C ref: hack.h Maybe_Half_Phys(). Halves physical damage when the hero
// has Half_physical_damage from either source.
function Maybe_Half_Phys(dmg, state) {
    const halved = state.u?.uprops?.[HALF_PHDAM];
    return (halved?.intrinsic || halved?.extrinsic)
        ? Math.trunc((dmg + 1) / 2) : dmg;
}

// C ref: obj.h u_wield_art(art) => is_art(uwep, art).
function u_wield_art(art, state) {
    return is_art(state.uwep, art);
}

// C ref: trap.c dountrap() (5248-5254). Entry point for the #untrap command.
export async function dountrap(state = game) {
    if (!could_untrap(true, false, state))
        return ECMD_OK;

    return (await untrap(false, 0, 0, null, state)) ? ECMD_TIME : ECMD_OK;
}

// C ref: trap.c could_untrap() (5257-5284). Preliminary checks for dountrap();
// also used for autounlock.
export function could_untrap(verbosely, check_floor, state = game) {
    const u = state.u;
    let buf = '';

    if (near_capacity(state) >= HVY_ENCUMBER) {
        buf = "You're too strained to do that.";
    } else if ((nohands(state.youmonst?.data)
                && !webmaker(state.youmonst?.data))
               || !state.youmonst?.data?.mmove) {
        buf = 'And just how do you expect to do that?';
    } else if (u.ustuck && sticks(state.youmonst?.data)) {
        buf = `You'll have to let go of ${monsterCommonName(u.ustuck, state)} first.`;
    } else if (u.ustuck
               || (welded(state.uwep, state) && bimanual(state.uwep, state))) {
        buf = `Your ${makeplural(body_part(HAND, state.youmonst))} seem to be too busy for that.`;
    } else if (check_floor && !can_reach_floor(false, state)) {
        buf = `You can't reach the ${surface(u.ux, u.uy, state)}.`;
    }
    if (buf) {
        if (verbosely) ttyPline(buf, state);
        return 0;
    }
    return 1;
}

// C ref: trap.c untrap_prob() (5288-5337). Returns 0 for success, non-0 for
// failure. Probability of disabling a trap; Helge Hafting.
function untrap_prob(ttmp, state = game) {
    let chance = 3;
    const u = state.u;
    const uwep = state.uwep;
    const uswapwep = state.uswapwep;

    /* non-spiders are less adept at dealing with webs */
    if (ttmp.ttyp === WEB) {
        const wep = (uwep && is_blade(uwep)) ? uwep
            : (uswapwep && u.twoweap && is_blade(uswapwep))
                ? uswapwep : null;

        if (wep && !m_at(ttmp.tx, ttmp.ty, state)) {
            if (u_wield_art(ART_STING, state) || attacks(AD_FIRE, wep))
                chance = 1;
            /* else chance stays 3 */
        } else if (!webmaker(state.youmonst?.data)) {
            chance = 7; /* 5.0: used to be 30 */
        }
    }
    if (Confusion(state) || Hallucination(state))
        chance++;
    if (Blind(state))
        chance++;
    if (Stunned(state))
        chance += 2;
    if (Fumbling(state))
        chance *= 2;
    /* Your own traps are better known than others. */
    if (ttmp.madeby_u)
        chance--;
    if (state.urole?.mnum === PM_RANGER && ttmp.ttyp === BEAR_TRAP
        && chance <= 3)
        return 0; /* always succeeds */
    if (state.urole?.mnum === PM_ROGUE) {
        if (rn2(2 * MAXULEV) < u.ulevel)
            chance--;
        if (u.uhave?.questart && chance > 1)
            chance--;
    } else if (state.urole?.mnum === PM_RANGER && chance > 1) {
        chance--;
    }
    if (chance < 1) chance = 1;
    return rn2(chance);
}

// C ref: trap.c cnv_trap_obj() (5340-5371). Replace trap with object(s);
// Helge Hafting.
export function cnv_trap_obj(otyp, cnt, ttmp, bury_it, state = game) {
    const otmp = mksobj(otyp, true, false, { state });
    otmp.quan = cnt;
    otmp.owt = weight(otmp, { state });
    /* Only dart traps are capable of being poisonous */
    if (otyp !== DART) otmp.opoisoned = 0;
    place_object(otmp, ttmp.tx, ttmp.ty, { state });
    if (bury_it) {
        // C: bury_an_obj(otmp, NULL). bury_an_obj is ported in js/bury.js but
        // the bury-then-unearth flow is rarely exercised through this path.
        note_unported('dig.c bury_an_obj via cnv_trap_obj');
    } else {
        /* Sell your own traps only... */
        if (ttmp.madeby_u) {
            // C: sellobj(otmp, ttmp->tx, ttmp->ty). shk.c, not ported.
            note_unported('shk.c sellobj');
        }
        stackobj(otmp, { state });
    }
    newsym(ttmp.tx, ttmp.ty);
    if (state.u.utrap && state.u.ux === ttmp.tx && state.u.uy === ttmp.ty)
        reset_utrap(true, state);
    const mtmp = m_at(ttmp.tx, ttmp.ty, state);
    if (mtmp && mtmp.mtrapped) mtmp.mtrapped = 0;
    deltrap(ttmp, state);
}

// C ref: trap.c into_vs_onto() (5374-5389). Whether moving to a trap location
// is moving "into" the trap or "onto" it.
export function into_vs_onto(traptype) {
    switch (traptype) {
    case BEAR_TRAP:
    case PIT:
    case SPIKED_PIT:
    case HOLE:
    case TELEP_TRAP:
    case LEVEL_TELEP:
    case MAGIC_PORTAL:
    case WEB:
        return true;
    }
    return false;
}

// C ref: trap.c move_into_trap() (5392-5437). While attempting to disarm an
// adjacent trap, we've fallen into it.
async function move_into_trap(ttmp, state = game) {
    const u = state.u;
    const x = ttmp.tx;
    const y = ttmp.ty;

    if (await test_move(u.ux, u.uy, sgn(x - u.ux), sgn(y - u.uy),
        TEST_MOVE, state)
        && !Punished(state) /* drag_ball from ball.c is not ported */
    ) {
        /* move hero and update map */
        u.ux0 = u.ux;
        u.uy0 = u.uy;
        u_on_newpos(x, y, state);
        u.umoved = true;
        newsym(u.ux0, u.uy0);
        vision_recalc(1, { state });
        note_unported('dog.c check_leash');
        // C: if (Punished) move_bc(0, bc, bx, by, cx, cy);
        // Punished is false here because of the guard above.
        ttmp.tseen = 0; /* hack for check_here() */
        state.iflags ??= {};
        state.iflags.failing_untrap = (state.iflags.failing_untrap ?? 0) + 1;
        await spoteffects(true, state); /* pickup() + dotrap() */
        state.iflags.failing_untrap--;
        const ttmp2 = t_at(u.ux, u.uy, state);
        if (ttmp2) ttmp2.tseen = 1;
        exercise(A_WIS, false, state);
    } else {
        if (Punished(state)) {
            // drag_ball() from ball.c is not ported; the hero does not move.
            note_unported('ball.c drag_ball');
        }
        await ttyPline(`Fortunately, you don't move ${into_vs_onto(ttmp.ttyp) ? 'into' : 'onto'} it.`, state);
    }
}

// C ref: trap.c try_disarm() (5440-5527). 0: doesn't even try; 1: tries and
// fails; 2: succeeds.
async function try_disarm(ttmp, force_failure, state = game) {
    const mtmp = m_at(ttmp.tx, ttmp.ty, state);
    const ttype = ttmp.ttyp;
    const u = state.u;
    const under_u = (!u.dx && !u.dy);
    const holdingtrap = (ttype === BEAR_TRAP || ttype === WEB);

    /* Test for monster first, monsters are displayed instead of trap. */
    if (mtmp && (!mtmp.mtrapped || !holdingtrap)) {
        await ttyPline(`${capitalizedMonsterName(mtmp, state)} is in the way.`, state);
        return 0;
    }
    /* We might be forced to move onto the trap's location. */
    if (sobj_at(BOULDER, ttmp.tx, ttmp.ty, state) && !Passes_walls(state)
        && !under_u) {
        await ttyPline('There is a boulder in your way.', state);
        return 0;
    }
    /* duplicate tight-space checks from test_move */
    if (u.dx && u.dy && bad_rock(state.youmonst?.data, u.ux, ttmp.ty, state)
        && bad_rock(state.youmonst?.data, ttmp.tx, u.uy, state)) {
        if ((state.invent
             && (inv_weight(state) + weight_cap(state)
                 > WT_TOOMUCH_DIAGONAL))
            || bigmonst(state.youmonst?.data)) {
            await ttyPline(`You are unable to reach the ${trapname(ttype)}!`, state);
            return 0;
        }
    }
    /* untrappable traps are located on the ground. */
    if (!can_reach_floor(under_u, state)) {
        if (u.usteed && P_SKILL(P_RIDING, state) < P_BASIC) {
            // C: rider_cant_reach(), steed.c, not ported.
            note_unported('steed.c rider_cant_reach');
        } else {
            await ttyPline(`You are unable to reach the ${trapname(ttype)}!`, state);
        }
        return 0;
    }

    /* Will our hero succeed? */
    if (force_failure || untrap_prob(ttmp, state)) {
        if (rnl(5)) {
            await ttyPline('Whoops...', state);
            if (mtmp) { /* must be a trap that holds monsters */
                if (ttype === BEAR_TRAP) {
                    if (mtmp.mtame) abuse_dog(mtmp, state);
                    mtmp.mhp -= rnd(4);
                    if (mtmp.mhp < 1) /* DEADMONSTER */
                        await killed(mtmp, state);
                } else if (ttype === WEB) {
                    let ttmp2 = t_at(u.ux, u.uy, state);

                    if (!webmaker(state.youmonst?.data)
                        && !rn2(3)
                        && (ttmp2
                            ? (ttmp2.ttyp === WEB)
                            : (ttmp2 = maketrap(u.ux, u.uy, WEB,
                                { state })) !== null)) {
                        await ttyPline("The web sticks to you.  You're caught too!", state);
                        await dotrap(ttmp2, NOWEBMSG, state);
                        if (u.usteed && u.utrap) {
                            /* you, not steed, are trapped */
                            await dismount_steed(DISMOUNT_FELL, state);
                        }
                    }
                    if (mtmp.mtrapped)
                        await ttyPline(`${capitalizedMonsterName(mtmp, state)} remains entangled.`, state);
                }
            } else if (under_u) {
                await dotrap(ttmp, FAILEDUNTRAP, state);
            } else {
                await move_into_trap(ttmp, state);
            }
        } else {
            const whose = ttmp.madeby_u ? 'Your' : under_u ? 'This' : 'That';
            const verb = (ttype === WEB) ? 'remove' : 'disarm';
            await ttyPline(`${whose} ${trapname(ttype)} is difficult to ${verb}.`, state);
        }
        return 1;
    }
    return 2;
}

// C ref: trap.c reward_untrap() (5529-5548).
async function reward_untrap(ttmp, mtmp, state = game) {
    if (!ttmp.madeby_u) {
        if (rnl(10) < 8 && !mtmp.mpeaceful && !helpless(mtmp)
            && !mtmp.mfrozen && !mindless(mtmp.data)
            && !unique_corpstat(mtmp.data)
            && mtmp.data?.mlet !== S_HUMAN) {
            mtmp.mpeaceful = 1;
            set_malign(mtmp, state); /* reset alignment */
            await ttyPline(`${capitalizedMonsterName(mtmp, state)} is grateful.`, state);
        }
        /* Helping someone out of a trap is a nice thing to do. */
        if (!rn2(3) && !rnl(8) && state.u.ualign?.type === A_LAWFUL) {
            adjalign(1, state);
            await ttyPline('You feel that you did the right thing.', state);
        }
    }
}

// C ref: trap.c disarm_holdingtrap() (5552-5591). Help a monster out of a bear
// trap or web, or if no monster is present, disarm a bear trap or destroy a web.
async function disarm_holdingtrap(ttmp, state = game) {
    const which = the_your[ttmp.madeby_u ? 1 : 0];
    const fails = await try_disarm(ttmp, false, state);

    if (fails < 2)
        return fails;

    /* ok, disarm it. */
    const mtmp = m_at(ttmp.tx, ttmp.ty, state);
    if (mtmp) {
        mtmp.mtrapped = 0;
        await ttyPline(`You extract ${monsterCommonName(mtmp, state)} from ${which} ${(ttmp.ttyp === BEAR_TRAP) ? 'bear trap' : 'web'}.`, state);
        await reward_untrap(ttmp, mtmp, state);
    } else if (ttmp.ttyp === BEAR_TRAP) {
        await ttyPline(`You disarm ${which} bear trap.`, state);
        cnv_trap_obj(BEARTRAP, 1, ttmp, false, state);
    } else if (ttmp.ttyp === WEB) {
        const uwep = state.uwep;
        const uswapwep = state.uswapwep;
        const wep = (uwep && is_blade(uwep)) ? uwep
            : (uswapwep && state.u.twoweap && is_blade(uswapwep))
                ? uswapwep : null;

        if (wep && wep.oartifact
            && (u_wield_art(ART_STING, state) || attacks(AD_FIRE, wep))) {
            const verb = u_wield_art(ART_STING, state) ? 'cuts' : 'burns';
            await ttyPline(`${bare_artifactname(uwep)} ${verb} through ${which} web!`, state);
        } else if (wep) {
            await ttyPline(`You cut through ${which} web.`, state);
        } else {
            await ttyPline(`You succeed in removing ${which} web.`, state);
        }
        deltrap(ttmp, state);
    }
    newsym(state.u.ux + state.u.dx, state.u.uy + state.u.dy);
    return 1;
}

// C ref: trap.c disarm_landmine() (5593-5603). Helge Hafting.
async function disarm_landmine(ttmp, state = game) {
    const fails = await try_disarm(ttmp, false, state);
    if (fails < 2) return fails;
    await ttyPline(`You disarm ${the_your[ttmp.madeby_u ? 1 : 0]} land mine.`, state);
    cnv_trap_obj(LAND_MINE, 1, ttmp, false, state);
    return 1;
}

// C ref: trap.c unsqueak_ok() (5606-5626). getobj callback for object to
// disarm a squeaky board with.
function unsqueak_ok(obj, state = game) {
    if (!obj) return GETOBJ_EXCLUDE;
    if (obj.otyp === CAN_OF_GREASE) return GETOBJ_SUGGEST;
    if (obj.otyp === POT_OIL && obj.dknown
        && objectType(POT_OIL, state)?.oc_name_known) {
        return GETOBJ_SUGGEST;
    }
    if (obj.oclass === POTION_CLASS) return GETOBJ_DOWNPLAY;
    return GETOBJ_EXCLUDE;
}

// C ref: trap.c disarm_squeaky_board() (5629-5660).
async function disarm_squeaky_board(ttmp, state = game) {
    const obj = await getobj('untrap with', unsqueak_ok, GETOBJ_PROMPT, state);
    if (!obj) return 0;

    const bad_tool = (obj.cursed
        || ((obj.otyp !== POT_OIL || obj.lamplit)
            && (obj.otyp !== CAN_OF_GREASE || !obj.spe)));
    const fails = await try_disarm(ttmp, bad_tool, state);
    if (fails < 2) return fails;

    /* successfully used oil or grease to fix squeaky board */
    if (obj.otyp === CAN_OF_GREASE) {
        // C: consume_obj_charge(obj, TRUE). invent.c, not ported.
        note_unported('invent.c consume_obj_charge');
    } else {
        useup(obj, state); /* oil */
        // C: makeknown(POT_OIL) => discover_object(POT_OIL, true, true, true).
        note_unported('o_init.c makeknown via discover_object');
    }
    await ttyPline('You repair the squeaky board.', state);
    deltrap(ttmp, state);
    newsym(state.u.ux + state.u.dx, state.u.uy + state.u.dy);
    more_experienced(1, 5, state);
    newexplevel(state);
    return 1;
}

// C ref: trap.c disarm_shooting_trap() (5663-5673). Removes traps that shoot
// arrows, darts, etc.
async function disarm_shooting_trap(ttmp, otyp, state = game) {
    const fails = await try_disarm(ttmp, false, state);
    if (fails < 2) return fails;
    await ttyPline(`You disarm ${the_your[ttmp.madeby_u ? 1 : 0]} trap.`, state);
    cnv_trap_obj(otyp, 50 - rnl(50), ttmp, false, state);
    return 1;
}

// C ref: trap.c try_lift() (5676-5696). Trying to #untrap a monster from a
// pit; is the weight too heavy?
async function try_lift(mtmp, ttmp, xtra_wt, stuff, state = game) {
    if (calc_capacity(xtra_wt, state) >= HVY_ENCUMBER) {
        const reason = stuff ? 'carrying too much' : 'too heavy';
        await ttyPline(`${capitalizedMonsterName(mtmp, state)} is ${reason} for you to lift.`, state);
        if (!ttmp.madeby_u && !mtmp.mpeaceful && mtmp.mcanmove
            && !mindless(mtmp.data) && mtmp.data?.mlet !== S_HUMAN
            && rnl(10) < 3) {
            mtmp.mpeaceful = 1;
            set_malign(mtmp, state);
            await ttyPline(`${capitalizedMonsterName(mtmp, state)} thinks it was nice of you to try.`, state);
        }
        return 0;
    }
    return 1;
}

// C ref: trap.c help_monster_out() (5699-5791). Help trapped monster out of a
// (spiked) pit.
async function help_monster_out(mtmp, ttmp, state = game) {
    const u = state.u;

    if (!mtmp.mtrapped) {
        await ttyPline(`${capitalizedMonsterName(mtmp, state)} isn't trapped.`, state);
        return 0;
    }
    /* Do you have the necessary capacity to lift anything? */
    if (await check_capacity(null, state))
        return 1;

    /* Will our hero succeed? */
    const uprob = untrap_prob(ttmp, state);
    if (uprob !== 0 && !helpless(mtmp)) {
        await ttyPline(`You try to reach out your ${makeplural(body_part(ARM, state.youmonst))}, but ${monsterCommonName(mtmp, state)} backs away skeptically.`, state);
        return 1;
    }

    /* is it a cockatrice?... */
    if (touch_petrifies(mtmp.data) && !state.uarmg
        && !Stone_resistance(state)) {
        const mtmp_pmname = mon_pmname(mtmp, state);

        await ttyPline(`You grab the trapped ${mtmp_pmname} using your bare ${makeplural(body_part(HAND, state.youmonst))}.`, state);

        if (poly_when_stoned(state.youmonst?.data)
            && await polymon(PM_STONE_GOLEM, state)) {
            // C: display_nhwindow(WIN_MESSAGE, FALSE). Not ported.
            note_unported('window.c display_nhwindow');
        } else {
            // C: instapetrify(kbuf). Not ported.
            note_unported('uhitm.c instapetrify');
            return 1;
        }
    }
    /* need to do cockatrice check first if sleeping or paralyzed */
    if (uprob) {
        await ttyPline(`You try to grab ${monsterCommonName(mtmp, state)}, but cannot get a firm grasp.`, state);
        if (mtmp.msleeping) {
            mtmp.msleeping = 0;
            await ttyPline(`${capitalizedMonsterName(mtmp, state)} awakens.`, state);
        }
        return 1;
    }

    await ttyPline(`You reach out your ${makeplural(body_part(ARM, state.youmonst))} and grab ${monsterCommonName(mtmp, state)}.`, state);

    if (mtmp.msleeping) {
        mtmp.msleeping = 0;
        await ttyPline(`${capitalizedMonsterName(mtmp, state)} awakens.`, state);
    } else if (mtmp.mfrozen && !rn2(mtmp.mfrozen)) {
        mtmp.mcanmove = 1;
        mtmp.mfrozen = 0;
        await ttyPline(`${capitalizedMonsterName(mtmp, state)} stirs.`, state);
    }

    /* is the monster too heavy? */
    let xtra_wt = mtmp.data.cwt;
    if (!(await try_lift(mtmp, ttmp, xtra_wt, false, state)))
        return 1;

    /* monster without its inventory isn't too heavy; if it carries
       anything, include that minvent weight and check again */
    if (mtmp.minvent) {
        for (let otmp = mtmp.minvent; otmp; otmp = otmp.nobj)
            xtra_wt += otmp.owt;
        if (!(await try_lift(mtmp, ttmp, xtra_wt, true, state)))
            return 1;
    }

    await ttyPline(`You pull ${monsterCommonName(mtmp, state)} out of the pit.`, state);
    mtmp.mtrapped = 0;
    await reward_untrap(ttmp, mtmp, state);
    fill_pit(mtmp.mx, mtmp.my, state);
    return 1;
}

// C ref: trap.c disarm_box() (5793-5817).
async function disarm_box(box, force, confused, state = game) {
    if (box.otrapped) {
        const ch = acurr(state, A_DEX) + state.u.ulevel;
        let effective_ch = ch;
        if (state.urole?.mnum === PM_ROGUE) effective_ch *= 2;
        if (!force && (confused || Fumbling(state)
                       || rnd(75 + Math.trunc(level_difficulty(state) / 2))
                          > effective_ch)) {
            await chest_trap(box, FINGER, true, state);
            /* 'box' might be gone now */
        } else {
            await ttyPline('You disarm it!', state);
            box.otrapped = 0;
            box.tknown = 1;
            more_experienced(8, 0, state);
            newexplevel(state);
        }
        exercise(A_DEX, true, state);
    } else {
        await ttyPline(`That ${xnameFresh(box, state)} was not trapped.`, state);
        box.tknown = 0;
    }
}

// C ref: trap.c untrap_box() (5821-5844). Check a particular container for a
// trap and optionally disarm it.
async function untrap_box(box, force, confused, state = game) {
    if ((box.otrapped
         && (force || (!confused && rn2(MAXULEV + 1 - state.u.ulevel) < 10)))
        || box.tknown
        || (!force && confused && !rn2(3))) {
        if (!(box.tknown && box.dknown))
            await ttyPline(`You find a trap on ${the(xnameFresh(box, state))}!`, state);
        else
            await ttyPline(`There's a trap on ${the(xnameFresh(box, state))}.`, state);
        box.tknown = 1;
        observe_object(box, state);
        if (!confused) exercise(A_WIS, true, state);

        if (await ynq('Disarm it?', state) === 'y')
            await disarm_box(box, force, confused, state);
    } else {
        await ttyPline(`You find no traps on ${the(xnameFresh(box, state))}.`, state);
    }
}

// C ref: trap.c untrap() (5848-6096). Hero is able to attempt untrap, so do so.
async function untrap(force, rx, ry, container, state = game) {
    const u = state.u;
    let x, y;
    let ttmp;
    const confused = Confusion(state) || Hallucination(state);
    let trap_skipped = false;
    let autounlock_door = false;
    let boxcnt = 0;

    /* 'force' is true for #invoke; if carrying MKoT, make it be true
       for #untrap or autounlock */
    if (!force && has_magic_key(state.youmonst, state))
        force = true;

    if (!rx && !container) {
        /* usual case */
        if (!await getdir(null, state))
            return 0;
        x = u.ux + u.dx;
        y = u.uy + u.dy;
    } else {
        /* autounlock's untrap; skip most prompting */
        if (container) {
            await untrap_box(container, force, confused, state);
            return 1;
        }
        /* levl[rx][ry] is a locked or trapped door */
        x = rx;
        y = ry;
        autounlock_door = true;
    }
    if (!isok(x, y)) {
        await ttyPline('The perils lurking there are beyond your grasp.', state);
        return 0;
    }

    ttmp = t_at(x, y, state);
    if (ttmp && !ttmp.tseen) ttmp = null;
    const trapdescr = ttmp ? trapname(ttmp.ttyp) : null;
    const here = (u.ux === x && u.uy === y);

    if (here) { /* are there one or more containers here? */
        const objects_at = state.level?.at(x, y)?.objects ?? [];
        for (const otmp of objects_at) {
            if (Is_box(otmp)) {
                if (++boxcnt > 1) break;
            }
        }
    }

    let deal_with_floor_trap = can_reach_floor(false, state);
    if (autounlock_door) {
        ; /* skip a bunch */
    } else if (!deal_with_floor_trap) {
        let the_trap = '';
        if (ttmp) the_trap += `a ${trapdescr}`;
        if (ttmp && boxcnt) the_trap += ' and ';
        if (boxcnt) the_trap += (boxcnt === 1) ? 'a container' : 'containers';
        const useplural = ((ttmp && boxcnt > 0) || boxcnt > 1);
        if (ttmp || boxcnt) {
            await ttyPline(`There ${useplural ? 'are' : 'is'} ${the_trap} ${here ? 'here' : 'there'} but you can't reach ${useplural ? 'them' : 'it'}${u.usteed ? ' while mounted' : ''}.`, state);
        }
        trap_skipped = (ttmp !== null);
    } else { /* deal_with_floor_trap */

        if (ttmp) {
            const the_trap = the(trapdescr);
            if (boxcnt) {
                if (is_pit(ttmp.ttyp)) {
                    const suffix = u.utrap
                        ? " that you're stuck in"
                        : ' while standing on the edge of it';
                    await ttyPline(`You can't do much about ${the_trap}${suffix}.`, state);
                    trap_skipped = true;
                    deal_with_floor_trap = false;
                } else {
                    const containerDesc = (boxcnt === 1)
                        ? 'is a container' : 'are containers';
                    const verb = (ttmp.ttyp === WEB) ? 'Remove' : 'Disarm';
                    const qbuf = `There ${containerDesc} and a ${trapdescr} here.  ${verb} ${the_trap}?`;
                    const answer = await ynq(qbuf, state);
                    if (answer === 'q') return 0;
                    if (answer === 'n') {
                        trap_skipped = true;
                        deal_with_floor_trap = false;
                    }
                }
            }
            if (deal_with_floor_trap) {
                if (u.utrap) {
                    const suffix = (u.ux === x && u.uy === y)
                        ? ' in it' : '';
                    await ttyPline(`You cannot deal with ${the_trap} while trapped${suffix}!`, state);
                    return 1;
                }
                const mtmp = m_at(x, y, state);
                if (mtmp
                    && (M_AP_TYPE(mtmp) === M_AP_FURNITURE
                        || M_AP_TYPE(mtmp) === M_AP_OBJECT)) {
                    await stumble_onto_mimic(mtmp, state);
                    return 1;
                }
                switch (ttmp.ttyp) {
                case BEAR_TRAP:
                case WEB:
                    return await disarm_holdingtrap(ttmp, state);
                case LANDMINE:
                    return await disarm_landmine(ttmp, state);
                case SQKY_BOARD:
                    return await disarm_squeaky_board(ttmp, state);
                case DART_TRAP:
                    return await disarm_shooting_trap(ttmp, DART, state);
                case ARROW_TRAP:
                    return await disarm_shooting_trap(ttmp, ARROW, state);
                case PIT:
                case SPIKED_PIT:
                    if (here) {
                        await ttyPline('You are already on the edge of the pit.', state);
                        return 0;
                    }
                    if (!mtmp) {
                        await ttyPline('Try filling the pit instead.', state);
                        return 0;
                    }
                    return await help_monster_out(mtmp, ttmp, state);
                default:
                    await ttyPline(`You cannot disable ${!here ? 'that' : 'this'} trap.`, state);
                    return 0;
                }
            }
        } /* end if ttmp */

        if (boxcnt) {
            const objects_at = state.level?.at(x, y)?.objects ?? [];
            for (const otmp of objects_at) {
                if (!Is_box(otmp)) continue;
                let qbuf;
                if (otmp.tknown && otmp.dknown) {
                    qbuf = safe_qbuf('Disarm this ', null, otmp,
                        xnameFresh, ansimpleoname, 'a box', state);
                } else {
                    qbuf = safe_qbuf('There is ',
                        ' here.  Check it for traps?', otmp,
                        donameFresh, ansimpleoname, 'a box', state);
                }
                const answer = await ynq(qbuf, state);
                if (answer === 'q') return 0;
                if (answer === 'y') {
                    if (otmp.tknown && otmp.dknown)
                        await disarm_box(otmp, force, confused, state);
                    else
                        await untrap_box(otmp, force, confused, state);
                    return 1; /* even for 'no' at "Disarm it?" prompt */
                }
                /* 'n' => continue to next box */
            }
            await ttyPline('There are no other chests or boxes here.', state);
        }

        if (stumble_on_door_mimic(x, y, state))
            return 1;
    } /* deal_with_floor_trap */

    /*
     * Doors can be manipulated even while levitating/unskilled riding.
     */
    const loc = state.level?.at(x, y);
    if (!IS_DOOR(loc?.typ)) {
        if (!trap_skipped)
            await ttyPline('You know of no traps there.', state);
        return 0;
    }

    const doormask = loc?.flags || loc?.doormask || 0;
    switch (doormask) {
    case D_NODOOR:
        await ttyPline(`You ${Blind(state) ? 'feel' : 'see'} no door there.`, state);
        return 0;
    case D_ISOPEN:
        await ttyPline('This door is safely open.', state);
        return 0;
    case D_BROKEN:
        await ttyPline('This door is broken.', state);
        return 0;
    }

    if (((doormask & D_TRAPPED) !== 0
         && (force || (!confused && rn2(MAXULEV - u.ulevel + 11) < 10)))
        || (!force && confused && !rn2(3))) {
        await ttyPline('You find a trap on the door!', state);
        exercise(A_WIS, true, state);
        if (await ynq('Disarm it?', state) !== 'y')
            return 1;
        if (doormask & D_TRAPPED) {
            const ch = 15 + (state.urole?.mnum === PM_ROGUE
                ? u.ulevel * 3 : u.ulevel);
            exercise(A_DEX, true, state);
            if (!force && (confused || Fumbling(state)
                           || rnd(75 + Math.trunc(level_difficulty(state) / 2))
                              > ch)) {
                await ttyPline('You set it off!', state);
                // C: b_trapped("door", FINGER). trap.c, not ported.
                note_unported('trap.c b_trapped');
                loc.flags = D_NODOOR;
                loc.doormask = D_NODOOR;
                unblock_point(x, y, state);
                newsym(x, y);
                if (in_rooms(x, y, SHOPBASE, state).length > 0) {
                    // C: add_damage(x, y, 0L). shk.c, not ported.
                    note_unported('shk.c add_damage');
                }
            } else {
                await ttyPline('You disarm it!', state);
                loc.flags = doormask & ~D_TRAPPED;
                loc.doormask = doormask & ~D_TRAPPED;
                more_experienced(8, 0, state);
                newexplevel(state);
            }
        } else {
            await ttyPline('This door was not trapped.', state);
        }
        return 1;
    } else {
        await ttyPline('You find no traps on the door.', state);
        return 1;
    }
}

// -----------------------------------------------------------------------
// Trap opening/closing (zap/detect/steal callers)
// -----------------------------------------------------------------------

// C ref: trap.c openholdingtrap() (6101-6209). Opens a bear trap or web
// holding a monster (or hero). Called by zap.c (knock/lock spells),
// steal.c, and detect.c.
export async function openholdingtrap(mon, state = game) {
    const u = state.u;
    let noticed = false;

    if (!mon)
        return { result: false, noticed };
    let ishero = (mon === state.youmonst);
    if (mon === u.usteed)
        ishero = true;

    let t = t_at(ishero ? u.ux : mon.mx, ishero ? u.uy : mon.my, state);

    if (ishero && u.utrap) {
        // All u.utraptype values are holding traps.
        // There might not be any trap at hero's spot for tt_buriedball;
        // conversely, there might be an unrelated trap at that spot.
        let which;
        let trapdescr;
        if (!t) {
            // Fallback dummy: nonNull, tseen and madeby_u are 0.
            t = { tx: u.ux, ty: u.uy, ttyp: 0, tseen: 0, madeby_u: 0,
                conjoined: 0, ntrap: null };
        }
        which = the_your[(!t || !t.tseen || !t.madeby_u) ? 0 : 1];

        switch (u.utraptype) {
        case TT_LAVA:
            trapdescr = 'molten lava';
            break;
        case TT_INFLOOR:
            trapdescr = 'ground';
            break;
        case TT_BURIEDBALL:
            trapdescr = 'your anchor';
            which = '';
            break;
        case TT_BEARTRAP:
        case TT_PIT:
        case TT_WEB:
            trapdescr = trapname(
                u.utraptype === TT_WEB ? WEB
                : u.utraptype === TT_PIT ? PIT
                : BEAR_TRAP,
            );
            break;
        default:
            trapdescr = 'trap';
            break;
        }

        if (!which) {
            which = t.tseen
                ? the_your[t.madeby_u ? 1 : 0]
                : 'aeiouAEIOU'.includes(trapdescr[0]) ? 'an' : 'a';
        }
        if (which) which = `${which} `;

        if (!u.utrap)
            return { result: false, noticed };
        noticed = true;
        let buf;
        if (!u.usteed)
            buf = 'You are';
        else if (u.utraptype === TT_BURIEDBALL)
            buf = `You and ${y_monnam(u.usteed, state)} are`;
        else
            buf = `${noit_Monnam(u.usteed, state)} is`;
        await ttyPline(`${buf} released from ${which}${trapdescr}.`, state);
        state.vision_full_recalc = 1;
        reset_utrap(true, state);
        if (state.vision_full_recalc)
            vision_recalc(0, { state });
    } else {
        // Non-hero path.
        if (!t || (t.ttyp !== BEAR_TRAP && t.ttyp !== WEB))
            return { result: false, noticed };
        const trapdescr = trapname(t.ttyp);

        let which;
        if (!which) {
            which = t.tseen
                ? the_your[t.madeby_u ? 1 : 0]
                : 'aeiouAEIOU'.includes(trapdescr[0]) ? 'an' : 'a';
        }
        if (which) which = `${which} `;

        if (!mon.mtrapped)
            return { result: false, noticed };
        mon.mtrapped = 0;
        if (canspotmon(mon, state)) {
            noticed = true;
            await ttyPline(
                `${capitalizedMonsterName(mon, state)} is released from ${which}${trapdescr}.`,
                state,
            );
        } else if (cansee(t.tx, t.ty, state) && t.tseen) {
            noticed = true;
            if (t.ttyp === WEB) {
                await ttyPline(
                    `Something is released from ${which}${trapdescr}.`,
                    state,
                );
            } else {
                // BEAR_TRAP
                await ttyPline(
                    `${upstart(`${which}${trapdescr}`)} opens.`,
                    state,
                );
            }
        }
        // Might pacify monster if adjacent.
        if (rn2(2) && m_next2u(mon, state))
            await reward_untrap(t, mon, state);
    }
    return { result: true, noticed };
}

// C ref: trap.c closeholdingtrap() (6210-6251). For magic locking; returns
// true if the targeted monster (which might be the hero) gets hit by a trap.
export async function closeholdingtrap(mon, state = game) {
    const u = state.u;
    let noticed = false;

    if (!mon)
        return { result: false, noticed };
    let ishero = (mon === state.youmonst);
    if (mon === u.usteed)
        ishero = true;
    const t = t_at(ishero ? u.ux : mon.mx, ishero ? u.uy : mon.my, state);
    if (!t || (t.ttyp !== BEAR_TRAP && t.ttyp !== WEB))
        return { result: false, noticed };

    let result;
    if (ishero) {
        if (u.utrap)
            return { result: false, noticed };
        noticed = true;
        let dotrapflags = FORCETRAP;
        if (u.usteed)
            dotrapflags |= NOWEBMSG;
        await dotrap(t, dotrapflags | FORCETRAP, state);
        result = (u.utrap !== 0);
    } else {
        if (mon.mtrapped)
            return { result: false, noticed };
        noticed = cansee(t.tx, t.ty, state) || canspotmon(mon, state);
        result = ((await mintrap(mon, FORCETRAP, { state })) !== Trap_Effect_Finished);
    }
    return { result, noticed };
}

// C ref: trap.c openfallingtrap() (6252-6293). For magic unlocking; returns
// true if the targeted monster gets hit by a falling trap.
export async function openfallingtrap(mon, trapdoor_only, state = game) {
    const u = state.u;
    let noticed = false;

    if (!mon)
        return { result: false, noticed };
    let ishero = (mon === state.youmonst);
    if (mon === u.usteed)
        ishero = true;
    const t = t_at(ishero ? u.ux : mon.mx, ishero ? u.uy : mon.my, state);
    // No trap or not a falling trap.
    if (!t || ((t.ttyp !== TRAPDOOR && t.ttyp !== ROCKTRAP)
               && (trapdoor_only || (t.ttyp !== HOLE && !is_pit(t.ttyp)))))
        return { result: false, noticed };

    let result;
    if (ishero) {
        if (u.utrap)
            return { result: false, noticed };
        noticed = true;
        await dotrap(t, FORCETRAP, state);
        result = (u.utrap !== 0);
    } else {
        if (mon.mtrapped)
            return { result: false, noticed };
        noticed = cansee(t.tx, t.ty, state) || canspotmon(mon, state);
        await wakeup(mon, true, { state });
        result = ((await mintrap(mon, FORCETRAP, { state })) !== Trap_Effect_Finished);
    }
    return { result, noticed };
}

// -----------------------------------------------------------------------
// Trapped chest
// -----------------------------------------------------------------------

// C ref: trap.c blindgas[] (81-83). Color descriptions for the gas cloud
// when the hero is blind. ROLL_FROM(blindgas) = blindgas[rn2(6)].
const blindgas = Object.freeze([
    'humid', 'odorless', 'pungent', 'chilling', 'acrid', 'biting',
]);

// Local helper: Shock_resistance. C ref: youprop.h Shock_resistance.
function Shock_resistance(state) {
    const p = state.u?.uprops?.[SHOCK_RES];
    return Boolean(p?.intrinsic || p?.extrinsic);
}

// Local helper: Halluc_resistance. C ref: youprop.h Halluc_resistance.
function Halluc_resistance(state) {
    const p = state.u?.uprops?.[HALLUC_RES];
    return Boolean(p?.intrinsic || p?.extrinsic);
}

// Local helper: canspotmon. C ref: display.h canspotmon().
// Full version is canseemon || sensemon; sensemon is not ported.
function canspotmon(mon, state) {
    return canseemon(mon, state);
}

// C ref: trap.c chest_trap() (6294-6501). Handles a trapped chest:
// explosions, poison gas, paralysis, etc. Called from disarm_box (trap.c)
// and use_container/tipcontainer_checks (pickup.c). Returns true if the
// chest is destroyed, false if it remains.
export async function chest_trap(obj, bodypart, disarm, state = game) {
    const u = state.u;
    const Luck = (u.uluck ?? 0) + (u.moreluck ?? 0);

    const loc = get_obj_location(obj, 0, state);
    if (loc) {
        obj.ox = loc.x;
        obj.oy = loc.y;
    }

    obj.tknown = 0;
    obj.otrapped = 0; // trap is one-shot

    await ttyPline(
        disarm ? 'You set it off!' : 'You trigger a trap!',
        state,
    );
    // C: display_nhwindow(WIN_MESSAGE, FALSE) -- message display flush.
    // The ttyPline above handles the message.

    if (Luck > -13 && rn2(13 + Luck) > 7) {
        // Saved by luck.
        let msg;
        switch (rn2(13)) {
        case 12: case 11:
            msg = 'explosive charge is a dud'; break;
        case 10: case 9:
            msg = 'electric charge is grounded'; break;
        case 8: case 7:
            msg = 'flame fizzles out'; break;
        case 6: case 5: case 4:
            msg = 'poisoned needle misses'; break;
        case 3: case 2: case 1: case 0:
            msg = 'gas cloud blows away'; break;
        default:
            // impossible("chest disarm bug")
            msg = null;
            break;
        }
        if (msg)
            await ttyPline(`But luckily the ${msg}!`, state);
    } else {
        switch (rn2(20) ? ((Luck >= 13) ? 0 : rn2(13 - Luck)) : rn2(26)) {
        case 25: case 24: case 23: case 22: case 21: {
            // Explosion.
            const ox = obj.ox, oy = obj.oy;

            const costly = costly_spot(ox, oy, state)
                && shop_keeper(
                    (in_rooms(ox, oy, SHOPBASE, state) || [''])[0], state,
                ) != null;
            // C: insider = (*u.ushops && inside_shop(u.ux, u.uy) && ...).
            // Shop billing (stolen_value/make_angry_shk) is not ported.

            await ttyPline(`${Tobjnam(obj, 'explode', state)}!`, state);
            const buf = `exploding ${xnameFresh(obj, state)}`;

            if (costly) {
                // C: loss += stolen_value(...).
                note_unported('shk.c stolen_value');
            }
            delete_contents(obj, { state });

            // Unpunish if ball or chain will be destroyed.
            if (Punished(state)) {
                const uchain = state.u.uchain;
                const uball = state.u.uball;
                if ((uchain && uchain.ox === ox && uchain.oy === oy)
                    || (uball && uball.where === 1 /* OBJ_FLOOR */
                        && uball.ox === ox && uball.oy === oy)) {
                    note_unported('ball.c unpunish');
                }
            }

            // Destroy everything at the spot.
            let chestgone = false;
            const objects_at = state.level?.at(ox, oy)?.objects;
            if (objects_at) {
                // Walk a copy because delobj mutates the list.
                for (const otmp of [...objects_at]) {
                    if (costly) {
                        note_unported('shk.c stolen_value');
                    }
                    if (otmp === obj)
                        chestgone = true;
                    delobj(otmp, { state });
                }
            }
            await wake_nearby({ state });
            await losehp(Maybe_Half_Phys(d(6, 6), state), buf, KILLED_BY_AN, state);
            await exercise(A_STR, false, state);
            if (costly) {
                // C: shop accounting messages and make_angry_shk().
                note_unported('shk.c stolen_value');
                note_unported('shk.c make_angry_shk');
            }
            if (chestgone)
                return true;
            break;
        }
        case 20: case 19: case 18: case 17:
            // Poison gas.
            await ttyPline(
                `A cloud of noxious gas billows from ${the(xnameFresh(obj, state))}.`,
                state,
            );
            if (rn2(3))
                await poisoned('gas cloud', A_STR, 'cloud of poison gas', 15,
                    false, state, poisonedEnv(state));
            else
                await create_gas_cloud(obj.ox, obj.oy, 1, 8, { state });
            await exercise(A_CON, false, state);
            break;
        case 16: case 15: case 14: case 13:
            // Poisoned needle.
            await ttyPline(
                `You feel a needle prick your ${body_part(bodypart, state.youmonst)}.`,
                state,
            );
            await poisoned('needle', A_CON, 'poisoned needle', 10, false,
                state, poisonedEnv(state));
            await exercise(A_CON, false, state);
            break;
        case 12: case 11: case 10: case 9:
            // Fire trap.
            // C: dofiretrap(obj). trap.c, not ported.
            note_unported('trap.c dofiretrap');
            break;
        case 8: case 7: case 6: {
            // Electricity.
            let dmg = d(4, 4);
            const orig_dmg = dmg;
            await ttyPline('You are jolted by a surge of electricity!', state);
            if (Shock_resistance(state)) {
                // C: shieldeff(u.ux, u.uy) -- visual animation.
                note_unported('pager.c shieldeff');
                await ttyPline("You don't seem to be affected.", state);
                monstseesu(M_SEEN_ELEC, state);
                dmg = 0;
            } else {
                monstunseesu(M_SEEN_ELEC, state);
            }
            await destroy_items(state.youmonst, AD_ELEC, orig_dmg, { state });
            if (dmg)
                await losehp(dmg, 'electric shock', KILLED_BY_AN, state);
            break;
        }
        case 5: case 4: case 3:
            // Paralysis.
            if (!Free_action(state)) {
                await ttyPline('Suddenly you are frozen in place!', state);
                nomul(-d(5, 6), state);
                state.multi_reason = 'frozen by a trap';
                await exercise(A_DEX, false, state);
                state.nomovemsg = You_can_move_again;
            } else {
                await ttyPline('You momentarily stiffen.', state);
            }
            break;
        case 2: case 1: case 0: {
            // Stun/hallucination gas.
            const gascolor = Blind(state)
                ? blindgas[rn2(blindgas.length)]
                : rndcolor(state);
            await ttyPline(
                `A cloud of ${gascolor} gas billows from ${the(xnameFresh(obj, state))}.`,
                state,
            );
            if (!Stunned(state)) {
                if (Hallucination(state)) {
                    await ttyPline('What a groovy feeling!', state);
                } else {
                    const dizzy = Halluc_resistance(state) ? ''
                        : Blind(state) ? ' and get dizzy'
                        : ' and your vision blurs';
                    await ttyPline(
                        `You ${stagger(state.youmonst.data, 'stagger')}${dizzy}...`,
                        state,
                    );
                }
            }
            // C: make_stunned((HStun & TIMEOUT) + rn1(7, 16), FALSE).
            note_unported('timeout.c make_stunned');
            await make_hallucinated(
                ((state.u?.uprops?.[HALLUC]?.intrinsic ?? 0) & TIMEOUT)
                    + rn1(5, 16),
                false, 0, state,
            );
            break;
        }
        default:
            // impossible("bad chest trap")
            break;
        }
        await bot();
    }

    obj.tknown = 1;
    return false;
}
