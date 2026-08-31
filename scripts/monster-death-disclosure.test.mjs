import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadMonsterDeathDisclosureRecipe,
    verifyMonsterDeathDisclosureSegment,
} from './run-monster-death-disclosure.mjs';

test('monster death disclosure recipe contains replay inputs only', () => {
    const recipe = loadMonsterDeathDisclosureRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
    assert.equal(recipe.segments[0].seed, 6);
    assert.match(recipe.segments[0].nethackrc, /symset:DECgraphics/u);
    assert.ok(recipe.segments[0].moves.includes('kqyj'));
});

test('normal monster death replays the disclosure family', async () => {
    const [segment] = loadMonsterDeathDisclosureRecipe().segments;
    await verifyMonsterDeathDisclosureSegment(segment);
});
