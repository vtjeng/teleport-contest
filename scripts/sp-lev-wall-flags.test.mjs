// Source-pinned tests for sp_lev.c's wall-flag and wallify des functions:
// lspo_wall_property(), set_wallprop_in_selection() through
// lspo_non_diggable() and lspo_non_passwall(), and lspo_wallify(). No level
// under dat/ calls des.wall_property(); only test/test_des.lua does, so no
// recording reaches it and its branches are pinned here. Every expected
// value is read from the C function the test names.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import {
    COLNO,
    HWALL,
    IRONBARS,
    ROOM,
    ROWNO,
    STONE,
    TREE,
    VWALL,
    W_NONDIGGABLE,
    W_NONPASSWALL,
} from '../js/const.js';
import { game, resetGame } from '../js/gstate.js';
import { mklev } from '../js/mklev.js';
import { monst_globals_init } from '../js/monsters.js';
import { objects_globals_init } from '../js/objects.js';
import { initRng } from '../js/rng.js';
import {
    str2align,
    str2gend,
    str2race,
    str2role,
} from '../js/roles.js';
import { selection_area } from '../js/themerooms.js';
import { timeout_globals_init } from '../js/timeout.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');

// The des.* functions are reached only through createSpecialLevelApi(), so
// each case runs mklev() with an injected loader the way makelevel() runs a
// des-file. The loader throws this sentinel after its work so that finish()
// never runs; the loader's own writes are the only result under test.
class LoaderDone extends Error {}

async function runLoader(seed, body) {
    resetGame();
    objects_globals_init(game);
    monst_globals_init(game);
    timeout_globals_init(game);
    initRng(seed);
    game.fixedDatetime = '20400314015926';
    game.recorderIsDst = false;
    game.moves = 0;
    game.plname = 'WallFlagTest';
    game.flags = {
        initrole: str2role('Tourist'),
        initrace: str2race('human'),
        initgend: str2gend('female'),
        initalign: str2align('neutral'),
        female: true,
        bones: false,
    };
    game.iflags = {};
    game.u = { uroleplay: {} };
    game.context = { move: 0 };
    await newgame_pre_mklev(game);
    let result = null;
    await assert.rejects(
        mklev({
            specialLevelLoader: async (des) => {
                result = await body(des);
                throw new LoaderDone();
            },
        }),
        (error) => error instanceof LoaderDone,
    );
    return result;
}

const wallInfo = (x, y) => game.level.at(x, y).wall_info ?? 0;

// C ref: sp_lev.c sel_set_wall_property(): only STWALL, TREE, and IRONBARS
// squares take the flag. A row of those three followed by a floor square
// is the fixture every case paints.
function paintFlagRow(x, y) {
    game.level.at(x, y).typ = VWALL;
    game.level.at(x + 1, y).typ = TREE;
    game.level.at(x + 2, y).typ = IRONBARS;
    game.level.at(x + 3, y).typ = ROOM;
}

// C ref: sp_lev.c lspo_wall_property(). The pinned facts: the property
// options are "nondiggable" then "nonpasswall" with "nondiggable" the
// default, each absent corner defaults to the frame plus one, and both
// corners go through get_location() before set_wall_property().
test('lspo_wall_property is the C function with the property options and frame defaults', () => {
    const start = C_SOURCE.indexOf('\nlspo_wall_property(lua_State *L)');
    assert.ok(start > 0);
    const body = C_SOURCE.slice(start, C_SOURCE.indexOf('\n}\n', start));
    assert.match(body, /"nondiggable", "nonpasswall", NULL/);
    assert.match(body, /get_table_option\(L, "property", "nondiggable", wprops\)/);
    assert.match(body, /if \(dx1 == -1\)\n\s+dx1 = gx\.xstart - 1;/);
    assert.match(body, /dy2 = gy\.ystart \+ gy\.ysize \+ 1;/);
    assert.match(body, /get_location\(&dx1, &dy1, ANY_LOC, \(struct mkroom \*\) 0\);/);
    assert.match(body, /set_wall_property\(dx1, dy1, dx2, dy2, wprop\);/);
});

