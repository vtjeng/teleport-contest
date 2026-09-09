// Source-pinned tests for the cmd.c span doprev_message through do_run_east().

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CMDQ_DIR,
    CMDQ_INT,
    CMDQ_USER_INPUT,
    CQ_CANNED,
    DIR_E,
    DIR_N,
    DIR_NE,
    DIR_NW,
    DIR_S,
    DIR_SE,
    DIR_SW,
    DIR_W,
    ECMD_TIME,
    ECMD_OK,
    MAX_TYPE,
    ROOM,
    SCORR,
    SDOOR,
    TREE,
} from '../js/const.js';
import {
    cmdq_add_dir,
    cmdq_add_int,
    cmdq_add_userinput,
    cmdq_copy,
    cmdq_reverse,
    cmdq_shift,
    doprev_message,
    do_move_east,
    do_move_north,
    do_move_northeast,
    do_move_northwest,
    do_move_south,
    do_move_southeast,
    do_move_southwest,
    do_move_west,
    do_rush_east,
    do_rush_north,
    do_rush_west,
    do_run_east,
    dolookaround_floodfill_findroom,
    levltyp_to_name,
    u_have_seen_whole_selection,
} from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { remove_achievement } from '../js/insight.js';
import { toggle_bool_option } from '../js/options.js';
import { selection_new } from '../js/themerooms.js';

function moveState() {
    return {
        context: { travel: 1, travel1: 1, run: 9 },
        domoveAttempting: 0,
        iflags: {},
        u: { dx: 0, dy: 0, dz: 0 },
    };
}

test('cmdq_add_dir/userinput/int, shift, copy, and reverse preserve source order', () => {
    const state = {};
    cmdq_add_dir(CQ_CANNED, -1, 1, 0, state);
    cmdq_add_userinput(CQ_CANNED, state);
    cmdq_add_int(CQ_CANNED, 7, state);
    cmdq_shift(CQ_CANNED, state);
    assert.equal(state.command_queue[0][0].typ, CMDQ_INT);
    assert.deepEqual(cmdq_copy(CQ_CANNED, state), state.command_queue[0]);
    const copy = cmdq_copy(CQ_CANNED, state);
    copy[0].value = 8;
    assert.equal(state.command_queue[0][0].value, 7);

    const first = { value: 1, next: { value: 2, next: null } };
    const reversed = cmdq_reverse(first);
    assert.equal(reversed.value, 2);
    assert.equal(reversed.next.value, 1);
    assert.equal(reversed.next.next, null);
    assert.equal(state.command_queue[0][1].typ, CMDQ_DIR);
    assert.equal(state.command_queue[0][2].typ, CMDQ_USER_INPUT);
});

test('doprev_message records the discarded window-port gap and keeps time', () => {
    // C ref: cmd.c doprev_message():164-169. nh_doprev_message() returns a
    // value that C discards, so the command remains ECMD_OK while the port
    // records the missing window helper.
    game.unported = new Set();
    assert.equal(doprev_message(game), ECMD_OK);
    assert.deepEqual([...game.unported], ['nhwindows.c nh_doprev_message']);
});

test('movement wrappers pin direction and source run modes', () => {
    const cases = [
        [do_move_west, DIR_W, 0, -1, 0],
        [do_move_northwest, DIR_NW, 0, -1, -1],
        [do_move_north, DIR_N, 0, 0, -1],
        [do_move_northeast, DIR_NE, 0, 1, -1],
        [do_move_east, DIR_E, 0, 1, 0],
        [do_move_southeast, DIR_SE, 0, 1, 1],
        [do_move_south, DIR_S, 0, 0, 1],
        [do_move_southwest, DIR_SW, 0, -1, 1],
        [do_rush_west, DIR_W, 3, -1, 0],
        [do_rush_north, DIR_N, 3, 0, -1],
        [do_rush_east, DIR_E, 3, 1, 0],
        [do_run_east, DIR_E, 1, 1, 0],
    ];
    for (const [handler, _dir, run, dx, dy] of cases) {
        const state = moveState();
        assert.equal(handler(state), ECMD_TIME);
        assert.equal(state.u.dx, dx);
        assert.equal(state.u.dy, dy);
        assert.equal(state.u.dz, 0);
        assert.equal(state.context.run, run);
        assert.equal(state.context.travel, 0);
        assert.equal(state.context.travel1, 0);
        assert.equal(state.domoveAttempting, run === 0 ? 1 : 2);
    }
});

test('levltyp_to_name follows the complete MAX_TYPE table', () => {
    assert.equal(levltyp_to_name(0), 'stone');
    assert.equal(levltyp_to_name(ROOM), 'room');
    assert.equal(levltyp_to_name(MAX_TYPE - 1), 'cloud');
    assert.equal(levltyp_to_name(-1), null);
    assert.equal(levltyp_to_name(MAX_TYPE), null);
});

test('lookaround room flood predicates reject source wall and secret terrain', () => {
    const state = { level: { at: () => ({ typ: ROOM }) } };
    assert.equal(dolookaround_floodfill_findroom(1, 1, state), true);
    for (const typ of [TREE, SCORR, SDOOR]) {
        state.level.at = () => ({ typ });
        assert.equal(dolookaround_floodfill_findroom(1, 1, state), false);
    }
});

test('u_have_seen_whole_selection treats only selected unseen squares as hidden', () => {
    const selection = selection_new().set(2, 2).set(3, 2);
    const state = {
        level: {
            at: (x, y) => ({
                disp_glyph: x === 2 && y === 2 ? { glyph: 1 } : undefined,
            }),
        },
    };
    assert.equal(u_have_seen_whole_selection(selection, state), false);
    state.level.at = () => ({ disp_glyph: { glyph: 1 } });
    assert.equal(u_have_seen_whole_selection(selection, state), true);
});

test('toggle_bool_option changes the one C-owned boolean and rejects non-booleans', async () => {
    const state = { flags: { pickup: false }, go: {}, iflags: {} };
    assert.equal(await toggle_bool_option('autopickup', state), 0);
    assert.equal(state.flags.pickup, true);
    assert.equal(await toggle_bool_option('windowtype', state), 0x04);
});

test('remove_achievement compacts the zero-terminated achievement list', () => {
    const state = { u: { uachieved: [3, -10, 11, 0] } };
    assert.equal(remove_achievement(10, state), true);
    assert.deepEqual(state.u.uachieved, [3, 11, 0, 0]);
    assert.equal(remove_achievement(10, state), false);
});

void game;
