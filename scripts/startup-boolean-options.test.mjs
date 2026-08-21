import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadStartupBooleanOptionsRecipe,
    STARTUP_BOOLEAN_CASES,
    STARTUP_BOOLEAN_HEADING_CEILING_SEGMENT,
    verifyStartupBooleanOptionsSegment,
} from './run-startup-boolean-options.mjs';

test('the startup boolean recipe covers both menus and post-write arms', () => {
    const recipe = loadStartupBooleanOptionsRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, STARTUP_BOOLEAN_CASES.length);
    assert.equal(recipe.segments.length, 4);
    assert.ok(recipe.segments.some((segment) => segment.moves.includes('mO')));
    assert.ok(recipe.segments.some((segment) => !segment.moves.includes('mO')));
    for (const segment of recipe.segments)
        assert.equal(Object.hasOwn(segment, 'steps'), false);
    assert.equal(
        Object.hasOwn(STARTUP_BOOLEAN_HEADING_CEILING_SEGMENT, 'steps'), false,
    );
    assert.equal(
        recipe.segments.includes(STARTUP_BOOLEAN_HEADING_CEILING_SEGMENT),
        false,
    );
});

test('each startup boolean case reaches its source-owned live fields',
    async () => {
        for (const segment of loadStartupBooleanOptionsRecipe().segments)
            await verifyStartupBooleanOptionsSegment(segment);
    });
