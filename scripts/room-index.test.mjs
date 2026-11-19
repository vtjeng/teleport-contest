// js/dungeon.js ROOM_INDEX() is C's mkroom.h ROOM_INDEX(x), ((x) - svr.rooms):
// the slot a room occupies in C's one rooms[] allocation. It is pure, so this
// test pins its result to the slots C's layout gives. decl.h:1203 declares
// svr.rooms[(MAXNROFROOMS + 1) * 2] and decl.c:1169 points gs.subrooms at
// &svr.rooms[MAXNROFROOMS + 1], so subroom n is slot MAXNROFROOMS + 1 + n
// (41 + n, with global.h:385's MAXNROFROOMS of 40).
import assert from 'node:assert/strict';
import test from 'node:test';

import { MAXNROFROOMS, OROOM } from '../js/const.js';
import { mapseen_room, ROOM_INDEX } from '../js/dungeon.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { add_room, build_room, sort_rooms } from '../js/mklev.js';
import { rest_rooms } from '../js/mkroom.js';

// global.h:385. The slot numbers below are written out from it.
assert.equal(MAXNROFROOMS, 40);

function emptyLevel() {
    const state = resetGame();
    state.level = new GameMap();
    state.subrooms = [];
    state.nsubroom = 0;
    return state;
}

// build_room() draws random(100) against its 100% chance before placing the
// room; 0 keeps the requested type. The explicit size and rlit 0 make no
// other draw.
const noRandom = () => 0;

// A 3x3 subroom at offset (1, 1) of its parent, unlit.
function addSubroom(parent) {
    return build_room(
        { x: 1, y: 1, w: 3, h: 3, rtype: OROOM, rlit: 0 },
        parent, noRandom, noRandom,
    );
}

test('ROOM_INDEX() gives a top-level room its slot after sort_rooms()', () => {
    const state = emptyLevel();
    // Three rooms placed right to left, so sort_rooms() (mklev.c 210-228)
    // reverses them. Each is 5x4 and walled, inside the 80x21 map.
    add_room(60, 3, 64, 6, false, OROOM, false);
    add_room(35, 3, 39, 6, false, OROOM, false);
    add_room(10, 3, 14, 6, false, OROOM, false);
    const [right, middle, left] = state.level.rooms;
    // add_room() places each room at svr.rooms[nroom].
    assert.deepEqual([right, middle, left].map(ROOM_INDEX), [0, 1, 2]);

    sort_rooms();
    // qsort() by lx moves the structs, so the leftmost room is now
    // svr.rooms[0]. C's roomnoidx field would still read 2, 1, 0; the
    // pointer difference reads 0, 1, 2 from the left.
    assert.deepEqual([left, middle, right].map(ROOM_INDEX), [0, 1, 2]);
    for (const room of [left, middle, right])
        assert.equal(mapseen_room(ROOM_INDEX(room), state), room);
});

test('ROOM_INDEX() gives a subroom its slot in the second half', () => {
    const state = emptyLevel();
    // Two 8x6 parents, each large enough for a 3x3 subroom.
    add_room(5, 3, 12, 8, false, OROOM, false);
    add_room(30, 3, 37, 8, false, OROOM, false);
    const [first, second] = state.level.rooms;
    // Subrooms take gs.subrooms[] slots in creation order, whichever parent
    // they belong to: gs.subrooms[0] is slot 41, gs.subrooms[1] slot 42.
    const inSecond = addSubroom(second);
    const inFirst = addSubroom(first);
    assert.equal(ROOM_INDEX(inSecond), 41);
    assert.equal(ROOM_INDEX(inFirst), 42);
    // level.rooms holds only the top-level rooms, so its indexOf() does not
    // find a subroom; that is why ROOM_INDEX() exists.
    assert.equal(state.level.rooms.indexOf(inSecond), -1);
    for (const room of [first, second, inSecond, inFirst])
        assert.equal(mapseen_room(ROOM_INDEX(room), state), room);
});

test('ROOM_INDEX() follows rest_rooms() through a nested subroom', () => {
    const state = emptyLevel();
    // A 12x10 parent, a subroom of it, and a subroom of that subroom.
    add_room(5, 3, 16, 12, false, OROOM, false);
    const [parent] = state.level.rooms;
    const outer = build_room(
        { x: 1, y: 1, w: 7, h: 7, rtype: OROOM, rlit: 0 },
        parent, noRandom, noRandom,
    );
    const inner = addSubroom(outer);
    assert.deepEqual([outer, inner].map(ROOM_INDEX), [41, 42]);

    rest_rooms(state);
    // mkroom.c rest_room() (875-886) reads the inner subroom's record into
    // gs.subrooms[0], the slot its parent's record took, and only then
    // advances gn.nsubroom past slot 1. Slot 0 now holds the inner record,
    // and slot 1 keeps a zero record that no parent links to.
    const restored = state.subrooms[0];
    assert.equal(ROOM_INDEX(restored), 41);
    assert.equal(mapseen_room(41, state), restored);
    assert.equal(ROOM_INDEX(state.subrooms[1]), 42);
    assert.equal(mapseen_room(42, state), state.subrooms[1]);
    assert.equal(ROOM_INDEX(parent), 0);
});
