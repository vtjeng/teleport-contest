import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    BLINDED,
    OBJ_CONTAINED,
    OBJ_FLOOR,
    OBJ_INVENT,
    OBJ_MINVENT,
    ROOMOFFSET,
    SHOPBASE,
} from '../js/const.js';
import {
    catch_lit,
    ignitable,
    ignite_items,
} from '../js/apply_catch_lit.js';
import {
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    MAGIC_LAMP,
    OIL_LAMP,
    POT_OIL,
    POTION_CLASS,
    ROCK,
    TALLOW_CANDLE,
    TOOL_CLASS,
    WAX_CANDLE,
} from '../js/objects.js';
import { game } from '../js/gstate.js';
import { init_objects } from '../js/o_init.js';

// This fueled age keeps relative-age light sources past catch_lit's zero-fuel
// guard; positive spe keeps the magic lamp and candelabrum occupied.
const FUELED_AGE = 100;
// These valid map coordinates distinguish carried from floor visibility.
const HERO_X = 2;
const HERO_Y = 3;
const FLOOR_X = 4;
const FLOOR_Y = 5;
// The first draw fails and the second passes C's `!rn2(2)` cursed-lamp gate.
const CURSED_LAMP_RN2_BOUND = 2;
const FAILED_RN2_RESULT = 0;
const PASSED_RN2_RESULT = 1;
// Zero fuel and zero spe each exercise the corresponding source early return.
const EMPTY_FUEL_AGE = 0;
const EMPTY_LIGHT_SPE = 0;
const ACTIVE_INTRINSIC_VALUE = 1;
const SINGULAR_QUANTITY = 1;
const POSITIVE_LIGHT_SPE = 1;
// A room number at ROOMOFFSET is the first valid room-backed test lookup.
const FIRST_ROOM_NUMBER = ROOMOFFSET;

function ignitionEnv(overrides = {}) {
    const state = {
        gp: {},
        u: { ux: HERO_X, uy: HERO_Y, uprops: [] },
    };
    // A zero-returning initializer makes object-name discovery lists valid
    // without introducing an unrecorded random source into this focused test.
    init_objects(state, () => FAILED_RN2_RESULT);
    return {
        beginBurn: () => assert.fail('unexpected burn'),
        discoverObject: () => assert.fail('unexpected discovery'),
        message: () => assert.fail('unexpected message'),
        random: {
            rn2: () => assert.fail('unexpected ignition draw'),
        },
        squareVisible: () => false,
        state,
        ...overrides,
    };
}

function lightSource(otyp, where = OBJ_FLOOR, overrides = {}) {
    // The unit quantity exercises singular grammar; positive spe keeps empty
    // magic lamps and candelabra beyond their early return. These map
    // coordinates provide a valid floor location when the object is not
    // carried.
    return {
        age: FUELED_AGE,
        cursed: false,
        lamplit: false,
        oclass: otyp === POT_OIL ? POTION_CLASS : TOOL_CLASS,
        otyp,
        ox: FLOOR_X,
        oy: FLOOR_Y,
        quan: SINGULAR_QUANTITY,
        spe: POSITIVE_LIGHT_SPE,
        where,
        ...overrides,
    };
}

test('ignitable matches the source macro membership', async () => {
    const source = await readFile(
        new URL('../nethack-c/upstream/include/obj.h', import.meta.url),
        'utf8',
    );
    const ageStart = source.indexOf('#define age_is_relative(otmp)');
    const ageEnd = source.indexOf('/* object can be ignited;', ageStart);
    const ageMacro = source.slice(ageStart, ageEnd).replaceAll('\\\n', ' ');
    const start = source.indexOf('#define ignitable(otmp)');
    const end = source.indexOf('\n\n', start);
    const macro = source.slice(start, end).replaceAll('\\\n', ' ');

    assert.ok(ageStart >= 0, 'obj.h must define source age_is_relative');
    assert.ok(start >= 0, 'obj.h must define the source ignitable macro');
    for (const typeName of [
        'BRASS_LANTERN',
        'OIL_LAMP',
        'MAGIC_LAMP',
        'CANDELABRUM_OF_INVOCATION',
        'TALLOW_CANDLE',
        'WAX_CANDLE',
        'POT_OIL',
    ]) {
        assert.ok(macro.includes(typeName));
    }
    for (const typeName of [
        'BRASS_LANTERN',
        'OIL_LAMP',
        'CANDELABRUM_OF_INVOCATION',
        'TALLOW_CANDLE',
        'WAX_CANDLE',
        'POT_OIL',
    ]) {
        assert.ok(ageMacro.includes(typeName));
    }
    assert.doesNotMatch(ageMacro, /MAGIC_LAMP/u);

    assert.equal(ignitable({ otyp: BRASS_LANTERN }), true);
    assert.equal(ignitable({ otyp: OIL_LAMP }), true);
    assert.equal(ignitable({ otyp: MAGIC_LAMP, spe: POSITIVE_LIGHT_SPE }), true);
    assert.equal(ignitable({ otyp: MAGIC_LAMP, spe: EMPTY_LIGHT_SPE }), false);
    assert.equal(ignitable({ otyp: CANDELABRUM_OF_INVOCATION }), true);
    assert.equal(ignitable({ otyp: TALLOW_CANDLE }), true);
    assert.equal(ignitable({ otyp: WAX_CANDLE }), true);
    assert.equal(ignitable({ otyp: POT_OIL }), true);
    assert.equal(ignitable({ otyp: ROCK }), false);
});

