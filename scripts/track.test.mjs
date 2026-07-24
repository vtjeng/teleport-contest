import assert from 'node:assert/strict';
import test from 'node:test';

import { RIN_STEALTH } from '../js/objects.js';
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

    const intrinsicOnly = stateAt();
    intrinsicOnly.u.uprops = [];
    assert.equal(settrack(intrinsicOnly), true);
    assert.equal(hastrack(10, 5, intrinsicOnly), true);
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
