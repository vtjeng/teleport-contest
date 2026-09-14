import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadArcLocaRecipes,
    verifyArcLocaSegment,
} from './run-arc-loca-level-load.mjs';

test('Arc-loca recipes are independent clean input-only sessions', () => {
    const recipes = loadArcLocaRecipes();
    assert.equal(recipes.length, 2);
    assert.deepEqual(recipes.map(({ segments: [segment] }) => [
        segment.seed,
        segment.datetime,
        segment.moves.at(-1),
    ]), [
        [361, '20000110090000', 'z'],
        [361, '20000110090000', 'z'],
    ]);
    assert.match(recipes[0].segments[0].nethackrc, /gender:male/u);
    assert.match(recipes[1].segments[0].nethackrc, /gender:female/u);
    for (const recipe of recipes)
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});

test('Arc-loca loader creates source-defined level state', async () => {
    for (const recipe of loadArcLocaRecipes())
        await verifyArcLocaSegment(recipe.segments[0]);
});
