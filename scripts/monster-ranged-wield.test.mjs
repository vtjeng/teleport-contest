import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GENESIS_KEY,
    loadMonsterRangedWieldRecipe,
    verifyMonsterRangedWieldSegment,
} from './run-monster-ranged-wield.mjs';

test('monster-ranged-wield matrix contains replay inputs only', () => {
    const recipe = loadMonsterRangedWieldRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /OPTIONS=playmode:debug/u);
    assert.match(segment.nethackrc, /rest_on_space,!safe_wait/u);
    assert.equal(segment.moves, ` ${GENESIS_KEY}Uruk-hai\nkkk`);
});

test('the matrix reaches the ranged launcher wield on its last key',
    async () => {
        const [segment] = loadMonsterRangedWieldRecipe().segments;
        await verifyMonsterRangedWieldSegment(segment);
    });
