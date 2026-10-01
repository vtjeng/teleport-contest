import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_INVENT, OBJ_MINVENT } from '../js/const.js';
import {
    M1_HUMANOID,
    PM_KOBOLD,
} from '../js/monsters.js';
import {
    BRASS_LANTERN,
    CANDELABRUM_OF_INVOCATION,
    OIL_LAMP,
    TALLOW_CANDLE,
} from '../js/objects.js';
import {
    snuff_candle,
    splash_monster_light,
} from '../js/apply_splash_lit.js';
import { Shk_Your } from '../js/shk.js';

// The hero is at (10,10); carriedLight() puts its carrier at (11,10),
// which lets get_obj_location() exercise the visible OBJ_MINVENT branch.
function state() {
    return {
        u: {
            uprops: [],
            ux: 10,
            uy: 10,
            uz: { dnum: 0, dlevel: 1 },
        },
        water_level: { dnum: 4, dlevel: 6 },
    };
}

function carriedLight(type, overrides = {}) {
    const monster = {
        data: {
            mflags1: 0,
            pmidx: PM_KOBOLD,
        },
        mx: 11,
        my: 10,
    };
    const obj = {
        age: 300,
        lamplit: true,
        ocarry: monster,
        otyp: type,
        quan: 1,
        spe: 0,
        where: OBJ_MINVENT,
        ...overrides,
    };
    return { monster, obj };
}

test('a visible monster-carried oil lamp goes out before burn cleanup',
    async () => {
        const { obj } = carriedLight(OIL_LAMP);
        const events = [];

        const result = await splash_monster_light(obj, {
            endBurn: (target) => {
                events.push(['end', target.lamplit]);
                target.lamplit = false;
                return true;
            },
            message: (text) => events.push(['message', text]),
            objectName: () => 'oil lamp',
            squareVisible: () => true,
            state: state(),
        });

        assert.equal(result, true);
        assert.deepEqual(events, [
            ['message', 'The oil lamp goes out!'],
            ['end', true],
        ]);
        assert.equal(obj.lamplit, false);
    });

test('snuff_candle uses the source owner prefix and message-before-burn order',
    async () => {
        const { obj } = carriedLight(TALLOW_CANDLE, {
            quan: 2, // C uses quan > 1 for the plural candle possessive and verb.
        });
        const currentState = state();
        const events = [];

        const result = await snuff_candle(obj, {
            endBurn: (target) => {
                events.push(['end', target.lamplit]);
                target.lamplit = false;
                return true;
            },
            message: (text) => events.push(['message', text]),
            squareVisible: (x, y) => {
                // C get_obj_location() returns the carrier's (11,10) square.
                assert.deepEqual([x, y], [11, 10]);
                return true;
            },
            state: currentState,
        });

        assert.equal(result, true);
        assert.deepEqual(events, [
            ['message', `${Shk_Your(obj, currentState)}candles' flames are extinguished.`],
            ['end', true],
        ]);
        assert.equal(obj.lamplit, false);
    });

test('snuff_candle still ends a hidden monster-carried candle burn', async () => {
    const { obj } = carriedLight(TALLOW_CANDLE);
    const events = [];

    const result = await snuff_candle(obj, {
        endBurn: (target) => {
            events.push(['end', target.lamplit]);
            target.lamplit = false;
        },
        message: () => assert.fail('C cansee suppresses this hidden square'),
        squareVisible: () => false, // The one carrier square is outside sight.
        state: state(),
    });

    assert.equal(result, true);
    assert.deepEqual(events, [['end', true]]);
    assert.equal(obj.lamplit, false);
});

test('snuff_candle uses candelabrum spe for its plural suffix', async () => {
    const currentState = state();
    const obj = {
        lamplit: true,
        otyp: CANDELABRUM_OF_INVOCATION,
        quan: 1, // C ignores the candelabrum's object quantity for `many`.
        spe: 2, // Two attached candles select C's plural suffix and verb.
        where: OBJ_INVENT,
    };
    const events = [];

    const result = await snuff_candle(obj, {
        endBurn: (target) => {
            events.push(['end', target.lamplit]);
            target.lamplit = false;
            return true;
        },
        message: (text) => events.push(['message', text]),
        state: currentState,
    });

    assert.equal(result, true);
    assert.deepEqual(events, [
        ['message', "Your candelabrum's candles' flames are extinguished."],
        ['end', true],
    ]);
    assert.equal(obj.lamplit, false);
});

test('snuff_candle ends a blind hero-held candle burn without a message', async () => {
    const currentState = state();
    const obj = {
        lamplit: true,
        otyp: TALLOW_CANDLE,
        quan: 1, // A single candle selects the singular source message if visible.
        where: OBJ_INVENT,
    };
    const events = [];

    const result = await snuff_candle(obj, {
        endBurn: (target) => {
            events.push(['end', target.lamplit]);
            target.lamplit = false;
            return true;
        },
        heroBlind: () => true, // C's !Blind guard suppresses only the pline.
        message: () => assert.fail('C suppresses this message while Blind'),
        state: currentState,
    });

    assert.equal(result, true);
    assert.deepEqual(events, [['end', true]]);
    assert.equal(obj.lamplit, false);
});

test('snuff_candle ignores a lit non-candle object', async () => {
    const { obj } = carriedLight(OIL_LAMP);

    const result = await snuff_candle(obj, {
        endBurn: () => assert.fail('C only handles candles and the candelabrum'),
        message: () => assert.fail('C does not name a non-candle here'),
        state: state(),
    });

    assert.equal(result, false);
    assert.equal(obj.lamplit, true);
});

test('a dry humanoid brass lantern crackles without being snuffed',
    async () => {
        const { monster, obj } = carriedLight(BRASS_LANTERN);
        monster.data.mflags1 = M1_HUMANOID;
        const events = [];

        const result = await splash_monster_light(obj, {
            endBurn: () => assert.fail('a dry humanoid lantern stays lit'),
            message: (text) => events.push(text),
            objectName: () => 'brass lantern',
            poolAt: () => false,
            squareCouldSee: () => true,
            squareVisible: () => true,
            state: state(),
        });

        assert.equal(result, false);
        assert.equal(obj.lamplit, true);
        assert.deepEqual(events, [
            'The brass lantern crackles and flickers.',
        ]);
    });

test('a nonhumanoid carrier receives ordinary lantern snuffing', async () => {
    const { obj } = carriedLight(BRASS_LANTERN);
    const events = [];

    const result = await splash_monster_light(obj, {
        endBurn: (target) => {
            events.push('end');
            target.lamplit = false;
            return true;
        },
        message: (text) => events.push(text),
        objectName: () => 'brass lantern',
        squareVisible: () => true,
        state: state(),
    });

    assert.equal(result, true);
    assert.deepEqual(events, [
        'The brass lantern goes out!',
        'end',
    ]);
});
