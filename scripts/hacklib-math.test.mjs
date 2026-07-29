// Pin hacklib.c's arithmetic helpers. Every expected value below is derived by
// reading hacklib.c, not by running the JavaScript and recording what it
// produced.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isqrt } from '../js/hacklib.js';

test('isqrt truncates the square root toward zero', () => {
    // hacklib.c isqrt() subtracts 1, 3, 5, ... while the remainder allows it,
    // so it counts the odd numbers below val: the floor of the square root.
    assert.deepEqual(
        [0, 1, 2, 3, 4, 8, 9, 10].map(isqrt),
        [0, 1, 1, 1, 2, 2, 3, 3],
    );
    // The two values spell.c percent_success() reaches for a level 3 spell at
    // Basic (900 * 1 + 2000) and at Unskilled (900 * 7 + 2000). 53 * 53 is
    // 2809 and 54 * 54 is 2916; 91 * 91 is 8281 and 92 * 92 is 8464.
    assert.equal(isqrt(2900), 53);
    assert.equal(isqrt(8300), 91);
});

test('isqrt answers zero for a value below one', () => {
    // The loop condition `val >= odd` is false immediately, so C returns 0
    // rather than looping forever on a negative argument.
    assert.deepEqual([-1, -900].map(isqrt), [0, 0]);
});
