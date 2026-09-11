// Themed-room fill behavior.
// C refs: dat/themerms.lua themeroom_fills/themeroom_fill;
// src/sp_lev.c special-level terrain and trap creation.

import {
    AIR,
    ALTAR,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    BURN,
    COLNO,
    DART_TRAP,
    DRY,
    FOUNTAIN,
    ICE,
    HOT,
    IS_FURNITURE,
    IS_STWALL,
    LADDER,
    LANDMINE,
    MELT_ICE_AWAY,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    MKTRAP_SEEN,
    NON_PM,
    PROT_FROM_SHAPE_CHANGERS,
    In_mines,
    ismnum,
    BOOL_RANDOM,
    CUSTOM_INVENT,
    DEFAULT_INVENT,
    G_EXTINCT,
    G_GONE,
    M_AP_FURNITURE,
    M_AP_OBJECT,
    M_AP_MONSTER,
    NO_LOC_WARN,
    ROCKTRAP,
    ROLLING_BOULDER_TRAP,
    ROOM,
    ROWNO,
    RUST_TRAP,
    SDOOR,
    SLP_GAS_TRAP,
    SP_COORD_IS_RANDOM,
    STAIRS,
    STATUE_TRAP,
    STRAT_WAITFORU,
    TELEP_TRAP,
    TIMER_LEVEL,
    TIMER_OBJECT,
    ROT_CORPSE,
    TREE,
    WET,
    SOLID,
    WEB,
    ZOMBIFY_MON,
    AM_MASK,
    AM_SPLEV_CO,
    AM_SPLEV_NONCO,
    AM_SPLEV_RANDOM,
    A_ORIGINAL,
    Align2amask,
    D_CLOSED,
    D_LOCKED,
    IS_DOOR,
} from './const.js';
import { obj_resists } from './bury.js';
import { sobj_at } from './obj.js';
import { t_at } from './trap.js';
import { make_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { induced_align } from './dungeon.js';
import {
    discard_minvent,
    makemon,
    m_dowear,
    restore_waiting_vampire,
    set_mimic_sym,
    UnsupportedMonsterCreationError,
} from './makemon_create.js';
import { mkclass, set_malign } from './makemon.js';
import { your_race } from './mondata.js';
import { lspo_gas_cloud, lspo_monster } from './mklev.js';
import { christen_monst } from './do_name.js';
import { MAXMCLASSES, MAXPCHARS } from './symbols.js';
import { CMAP_EXPLANATIONS } from './symbol_data.js';
import { block_point, does_block } from './vision.js';
import { mktrap } from './mktrap.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    ARMOR_CLASS,
    ARROW,
    BOULDER,
    BOW,
    CHEST,
    CORPSE,
    DAGGER,
    OIL_LAMP,
    RING_CLASS,
    SCROLL_CLASS,
    NUM_OBJECTS,
    OBJ_NAME,
    STATUE,
    WEAPON_CLASS,
    getObjects,
} from './objects.js';
import {
    PM_ABBOT,
    PM_ACOLYTE,
    PM_ALIGNED_CLERIC,
    PM_APPRENTICE,
    PM_ARCHEOLOGIST,
    PM_ATTENDANT,
    PM_BARBARIAN,
    PM_CAVE_DWELLER,
    PM_CHIEFTAIN,
    PM_DWARF,
    PM_ELF,
    PM_ETTIN,
    PM_GIANT,
    PM_GNOME,
    G_NOGEN,
    G_UNIQ,
    M1_FLY,
    M1_SWIM,
    PM_FIRE_ELEMENTAL,
    PM_FIRE_VORTEX,
    PM_FLAMING_SPHERE,
    PM_FOG_CLOUD,
    PM_GHOST,
    PM_HEALER,
    PM_HUMAN,
    PM_HUNTER,
    PM_KNIGHT,
    PM_KOBOLD,
    PM_MONK,
    PM_NEANDERTHAL,
    PM_NINJA,
    PM_ORC,
    PM_PAGE,
    PM_RANGER,
    PM_ROGUE,
    PM_SAMURAI,
    PM_STUDENT,
    PM_THUG,
    PM_TOURIST,
    PM_VAMPIRE,
    PM_VAMPIRE_LEADER,
    PM_VALKYRIE,
    PM_WARRIOR,
    PM_WIZARD,
    PM_WOOD_NYMPH,
    PM_SALAMANDER,
    S_EEL,
    S_EYE,
    S_GHOST,
    S_LIGHT,
    S_MIMIC,
    S_VAMPIRE,
} from './monsters.js';
import { m_at, place_monster, remove_monster } from './monst.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import {
    get_free_room_loc,
    get_location,
    get_location_coord,
    inside_room,
} from './room_coordinates.js';
import {
    lspo_object,
    new_sp_lev_object_context,
} from './sp_lev_object.js';
import { set_levltyp } from './terrain.js';
import { enexto } from './teleport.js';
import {
    selection_iterate,
    selection_negate,
    selection_room,
    select_themeroom_fill,
} from './themerooms.js';
import {
    obj_has_timer,
    spot_stop_timers,
    start_timer,
    stop_timer,
} from './timeout.js';

const DEFAULT_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });
const WHOLE_LEVEL_FRAME = Object.freeze({
    xstart: 1,
    ystart: 0,
    xsize: COLNO - 1,
    ysize: ROWNO,
});

// Generated monsters.js currently exposes the movement flags used elsewhere;
// keep these two monflag.h values local until another subsystem needs them.
const M1_WALLWALK = 0x00000008;
const M1_AMPHIBIOUS = 0x00000200;

export class UnsupportedThemeroomFillError extends Error {
    constructor(fill) {
        super(`unported themed-room fill: ${fill?.name ?? fill?.id ?? 'unknown'}`);
        this.name = 'UnsupportedThemeroomFillError';
        this.fill = fill ?? null;
    }
}

