import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadRepeatedSimpleCommandsRecipe,
} from './run-repeated-simple-commands.mjs';

test('repeated-simple-command matrix contains only source-selected inputs',
    () => {
        const recipe = loadRepeatedSimpleCommandsRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 6);
        assert.deepEqual(
            recipe.segments.map(({ moves }) => moves.length),
            [250, 12, 4, 1, 1, 1],
        );
        assert.deepEqual(
            recipe.segments.map(({ moves }) => new Set(moves)),
            [
                new Set(['.']),
                new Set(['h']),
                new Set(['h']),
                new Set(['l']),
                new Set(['y']),
                new Set(['h']),
            ],
        );
        for (const segment of recipe.segments) {
            assert.equal(Object.hasOwn(segment, 'steps'), false);
            assert.match(segment.nethackrc, /OPTIONS=!legacy,!tutorial/u);
        }
    });
