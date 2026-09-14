import assert from 'node:assert/strict';
import test from 'node:test';

import { loadArcFilbRecipes } from './run-arc-filb-level-load.mjs';

test('Arc-filb recipes are independent clean level-teleport sessions', () => {
    const recipes = loadArcFilbRecipes();
    assert.equal(recipes.length, 2);
    assert.deepEqual(recipes.map(({ segments: [segment] }) => [
        segment.seed,
        segment.datetime,
        segment.moves.length,
        segment.moves.includes('z  \u00164\n'),
    ]), [
        [514273, '20461106102030', 49, true],
        [915827, '20390318164520', 49, true],
    ]);
    assert.match(recipes[0].segments[0].nethackrc, /gender:male/u);
    assert.match(recipes[1].segments[0].nethackrc, /gender:female/u);
    for (const recipe of recipes)
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});
