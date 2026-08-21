import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    loadStartupBoulderRecipe,
    STARTUP_BOULDER_CASES,
    verifyStartupBoulderSegment,
} from './run-startup-boulder-symbol.mjs';

test('the startup boulder recipe covers bytes, clashes, and ordering', () => {
    const recipe = loadStartupBoulderRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, STARTUP_BOULDER_CASES.length);
    assert.deepEqual(
        STARTUP_BOULDER_CASES.map(({ label }) => label),
        [
            'literal accepted byte',
            'S_boulder follows escaped boulder',
            'boulder follows S_boulder',
            'monster-class collision',
            'warning collision',
            'decoded NUL keeps earlier accepted byte',
            'signed meta byte',
            'mandatory value',
        ],
    );
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = STARTUP_BOULDER_CASES[index];
        assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
        assert.ok(segment.moves.includes('mO'), entry.label);
        assert.ok(segment.moves.endsWith('\x1b'), entry.label);
        assert.equal(
            parseNethackrc(segment.nethackrc).configErrorFrame.num_errors,
            entry.errors,
            entry.label,
        );
    }
});

test('each startup boulder case reaches #optionsfull and the tutorial map',
    async () => {
        for (const segment of loadStartupBoulderRecipe().segments)
            await verifyStartupBoulderSegment(segment);
    });
