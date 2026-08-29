import assert from 'node:assert/strict';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { u_have_forceable_weapon } from '../js/lock.js';

import {
    DAGGER,
    FLAIL,
    WAR_HAMMER,
    BULLWHIP,
    WEAPON_CLASS,
} from '../js/objects.js';

// Wizard starting position with pettype:none, used for every test that needs
// initialized game state.  Seed 44 produces a playable level with no
// obstacles between the hero and the dungeon floor.
const FORCE_RC = [
    'OPTIONS=name:wizard,role:Wizard,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=playmode:debug,pettype:none,!acoustics',
    '',
].join('\n');
const FORCE_SEED = 44;
const FORCE_DATETIME = '20000110090000';

async function initGameState() {
    await runSegment({
        seed: FORCE_SEED,
        datetime: FORCE_DATETIME,
        nethackrc: FORCE_RC,
        moves: '',
    });
}

// ---------- u_have_forceable_weapon ----------

// C ref: lock.c:662. No weapon wielded: returns false.
test('u_have_forceable_weapon returns false when nothing is wielded', async () => {
    await initGameState();
    game.uwep = null;
    assert.equal(u_have_forceable_weapon(game), false);
});

// C ref: lock.c:663-668. A war hammer (P_HAMMER=14) is in [P_DAGGER..P_LANCE]
// and is not P_FLAIL, so it is accepted.  Exercises the oc_skill range test
// for a weapon class item in the middle of the accepted range.
test('u_have_forceable_weapon accepts a war hammer', async () => {
    await initGameState();
    game.uwep = { otyp: WAR_HAMMER, oclass: WEAPON_CLASS };
    assert.equal(u_have_forceable_weapon(game), true);
});

// C ref: lock.c:665. A flail (P_FLAIL=13) is explicitly excluded even though
// it falls within the [P_DAGGER..P_LANCE] range.
test('u_have_forceable_weapon rejects a flail', async () => {
    await initGameState();
    game.uwep = { otyp: FLAIL, oclass: WEAPON_CLASS };
    assert.equal(u_have_forceable_weapon(game), false);
});

// C ref: lock.c:664. A dagger (P_DAGGER=1) is at the low end of the accepted
// range.  It is also a blade, which affects picktyp in doforce(), but
// u_have_forceable_weapon itself does not test blade status.
test('u_have_forceable_weapon accepts a dagger', async () => {
    await initGameState();
    game.uwep = { otyp: DAGGER, oclass: WEAPON_CLASS };
    assert.equal(u_have_forceable_weapon(game), true);
});

// C ref: lock.c:666. A bullwhip (P_WHIP=26) is above P_LANCE=19, so it is
// rejected.  This exercises the upper bound of the range test.
test('u_have_forceable_weapon rejects a bullwhip', async () => {
    await initGameState();
    game.uwep = { otyp: BULLWHIP, oclass: WEAPON_CLASS };
    assert.equal(u_have_forceable_weapon(game), false);
});
