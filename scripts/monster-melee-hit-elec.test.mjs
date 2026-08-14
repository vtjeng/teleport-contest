import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MONSTER_MELEE_HIT_ELEC_EVENTS,
    loadMonsterMeleeHitElecRecipe,
    verifyMonsterMeleeHitElecSegment,
} from './run-monster-melee-hit-elec.mjs';

// cmd.c's vi-key bindings plus the space that dismisses the opening
// --More--, which is every key these walks press.
const KEYS = new Set([' ', 'j', 'k']);

test('the monster melee shock hit matrix contains only source-selected inputs',
    () => {
        const recipe = loadMonsterMeleeHitElecRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 2);
        for (const segment of recipe.segments) {
            assert.equal(Object.hasOwn(segment, 'steps'), false);
            assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
            assert.match(segment.nethackrc, /pettype:none/u);
            assert.ok([...segment.moves].every((key) => KEYS.has(key)),
                'the walks press movement keys and the --More-- key only');
            assert.ok(MONSTER_MELEE_HIT_ELEC_EVENTS.has(segment.seed));
        }
        // The two segments exist to separate the two magic-cancellation
        // answers, so they must not share a role: a Barbarian's ring mail is
        // objects.c a_can 1 and a Valkyrie wears nothing above 0.
        const roles = recipe.segments.map(
            (segment) => segment.nethackrc.match(/role:(\w+)/u)[1],
        );
        assert.deepEqual(roles, ['Barbarian', 'Valkyrie']);
    });

test('only the cancelling hero ever avoids harm', () => {
    // uhitm.c mhitm_mgc_atk_negated():83, `!(rn2(10) >= 3 * armpro)`. With
    // armpro 0 no roll can fail the comparison, so the Valkyrie's whole walk
    // has to carry the zap line and nothing else. This is the assertion a
    // magic_negation() that answered a constant would break, and the recorded
    // C screens are what it is checked against by the matrix run.
    const [barbarian, valkyrie] = loadMonsterMeleeHitElecRecipe().segments;
    const said = (segment) => MONSTER_MELEE_HIT_ELEC_EVENTS
        .get(segment.seed).map((event) => event.says);
    assert.ok(said(barbarian).some((line) => line.includes('You avoid harm.')));
    assert.ok(said(barbarian).some((line) => line.includes('You get zapped!')));
    assert.ok(said(valkyrie).every((line) => !line.includes('avoid harm')));
});

test('each shock hit segment reaches the line it is here for', async () => {
    // The same verifier the matrix runs before it records, so the suite
    // catches a segment that stopped reaching hitmu() without waiting for a C
    // recording. The messages come from mhitu.c hitmsg():77 and uhitm.c
    // mhitm_ad_elec():2710 and :2712, and the hit points from mdamageu().
    for (const segment of loadMonsterMeleeHitElecRecipe().segments)
        await verifyMonsterMeleeHitElecSegment(segment);
});
