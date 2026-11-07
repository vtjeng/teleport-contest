// do_name.c x_monnam() (861-869) names a monster "it" only when
// !canspotmon(mtmp). Monster-movement environments carry a canSeeMonster
// operation, which is canseemon(); it must not stand in for canspotmon(),
// or a monster the hero senses but cannot see loses its name.
import assert from 'node:assert/strict';
import test from 'node:test';

import { DETECT_MONSTERS } from '../js/const.js';
import { Monnam } from '../js/do_name.js';
import { resetGame } from '../js/gstate.js';
import { monst_globals_init, PM_JACKAL } from '../js/monsters.js';

function sensedJackal() {
    const state = resetGame();
    state.flags = {};
    state.u = { ux: 5, uy: 5, uprops: [] };
    // Intrinsic Detect_monsters (value 1, any nonzero bit) makes sensemon(),
    // hence canspotmon(), true for every monster.
    state.u.uprops[DETECT_MONSTERS] = { intrinsic: 1, extrinsic: 0 };
    monst_globals_init(state);
    const jackal = { data: state.mons[PM_JACKAL], mx: 9, my: 5, mhp: 3 };
    return { state, jackal };
}

test('x_monnam() names a sensed monster despite canSeeMonster', () => {
    const { state, jackal } = sensedJackal();
    // canseemon() is false here: the hero sees nothing at <9,5>.
    assert.equal(
        Monnam(jackal, state, { canSeeMonster: () => false }),
        'The jackal');
});

test('x_monnam() still honours a caller-supplied canSpotMonster', () => {
    const { state, jackal } = sensedJackal();
    assert.equal(
        Monnam(jackal, state, { canSpotMonster: () => false }), 'It');
});
