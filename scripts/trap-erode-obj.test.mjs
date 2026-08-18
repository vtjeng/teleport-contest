import assert from 'node:assert/strict';
import test from 'node:test';

import {
    EF_GREASE,
    EF_NONE,
    EF_VERBOSE,
    ERODE_BURN,
    ERODE_CORRODE,
    ERODE_CRACK,
    ERODE_ROT,
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

test('grease does not block fire, because C clears check_grease for a burn',
    async () => {
        // trap.c:204-210. `case ERODE_BURN` sets check_grease = FALSE, and the
        // grease arm at 246 is `check_grease && otmp->greased`, so a burn
        // never consults grease however the caller sets EF_GREASE. Leather
        // gloves are flammable, so C burns them and says so.
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
                    rnl: () => assert.fail('a burn draws no luck roll'),
                    rn2: (bound) => assert.fail(
                        `a burn draws no rn2(${bound}); the grease arm C skips `
                        + 'is the only rn2(2) on this path',
                    ),
                },
                state: game,
            },
        );

        // The grease survives untouched, which is the half a wrong guard would
        // consume, and the gloves take the erosion instead.
        assert.equal(result, ER_DAMAGED);
        assert.equal(gloves.greased, true);
        assert.equal(gloves.oeroded, 1);
        assert.deepEqual(events, ["The kobold's gloves smoulder!"]);
    });

test('every erosion type consults grease exactly as C\'s switch says',
    async () => {
        // trap.c:203-237 assigns check_grease per type: cleared for
        // ERODE_BURN (208) and ERODE_ROT (217), left TRUE for ERODE_RUST,
        // ERODE_CORRODE and ERODE_CRACK. The grease arm at 246 is the only
        // reader, and it runs before the vulnerability test, so one object
        // shape separates all five rows.
        for (const [type, name, greaseApplies] of [
            [ERODE_BURN, 'ERODE_BURN', false],
            [ERODE_RUST, 'ERODE_RUST', true],
            [ERODE_ROT, 'ERODE_ROT', false],
            [ERODE_CORRODE, 'ERODE_CORRODE', true],
            [ERODE_CRACK, 'ERODE_CRACK', true],
        ]) {
            const monster = await initializedMonster(982466, `Grease${type}`);
            const shoes = carried(monster, IRON_SHOES, { greased: true });
            const events = [];
            const result = await erode_obj(shoes, 'shoes', type, EF_GREASE, {
                canSeeMonster: () => true,
                message: (text) => events.push(text),
                random: { rnl: () => 1, rn2: () => 0 },
                state: game,
            });
            const greased = result === ER_GREASED;
            assert.equal(greased, greaseApplies, name);
            assert.equal(
                events.some((text) => text.includes('layer of grease')),
                greaseApplies,
                `${name} message`,
            );
        }
    });

test('grease still blocks rust, the arm C leaves check_grease set for',
    async () => {
        // trap.c:211-214. `case ERODE_RUST` leaves check_grease TRUE, so the
        // arm at 246 runs and grease_protect() answers ER_GREASED. This is
        // what keeps the fix above from deleting behavior C has.
        const monster = await initializedMonster(982465, 'GreasedRust');
        const shoes = carried(monster, IRON_SHOES, { greased: true });
        const events = [];

        const result = await erode_obj(
            shoes,
            'shoes',
            ERODE_RUST,
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
        assert.equal(shoes.greased, false);
        assert.equal(shoes.oeroded, 0);
        assert.deepEqual(events, [
            "The kobold's shoes are protected by the layer of grease!",
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
