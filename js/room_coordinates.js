// Room and special-level coordinate selection.
// C refs: mkroom.c somex()/somey()/somexy();
//         sp_lev.c set_ok_location_func()/is_ok_location()/get_location()/
//         get_unpacked_coord()/get_location_coord()/get_room_loc()/
//         get_free_room_loc().

import {
    ANY_LOC,
    COLNO,
    DB_LAVA,
    DB_MOAT,
    DB_UNDER,
    DRAWBRIDGE_UP,
    DRY,
    HOT,
    IS_OBSTRUCTED,
    IS_WALL,
    LAVAPOOL,
    LAVAWALL,
    MOAT,
    NO_LOC_WARN,
    POOL,
    ROOM,
    ROOMOFFSET,
    ROWNO,
    SOLID,
    SPACELOC,
    SPACE_POS,
    SP_COORD_IS_RANDOM,
    SP_COORD_X,
    SP_COORD_Y,
    WATER,
    WET,
    isok,
} from './const.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';
import { sobj_at } from './obj.js';
import { BOULDER } from './objects.js';
import { rn1, rn2 } from './rng.js';

function coordinateEnvironment(rawEnv = {}) {
    return {
        ...rawEnv,
        state: rawEnv.state ?? game,
        randomOneBased: rawEnv.randomOneBased ?? rawEnv.random?.rn1 ?? rn1,
        randomCore: rawEnv.randomCore ?? rawEnv.random?.rn2 ?? rn2,
        hooks: rawEnv.hooks ?? {},
    };
}

export function somex(croom, rawEnv = {}) {
    const { randomOneBased } = coordinateEnvironment(rawEnv);
    return randomOneBased(croom.hx - croom.lx + 1, croom.lx);
}

export function somey(croom, rawEnv = {}) {
    const { randomOneBased } = coordinateEnvironment(rawEnv);
    return randomOneBased(croom.hy - croom.ly + 1, croom.ly);
}

export function inside_room(croom, x, y, state = game) {
    if (croom.irregular) {
        const roomno = croom.roomnoidx + ROOMOFFSET;
        const loc = state.level?.at(x, y);
        return Boolean(loc && !loc.edge && loc.roomno === roomno);
    }

    return x >= croom.lx - 1 && x <= croom.hx + 1
        && y >= croom.ly - 1 && y <= croom.hy + 1;
}

// Pick a coordinate in the room while excluding subroom footprints. Keep the
// source's post-increment retry boundary: a regular room with subrooms rejects
// even a valid 100th candidate.
export function somexy(croom, c, rawEnv = {}) {
    const env = coordinateEnvironment(rawEnv);
    const { state } = env;
    let tryCnt = 0;

    if (croom.irregular) {
        const roomno = croom.roomnoidx + ROOMOFFSET;
        while (tryCnt++ < 100) {
            c.x = somex(croom, env);
            c.y = somey(croom, env);
            const loc = state.level.at(c.x, c.y);
            if (!loc.edge && loc.roomno === roomno) return true;
        }
        for (c.x = croom.lx; c.x <= croom.hx; ++c.x) {
            for (c.y = croom.ly; c.y <= croom.hy; ++c.y) {
                const loc = state.level.at(c.x, c.y);
                if (!loc.edge && loc.roomno === roomno) return true;
            }
        }
        return false;
    }

    if (!croom.nsubrooms) {
        c.x = somex(croom, env);
        c.y = somey(croom, env);
        return true;
    }

    while (tryCnt++ < 100) {
        c.x = somex(croom, env);
        c.y = somey(croom, env);
        if (IS_WALL(state.level.at(c.x, c.y).typ)) continue;

        let inSubroom = false;
        for (let i = 0; i < croom.nsubrooms; ++i) {
            if (inside_room(croom.sbrooms[i], c.x, c.y, state)) {
                inSubroom = true;
                break;
            }
        }
        if (inSubroom) continue;
        break;
    }
    return tryCnt < 100;
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
    return !on_level(state.u?.uz, state.juiblex_level)
        && raisedDrawbridgeOver(location, DB_MOAT);
}

