import assert from 'node:assert/strict';
import test from 'node:test';

import { FIRE_RES, W_ARMOR } from '../js/const.js';
import { AD_FIRE } from '../js/monsters.js';
import { inventory_resistance_check } from '../js/zap.js';

test('inventory_resistance_check skips zero protection and uses strict percent comparison', () => {
    const state = { u: { uprops: [] } };
    const unprotectedBounds = [];
    const noProtection = {
        rn2(bound) {
            unprotectedBounds.push(bound);
            throw new Error('zero protection must not roll');
        },
    };

    // zap.c:5714-5715 returns FALSE before rn2 when the A93 resistance helper
    // finds no fire-protection source on the hero.
    assert.equal(
        inventory_resistance_check(AD_FIRE, state, noProtection),
        false,
    );
    assert.deepEqual(unprotectedBounds, []);

    // zap.c:u_adtyp_resistance_obj returns 99 when FIRE_RES has an extrinsic
    // from the W_ARMOR mask.
    state.u.uprops[FIRE_RES] = { extrinsic: W_ARMOR };
    const results = [
        98, // One below 99 succeeds under C's strict `< prob` comparison.
        99, // Exactly 99 fails under the same comparison.
    ];
    const bounds = [];
    const random = {
        rn2(bound) {
            bounds.push(bound);
            return results.shift();
        },
    };

    assert.equal(inventory_resistance_check(AD_FIRE, state, random), true);
    assert.equal(inventory_resistance_check(AD_FIRE, state, random), false);
    assert.deepEqual(bounds, [100, 100]);
    assert.deepEqual(results, []);
});
