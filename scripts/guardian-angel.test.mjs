import assert from 'node:assert/strict';
import test from 'node:test';

import { DEAF, TIMEOUT } from '../js/const.js';
import { Hear_again } from '../js/eat.js';

test('Hear_again uses its coin flip to clear timed deafness', async () => {
    const deafness = { intrinsic: TIMEOUT & 12, extrinsic: 0 };
    const calls = [];
    const state = { u: { uprops: { [DEAF]: deafness } }, disp: {} };
    const random = { rn2(bound) { calls.push(bound); return 0; } };

    const result = await Hear_again(state, { random });

    assert.equal(result, 0);
    assert.deepEqual(calls, [2]);
    // eat.c makes deafness clear when rn2(2) returns zero.
    assert.equal(deafness.intrinsic & TIMEOUT, 0);
    assert.equal(state.disp.botl, true);
});
