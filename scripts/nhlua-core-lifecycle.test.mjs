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
