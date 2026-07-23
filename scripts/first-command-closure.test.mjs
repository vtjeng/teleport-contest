import assert from 'node:assert/strict';
import test from 'node:test';

import { parseNethackrc } from '../js/options.js';
import {
    aligns,
    genders,
    races,
    roles,
    validalign,
    validgend,
    validrace,
} from '../js/roles.js';
import {
    chunkRecipe,
    FIRST_COMMAND_CLOSURE_FIXTURES,
    loadClosureRecipe,
    RECORDER_SEGMENT_LIMIT,
} from './run-first-command-closure.mjs';

function characterKey({ flags }) {
    return [
        flags.initrole,
        flags.initrace,
        flags.initgend,
        flags.initalign,
    ].join('/');
}

test('closure recipes contain only clean first-command replay inputs', () => {
    const recipes = FIRST_COMMAND_CLOSURE_FIXTURES.map(loadClosureRecipe);
    assert.deepEqual(
        recipes.map(({ segments }) => segments.length),
        // One segment for every valid character tuple, then 34 independently
        // chosen seeds covering all D:1-eligible themed handlers and fills.
        [73, 10, 10, 10, 4],
    );
    for (const recipe of recipes) {
        for (const segment of recipe.segments) {
            assert.equal(segment.moves, '');
            assert.equal(Object.hasOwn(segment, 'steps'), false);
        }
    }
});

test('closure role recipe covers every valid character tuple exactly once', () => {
    const recipe = loadClosureRecipe(FIRST_COMMAND_CLOSURE_FIXTURES[0]);
    const actual = new Set(recipe.segments.map((segment) => (
        characterKey(parseNethackrc(segment.nethackrc))
    )));
    const expected = new Set();
    for (let role = 0; role < roles.length; ++role) {
        for (let race = 0; race < races.length; ++race) {
            if (!validrace(role, race)) continue;
            for (let gender = 0; gender < genders.length; ++gender) {
                if (!validgend(role, race, gender)) continue;
                for (let alignment = 0; alignment < aligns.length;
                    ++alignment) {
                    if (validalign(role, race, alignment)) {
                        expected.add(`${role}/${race}/${gender}/${alignment}`);
                    }
                }
            }
        }
    }
    assert.deepEqual(actual, expected);
    assert.equal(actual.size, recipe.segments.length);

    const datetimes = new Set(recipe.segments.map(({ datetime }) => datetime));
    for (const boundary of [
        '20000229060000',
        '20000402015959',
        '20000402030001',
        '20001013000000',
        '20001029013000',
        '20001029023000',
        '20001231235959',
    ]) {
        assert.equal(datetimes.has(boundary), true, boundary);
    }
});

test('closure recipes chunk below the recorder live-lock limit', () => {
    const recipe = loadClosureRecipe(FIRST_COMMAND_CLOSURE_FIXTURES[0]);
    const chunks = chunkRecipe(recipe);
    assert.deepEqual(chunks.map(({ segments }) => segments.length), [
        10, 10, 10, 10, 10, 10, 10, 3,
    ]);
    assert.deepEqual(
        chunks.flatMap(({ segments }) => segments),
        recipe.segments,
    );
    assert.ok(chunks.every(
        ({ segments }) => segments.length <= RECORDER_SEGMENT_LIMIT,
    ));
    assert.throws(() => chunkRecipe(recipe, 0), /positive integer/u);
});
