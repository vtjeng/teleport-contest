import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
import { THEMEROOM_DEFINITIONS } from '../js/themeroom_data.js';
import { THEMEROOM_FILL_DEFINITIONS } from '../js/themerooms.js';
import {
    chunkRecipe,
    FIRST_COMMAND_CLOSURE_FIXTURES,
    loadClosureRecipe,
    RECORDER_SEGMENT_LIMIT,
    verifyFirstCommandBoundary,
} from './run-first-command-closure.mjs';

const THEME_MANIFEST = JSON.parse(readFileSync(new URL(
    './fixtures/first-command-closure-themes.manifest.json',
    import.meta.url,
), 'utf8'));

const STARTUP_DISMISSALS = new Map([
    ['Closure1', ' '],
    ['Closure2', ' '],
    ['Closure3', ' '],
    ['Closure4', ' '],
    ['Closure5', ' '],
    ['Closure6', '  '],
    ['Closure7', ' '],
    ['Closure13', ' '],
    ['Closure27', ' '],
    ['Closure56', ' '],
    ['Closure57', ' '],
]);

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
            const name = /(?:^|[=,])name:([^,\n]+)/u
                .exec(segment.nethackrc)?.[1];
            assert.equal(segment.moves, STARTUP_DISMISSALS.get(name) ?? '');
            assert.equal(Object.hasOwn(segment, 'steps'), false);
        }
    }
});

test('closure recipes reach the first command without executing it', async () => {
    for (const filename of FIRST_COMMAND_CLOSURE_FIXTURES) {
        for (const segment of loadClosureRecipe(filename).segments) {
            await verifyFirstCommandBoundary(segment);
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

test('closure theme seeds retain every D:1-eligible selection family', () => {
    assert.equal(THEME_MANIFEST.version, 1);
    assert.equal(THEME_MANIFEST.difficulty, 1);
    const themeSeeds = FIRST_COMMAND_CLOSURE_FIXTURES.slice(1)
        .flatMap((filename) => loadClosureRecipe(filename).segments)
        .map(({ seed }) => seed);
    const manifestSeeds = THEME_MANIFEST.selections.map(({ seed }) => seed);
    assert.deepEqual(themeSeeds, manifestSeeds);
    assert.equal(new Set(themeSeeds).size, themeSeeds.length);

    // The manifest was captured by observing source-shaped room and fill
    // selection during the source-neutral 1..2000 seed scan. Cross-check its
    // union against the generated source catalogs so seed substitution cannot
    // silently reduce the promised handler/fill coverage.
    const selectedRooms = new Set(THEME_MANIFEST.selections.flatMap(
        ({ rooms: selected }) => selected,
    ));
    const selectedFills = new Set(THEME_MANIFEST.selections.flatMap(
        ({ fills: selected }) => selected,
    ));
    const eligible = ({ mindiff, maxdiff }) => (
        (mindiff == null || mindiff <= THEME_MANIFEST.difficulty)
        && (maxdiff == null || maxdiff >= THEME_MANIFEST.difficulty)
    );
    assert.deepEqual(
        [...selectedRooms].sort(),
        THEMEROOM_DEFINITIONS.filter(eligible).map(({ id }) => id).sort(),
    );
    assert.deepEqual(
        [...selectedFills].sort(),
        THEMEROOM_FILL_DEFINITIONS.filter(eligible)
            .map(({ id }) => id).sort(),
    );
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
