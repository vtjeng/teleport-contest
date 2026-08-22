import assert from 'node:assert/strict';
import test from 'node:test';

import {
    GFILTER_AREA,
    GFILTER_NONE,
    GFILTER_VIEW,
} from '../js/const.js';
import { allopt } from '../js/optlist_data.js';
import {
    optionValue,
    parseNethackrc,
    UNPARSED_COMPOUND_OPTIONS,
} from '../js/options.js';
import {
    loadStartupWhatisFilterRecipes,
    STARTUP_WHATIS_FILTER_CASES,
    verifyStartupWhatisFilterSegment,
} from './run-startup-whatis-filter.mjs';
import { withSerializedGrids } from './terminal-grid-capture.mjs';

test('whatis_filter starts in its zeroed instance-flags field', () => {
    const parsed = parseNethackrc('');
    assert.equal(parsed.iflags.getloc_filter, GFILTER_NONE);
    assert.equal(parsed.flags.whatis_filter, undefined);
});

test('whatis_filter getter names all three source enum values', () => {
    const row = allopt.find(({ name }) => name === 'whatis_filter');
    const parsed = parseNethackrc('');
    for (const [filter, shown] of [
        [GFILTER_NONE, 'none'],
        [GFILTER_VIEW, 'view'],
        [GFILTER_AREA, 'area'],
    ]) {
        parsed.iflags.getloc_filter = filter;
        assert.equal(optionValue(parsed, row, {}), shown);
    }
    assert.equal(UNPARSED_COMPOUND_OPTIONS.has('whatis_filter'), false);
});

test('the fresh whatis_filter matrix contains replay inputs only', () => {
    const recipes = loadStartupWhatisFilterRecipes();
    assert.equal(recipes.length, STARTUP_WHATIS_FILTER_CASES.length);
    assert.deepEqual(
        recipes.map(({ recipe }) => [
            recipe.segments[0].seed,
            recipe.segments[0].datetime,
        ]),
        STARTUP_WHATIS_FILTER_CASES.map(({ seed, datetime }) => (
            [seed, datetime]
        )),
    );
    for (const { recipe } of recipes) {
        assert.equal(recipe.version, 5);
        assert.equal(recipe.segments.length, 1);
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
    }
});

test('configured whatis filters reach startup state and optionsfull', () => (
    withSerializedGrids(async () => {
        for (const { recipe } of loadStartupWhatisFilterRecipes()) {
            await verifyStartupWhatisFilterSegment(recipe.segments[0]);
        }
    })
));
