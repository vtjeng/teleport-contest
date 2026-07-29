import assert from 'node:assert/strict';
import test from 'node:test';

import { FROMEXPER, STEALTH } from '../js/const.js';
import { RIN_PROTECTION, RIN_STEALTH } from '../js/objects.js';
import {
    gettrack,
    hastrack,
    initrack,
    settrack,
} from '../js/track.js';

function stateAt(x = 10, y = 5) {
    return { u: { ux: x, uy: y }, uleft: null, uright: null };
}

test('settrack records the hero square and wraps the source ring buffer', () => {
    const state = stateAt();
    initrack(state);
    for (let index = 0; index < 101; ++index) {
        state.u.ux = index + 1;
        state.u.uy = index % 20;
        assert.equal(settrack(state), true);
    }
    assert.equal(state.track.utcnt, 100);
    assert.equal(state.track.utpnt, 1);
    assert.deepEqual(state.track.utrack[0], { x: 101, y: 0 });
    assert.equal(hastrack(101, 0, state), true);
    assert.equal(hastrack(1, 0, state), false);
});

test('settrack is suppressed only by a worn ring of stealth', () => {
    for (const hand of ['uleft', 'uright']) {
        const state = stateAt();
        initrack(state);
        state[hand] = { otyp: RIN_STEALTH };
        assert.equal(settrack(state), false, hand);
        assert.equal(state.track.utcnt, 0, hand);
        assert.equal(state.track.utpnt, 0, hand);
    }

    // track.c settrack() tests the two ring slots for RIN_STEALTH and nothing
    // else, so Stealth from any other source still leaves footprints.
    for (const source of ['intrinsic', 'extrinsic']) {
        const stealthy = stateAt();
        initrack(stealthy);
        stealthy.u.uprops = [];
        stealthy.u.uprops[STEALTH] = { intrinsic: 0, extrinsic: 0 };
        stealthy.u.uprops[STEALTH][source] = FROMEXPER;
        assert.equal(settrack(stealthy), true, source);
        assert.equal(hastrack(10, 5, stealthy), true, source);
    }

    // A worn ring that is not RIN_STEALTH fails the otyp test in both slots.
    for (const hand of ['uleft', 'uright']) {
        const other = stateAt();
        initrack(other);
        other[hand] = { otyp: RIN_PROTECTION };
        assert.equal(settrack(other), true, hand);
        assert.equal(other.track.utcnt, 1, hand);
        assert.deepEqual(other.track.utrack[0], { x: 10, y: 5 }, hand);
    }
});

test('gettrack searches newest first and stops on the monster square', () => {
    const state = stateAt();
    initrack(state);
    for (const [x, y] of [
        [8, 5], // Older adjacent track.
        [9, 4], // Newest adjacent track.
    ]) {
        state.u.ux = x;
        state.u.uy = y;
        settrack(state);
    }
    assert.deepEqual(gettrack(9, 5, state), { x: 9, y: 4 });

    // track.c returns null as soon as the newest track is the monster's own
    // square; it does not keep searching for an older adjacent coordinate.
    state.u.ux = 9;
    state.u.uy = 5;
    settrack(state);
    assert.equal(gettrack(9, 5, state), null);
});

test('gettrack preserves reverse chronology after ring-buffer wrap', () => {
    const state = stateAt();
    initrack(state);
    for (let index = 0; index < 101; ++index) {
        state.u.ux = index + 1;
        state.u.uy = 0;
        settrack(state);
    }
    // After inserting coordinate 101, utpnt wraps to 1 and the prior
    // coordinate at slot 99 is the newest adjacent track to x=101.
    assert.deepEqual(gettrack(101, 1, state), { x: 101, y: 0 });
});
