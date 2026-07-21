import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OROOM,
    ROOMOFFSET,
    SHARED,
    SHARED_PLUS,
    SHOPBASE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { in_rooms, move_update } from '../js/rooms.js';

const ROOM_BUFFER_SIZE = 5;

function roomBuffer(values = []) {
    const buffer = new Array(ROOM_BUFFER_SIZE).fill(0);
    for (let index = 0; index < values.length; ++index)
        buffer[index] = values[index];
    return buffer;
}

function initializedState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = {
        ux: 0,
        uy: 0,
        urooms: roomBuffer(),
        urooms0: roomBuffer(),
        uentered: roomBuffer(),
        ushops: roomBuffer(),
        ushops0: roomBuffer(),
        ushops_entered: roomBuffer(),
        ushops_left: roomBuffer(),
    };
    return state;
}

function defineRoom(state, roomno, rtype) {
    state.level.rooms[roomno - ROOMOFFSET] = { rtype };
}

test('in_rooms returns a regular room only when its type matches', () => {
    const state = initializedState();
    const roomno = ROOMOFFSET;
    state.level.at(12, 6).roomno = roomno;
    defineRoom(state, roomno, OROOM);

    assert.deepEqual(in_rooms(12, 6, 0, state), [roomno]);
    assert.deepEqual(in_rooms(12, 6, SHOPBASE, state), []);

    // SHOPBASE is the source's umbrella query for every concrete shop type.
    defineRoom(state, roomno, SHOPBASE + 1);
    assert.deepEqual(in_rooms(12, 6, SHOPBASE, state), [roomno]);
});

test('in_rooms preserves SHARED reverse-discovery order and deduplicates', () => {
    const state = initializedState();
    const [ordinary, genericShop, concreteShop] = [
        ROOMOFFSET,
        ROOMOFFSET + 1,
        ROOMOFFSET + 2,
    ];
    defineRoom(state, ordinary, OROOM);
    defineRoom(state, genericShop, SHOPBASE);
    defineRoom(state, concreteShop, SHOPBASE + 1);

    state.level.at(10, 10).roomno = SHARED;
    state.level.at(9, 9).roomno = ordinary;
    state.level.at(9, 11).roomno = genericShop;
    state.level.at(11, 9).roomno = ordinary; // Repeated corner exercises strchr().
    state.level.at(11, 11).roomno = concreteShop;

    assert.deepEqual(
        in_rooms(10, 10, 0, state),
        [concreteShop, genericShop, ordinary],
    );
    assert.deepEqual(
        in_rooms(10, 10, SHOPBASE, state),
        [concreteShop, genericShop],
    );
});

test('in_rooms gives SHARED_PLUS its source column-major neighbor scan', () => {
    const state = initializedState();
    const rooms = [0, 1, 2, 3].map((offset) => ROOMOFFSET + offset);
    for (const roomno of rooms) defineRoom(state, roomno, OROOM);

    state.level.at(10, 10).roomno = SHARED_PLUS;
    state.level.at(9, 9).roomno = rooms[0];
    state.level.at(9, 10).roomno = rooms[1];
    state.level.at(10, 9).roomno = rooms[2];
    state.level.at(11, 11).roomno = rooms[3];

    // C discovers in ascending x/y order but prepends into char buf[5].
    assert.deepEqual(in_rooms(10, 10, 0, state), [...rooms].reverse());
});

test('in_rooms applies the source boundary adjustment at column and row zero', () => {
    const state = initializedState();
    const roomno = ROOMOFFSET;
    defineRoom(state, roomno, OROOM);
    state.level.at(0, 0).roomno = SHARED;
    state.level.at(1, 1).roomno = roomno;

    assert.deepEqual(in_rooms(0, 0, 0, state), [roomno]);
});

test('move_update maintains current, entered, and departed shop room strings', () => {
    const state = initializedState();
    const ordinary = ROOMOFFSET;
    const shop = ROOMOFFSET + 1;
    defineRoom(state, ordinary, OROOM);
    defineRoom(state, shop, SHOPBASE + 1);

    state.u.ux = 8;
    state.u.uy = 5;
    state.level.at(8, 5).roomno = ordinary;
    move_update(false, state);
    assert.deepEqual(state.u.urooms, roomBuffer([ordinary]));
    assert.deepEqual(state.u.urooms0, roomBuffer());
    assert.deepEqual(state.u.uentered, roomBuffer([ordinary]));
    assert.deepEqual(state.u.ushops, roomBuffer());

    state.u.ux = 18;
    state.u.uy = 7;
    state.level.at(18, 7).roomno = shop;
    move_update(false, state);
    assert.deepEqual(state.u.urooms0, roomBuffer([ordinary]));
    assert.deepEqual(state.u.urooms, roomBuffer([shop]));
    assert.deepEqual(state.u.uentered, roomBuffer([shop]));
    assert.deepEqual(state.u.ushops, roomBuffer([shop]));
    assert.deepEqual(state.u.ushops0, roomBuffer());
    assert.deepEqual(state.u.ushops_entered, roomBuffer([shop]));
    assert.deepEqual(state.u.ushops_left, roomBuffer());

    state.u.ux = 8;
    state.u.uy = 5;
    move_update(false, state);
    assert.deepEqual(state.u.ushops0, roomBuffer([shop]));
    assert.deepEqual(state.u.ushops, roomBuffer());
    assert.deepEqual(state.u.ushops_entered, roomBuffer());
    assert.deepEqual(state.u.ushops_left, roomBuffer([shop]));
});

test('move_update new-level mode clears current state after preserving old shops', () => {
    const state = initializedState();
    const shop = ROOMOFFSET;
    defineRoom(state, shop, SHOPBASE + 1);
    state.u.urooms = roomBuffer([shop]);
    state.u.uentered = roomBuffer([shop]);
    state.u.ushops = roomBuffer([shop]);
    state.u.ushops_entered = roomBuffer([shop]);

    move_update(true, state);

    assert.deepEqual(state.u.urooms0, roomBuffer([shop]));
    assert.deepEqual(state.u.ushops0, roomBuffer([shop]));
    assert.deepEqual(state.u.urooms, roomBuffer());
    assert.deepEqual(state.u.uentered, roomBuffer());
    assert.deepEqual(state.u.ushops, roomBuffer());
    assert.deepEqual(state.u.ushops_entered, roomBuffer());
    assert.deepEqual(state.u.ushops_left, roomBuffer([shop]));
    for (const name of [
        'urooms', 'urooms0', 'uentered', 'ushops', 'ushops0',
        'ushops_entered', 'ushops_left',
    ]) {
        assert.equal(state.u[name].length, ROOM_BUFFER_SIZE);
    }
});

test('move_update preserves bytes beyond the first NUL like fixed C buffers', () => {
    const state = initializedState();
    const previous = ROOMOFFSET;
    const current = ROOMOFFSET + 1;
    defineRoom(state, previous, OROOM);
    defineRoom(state, current, OROOM);
    state.level.at(20, 10).roomno = current;
    state.u.ux = 20;
    state.u.uy = 10;

    // The values after each NUL are deliberately stale. strcpy() overwrites
    // only through the terminator even though the owning arrays remain 5 bytes.
    state.u.urooms = [previous, 0, 31, 32, 33];
    state.u.urooms0 = [21, 22, 23, 24, 0];

    move_update(false, state);

    assert.deepEqual(state.u.urooms0, [previous, 0, 23, 24, 0]);
    assert.deepEqual(state.u.urooms, [current, 0, 31, 32, 33]);
});
