import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadThemedSpiderNestRecipe,
    verifyThemedSpiderNest,
} from './run-themed-spider-nest.mjs';

test('the spider-nest matrix contains only source-selected inputs', () => {
    const recipe = loadThemedSpiderNestRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 5);
    const destinations = [];
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        // Ctrl-V is a wizard-mode command, so every segment needs debug mode.
        assert.match(segment.nethackrc, /playmode:debug/u);
        destinations.push(Number(/\x16(\d+)\n/u.exec(segment.moves)[1]));
    }
    // themerms.lua:89 gates the spider on level_difficulty() > 8. Four
    // segments sit past that gate and one control sits on the level below it.
    assert.deepEqual(destinations, [8, 9, 9, 12, 15]);
    assert.equal(destinations.filter((level) => level <= 8).length, 1);
});

test('each spider-nest segment generates the webs and spiders it pins',
    async () => {
        for (const segment of loadThemedSpiderNestRecipe().segments)
            await verifyThemedSpiderNest(segment);
    });