function isLavaAt(x, y, state) {
    if (!isok(x, y)) return false;
    const location = state.level.at(x, y);
    return location.typ === LAVAPOOL || location.typ === LAVAWALL
        || raisedDrawbridgeOver(location, DB_LAVA);
}

// C ref: sp_lev.c is_ok_location_func, the file-scope predicate that
// set_ok_location_func() installs and is_ok_location() consults first. It is
// set only around one get_location_coord() call (l_create_stairway()), and
// cleared again before that caller returns.
let is_ok_location_func = null;

// C ref: sp_lev.c set_ok_location_func().
export function set_ok_location_func(func) {
    is_ok_location_func = func;
}

// C ref: sp_lev.c is_ok_location().
export function is_ok_location(x, y, humidity, rawEnv = {}) {
    const env = coordinateEnvironment(rawEnv);
    const { hooks, state } = env;
    const waterLevel = hooks.isWaterLevel
        ? hooks.isWaterLevel(state)
        : on_level(state.u?.uz, state.water_level);
    if (waterLevel) return true;

    if (is_ok_location_func)
        return Boolean(is_ok_location_func(x, y, state));

    if (humidity & ANY_LOC) return true;

    const location = state.level?.at(x, y);
    if (!location) return false;
    if ((humidity & SOLID) && IS_OBSTRUCTED(location.typ)) return true;
    if ((humidity & (DRY | SPACELOC)) && SPACE_POS(location.typ)) {
        const hasBoulder = hooks.hasBoulder
            ? hooks.hasBoulder(x, y, env)
            : Boolean(sobj_at(BOULDER, x, y, state));
        if (!hasBoulder || (humidity & SOLID)) return true;
    }
    if (humidity & WET) {
        const pool = hooks.isPool
            ? hooks.isPool(x, y, env)
            : isPoolAt(x, y, state);
        if (pool) return true;
    }
    if (humidity & HOT) {
        return Boolean(hooks.isLava
            ? hooks.isLava(x, y, env)
            : isLavaAt(x, y, state));
    }
    return false;
}

function locationFrame(croom, env) {
    if (croom) {
        return {
            mx: croom.lx,
            my: croom.ly,
            sx: croom.hx - croom.lx + 1,
            sy: croom.hy - croom.ly + 1,
        };
    }
    const frame = env.frame;
    if (!frame) {
        throw new Error(
            'special-level map coordinates require an injected map frame',
        );
    }
    return {
        mx: frame.xstart,
        my: frame.ystart,
        sx: frame.xsize,
        sy: frame.ysize,
    };
}

