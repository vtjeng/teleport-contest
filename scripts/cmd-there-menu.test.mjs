// Source-pinned tests for cmd.c there_cmd_menu_self() through end_of_input().

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    act_on_act,
    click_to_cmd,
    cmdq_copy,
    domouseaction,
    end_of_input,
    get_count,
    hangup,
    MCMD,
    there_cmd_menu_self,
} from '../js/cmd.js';
import { CMDQ_DIR, CQ_CANNED, ROOM } from '../js/const.js';
import { GameDisplay } from '../js/game_display.js';
import { GameMap } from '../js/game.js';
import { commands_init } from '../js/cmd.js';
import { game, resetGame } from '../js/gstate.js';

function menuState() {
    return {
        level: new GameMap(),
        u: { ux: 10, uy: 10, ulevel: 1, weapon_skills: [] },
        youmonst: { data: { mflags1: 0, msize: 2, mattk: [] } },
        flags: {},
        iflags: {},
        invent: null,
        svs: { spl_book: [] },
        stairs: null,
    };
}

test('there_cmd_menu_self adds the source-order resting entries at the hero', () => {
    const state = menuState();
    state.level.at(10, 10).typ = ROOM;
    const items = [];
    const count = there_cmd_menu_self(items, 10, 10, { value: MCMD.NOTHING }, state);

    // cmd.c adds Rest, Search, and Look here after optional terrain/object
    // actions; an empty ordinary room therefore has exactly these three.
    assert.equal(count, 3);
    assert.deepEqual(items.map((item) => item.value), [
        MCMD.REST, MCMD.SEARCH, MCMD.LOOK_HERE,
    ]);
});

test('act_on_act queues C commands and preserves the source direction delta', () => {
    const state = { u: { ux: 10, uy: 10 }, iflags: {}, context: {} };
    act_on_act(MCMD.OPEN_DOOR, 2, -4, state);
    const queued = cmdq_copy(CQ_CANNED, state);

    assert.equal(queued[0].ec_entry.ef_funct, 'doopen');
    assert.deepEqual(queued[1], { typ: CMDQ_DIR, dx: 1, dy: -1, dz: 0 });
});

test('domouseaction maps a non-travel sloppy click to the walk command', async () => {
    const state = {
        u: { ux: 10, uy: 10 },
        flags: { travelcmd: false },
        iflags: {},
        clicklook_cc: { x: 17, y: 11 },
    };
    assert.equal(await domouseaction(state), 0);
    const queued = cmdq_copy(CQ_CANNED, state);
    assert.equal(queued[0].ec_entry.ef_funct, 'do_move_east');
});

test('get_count clamps to LARGEST_INT and returns the first non-digit', async () => {
    resetGame();
    game.nhDisplay = new GameDisplay(null);
    game.iflags = {};
    game.program_state = { input_state: 'command' };
    game.flags = {};
    for (const key of '99999x') game.nhDisplay.pushKey(key.charCodeAt(0));
    const result = await get_count(null, 0, 32767, null, 0, game);

    assert.equal(result.key, 'x'.charCodeAt(0));
    assert.equal(result.count, 32767);
});

test('click_to_cmd uses the internal clicklook handler as C mouse button two does', () => {
    const state = { iflags: {}, command_bindings: undefined };
    commands_init(state);
    click_to_cmd(12, 8, 2, state);
    assert.equal(state.clicklook_cc.x, 12);
    assert.equal(state.command_queue[0][0].ec_entry.ef_funct, 'doclicklook');
});

test('hangup defers a save during the move loop and end_of_input marks exit', () => {
    const deferred = {
        program_state: {
            in_moveloop: 1,
            something_worth_saving: 1,
        },
    };
    assert.equal(hangup(1, deferred), undefined);
    assert.equal(deferred.program_state.done_hup, 1);
    assert.equal(deferred.program_state.gameover, undefined);

    const ending = { program_state: { something_worth_saving: 0 } };
    assert.equal(end_of_input(ending), 0);
    assert.equal(ending.program_state.gameover, true);
    assert.equal(ending.program_state.exiting, 1);
});
