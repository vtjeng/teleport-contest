import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadSanctumLevelTeleRecipe,
    verifySanctumSegment,
} from './run-sanctum-level-tele.mjs';

test('the Sanctum recipe is a fresh single-level menu case', () => {
    const recipe = loadSanctumLevelTeleRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].seed, 8461);
    assert.equal(recipe.segments[0].datetime, '20420402074500');
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
    assert.equal(recipe.segments[0].moves.match(/\x16/gu).length, 1);
    assert.match(recipe.segments[0].moves, /\x16\?\n>v$/u);
});

test('the Sanctum loader creates the source-defined level state', async () => {
    const [segment] = loadSanctumLevelTeleRecipe().segments;
    await verifySanctumSegment(segment);
});