function fillEnvironment(rawEnv = {}) {
    const state = rawEnv.state ?? game;
    const random = rawEnv.random ?? DEFAULT_RANDOM;
    for (const name of ['d', 'rn1', 'rn2', 'rnd', 'rne', 'rnz']) {
        if (typeof random[name] !== 'function') {
            throw new TypeError(
                `themed-room fill random injection requires ${name}`,
            );
        }
    }
    return {
        ...rawEnv,
        state,
        random,
        hooks: rawEnv.hooks ?? {},
        spObjectContext: rawEnv.spObjectContext
            ?? new_sp_lev_object_context(),
    };
}

function roomSelection(room, env) {
    return selection_room(room, (x, y) => env.state.level?.at(x, y));
}

function branchPostprocessQueue(state) {
    const dnum = state.u?.uz?.dnum ?? 0;
    state.themeroom_postprocess ??= {};
    state.themeroom_postprocess[dnum] ??= [];
    const queue = state.themeroom_postprocess[dnum];
    if (!Array.isArray(queue)) {
        throw new TypeError('themed-room postprocess queue must be an array');
    }
    return { dnum, queue, queues: state.themeroom_postprocess };
}

// dat/themerms.lua keeps one postprocess table in each branch's persistent Lua
// state. initialize_themeroom_branch() idempotently ensures the table on every
// level; fills also initialize lazily for focused callers.
export function initialize_themeroom_postprocess_branch(state = game) {
    return branchPostprocessQueue(state).queue;
}

function enqueuePostprocess(handler, data, env) {
    branchPostprocessQueue(env.state).queue.push({ handler, data });
}

// nhlib.lua shuffle(): Lua's math.random(i) is one-based, but its result is
// equivalent to rn2(i) when converted to a JavaScript array index.
export function shuffle_themeroom_values(values, random = rn2) {
    for (let index = values.length; index > 1; --index) {
        const other = random(index);
        [values[index - 1], values[other]] = [values[other], values[index - 1]];
    }
    return values;
}

function setTerrain(x, y, typ, env) {
    const hook = env.hooks.setTerrain;
    return hook
        ? hook(x, y, typ, env)
        : set_levltyp(x, y, typ, { state: env.state });
}

function startMeltTimer(x, y, when, env) {
    const hook = env.hooks.startMeltTimer;
    if (hook) return hook(x, y, when, env);
    const packedCoordinate = x * 0x10000 + y;
    spot_stop_timers(x, y, MELT_ICE_AWAY, env.state);
    return start_timer(
        when,
        TIMER_LEVEL,
        MELT_ICE_AWAY,
        packedCoordinate,
        env.state,
    );
}

function createTrap(type, flags, x, y, env) {
    const hook = env.hooks.createTrap;
    if (hook) return hook(type, flags, x, y, env);
    // C ref: mklev.c mktrap() (2104-2105) calls makemon() itself for the giant
    // spider that comes with a web. js/mktrap.js takes that call as a hook, and
    // this fill is its production owner: fillSpiderNest() asks for a spider on
    // four webs in five once level_difficulty() passes 8, so before this the
    // web arm threw a bare Error out of runSegment() on any D:9 spider nest.
    const trapEnv = themedCreationEnv({
        ...env,
        hooks: { makeMonster: makemon, ...env.hooks },
    });
    return mktrap(type, flags, null, { x, y }, trapEnv);
}

// sp_lev.c create_trap(). Resolve either an SP_COORD_PACK() value or the
// random-coordinate sentinel before handing the fixed point to mktrap().
function createRoomTrap(type, flags, packedCoordinate, room, env) {
    const absolute = { x: -1, y: -1 };
    get_free_room_loc(absolute, room, packedCoordinate, env);
    createTrap(type, flags, absolute.x, absolute.y, env);
}

// C ref: nhlib.lua d(). Its math.random(1, sides) consumes one injected core
// draw per die, in increasing die order.
function rollLuaDice(number, sides, random) {
    let total = 0;
    for (let die = 0; die < number; ++die)
        total += 1 + random.rn2(sides);
    return total;
}

const ALTAR_ALIGNMENT_MASK = Object.freeze({
    chaos: AM_CHAOTIC,
    law: AM_LAWFUL,
    neutral: AM_NEUTRAL,
});

// C ref: sp_lev.c create_altar().  The themed fill requests ordinary altars,
// so its explicit alignment is installed after get_free_room_loc() and no
// shrine or priest branch runs for the THEMEROOM carrier.
function createAltar(alignment, room, env) {
    const mask = ALTAR_ALIGNMENT_MASK[alignment];
    if (mask == null)
        throw new Error(`unknown themed-room altar alignment ${alignment}`);
    const coordinate = { x: -1, y: -1 };
    get_free_room_loc(
        coordinate,
        room,
        SP_COORD_IS_RANDOM,
        env,
    );
    if (!setTerrain(coordinate.x, coordinate.y, ALTAR, env)) return null;
    const location = env.state.level.at(coordinate.x, coordinate.y);
    location.flags = mask;
    return location;
}

function themedCreationEnv(env) {
    return objectGenerationEnv({
        state: env.state,
        random: env.random,
        hooks: env.hooks,
    });
}

function randomRoomCoordinate(room, env) {
    const hook = env.hooks.roomCoordinate;
    const coordinate = { x: -1, y: -1 };
    if (hook) {
        if (!hook(room, coordinate, env)) {
            throw new Error(
                'themed-room fill could not choose a room coordinate',
            );
        }
        return coordinate;
    }
    get_location_coord(
        coordinate,
        DRY,
        room,
        SP_COORD_IS_RANDOM,
        env,
    );
    if (coordinate.x === -1 || coordinate.y === -1)
        throw new Error('themed-room fill could not choose a room coordinate');
    return coordinate;
}

