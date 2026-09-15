import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GENESIS_KEY,
    loadMthrowuRockThrowRecipe,
    verifyMthrowuRockThrowSegment,
} from './run-mthrowu-rock-throw.mjs';

test('mthrowu rock recipe contains replay inputs only', () => {
    const recipe = loadMthrowuRockThrowRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /playmode:debug/u);
    assert.equal(segment.moves, ` ${GENESIS_KEY}hobbit\nllll${'s'.repeat(8)}`);
});

test('fresh hobbit spends a sling rock through the production throw path',
    async () => {
        const [segment] = loadMthrowuRockThrowRecipe().segments;
        await verifyMthrowuRockThrowSegment(segment);
    });
