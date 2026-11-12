// Selection operations ported from src/nhlsel.c:
// l_selection_or(), l_selection_sub(), l_selection_setpoint(),
// l_selection_iterate(), and l_selection_randline().
import {
    ANY_LOC,
    COLNO,
    ROWNO,
    SP_COORD_PACK,
    SP_COORD_PACK_RANDOM,
} from './const.js';
import { get_location_coord } from './room_coordinates.js';
import { luaL_checkinteger, nhl_pcall_handle } from './nhlua.js';
import { rn2 } from './rng.js';
import { selection_do_randline } from './selvar.js';
import { selection_map_frame, selection_new, ThemeroomSelection } from './themerooms.js';

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

// C ref: nhlsel.c l_selection_iterate(), sel:iterate(fn) in a level
// program's Lua state `env.lua`. The y-major walk (ThemeroomSelection
// iterate()) hands `callback` each point converted to map-relative
// coordinates, as cvt_to_relcoord() does with the des.map() frame `origin`;
// the callback only changes the map, never the selection, so the points are
// read first and the async callback awaited for each. Each call is
// protected (nhl_pcall_handle(..., "l_selection_iterate",
// NHLpa_impossible)): a Lua error in it prints impossible() and ends the
// loop, "to prevent possible error cascade", and the level program goes on.
// `site` describes the Lua source for the traceback: `line`, the caller's
// line of the sel:iterate() call, and `callee`, the callback's frame name
// ("function 'f'") and `lines`, the line it calls each des.* field from.
export async function l_selection_iterate(selection, callback, origin, site,
    env) {
    const { lua, state } = env;
    const frames = lua?.frames;
    const caller = frames?.at(-1);
    if (caller?.lua) caller.currentline = site.line;
    const points = [];
    selection.iterate((x, y) => points.push([x, y]), origin);
    frames?.push({ desc: "method 'iterate'" });
    try {
        for (const [x, y] of points) {
            const failed = await nhl_pcall_handle(lua, async () => {
                frames?.push({
                    lua: true,
                    desc: site.callee.desc,
                    lines: site.callee.lines,
                    currentline: 0,
                });
                await callback(x, y);
                frames?.pop();
            }, 'l_selection_iterate', state);
            if (failed) break; /* abort loops to prevent possible error cascade */
        }
    } finally {
        frames?.pop();
    }
}

// C nhlsel.c l_selection_or(): Lua __bor and __add. Preserve each numeric
// selection value, the C x-major/y-minor evaluation order, and the left input's
// JavaScript coordinate-frame marker (both C operands share one map frame).
export function l_selection_or(a, b) {
    checkSelection(a);
    checkSelection(b);
    if (a.absolute !== b.absolute
        || a.origin?.xstart !== b.origin?.xstart
        || a.origin?.ystart !== b.origin?.ystart) {
        a = selection_map_frame(a);
        b = selection_map_frame(b);
    }
    const bounds = rectBounds(selectionBounds(a), selectionBounds(b));
    const result = new ThemeroomSelection(null, a.absolute, a.origin);
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
    if (a.absolute !== b.absolute
        || a.origin?.xstart !== b.origin?.xstart
        || a.origin?.ystart !== b.origin?.ystart) {
        a = selection_map_frame(a);
        b = selection_map_frame(b);
    }
    const bounds = rectBounds(selectionBounds(a), selectionBounds(b));
    const result = new ThemeroomSelection(null, a.absolute, a.origin);
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

    if (!selection.absolute && selection.origin) {
        // A later map may put this point before the creation origin. Resolve
        // the existing selection first so a valid map point is not clipped
        // merely because its old relative coordinate would be negative.
        const absolute = selection_map_frame(selection);
        selection.points = absolute.points;
        selection.absolute = true;
        selection.origin = null;
    }
    if (!selection.absolute) {
        coordinate.x -= (selection.origin ?? env.frame).xstart;
        coordinate.y -= (selection.origin ?? env.frame).ystart;
    }
    selection.set(coordinate.x, coordinate.y, value);
    return selection;
}

// C nhlsel.c l_selection_randline(), for its selection.randline(sel, x1, y1,
// x2, y2, roughness) and selection.randline(x1, y1, x2, y2, roughness)
// forms. Both endpoints pass through get_location_coord(), so Lua-relative
// coordinates become map coordinates before selection_do_randline() checks
// its midpoints against the map edges. The C selection argument is always a
// fresh selection.new() at the call sites, and C draws into a clone of it, so
// this returns a fresh map-coordinate selection. `env` carries the active
// frame and coder, as for l_selection_setpoint(). C passes the int roughness
// to selvar.c's schar parameter, which the pinned Clang recorder narrows to
// eight bits.
export function l_selection_randline(x1, y1, x2, y2, roughness, env, random = rn2) {
    const croom = env.coder?.croom ?? null;
    const start = get_location_coord(
        { x: x1, y: y1 }, ANY_LOC, croom, SP_COORD_PACK(x1, y1), env,
    );
    const end = get_location_coord(
        { x: x2, y: y2 }, ANY_LOC, croom, SP_COORD_PACK(x2, y2), env,
    );
    const sel = new ThemeroomSelection(null, true);
    const rough = new Int8Array([roughness])[0];
    selection_do_randline(start.x, start.y, end.x, end.y, rough, 12, sel, random);
    return sel;
}
