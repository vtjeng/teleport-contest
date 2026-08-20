import assert from 'node:assert/strict';
import test from 'node:test';

import {
    PARANOID_CONFIRM,
    PARANOID_PRAY,
} from '../js/const.js';
import { parseNethackrc } from '../js/options.js';
import {
    loadStartupParanoiaRecipe,
    STARTUP_PARANOIA_CASES,
    verifyStartupParanoiaSegment,
} from './run-startup-paranoid-confirmation.mjs';

test('the startup paranoia recipe covers both prayer query outcomes', () => {
    const recipe = loadStartupParanoiaRecipe();
    assert.equal(recipe.version, 5);
    assert.equal(recipe.segments.length, 2);
    assert.ok(recipe.segments.every(
        (segment) => !Object.hasOwn(segment, 'steps'),
    ));
    for (const [index, segment] of recipe.segments.entries()) {
        const entry = STARTUP_PARANOIA_CASES[index];
        const parsed = parseNethackrc(segment.nethackrc);
        assert.equal(parsed.flags.paranoia_bits, entry.bits, entry.label);
        assert.equal(parsed.flags.paranoid_confirmation, undefined);
        assert.equal(parsed.flags.paranoia_bits & PARANOID_CONFIRM, 0);
        assert.equal(
            Boolean(parsed.flags.paranoia_bits & PARANOID_PRAY),
            entry.prayers === 0,
        );
    }
});

test('each startup paranoia case reaches its live prayer outcome', async () => {
    for (const segment of loadStartupParanoiaRecipe().segments)
        await verifyStartupParanoiaSegment(segment);
});
