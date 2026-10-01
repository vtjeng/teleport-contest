import assert from 'node:assert/strict';
import test from 'node:test';

import {
    AGGRAVATE_MONSTER,
    COLD_RES,
    FAST,
    FIRE_RES,
    FROMOUTSIDE,
    HALLUC,
    HALLUC_RES,
    INTRINSIC,
    INVIS,
    POISON_RES,
    PROTECTION,
    SEE_INVIS,
    STEALTH,
    TELEPAT,
    TELEPORT,
    TIMEOUT,
} from '../js/const.js';
import { attrcurse } from '../js/sit.js';

// Every row mirrors one ordered switch arm in sit.c:647-737; starting at
// case 1 with only its intrinsic present tests both the return enum and the
// source feedback without consuming any other random value.
const intrinsicCases = [
    [FIRE_RES, 'You feel warmer.'], // Case 1 strips fire resistance.
    [TELEPORT, 'You feel less jumpy.'], // Case 2 strips teleportation.
    [POISON_RES, 'You feel a little sick!'], // Case 3 strips poison resistance.
    [TELEPAT, 'Your senses fail!'], // Case 4 strips telepathy.
    [COLD_RES, 'You feel cooler.'], // Case 5 strips cold resistance.
    [INVIS, 'You feel paranoid.'], // Case 6 strips invisibility.
    [FAST, 'You feel slower.'], // Case 8 strips speed.
    [STEALTH, 'You feel clumsy.'], // Case 9 strips stealth.
    [PROTECTION, 'You feel vulnerable.'], // Case 10 strips protection.
    [AGGRAVATE_MONSTER, 'You feel less attractive.'], // Case 11 strips aggravation.
];

for (const [propertyId, expectedMessage] of intrinsicCases) {
    test(`attrcurse strips property ${propertyId} and returns its C enum`, async () => {
        const state = { u: { uprops: {} } };
        const messages = [];
        // The low timeout bits stand for an unrelated timed source and must
        // survive clearing the high INTRINSIC bits in sit.c:652-654.
        state.u.uprops[propertyId] = {
            intrinsic: TIMEOUT | FROMOUTSIDE,
            extrinsic: 0,
        };
        let draws = 0;

        const result = await attrcurse(state, {
            random: {
                rnd(bound) {
                    ++draws;
                    assert.equal(bound, 11); // C makes exactly rnd(11).
                    return 1; // Case 1 falls through to this sole present property.
                },
            },
            message: async (line) => messages.push(line),
        });

        assert.equal(draws, 1);
        assert.equal(result, propertyId);
        assert.equal(state.u.uprops[propertyId].intrinsic, TIMEOUT);
        assert.deepEqual(messages, [expectedMessage]);
    });
}

test('attrcurse preserves the case-4 fallthrough to intrinsic stealth', async () => {
    const state = { u: { uprops: { [STEALTH]: { intrinsic: INTRINSIC, extrinsic: 0 } } } };
    const messages = [];

    const result = await attrcurse(state, {
        random: { rnd: (bound) => {
            assert.equal(bound, 11); // C's selected value starts at case 4.
            return 4;
        } },
        message: async (line) => messages.push(line),
    });

    assert.equal(result, STEALTH);
    assert.equal(state.u.uprops[STEALTH].intrinsic, 0);
    assert.deepEqual(messages, ['You feel clumsy.']);
});

test('attrcurse leaves extrinsic-only properties and returns zero', async () => {
    const state = {
        u: {
            uprops: {
                [AGGRAVATE_MONSTER]: { intrinsic: 0, extrinsic: 1 },
            },
        },
    };
    let draws = 0;
    const messages = [];

    const result = await attrcurse(state, {
        random: { rnd: (bound) => {
            ++draws;
            assert.equal(bound, 11); // C draws once even when no intrinsic is removable.
            return 11;
        } },
        message: async (line) => messages.push(line),
    });

    assert.equal(result, 0);
    assert.equal(draws, 1);
    assert.equal(state.u.uprops[AGGRAVATE_MONSTER].extrinsic, 1);
    assert.deepEqual(messages, []);
});

test('attrcurse uses the hallucination-specific see-invisible feedback', async () => {
    const state = {
        u: {
            uprops: {
                [SEE_INVIS]: { intrinsic: INTRINSIC, extrinsic: 1 },
                [HALLUC]: { intrinsic: 1, extrinsic: 0 },
                [HALLUC_RES]: { intrinsic: 0, extrinsic: 0 },
            },
        },
    };
    const messages = [];

    const result = await attrcurse(state, {
        random: { rnd: (bound) => {
            assert.equal(bound, 11); // Start directly at sit.c case 7.
            return 7;
        } },
        message: async (line) => messages.push(line),
    });

    assert.equal(result, SEE_INVIS);
    assert.equal(state.u.uprops[SEE_INVIS].intrinsic, 0);
    assert.equal(state.u.uprops[SEE_INVIS].extrinsic, 1);
    assert.deepEqual(messages, ['You tawt you taw a puttie tat!']);
});
