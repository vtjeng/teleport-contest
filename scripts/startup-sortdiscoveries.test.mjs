import assert from 'node:assert/strict';
import test from 'node:test';

import { UnsupportedHeroCommandBranchBoundaryError } from '../js/cmd.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import {
    loadSortedDiscoveriesDeferredRecipe,
    loadStartupSortdiscoveriesRecipe,
    SORTED_DISCOVERIES_DEFERRED_CASE,
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

test('the sorted-output recipe stays reproducible at the next boundary',
    async () => {
        const recipe = loadSortedDiscoveriesDeferredRecipe();
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 1);
        const [segment] = recipe.segments;
        assert.equal(Object.hasOwn(segment, 'steps'), false);
        assert.equal(
            parseNethackrc(segment.nethackrc).flags.discosort,
            SORTED_DISCOVERIES_DEFERRED_CASE.expected,
        );

        let boundary = null;
        await runSegment(segment, {
            onBoundary: (error) => { boundary = error; },
        });
        assert.ok(boundary instanceof UnsupportedHeroCommandBranchBoundaryError);
        assert.match(boundary.reason, /disco_output_sorted\(\)/u);
    });