// sp_lev.c pm_to_humidity(). Unlike objects and traps, a special-level
// monster's first coordinate search honors its species' movement medium.
function monsterHumidity(species) {
    let humidity = DRY;
    const flags = species?.mflags1 ?? 0;
    if (species?.mlet === S_EEL
        || (flags & M1_AMPHIBIOUS)
        || (flags & M1_SWIM)) {
        humidity = WET;
    }
    if ((flags & M1_FLY)
        || species?.mlet === S_EYE
        || species?.mlet === S_LIGHT) {
        humidity |= HOT | WET;
    }
    if ((flags & M1_WALLWALK) || species?.mlet === S_GHOST)
        humidity |= SOLID;
    if (species?.pmidx === PM_FIRE_VORTEX
        || species?.pmidx === PM_FLAMING_SPHERE
        || species?.pmidx === PM_FIRE_ELEMENTAL
        || species?.pmidx === PM_SALAMANDER) {
        humidity |= HOT;
    }
    return humidity;
}

function createObject(specification, room, env) {
    const replacement = env.hooks.createObject;
    // This hook replaces the complete special-level object specification,
    // including coordinate selection, blessing overrides, and lighting items.
    // A replacement must return the finished object; none of the fallback
    // processing below runs after the hook returns.
    if (replacement) return replacement(specification, room, env);
    return lspo_object(specification, room, env);
}

// sp_lev.c lspo_feature("fountain") uses sel_set_feature(), not mkfount() or
// set_levltyp().  It therefore neither blesses nor recounts the fountain and
// refuses a single randomly selected furniture square without retrying.
function createFeature(typ, room, env) {
    const replacement = env.hooks.createFeature;
    if (replacement) return replacement(typ, room, env);
    const coordinate = randomRoomCoordinate(room, env);
    const location = env.state.level?.at(coordinate.x, coordinate.y);
    if (!location || IS_FURNITURE(location.typ)) return null;
    location.typ = typ;
    return location;
}

function packedMapCoordinate(coordinate) {
    if (coordinate.x === -1 && coordinate.y === -1)
        return SP_COORD_IS_RANDOM;
    return (coordinate.x & 0xff) | ((coordinate.y & 0xff) << 16);
}

function getGlobalCoordinate(coordinate, env) {
    const absolute = { x: -1, y: -1 };
    get_location_coord(
        absolute,
        DRY,
        null,
        packedMapCoordinate(coordinate),
        { ...env, frame: WHOLE_LEVEL_FRAME },
    );
    return absolute;
}

function createPostprocessEngraving(coordinate, text, env) {
    const replacement = env.hooks.createEngraving;
    if (replacement) return replacement(coordinate, text, env);
    const absolute = getGlobalCoordinate(coordinate, env);
    return make_engr_at(
        absolute.x,
        absolute.y,
        text,
        null,
        0,
        BURN,
        env,
    );
}

// sp_lev.c create_trap() retries a special-level coordinate while it resolves
// to stairs or a ladder.  Fixed coordinates repeat without RNG and are
// abandoned after the source's 101st check.
function createPostprocessTrap(specification, env) {
    const state = env.state;
    state.launchplace ??= {};
    state.launchplace.x = specification.teledest.x;
    state.launchplace.y = specification.teledest.y;
    try {
        let tryCount = 0;
        let absolute;
        do {
            absolute = getGlobalCoordinate(specification.coordinate, env);
        } while ((state.level.at(absolute.x, absolute.y)?.typ === STAIRS
            || state.level.at(absolute.x, absolute.y)?.typ === LADDER)
            && ++tryCount <= 100);
        if (tryCount > 100) return null;
        return createTrap(
            TELEP_TRAP,
            MKTRAP_MAZEFLAG | MKTRAP_SEEN,
            absolute.x,
            absolute.y,
            env,
        );
    } finally {
        // lspo_trap() clears only the coordinate fields after create_trap().
        state.launchplace.x = 0;
        state.launchplace.y = 0;
    }
}

// C ref: youprop.h Protection_from_shape_changers, the bare intrinsic OR
// extrinsic bits without the `blocked` mask.
function Protection_from_shape_changers(state) {
    const value = state.u?.uprops?.[PROT_FROM_SHAPE_CHANGERS];
    return Boolean(value?.intrinsic || value?.extrinsic);
}

function impossible(message, env) {
    if (typeof env.hooks.impossible === 'function')
        env.hooks.impossible(message, env);
}

