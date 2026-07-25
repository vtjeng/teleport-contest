import assert from 'node:assert/strict';
import test from 'node:test';

import {
    OBJ_FLOOR,
    OBJ_MINVENT,
} from '../js/const.js';
import {
    catch_item_light,
    ignite_items,
} from '../js/apply_catch_lit.js';
import {
    OIL_LAMP,
    POT_OIL,
    ROCK,
} from '../js/objects.js';

function ignitionEnv(overrides = {}) {
    return {
        beginBurn: () => assert.fail('unexpected burn'),
        discoverObject: () => assert.fail('unexpected discovery'),
        message: () => assert.fail('unexpected message'),
        random: {
            rn2: () => assert.fail('unexpected ignition draw'),
        },
        squareVisible: () => false,
        state: {},
        ...overrides,
    };
}

test('nonignitable and fuel-empty objects stop before integration', async () => {
    const rock = {
        lamplit: false,
        otyp: ROCK,
    };
    const emptyLamp = {
        age: 0,
        cursed: false,
        lamplit: false,
        otyp: OIL_LAMP,
        spe: 1,
        where: OBJ_FLOOR,
    };

    assert.equal(await catch_item_light(rock, ignitionEnv()), false);
    assert.equal(await catch_item_light(emptyLamp, ignitionEnv()), false);
});

test('a migrating monster inventory has no fire-visible location', async () => {
    const lamp = {
        age: 100,
        cursed: false,
        lamplit: false,
        ocarry: { mx: 0, my: 0 },
        otyp: OIL_LAMP,
        spe: 1,
        where: OBJ_MINVENT,
    };

    assert.equal(await catch_item_light(lamp, ignitionEnv()), false);
});

test('a cursed lamp failure spends its draw before any visible effect',
    async () => {
        const lamp = {
            age: 100,
            cursed: true,
            lamplit: false,
            otyp: OIL_LAMP,
            spe: 1,
            where: OBJ_FLOOR,
        };
        const draws = [];

        const lit = await catch_item_light(lamp, ignitionEnv({
            random: {
                rn2: (bound) => {
                    draws.push(bound);
                    return 0;
                },
            },
        }));

        assert.equal(lit, false);
        assert.deepEqual(draws, [2]);
        assert.equal(lamp.lamplit, false);
    });

test('oil discovery precedes burn startup', async () => {
    const oil = {
        age: 100,
        cursed: false,
        lamplit: false,
        otyp: POT_OIL,
        ox: 4,
        oy: 5,
        spe: 0,
        where: OBJ_FLOOR,
    };
    const events = [];

    const lit = await catch_item_light(oil, ignitionEnv({
        beginBurn: (obj, alreadyLit) => {
            events.push(['burn', obj, alreadyLit]);
            obj.lamplit = true;
        },
        discoverObject: (otyp, markKnown, creditDiscovery, updateInventory) => {
            events.push([
                'discover',
                otyp,
                markKnown,
                creditDiscovery,
                updateInventory,
            ]);
        },
        squareVisible: (x, y) => {
            events.push(['visible', x, y]);
            return false;
        },
    }));

    assert.equal(lit, true);
    assert.equal(oil.lamplit, true);
    assert.deepEqual(events, [
        ['visible', 4, 5],
        ['discover', POT_OIL, true, true, true],
        ['burn', oil, false],
    ]);
});

test('inventory ignition snapshots each next link before burning', async () => {
    const carrier = { mx: 7, my: 8 };
    const second = {
        age: 100,
        cursed: false,
        in_use: false,
        lamplit: false,
        nobj: null,
        ocarry: carrier,
        otyp: OIL_LAMP,
        spe: 1,
        where: OBJ_MINVENT,
    };
    const first = {
        ...second,
        nobj: second,
    };
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
});
