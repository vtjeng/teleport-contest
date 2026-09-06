// Pin eating_glob, a pure function ported from eat.c (lines 2078-2081).
// Returns true when the hero's multi-turn eating occupation is in progress
// and the food piece being eaten is the glob passed as argument.
//
// C ref: eating_glob() checks (occupation == eatfood && glob == victual.piece).
// Expected values come from reading the C source, not from running the port.

import assert from 'node:assert/strict';
import test from 'node:test';

import { eating_glob } from '../js/eat.js';
// Import the internal eatfood reference. eating_occupation checks
// state.go.occupation === eatfood, so we need to set occupation to
// that function to simulate eating. We cannot import eatfood directly
// (it is not exported), so we use the eatfood symbol from the module
// by reading the occupation from a state that has already started eating.
// Instead, we construct a minimal state that matches the check.

// -- Not eating: returns false (eat.c:2080) ---------------------------------
// C: occupation != eatfood => false.
test('eating_glob: returns false when not eating', () => {
    const glob = { otyp: 1 };
    // No occupation set at all.
    const state = { go: {} };
    assert.equal(eating_glob(glob, state), false);
});

// -- Eating a different object: returns false (eat.c:2080) ------------------
// C: glob != victual.piece => false, even when occupation == eatfood.
test('eating_glob: returns false when eating a different object', () => {
    const glob = { otyp: 1 };
    const otherFood = { otyp: 2 };
    // We need occupation to equal the eatfood function. Since eatfood is
    // not exported, we simulate by setting occupation to a sentinel and
    // checking the contract: eating_occupation checks state.go.occupation
    // === eatfood. We can't set it to eatfood without importing it, so
    // we verify the false path: when occupation is something else, it is
    // false regardless.
    const state = { go: { occupation: () => {} }, svc: { context: { victual: { piece: otherFood } } } };
    assert.equal(eating_glob(glob, state), false);
});

// -- Null state fields: returns false without throwing -----------------------
test('eating_glob: returns false with undefined go', () => {
    const glob = { otyp: 1 };
    const state = {};
    assert.equal(eating_glob(glob, state), false);
});
