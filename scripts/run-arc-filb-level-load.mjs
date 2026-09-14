#!/usr/bin/env node

// Replay independent Archeologist routes into Home 4. Arc-loca is selected
// first so the following source level teleport invokes Arc-filb's filler path.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/Arc-filb.lua/arc-filb-level-teleport.session.json', import.meta.url),
    new URL('../recipes/Arc-filb.lua/arc-filb-level-teleport-variation.session.json', import.meta.url),
];

export function loadArcFilbRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Arc-filb recipe ${index + 1}`,
    ));
}

function linkedCount(head, next) {
    let count = 0;
    for (let item = head; item; item = item[next]) ++count;
    return count;
}

export async function verifyArcFilbSegment(segment) {
    await runSegment(segment);

    // Both fixture seeds place the quest at dnum 3; Home4 exercises filb.
    assert.equal(game.u.uz.dnum, 3);
    assert.equal(game.u.uz.dlevel, 4);
    // The runtime keeps an empty sentinel after the six source rooms.
    assert.equal(
        game.level.rooms.filter(({ rtype }) => rtype !== undefined).length,
        6,
    );
    assert.ok(game.level.rooms
        .filter(({ rtype }) => rtype !== undefined)
        .every(({ rtype }) => rtype === 0));
    // Arc-filb.lua descriptors request four traps, seven monsters, nine
    // objects and two stairs. Other generation effects may add floor objects.
    assert.equal(game.level.traps.length, 4);
    assert.equal(linkedCount(game.level.monlist, 'nmon'), 7);
    assert.ok(linkedCount(game.level.objlist, 'nobj') >= 9);
    assert.equal(linkedCount(game.stairs, 'next'), 2);
}

export function runArcFilbLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadArcFilbRecipes().map((recipe, index) => ({
            label: index === 0
                ? 'Arc-filb level load'
                : 'Arc-filb level load variation',
            recipe,
        })),
        summaryLabel: 'ARC-FILB LEVEL LOAD',
        verifySegment: verifyArcFilbSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runArcFilbLevelLoadMatrix,
    'Arc-filb level load',
);
