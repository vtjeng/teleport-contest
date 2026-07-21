// Themed-room fill behavior.
// C refs: dat/themerms.lua themeroom_fills/themeroom_fill;
// src/sp_lev.c special-level terrain and trap creation.

import {
    ANTI_MAGIC,
    ARROW_TRAP,
    BEAR_TRAP,
    DART_TRAP,
    ICE,
    LANDMINE,
    MELT_ICE_AWAY,
    MKTRAP_MAZEFLAG,
    MKTRAP_NOSPIDERONWEB,
    ROCKTRAP,
    RUST_TRAP,
    SLP_GAS_TRAP,
    STRAT_WAITFORU,
    TIMER_LEVEL,
    WEB,
} from './const.js';
import { game } from './gstate.js';
import { makemon } from './makemon_create.js';
import { mktrap } from './mktrap.js';
import { objectGenerationEnv } from './object_generation.js';
import { mkobj_at, mksobj_at } from './obj.js';
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
import { set_levltyp } from './terrain.js';
import {
    selection_room,
    select_themeroom_fill,
} from './themerooms.js';
import { begin_burn, start_timer } from './timeout.js';

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
    const trapEnv = objectGenerationEnv({
        state: env.state,
        random: env.random,
        hooks: env.hooks,
    });
    return mktrap(type, flags, null, { x, y }, trapEnv);
}

function randomRoomCoordinate(room, env) {
    const hook = env.hooks.roomCoordinate;
    if (typeof hook !== 'function') {
        throw new Error(
            'themed-room fill requires the room-coordinate subsystem',
        );
    }
    const coordinate = { x: -1, y: -1 };
    if (!hook(room, coordinate, env)) {
        throw new Error('themed-room fill could not choose a room coordinate');
    }
    return coordinate;
}

function createObject(specification, room, env) {
    const hook = env.hooks.createObject;
    if (hook) return hook(specification, room, env);
    const coordinate = specification.coordinate
        ? {
            x: room.lx + specification.coordinate.x,
            y: room.ly + specification.coordinate.y,
        }
        : randomRoomCoordinate(room, env);
    const objectEnv = objectGenerationEnv({
        state: env.state,
        random: env.random,
        hooks: env.hooks,
    });
    const object = specification.id != null
        ? mksobj_at(
            specification.id,
            coordinate.x,
            coordinate.y,
            true,
            true,
            objectEnv,
        )
        : mkobj_at(
            specification.class,
            coordinate.x,
            coordinate.y,
            true,
            objectEnv,
        );
    if (specification.notBlessed) object.blessed = false;
    if (specification.lit) begin_burn(object, false, objectEnv);
    return object;
}

function createMonster(specification, room, env) {
    const hook = env.hooks.createMonster;
    if (hook) return hook(specification, room, env);
    const coordinate = specification.coordinate
        ? {
            x: room.lx + specification.coordinate.x,
            y: room.ly + specification.coordinate.y,
        }
        : randomRoomCoordinate(room, env);
    const monsterEnv = objectGenerationEnv({
        state: env.state,
        random: env.random,
        hooks: env.hooks,
    });
    const monster = makemon(
        env.state.mons[specification.id],
        coordinate.x,
        coordinate.y,
        0,
        monsterEnv,
    );
    if (!monster) return null;
    if (specification.asleep != null)
        monster.msleeping = Boolean(specification.asleep);
    if (specification.waiting) monster.mstrategy |= STRAT_WAITFORU;
    return monster;
}

// dat/themerms.lua "Ice room".
function fillIceRoom(room, difficulty, env) {
    const ice = roomSelection(room, env);
    ice.iterate((x, y) => setTerrain(x, y, ICE, env));
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

// dat/themerms.lua "Ghost of an Adventurer".
function fillGhostOfAnAdventurer(room, _difficulty, env) {
    const coordinate = roomSelection(room, env).rndcoord(
        false,
        env.random.rn2,
        { x: room.lx, y: room.ly },
    );
    createMonster({
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
                notBlessed: true,
            }, room, env);
            return true;
        }
        return false;
    };
    equipment({ id: DAGGER }, 65);
    equipment({ class: WEAPON_CLASS }, 55);
    if (env.random.rn2(100) < 45) {
        createObject({ id: BOW, coordinate, notBlessed: true }, room, env);
        createObject({ id: ARROW, coordinate, notBlessed: true }, room, env);
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
