// Pin stone_object_type and stone_furniture_type, pure functions from mkobj.c
// that determine whether a mimic's appearance represents a stone object or
// stone furniture for the stone-to-flesh spell.
//
// Expected values come from reading mkobj.c lines 1264-1317 and the
// defsym.h / objects.h constant definitions, not from running the port.

import assert from 'node:assert/strict';
import test from 'node:test';

import { stone_object_type, stone_furniture_type } from '../js/obj.js';

// -- stone_object_type -------------------------------------------------------
// C ref: mkobj.c:1264.  Returns true for BOULDER (475), STATUE (476),
// FIGURINE (241); false for everything else including wands, rings, gems.

test('stone_object_type: BOULDER (475) is stone', () => {
    assert.equal(stone_object_type(475), true); // BOULDER from objects.h
});

test('stone_object_type: STATUE (476) is stone', () => {
    assert.equal(stone_object_type(476), true); // STATUE from objects.h
});

test('stone_object_type: FIGURINE (241) is stone', () => {
    assert.equal(stone_object_type(241), true); // FIGURINE from objects.h
});

test('stone_object_type: arbitrary weapon (0) is not stone', () => {
    // otyp 0 is a random weapon, not a stone object
    assert.equal(stone_object_type(0), false);
});

test('stone_object_type: an otyp between FIGURINE and BOULDER is not stone', () => {
    // otyp 300 falls between FIGURINE (241) and BOULDER (475)
    assert.equal(stone_object_type(300), false);
});

// -- stone_furniture_type ----------------------------------------------------
// C ref: mkobj.c:1276.  Returns true for specific display-symbol indices from
// defsym.h: S_upstair (25), S_dnstair (26), S_brupstair (29),
// S_brdnstair (30), S_altar (33), S_throne (35), S_sink (36), and the wall
// range S_vwall (1) through S_trwall (11).

test('stone_furniture_type: wall symbols (S_vwall=1 through S_trwall=11)', () => {
    // Every wall symbol in [S_vwall, S_trwall] is stone furniture
    for (let sym = 1; sym <= 11; sym++) {
        assert.equal(stone_furniture_type(sym), true,
            `symbol index ${sym} should be stone furniture (wall range)`);
    }
});

test('stone_furniture_type: S_upstair (25) is stone', () => {
    assert.equal(stone_furniture_type(25), true);
});

test('stone_furniture_type: S_dnstair (26) is stone', () => {
    assert.equal(stone_furniture_type(26), true);
});

test('stone_furniture_type: S_brupstair (29) is stone', () => {
    assert.equal(stone_furniture_type(29), true);
});

test('stone_furniture_type: S_brdnstair (30) is stone', () => {
    assert.equal(stone_furniture_type(30), true);
});

test('stone_furniture_type: S_altar (33) is stone', () => {
    assert.equal(stone_furniture_type(33), true);
});

test('stone_furniture_type: S_throne (35) is stone', () => {
    assert.equal(stone_furniture_type(35), true);
});

test('stone_furniture_type: S_sink (36) is stone', () => {
    assert.equal(stone_furniture_type(36), true);
});

test('stone_furniture_type: symbol 0 (S_stone) is not stone furniture', () => {
    // Index 0 is below S_vwall; floor/dark, not a wall
    assert.equal(stone_furniture_type(0), false);
});

test('stone_furniture_type: symbol 12 (just past S_trwall) is not stone', () => {
    // Index 12 is right after the wall range
    assert.equal(stone_furniture_type(12), false);
});

test('stone_furniture_type: symbol 27 (between stairs and branch stairs) is not stone', () => {
    // Falls between S_dnstair (26) and S_brupstair (29)
    assert.equal(stone_furniture_type(27), false);
});

test('stone_furniture_type: symbol 34 (between altar and throne) is not stone', () => {
    // S_altar is 33, S_throne is 35; 34 is S_grave
    assert.equal(stone_furniture_type(34), false);
});

test('stone_furniture_type: symbol 100 (out of range) is not stone', () => {
    assert.equal(stone_furniture_type(100), false);
});
