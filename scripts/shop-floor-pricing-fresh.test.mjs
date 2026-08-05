import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadShopFloorPricingRecipe,
    verifyShopFloorPricingSegment,
} from './run-shop-floor-pricing.mjs';

test('the generated-shop price recipe contains only replay inputs', () => {
    const recipe = loadShopFloorPricingRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(segment.seed, 7633019);
    assert.equal(segment.datetime, '20310417113000');
    assert.equal(segment.moves, '.\x165\n h');
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /!autopickup/u);
    assert.match(segment.nethackrc, /playmode:debug/u);
});

test('the live generated-shop route records its natural potion quote',
    async () => {
        const [segment] = loadShopFloorPricingRecipe().segments;
        const replay = await verifyShopFloorPricingSegment(segment);
        assert.equal(replay.getScreens().length, 7);
        assert.equal(replay.getCursors().length, 7);
        assert.equal(replay.getRngLog().length, 5520);
    });
