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
    FEMALE,
    FOUNTAIN,
    ICE,
    HOT,
    IS_FURNITURE,
    IS_STWALL,
    LADDER,
    LANDMINE,
    MALE,
    MELT_ICE_AWAY,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    MKTRAP_SEEN,
    MM_NOCOUNTBIRTH,
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
} from './const.js';
import { make_engr_at } from './engrave.js';
import { game } from './gstate.js';
import { induced_align } from './dungeon.js';
import {
    discard_minvent,
    makemon,
    m_dowear,
    restore_waiting_vampire,
    UnsupportedMonsterCreationError,
} from './makemon_create.js';
import { mkclass, set_malign } from './makemon.js';
import { is_female, is_male } from './mondata.js';
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
    STATUE,
    WEAPON_CLASS,
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
import { m_at } from './monst.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import {
    get_free_room_loc,
    get_location_coord,
    inside_room,
} from './room_coordinates.js';
import { create_gas_cloud_selection } from './region.js';
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
    return mktrap(type, flags, null, { x, y }, themedCreationEnv(env));
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

function themedMonsterCoordinate(specification, room, species, env) {
    const coordinate = { x: -1, y: -1 };
    const packed = specification.coordinate
        ? packedMapCoordinate(specification.coordinate)
        : SP_COORD_IS_RANDOM;
    const humidity = monsterHumidity(species);
    get_location_coord(
        coordinate,
        humidity | NO_LOC_WARN,
        room,
        packed,
        env,
    );
    if (coordinate.x === -1 && coordinate.y === -1) {
        get_location_coord(
            coordinate,
            humidity | DRY,
            room,
            packed,
            env,
        );
    }
    return coordinate;
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

function createMonsterBody(specification, room, env) {
    const replacement = env.hooks.createMonster;
    // This hook replaces create_monster()'s monster construction and
    // attribute processing, including coordinate selection and asleep/waiting
    // state.  The surrounding lspo_monster() custom-inventory lifecycle still
    // runs after the replacement returns.
    if (replacement) return replacement(specification, room, env);

    // lspo_monster() resolves a named species and parser gender before
    // create_monster(), but a class-only descriptor has no parser gender draw
    // and its BOOL_RANDOM safety net becomes male.
    let species = Number.isInteger(specification.id)
        ? env.state.mons?.[specification.id] : null;
    let female;
    if (species) {
        let parsedFemale;
        if (is_female(species)) {
            parsedFemale = true;
        } else if (is_male(species)) {
            parsedFemale = false;
        } else if (specification.parsedGender != null) {
            parsedFemale = specification.parsedGender === FEMALE;
        } else {
            parsedFemale = Boolean(env.random.rn2(2));
        }
        female = specification.female == null
            || is_female(species) || is_male(species)
            ? parsedFemale
            : Boolean(specification.female);
    } else if (specification.class != null) {
        female = specification.female == null
            ? false : Boolean(specification.female);
    } else {
        throw new Error('special-level monster requires species or class');
    }

    // sp_amask_to_amask(AM_SPLEV_RANDOM) runs before mkclass().
    induced_align(80, env.state, env.random.rn2);
    if (!species) {
        species = mkclass(specification.class, G_NOGEN, {
            state: env.state,
            random: env.random,
        });
    }

    const coordinate = themedMonsterCoordinate(
        specification,
        room,
        species,
        env,
    );
    if (species && m_at(coordinate.x, coordinate.y, env.state)) {
        const nearby = enexto(
            coordinate.x,
            coordinate.y,
            species,
            env,
        );
        if (nearby) Object.assign(coordinate, nearby);
    }
    if (room && !inside_room(
        room,
        coordinate.x,
        coordinate.y,
        env.state,
    )) {
        return null;
    }
    const monsterEnv = themedCreationEnv(env);
    const mmflags = specification.countbirth === false
        ? MM_NOCOUNTBIRTH
        : 0;
    const monster = makemon(
        species,
        coordinate.x,
        coordinate.y,
        mmflags,
        monsterEnv,
    );
    if (!monster) return null;
    if (specification.appearAs?.type === M_AP_OBJECT
        && monster.data.mlet === S_MIMIC) {
        monster.m_ap_type = M_AP_OBJECT;
        monster.mappearance = specification.appearAs.id;
    }
    // create_monster() applies the parser-selected gender after makemon(),
    // even though makemon may have consumed its own gender draw.
    monster.female = female;
    if (specification.peaceful != null) {
        monster.mpeaceful = Boolean(specification.peaceful);
        // sp_lev.c:create_monster() recomputes malign because makemon()
        // initialized it from the monster's natural peacefulness.
        set_malign(monster, env.state);
    }
    if (specification.asleep != null)
        monster.msleeping = Boolean(specification.asleep);
    if (specification.waiting) {
        monster.mstrategy |= STRAT_WAITFORU;
        // sp_lev.c:create_monster() restores a naturally shifted waiting
        // vampire unless the descriptor explicitly requested a monster
        // appearance. makemon() already suppressed inventory for the initial
        // successful shift; the reversion must not regenerate it here.
        const isVampireShifter = monster.cham === PM_VAMPIRE
            || monster.cham === PM_VAMPIRE_LEADER;
        if (isVampireShifter
            && monster.data.mlet !== S_VAMPIRE
            && specification.appearAs?.type !== M_AP_MONSTER) {
            restore_waiting_vampire(monster, monsterEnv);
        }
    }
    return monster;
}

function assertSupportedMonsterAppearance(specification, state) {
    const appearance = specification.appearAs;
    if (appearance == null) return;

    const species = Number.isInteger(specification.id)
        ? state.mons?.[specification.id] : null;
    const monsterClass = species?.mlet ?? specification.class;
    if (monsterClass !== S_MIMIC) {
        throw new UnsupportedMonsterCreationError(
            'appearance descriptor for a non-mimic',
        );
    }
    if (appearance.type !== M_AP_OBJECT) {
        throw new UnsupportedMonsterCreationError(
            `special-level mimic appearance type ${appearance.type}`,
        );
    }
    if (appearance.id !== CHEST) {
        throw new UnsupportedMonsterCreationError(
            `special-level mimic object appearance ${appearance.id}`,
        );
    }
}

// C refs: sp_lev.c lspo_monster(), create_monster(), and
// spo_end_moninvent().  The descriptor callback runs even when monster
// creation fails.  A top-level failure leaves its objects on the floor; a
// nested failure inherits the outer scalar carrier until this descriptor's end
// boundary clears it, matching create_monster()'s success-only assignment.
export function create_monster(specification, room, rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
    // This bounded port implements the Storeroom's object-disguised mimic
    // descriptor only. Reject other appearance pairs before create_monster()
    // consumes RNG or mutates level state.
    assertSupportedMonsterAppearance(specification, env.state);
    if (specification.parsedGender != null
        && specification.parsedGender !== MALE
        && specification.parsedGender !== FEMALE) {
        throw new TypeError(
            'special-level monster parsedGender must be MALE or FEMALE',
        );
    }
    const inventory = specification.inventory;
    if (inventory != null && typeof inventory !== 'function') {
        throw new TypeError(
            'special-level monster inventory must be a function',
        );
    }
    if (specification.keepDefaultInventory != null
        && typeof specification.keepDefaultInventory !== 'boolean') {
        throw new TypeError(
            'special-level monster keepDefaultInventory must be boolean',
        );
    }

    const monster = createMonsterBody(specification, room, env);
    const hasCustomInventory = typeof inventory === 'function';
    const keepDefaultInventory = hasCustomInventory
        ? specification.keepDefaultInventory === true
        : specification.keepDefaultInventory !== false;
    if (monster && !keepDefaultInventory)
        discard_minvent(monster, true, env);
    if (!hasCustomInventory) return monster;

    const context = env.spObjectContext;
    if (monster) context.inventCarryingMonster = monster;
    try {
        inventory(monster, env);
        // spo_end_moninvent() deliberately consults the shared carrier rather
        // than a saved local.  Preserve that behavior if a nested descriptor
        // replaced or cleared it during the callback.
        if (context.inventCarryingMonster)
            m_dowear(context.inventCarryingMonster, true, env);
    } finally {
        context.inventCarryingMonster = null;
    }
    return monster;
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
        create_monster({ id: PM_FOG_CLOUD, asleep: true }, room, env);
    const replacement = env.hooks.createGasCloudSelection;
    return replacement
        ? replacement(fog, 0, env)
        : create_gas_cloud_selection(fog, 0, env);
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

// dat/themerms.lua "Spider nest". D:1 never requests a spider on each web,
// but create_trap still performs its source mktrap victim check.
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
        create_monster({ id: PM_WOOD_NYMPH, asleep: true }, room, env);
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
            create_monster({
                class: S_MIMIC,
                appearAs: { type: M_AP_OBJECT, id: CHEST },
            }, room, env);
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
    create_monster({
        id: PM_GHOST,
        asleep: true,
        waiting: true,
        coordinate,
    }, room, env);

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
    env.state._themeroomSelectionTrace?.push({ kind: 'fill', id: fill.id });
    return run_themeroom_fill(fill, room, difficulty, env);
}
