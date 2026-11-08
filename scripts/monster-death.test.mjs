import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MONSTER_DEATH_CASE,
    loadMonsterDeathRecipe,
    verifyMonsterDeathSegment,
} from './run-monster-death.mjs';

test('monster death recipe contains replay inputs only', () => {
    const recipe = loadMonsterDeathRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.equal(segment.seed, MONSTER_DEATH_CASE.seed);
    assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
    assert.match(segment.nethackrc, /pettype:none/u);
    assert.equal(segment.moves, MONSTER_DEATH_CASE.moves);
});

test('live replay reaches done_in_by after lethal water-demon damage',
    async () => {
        const [segment] = loadMonsterDeathRecipe().segments;
        await verifyMonsterDeathSegment(segment);
    });
