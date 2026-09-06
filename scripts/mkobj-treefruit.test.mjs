// Pin is_treefruit, a pure function from mkobj.c that checks whether an
// object is one of the five tree fruits: APPLE (277), ORANGE (278),
// PEAR (279), BANANA (281), EUCALYPTUS_LEAF (276).
//
// Expected values come from reading mkobj.c lines 1978-1998 and the
// objects.h constant definitions, not from running the port.

import assert from 'node:assert/strict';
import test from 'node:test';

import { is_treefruit } from '../js/obj.js';

// -- Positive cases: every entry in C's treefruits[] array -------------------
// C ref: mkobj.c:1978-1980.  static const int treefruits[] = {
//     APPLE, ORANGE, PEAR, BANANA, EUCALYPTUS_LEAF
// };

test('is_treefruit: APPLE (277) is a tree fruit', () => {
    assert.equal(is_treefruit({ otyp: 277 }), true);
});

test('is_treefruit: ORANGE (278) is a tree fruit', () => {
    assert.equal(is_treefruit({ otyp: 278 }), true);
});

test('is_treefruit: PEAR (279) is a tree fruit', () => {
    assert.equal(is_treefruit({ otyp: 279 }), true);
});

test('is_treefruit: BANANA (281) is a tree fruit', () => {
    assert.equal(is_treefruit({ otyp: 281 }), true);
});

test('is_treefruit: EUCALYPTUS_LEAF (276) is a tree fruit', () => {
    assert.equal(is_treefruit({ otyp: 276 }), true);
});

// -- Negative cases: nearby food items that are not tree fruits ---------------

test('is_treefruit: MELON (280) is not a tree fruit', () => {
    // MELON sits between PEAR and BANANA in the food table but is not in
    // the treefruits[] array.
    assert.equal(is_treefruit({ otyp: 280 }), false);
});

test('is_treefruit: CREAM_PIE (287) is not a tree fruit', () => {
    // An arbitrary food item outside the tree-fruit range.
    assert.equal(is_treefruit({ otyp: 287 }), false);
});

test('is_treefruit: otyp 0 (a weapon) is not a tree fruit', () => {
    assert.equal(is_treefruit({ otyp: 0 }), false);
});
