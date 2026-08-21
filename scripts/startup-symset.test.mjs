import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    loadStartupSymsetRecipe,
    STARTUP_SYMSET_CASES,
    verifyStartupSymsetSegment,
} from './run-startup-symset.mjs';

test('the startup symset recipe covers selection and override ordering', () => {
    const recipe = loadStartupSymsetRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, STARTUP_SYMSET_CASES.length);
    assert.equal(recipe.segments.length, 7);
    assert.deepEqual(
        STARTUP_SYMSET_CASES.map(({ label }) => label),
        [
            'bundled primary set',
            'default symbols alias',
            'invalid selection keeps default map',
            'invalid selection before valid selection',
            'invalid selection after valid selection',
            'SYMBOLS override before invalid selection',
            'SYMBOLS override after invalid selection',
        ],
    );
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = STARTUP_SYMSET_CASES[index];
        assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
        assert.ok(segment.moves.includes('mO'), entry.label);
        assert.ok(segment.moves.endsWith('\x1b'), entry.label);
        const parsed = parseNethackrc(segment.nethackrc);
        assert.equal(
            parsed.configErrorFrame.num_errors > 0,
            Boolean(entry.reports),
            entry.label,
        );
    }
});

test('each startup symset case reaches the first map and optionsfull state',
    async () => {
        for (const segment of loadStartupSymsetRecipe().segments)
            await verifyStartupSymsetSegment(segment);
    });