// C ref: sp_lev.c create_monster(), from the class lookup through the
// attribute switch. `m` is the descriptor lspo_monster() fills; the port
// stores its `class` as the class index rather than the C's class
// character. Two arms are not ported: an explicit alignment (C: mk_roamer)
// and a player species (C: mk_mplayer) both fall through to makemon(), and
// assertSupportedMonsterAppearance() refuses the monster appearance arm
// before this runs; object and furniture disguises are handled below.
function createMonsterBody(m, croom, env) {
    const replacement = env.hooks.createMonster;
    // This hook replaces create_monster()'s monster construction and
    // attribute processing, including coordinate selection and asleep/waiting
    // state.  create_monster()'s inventory handling still runs after the
    // replacement returns.
    if (replacement) return replacement(m, croom, env);

    const { state } = env;
    // C: class = def_char_to_monclass(m->class), or 0 without a class.
    const cls = m.class >= 0 ? m.class : 0;

    if (cls === MAXMCLASSES)
        throw new Error(`create_monster: unknown monster class '${m.class}'`);

    sp_amask_to_amask(m.sp_amask, env);

    let pm;
    if (!cls) {
        pm = null;
    } else if (m.id !== NON_PM) {
        pm = state.mons[m.id];
        const g_mvflags = state.mvitals[m.id].mvflags;
        if ((pm.geno & G_UNIQ) && (g_mvflags & G_EXTINCT))
            return null;
        if (g_mvflags & G_GONE) /* genocided or extinct */
            pm = null; /* make random monster */
    } else {
        pm = mkclass(cls, G_NOGEN, { state, random: env.random });
        /* if we can't get a specific monster type (pm == 0) then the
           class has been genocided, so settle for a random monster */
    }
    if (In_mines(state.u?.uz) && pm && your_race(pm, state)
        && (state.urace?.mnum === PM_DWARF || state.urace?.mnum === PM_GNOME)
        && env.random.rn2(3))
        pm = null;

    const coordinate = { x: -1, y: -1 };
    if (pm) {
        let loc = monsterHumidity(pm);

        /* If water-liking monster, first try is without DRY */
        get_location_coord(coordinate, loc | NO_LOC_WARN, croom, m.coord, env);
        if (coordinate.x === -1 && coordinate.y === -1) {
            loc |= DRY;
            get_location_coord(coordinate, loc, croom, m.coord, env);
        }
    } else {
        get_location_coord(coordinate, DRY, croom, m.coord, env);
    }

    /* try to find a close place if someone else is already there */
    // enexto_core defaults a null species to the hero's, as the C does.
    if (m_at(coordinate.x, coordinate.y, state)) {
        const cc = enexto(coordinate.x, coordinate.y, pm, env);
        if (cc) Object.assign(coordinate, cc);
    }

    if (croom && !inside_room(croom, coordinate.x, coordinate.y, state))
        return null;

    const monsterEnv = themedCreationEnv(env);
    // C makemon has no species allowlist.  Special-level scripts place
    // branch-native species that fall outside the JS allowlist (the Oracle on
    // its eponymous main-dungeon level, for instance).  Bypass the allowlist
    // for script-placed monsters during mklev, the same way rndmonst-selected
    // species bypass it.
    if (state?.in_mklev) monsterEnv._rndmonMklev = true;
    const mtmp = makemon(
        pm,
        coordinate.x,
        coordinate.y,
        m.mm_flags,
        monsterEnv,
    );
    if (!mtmp) return null;

    let x = mtmp.mx;
    let y = mtmp.my; /* sanity precaution */
    m.x = x;
    m.y = y;
    /* handle specific attributes for some special monsters */
    if (m.name != null)
        christen_monst(mtmp, m.name);

    /*
     * This doesn't complain if an attempt is made to give a
     * non-mimic/non-shapechanger an appearance or to give a
     * shapechanger a non-monster shape, it just refuses to comply.
     */
    if (m.appear_as != null
        && ((mtmp.data.mlet === S_MIMIC)
            /* shapechanger (chameleons, et al, and vampires) */
            || (ismnum(mtmp.cham) && m.appear === M_AP_MONSTER))
        && !Protection_from_shape_changers(state)) {
        switch (m.appear) {
        case M_AP_FURNITURE: {
            // C: scan defsyms[] for the exact furniture explanation. The
            // generated cmap explanation table has the same MAXPCHARS order.
            const i = CMAP_EXPLANATIONS.indexOf(m.appear_as);
            if (i < 0 || i >= MAXPCHARS) {
                impossible(
                    `create_monster: can't find feature "${m.appear_as}"`,
                    env,
                );
            } else {
                mtmp.m_ap_type = M_AP_FURNITURE;
                mtmp.mappearance = i;
            }
            break;
        }
        case M_AP_OBJECT: {
            const objects = getObjects(state);
            let i;

            for (i = 0; i < NUM_OBJECTS; i++)
                if (OBJ_NAME(objects[i], state)
                    && OBJ_NAME(objects[i], state) === m.appear_as)
                    break;
            if (i === NUM_OBJECTS) {
                impossible(
                    `create_monster: can't find object "${m.appear_as}"`,
                    env,
                );
            } else {
                mtmp.m_ap_type = M_AP_OBJECT;
                mtmp.mappearance = i;
                /* try to avoid placing mimic boulder on a trap */
                // Because m->x was overwritten above, `m->x < 0` never holds
                // and the retry never runs; the source's structure is kept.
                if (i === BOULDER && m.x < 0
                    && m_bad_boulder_spot(x, y, env)) {
                    let retrylimit = 10;

                    remove_monster(x, y, state);
                    do {
                        const cc = { x: m.x, y: m.y };
                        get_location(cc, DRY, croom, env);
                        x = cc.x;
                        y = cc.y;
                        if (m_at(x, y, state)) {
                            const near = enexto(x, y, pm, env);
                            if (near) {
                                x = near.x;
                                y = near.y;
                            }
                        }
                    } while (m_bad_boulder_spot(x, y, env)
                             && --retrylimit > 0);
                    place_monster(mtmp, x, y, state);
                    /* if we didn't find a good spot
                       then mimic something else */
                    if (!retrylimit)
                        set_mimic_sym(mtmp, monsterEnv);
                }
            }
            break;
        }
        default:
            // M_AP_NOTHING and M_AP_MONSTER: the latter is refused by
            // assertSupportedMonsterAppearance() before creation.
            break;
        }
        if (does_block(x, y, state.level.at(x, y), state))
            block_point(x, y, state);
    }

    // create_monster() applies the parser-selected gender after makemon(),
    // even though makemon may have consumed its own gender draw.
    mtmp.female = Boolean(m.female);
    if (m.peaceful > BOOL_RANDOM) {
        mtmp.mpeaceful = Boolean(m.peaceful);
        /* changed mpeaceful again; have to reset malign */
        set_malign(mtmp, state);
    }
    if (m.asleep > BOOL_RANDOM)
        mtmp.msleeping = Boolean(m.asleep);
    if (m.seentraps)
        mtmp.mtrapseen = m.seentraps;
    if (m.cancelled)
        mtmp.mcan = true;
    if (m.revived)
        mtmp.mrevived = true;
    if (m.avenge)
        mtmp.mavenge = true;
    if (m.stunned)
        mtmp.mstun = true;
    if (m.confused)
        mtmp.mconf = true;
    if (m.invis) {
        mtmp.minvis = mtmp.perminvis = true;
    }
    if (m.blinded) {
        mtmp.mcansee = false;
        mtmp.mblinded = (m.blinded % 127);
    }
    if (m.paralyzed) {
        mtmp.mcanmove = false;
        mtmp.mfrozen = (m.paralyzed % 127);
    }
    if (m.fleeing) {
        mtmp.mflee = true;
        mtmp.mfleetim = (m.fleeing % 127);
    }
    if (m.waiting) {
        mtmp.mstrategy |= STRAT_WAITFORU;
        /* if this is a vampire that got created already shifted into
           bat/fog/wolf form and the special level or theme room didn't
           explicitly request that, shift back to vampire */
        // makemon() already suppressed inventory for the initial successful
        // shift; the reversion must not regenerate it here.
        const isVampireShifter = mtmp.cham === PM_VAMPIRE
            || mtmp.cham === PM_VAMPIRE_LEADER;
        if (isVampireShifter
            && mtmp.data.mlet !== S_VAMPIRE
            && m.appear !== M_AP_MONSTER) {
            restore_waiting_vampire(mtmp, monsterEnv);
        }
    }
    if (m.m_lev_adj) {
        if (mtmp.m_lev + m.m_lev_adj > 49)
            mtmp.m_lev = 49;
        else if (mtmp.m_lev + m.m_lev_adj < 0)
            mtmp.m_lev = 0;
        else
            mtmp.m_lev += m.m_lev_adj;
    }
    return mtmp;
}

