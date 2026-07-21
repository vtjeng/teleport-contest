import assert from 'node:assert/strict';
import test from 'node:test';

import {
    CORR,
    DB_FLOOR,
    DB_LAVA,
    DB_MOAT,
    DRAWBRIDGE_UP,
    DRY,
    FOUNTAIN,
    HOT,
    HWALL,
    ICE,
    LAVAPOOL,
    LAVAWALL,
    MOAT,
    POOL,
    ROOM,
    ROOMOFFSET,
    SOLID,
    NO_LOC_WARN,
    SP_COORD_IS_RANDOM,
    WATER,
    WET,
} from '../js/const.js';
import { GameMap } from '../js/game.js';
import { resetGame } from '../js/gstate.js';
import {
    get_free_room_loc,
    get_location_coord,
    get_room_loc,
    inside_room,
    is_ok_location,
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

test('get_location_coord rejects non-dry candidates before object RNG', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = HWALL;
    state.level.at(11, 5).typ = ROOM;
    const script = scriptedCoordinates(room, [[10, 5], [11, 5]]);
    const coordinate = { x: 40, y: 40 };

    get_location_coord(
        coordinate,
        DRY,
        room,
        SP_COORD_IS_RANDOM,
        { state, random: script.random },
    );

    assert.deepEqual(coordinate, { x: 11, y: 5 });
    assert.equal(script.drawCount, 4);
    script.done();
});

test('packed random humidity overrides the caller humidity on real terrain', () => {
    const cases = [
        [WET, POOL],
        [HOT, LAVAPOOL],
        [SOLID, HWALL],
    ];
    for (const [packedHumidity, acceptedTerrain] of cases) {
        const state = coordinateState();
        const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
        state.level.at(10, 5).typ = ROOM;
        state.level.at(11, 5).typ = acceptedTerrain;
        const script = scriptedCoordinates(room, [[10, 5], [11, 5]]);
        const coordinate = { x: -1, y: -1 };

        get_location_coord(
            coordinate,
            DRY,
            room,
            SP_COORD_IS_RANDOM | packedHumidity,
            { state, random: script.random },
        );

        assert.deepEqual(coordinate, { x: 11, y: 5 });
        assert.equal(script.drawCount, 4);
        script.done();
    }
});

test('packed humidity falls back to caller humidity after its first pass', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = ROOM;
    state.level.at(11, 5).typ = ROOM;
    const script = scriptedCoordinates(room, [
        ...Array.from({ length: 100 }, () => [11, 5]),
        [10, 5],
    ]);
    const coordinate = { x: -1, y: -1 };

    get_location_coord(
        coordinate,
        DRY,
        room,
        SP_COORD_IS_RANDOM | WET,
        { state, random: script.random },
    );

    assert.deepEqual(coordinate, { x: 10, y: 5 });
    assert.equal(script.drawCount, 202);
    script.done();
});

test('get_location_coord falls back in x-major order after 100 misses', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 6 });
    state.level.at(10, 6).typ = ROOM;
    const script = scriptedCoordinates(
        room,
        Array.from({ length: 100 }, () => [11, 5]),
    );
    const coordinate = { x: -1, y: -1 };

    get_location_coord(
        coordinate,
        DRY,
        room,
        SP_COORD_IS_RANDOM,
        { state, random: script.random },
    );

    // x=10,y=5 is checked first; x=10,y=6 is the first dry fallback.
    assert.deepEqual(coordinate, { x: 10, y: 6 });
    assert.equal(script.drawCount, 200);
    script.done();
});

test('get_location_coord performs the complete warning-suppressed retry', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 10, ly: 5, hy: 5 });
    let draws = 0;
    let impossibleCalls = 0;
    const coordinate = { x: -1, y: -1 };

    get_location_coord(
        coordinate,
        DRY,
        room,
        SP_COORD_IS_RANDOM,
        {
            state,
            random: {
                rn1(range, base) {
                    ++draws;
                    assert.equal(range, 1);
                    return base;
                },
            },
            hooks: {
                impossible() { ++impossibleCalls; },
            },
        },
    );

    // The first 100-attempt pass uses NO_LOC_WARN and returns (-1,-1).
    // The second pass reports impossible and retains its final scanned cell.
    assert.deepEqual(coordinate, { x: 10, y: 5 });
    assert.equal(draws, 400);
    assert.equal(impossibleCalls, 1);
});

test('get_location_coord keeps NO_LOC_WARN failure at minus one', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 10, ly: 5, hy: 5 });
    let draws = 0;
    const coordinate = { x: 7, y: 8 };

    get_location_coord(
        coordinate,
        DRY | NO_LOC_WARN,
        room,
        SP_COORD_IS_RANDOM,
        {
            state,
            random: {
                rn1(_range, base) {
                    ++draws;
                    return base;
                },
            },
        },
    );

    assert.deepEqual(coordinate, { x: -1, y: -1 });
    assert.equal(draws, 400);
});

