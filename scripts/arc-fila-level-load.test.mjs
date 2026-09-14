import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadArcFilaRecipes,
    verifyArcFilaSegment,
} from './run-arc-fila-level-load.mjs';

test('Arc-fila recipes are independent clean input-only sessions', () => {
    const recipes = loadArcFilaRecipes();
    assert.equal(recipes.length, 2);
    assert.deepEqual(recipes.map(({ segments: [segment] }) => [
        segment.seed,
        segment.datetime,
        segment.moves.length,
        segment.moves.includes('z  \u00162\n'),
    ]), [
        [318271, '20471208111530', 49, true],
        [972451, '20361022170545', 49, true],
    ]);
    assert.match(recipes[0].segments[0].nethackrc, /gender:male/u);
    assert.match(recipes[1].segments[0].nethackrc, /gender:female/u);
    assert.notEqual(recipes[0].segments[0].seed, recipes[1].segments[0].seed);
    assert.notEqual(
        recipes[0].segments[0].datetime,
        recipes[1].segments[0].datetime,
    );
    for (const recipe of recipes)
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});

test('Arc-fila loader creates source-defined level state', async () => {
    for (const recipe of loadArcFilaRecipes())
        await verifyArcFilaSegment(recipe.segments[0]);
});
