import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AIR,
    DB_ICE,
    DRAWBRIDGE_UP,
    DUST,
    FOUNTAIN,
    GRAVE,
    HEADSTONE,
    ICE,
    LAVAPOOL,
    MAX_TYPE,
    MELT_ICE_AWAY,
    ROOM,
    SDOOR,
    SINK,
    STAIRS,
    STONE,
} from '../js/const.js';
import { engr_at, make_engr_at } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { make_grave } from '../js/grave.js';
import {
    UnsupportedTerrainTransitionError,
    count_level_features,
    is_ice,
    set_levltyp,
} from '../js/terrain.js';

function makeState() {
    return { level: new GameMap(), iflags: {}, head_engr: null };
}

function noDrawRandom() {
    return {
        rn2: (bound) => assert.fail(`unexpected rn2(${bound})`),
        rnd: (bound) => assert.fail(`unexpected rnd(${bound})`),
    };
}

function oneDrawRandom(bound, result) {
    let used = false;
    return {
        rn2(actualBound) {
            assert.equal(used, false, `unexpected second rn2(${actualBound})`);
            assert.equal(actualBound, bound);
            used = true;
            return result;
        },
        rnd(actualBound) {
            assert.fail(`unexpected rnd(${actualBound})`);
        },
        done() {
            assert.equal(used, true);
        },
    };
}

test('set_levltyp rejects invalid positions, types, and protected stairs', () => {
    const state = makeState();
    // Coordinate (17,8) is arbitrary and isolates the protected-stair branch.
    state.level.at(17, 8).typ = STAIRS;

    assert.equal(set_levltyp(0, 8, ROOM, { state }), false);
    assert.equal(set_levltyp(17, 8, MAX_TYPE, { state }), false);
    assert.equal(set_levltyp(17, 8, ROOM, { state }), false);
    assert.equal(state.level.at(17, 8).typ, STAIRS);

    state.iflags.debug_overwrite_stairs = true;
    assert.equal(set_levltyp(17, 8, ROOM, { state }), true);
    assert.equal(state.level.at(17, 8).typ, ROOM);
});

test('set_levltyp preserves the arboreal secret-door-to-air quirk', () => {
    const state = makeState();
    const location = state.level.at(23, 9);
    location.typ = SDOOR;

    assert.equal(set_levltyp(23, 9, AIR, { state }), true);
    assert.equal(location.typ, SDOOR);
    // rm.h aliases arboreal_sdoor to struct rm's candig bit.
    assert.equal(location.candig, true);
});

test('set_levltyp lights lava and recounts fountains and sinks', () => {
    const state = makeState();
    state.level.at(11, 4).typ = FOUNTAIN;
    state.level.at(12, 4).typ = FOUNTAIN;
    state.level.at(13, 4).typ = SINK;
    count_level_features(state);
    assert.deepEqual(
        [state.level.flags.nfountains, state.level.flags.nsinks],
        [2, 1],
    );

    assert.equal(set_levltyp(11, 4, ROOM, { state }), true);
    assert.deepEqual(
        [state.level.flags.nfountains, state.level.flags.nsinks],
        [1, 1],
    );
    assert.equal(set_levltyp(14, 4, LAVAPOOL, { state }), true);
    assert.equal(state.level.at(14, 4).lit, true);
});

test('set_levltyp delegates both ice-removal effects after mutation', () => {
    const state = makeState();
    const location = state.level.at(31, 12);
    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_ICE;
    assert.equal(is_ice(31, 12, state), true);
    const calls = [];

    assert.equal(set_levltyp(31, 12, ROOM, {
        state,
        objIceEffects(x, y, force) {
            calls.push(['objects', x, y, force, location.typ]);
        },
        spotStopTimers(x, y, action) {
            calls.push(['timers', x, y, action, location.typ]);
        },
    }), true);
    assert.deepEqual(calls, [
        ['objects', 31, 12, true, ROOM],
        ['timers', 31, 12, MELT_ICE_AWAY, ROOM],
    ]);
    assert.equal(is_ice(31, 12, state), false);
});

test('set_levltyp fails closed before an unowned ice transition', () => {
    const state = makeState();
    const location = state.level.at(31, 12);
    location.typ = ICE;

    assert.throws(
        () => set_levltyp(31, 12, ROOM, { state }),
        (error) => error instanceof UnsupportedTerrainTransitionError
            && error.operation === 'obj_ice_effects',
    );
    assert.equal(location.typ, ICE);
});

test('make_grave rejects non-floor terrain and an existing trap', () => {
    const state = makeState();
    const random = noDrawRandom();
    const location = state.level.at(17, 8);

    location.typ = STONE;
    assert.equal(make_grave(17, 8, null, { state, random }), null);
    assert.equal(location.typ, STONE);

    location.typ = ROOM;
    // An arrow-trap type is arbitrary here; t_at() only tests coordinates.
    state.level.traps.push({ tx: 17, ty: 8, ttyp: 1 });
    assert.equal(make_grave(17, 8, null, { state, random }), null);
    assert.equal(location.typ, ROOM);
    assert.equal(state.head_engr, null);
});

test('make_grave selects an epitaph and replaces the old engraving', () => {
    const state = makeState();
    const location = state.level.at(17, 8);
    location.typ = ROOM;
    make_engr_at(
        17,
        8,
        'old',
        null,
        0,
        DUST,
        { state, random: noDrawRandom() },
    );
    const random = oneDrawRandom(
        // The generated epitaph payload starts after its 60-byte comment.
        24075,
        // Offset zero skips the default and selects "Rest in peace".
        0,
    );

    const headstone = make_grave(17, 8, null, { state, random });
    random.done();
    assert.equal(location.typ, GRAVE);
    assert.equal(engr_at(17, 8, state), headstone);
    assert.equal(headstone.engr_type, HEADSTONE);
    assert.deepEqual(headstone.engr_txt, [
        'Rest in peace',
        'Rest in peace',
        'Rest in peace',
    ]);
});

test('make_grave keeps explicit empty text and consumes no random draw', () => {
    const state = makeState();
    state.level.at(23, 9).typ = ROOM;

    const headstone = make_grave(23, 9, '', {
        state,
        random: noDrawRandom(),
    });
    assert.equal(state.level.at(23, 9).typ, GRAVE);
    assert.equal(headstone.engr_type, HEADSTONE);
    assert.deepEqual(headstone.engr_txt, ['', '', '']);
});

test('make_grave leaves engraving ownership untouched when terrain refuses', () => {
    const state = makeState();
    state.level.at(29, 10).typ = ROOM;
    const old = make_engr_at(
        29,
        10,
        'old',
        null,
        0,
        DUST,
        { state, random: noDrawRandom() },
    );

    assert.equal(make_grave(29, 10, null, {
        state,
        random: noDrawRandom(),
        setLevelType: () => false,
    }), null);
    assert.equal(state.level.at(29, 10).typ, ROOM);
    assert.equal(engr_at(29, 10, state), old);
});
