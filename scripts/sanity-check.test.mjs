// Pins the debug-mode sanity checks ported from wizcmds.c sanity_check() and
// mklev.c mklev_sanity_check(): the pure helpers chk_okdoor() and
// get_viz_clear(), and the messages a few checks print for a constructed
// inconsistent state. Message texts are copied from the C format strings
// cited beside each case.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR, DOOR, HWALL, NO_TRAP, ROOM, STONE, TRAPNUM, TREE, VWALL, W_WEP,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { game, resetGame } from '../js/gstate.js';
import { chk_okdoor, mklev_sanity_check } from '../js/mklev.js';
import { trap_sanity_check } from '../js/trap.js';
import { check_wornmask_slots } from '../js/worn.js';
import { block_point, get_viz_clear, unblock_point } from '../js/vision.js';

function mapState() {
    resetGame();
    game.level = new GameMap();
    game.level.rooms = [];
    game.iflags ??= {};
    game.program_state ??= {};
    return game;
}

// Collects impossible()'s first line and the lines that follow it.
function capture() {
    const lines = [];
    const sink = async (line) => { lines.push(line); };
    return { lines, env: { urgentMessage: sink, message: sink } };
}

test('chk_okdoor rejects a door that opens onto solid terrain on one side', () => {
    const state = mapState();
    // C mklev.c:1200-1206: a horizontal door compares the squares above and
    // below it; typ > TREE is open, typ <= TREE solid.
    const door = state.level.at(10, 5);
    door.typ = DOOR;
    door.horizontal = true;
    state.level.at(10, 4).typ = ROOM;
    state.level.at(10, 6).typ = STONE;
    assert.equal(chk_okdoor(10, 5, state), false);
    // Swapped sides fail the second test (mklev.c:1203-1205).
    state.level.at(10, 4).typ = TREE;
    state.level.at(10, 6).typ = CORR;
    assert.equal(chk_okdoor(10, 5, state), false);
    // Both sides open, as join() leaves them: room floor and corridor.
    state.level.at(10, 4).typ = ROOM;
    assert.equal(chk_okdoor(10, 5, state), true);
    // Both sides solid is not reported either: neither test matches.
    state.level.at(10, 4).typ = STONE;
    state.level.at(10, 6).typ = VWALL;
    assert.equal(chk_okdoor(10, 5, state), true);
});

test('chk_okdoor compares left and right for a vertical door, and passes non-doors', () => {
    const state = mapState();
    // C mklev.c:1208-1213: a door that is not horizontal compares x-1 and x+1.
    const door = state.level.at(20, 8);
    door.typ = DOOR;
    door.horizontal = false;
    state.level.at(19, 8).typ = CORR;
    state.level.at(21, 8).typ = STONE;
    // The squares above and below are open, which the vertical arm ignores.
    state.level.at(20, 7).typ = ROOM;
    state.level.at(20, 9).typ = ROOM;
    assert.equal(chk_okdoor(20, 8, state), false);
    // C mklev.c:1216-1218: anything but a DOOR is ok, even a wall beside
    // mismatched terrain.
    door.typ = HWALL;
    assert.equal(chk_okdoor(20, 8, state), true);
    // Column 1 has no left neighbour on the map (isok(0, y) is false), so
    // neither vertical test can match there.
    const edge = state.level.at(1, 8);
    edge.typ = DOOR;
    edge.horizontal = false;
    state.level.at(2, 8).typ = STONE;
    assert.equal(chk_okdoor(1, 8, state), true);
});

test('get_viz_clear reports blocked squares and is false off the map', () => {
    const state = mapState();
    state.viz_array = null;
    // C vision.c:107: !isok(x, y) answers FALSE whatever viz_clear holds.
    assert.equal(get_viz_clear(0, 5), false);
    assert.equal(get_viz_clear(80, 5), false);
    // block_point() clears the viz_clear entry and unblock_point() sets it;
    // get_viz_clear() is TRUE exactly when the entry is clear (0).
    block_point(30, 10, state);
    assert.equal(get_viz_clear(30, 10), true);
    unblock_point(30, 10, state);
    assert.equal(get_viz_clear(30, 10), false);
});

test('mklev_sanity_check reports an unjoined room with the full impossible() block', async () => {
    const state = mapState();
    state.iflags.sanity_check = true;
    state.program_state.in_sanity_check = 0;
    state.program_state.something_worth_saving = 0;
    // Three rooms that need joining; room 2 kept its own smeq[] value, the
    // state join() leaves when finddpos() or dig_corridor() fails.
    state.level.nroom = 3;
    state.level.rooms = [0, 1, 2].map(() => ({ needjoining: true }));
    state.smeq = [0, 0, 2];
    const { lines, env } = capture();
    await mklev_sanity_check(state, env);
    // C mklev.c:1243 and pline.c:617-620: outside sanity_check() each
    // impossible() adds "Program in disorder!" and the report line.
    assert.deepEqual(lines.slice(0, 2), [
        'room 2 not connected?',
        'Program in disorder!',
    ]);
    assert.match(lines[2], /^Please report these messages to .+\.$/u);
    assert.equal(lines.length, 3);
});

test('mklev_sanity_check skips rooms that need no joining and does nothing when the option is off', async () => {
    const state = mapState();
    state.level.nroom = 3;
    // A vault-like room with needjoining false is not compared
    // (mklev.c:1239-1240), so room 1's distinct smeq[] is not reported.
    state.level.rooms = [
        { needjoining: true }, { needjoining: false }, { needjoining: true },
    ];
    state.smeq = [0, 1, 0];
    const { lines, env } = capture();
    state.iflags.sanity_check = true;
    await mklev_sanity_check(state, env);
    assert.deepEqual(lines, []);
    // mklev.c:1229: without sanity_check or the debug fuzzer it returns
    // before any test, even for a disconnected level.
    state.smeq = [0, 1, 2];
    state.iflags.sanity_check = false;
    await mklev_sanity_check(state, env);
    assert.deepEqual(lines, []);
});

test('trap_sanity_check prints one line per bad field inside sanity_check()', async () => {
    const state = mapState();
    // Inside sanity_check(), impossible() prints its line only (pline.c:606).
    state.program_state.in_sanity_check = 1;
    // <0,3> is off the map (column 0) and NO_TRAP is below the legal range;
    // TRAPNUM is one past it. C trap.c:7204-7207.
    state.level.traps = [
        { tx: 0, ty: 3, ttyp: NO_TRAP },
        { tx: 5, ty: 5, ttyp: TRAPNUM },
    ];
    const { lines, env } = capture();
    await trap_sanity_check(state, env);
    assert.deepEqual(lines, [
        'trap sanity: location (0,3)',
        `trap sanity: type (${NO_TRAP})`,
        `trap sanity: type (${TRAPNUM})`,
    ]);
});

test('check_wornmask_slots reports a wielded weapon missing from inventory', async () => {
    const state = mapState();
    state.program_state.in_sanity_check = 1;
    // A wielded object (owornmask W_WEP) that the inventory list lacks.
    const sword = { otyp: 0, oclass: 2, owornmask: W_WEP, nobj: null };
    state.invent = null;
    state.uwep = sword;
    const { lines, env } = capture();
    await check_wornmask_slots(state, env);
    // C worn.c:376-377 with patch 007's fmt_ptr() spelling.
    assert.deepEqual(lines, [
        'Worn-slot insanity: weapon (<ptr>) not found in invent.',
    ]);
});
