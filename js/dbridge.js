// dbridge.js -- port of NetHack 5.0 src/dbridge.c: drawbridge creation.
// Only create_drawbridge() is ported; the rest of the file (the entities
// under and beside a bridge, open/close/destroy) is not.

import {
    DBWALL,
    DB_EAST,
    DB_LAVA,
    DB_NORTH,
    DB_SOUTH,
    DB_WEST,
    DOOR,
    DRAWBRIDGE_DOWN,
    DRAWBRIDGE_UP,
    D_NODOOR,
    IS_WALL,
    LAVAPOOL,
    W_NONDIGGABLE,
} from './const.js';
import { game } from './gstate.js';

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
    loc.drawbridgemask = dir;
    if (lava)
        loc.drawbridgemask |= DB_LAVA;
    return true;
}
