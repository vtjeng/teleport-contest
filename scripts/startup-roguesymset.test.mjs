import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    loadStartupRoguesymsetRecipe,
    STARTUP_ROGUESYMSET_CASES,
    verifyStartupRoguesymsetSegment,
} from './run-startup-roguesymset.mjs';

test('the startup roguesymset recipe covers source selection and cleanup', () => {
    const recipe = loadStartupRoguesymsetRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 9);
    assert.deepEqual(
        STARTUP_ROGUESYMSET_CASES.map(({ label }) => label),
        [
            'missing value is silent',
            'empty value is silent',
            'RogueIBM selection reaches optionsfull',
            'primary restriction does not reject config selection',
            'invalid zqxj reports and resumes startup',
            'invalid suffix clears before valid left selection',
            'invalid left replacement clears metadata but keeps bytes',
            'fuzzy Default symbols selects the default set',
            'decorated bare default is rejected',
        ],
    );
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = STARTUP_ROGUESYMSET_CASES[index];
        assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
        assert.ok(segment.moves.includes('mO'), entry.label);
        assert.ok(segment.moves.endsWith('\x1b'), entry.label);
        const parsed = parseNethackrc(segment.nethackrc);
        assert.equal(
            parsed.configErrorFrame.num_errors,
            entry.errors,
            entry.label,
        );
    }
});

test('each startup roguesymset case reaches installed state and optionsfull',
    async () => {
        for (const segment of loadStartupRoguesymsetRecipe().segments)
            await verifyStartupRoguesymsetSegment(segment);
    });
