import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    loadStartupSortdiscoveriesRecipe,
    STARTUP_SORTDISCOVERIES_CASES,
    verifyStartupSortdiscoveriesSegment,
} from './run-startup-sortdiscoveries.mjs';

test('the sortdiscoveries recipe covers each default-order parser form',
    () => {
        const { segments, version } = loadStartupSortdiscoveriesRecipe();
        assert.equal(version, 5);
        assert.equal(segments.length, STARTUP_SORTDISCOVERIES_CASES.length);
        assert.equal(segments.length, 5);
        for (const [index, segment] of segments.entries()) {
            const entry = STARTUP_SORTDISCOVERIES_CASES[index];
            assert.equal(Object.hasOwn(segment, 'steps'), false, entry.label);
            assert.ok(segment.moves.includes('\\'), entry.label);
            assert.equal(
                parseNethackrc(segment.nethackrc).flags.discosort,
                entry.expected,
                entry.label,
            );
        }
    });

test('the known command renders every configured default-order form',
    async () => {
        for (const segment of loadStartupSortdiscoveriesRecipe().segments)
            await verifyStartupSortdiscoveriesSegment(segment);
    });
