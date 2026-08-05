import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadMultibyteObjectPileRecipes,
    verifyMultibyteObjectPileSegment,
} from './run-multibyte-object-pile.mjs';

test('the multibyte pile matrix varies only overlay restoration', () => {
    const recipes = loadMultibyteObjectPileRecipes();
    assert.equal(recipes.length, 2);
    for (const recipe of recipes) {
        // Version 5 contains replay inputs without recorded C answers.
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 1);
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
        assert.equal(recipe.segments[0].nethackrc.includes('fruit:caf\u00e9'), true);
        assert.equal(recipe.segments[0].nethackrc.includes('eight_bit_tty'), true);
    }
    assert.deepEqual(
        recipes.map(({ segments: [segment] }) => (
            segment.nethackrc.includes('!menu_overlay')
        )),
        [false, true],
    );
});

test('both live multibyte routes preserve and observe their floor pile',
    async () => {
        for (const { segments: [segment] } of loadMultibyteObjectPileRecipes())
            await verifyMultibyteObjectPileSegment(segment);
    });
