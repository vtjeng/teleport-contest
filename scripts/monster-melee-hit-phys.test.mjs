import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MONSTER_MELEE_HIT_PHYS_EVENTS,
    loadMonsterMeleeHitPhysRecipe,
    verifyMonsterMeleeHitPhysSegment,
} from './run-monster-melee-hit-phys.mjs';

// cmd.c's vi-key bindings plus the space that dismisses one segment's opening
// --More--, which is every key these walks press.
const KEYS = new Set([' ', 'h', 'j', 'k', 'l']);

test('the monster melee physical hit matrix contains only source-selected'
    + ' inputs', () => {
    const recipe = loadMonsterMeleeHitPhysRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 2);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        assert.match(segment.nethackrc, /pettype:none/u);
        assert.ok([...segment.moves].every((key) => KEYS.has(key)),
            'the walks press movement keys and the --More-- key only');
        assert.ok(MONSTER_MELEE_HIT_PHYS_EVENTS.has(segment.seed));
    }
    // The two segments exist to reach mattacku()'s two melee arms, and the
    // arm is chosen by the attacker's aatyp, not by the recipe. Different
    // roles and different datetimes are what keep them independent draws on
    // the same code rather than one walk written twice.
    const roles = recipe.segments.map(
        (segment) => segment.nethackrc.match(/role:(\w+)/u)[1],
    );
    assert.deepEqual(roles, ['Healer', 'Valkyrie']);
    const datetimes = recipe.segments.map((segment) => segment.datetime);
    assert.equal(new Set(datetimes).size, 2);
});

test('the matrix covers both of hitmsg()\'s reachable verbs', () => {
    // mhitu.c hitmsg():195-197 for AT_BITE and :221-222 for the default arm
    // every other reachable aatyp takes. A matrix that lost one of the two
    // would still pass its differential, because the port and C would agree
    // on the walk it kept.
    const said = [...MONSTER_MELEE_HIT_PHYS_EVENTS.values()]
        .flat().map((event) => event.says);
    assert.ok(said.some((line) => / bites!$/u.test(line)));
    assert.ok(said.some((line) => / hits!$/u.test(line)));
    // Every landed blow has to cost hit points. hitmu():1214-1258 is what
    // turns the roll into damage, and a port that printed the line and
    // stopped short of mdamageu() would satisfy the verbs alone.
    const landed = [...MONSTER_MELEE_HIT_PHYS_EVENTS.values()]
        .flat().filter((event) => /(bites|hits)!$/u.test(event.says));
    assert.equal(landed.length, 4);
    assert.ok(landed.every((event) => event.uhp < 16));
});

test('each physical hit segment reaches the lines it is here for', async () => {
    // The same verifier the matrix runs before it records, so the suite
    // catches a segment that stopped reaching hitmu() without waiting for a C
    // recording. The messages come from mhitu.c hitmsg():77 by way of uhitm.c
    // mhitm_ad_phys():4124, and the hit points from mdamageu().
    for (const segment of loadMonsterMeleeHitPhysRecipe().segments)
        await verifyMonsterMeleeHitPhysSegment(segment);
});
