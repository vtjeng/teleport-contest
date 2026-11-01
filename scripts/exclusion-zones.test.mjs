import assert from 'node:assert/strict';
import test from 'node:test';

import { LR_MONGEN, LR_TELE } from '../js/const.js';
import {
    free_exclusions,
    load_exclusions,
    save_exclusions,
} from '../js/dungeon.js';

// Two zones shaped like dat/soko1-2.lua's monster-generation row and
// dat/themerms.lua's water-vault teleport square. Their coordinates are
// arbitrary but distinct, so each field's survival is visible.
function twoZoneState() {
    const vault = { zonetype: LR_TELE, lx: 40, ly: 9, hx: 41, hy: 10 };
    const row = {
        zonetype: LR_MONGEN, lx: 32, ly: 4, hx: 50, hy: 4, next: vault,
    };
    return { exclusion_zones: row };
}

test('save_exclusions writes the list head to tail without freeing it', () => {
    const state = twoZoneState();
    const head = state.exclusion_zones;

    // dungeon.c save_exclusions() walks sve.exclusion_zones from the head
    // and writes only the five per-zone fields.
    assert.deepEqual(save_exclusions(state), [
        { zonetype: LR_MONGEN, lx: 32, ly: 4, hx: 50, hy: 4 },
        { zonetype: LR_TELE, lx: 40, ly: 9, hx: 41, hy: 10 },
    ]);
    assert.equal(state.exclusion_zones, head);
    // An empty list writes a zero count.
    assert.deepEqual(save_exclusions({ exclusion_zones: null }), []);
});

test('load_exclusions pushes each saved zone onto the head of the list', () => {
    const saved = save_exclusions(twoZoneState());
    const state = { exclusion_zones: null };

    load_exclusions(saved, state);
    // dungeon.c load_exclusions() prepends in file order, so the second
    // zone written becomes the new head.
    assert.deepEqual(save_exclusions(state), [saved[1], saved[0]]);

    // savelev() empties the list through clear_level_structures(); a later
    // getlev() of a level with no zones leaves it empty.
    free_exclusions(state);
    assert.equal(state.exclusion_zones, null);
    load_exclusions(undefined, state);
    assert.equal(state.exclusion_zones, null);
});
