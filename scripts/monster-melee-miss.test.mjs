import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MONSTER_MELEE_MISS_EVENTS,
    loadMonsterMeleeMissRecipe,
    verifyMonsterMeleeMissSegment,
} from './run-monster-melee-miss.mjs';

// cmd.c's vi-key bindings plus the space that dismisses the opening
// --More--, which is every key these walks press.
const KEYS = new Set([' ', 'h', 'j', 'k', 'l']);

test('the monster melee miss matrix contains only source-selected inputs',
    () => {
        const recipe = loadMonsterMeleeMissRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 2);
        for (const segment of recipe.segments) {
            assert.equal(Object.hasOwn(segment, 'steps'), false);
            assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
            // No pet: a pet beside a hostile reaches dogmove.c's own attack,
            // which is refused, so the matrix would stop for an unrelated
            // reason.
            assert.match(segment.nethackrc, /pettype:none/u);
            // verbose is left at its default, which is on. missmu()'s
            // near-miss line exists only under it.
            assert.doesNotMatch(segment.nethackrc, /verbose/u);
            assert.ok([...segment.moves].every((key) => KEYS.has(key)),
                'the walks press movement keys and the --More-- key only');
            assert.ok(MONSTER_MELEE_MISS_EVENTS.has(segment.seed));
        }
    });

test('each melee miss segment reaches the line it is here for', async () => {
    // The same verifier the matrix runs before it records, so the suite
    // catches a segment that stopped reaching mattacku() without waiting for
    // a C recording. Both messages come from mhitu.c missmu():91-93.
    for (const segment of loadMonsterMeleeMissRecipe().segments)
        await verifyMonsterMeleeMissSegment(segment);
});
