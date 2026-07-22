// Themed-room fill behavior.
// C refs: dat/themerms.lua themeroom_fills/themeroom_fill;
// src/sp_lev.c special-level terrain and trap creation.

import {
    ALTAR,
    AM_CHAOTIC,
    AM_LAWFUL,
    AM_NEUTRAL,
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    DART_TRAP,
    DRY,
    ICE,
    LANDMINE,
    MELT_ICE_AWAY,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    ROCKTRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    SP_COORD_IS_RANDOM,
    STRAT_WAITFORU,
    TIMER_LEVEL,
    WEB,
} from './const.js';
import { game } from './gstate.js';
import { induced_align } from './dungeon.js';
import {
    discard_minvent,
    makemon,
    m_dowear,
} from './makemon_create.js';
import { is_female, is_male } from './mondata.js';
import { mktrap } from './mktrap.js';
import { objectGenerationEnv } from './object_generation.js';
import {
    ARMOR_CLASS,
    ARROW,
    BOW,
    DAGGER,
    OIL_LAMP,
    RING_CLASS,
    SCROLL_CLASS,
    WEAPON_CLASS,
} from './objects.js';
import { PM_GHOST } from './monsters.js';
import { d, rn1, rn2, rnd, rne, rnz } from './rng.js';
import {
    get_free_room_loc,
    get_location_coord,
} from './room_coordinates.js';
import {
    lspo_object,
    new_sp_lev_object_context,
} from './sp_lev_object.js';
import { set_levltyp } from './terrain.js';
import {
    selection_iterate,
    selection_room,
    select_themeroom_fill,
} from './themerooms.js';
import { spot_stop_timers, start_timer } from './timeout.js';

const DEFAULT_RANDOM = Object.freeze({ d, rn1, rn2, rnd, rne, rnz });

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

function themedCreationCoordinate(specification, room, env) {
    return specification.coordinate
        ? {
            x: room.lx + specification.coordinate.x,
            y: room.ly + specification.coordinate.y,
        }
        : randomRoomCoordinate(room, env);
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

function createMonsterBody(specification, room, env) {
    const replacement = env.hooks.createMonster;
    // This hook replaces create_monster()'s monster construction and
    // attribute processing, including coordinate selection and asleep/waiting
    // state.  The surrounding lspo_monster() custom-inventory lifecycle still
    // runs after the replacement returns.
    if (replacement) return replacement(specification, room, env);

    // sp_lev.c:lspo_monster() resolves a fixed species and its parser gender
    // before create_monster() converts the default random alignment mask.
    const species = env.state.mons?.[specification.id];
    if (!species) {
        throw new Error(
            `special-level monster requires species ${specification.id}`,
        );
    }
    const parsedFemale = is_female(species)
        ? true
        : is_male(species) ? false : Boolean(env.random.rn2(2));
    const female = specification.female == null
        || is_female(species) || is_male(species)
        ? parsedFemale
        : Boolean(specification.female);
    induced_align(80, env.state, env.random.rn2);

    const coordinate = themedCreationCoordinate(specification, room, env);
    const monsterEnv = themedCreationEnv(env);
    const monster = makemon(
        species,
        coordinate.x,
        coordinate.y,
        0,
        monsterEnv,
    );
    if (!monster) return null;
    // create_monster() applies the parser-selected gender after makemon(),
    // even though makemon may have consumed its own gender draw.
    monster.female = female;
    if (specification.asleep != null)
        monster.msleeping = Boolean(specification.asleep);
    if (specification.waiting) monster.mstrategy |= STRAT_WAITFORU;
    return monster;
}

// C refs: sp_lev.c lspo_monster(), create_monster(), and
// spo_end_moninvent().  The descriptor callback runs even when monster
// creation fails.  A top-level failure leaves its objects on the floor; a
// nested failure inherits the outer scalar carrier until this descriptor's end
// boundary clears it, matching create_monster()'s success-only assignment.
export function create_monster(specification, room, rawEnv = {}) {
    const env = fillEnvironment(rawEnv);
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

const FILL_HANDLERS = Object.freeze({
    ghost_of_an_adventurer: fillGhostOfAnAdventurer,
    ice_room: fillIceRoom,
    light_source: fillLightSource,
    spider_nest: fillSpiderNest,
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
    return run_themeroom_fill(fill, room, difficulty, env);
}
