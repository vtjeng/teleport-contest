#!/usr/bin/env node

// Replay independent Archeologist routes into Home 2. Arc-loca is selected
// first so the following source level teleport invokes Arc-fila's filler path.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/Arc-fila.lua/arc-fila-level-teleport.session.json', import.meta.url),
    new URL('../recipes/Arc-fila.lua/arc-fila-level-teleport-variation.session.json', import.meta.url),
];

export function loadArcFilaRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Arc-fila recipe ${index + 1}`,
    ));
}

function linkedCount(head, next) {
    let count = 0;
    for (let item = head; item; item = item[next]) ++count;
    return count;
}

export async function verifyArcFilaSegment(segment) {
    await runSegment(segment);

    // Both fixture seeds place the quest at dnum 3; Home2 exercises fila.
    assert.equal(game.u.uz.dnum, 3);
    assert.equal(game.u.uz.dlevel, 2);
    // The runtime keeps an empty sentinel after the six source rooms.
    assert.equal(
        game.level.rooms.filter(({ rtype }) => rtype !== undefined).length,
        6,
    );
    assert.ok(game.level.rooms
        .filter(({ rtype }) => rtype !== undefined)
        .every(({ rtype }) => rtype === 0));
    // Arc-fila.lua requests four traps, nine objects and two stairs.
    assert.equal(game.level.traps.length, 4);
    // Class-based S descriptors can create an additional random monster;
    // source accounting is six S descriptors plus one named mummy.
    assert.ok(linkedCount(game.level.monlist, 'nmon') >= 7);
    assert.ok(linkedCount(game.level.objlist, 'nobj') >= 9);
    assert.equal(linkedCount(game.stairs, 'next'), 2);
}

export function runArcFilaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadArcFilaRecipes().map((recipe, index) => ({
            label: index === 0
                ? 'Arc-fila level load'
                : 'Arc-fila level load variation',
            recipe,
        })),
        summaryLabel: 'ARC-FILA LEVEL LOAD',
        verifySegment: verifyArcFilaSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runArcFilaLevelLoadMatrix,
    'Arc-fila level load',
);
