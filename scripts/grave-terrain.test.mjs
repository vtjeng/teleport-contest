import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AIR,
    DB_EAST,
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
    OBJ_BURIED,
    OBJ_FREE,
    REVIVE_MON,
    ROT_CORPSE,
    ROOM,
    SDOOR,
    SINK,
    STAIRS,
    STONE,
    TIMER_LEVEL,
    TIMER_OBJECT,
} from '../js/const.js';
import { engr_at, make_engr_at } from '../js/engrave.js';
import { GameMap } from '../js/game.js';
import { make_grave } from '../js/grave.js';
import { newObject, place_object, remove_object } from '../js/obj.js';
import { PM_TROLL } from '../js/monsters.js';
import { CORPSE } from '../js/objects.js';
import {
    count_level_features,
    is_ice,
    set_levltyp,
} from '../js/terrain.js';
import {
    peek_timer,
    start_timer,
    timeout_globals_init,
} from '../js/timeout.js';

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

test('set_levltyp applies live floor, buried, and melt-timer ice effects', () => {
    const state = makeState();
    // These ages and delays make both corpses equivalent at move 100 while
    // exercising the inverse on-ice and off-ice timer transformations.
    state.moves = 100;
    timeout_globals_init(state);
    const x = 31;
    const y = 12;
    const location = state.level.at(31, 12);
    location.typ = ICE;

    const floorCorpse = newObject({ otyp: CORPSE, age: 80 });
    start_timer(40, TIMER_OBJECT, ROT_CORPSE, floorCorpse, state);
    place_object(floorCorpse, x, y, { state });
    assert.equal(floorCorpse.on_ice, true);
    assert.equal(floorCorpse.age, 60);
    assert.equal(peek_timer(ROT_CORPSE, floorCorpse, state), 180);

    const buriedCorpse = newObject({
        otyp: CORPSE,
        ox: x,
        oy: y,
        where: OBJ_BURIED,
        age: 60,
        on_ice: true,
    });
    state.level.buriedobjlist = buriedCorpse;
    start_timer(80, TIMER_OBJECT, ROT_CORPSE, buriedCorpse, state);
    const meltCoordinate = x * 0x10000 + y;
    start_timer(25, TIMER_LEVEL, MELT_ICE_AWAY, meltCoordinate, state);

    assert.equal(set_levltyp(x, y, ROOM, { state }), true);
    assert.equal(location.typ, ROOM);
    for (const corpse of [floorCorpse, buriedCorpse]) {
        assert.equal(corpse.on_ice, false);
        assert.equal(corpse.age, 80);
        assert.equal(peek_timer(ROT_CORPSE, corpse, state), 140);
    }
    assert.equal(peek_timer(MELT_ICE_AWAY, meltCoordinate, state), 0);
});

test('remove_object applies the off-ice adjustment after unlinking', () => {
    const state = makeState();
    // At move 100, a 40-turn rot timer and age 80 make both the doubled
    // on-ice values and their exact inverse visible.
    state.moves = 100;
    timeout_globals_init(state);
    const x = 31;
    const y = 12;
    state.level.at(x, y).typ = ICE;
    const corpse = newObject({ otyp: CORPSE, age: 80 });
    start_timer(40, TIMER_OBJECT, ROT_CORPSE, corpse, state);
    place_object(corpse, x, y, { state });
    assert.equal(corpse.on_ice, true);
    assert.equal(corpse.age, 60);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 180);

    remove_object(corpse, { state });

    assert.equal(corpse.where, OBJ_FREE);
    assert.equal(corpse.on_ice, false);
    assert.equal(corpse.age, 80);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 140);
    assert.equal(state.level.objects[x][y], null);
    assert.equal(state.level.objlist, null);
    assert.equal(corpse.nexthere, null);
    assert.equal(corpse.nobj, null);
});

test('place_object doubles a revival timer when a corpse enters ice', () => {
    const state = makeState();
    // A troll makes REVIVE_MON source-valid; the same move, age, and delay as
    // the rot case isolate the fallback action without changing arithmetic.
    state.moves = 100;
    timeout_globals_init(state);
    const x = 32;
    const y = 12;
    state.level.at(x, y).typ = ICE;
    const corpse = newObject({
        otyp: CORPSE,
        corpsenm: PM_TROLL,
        age: 80,
    });
    start_timer(40, TIMER_OBJECT, REVIVE_MON, corpse, state);

    place_object(corpse, x, y, { state });

    assert.equal(corpse.on_ice, true);
    assert.equal(corpse.age, 60);
    assert.equal(corpse.timed, 1);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 0);
    assert.equal(peek_timer(REVIVE_MON, corpse, state), 180);
});

test('place_object recognizes ice under a raised drawbridge', () => {
    const state = makeState();
    // DB_EAST proves the under-terrain mask is isolated from direction bits.
    state.moves = 100;
    timeout_globals_init(state);
    const x = 33;
    const y = 12;
    const location = state.level.at(x, y);
    location.typ = DRAWBRIDGE_UP;
    location.flags = DB_ICE | DB_EAST;
    const corpse = newObject({ otyp: CORPSE, age: 80 });
    start_timer(40, TIMER_OBJECT, ROT_CORPSE, corpse, state);

    place_object(corpse, x, y, { state });

    assert.equal(corpse.on_ice, true);
    assert.equal(corpse.age, 60);
    assert.equal(peek_timer(ROT_CORPSE, corpse, state), 180);
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