test('wall_property flags the walls, trees, and bars of a corner rectangle', async () => {
    // Any seed serves: the loader replaces the level's generation.
    await runLoader(0x7a11, (des) => {
        // (5, 5) is an arbitrary interior square; the frame offsets it to
        // map coordinates the way get_location() adds xstart/ystart.
        const x = des.frame.xstart + 5;
        const y = des.frame.ystart + 5;
        paintFlagRow(x, y);
        // A wall one square past the rectangle's x2 must stay unflagged.
        game.level.at(x + 4, y).typ = VWALL;
        des.wall_property({
            x1: 5, y1: 5, x2: 8, y2: 5, property: 'nonpasswall',
        });
        assert.equal(wallInfo(x, y), W_NONPASSWALL);
        assert.equal(wallInfo(x + 1, y), W_NONPASSWALL);
        assert.equal(wallInfo(x + 2, y), W_NONPASSWALL);
        // ROOM is not STWALL, TREE, or IRONBARS: left alone.
        assert.equal(wallInfo(x + 3, y), 0);
        assert.equal(wallInfo(x + 4, y), 0);
    });
});

test('wall_property reads the region form and defaults to nondiggable', async () => {
    await runLoader(0x7a12, (des) => {
        const x = des.frame.xstart + 5;
        const y = des.frame.ystart + 5;
        paintFlagRow(x, y);
        // get_table_coords_or_region(): with x1..y2 absent, `region` is
        // read; with `property` absent, wprops[0] is nondiggable.
        des.wall_property({ region: [5, 5, 8, 5] });
        assert.equal(wallInfo(x, y), W_NONDIGGABLE);
        assert.equal(wallInfo(x + 2, y), W_NONDIGGABLE);
        assert.equal(wallInfo(x + 3, y), 0);
    });
});

// C ref: sp_lev.c get_table_coords_or_region(): with x1, y1, x2, and y2 all
// absent it reads `region` through get_table_region() with optional FALSE,
// whose luaL_checktype() errors on nil. So the frame defaults of
// lspo_wall_property() apply only to the corners left absent beside a
// given one.
test('wall_property with no corners and no region is an error', async () => {
    await runLoader(0x7a13, (des) => {
        assert.throws(
            () => des.wall_property({ property: 'nondiggable' }),
            /table expected, got nil/,
        );
    });
});

// C ref: sp_lev.c lspo_wall_property() with only x1 given, on the whole-map
// frame reset_xystart_size() sets (xstart 1, ystart 0, xsize COLNO - 1,
// ysize ROWNO): dy1 defaults to ystart - 1 = -1, dx2 to COLNO + 1, and dy2
// to ROWNO + 1. get_location() adds the frame to both corners since each
// x is non-negative, giving (1, -1) and (COLNO + 2, ROWNO + 1).
// set_wall_property() clamps the rectangle to the map, so its two extreme
// walls at (1, 0) and (COLNO - 1, ROWNO - 1) are both flagged.
test('wall_property with only x1 defaults the other corners to the frame', async () => {
    await runLoader(0x7a1a, (des) => {
        assert.equal(des.frame.xstart, 1);
        assert.equal(des.frame.ystart, 0);
        game.level.at(1, 0).typ = VWALL;
        game.level.at(COLNO - 1, ROWNO - 1).typ = VWALL;
        des.wall_property({ x1: 0, property: 'nondiggable' });
        assert.equal(wallInfo(1, 0), W_NONDIGGABLE);
        assert.equal(wallInfo(COLNO - 1, ROWNO - 1), W_NONDIGGABLE);
    });
});

test('wall_property rejects an unknown property name', async () => {
    await runLoader(0x7a14, (des) => {
        // luaL_checkoption() errors on a string outside wprops[].
        assert.throws(
            () => des.wall_property({ x1: 1, y1: 1, x2: 2, y2: 2, property: 'nonpassable' }),
            /invalid option 'nonpassable'/,
        );
    });
});

// C ref: sp_lev.c set_wallprop_in_selection() with no argument:
// selection_new() then selection_clear(sel, 1) selects the whole map, and
// selvar.c selection_iterate() walks x from max(1, lx), so a wall in column
// 0 is never visited while (1, 0) and the far corner are.
test('non_diggable with no selection flags every wall from column 1', async () => {
    await runLoader(0x7a15, (des) => {
        game.level.at(0, 5).typ = VWALL;
        game.level.at(1, 0).typ = VWALL;
        game.level.at(COLNO - 1, ROWNO - 1).typ = VWALL;
        des.non_diggable();
        assert.equal(wallInfo(0, 5), 0);
        assert.equal(wallInfo(1, 0), W_NONDIGGABLE);
        assert.equal(wallInfo(COLNO - 1, ROWNO - 1), W_NONDIGGABLE);
    });
});

