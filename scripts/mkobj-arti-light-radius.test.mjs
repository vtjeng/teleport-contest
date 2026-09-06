// Pin arti_light_radius, a pure function ported from light.c (lines 881-911).
// Returns the light radius for a light-emitting artifact based on its BUC
// state. Returns 0 for non-artifact or unlit objects.
//
// Expected values come from reading the C source, not from running the port.
// artifact_light() (artifact.c 1090-1105) recognizes Sunsword (oartifact ==
// ART_SUNSWORD) and worn gold dragon armor (scales or scale mail with W_ARM).

import assert from 'node:assert/strict';
import test from 'node:test';

import { arti_light_radius } from '../js/light.js';

// Constants from the C source used to build test objects.
const ART_SUNSWORD = 20;        // artifact.h
const GOLD_DRAGON_SCALE_MAIL = 102; // objects.c
const GOLD_DRAGON_SCALES = 112;     // objects.c
const W_ARM = 0x00000001;           // rm.h / const.js
const SHORT_SWORD = 35;             // a non-artifact weapon otyp

// -- Returns 0 when the object is not lamplit (light.c:895) -----------------
test('arti_light_radius: unlit Sunsword returns 0', () => {
    // C: if (!obj->lamplit || !artifact_light(obj)) return 0;
    const obj = { lamplit: false, oartifact: ART_SUNSWORD, blessed: false, cursed: false, otyp: SHORT_SWORD, owornmask: 0 };
    assert.equal(arti_light_radius(obj, {}), 0);
});

// -- Returns 0 for a non-artifact object (light.c:895) ----------------------
test('arti_light_radius: lit non-artifact returns 0', () => {
    // C: artifact_light() checks oartifact == ART_SUNSWORD or worn gold dragon
    // armor. A plain short sword fails both, so returns 0.
    const obj = { lamplit: true, oartifact: 0, blessed: false, cursed: false, otyp: SHORT_SWORD, owornmask: 0 };
    assert.equal(arti_light_radius(obj, {}), 0);
});

// -- Blessed Sunsword: radius 3 (light.c:901) -------------------------------
test('arti_light_radius: blessed Sunsword returns 3', () => {
    // C: res = (obj->blessed ? 3 : !obj->cursed ? 2 : 1);
    const obj = { lamplit: true, oartifact: ART_SUNSWORD, blessed: true, cursed: false, otyp: SHORT_SWORD, owornmask: 0 };
    assert.equal(arti_light_radius(obj, {}), 3);
});

// -- Uncursed Sunsword: radius 2 (light.c:901) ------------------------------
test('arti_light_radius: uncursed Sunsword returns 2', () => {
    // C: !obj->cursed => 2
    const obj = { lamplit: true, oartifact: ART_SUNSWORD, blessed: false, cursed: false, otyp: SHORT_SWORD, owornmask: 0 };
    assert.equal(arti_light_radius(obj, {}), 2);
});

// -- Cursed Sunsword: radius 1 (light.c:901) --------------------------------
test('arti_light_radius: cursed Sunsword returns 1', () => {
    // C: else => 1
    const obj = { lamplit: true, oartifact: ART_SUNSWORD, blessed: false, cursed: true, otyp: SHORT_SWORD, owornmask: 0 };
    assert.equal(arti_light_radius(obj, {}), 1);
});

// -- Gold DSM (not uskin): adds 1 to base (light.c:908) ---------------------
test('arti_light_radius: uncursed gold DSM adds 1, total 3', () => {
    // C: if (obj->otyp == GOLD_DRAGON_SCALE_MAIL) ++res;
    // Base for uncursed = 2, +1 = 3.
    const obj = { lamplit: true, oartifact: 0, blessed: false, cursed: false, otyp: GOLD_DRAGON_SCALE_MAIL, owornmask: W_ARM };
    assert.equal(arti_light_radius(obj, {}), 3);
});

// -- Gold DSM blessed: base 3 + 1 = 4 (light.c:901,908) --------------------
test('arti_light_radius: blessed gold DSM returns 4', () => {
    const obj = { lamplit: true, oartifact: 0, blessed: true, cursed: false, otyp: GOLD_DRAGON_SCALE_MAIL, owornmask: W_ARM };
    assert.equal(arti_light_radius(obj, {}), 4);
});

// -- Gold DSM cursed: base 1 + 1 = 2 (light.c:901,908) ---------------------
test('arti_light_radius: cursed gold DSM returns 2', () => {
    const obj = { lamplit: true, oartifact: 0, blessed: false, cursed: true, otyp: GOLD_DRAGON_SCALE_MAIL, owornmask: W_ARM };
    assert.equal(arti_light_radius(obj, {}), 2);
});

// -- Uskin (embedded gold scales): clamped to 1 (light.c:905) ---------------
test('arti_light_radius: uskin returns 1 regardless of BUC', () => {
    // C: if (obj == uskin) res = 1;
    // uskin overrides the BUC-based value with 1.
    const obj = { lamplit: true, oartifact: 0, blessed: true, cursed: false, otyp: GOLD_DRAGON_SCALES, owornmask: W_ARM };
    const state = { uskin: obj };
    assert.equal(arti_light_radius(obj, state), 1);
});

// -- Gold dragon scales (not uskin): treated like DSM (light.c:908) ---------
// Gold dragon scales are also artifact_light() when worn, but unlike DSM
// the ++res path only fires for GOLD_DRAGON_SCALE_MAIL, not scales.
test('arti_light_radius: worn gold scales (not uskin) gets base BUC only', () => {
    // C: the else-if checks otyp == GOLD_DRAGON_SCALE_MAIL specifically.
    // Gold scales pass artifact_light() (worn with W_ARM), so the function
    // does not return 0, but the ++res does not fire either.
    const obj = { lamplit: true, oartifact: 0, blessed: false, cursed: false, otyp: GOLD_DRAGON_SCALES, owornmask: W_ARM };
    assert.equal(arti_light_radius(obj, {}), 2);
});