// The monster appearance arm of create_monster() remains unported. Refuse
// those descriptors before create_monster() consumes RNG or mutates level
// state; object and furniture appearances are source-complete above.
function assertSupportedMonsterAppearance(m) {
    if (m.appear_as == null) return;
    if (m.appear !== M_AP_OBJECT && m.appear !== M_AP_FURNITURE) {
        throw new UnsupportedMonsterCreationError(
            `special-level appearance type ${m.appear}`,
        );
    }
}

// C ref: sp_lev.c noncoalignment(). An alignment that differs from the
// hero's: either of the two others for a neutral hero, otherwise the opposite
// or neutral.
export function noncoalignment(alignment, random = rn2) {
    const k = random(2);
    if (!alignment)
        return (k ? -1 : 1);
    return (k ? -alignment : 0);
}

// C ref: sp_lev.c m_bad_boulder_spot(). Screens out locations where a
// mimic-as-boulder should not occur: traps, existing boulders (which cannot
// exist yet, as the source notes), and closed or locked doors.
export function m_bad_boulder_spot(x, y, rawEnv = {}) {
    const state = rawEnv.state ?? game;

    if (t_at(x, y, state))
        return true;
    if (sobj_at(BOULDER, x, y, state))
        return true;
    const lev = state.level.at(x, y);
    if (IS_DOOR(lev.typ) && (lev.doormask & (D_CLOSED | D_LOCKED)) !== 0)
        return true;
    return false;
}

// C ref: sp_lev.c sp_amask_to_amask(). Resolves the special-level alignment
// request (co-aligned, non-co-aligned, random, or explicit) to an AM_ mask.
export function sp_amask_to_amask(sp_amask, rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
    const { state } = env;
    let amask;

    if (sp_amask === AM_SPLEV_CO)
        amask = Align2amask(state.u.ualignbase[A_ORIGINAL]);
    else if (sp_amask === AM_SPLEV_NONCO)
        amask = Align2amask(
            noncoalignment(state.u.ualignbase[A_ORIGINAL], env.random.rn2),
        );
    else if (sp_amask === AM_SPLEV_RANDOM)
        amask = induced_align(80, state, env.random.rn2);
    else
        amask = sp_amask & AM_MASK;

    return amask;
}

// C ref: sp_lev.c spo_end_moninvent(). Closes a monster's custom-inventory
// descriptor: the carrier wears what it was given, and the shared carrier
// slot is cleared. It deliberately consults the shared carrier rather than a
// saved local, so a nested descriptor that replaced or cleared it wins.
export function spo_end_moninvent(context, env) {
    if (context.inventCarryingMonster)
        m_dowear(context.inventCarryingMonster, true, env);
    context.inventCarryingMonster = null;
}

// C ref: sp_lev.c create_monster(). `m` is the descriptor lspo_monster()
// fills. The monster's construction runs in createMonsterBody() so that a
// test hook can replace it; the inventory handling that follows runs either
// way. Answers the monster, or null when none was created; the C returns
// nothing and leaves the custom-inventory callback to lspo_monster().
export function create_monster(m, croom, rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
    assertSupportedMonsterAppearance(m);

    const mtmp = createMonsterBody(m, croom, env);

    if (mtmp) {
        if (!(m.has_invent & DEFAULT_INVENT)) {
            /* guard against someone accidentally specifying e.g. quest nemesis
             * with custom inventory that lacks Bell or quest artifact but
             * forgetting to flag them as receiving their default inventory */
            // C ref: steal.c mdrop_special_objs() calls obj_resists(obj, 0, 0)
            // for each inventory item before discard_minvent() discards them.
            // The rn2(100) calls always return false for ordinary items but
            // still consume the RNG.
            for (let obj = mtmp.minvent; obj; obj = obj.nobj)
                obj_resists(obj, 0, 0, env);
            discard_minvent(mtmp, true, env);
        }
        if (m.has_invent & CUSTOM_INVENT) {
            env.spObjectContext.inventCarryingMonster = mtmp;
        }
    }
    return mtmp;
}

