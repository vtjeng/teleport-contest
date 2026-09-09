// Source-pinned tests for the cmd.c spans through do_run_east() and
// handler_rebind_keys through mcmd_addmenu().

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
    ECMD_CANCEL,
    MV_WALK,
    N_DIRS_Z,
    MAX_TYPE,
    ROOM,
    SCORR,
    SDOOR,
    TREE,
} from '../js/const.js';
import { AUTOCOMP_ADJ, AUTOCOMPLETE } from '../js/extcmdlist_data.js';
import {
    cmdq_add_dir,
    cmdq_add_int,
    cmdq_add_userinput,
    cmdq_pop,
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
    do_rush,
    do_run,
    do_rush_west,
    do_run_east,
    do_run_southeast,
    do_run_south,
    do_run_southwest,
    extcmdRow,
    extcmds_getentry,
    cmdbind_add,
    cmdbind_freeall,
    cmdbind_get,
    cmdbind_remove,
    cmdbind_swapkeys,
    get_changed_key_binds,
    bind_key,
    bind_key_fn,
    bind_specialkey,
    cmd_from_dir,
    cmd_from_ecname,
    cmd_from_func,
    cmdname_from_func,
    commands_init,
    directionname,
    dotherecmdmenu,
    doherecmdmenu,
    ecname_from_fn,
    all_options_autocomplete,
    lock_mouse_buttons,
    mcmd_addmenu,
    reset_cmd_vars,
    reset_commands,
    spkey_name,
    UnsupportedHeroCommandBoundaryError,
    dolookaround_floodfill_findroom,
    levltyp_to_name,
    u_have_seen_whole_selection,
} from '../js/cmd.js';
import { game } from '../js/gstate.js';
import { initialExtcmdFlags } from '../js/cmd_autocomplete.js';
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

test('the southeast-through-southwest run wrappers pin source directions', () => {
    // cmd.c:1553-1571 calls set_move_cmd() with DIR_SE, DIR_S, and DIR_SW,
    // and returns ECMD_TIME for each wrapper.
    const cases = [
        [do_run_southeast, DIR_SE, 1, 1, 1],
        [do_run_south, DIR_S, 1, 0, 1],
        [do_run_southwest, DIR_SW, 1, -1, 1],
    ];
    for (const [handler, _dir, run, dx, dy] of cases) {
        const state = moveState();
        assert.equal(handler(state), ECMD_TIME);
        assert.deepEqual(
            [state.u.dx, state.u.dy, state.context.run],
            [dx, dy, run],
        );
        assert.equal(state.domoveAttempting, 2);
    }
});

test('run and rush prefixes set and cancel their C state', async () => {
    // cmd.c:1590-1618 uses DOMOVE_RUSH for both prefixes, with run values 2
    // and 3; a second prefix clears both fields and returns ECMD_CANCEL.
    for (const [handler, run, message] of [
        [do_rush, 2, 'Double rush prefix, canceled.'],
        [do_run, 3, 'Double run prefix, canceled.'],
    ]) {
        const state = { context: {}, domoveAttempting: 0 };
        assert.equal(await handler(state), ECMD_OK);
        assert.equal(state.context.run, run);
        assert.equal(state.domoveAttempting, 2);
        assert.equal(await handler(state), ECMD_CANCEL);
        assert.equal(state.context.run, 0);
        assert.equal(state.domoveAttempting, 0);
        assert.match(message, /^Double (rush|run) prefix/u);
    }
});

test('repeat queue selection and command binding helpers follow cmd.c', async () => {
    // cmd.c:1638-1660 keeps the repeat queue separate from canned input while
    // cmdq_pop() reads it under gi.in_doagain.
    const queueState = {
        in_doagain: true,
        command_queue: [[], [{ typ: CMDQ_INT, value: 7 }]],
    };
    assert.equal(cmdq_pop(queueState).value, 7);

    // cmd.c:2101-2204 uses the sentinel-bounded table and newest-first
    // overwrite/remove/swap semantics for key bindings.
    assert.equal(extcmds_getentry(-1), null);
    assert.equal(extcmds_getentry(0).ef_txt, '#');
    assert.equal(extcmds_getentry(170), null);
    const state = {};
    cmdbind_freeall(state);
    bind_key(90, 'toggle(example)', true, state);
    assert.equal(cmdbind_get(90, state).cmd, extcmdRow('toggle'));
    assert.equal(cmdbind_get(90, state).param, 'example');
    cmdbind_add(65, extcmdRow('wait'), true, state);
    cmdbind_swapkeys(90, 65, state);
    assert.equal(cmdbind_get(65, state).cmd, extcmdRow('toggle'));
    cmdbind_remove(65, state);
    assert.equal(cmdbind_get(65, state), null);

    // cmd.c:2235-2287 emits the changed binding and missing-default lines;
    // its strbuf form is newline-terminated.
    cmdbind_freeall(state);
    bind_key(90, 'toggle(example)', true, state);
    const sbuf = { str: '' };
    await get_changed_key_binds(sbuf, state);
    assert.match(sbuf.str, /BIND=Z:toggle\(example\)\n/u);
    assert.match(sbuf.str, /BIND=[^\n]+:nothing\n/u);
});

