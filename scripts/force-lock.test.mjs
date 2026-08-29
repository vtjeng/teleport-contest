import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { u_have_forceable_weapon } from '../js/lock.js';

import {
    DAGGER,
    FLAIL,
    LONG_SWORD,
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

// ---------- forcelock blade path ----------

// C ref: lock.c:228-240. A blade weapon (picktyp=true) forces a locked chest.
// Each occupation turn, rn2(1000-spe) is rolled against (992-greatest_erosion*10);
// if the roll exceeds the threshold AND the weapon is not cursed AND obj_resists
// returns false, the blade breaks. Otherwise the rn2(100) chance roll proceeds.
// For destroyit, !picktyp is false for blades, so rn2(3) is never called and
// breakchestlock always receives false.
//
// Seed 44, long sword, plain "chest" wish: the chest is locked (rn2(5)=2 > 0),
// the blade survives both occupation turns (rn2(1000)=338 and 242 are both
// <= 992), and the chance roll succeeds on turn 2 (rn2(100)=20 < 24 = wldam*2).
// Validated against C recording: diff-fresh passes with moves ending at 'y'.
//
// The test appends a trailing space to dismiss the --More-- prompt that
// appears after "You succeed in forcing the lock.".  Without it, the game
// blocks before breakchestlock() and exercise() run.  The space lets the
// success path complete so the test can inspect the final game state.
test('blade weapon forces a locked chest open without breaking', async () => {
    const recipe = JSON.parse(readFileSync(
        'recipes/force-blade-chest.session.json', 'utf-8',
    ));
    const seg = recipe.segments[0];
    const result = await runSegment({
        seed: seg.seed,
        datetime: seg.datetime,
        nethackrc: seg.nethackrc,
        // Append a space to dismiss the --More-- after the success message,
        // allowing breakchestlock() and reset_pick() to complete.
        moves: seg.moves + ' ',
    });
    const log = result.getRngLog();

    // The occupation calls rn2(1000) for the blade-break check on each turn.
    // Verify that the two blade-break checks appear consecutively in the PRNG
    // log near the end, each followed by the rn2(100) chance roll. Turn 1:
    // rn2(1000)=338 (blade survives, 338 <= 992), rn2(100)=51 (still busy,
    // 51 >= 24). Turn 2: rn2(1000)=242 (blade survives), rn2(100)=20 (success,
    // 20 < 24 = oc_wldam*2 for a long sword with wldam=12).
    const tail = log.slice(-30);
    assert.ok(tail.includes('rn2(1000)=338'),
        'turn 1 blade check: roll 338, blade survives (338 <= 992)');
    assert.ok(tail.includes('rn2(1000)=242'),
        'turn 2 blade check: roll 242, blade survives (242 <= 992)');

    // exercise(A_DEX, TRUE) runs after the success message is dismissed;
    // the rn2(19) call from A_DEX attribute gain appears in the log tail.
    // Array.includes checks exact equality, so match the full log entry.
    assert.ok(tail.some(e => e.startsWith('rn2(19)=')),
        'exercise(A_DEX) ran after success (rn2(19) from attribute gain)');

    // The hero still wields the long sword after forcing.
    assert.equal(game.uwep?.otyp, LONG_SWORD,
        'long sword survives and stays wielded');

    // The chest on the floor is now broken-lock (olocked=0, obroken=1).
    const floorObjs = game.level?.objects?.[game.u.ux]?.[game.u.uy];
    let chest = null;
    for (let obj = floorObjs; obj; obj = obj.nexthere) {
        if (obj.otyp === 215 /* CHEST */) { chest = obj; break; }
    }
    assert.ok(chest, 'chest is on the floor');
    assert.equal(chest.olocked, 0, 'chest is no longer locked');
    assert.equal(chest.obroken, 1, 'chest lock is broken');
});
