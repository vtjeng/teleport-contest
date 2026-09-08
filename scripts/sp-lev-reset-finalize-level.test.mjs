// Source-pinned tests for sp_lev.c lspo_reset_level() and
// lspo_finalize_level(), the pair the source marks "only needed for testing
// purposes". No level under dat/ calls them; the Lua test scripts under
// test/ do, and wizcmds.c wiz_load_splua(), which is not ported, calls them
// with no Lua state. No recording reaches them, so their effects are pinned
// here against the C function each test names.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { newgame_pre_mklev } from '../js/allmain.js';
import { ROOM, STONE } from '../js/const.js';
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
import { timeout_globals_init } from '../js/timeout.js';

const C_SOURCE = readFileSync('nethack-c/upstream/src/sp_lev.c', 'utf8');

function cFunctionBody(name) {
    const start = C_SOURCE.indexOf(`\n${name}(lua_State *L)`);
    assert.ok(start > 0, `${name} is defined in sp_lev.c`);
    return C_SOURCE.slice(start, C_SOURCE.indexOf('\n}\n', start));
}

// The des.* functions are reached only through createSpecialLevelApi(), so
// each case runs mklev() with an injected loader the way makelevel() runs a
// des-file. The loader throws this sentinel when it is done so that
// finish() never runs after it; the loader's own effects are the result.
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
    game.plname = 'ResetTest';
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

// C ref: sp_lev.c lspo_reset_level(): sets iflags.lua_testing, remakes the
// coder, calls makemap_prepost(TRUE, ...), sets gi.in_mklev, and runs
// oinit() then clear_level_structures(), in that order.
test('lspo_reset_level is the C function that clears the level for a rerun', () => {
    const body = cFunctionBody('lspo_reset_level');
    assert.match(body, /iflags\.lua_testing = TRUE;/);
    assert.match(body, /Free\(gc\.coder\);\n\s+gc\.coder = NULL;\n\s+\}\n\s+create_des_coder\(\);/);
    assert.match(body, /makemap_prepost\(TRUE, wtower\);\n\s+gi\.in_mklev = TRUE;\n\s+oinit\(\);[^\n]*\n\s+clear_level_structures\(\);/);
});

test('reset_level marks Lua testing, remakes the coder, and clears the level', async () => {
    // Any seed serves: the loader replaces the level's generation.
    await runLoader(0x4e51, (des) => {
        // A three-column map moves the frame off the whole-map default and
        // marks its squares in SpLev_Map; both must be reset.
        des.map(['...']);
        assert.notEqual(des.frame.xstart, 1);
        const painted = { x: des.frame.xstart, y: des.frame.ystart };
        assert.equal(game.level.at(painted.x, painted.y).typ, ROOM);
        assert.equal(des.frame.splevMap[painted.x][painted.y], 1);
        const before = game.level;
        game.in_mklev = false;

        des.reset_level();

        assert.equal(game.iflags.lua_testing, true);
        // sp_level_coder_init() -> reset_xystart_size(): the whole-map frame.
        assert.equal(des.frame.xstart, 1);
        assert.equal(des.frame.ystart, 0);
        assert.equal(des.frame.splevMap[painted.x][painted.y], 0);
        assert.ok(game.unported.has('cmd.c makemap_prepost'));
        assert.equal(game.in_mklev, true);
        // clear_level_structures(): a fresh level with no rooms.
        assert.notEqual(game.level, before);
        assert.equal(game.level.at(painted.x, painted.y).typ, STONE);
        assert.equal(game.level.nroom, 0);
    });
});

// C ref: sp_lev.c lspo_finalize_level(): after the load_special()
// sequence it runs level_finalize_topology(), fills every room, calls
// makemap_prepost(FALSE, ...), and clears iflags.lua_testing.
test('lspo_finalize_level is the C function that ends a Lua-driven level', () => {
    const body = cFunctionBody('lspo_finalize_level');
    assert.match(body, /link_doors_rooms\(\);\n\s+remove_boundary_syms\(\);/);
    assert.match(body, /if \(L && gc\.coder->premapped\)\n\s+premap_detect\(\);/);
    assert.match(body, /level_finalize_topology\(\);\n\n\s+for \(i = 0; i < svn\.nroom; \+\+i\) \{\n\s+fill_special_room\(&svr\.rooms\[i\]\);/);
    assert.match(body, /makemap_prepost\(FALSE, wtower\);\n\s+iflags\.lua_testing = FALSE;/);
});

test('finalize_level finishes the topology and clears Lua testing', async () => {
    await runLoader(0x4e52, (des) => {
        des.reset_level();
        assert.equal(game.iflags.lua_testing, true);
        // A lit room gives level_finalize_topology() something to
        // topologize and the fills a room to visit.
        des.room({ type: 'ordinary', x: 10, y: 5, w: 4, h: 3, lit: 1 });
        assert.equal(game.level.nroom, 1);

        des.finalize_level();

        assert.equal(game.iflags.lua_testing, false);
        // level_finalize_topology(): gi.in_mklev = FALSE and
        // gx.xstart = gy.ystart = 0.
        assert.equal(game.in_mklev, false);
        assert.equal(game.xstart, 0);
        assert.equal(game.ystart, 0);
        assert.ok(game.unported.has('cmd.c makemap_prepost'));
        // The room survived the pass with its floor intact.
        const room = game.level.rooms[0];
        assert.equal(game.level.at(room.lx, room.ly).typ, ROOM);
    });
});