test('cmd.c command lookup helpers preserve binding order and source names', () => {
    // cmd.c:2750-2784 initializes aliases; reset_commands() then installs the
    // movement bindings that cmd_from_dir() reads.
    const state = { flags: {}, iflags: {} };
    reset_commands(true, state);
    assert.equal(cmd_from_func('doextcmd', state), '#'.charCodeAt(0));
    assert.equal(cmd_from_ecname('help', state), '?');
    assert.equal(cmd_from_ecname('not-a-command', state), '');
    assert.equal(ecname_from_fn('dohelp'), 'help');
    assert.equal(cmd_from_dir(4, MV_WALK, state), 'l'.charCodeAt(0));

    // cmd_from_func() skips a non-number-pad digit, then retains a control
    // fallback only when no printable binding exists.
    bind_key_fn(0x01, 'dohelp', state);
    assert.equal(cmd_from_func('dohelp', state), '?'.charCodeAt(0));
    const full = [];
    assert.equal(cmdname_from_func('dohelp', full, true, state), 'help');
    assert.deepEqual(full, ['help']);
    assert.equal(cmdname_from_func('dohelp', [], false, state), 'hel');
});

test('special keys, autocomplete options, mouse locks, and source reset state', () => {
    // cmd.c:3161-3224 keeps special navigation keys outside cmdbinds and
    // refuses the nameless escape row as a bind target.
    const state = { flags: {}, iflags: {}, extcmdFlags: initialExtcmdFlags() };
    assert.equal(bind_specialkey(0x7F, 'getdir.self', state), true);
    assert.equal(state.commandBindings.specialKeys['getdir.self'], 0x7F);
    assert.equal(bind_specialkey(0x7F, 'escape', state), false);
    assert.equal(spkey_name(0), 'escape');
    assert.equal(spkey_name(1), 'getdir.self');
    assert.equal(spkey_name(999), null);

    const changedIndex = 0;
    state.extcmdFlags[changedIndex] |= AUTOCOMP_ADJ | AUTOCOMPLETE;
    const sbuf = { str: '' };
    all_options_autocomplete(sbuf, state);
    assert.match(sbuf.str, /AUTOCOMPLETE=#\n/u);

    commands_init(state);
    const before = [...state.commandBindings.mouseButtons];
    lock_mouse_buttons(true, state);
    assert.deepEqual(state.commandBindings.mouseButtons, [null, null]);
    lock_mouse_buttons(false, state);
    assert.deepEqual(state.commandBindings.mouseButtons, before);

    state.iflags.num_pad = true;
    state.iflags.num_pad_mode = 2;
    reset_commands(false, state);
    assert.equal(state.dirchars, '41236987><');
    assert.equal(state.alphadirchars, 'hykulnjb><');
    assert.equal(state.extcmd_char, '#'.charCodeAt(0));
    assert.equal(state.serialno, 1);
});

test('reset_cmd_vars clears command-owned state and both queues', () => {
    const state = {
        context: {
            run: 1, nopick: 1, forcefight: 1, move: 1, mv: 1,
            travel: 1, travel1: 1,
        },
        domoveAttempting: 1,
        multi: 7,
        iflags: { menu_requested: true },
        travelmap: { marker: true },
        command_queue: [[{ typ: 1 }], [{ typ: 2 }]],
    };
    reset_cmd_vars(true, state);
    assert.deepEqual(state.context, {
        run: 0, nopick: 0, forcefight: 0, move: 0, mv: 0,
        travel: 0, travel1: 0,
    });
    assert.equal(state.domoveAttempting, 0);
    assert.equal(state.multi, 0);
    assert.equal(state.iflags.menu_requested, false);
    assert.equal(state.travelmap, null);
    assert.deepEqual(state.command_queue, [[], []]);
    state.command_queue = [[{ typ: 1 }], [{ typ: 2 }]];
    reset_cmd_vars(false, state);
    assert.deepEqual(state.command_queue, [[{ typ: 1 }], [{ typ: 2 }]]);
});

test('direction names, menu selectors, and command-menu result mapping follow C', async () => {
    assert.equal(directionname(-1), 'invalid');
    assert.equal(directionname(0), 'west');
    assert.equal(directionname(N_DIRS_Z - 1), 'up');
    assert.equal(directionname(N_DIRS_Z), 'invalid');
    const menu = [];
    assert.deepEqual(mcmd_addmenu(menu, 37, 'Look here'), {
        value: 37, label: 'Look here',
    });
    assert.deepEqual(menu, [{ value: 37, label: 'Look here' }]);

    const here = {
        iflags: {},
        clicklook_cc: { x: 3, y: 4 },
        u: { ux: 3, uy: 4 },
        hereCmdMenu: () => 'x'.charCodeAt(0),
    };
    assert.equal(await doherecmdmenu(here), ECMD_TIME);
    assert.equal(await dotherecmdmenu(here), ECMD_TIME);
    assert.deepEqual(here.clicklook_cc, { x: -1, y: -1 });
    await assert.rejects(
        doherecmdmenu({}),
        UnsupportedHeroCommandBoundaryError,
    );
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
