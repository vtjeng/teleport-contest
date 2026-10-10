// Selection operations ported from src/nhlsel.c:
// l_selection_or(), l_selection_sub(), and l_selection_setpoint().
import {
    ANY_LOC,
    COLNO,
    ROWNO,
    SP_COORD_PACK,
    SP_COORD_PACK_RANDOM,
} from './const.js';
import { get_location_coord } from './room_coordinates.js';
import { luaL_checkinteger } from './nhlua.js';
import { selection_new, ThemeroomSelection } from './themerooms.js';

function checkSelection(selection) {
    if (!(selection instanceof ThemeroomSelection))
        throw new TypeError('selection operator requires two selections');
}

// selvar.c selection_getpoint(): decode its signed-char (value + 1) storage.
function selectionPoint(selection, x, y) {
    if (x < 0 || x >= COLNO || y < 0 || y >= ROWNO) return 0;
    return selection.points[y * COLNO + x] - 1;
}

// l_selection_push_new() result bounds are the minimal rectangle containing
// nonzero values; an empty selection retains C's invalid (COLNO,ROWNO,0,0) box.
function selectionBounds(selection) {
    let lx = COLNO;
    let ly = ROWNO;
    let hx = 0;
    let hy = 0;
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            if (!selectionPoint(selection, x, y)) continue;
            lx = Math.min(lx, x);
            ly = Math.min(ly, y);
            hx = Math.max(hx, x);
            hy = Math.max(hy, y);
        }
    }
    return { lx, ly, hx, hy };
}

// rect_bounds() in rect.c.
function rectBounds(a, b) {
    return {
        lx: Math.min(a.lx, b.lx),
        ly: Math.min(a.ly, b.ly),
        hx: Math.max(a.hx, b.hx),
        hy: Math.max(a.hy, b.hy),
    };
}

// C nhlsel.c l_selection_or(): Lua __bor and __add. Preserve each numeric
// selection value, the C x-major/y-minor evaluation order, and the left input's
// JavaScript coordinate-frame marker (both C operands share one map frame).
export function l_selection_or(a, b) {
    checkSelection(a);
    checkSelection(b);
    const bounds = rectBounds(selectionBounds(a), selectionBounds(b));
    const result = new ThemeroomSelection(null, a.absolute);
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            result.set(x, y, selectionPoint(a, x, y) | selectionPoint(b, x, y));
        }
    }
    return result;
}

// C nhlsel.c l_selection_sub(): Lua __sub. The source expression
// (a_pt ^ b_pt) & a_pt retains the original point's unexcluded bits.
export function l_selection_sub(a, b) {
    checkSelection(a);
    checkSelection(b);
    const bounds = rectBounds(selectionBounds(a), selectionBounds(b));
    const result = new ThemeroomSelection(null, a.absolute);
    for (let x = bounds.lx; x <= bounds.hx; ++x) {
        for (let y = bounds.ly; y <= bounds.hy; ++y) {
            const aPoint = selectionPoint(a, x, y);
            const bPoint = selectionPoint(b, x, y);
            result.set(x, y, (aPoint ^ bPoint) & aPoint);
        }
    }
    return result;
}

// C nhlsel.c l_selection_setpoint(). The one-selection form picks a random
// location in the active coder frame; the two-coordinate form creates and
// returns a fresh selection. C selections store map coordinates, so convert
// back to this port's Lua-frame coordinates only when the supplied selection
// uses the relative representation.
export function l_selection_setpoint(args, env) {
    let selection = null;
    let x = -1;
    let y = -1;
    let value = 1;
    const argc = args.length;

    if (argc === 0) {
        // C calls l_selection_new() here, then still fails because sel is null.
        selection_new();
    } else if (argc === 1) {
        selection = args[0];
    } else if (argc === 2) {
        x = luaL_checkinteger(args[0]);
        y = luaL_checkinteger(args[1]);
        selection = selection_new();
    } else {
        selection = args[0];
        x = luaL_checkinteger(args[1]);
        y = luaL_checkinteger(args[2]);
        if (args[3] != null) value = luaL_checkinteger(args[3]);
    }

    if ((argc === 1 || argc >= 3)
        && !(selection instanceof ThemeroomSelection))
        throw new Error('Selection error');
    if (!(selection instanceof ThemeroomSelection))
        throw new Error('Selection setpoint error');

    const packed = (x === -1 && y === -1)
        ? SP_COORD_PACK_RANDOM(0)
        : SP_COORD_PACK(x, y);
    const coordinate = { x, y };
    get_location_coord(
        coordinate,
        ANY_LOC,
        env.coder?.croom ?? null,
        packed,
        env,
    );

    if (!selection.absolute) {
        coordinate.x -= env.frame.xstart;
        coordinate.y -= env.frame.ystart;
    }
    selection.set(coordinate.x, coordinate.y, value);
    return selection;
}
