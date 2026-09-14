import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
    loadArcGoalRecipes,
    verifyArcGoalSegment,
} from './run-arc-goal-level-load.mjs';

test('Arc-goal recipes are independent clean input-only sessions', () => {
    const recipes = loadArcGoalRecipes();
    assert.equal(recipes.length, 2);
    assert.deepEqual(recipes.map(({ segments: [segment] }) => [
        segment.seed,
        segment.datetime,
        segment.moves.length,
        segment.moves.at(-1),
    ]), [
        [665431, '20461005143020', 44, 'A'],
        [889123, '20381122104555', 41, 'A'],
    ]);
    assert.match(recipes[0].segments[0].nethackrc, /gender:male/u);
    assert.match(recipes[1].segments[0].nethackrc, /gender:female/u);
    for (const recipe of recipes)
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);

    // Keep the fresh routes independent of the fixed Archeologist witness.
    const witness = JSON.parse(readFileSync(
        new URL('../sessions/seed0361-archeologist-tour.session.json', import.meta.url),
        'utf8',
    ));
    for (const recipe of recipes) {
        const moves = recipe.segments[0].moves;
        const witnessMoves = witness.segments[0].moves;
        let common = 0;
        while (common < moves.length && common < witnessMoves.length
            && moves[common] === witnessMoves[common]) ++common;
        assert.ok(common < 8, 'fresh Arc-goal route copied a witness prefix');
    }
});

test('Arc-goal source map is the 76 by 20 Lua map', () => {
    // dat/Arc-goal.lua:11-30 contains 20 rows, each 76 cells wide.
    const rows = readFileSync(
        new URL('../nethack-c/upstream/dat/Arc-goal.lua', import.meta.url),
        'utf8',
    ).split('\n').slice(10, 30);
    assert.equal(rows.length, 20);
    assert.ok(rows.every((row) => row.length === 76));
});

test('Arc-goal loader creates source-defined level state', async () => {
    for (const recipe of loadArcGoalRecipes())
        await verifyArcGoalSegment(recipe.segments[0]);
});
