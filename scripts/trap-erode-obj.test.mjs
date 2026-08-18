import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EF_GREASE,
    EF_NONE,
    EF_VERBOSE,
    ERODE_BURN,
    ERODE_RUST,
    ER_DAMAGED,
    ER_GREASED,
    ER_NOTHING,
    OBJ_MINVENT,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_KOBOLD } from '../js/monsters.js';
import {
    ARMOR_CLASS,
    IRON_SHOES,
    LEATHER_GLOVES,
} from '../js/objects.js';
import { erode_obj } from '../js/trap_erode_obj.js';

async function initializedMonster(seed, name) {
    await runSegment({
        seed,
        datetime: '20260724120000',
        nethackrc: `OPTIONS=name:${name},role:Healer,race:human,`
            + 'gender:female,align:neutral,!legacy,!tutorial,!splash_screen',
        moves: ' ',
    });
    const monster = game.level.monlist;
    assert.ok(monster);
    monster.data = game.mons[PM_KOBOLD];
    monster.minvis = false;
    return monster;
}

function carried(monster, type, overrides = {}) {
    const obj = {
        blessed: false,
        greased: false,
        nobj: null,
        ocarry: monster,
        oclass: ARMOR_CLASS,
        oeroded: 0,
        oeroded2: 0,
        oerodeproof: false,
        otyp: type,
        quan: 1,
        rknown: false,
        where: OBJ_MINVENT,
        ...overrides,
    };
    monster.minvent = obj;
    return obj;
}

test('visible rust damage increments primary erosion after its message',
    async () => {
        const monster = await initializedMonster(982461, 'RustErosion');
        const shoes = carried(monster, IRON_SHOES);
        const events = [];

        const result = await erode_obj(
            shoes,
            'shoes',
            ERODE_RUST,
            EF_NONE,
            {
                canSeeMonster: () => true,
                message: (text) => events.push([text, shoes.oeroded]),
                random: {
                    rnl: () => assert.fail('ordinary gear needs no luck draw'),
                    rn2: () => assert.fail('ungreased gear needs no draw'),
                },
                state: game,
            },
        );

        assert.equal(result, ER_DAMAGED);
        assert.deepEqual(events, [
            ["The kobold's shoes rust!", 0],
        ]);
        assert.equal(shoes.oeroded, 1);
    });

test('blessed protection uses rnl before changing erosion', async () => {
    const monster = await initializedMonster(982462, 'BlessedErosion');
    const shoes = carried(monster, IRON_SHOES, { blessed: true });
    const draws = [];

    const result = await erode_obj(
        shoes,
        'shoes',
        ERODE_RUST,
        EF_NONE,
        {
            canSeeMonster: () => false,
            random: {
                rnl: (bound) => {
                    draws.push(bound);
                    return 0; // Zero activates the source blessed protection.
                },
                rn2: () => assert.fail('ungreased gear needs no draw'),
            },
            state: game,
        },
    );

    assert.equal(result, ER_NOTHING);
    assert.deepEqual(draws, [4]);
    assert.equal(shoes.oeroded, 0);
});

test('grease blocks fire before material and erosion checks', async () => {
    const monster = await initializedMonster(982463, 'GreasedErosion');
    const gloves = carried(monster, LEATHER_GLOVES, { greased: true });
    const events = [];

    const result = await erode_obj(
        gloves,
        'gloves',
        ERODE_BURN,
        EF_GREASE,
        {
            canSeeMonster: () => true,
            message: (text) => events.push(text),
            random: {
                rnl: () => assert.fail('grease stops before blessed luck'),
                rn2: (bound) => {
                    assert.equal(bound, 2);
                    return 0; // Zero consumes the layer of grease.
                },
            },
            state: game,
        },
    );

    assert.equal(result, ER_GREASED);
    assert.equal(gloves.greased, false);
    assert.deepEqual(events, [
        "The kobold's gloves are protected by the layer of grease!",
    ]);
});

test('verbose proof recognition records monster-visible knowledge', async () => {
    const monster = await initializedMonster(982464, 'ProofErosion');
    const shoes = carried(monster, IRON_SHOES, {
        oerodeproof: true,
    });
    const messages = [];

    const result = await erode_obj(
        shoes,
        'shoes',
        ERODE_RUST,
        EF_VERBOSE,
        {
            canSeeMonster: () => true,
            message: (text) => messages.push(text),
            random: {
                rnl: () => assert.fail('proof gear needs no luck draw'),
                rn2: () => assert.fail('ungreased gear needs no draw'),
            },
            state: game,
        },
    );

    assert.equal(result, ER_NOTHING);
    assert.equal(shoes.rknown, true);
    assert.deepEqual(messages, [
        "Somehow, the kobold's shoes are not affected by the oxidation.",
    ]);
});
