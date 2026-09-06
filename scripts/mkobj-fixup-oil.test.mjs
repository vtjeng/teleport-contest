// Pin fixup_oil(), a pure-state function from mkobj.c (lines 2025-2049) that
// adjusts a potion's age field when its otyp changes to or from POT_OIL.
// Oil potions store remaining burn time in age; other potions store the
// creation turn.  Expected values come from reading the C source branches.

import assert from 'node:assert/strict';
import test from 'node:test';

import { fixup_oil } from '../js/obj.js';
import { POT_OIL, POT_WATER } from '../js/objects.js';
import { MAX_OIL_IN_FLASK } from '../js/const.js';

// -- Branch 1: potion becomes POT_OIL, source is also POT_OIL ---------------
// C: potion->age = source->age; copies remaining burn time from source.

test('fixup_oil: oil-to-oil copies source age', () => {
    // A partly used source oil with 250 of 400 remaining burn time.
    const potion = { otyp: POT_OIL, age: 100 };
    const source = { otyp: POT_OIL, age: 250 };
    fixup_oil(potion, source);
    assert.equal(potion.age, 250); // copied from source
});

// -- Branch 2: potion becomes POT_OIL, source is not oil (or null) -----------
// C: potion->age = MAX_OIL_IN_FLASK; sets full burn time (400).

test('fixup_oil: non-oil to oil with non-oil source sets MAX_OIL_IN_FLASK', () => {
    // Non-oil source (e.g. water) being turned into oil.
    const potion = { otyp: POT_OIL, age: 42 };
    const source = { otyp: POT_WATER, age: 42 };
    fixup_oil(potion, source);
    assert.equal(potion.age, MAX_OIL_IN_FLASK); // 400
});

test('fixup_oil: non-oil to oil with null source sets MAX_OIL_IN_FLASK', () => {
    // Called from hornoplenty with source = null.
    const potion = { otyp: POT_OIL, age: 10 };
    fixup_oil(potion, null);
    assert.equal(potion.age, MAX_OIL_IN_FLASK); // 400
});

// -- Branch 3: potion is no longer oil, source was oil -----------------------
// C: if (potion->age == source->age) potion->age = svm.moves;
//    if (source->age < MAX_OIL_IN_FLASK) potion->odiluted = 1;

test('fixup_oil: oil-to-non-oil restores age to moves when ages match', () => {
    // When the ages match (potion inherited oil's burn time), the C code
    // resets age to the current turn (svm.moves).
    const potion = { otyp: POT_WATER, age: 300 };
    const source = { otyp: POT_OIL, age: 300 };
    // state.moves = 1500 represents the current game turn.
    fixup_oil(potion, source, { state: { moves: 1500 } });
    assert.equal(potion.age, 1500); // reset to current turn
});

test('fixup_oil: oil-to-non-oil marks diluted when source partly used', () => {
    // Source age 250 < MAX_OIL_IN_FLASK (400) means partly used oil.
    const potion = { otyp: POT_WATER, age: 250, odiluted: 0 };
    const source = { otyp: POT_OIL, age: 250 };
    fixup_oil(potion, source, { state: { moves: 1500 } });
    assert.equal(potion.odiluted, 1); // marked diluted
    assert.equal(potion.age, 1500);   // also reset to moves
});

test('fixup_oil: oil-to-non-oil does not mark diluted when source full', () => {
    // Source at MAX_OIL_IN_FLASK means fully filled, not partly used.
    const potion = { otyp: POT_WATER, age: 400, odiluted: 0 };
    const source = { otyp: POT_OIL, age: MAX_OIL_IN_FLASK };
    fixup_oil(potion, source, { state: { moves: 2000 } });
    assert.equal(potion.odiluted, 0); // not diluted: source was full
    assert.equal(potion.age, 2000);   // reset to current turn
});

test('fixup_oil: oil-to-non-oil keeps age when ages differ', () => {
    // Ages differ: potion was already reassigned a different age before call.
    const potion = { otyp: POT_WATER, age: 100 };
    const source = { otyp: POT_OIL, age: 300 };
    fixup_oil(potion, source, { state: { moves: 1500 } });
    assert.equal(potion.age, 100); // unchanged: ages didn't match
});

// -- No-op cases: neither is oil ---------------------------------------------

test('fixup_oil: no-op when neither potion nor source is oil', () => {
    // Neither is oil, so no branch fires.
    const potion = { otyp: POT_WATER, age: 42, odiluted: 0 };
    const source = { otyp: POT_WATER, age: 42 };
    fixup_oil(potion, source);
    assert.equal(potion.age, 42);     // unchanged
    assert.equal(potion.odiluted, 0); // unchanged
});
