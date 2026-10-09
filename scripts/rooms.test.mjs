import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
    LAST_PROP,
    DELPHI,
    MAXNROFROOMS,
    OROOM,
    ROOM,
    ROOMOFFSET,
    SHARED,
    SHARED_PLUS,
    SHOPBASE,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import { domove } from '../js/hack.js';
import { check_special_room, in_rooms, move_update } from '../js/rooms.js';
import { PM_ORACLE, monst_globals_init } from '../js/monsters.js';
import { newMonster } from '../js/monst.js';
import { init_vision_globals, vision_reset } from '../js/vision.js';

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
        // u_init.c zeroProperties() initializes masks read by weight_cap()
        // when domove() checks movement encumbrance.
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0,
            extrinsic: 0,
            blocked: 0,
        })),
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

test('in_rooms resolves nested rooms through the conceptual room index', () => {
    const state = initializedState();
    const nestedRoom = {
        roomnoidx: MAXNROFROOMS + 1,
        rtype: SHOPBASE + 2,
    };
    state.level.rooms = [{
        roomnoidx: 0,
        rtype: OROOM,
        nsubrooms: 1,
        sbrooms: [nestedRoom],
    }];
    const roomno = nestedRoom.roomnoidx + ROOMOFFSET;
    state.level.at(12, 6).roomno = roomno;

    // C keeps top-level rooms and subrooms in one contiguous rooms[] array;
    // the JS level stores this subroom under its parent.
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

test('domove updates room membership after entering the destination', async () => {
    const state = initializedState();
    const origin = ROOMOFFSET;
    const destination = ROOMOFFSET + 1;
    defineRoom(state, origin, OROOM);
    defineRoom(state, destination, OROOM);
    state.u = {
        ...state.u,
        ux: 10,
        uy: 10,
        ux0: 10,
        uy0: 10,
        dx: 1,
        dy: 0,
        // domove() ends at dungeon.c u_on_newpos(), which branches on
        // on_level(&u.uz, &u.uz0). A hero walking inside one level has the
        // two equal; allmain.c moveloop_preamble() keeps them so.
        uz: { dnum: 0, dlevel: 1 },
        uz0: { dnum: 0, dlevel: 1 },
        // u_init.c zeroProperties() initializes the masks read by
        // weight_cap() during this movement check.
        uprops: Array.from({ length: LAST_PROP + 1 }, () => ({
            intrinsic: 0,
            extrinsic: 0,
            blocked: 0,
        })),
        weapon_skills: [],
        uswallow: false,
        usteed: null,
        uundetected: false,
        urooms: roomBuffer([origin]),
    };
    // An ordinary medium hero makes can_reach_floor() true while preserving
    // this fixture's zero-weight tread and non-hiding form.
    state.youmonst = {
        data: {
            cwt: 0, mlet: 53, mflags1: 0, msize: 2, mattk: [], mmove: 12,
        },
    };
    state.context = { move: 1, mv: 0, run: 0, travel: 0 };
    state.level.at(10, 10).typ = ROOM;
    state.level.at(10, 10).roomno = origin;
    state.level.at(11, 10).typ = ROOM;
    state.level.at(11, 10).roomno = destination;
    init_vision_globals();
    vision_reset();

    await domove(state);

    assert.deepEqual(state.u.urooms0, roomBuffer([origin]));
    assert.deepEqual(state.u.urooms, roomBuffer([destination]));
    assert.deepEqual(state.u.uentered, roomBuffer([destination]));
});

// C's svr.rooms allocation includes subrooms after MAXNROFROOMS; JS stores
// the same room under its parent, preserving that conceptual source index.
for (const present of [false, true]) {
    test(`Delphi subroom clears its own identity with Oracle ${present ? 'present' : 'absent'}`, async () => {
        const state = initializedState();
        monst_globals_init(state);
        // An interior floor square and name isolate room ownership and the
        // source greeting; neither depends on generated level geometry.
        state.plname = 'Nested';
        state.u.ux = 12;
        state.u.uy = 6;
        const subroom = { roomnoidx: MAXNROFROOMS + 1, rtype: DELPHI };
        const parent = { roomnoidx: 0, rtype: OROOM, nsubrooms: 1, sbrooms: [subroom] };
        state.level.rooms = [parent];
        const roomno = subroom.roomnoidx + ROOMOFFSET;
        state.level.at(12, 6).roomno = roomno;
        // One living peaceful Oracle on this floor chooses C's Hello arm.
        if (present) state.level.monlist = newMonster({
            data: state.mons[PM_ORACLE], mnum: PM_ORACLE, mhp: 1,
            mpeaceful: true, mx: 12, my: 6,
        });
        const messages = [];
        await check_special_room(false, state, { message: async text => messages.push(text) });
        assert.equal(subroom.rtype, OROOM);
        assert.equal(parent.rtype, OROOM);
        assert.equal(state.level.rooms[subroom.roomnoidx], undefined,
            'the source pointer resolves the existing child, without adding another owner');
        assert.deepEqual(messages, present ? ['"Hello, Nested, welcome to Delphi!"'] : []);
        await check_special_room(false, state, { message: async text => messages.push(text) });
        assert.equal(messages.length, present ? 1 : 0, 'room greeting happens only on first entry');
        const source = readFileSync(new URL('../nethack-c/upstream/src/hack.c', import.meta.url), 'utf8');
        assert.match(source, /roomno = \*ptr - ROOMOFFSET, rt = svr\.rooms\[roomno\]\.rtype/u);
        assert.match(source, /if \(rt != 0\) \{\s*svr\.rooms\[roomno\]\.rtype = OROOM/u);
    });
}
