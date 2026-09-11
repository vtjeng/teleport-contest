import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadAsmodeusLevelTeleRecipe,
    verifyAsmodeusSegment,
} from './run-asmodeus-level-tele.mjs';

test('the Asmodeus recipe is a fresh single-level menu case', () => {
    const recipe = loadAsmodeusLevelTeleRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(recipe.segments[0].seed, 810003);
    assert.equal(recipe.segments[0].datetime, '20440909112233');
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
    assert.equal(recipe.segments[0].moves, ' \x16?\nl');
});

test('the Asmodeus loader creates its source-defined level state', async () => {
    const [segment] = loadAsmodeusLevelTeleRecipe().segments;
    await verifyAsmodeusSegment(segment);
});