// C ref: sp_lev.c set_wallprop_in_selection() with one argument:
// l_selection_check() reads it and only its squares are visited. The
// selection's coordinates are Lua-relative, so the frame offsets them.
test('non_passwall with a selection flags only the selected walls', async () => {
    await runLoader(0x7a16, (des) => {
        const x = des.frame.xstart + 5;
        const y = des.frame.ystart + 5;
        paintFlagRow(x, y);
        game.level.at(x + 4, y).typ = VWALL;
        // selection.area(5,5, 7,5): the wall, tree, and bars, not the wall
        // at relative x 9.
        des.non_passwall(selection_area(5, 5, 7, 5));
        assert.equal(wallInfo(x, y), W_NONPASSWALL);
        assert.equal(wallInfo(x + 1, y), W_NONPASSWALL);
        assert.equal(wallInfo(x + 2, y), W_NONPASSWALL);
        assert.equal(wallInfo(x + 3, y), 0);
        assert.equal(wallInfo(x + 4, y), 0);
    });
});

// C ref: sp_lev.c lspo_wallify(). With one argument all four of x1, y1,
// x2, y2 are read through get_table_int(), which errors on an absent
// field; the values are passed to wallify_map() as they are, without the
// frame offset, and a negative one defaults to the frame plus one.
test('lspo_wallify is the C function that requires all four corners', () => {
    const start = C_SOURCE.indexOf('\nlspo_wallify(lua_State *L)');
    assert.ok(start > 0);
    const body = C_SOURCE.slice(start, C_SOURCE.indexOf('\n}\n', start));
    assert.match(body, /if \(lua_gettop\(L\) == 1\) \{\n\s+dx1 = get_table_int\(L, "x1"\);/);
    assert.match(body, /wallify_map\(dx1 < 0 \? \(gx\.xstart - 1\) : dx1,/);
});

test('wallify with a table rejects a missing corner', async () => {
    await runLoader(0x7a17, (des) => {
        assert.throws(
            () => des.wallify({ x1: 1, x2: 5, y2: 5 }),
            /number has no integer representation/,
        );
    });
});

// C ref: sp_lev.c wallify_map(): a STONE square next to a ROOM square
// becomes HWALL when the floor lies in another row and VWALL when it lies
// in the same row.
test('wallify with no table walls the stone around a floor square', async () => {
    await runLoader(0x7a18, (des) => {
        // (10, 10) is an arbitrary interior square, well inside the
        // default rectangle.
        const x = des.frame.xstart + 10;
        const y = des.frame.ystart + 10;
        assert.equal(game.level.at(x, y).typ, STONE);
        game.level.at(x, y).typ = ROOM;
        des.wallify();
        assert.equal(game.level.at(x - 1, y).typ, VWALL);
        assert.equal(game.level.at(x + 1, y).typ, VWALL);
        assert.equal(game.level.at(x, y - 1).typ, HWALL);
        assert.equal(game.level.at(x - 1, y + 1).typ, HWALL);
        // Two squares away is not adjacent: still stone.
        assert.equal(game.level.at(x - 2, y).typ, STONE);
    });
});

test('wallify with a table walls only its absolute rectangle', async () => {
    await runLoader(0x7a19, (des) => {
        const x = des.frame.xstart + 10;
        const y = des.frame.ystart + 10;
        game.level.at(x, y).typ = ROOM;
        // The rectangle is the floor square and the square to its left,
        // in map coordinates: (x - 1, y) sees the floor in its row and
        // becomes VWALL, while the stone above the floor lies outside the
        // rectangle and stays stone.
        des.wallify({ x1: x - 1, y1: y, x2: x, y2: y });
        assert.equal(game.level.at(x - 1, y).typ, VWALL);
        assert.equal(game.level.at(x, y - 1).typ, STONE);
        assert.equal(game.level.at(x + 1, y).typ, STONE);
    });
});
