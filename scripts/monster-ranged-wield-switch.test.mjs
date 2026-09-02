import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GENESIS_KEY,
    loadMonsterRangedWieldSwitchRecipe,
    verifyMonsterRangedWieldSwitchSegment,
} from './run-monster-ranged-wield-switch.mjs';

test('monster-ranged-wield-switch matrix contains replay inputs only', () => {
    const recipe = loadMonsterRangedWieldSwitchRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 1);
    const [segment] = recipe.segments;
    assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.match(segment.nethackrc, /OPTIONS=playmode:debug/u);
    assert.match(segment.nethackrc, /rest_on_space,!safe_wait/u);
    assert.equal(segment.moves, ` ${GENESIS_KEY}Uruk-hai\n   kkk`);
});

test('the matrix reaches current-weapon ranged wield on its last key',
    async () => {
        const [segment] = loadMonsterRangedWieldSwitchRecipe().segments;
        await verifyMonsterRangedWieldSwitchSegment(segment);
    });
