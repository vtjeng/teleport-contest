import assert from 'node:assert/strict';
import test from 'node:test';

import {
    MONSTER_DEATH_CASE,
    loadMonsterDeathPlanningRecipe,
    verifyMonsterDeathPlanningSegment,
} from './run-monster-death-planning.mjs';

test('monster death planning recipe contains replay inputs only', () => {
    const recipe = loadMonsterDeathPlanningRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.equal(segment.seed, MONSTER_DEATH_CASE.seed);
    assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
    assert.match(segment.nethackrc, /pettype:none/u);
    assert.equal(segment.moves, MONSTER_DEATH_CASE.moves);
});

test('live replay reaches done_in_by after planned lethal water-demon damage',
    async () => {
        const [segment] = loadMonsterDeathPlanningRecipe().segments;
        await verifyMonsterDeathPlanningSegment(segment);
    });