function replaceSelectedTerrain(selection, predicate, toTerrain, env) {
    selection_iterate(selection, (x, y) => {
        const location = env.state.level?.at(x, y);
        if (!location || !predicate(location.typ)) return;
        // lspo_replace_terrain() performs this check even at chance=100.
        if (env.random.rn2(100) < 100)
            setTerrain(x, y, toTerrain, env);
    });
}

// dat/themerms.lua make_garden_walls().
function makeGardenWalls(data, env) {
    const grown = data.selection.grow();
    replaceSelectedTerrain(grown, IS_STWALL, TREE, env);
    replaceSelectedTerrain(grown, (typ) => typ === SDOOR, AIR, env);
}

// dat/themerms.lua make_dig_engraving(). selection:rndcoord() returns a
// coordinate relative to reset_xystart_size()'s whole-level frame.
function makeDigEngraving(data, env) {
    const floors = selection_negate().filter_mapchar(
        ROOM,
        (x, y) => env.state.level?.at(x, y),
    );
    const position = floors.rndcoord(
        false,
        env.random.rn2,
        { x: WHOLE_LEVEL_FRAME.xstart, y: WHOLE_LEVEL_FRAME.ystart },
    );
    const dx = data.x - position.x - 1;
    const dy = data.y - position.y;
    let direction = '';
    if (dx === 0 && dy === 0) {
        direction = ' here';
    } else {
        if (dx !== 0)
            direction = ` ${Math.abs(dx)} ${dx > 0 ? 'east' : 'west'}`;
        if (dy !== 0) {
            direction += ` ${Math.abs(dy)} ${dy > 0 ? 'south' : 'north'}`;
        }
    }
    createPostprocessEngraving(position, `Dig${direction}`, env);
}

// dat/themerms.lua make_a_trap(), for the Teleportation hub's only request.
function makeTeleportationHubTrap(data, env) {
    const floors = selection_negate().filter_mapchar(
        ROOM,
        (x, y) => env.state.level?.at(x, y),
    );
    let destination;
    do {
        destination = floors.rndcoord(
            true,
            env.random.rn2,
            { x: WHOLE_LEVEL_FRAME.xstart, y: WHOLE_LEVEL_FRAME.ystart },
        );
    } while (destination.x === data.coordinate.x
        || destination.y === data.coordinate.y);
    data.teledest = destination;
    createPostprocessTrap(data, env);
}

// dat/themerms.lua post_level_generate(). The index loop deliberately observes
// work appended while a handler runs, just like ipairs() on the live table.
// The branch receives a fresh table only after every handler succeeds. A Lua
// error skips that assignment and is fatal through NHLpa_panic; retaining the
// failed table and whole-level frame is source parity, not a retry contract.
export function run_themeroom_postprocess(rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
    const { dnum, queue, queues } = branchPostprocessQueue(env.state);
    env.state.xstart = WHOLE_LEVEL_FRAME.xstart;
    env.state.ystart = WHOLE_LEVEL_FRAME.ystart;
    env.state.xsize = WHOLE_LEVEL_FRAME.xsize;
    env.state.ysize = WHOLE_LEVEL_FRAME.ysize;
    env.state.in_mk_themerooms = true;
    let processed = 0;
    try {
        while (processed < queue.length) {
            const entry = queue[processed++];
            entry.handler(entry.data, env);
        }
    } finally {
        env.state.in_mk_themerooms = false;
    }
    queues[dnum] = [];
    return processed;
}

// dat/themerms.lua "Ice room".
function fillIceRoom(room, difficulty, env) {
    const ice = roomSelection(room, env);
    selection_iterate(ice, (x, y) => setTerrain(x, y, ICE, env));
    if (env.random.rn2(100) >= 25) return;

    const minimumTime = 1000 - difficulty * 100;
    ice.iterate((x, y) => {
        startMeltTimer(x, y, minimumTime + env.random.rn2(1000), env);
    });
}

// dat/themerms.lua "Cloud room". The room selection is retained as a gas
// region after every fog monster has completed its independent creation.
function fillCloudRoom(room, _difficulty, env) {
    const fog = roomSelection(room, env);
    const monsterCount = Math.trunc(fog.numpoints() / 4);
    for (let index = 0; index < monsterCount; ++index)
        lspo_monster([{ id: PM_FOG_CLOUD, asleep: true }], room, env);
    const replacement = env.hooks.createGasCloudSelection;
    if (replacement)
        return replacement(fog, 0, env);
    return lspo_gas_cloud([{ selection: fog }], env);
}

// dat/themerms.lua "Boulder room". selection:percentage() samples x-major,
// then selection:iterate() invokes the retained points y-major.
function fillBoulderRoom(room, _difficulty, env) {
    const locations = roomSelection(room, env).percentage(30, env.random.rn2);
    locations.iterate((x, y) => {
        const coordinate = { x: x - room.lx, y: y - room.ly };
        if (env.random.rn2(100) < 50) {
            createObject({ id: BOULDER, coordinate }, room, env);
        } else {
            createRoomTrap(
                ROLLING_BOULDER_TRAP,
                MKTRAP_MAZEFLAG,
                (coordinate.x & 0xff) + ((coordinate.y & 0xff) << 16),
                room,
                env,
            );
        }
    });
}

