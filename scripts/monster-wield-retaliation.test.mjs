import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GENESIS_KEY,
    loadMonsterWieldRetaliationRecipe,
    verifyMonsterWieldRetaliationSegment,
} from './run-monster-wield-retaliation.mjs';

test('monster-wield-retaliation matrix contains replay inputs only', () => {
    const recipe = loadMonsterWieldRetaliationRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /OPTIONS=playmode:debug/u);
    assert.match(segment.nethackrc, /OPTIONS=rest_on_space,!safe_wait/u);
    assert.equal(segment.moves, ` ${GENESIS_KEY}goblin\n    `);
});

test('the matrix reaches an ordinary wield and consumes its last key',
    async () => {
        const [segment] = loadMonsterWieldRetaliationRecipe().segments;
        await verifyMonsterWieldRetaliationSegment(segment);
    });
