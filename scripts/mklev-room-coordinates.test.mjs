import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DB_FLOOR,
    DB_LAVA,
    DB_MOAT,
    DRAWBRIDGE_UP,
    FOUNTAIN,
    HWALL,
    ICE,
    LAVAPOOL,
    LAVAWALL,
    MOAT,
    POOL,
    ROOM,
    ROOMOFFSET,
    WATER,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import {
    inside_room,
    occupied,
    somex,
    somey,
    somexy,
    somexyspace,
} from '../js/mklev.js';

function coordinateState() {
    const state = resetGame();
    state.level = new GameMap();
    state.u = { uz: { dnum: 0, dlevel: 1 } };
    state.dungeons = [{
        // Ten levels make level 9 the invocation level only after this
        // ordinary dungeon is marked hellish.
        num_dunlevs: 10,
        flags: { hellish: false },
    }];
    return state;
}

function regularRoom({
    lx = 10,
    hx = 14,
    ly = 5,
    hy = 9,
    sbrooms = [],
} = {}) {
    return {
        lx,
        hx,
        ly,
        hy,
        irregular: false,
        nsubrooms: sbrooms.length,
        sbrooms,
        roomnoidx: 0,
    };
}

function fillRoomFloor(state, room) {
    for (let x = room.lx; x <= room.hx; ++x) {
        for (let y = room.ly; y <= room.hy; ++y)
            state.level.at(x, y).typ = ROOM;
    }
}

function scriptedCoordinates(room, coordinates) {
    const remaining = [];
    for (const [x, y] of coordinates) {
        remaining.push(
            { range: room.hx - room.lx + 1, base: room.lx, result: x },
            { range: room.hy - room.ly + 1, base: room.ly, result: y },
        );
    }
    let drawCount = 0;
    return {
        random: {
            rn1(range, base) {
                const expected = remaining.shift();
                assert.ok(expected, `unexpected rn1(${range}, ${base})`);
                assert.deepEqual({ range, base }, {
                    range: expected.range,
                    base: expected.base,
                });
                assert.ok(expected.result >= base && expected.result < base + range);
                ++drawCount;
                return expected.result;
            },
        },
        get drawCount() { return drawCount; },
        get remainingCount() { return remaining.length; },
        done() { assert.equal(remaining.length, 0); },
    };
}

test('somex and somey draw from the inclusive room bounds', () => {
    // These asymmetric arbitrary bounds make the x and y rn1 calls
    // distinguishable and select opposite inclusive edges.
    const room = regularRoom({ lx: 10, hx: 14, ly: 5, hy: 7 });
    const script = scriptedCoordinates(room, [[14, 5]]);

    assert.equal(somex(room, { random: script.random }), 14);
    assert.equal(somey(room, { random: script.random }), 5);
    script.done();
});

test('somexy accepts a wall when a regular room has no subrooms', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 10, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = HWALL;
    const script = scriptedCoordinates(room, [[10, 5]]);
    const coordinate = { x: 0, y: 0 };

    // mkroom.c somexy() takes its direct one-draw path when nsubrooms is zero;
    // the wall check belongs only to the retrying subroom branch.
    assert.equal(
        somexy(room, coordinate, { state, random: script.random }),
        true,
    );
    assert.deepEqual(coordinate, { x: 10, y: 5 });
    script.done();
});

test('somexy rejects walls and the full rectangular subroom footprint', () => {
    const state = coordinateState();
    // The subroom occupies x=11..12 and y=6..7. inside_room() deliberately
    // includes its one-cell perimeter, so (10,5) belongs to its footprint.
    const subroom = regularRoom({ lx: 11, hx: 12, ly: 6, hy: 7 });
    const room = regularRoom({ sbrooms: [subroom] });
    fillRoomFloor(state, room);
    state.level.at(14, 8).typ = HWALL;
    const script = scriptedCoordinates(room, [
        [14, 8], // Rejected because the selected cell is a wall.
        [10, 5], // Rejected because it touches the subroom's outer footprint.
        [14, 9], // Accepted outside both rejected regions.
    ]);
    const coordinate = { x: 0, y: 0 };

    assert.equal(inside_room(subroom, 10, 5, state), true);
    assert.equal(somexy(room, coordinate, { state, random: script.random }), true);
    assert.deepEqual(coordinate, { x: 14, y: 9 });
    script.done();
});

test('somexy exhaustively searches an irregular room after 100 random misses', () => {
    const state = coordinateState();
    // A 2x2 bounding box with only its final x-outer/y-inner cell in the
    // flood-filled room verifies both the retry count and fallback traversal.
    const room = {
        ...regularRoom({ lx: 10, hx: 11, ly: 5, hy: 6 }),
        irregular: true,
        roomnoidx: 2,
    };
    const roomno = room.roomnoidx + ROOMOFFSET;
    state.level.at(10, 6).roomno = roomno;
    state.level.at(10, 6).edge = true;
    state.level.at(11, 6).roomno = roomno;
    const script = scriptedCoordinates(
        room,
        // One hundred misses trigger the deterministic exhaustive fallback.
        Array.from({ length: 100 }, () => [10, 5]),
    );
    const coordinate = { x: 0, y: 0 };

    assert.equal(inside_room(room, 10, 6, state), false);
    assert.equal(inside_room(room, 11, 6, state), true);
    assert.equal(somexy(room, coordinate, { state, random: script.random }), true);
    assert.deepEqual(coordinate, { x: 11, y: 6 });
    assert.equal(script.drawCount, 200);
    script.done();
});

