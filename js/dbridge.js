// dbridge.c — drawbridge creation and portcullis lookup predicates.
import {
    DB_DIR, DB_EAST, DB_MOAT, DB_NORTH, DB_SOUTH, DB_UNDER, DB_WEST,
    DBWALL, DOOR, DB_LAVA, DRAWBRIDGE_DOWN, DRAWBRIDGE_UP, D_NODOOR,
    IS_WALL, IS_DRAWBRIDGE, LAVAPOOL, MOAT, POOL, WATER, W_NONDIGGABLE,
} from './const.js';
import { isok } from './cmd_isok.js';
import { on_level } from './dungeon.js';
import { game } from './gstate.js';

// C refs: dbridge.c is_pool() (46-60) and is_moat() (100-112). The `flags`
// field is the live JavaScript owner of drawbridgemask on map records.
export function drawbridgeFlags(location) {
    return location?.flags ?? 0;
}

export function drawbridgeUnder(location) {
    return drawbridgeFlags(location) & DB_UNDER;
}

export function is_moat(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    const juiblexLevel = state.juiblex_level;
    const assignedJuiblexLevel = Boolean(
        juiblexLevel?.dlevel || juiblexLevel?.dnum,
    );
    if (!location
        || (assignedJuiblexLevel && on_level(state.u?.uz, juiblexLevel))) {
        return false;
    }
    return location.typ === MOAT
        || (location.typ === DRAWBRIDGE_UP
            && drawbridgeUnder(location) === DB_MOAT);
}

export function is_pool(x, y, state = game) {
    if (!isok(x, y)) return false;
    const location = state.level?.at?.(x, y);
    if (!location) return false;
    const typ = location.typ;
    return typ === POOL || typ === MOAT || typ === WATER
        || is_moat(x, y, state);
}

// C ref: dbridge.c is_drawbridge_wall() (137-162). Return the direction,
// including DB_NORTH=0, or -1; callers must not test JavaScript truthiness.
export function is_drawbridge_wall(x, y, state = game) {
    if (!isok(x, y)) return -1;
    const location = state.level.at(x, y);
    if (!location || (location.typ !== DOOR && location.typ !== DBWALL)) return -1;
    for (const [dx, dy, direction] of [
        [1, 0, DB_WEST], [-1, 0, DB_EAST],
        [0, -1, DB_SOUTH], [0, 1, DB_NORTH],
    ]) {
        if (!isok(x + dx, y + dy)) continue;
        const neighbor = state.level.at(x + dx, y + dy);
        if (!neighbor) continue;
        if (IS_DRAWBRIDGE(neighbor.typ)
            && (drawbridgeFlags(neighbor) & DB_DIR) === direction) {
            return direction;
        }
    }
    return -1;
}

// C ref: dbridge.c is_db_wall() (170-173).
export function is_db_wall(x, y, state = game) {
    return state.level.at(x, y).typ === DBWALL;
}

// C ref: dbridge.c find_drawbridge() (180-205). The coordinate object
// represents C's two in/out arguments; failure leaves both unchanged.
export function find_drawbridge(position, state = game) {
    if (IS_DRAWBRIDGE(state.level.at(position.x, position.y).typ)) return true;
    const direction = is_drawbridge_wall(position.x, position.y, state);
    if (direction < 0) return false;
    switch (direction) {
    case DB_NORTH: position.y++; break;
    case DB_SOUTH: position.y--; break;
    case DB_EAST: position.x--; break;
    case DB_WEST: position.x++; break;
    }
    return true;
}

// C ref: dbridge.c create_drawbridge(). Creation of a drawbridge at (x, y)
// facing `dir`; `flag` true wants the bridge open. The square beyond it in
// that direction must already be a wall: it becomes the doorway of an open
// bridge or the DBWALL of a raised one. Answers false when it is not a wall.
export function create_drawbridge(x, y, dir, flag, state = game) {
    let x2, y2;
    let horiz;
    const lava = state.level.at(x, y).typ === LAVAPOOL; /* assume initialized map */

    x2 = x;
    y2 = y;
    switch (dir) {
    case DB_NORTH:
        horiz = true;
        y2--;
        break;
    case DB_SOUTH:
        horiz = true;
        y2++;
        break;
    case DB_EAST:
        horiz = false;
        x2++;
        break;
    default:
        // C: impossible("bad direction in create_drawbridge");
        /* falls through */
    case DB_WEST:
        horiz = false;
        x2--;
        break;
    }
    const loc2 = state.level.at(x2, y2);
    if (!loc2 || !IS_WALL(loc2.typ))
        return false;
    const loc = state.level.at(x, y);
    if (flag) { /* We want the bridge open */
        loc.typ = DRAWBRIDGE_DOWN;
        loc2.typ = DOOR;
        loc2.doormask = D_NODOOR;
    } else {
        loc.typ = DRAWBRIDGE_UP;
        loc2.typ = DBWALL;
        /* Drawbridges are non-diggable. */
        loc2.wall_info = W_NONDIGGABLE;
    }
    loc.horizontal = !horiz;
    loc2.horizontal = horiz;
    loc.flags = dir;
    if (lava)
        loc.flags |= DB_LAVA;
    return true;
}
