import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadEatNewtBuzzRecipe,
    verifyEatNewtBuzzSegment,
} from './run-eat-newt-buzz.mjs';

test('PM_NEWT eating recipe contains replay inputs only', () => {
    const recipe = loadEatNewtBuzzRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
    assert.equal(recipe.segments[0].seed, 9130088);
    assert.equal(recipe.segments[0].datetime, '20310203040506');
    assert.match(recipe.segments[0].nethackrc, /playmode:debug/u);
    assert.equal(recipe.segments[0].moves, '\x07newt\nhhey');
});

test('finishing a newt corpse meal applies its magical energy boost', async () => {
    const [segment] = loadEatNewtBuzzRecipe().segments;
    await verifyEatNewtBuzzSegment(segment);
});
