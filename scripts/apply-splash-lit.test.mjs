import assert from 'node:assert/strict';
import test from 'node:test';

import { OBJ_MINVENT } from '../js/const.js';
import {
    M1_HUMANOID,
    PM_KOBOLD,
} from '../js/monsters.js';
import {
    BRASS_LANTERN,
    OIL_LAMP,
    TALLOW_CANDLE,
} from '../js/objects.js';
import {
    snuff_monster_candle,
    splash_monster_light,
} from '../js/apply_splash_lit.js';

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

test('a stack of candles uses the plural flame message', async () => {
    const { obj } = carriedLight(TALLOW_CANDLE, {
        quan: 2, // Two candles select the plural possessive and verb.
    });
    const events = [];

    const result = await snuff_monster_candle(obj, {
        endBurn: (target) => {
            target.lamplit = false;
            return true;
        },
        message: (text) => events.push(text),
        squareVisible: () => true,
        state: state(),
    });

    assert.equal(result, true);
    assert.deepEqual(events, [
        "The candles' flames are extinguished.",
    ]);
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