// dat/themerms.lua "Buried zombies".  The same mutable pool is shuffled for
// every corpse, and Lua's numeric loop truncates the half-room area.
function fillBuriedZombies(room, difficulty, env) {
    const zombifiable = [PM_KOBOLD, PM_GNOME, PM_ORC, PM_DWARF];
    if (difficulty > 3) {
        zombifiable.push(PM_ELF, PM_HUMAN);
        if (difficulty > 6) zombifiable.push(PM_ETTIN, PM_GIANT);
    }

    const width = 1 + room.hx - room.lx;
    const height = 1 + room.hy - room.ly;
    const corpseCount = Math.trunc(width * height / 2);
    for (let index = 0; index < corpseCount; ++index) {
        shuffle_themeroom_values(zombifiable, env.random.rn2);
        const corpse = createObject({
            id: CORPSE,
            corpsenm: zombifiable[0],
            buried: true,
        }, room, env);
        if (corpse)
            stop_timer(ROT_CORPSE, corpse, env.state, env);

        // Lua evaluates math.random() before l_obj_timer_start(), whose body
        // replaces a duplicate timer only after the delay has been selected.
        const delay = 990 + env.random.rn2(21);
        if (!corpse) continue;
        if (obj_has_timer(corpse, ZOMBIFY_MON, env.state))
            stop_timer(ZOMBIFY_MON, corpse, env.state, env);
        start_timer(
            delay,
            TIMER_OBJECT,
            ZOMBIFY_MON,
            corpse,
            env.state,
        );
    }
}

// dat/themerms.lua "Spider nest". Its `spooders` gate is level_difficulty()
// past 8, so no D:1 web carries a spider and create_trap() still performs its
// source mktrap victim check. From D:9 down, four webs in five ask for one.
function fillSpiderNest(room, difficulty, env) {
    const spiders = difficulty > 8;
    const locations = roomSelection(room, env).percentage(30, env.random.rn2);
    locations.iterate((x, y) => {
        const spiderOnWeb = spiders && env.random.rn2(100) < 80;
        const flags = MKTRAP_MAZEFLAG
            | (spiderOnWeb ? 0 : MKTRAP_NOSPIDERONWEB);
        createTrap(WEB, flags, x, y, env);
    });
}

// dat/themerms.lua "Trap room".
function fillTrapRoom(room, _difficulty, env) {
    const traps = shuffle_themeroom_values([
        ARROW_TRAP,
        DART_TRAP,
        ROCKTRAP,
        BEAR_TRAP,
        LANDMINE,
        SLP_GAS_TRAP,
        RUST_TRAP,
        ANTI_MAGIC,
    ], env.random.rn2);
    const locations = roomSelection(room, env).percentage(30, env.random.rn2);
    locations.iterate((x, y) => {
        createTrap(traps[0], MKTRAP_MAZEFLAG, x, y, env);
    });
}

// dat/themerms.lua "Garden". The room selection is sampled before the loop,
// but the deferred wall snapshot is taken again after all immediate contents.
function fillGarden(room, _difficulty, env) {
    const selected = roomSelection(room, env);
    const monsterCount = Math.trunc(selected.numpoints() / 6);
    for (let index = 0; index < monsterCount; ++index) {
        lspo_monster([{ id: PM_WOOD_NYMPH, asleep: true }], room, env);
        if (env.random.rn2(100) < 30)
            createFeature(FOUNTAIN, room, env);
    }
    enqueuePostprocess(
        makeGardenWalls,
        { selection: roomSelection(room, env) },
        env,
    );
}

// dat/themerms.lua "Buried treasure". create_object() buries the chest while
// its descriptor container frame is active, then lspo_object() invokes this
// callback and only pops the frame after all random contents have been made.
function fillBuriedTreasure(room, _difficulty, env) {
    createObject({
        id: CHEST,
        buried: true,
        contents(chest, callbackEnv) {
            const activeEnv = fillEnvironment(callbackEnv ?? env);
            if (chest && chest.NO_OBJ == null) {
                enqueuePostprocess(
                    makeDigEngraving,
                    { x: chest.ox, y: chest.oy },
                    activeEnv,
                );
            }
            const objectCount = rollLuaDice(3, 4, activeEnv.random);
            for (let index = 0; index < objectCount; ++index)
                createObject({}, room, activeEnv);
        },
    }, room, env);
}

// dat/themerms.lua "Massacre". Keep the Lua table order explicit: the
// gendered priest and cave-dweller names intentionally resolve to duplicate
// species entries through sp_lev.c:lspo_object()'s first-name match.
const MASSACRE_SPECIES = Object.freeze([
    PM_APPRENTICE,
    PM_WARRIOR,
    PM_NINJA,
    PM_THUG,
    PM_HUNTER,
    PM_ACOLYTE,
    PM_ABBOT,
    PM_PAGE,
    PM_ATTENDANT,
    PM_NEANDERTHAL,
    PM_CHIEFTAIN,
    PM_STUDENT,
    PM_WIZARD,
    PM_VALKYRIE,
    PM_TOURIST,
    PM_SAMURAI,
    PM_ROGUE,
    PM_RANGER,
    PM_ALIGNED_CLERIC, // priestess: first matching pmname
    PM_ALIGNED_CLERIC, // priest: first matching pmname
    PM_MONK,
    PM_KNIGHT,
    PM_HEALER,
    PM_CAVE_DWELLER, // cavewoman
    PM_CAVE_DWELLER, // caveman
    PM_BARBARIAN,
    PM_ARCHEOLOGIST,
]);

function fillMassacre(room, _difficulty, env) {
    let species = MASSACRE_SPECIES[
        env.random.rn2(MASSACRE_SPECIES.length)
    ];
    const corpseCount = rollLuaDice(5, 5, env.random);
    for (let index = 0; index < corpseCount; ++index) {
        if (env.random.rn2(100) < 10) {
            species = MASSACRE_SPECIES[
                env.random.rn2(MASSACRE_SPECIES.length)
            ];
        }
        createObject({ id: CORPSE, corpsenm: species }, room, env);
    }
}

