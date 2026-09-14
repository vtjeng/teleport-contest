import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
    loadArcLocaRecipes,
    verifyArcLocaSegment,
} from './run-arc-loca-level-load.mjs';

test('Arc-loca recipes are independent clean input-only sessions', () => {
    // These seeds/dates were chosen for the replacement recipes, not copied
    // from the fixed workload. The 44/41 inputs include their startup prompts;
    // z is the selected Arc-loca entry on the wizard menu's second page.
    const recipes = loadArcLocaRecipes();
    assert.equal(recipes.length, 2);
    assert.deepEqual(recipes.map(({ segments: [segment] }) => [
        segment.seed,
        segment.datetime,
        segment.moves.length,
        segment.moves.at(-1),
    ]), [
        [98231, '20460914121530', 44, 'z'],
        [777331, '20370704153045', 41, 'z'],
    ]);
    assert.match(recipes[0].segments[0].nethackrc, /gender:male/u);
    assert.match(recipes[1].segments[0].nethackrc, /gender:female/u);
    assert.notEqual(recipes[0].segments[0].seed, recipes[1].segments[0].seed);
    assert.notEqual(
        recipes[0].segments[0].datetime,
        recipes[1].segments[0].datetime,
    );
    const fixedMoves = JSON.parse(readFileSync(
        new URL('../sessions/seed0361-archeologist-tour.session.json', import.meta.url),
    )).segments[0].moves;
    for (const { segments: [segment] } of recipes) {
        // Reject the original mistake: copying an entire fixed-session prefix.
        // This check alone does not establish independent case design.
        assert.notEqual(segment.moves, fixedMoves.slice(0, segment.moves.length));
    }
    for (const recipe of recipes)
        assert.equal(Object.hasOwn(recipe.segments[0], 'steps'), false);
});

test('Arc-loca source evidence names the 76 by 20 Lua map', () => {
    // dat/Arc-loca.lua:10-31 contains 20 rows, each 76 cells wide.
    const rows = readFileSync(
        new URL('../nethack-c/upstream/dat/Arc-loca.lua', import.meta.url),
        'utf8',
    ).split('\n').slice(10, 30);
    assert.equal(rows.length, 20);
    assert.ok(rows.every((row) => row.length === 76));
});

test('Arc-loca loader creates source-defined level state', async () => {
    for (const recipe of loadArcLocaRecipes())
        await verifyArcLocaSegment(recipe.segments[0]);
});