test('the initial type, light and location guards return false', async () => {
    const rock = lightSource(ROCK);
    const containedLamp = lightSource(OIL_LAMP, OBJ_CONTAINED);
    const emptyMagicLamp = lightSource(MAGIC_LAMP, OBJ_FLOOR, {
        // C refuses a magic lamp without its djinni at the zero-spe state.
        spe: EMPTY_LIGHT_SPE,
    });
    const emptyCandelabrum = lightSource(
        CANDELABRUM_OF_INVOCATION,
        OBJ_FLOOR,
        { spe: EMPTY_LIGHT_SPE },
    );
    const litLamp = lightSource(OIL_LAMP, OBJ_FLOOR, { lamplit: true });
    const brassLantern = lightSource(BRASS_LANTERN);

    assert.equal(await catch_lit(rock, ignitionEnv()), false);
    assert.equal(await catch_lit(containedLamp, ignitionEnv()), false);
    assert.equal(await catch_lit(emptyMagicLamp, ignitionEnv()), false);
    assert.equal(await catch_lit(emptyCandelabrum, ignitionEnv()), false);
    assert.equal(await catch_lit(litLamp, ignitionEnv()), false);
    assert.equal(await catch_lit(brassLantern, ignitionEnv()), false);
});

test('age_is_relative sources reject zero fuel but magic lamps do not',
    async () => {
        // C obj.h excludes MAGIC_LAMP from age_is_relative(), despite checking
        // the same age field for oil, candles, candelabra and oil potions.
        const relativeTypes = [
            OIL_LAMP,
            CANDELABRUM_OF_INVOCATION,
            TALLOW_CANDLE,
            WAX_CANDLE,
            POT_OIL,
        ];
        for (const otyp of relativeTypes) {
            const obj = lightSource(otyp, OBJ_FLOOR, {
                // C age==0 is its out-of-fuel guard for these source types.
                age: EMPTY_FUEL_AGE,
            });
            assert.equal(await catch_lit(obj, ignitionEnv()), false, otyp);
        }

        const magicLamp = lightSource(MAGIC_LAMP, OBJ_FLOOR, {
            // C magic lamps use age as an absolute value, not fuel.
            age: EMPTY_FUEL_AGE,
        });
        let burnStarted = false;
        assert.equal(await catch_lit(magicLamp, ignitionEnv({
            beginBurn: () => { burnStarted = true; },
        })), true);
        assert.equal(burnStarted, true);
    },
);

test('a cursed candelabrum returns before output and burn startup', async () => {
    const candelabrum = lightSource(
        CANDELABRUM_OF_INVOCATION,
        OBJ_FLOOR,
        { cursed: true },
    );

    assert.equal(await catch_lit(candelabrum, ignitionEnv()), false);
});

test('inventory oil is named, discovered, and lit in C order', async () => {
    const state = ignitionEnv().state;
    const oil = lightSource(POT_OIL, OBJ_INVENT);
    const events = [];

    const result = await catch_lit(oil, ignitionEnv({
        beginBurn: (obj, alreadyLit, env) => {
            events.push(['burn', obj, alreadyLit, env.state]);
            obj.lamplit = true;
        },
        discoverObject: (otyp, known, credit, update, targetState) => {
            events.push(['discover', otyp, known, credit, update, targetState]);
        },
        message: (line, targetState) => {
            events.push(['message', line, targetState]);
        },
        state,
    }));

    assert.equal(result, true);
    assert.equal(oil.lamplit, true);
    assert.equal(events[0][0], 'message');
    assert.match(events[0][1], /^[A-Z].* catches light!$/u);
    assert.equal(events[0][2], state);
    assert.deepEqual(events[1], ['discover', POT_OIL, true, true, true, state]);
    assert.deepEqual(events[2], ['burn', oil, false, state]);
});

test('blind inventory feedback uses the source feel-warm grammar', async () => {
    const state = ignitionEnv().state;
    state.u.uprops[BLINDED] = { intrinsic: ACTIVE_INTRINSIC_VALUE };
    const lamp = lightSource(OIL_LAMP, OBJ_INVENT);
    const messages = [];

    await catch_lit(lamp, ignitionEnv({
        beginBurn: () => {},
        message: (line) => messages.push(line),
        state,
    }));

    assert.equal(messages.length, 1);
    assert.match(messages[0], /^[A-Z].* feels warm\.$/u);
});

