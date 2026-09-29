import assert from 'node:assert/strict';
import test from 'node:test';

import {
    BLINDED,
    DETECT_MONSTERS,
    IN_SIGHT,
    SEE_INVIS,
    TELEPAT,
} from '../js/const.js';
import { knowninvisible } from '../js/display.js';

function invisibleState() {
    const state = {
        u: { ux: 10, uy: 10, uprops: [] },
        viz_array: [],
    };
    return state;
}

test('knowninvisible uses visible see-invisible and monster-detection senses', () => {
    // display.h:_knowninvisible() is pure: it reads minvis, cansee, three
    // properties, and the squared bolt-range distance without changing state.
    const state = invisibleState();
    const monster = { mx: 12, my: 13, minvis: true };
    state.viz_array[13] = [];
    state.viz_array[13][12] = IN_SIGHT;

    state.u.uprops[SEE_INVIS] = { intrinsic: 1, extrinsic: 0 };
    assert.equal(knowninvisible(monster, state), true);
    state.u.uprops[SEE_INVIS] = { intrinsic: 0, extrinsic: 0 };
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 0, extrinsic: 1 };
    assert.equal(knowninvisible(monster, state), true);
    monster.minvis = false;
    assert.equal(knowninvisible(monster, state), false);
});

test('knowninvisible requires unblinded extrinsic telepathy within bolt range', () => {
    // display.h uses ETelepat (not intrinsic blind telepathy) and mdistu <=
    // BOLT_LIM squared; hack.h defines mdistu() with squared Euclidean range.
    const state = invisibleState();
    const monster = { mx: 16, my: 14, minvis: true };
    state.u.uprops[TELEPAT] = { intrinsic: 0, extrinsic: 1 };
    assert.equal(knowninvisible(monster, state), true);

    monster.mx = 17;
    assert.equal(knowninvisible(monster, state), false);
    monster.mx = 16;
    state.u.uprops[BLINDED] = { intrinsic: 1, extrinsic: 0, blocked: 0 };
    assert.equal(knowninvisible(monster, state), false);

    state.u.uprops[TELEPAT] = { intrinsic: 1, extrinsic: 0 };
    state.u.uprops[BLINDED] = null;
    assert.equal(knowninvisible(monster, state), false);
});
