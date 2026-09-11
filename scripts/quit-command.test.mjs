import assert from 'node:assert/strict';
import test from 'node:test';

import {
    ECMD_OK,
    KILLED_BY_AN,
    UTOTYPE_ATSTAIRS,
    UTOTYPE_DEFERRED,
} from '../js/const.js';
import {
    done2,
    UnsupportedEndOfGameError,
} from '../js/end.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    loadQuitCommandRecipe,
    NO,
    QUIT_COMMAND,
} from './run-quit-command.mjs';

const RECIPE_SEGMENT = loadQuitCommandRecipe().segments[0];

async function startedGame() {
    // The leading wait reaches the initialized map, so done2() can perform
    // its C-order cursor flush and map wait in the focused tests below.
    await runSegment({ ...RECIPE_SEGMENT, moves: '.' });
    return game;
}

test('#quit is wired through doextcmd and its cancellation spends no turn',
    async () => {
        let boundary = null;
        await runSegment(RECIPE_SEGMENT, {
            onBoundary: (error) => { boundary = error; },
        });
        assert.equal(boundary, null);
        assert.equal(game.program_state.gameover, undefined);
        assert.equal(game.u.umortality, 0);
    });

test('done2 cancellation clears an active multi-turn action', async () => {
    const state = await startedGame();
    const movesBefore = state.moves;
    // A positive multi count exercises done2()'s nomul(0) branch; these
    // fields are the C values nomul(0) clears while ending the action.
    state.multi = 2;
    state.u.uinvulnerable = true;
    state.u.usleep = 7;
    state.readchar_queue = [NO.charCodeAt(0)];

    assert.equal(await done2(state), ECMD_OK);
    assert.equal(state.moves, movesBefore);
    assert.equal(state.multi, 0);
    assert.equal(state.u.uinvulnerable, false);
    assert.equal(state.u.usleep, 0);
    // clear_nhwindow(WIN_MESSAGE) removes the prompt from the terminal row;
    // the logical message history remains available in _ttyToplines.
    assert.equal(state.nhDisplay.toplin, 0);
    assert.equal(state.nhDisplay.grid[0].map(({ ch }) => ch).join('').trim(), '');
});

test('done2 leaves a negative multi count untouched on cancellation', async () => {
    const state = await startedGame();
    // C calls nomul(0) only when gm.multi > 0, and its later equality test
    // also skips this negative count; the interrupted action remains active.
    state.multi = -1;
    state.u.uinvulnerable = true;
    state.u.usleep = 7;
    state.readchar_queue = [NO.charCodeAt(0)];

    assert.equal(await done2(state), ECMD_OK);
    assert.equal(state.multi, -1);
    assert.equal(state.u.uinvulnerable, true);
    assert.equal(state.u.usleep, 7);
});

test('done2 abandons the tutorial and schedules the return level', async () => {
    const state = await startedGame();
    // In_tutorial() compares the current dungeon number with the configured
    // tutorial dungeon; setting both here reaches the source branch without
    // entering a tutorial map through startup.
    state.tutorial_dnum = state.u.uz.dnum;
    state.u.ucamefrom = { dnum: 0, dlevel: 2 };
    state.readchar_queue = ['y'.charCodeAt(0)];

    assert.equal(await done2(state), ECMD_OK);
    assert.equal(
        state.u.utotype & UTOTYPE_ATSTAIRS,
        UTOTYPE_ATSTAIRS,
    );
    assert.equal(
        state.u.utotype & UTOTYPE_DEFERRED,
        UTOTYPE_DEFERRED,
    );
    assert.deepEqual(state.u.utolev, { dnum: 0, dlevel: 2 });
    assert.equal(state.gd.dfr_pre_msg, 'Resuming regular play.');
});

test('accepted ordinary quit keeps the existing done(QUIT) boundary',
    async () => {
        const state = await startedGame();
        state.readchar_queue = ['y'.charCodeAt(0)];

        await assert.rejects(
            done2(state),
            (error) => {
                assert.ok(error instanceof UnsupportedEndOfGameError);
                assert.match(error.message, /really_done\(13\)/u);
                return true;
            },
        );
        assert.deepEqual(state.killer, {
            name: 'quit',
            format: KILLED_BY_AN,
        });
    });

test('the quit recipe contains replay inputs only', () => {
    assert.equal(loadQuitCommandRecipe().version, 5);
    assert.deepEqual(RECIPE_SEGMENT.moves, `.#quit\n${NO}.`);
    assert.equal(RECIPE_SEGMENT.moves.startsWith(`.${QUIT_COMMAND}`), true);
    assert.equal(Object.hasOwn(RECIPE_SEGMENT, 'steps'), false);
});