test('visible floor feedback records the set_msg_xy gap before naming', async () => {
    game.unported = new Set();
    const oil = lightSource(POT_OIL, OBJ_FLOOR);
    const state = ignitionEnv().state;
    const events = [];

    await catch_lit(oil, ignitionEnv({
        beginBurn: () => events.push('burn'),
        discoverObject: () => events.push('discover'),
        message: (line) => events.push(['message', line]),
        squareVisible: (x, y) => {
            events.push(['visible', x, y]);
            return true;
        },
        state,
    }));

    assert.deepEqual(events.map((event) => Array.isArray(event)
        ? event[0] : event), [
        'visible',
        'visible',
        'message',
        'discover',
        'burn',
    ]);
    assert.equal(events[2][0], 'message');
    assert.match(events[2][1], /^[A-Z].* catches light!$/u);
    assert.ok(game.unported.has('pline.c set_msg_xy'));
});

test('unpaid carried oil skips only check_unpaid and keeps billing order',
    async () => {
        game.unported = new Set();
        const state = ignitionEnv().state;
        const oil = lightSource(POT_OIL, OBJ_INVENT, { unpaid: true });
        const events = [];

        await catch_lit(oil, ignitionEnv({
            beginBurn: () => events.push('burn'),
            billDummyObject: (obj, env) => {
                events.push(['bill', obj, env.state]);
            },
            costlySpot: (x, y) => {
                events.push(['costly', x, y]);
                return true;
            },
            discoverObject: () => events.push('discover'),
            inRooms: (x, y, roomType) => {
                events.push(['rooms', x, y, roomType]);
                return [FIRST_ROOM_NUMBER];
            },
            message: (line) => events.push(['message', line]),
            shopKeeper: (roomno) => events.push(['keeper', roomno]),
            state,
            verbalize: (line) => events.push(['verbalize', line]),
        }));

        assert.deepEqual(events.map((event) => Array.isArray(event)
            ? event[0] : event), [
            'message',
            'discover',
            'costly',
            'rooms',
            'keeper',
            'verbalize',
            'bill',
            'burn',
        ]);
        assert.deepEqual(events[2], ['costly', HERO_X, HERO_Y]);
        assert.deepEqual(events[3], ['rooms', HERO_X, HERO_Y, SHOPBASE]);
        assert.deepEqual(events[4], ['keeper', FIRST_ROOM_NUMBER]);
        assert.deepEqual(events[6], ['bill', oil, state]);
        assert.equal(events[0][0], 'message');
        assert.match(events[0][1], /^[A-Z].* catches light!$/u);
        assert.equal(events[5][0], 'verbalize');
        assert.match(events[5][1], /^That's in addition/u);
        assert.match(events[5][1], /itself, of course\.$/u);
        assert.ok(game.unported.has('shk.c check_unpaid'));
    },
);

test('a cursed lamp failure spends its draw before any side effect',
    async () => {
        const lamp = lightSource(OIL_LAMP, OBJ_FLOOR, { cursed: true });
        const draws = [];
        const random = { rn2: (bound) => {
            draws.push(bound);
            return FAILED_RN2_RESULT;
        } };

        assert.equal(await catch_lit(lamp, ignitionEnv({ random })), false);
        assert.deepEqual(draws, [CURSED_LAMP_RN2_BOUND]);
        assert.equal(lamp.lamplit, false);
    });

test('the successful cursed-lamp draw reaches burn startup', async () => {
    const lamp = lightSource(OIL_LAMP, OBJ_FLOOR, { cursed: true });
    const draws = [];
    let burns = 0;

    const lit = await catch_lit(lamp, ignitionEnv({
        beginBurn: () => { ++burns; },
        random: { rn2: (bound) => {
            draws.push(bound);
            return PASSED_RN2_RESULT;
        } },
    }));

    assert.equal(lit, true);
    assert.deepEqual(draws, [CURSED_LAMP_RN2_BOUND]);
    assert.equal(burns, 1);
});

test('ignite_items snapshots each next link before catch_lit mutates it',
    async () => {
        // Nonzero map coordinates make the monster inventory locatable.
        const carrier = { mx: 7, my: 8 };
        const second = lightSource(OIL_LAMP, OBJ_MINVENT, {
            in_use: false,
            nobj: null,
            ocarry: carrier,
        });
        const first = lightSource(OIL_LAMP, OBJ_MINVENT, {
            in_use: false,
            nobj: second,
            ocarry: carrier,
        });
        const burned = [];

        await ignite_items(first, ignitionEnv({
            beginBurn: (obj) => {
                burned.push(obj);
                obj.lamplit = true;
                obj.nobj = null;
            },
        }));

        assert.deepEqual(burned, [first, second]);
        assert.equal(first.lamplit, true);
        assert.equal(second.lamplit, true);
    },
);

test('the obsolete item-ignition refusal is absent from cmd.js', async () => {
    const source = await readFile(
        new URL('../js/cmd.js', import.meta.url),
        'utf8',
    );

    assert.doesNotMatch(source, /UnsupportedItemIgnitionError/u);
});
