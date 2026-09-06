// Pin is_flammable and is_rottable, pure functions from mkobj.c (lines
// 2269-2298) that check whether an object can burn or rot.  Expected values
// come from reading the C branches and the material constants in objclass.h.
//
// is_flammable returns true for organic materials (material <= WOOD, excluding
// LIQUID) and PLASTIC, but excludes candles and objects that confer FIRE_RES
// or are WAN_FIRE.
//
// is_rottable returns true for organic materials (material <= WOOD, excluding
// LIQUID) and DRAGON_HIDE.

import assert from 'node:assert/strict';
import test from 'node:test';

import { is_flammable, is_rottable } from '../js/obj.js';
import { objects_globals_init } from '../js/objects.js';
import {
    TALLOW_CANDLE,   // 224, WAX material, candle
    WAX_CANDLE,      // 225, WAX material, candle
    WAN_FIRE,        // 430, IRON material
    ARROW,           // 18, IRON material
    ELVEN_ARROW,     // 19, WOOD material
    HAWAIIAN_SHIRT,  // 136, CLOTH material
    CREDIT_CARD,     // 223, PLASTIC material
    SCR_ENCHANT_ARMOR, // 323, PAPER material
    RED_DRAGON_SCALE_MAIL, // 104, DRAGON_HIDE, oc_oprop = FIRE_RES
    GRAY_DRAGON_SCALE_MAIL, // 101, DRAGON_HIDE, oc_oprop != FIRE_RES
    BLINDING_VENOM,  // 479, LIQUID material
} from '../js/objects.js';

// Build a real objects array so objectType() resolves materials correctly.
const state = {};
objects_globals_init(state);

// -- is_flammable ------------------------------------------------------------
// C ref: mkobj.c:2269-2285.

test('is_flammable: tallow candle returns false (candle exclusion)', () => {
    // C: if (Is_candle(otmp)) return FALSE;
    // TALLOW_CANDLE is WAX (material 2, <= WOOD) but candles are excluded
    // because they burn as fuel, not as damage.
    const obj = { otyp: TALLOW_CANDLE };
    assert.equal(is_flammable(obj, state), false);
});

test('is_flammable: wax candle returns false (candle exclusion)', () => {
    // WAX_CANDLE is also excluded by Is_candle.
    const obj = { otyp: WAX_CANDLE };
    assert.equal(is_flammable(obj, state), false);
});

test('is_flammable: red dragon scale mail returns false (FIRE_RES oprop)', () => {
    // C: if (objects[otyp].oc_oprop == FIRE_RES ...) return FALSE;
    // RED_DRAGON_SCALE_MAIL has oc_oprop = FIRE_RES (1) and material
    // DRAGON_HIDE (10, > WOOD), so FIRE_RES is the binding exclusion.
    const obj = { otyp: RED_DRAGON_SCALE_MAIL };
    assert.equal(is_flammable(obj, state), false);
});

test('is_flammable: wand of fire returns false (WAN_FIRE exclusion)', () => {
    // C: if (... || otyp == WAN_FIRE) return FALSE;
    // WAN_FIRE is IRON (material 11, > WOOD), so it would already be false
    // from the material check, but the C code excludes it explicitly.
    const obj = { otyp: WAN_FIRE };
    assert.equal(is_flammable(obj, state), false);
});

test('is_flammable: hawaiian shirt returns true (CLOTH <= WOOD)', () => {
    // CLOTH (6) <= WOOD (8) and != LIQUID (1).
    const obj = { otyp: HAWAIIAN_SHIRT };
    assert.equal(is_flammable(obj, state), true);
});

test('is_flammable: scroll returns true (PAPER <= WOOD)', () => {
    // PAPER (5) <= WOOD (8) and != LIQUID (1).
    const obj = { otyp: SCR_ENCHANT_ARMOR };
    assert.equal(is_flammable(obj, state), true);
});

test('is_flammable: elven arrow returns true (WOOD material)', () => {
    // WOOD (8) <= WOOD (8) and != LIQUID (1).
    const obj = { otyp: ELVEN_ARROW };
    assert.equal(is_flammable(obj, state), true);
});

test('is_flammable: credit card returns true (PLASTIC)', () => {
    // C: return (omat <= WOOD && omat != LIQUID) || omat == PLASTIC;
    // PLASTIC (18) > WOOD but matches the PLASTIC disjunct.
    const obj = { otyp: CREDIT_CARD };
    assert.equal(is_flammable(obj, state), true);
});

test('is_flammable: blinding venom returns false (LIQUID excluded)', () => {
    // LIQUID (1) <= WOOD (8) but is explicitly excluded.
    const obj = { otyp: BLINDING_VENOM };
    assert.equal(is_flammable(obj, state), false);
});

test('is_flammable: iron arrow returns false (IRON > WOOD)', () => {
    // IRON (11) > WOOD (8) and != PLASTIC (18).
    const obj = { otyp: ARROW };
    assert.equal(is_flammable(obj, state), false);
});

// -- is_rottable -------------------------------------------------------------
// C ref: mkobj.c:2287-2298.

test('is_rottable: hawaiian shirt returns true (CLOTH <= WOOD)', () => {
    // CLOTH (6) <= WOOD (8) and != LIQUID (1).
    const obj = { otyp: HAWAIIAN_SHIRT };
    assert.equal(is_rottable(obj, state), true);
});

test('is_rottable: scroll returns true (PAPER <= WOOD)', () => {
    // PAPER (5) <= WOOD (8) and != LIQUID (1).
    const obj = { otyp: SCR_ENCHANT_ARMOR };
    assert.equal(is_rottable(obj, state), true);
});

test('is_rottable: gray dragon scale mail returns true (DRAGON_HIDE)', () => {
    // C: ... || objects[otyp].oc_material == DRAGON_HIDE;
    // DRAGON_HIDE (10) > WOOD (8) but matches the DRAGON_HIDE disjunct.
    const obj = { otyp: GRAY_DRAGON_SCALE_MAIL };
    assert.equal(is_rottable(obj, state), true);
});

test('is_rottable: blinding venom returns false (LIQUID excluded)', () => {
    // LIQUID (1) <= WOOD (8) but is explicitly excluded.
    const obj = { otyp: BLINDING_VENOM };
    assert.equal(is_rottable(obj, state), false);
});

test('is_rottable: iron arrow returns false (IRON > WOOD)', () => {
    // IRON (11) > WOOD (8) and != DRAGON_HIDE (10).
    const obj = { otyp: ARROW };
    assert.equal(is_rottable(obj, state), false);
});

test('is_rottable: credit card returns false (PLASTIC, not DRAGON_HIDE)', () => {
    // PLASTIC (18) > WOOD (8) and != DRAGON_HIDE (10).
    // Contrast with is_flammable, which returns true for PLASTIC.
    const obj = { otyp: CREDIT_CARD };
    assert.equal(is_rottable(obj, state), false);
});