test('get_location_coord applies one room-relative offset for fixed coords', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 14, ly: 5, hy: 9 });
    const coordinate = { x: -1, y: -1 };
    // SP_COORD_PACK(2, 3), kept inline to expose the source byte layout.
    const packed = 2 | (3 << 16);

    get_location_coord(coordinate, DRY, room, packed, {
        state,
        random: {
            rn1() { assert.fail('fixed coordinates must not draw'); },
        },
    });

    assert.deepEqual(coordinate, { x: 12, y: 8 });
});

test('map-frame coordinates use fixed offsets and x-before-y random draws', () => {
    const state = coordinateState();
    const frame = {
        xstart: 20,
        ystart: 3,
        xsize: 3,
        ysize: 2,
        xMazeMax: 70,
        yMazeMax: 18,
    };
    state.level.at(21, 4).typ = ROOM;
    state.level.at(22, 4).typ = ROOM;
    const fixed = { x: -1, y: -1 };
    get_location_coord(fixed, DRY, null, 1 | (1 << 16), {
        state,
        frame,
    });
    assert.deepEqual(fixed, { x: 21, y: 4 });

    const calls = [];
    const random = { x: -1, y: -1 };
    get_location_coord(random, DRY, null, SP_COORD_IS_RANDOM, {
        state,
        frame,
        random: {
            rn2(bound) {
                calls.push(bound);
                return bound - 1;
            },
        },
    });
    assert.deepEqual(calls, [3, 2]);
    assert.deepEqual(random, { x: 22, y: 4 });
});

test('fixed out-of-bounds coordinates clamp unless warnings are suppressed', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 14, ly: 5, hy: 9 });
    const packed = 0xff | (0xff << 16);
    const clamped = { x: -1, y: -1 };
    const suppressed = { x: -1, y: -1 };

    get_location_coord(clamped, DRY, room, packed, { state });
    get_location_coord(suppressed, DRY | NO_LOC_WARN, room, packed, {
        state,
    });

    assert.deepEqual(clamped, { x: 78, y: 20 });
    assert.deepEqual(suppressed, { x: -1, y: -1 });
});

test('DRY accepts furniture and occupancy but rejects a boulder', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = FOUNTAIN;
    state.level.at(11, 5).typ = ROOM;
    state.level.traps.push({ tx: 10, ty: 5 });
    const script = scriptedCoordinates(room, [[10, 5], [11, 5]]);
    const checked = [];
    const coordinate = { x: -1, y: -1 };

    get_location_coord(
        coordinate,
        DRY,
        room,
        SP_COORD_IS_RANDOM,
        {
            state,
            random: script.random,
            hooks: {
                hasBoulder(x, y) {
                    checked.push([x, y]);
                    return x === 10;
                },
            },
        },
    );

    assert.deepEqual(checked, [[10, 5], [11, 5]]);
    assert.deepEqual(coordinate, { x: 11, y: 5 });
    script.done();
});

test('is_ok_location short-circuits WET and HOT predicates like C', () => {
    const state = coordinateState();
    const calls = [];
    const hooks = {
        isPool() {
            calls.push('pool');
            return false;
        },
        isLava() {
            calls.push('lava');
            return true;
        },
    };

    assert.equal(is_ok_location(10, 5, HOT, { state, hooks }), true);
    assert.deepEqual(calls, ['lava']);
    calls.length = 0;
    assert.equal(is_ok_location(10, 5, WET, { state, hooks }), false);
    assert.deepEqual(calls, ['pool']);
    calls.length = 0;
    assert.equal(is_ok_location(10, 5, WET | HOT, { state, hooks }), true);
    assert.deepEqual(calls, ['pool', 'lava']);
});

test('get_room_loc draws only missing axes before applying room offsets', () => {
    const room = regularRoom({ lx: 10, hx: 12, ly: 5, hy: 7 });
    const calls = [];
    const coordinate = { x: -1, y: 1 };

    get_room_loc(coordinate, room, {
        random: {
            rn2(bound) {
                calls.push(bound);
                return 2;
            },
        },
    });

    assert.deepEqual(calls, [3]);
    assert.deepEqual(coordinate, { x: 12, y: 6 });
});

test('get_free_room_loc retries a dry feature until terrain is ROOM', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 11, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = ICE;
    state.level.at(11, 5).typ = ROOM;
    // Occupancy is deliberately irrelevant to this source helper.
    state.level.traps.push({ tx: 11, ty: 5 });
    const script = scriptedCoordinates(room, [[11, 5]]);
    const coordinate = { x: -1, y: -1 };
    const packedIce = 0;

    get_free_room_loc(
        coordinate,
        room,
        packedIce,
        { state, random: script.random },
    );

    assert.deepEqual(coordinate, { x: 11, y: 5 });
    assert.equal(script.drawCount, 2);
    script.done();
});

test('get_free_room_loc panics only after the 101st fallback miss', () => {
    const state = coordinateState();
    const room = regularRoom({ lx: 10, hx: 10, ly: 5, hy: 5 });
    state.level.at(10, 5).typ = ICE;
    let draws = 0;
    const coordinate = { x: -1, y: -1 };

    assert.throws(
        () => get_free_room_loc(
            coordinate,
            room,
            0,
            {
                state,
                random: {
                    rn1(_range, base) {
                        ++draws;
                        return base;
                    },
                },
            },
        ),
        /can't find a place/,
    );
    assert.equal(draws, 202);
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
