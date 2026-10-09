// Source-pinned tests for nhlua.c's persistent-core lifecycle and error
// boundary. The test state exposes only the JS text-backed shape; it never
// creates or evaluates a Lua VM.

import assert from 'node:assert/strict';
import test from 'node:test';

import { game, resetGame } from '../js/gstate.js';
import {
    l_nhcore_call,
    l_nhcore_done,
    nhl_error,
} from '../js/nhlua.js';
import { initUnported } from '../js/unported.js';

function freshGame() {
    resetGame();
    initUnported();
}

test('nhlua.c l_nhcore_done clears core state and records unavailable teardown',
    () => {
    freshGame();
    game.gl = { luacore: {} };

    l_nhcore_done();

    assert.equal(game.gl.luacore, null);
    assert.deepEqual([...game.unported], [
        'nhlua.c nhl_done',
        'nhlua.c end_luapat',
    ]);
});

test('nhlua.c l_nhcore_call guards indices and unavailable cores', () => {
    freshGame();

    l_nhcore_call(-1);
    l_nhcore_call(7);
    l_nhcore_call(0);
    assert.deepEqual([...game.unported], []);

    game.gl = { luacore: { nhcore: 'not a table' } };
    l_nhcore_call(0);
    assert.deepEqual([...game.unported], ['nhlua.c nhl_done']);
    assert.equal(game.gl.luacore, null);
});

test('nhlua.c l_nhcore_call disables missing functions and skips Lua pcall',
    () => {
    freshGame();
    let called = false;
    game.gl = {
        luacore: {
            nhcore: {
                start_new_game: 'not a function',
                restore_old_game: () => { called = true; },
            },
        },
    };

    // C l_nhcore_call() marks a non-function unavailable and does not try it
    // again on a later call.
    l_nhcore_call(0);
    l_nhcore_call(0);
    assert.equal(game.gl.nhcore_call_available[0], false);
    assert.deepEqual([...game.unported], []);

    // C's nhl_pcall_handle() invokes the Lua callback. The JS boundary records
    // that missing callee and deliberately leaves the supplied function alone.
    l_nhcore_call(1);
    assert.equal(called, false);
    assert.deepEqual([...game.unported], ['nhlua.c nhl_pcall_handle']);
});

test('nhlua.c nhl_error preserves message, line, and short source', () => {
    freshGame();
    assert.throws(
        () => nhl_error({ currentline: 37, short_src: 'nhcore.lua' }, 'bad'),
        (error) => error instanceof Error
            && error.message === 'bad (line 37 nhcore.lua)',
    );
    assert.throws(
        () => nhl_error({ debug: { currentline: 4, short_src: '@x.lua' } }, 'oops'),
        /oops \(line 4 @x\.lua\)/u,
    );
});

test('bounded load_lua repeats the source nhlib shuffle and clears in_lua', async () => {
    const { readFileSync } = await import('node:fs');
    const { load_lua } = await import('../js/nhlua.js');
    assert.equal(typeof load_lua, 'function');
    const source = readFileSync('nethack-c/upstream/src/nhlua.c', 'utf8');
    const init = source.slice(source.indexOf('nhl_init(nhl_sandbox_info'), source.indexOf('RESTORE_WARNING_CONDEXPR', source.indexOf('nhl_init(nhl_sandbox_info')));
    const load = source.slice(source.indexOf('load_lua(const char'), source.indexOf('DISABLE_WARNING_FORMAT_NONLITERAL', source.indexOf('load_lua(const char')));
    assert.match(init, /iflags.in_lua = TRUE;[\s\S]*nhl_loadlua\(L, "nhlib.lua"\)/u);
    assert.match(load, /nhl_init\(sbi\)[\s\S]*nhl_loadlua\(L, name\)[\s\S]*nhl_done\(L\)/u);
    const done = source.slice(source.indexOf('nhl_done(lua_State'), source.indexOf('boolean\nload_lua'));
    assert.match(done, /iflags.in_lua = FALSE;/u);
    const library = readFileSync('nethack-c/upstream/dat/nhlib.lua', 'utf8');
    assert.match(library, /align = \{ "law", "neutral", "chaos" \};\s*shuffle\(align\);/u);
    freshGame();
    game.iflags = { in_lua: false }; // C iflags exists before any command.
    const draws = [];
    const result = load_lua('nhlib.lua', {}, game, { random(bound) {
        assert.equal(game.iflags.in_lua, true);
        draws.push(bound);
        return 0; // A valid draw in both the three- and two-entry shuffle.
    } });
    assert.equal(result, undefined); // No fabricated consumed Lua-state/result.
    assert.deepEqual(draws, [3, 2, 3, 2]); // Implicit then explicit library load.
    assert.equal(game.iflags.in_lua, false);
    assert.deepEqual([...game.unported], ['nhlua.c nhlL_newstate', 'nhlua.c nhl_done']);
});

test('bounded load_lua initializes before a named arbitrary-program gap', async () => {
    const { load_lua } = await import('../js/nhlua.js');
    assert.equal(typeof load_lua, 'function');
    freshGame();
    game.iflags = { in_lua: false }; // Source-valid command state.
    const draws = [];
    load_lua('other.lua', {}, game, { random: bound => { draws.push(bound); return 0; } });
    assert.deepEqual(draws, [3, 2]); // C initializes before requested-file lookup.
    assert.equal(game.iflags.in_lua, false);
    assert.deepEqual([...game.unported], [
        'nhlua.c nhlL_newstate', 'nhlua.c nhl_loadlua', 'nhlua.c nhl_done',
    ]);
});
