import assert from 'node:assert/strict';
import test from 'node:test';

import {
    A_DEX, A_STR, CONFUSION, DEAF, FROM_FORM, FROMOUTSIDE, HALLUC,
    HALLUC_RES, SICK, SLIMED, STONED, STRANGLED, STUNNED, TIMEOUT,
    VOMITING, WEAK, WOUNDED_LEGS,
} from '../js/const.js';
import { unfixable_trouble_count } from '../js/apply.js';

function troubleState() {
    return {
        u: {
            atemp: [0, 0, 0, 0, 0, 0],
            uhs: 0,
            uprops: [],
            uroleplay: {},
        },
    };
}

function intrinsic(state, property, value) {
    state.u.uprops[property] ??= { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[property].intrinsic = value;
}

test('unfixable_trouble_count matches apply.c permanent and timed masks', () => {
    // apply.c counts Stoned, Slimed, Strangled, wounded legs with negative
    // ATEMP(A_DEX), and hunger weakness with negative ATEMP(A_STR) regardless
    // of the horn flag. The six remaining clauses are timed maladies which
    // count for a potion, but not for a horn unless bits outside TIMEOUT remain.
    const state = troubleState();
    intrinsic(state, STONED, 1);
    intrinsic(state, SLIMED, 1);
    intrinsic(state, STRANGLED, 1);
    state.u.atemp[A_DEX] = -1;
    state.u.uprops[WOUNDED_LEGS] = { intrinsic: 0, extrinsic: 1 };
    state.u.atemp[A_STR] = -1;
    state.u.uhs = WEAK;
    intrinsic(state, SICK, 7);
    intrinsic(state, STUNNED, 8);
    intrinsic(state, CONFUSION, 9);
    intrinsic(state, HALLUC, 10);
    intrinsic(state, VOMITING, 11);
    intrinsic(state, DEAF, 12);

    const before = structuredClone(state);
    assert.equal(unfixable_trouble_count(false, state), 11);
    assert.equal(unfixable_trouble_count(true, state), 5);
    assert.deepEqual(state, before,
        'the helper only reads the property, attribute, and hunger state');
});

test('unfixable_trouble_count retains non-timeout bits and source exclusions', () => {
    const state = troubleState();
    intrinsic(state, SICK, TIMEOUT | FROMOUTSIDE);
    intrinsic(state, STUNNED, TIMEOUT | FROM_FORM);
    intrinsic(state, CONFUSION, TIMEOUT);
    intrinsic(state, HALLUC, TIMEOUT);
    intrinsic(state, HALLUC_RES, 1);
    intrinsic(state, VOMITING, TIMEOUT);
    intrinsic(state, DEAF, TIMEOUT);
    state.u.uroleplay.deaf = true;

    assert.equal(unfixable_trouble_count(false, state), 5,
        'potion counts all but hallucination suppressed by resistance');
    assert.equal(unfixable_trouble_count(true, state), 2,
        'horn counts only permanent sickness/stun; roleplay Deaf has no HDeaf bits');

    state.u.uprops[HALLUC_RES].intrinsic = 0;
    assert.equal(unfixable_trouble_count(true, state), 2,
        'timed hallucination is horn-fixable');
});