// dat/themerms.lua "Statuary". nhlib.lua d(5,5) and d(3) consume one
// math.random() call per die; every ordinary statue precedes every trap.
function fillStatuary(room, _difficulty, env) {
    const statueCount = rollLuaDice(5, 5, env.random);
    for (let index = 0; index < statueCount; ++index)
        createObject({ id: STATUE }, room, env);

    const trapCount = rollLuaDice(1, 3, env.random);
    for (let index = 0; index < trapCount; ++index) {
        createRoomTrap(
            STATUE_TRAP,
            MKTRAP_MAZEFLAG,
            SP_COORD_IS_RANDOM,
            room,
            env,
        );
    }
}

// dat/themerms.lua "Storeroom". percentage() samples x-major, then the Lua
// callback runs y-major. Its x/y arguments are intentionally unused: each
// retained point triggers a fresh random-room object or monster placement.
function fillStoreroom(room, _difficulty, env) {
    const locations = roomSelection(room, env).percentage(
        30,
        env.random.rn2,
    );
    locations.iterate(() => {
        if (env.random.rn2(100) < 25) {
            createObject({ id: CHEST }, room, env);
        } else {
            lspo_monster([{
                class: S_MIMIC,
                appear_as: 'obj:chest',
            }], room, env);
        }
    });
}

// dat/themerms.lua "Light source".
function fillLightSource(room, _difficulty, env) {
    createObject({ id: OIL_LAMP, lit: true }, room, env);
}

// dat/themerms.lua "Temple of the gods".  nhlib.lua shuffles this alignment
// array once when the branch's persistent Lua state is initialized.
function fillTempleOfTheGods(room, _difficulty, env) {
    const dnum = env.state.u?.uz?.dnum ?? 0;
    const alignments = env.state.themeroom_align?.[dnum];
    if (!Array.isArray(alignments) || alignments.length !== 3) {
        throw new Error(
            'Temple of the gods requires initialized branch alignments',
        );
    }
    for (const alignment of alignments)
        createAltar(alignment, room, env);
}

// dat/themerms.lua "Ghost of an Adventurer".
function fillGhostOfAnAdventurer(room, _difficulty, env) {
    const coordinate = roomSelection(room, env).rndcoord(
        false,
        env.random.rn2,
        { x: room.lx, y: room.ly },
    );
    lspo_monster([{
        id: PM_GHOST,
        asleep: true,
        waiting: true,
        coord: coordinate,
    }], room, env);

    const equipment = (specification, chance) => {
        if (env.random.rn2(100) < chance) {
            createObject({
                ...specification,
                coordinate,
                buc: 'not-blessed',
            }, room, env);
        }
    };
    equipment({ id: DAGGER }, 65);
    equipment({ class: WEAPON_CLASS }, 55);
    if (env.random.rn2(100) < 45) {
        createObject({ id: BOW, coordinate, buc: 'not-blessed' }, room, env);
        createObject({ id: ARROW, coordinate, buc: 'not-blessed' }, room, env);
    }
    equipment({ class: ARMOR_CLASS }, 65);
    equipment({ class: RING_CLASS }, 20);
    equipment({ class: SCROLL_CLASS }, 20);
}

// dat/themerms.lua "Teleportation hub". rndcoord() removes a point before the
// source's relative-x check, so points in the room's leftmost column are lost
// without queuing a trap. Queued coordinates use the later whole-level frame.
function fillTeleportationHub(room, _difficulty, env) {
    const locations = roomSelection(room, env).filter_mapchar(
        ROOM,
        (x, y) => env.state.level?.at(x, y),
    );
    const trapCount = 2 + env.random.rn2(3);
    for (let index = 0; index < trapCount; ++index) {
        const position = locations.rndcoord(
            true,
            env.random.rn2,
            { x: room.lx, y: room.ly },
        );
        if (position.x <= 0) continue;
        position.x += room.lx - 1;
        position.y += room.ly;
        enqueuePostprocess(makeTeleportationHubTrap, {
            type: TELEP_TRAP,
            seen: true,
            coordinate: position,
            teledest: 1,
        }, env);
    }
}

const FILL_HANDLERS = Object.freeze({
    boulder_room: fillBoulderRoom,
    buried_treasure: fillBuriedTreasure,
    buried_zombies: fillBuriedZombies,
    cloud_room: fillCloudRoom,
    garden: fillGarden,
    ghost_of_an_adventurer: fillGhostOfAnAdventurer,
    ice_room: fillIceRoom,
    light_source: fillLightSource,
    massacre: fillMassacre,
    spider_nest: fillSpiderNest,
    statuary: fillStatuary,
    storeroom: fillStoreroom,
    teleportation_hub: fillTeleportationHub,
    temple_of_the_gods: fillTempleOfTheGods,
    trap_room: fillTrapRoom,
});

export function run_themeroom_fill(fill, room, difficulty, rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
    const handler = FILL_HANDLERS[fill?.id];
    if (!handler) throw new UnsupportedThemeroomFillError(fill);
    handler(room, difficulty, env);
    return fill;
}

// dat/themerms.lua themeroom_fill(): selection is synchronous with the room
// callback, before lspo_room() scans doors and before the next room is built.
export function themeroom_fill(room, difficulty, rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
    const fill = select_themeroom_fill(
        difficulty,
        { lit: Boolean(room?.rlit) },
        env.random.rn2,
    );
    if (!fill) throw new UnsupportedThemeroomFillError(null);
    // Match the room-selection diagnostic seam without adding a random draw
    // or changing the selected fill's source-shaped execution.
    env.state._themeroomSelectionCollector?.record('fill', fill.id);
    return run_themeroom_fill(fill, room, difficulty, env);
}