test('somexy preserves the regular-room valid-100th-candidate failure', () => {
    const state = coordinateState();
    // A real subroom makes somexy use its retrying branch. The first 99
    // candidates are walls; source mkroom.c then rejects the valid 100th one
    // because try_cnt has already reached 100 when the loop breaks.
    const subroom = regularRoom({ lx: 10, hx: 10, ly: 5, hy: 5 });
    const room = regularRoom({ lx: 10, hx: 14, ly: 5, hy: 5, sbrooms: [subroom] });
    fillRoomFloor(state, room);
    state.level.at(12, 5).typ = HWALL;
    const script = scriptedCoordinates(room, [
        ...Array.from({ length: 99 }, () => [12, 5]),
        [14, 5],
    ]);
    const coordinate = { x: 0, y: 0 };

    assert.equal(somexy(room, coordinate, { state, random: script.random }), false);
    assert.deepEqual(coordinate, { x: 14, y: 5 });
    assert.equal(script.drawCount, 200);
    script.done();
});

test('occupied covers traps, furniture, liquids, and invocation state', () => {
    const state = coordinateState();
    const x = 10;
    const y = 5;
    const location = state.level.at(x, y);
    location.typ = ROOM;

    assert.equal(occupied(x, y, state), false);

    state.level.traps.push({ tx: x, ty: y });
    assert.equal(occupied(x, y, state), true);
    state.level.traps.length = 0;

    location.typ = FOUNTAIN;
    assert.equal(occupied(x, y, state), true);

    // These five types cover both direct branches in dbridge.c is_pool() and
    // both direct branches in is_lava().
    for (const typ of [POOL, MOAT, WATER, LAVAPOOL, LAVAWALL]) {
        location.typ = typ;
        assert.equal(occupied(x, y, state), true);
    }

    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_FLOOR;
    assert.equal(occupied(x, y, state), false);
    location.flags = DB_MOAT;
    assert.equal(occupied(x, y, state), true);
    // Juiblex suppresses moat beneath a raised drawbridge, but a literal MOAT
    // remains a pool through is_pool()'s direct terrain check.
    state.juiblex_level = { ...state.u.uz };
    assert.equal(occupied(x, y, state), false);
    location.typ = MOAT;
    assert.equal(occupied(x, y, state), true);
    state.juiblex_level = null;
    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_LAVA;
    assert.equal(occupied(x, y, state), true);

    location.typ = ROOM;
    location.flags = 0;
    state.inv_pos = { x, y };
    assert.equal(occupied(x, y, state), false);
    state.dungeons[0].flags.hellish = true;
    // In a ten-level hellish dungeon, dlevel 9 is the invocation level.
    state.u.uz.dlevel = 9;
    assert.equal(occupied(x, y, state), true);
});

test('somexyspace accepts a valid 101st candidate', () => {
    const state = coordinateState();
    // The first coordinate is occupied furniture and the second is ordinary
    // floor. One hundred misses force the source do-while's final retry.
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = FOUNTAIN;
    state.level.at(11, 5).typ = ROOM;
    const script = scriptedCoordinates(room, [
        ...Array.from({ length: 100 }, () => [10, 5]),
        [11, 5],
    ]);
    const coordinate = { x: 0, y: 0 };

    assert.equal(
        somexyspace(room, coordinate, { state, random: script.random }),
        true,
    );
    assert.deepEqual(coordinate, { x: 11, y: 5 });
    assert.equal(script.drawCount, 202);
    script.done();
});

test('somexyspace stops after 101 rejected candidates', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = FOUNTAIN;
    state.level.at(11, 5).typ = ROOM;
    const script = scriptedCoordinates(room, [
        // Exactly 101 occupied candidates are the source's maximum attempts.
        ...Array.from({ length: 101 }, () => [10, 5]),
        [11, 5], // This 102nd candidate must remain unread.
    ]);
    const coordinate = { x: 0, y: 0 };

    assert.equal(
        somexyspace(room, coordinate, { state, random: script.random }),
        false,
    );
    assert.deepEqual(coordinate, { x: 10, y: 5 });
    assert.equal(script.drawCount, 202);
    assert.equal(script.remainingCount, 2);
});

test('somexyspace accepts each source floor terrain', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 10, ly: 5, hy: 5 });

    // ROOM, CORR, and ICE are the complete source allowlist.
    for (const typ of [ROOM, CORR, ICE]) {
        state.level.at(10, 5).typ = typ;
        const script = scriptedCoordinates(room, [[10, 5]]);
        assert.equal(
            somexyspace(room, { x: 0, y: 0 }, { state, random: script.random }),
            true,
        );
        script.done();
    }
});
