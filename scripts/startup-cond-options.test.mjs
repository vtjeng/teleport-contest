import assert from 'node:assert/strict';
import test from 'node:test';

import {
    loadStartupCondOptionsRecipe,
    STARTUP_COND_OPTIONS_SEGMENT,
    verifyStartupCondOptionsSegment,
} from './run-startup-cond-options.mjs';

test('the startup condition-options recipe dismisses errors and reaches 17',
    async () => {
        const recipe = loadStartupCondOptionsRecipe();
        assert.equal(recipe.version, 5);
        assert.deepEqual(recipe.segments, [STARTUP_COND_OPTIONS_SEGMENT]);
        assert.equal(Object.hasOwn(STARTUP_COND_OPTIONS_SEGMENT, 'steps'), false);
        assert.equal(STARTUP_COND_OPTIONS_SEGMENT.moves,
            '\n mO       \x1b');
        await verifyStartupCondOptionsSegment(STARTUP_COND_OPTIONS_SEGMENT);
    });
