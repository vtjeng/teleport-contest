import assert from 'node:assert/strict';
import test from 'node:test';

import { surface } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { dfeature_at } from '../js/invent.js';
import { runSegment } from '../js/jsmain.js';
import { loadBlindSurfaceRecipe } from './run-blind-surface.mjs';

// The noun each segment's walk is chosen to reach, and whether dfeature_at()
// repeats it. invent.c:4210-4211 drops the feature line only when the two
// strings are equal, so a segment that answers null and one that answers a
// different string cover the same "printed" outcome by different routes.
const SEGMENT_SURFACES = [
    ['stairs', 'staircase up out of the dungeon'],
    ['doorway', 'doorway'],
    ['fountain', 'fountain'],
    ['floor', null],
    ['ground', null],
    ['fountain', 'fountain'],
    // The sighted control ends where the first segment does.
    ['stairs', 'staircase up out of the dungeon'],
];

test('the blind-surface matrix contains only source-selected inputs', () => {
    const recipe = loadBlindSurfaceRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, SEGMENT_SURFACES.length);
    for (const segment of recipe.segments) {
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
    }
    // Exactly one segment leaves OPTIONS=blind off, and it is the control.
    const blind = recipe.segments.filter(
        (segment) => /,blind$/mu.test(segment.nethackrc),
    );
    assert.equal(blind.length, recipe.segments.length - 1);
    assert.equal(/,blind$/mu.test(recipe.segments.at(-1).nethackrc), false);
});

test('each blind-surface segment reaches the terrain it was chosen for',
    async () => {
        const recipe = loadBlindSurfaceRecipe();
        const reached = [];
        for (const segment of recipe.segments) {
            await runSegment(segment);
            const { ux, uy } = game.u;
            reached.push([
                surface(ux, uy, game),
                dfeature_at(ux, uy, game),
            ]);
        }
        assert.deepEqual(reached, SEGMENT_SURFACES);
        // Five of surface()'s arms, which is what the matrix is for.
        assert.equal(new Set(reached.map(([noun]) => noun)).size, 5);
    });