// Translate a relative or random special-level coordinate into an absolute
// map position. Random fallback scans x-major, matching sp_lev.c exactly.
export function get_location(coordinate, humidity, croom, rawEnv = {}) {
    const env = coordinateEnvironment(rawEnv);
    const { hooks, randomCore, state } = env;
    const { mx, my, sx, sy } = locationFrame(croom, env);

    if (coordinate.x >= 0) {
        coordinate.x += mx;
        coordinate.y += my;
    } else {
        let attempts = 0;
        do {
            if (croom) {
                const picker = hooks.chooseRoomCoordinate ?? somexy;
                picker(croom, coordinate, env);
            } else {
                coordinate.x = mx + randomCore(sx);
                coordinate.y = my + randomCore(sy);
            }
            if (is_ok_location(coordinate.x, coordinate.y, humidity, env))
                break;
        } while (++attempts < 100);

        if (attempts >= 100) {
            let found = false;
            for (let xx = 0; xx < sx && !found; ++xx) {
                for (let yy = 0; yy < sy; ++yy) {
                    coordinate.x = mx + xx;
                    coordinate.y = my + yy;
                    if (is_ok_location(
                        coordinate.x,
                        coordinate.y,
                        humidity,
                        env,
                    )) {
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                if (humidity & NO_LOC_WARN) {
                    coordinate.x = coordinate.y = -1;
                } else if (hooks.impossible) {
                    hooks.impossible("get_location: can't find a place!", env);
                }
            }
        }
    }

    if (!(humidity & ANY_LOC) && !isok(coordinate.x, coordinate.y)) {
        if (humidity & NO_LOC_WARN) {
            coordinate.x = coordinate.y = -1;
        } else {
            coordinate.x = env.frame?.xMazeMax ?? ((COLNO - 1) & ~1);
            coordinate.y = env.frame?.yMazeMax ?? ((ROWNO - 1) & ~1);
        }
    }
    return coordinate;
}

// C ref: sp_lev.c get_unpacked_coord(). A random packed coordinate carries
// its own humidity flags below SP_COORD_IS_RANDOM; an empty payload inherits
// the caller's default humidity.
export function get_unpacked_coord(loc, defhumidity) {
    const c = {};
    loc = Number(loc) >>> 0;

    if (loc & SP_COORD_IS_RANDOM) {
        c.x = c.y = -1;
        c.is_random = 1;
        c.getloc_flags = loc & ~SP_COORD_IS_RANDOM;
        if (!c.getloc_flags)
            c.getloc_flags = defhumidity;
    } else {
        c.is_random = 0;
        c.getloc_flags = defhumidity;
        c.x = SP_COORD_X(loc);
        c.y = SP_COORD_Y(loc);
    }
    return c;
}

// C ref: sp_lev.c get_location_coord().
export function get_location_coord(
    coordinate,
    humidity,
    croom,
    packedCoordinate = SP_COORD_IS_RANDOM,
    rawEnv = {},
) {
    const c = get_unpacked_coord(packedCoordinate, humidity);
    coordinate.x = c.x;
    coordinate.y = c.y;
    get_location(
        coordinate,
        c.getloc_flags | (c.is_random ? NO_LOC_WARN : 0),
        croom,
        rawEnv,
    );

    if (coordinate.x === -1 && coordinate.y === -1 && c.is_random)
        get_location(coordinate, humidity, croom, rawEnv);
    return coordinate;
}

export function get_room_loc(coordinate, croom, rawEnv = {}) {
    const env = coordinateEnvironment(rawEnv);
    if (coordinate.x < 0 && coordinate.y < 0) {
        if (!somexy(croom, coordinate, env)) {
            throw new Error("get_room_loc: can't find a place!");
        }
        return coordinate;
    }
    if (coordinate.x < 0)
        coordinate.x = env.randomCore(croom.hx - croom.lx + 1);
    if (coordinate.y < 0)
        coordinate.y = env.randomCore(croom.hy - croom.ly + 1);
    coordinate.x += croom.lx;
    coordinate.y += croom.ly;
    return coordinate;
}

export function get_free_room_loc(
    coordinate,
    croom,
    packedCoordinate = SP_COORD_IS_RANDOM,
    rawEnv = {},
) {
    const env = coordinateEnvironment(rawEnv);
    const original = { x: coordinate.x, y: coordinate.y };
    const trial = { x: -1, y: -1 };
    get_location_coord(trial, DRY, croom, packedCoordinate, env);
    if (env.state.level.at(trial.x, trial.y)?.typ !== ROOM) {
        let attempts = 0;
        do {
            trial.x = original.x;
            trial.y = original.y;
            get_room_loc(trial, croom, env);
        } while (env.state.level.at(trial.x, trial.y)?.typ !== ROOM
            && ++attempts <= 100);
        if (attempts > 100) {
            throw new Error("get_free_room_loc: can't find a place!");
        }
    }
    coordinate.x = trial.x;
    coordinate.y = trial.y;
    return coordinate;
}
