#!/usr/bin/env node

// Record and replay an independent bottom-of-Mines level load.  The
// source-defined down stair is requested on the branch's last level, so
// mklev.c mkstairs() must reject it before changing the map or stairway list;
// the level-change redraw also crosses display.c cls().

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/mklev.c/minetown-end-stair-independent.session.json',
    import.meta.url,
);

export function loadMklevDungeonEndRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'mklev dungeon-end stair recipe',
    );
}

export async function verifyMklevDungeonEndSegment(segment) {
    await runSegment(segment);

    assert.deepEqual(game.u.uz, { dnum: 2, dlevel: 8 });
    assert.ok(game.level.upstair);
    assert.equal(game.level.dnstair, undefined);

    const stairways = [];
    for (let stair = game.stairs; stair; stair = stair.next)
        stairways.push(stair);
    assert.ok(stairways.length > 0);
    assert.ok(stairways.every(({ up }) => up));
    assert.equal(stairways.some(({ up }) => !up), false);
}

export function runMklevDungeonEndMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'mklev bottom-of-Mines stair guard',
            recipe: loadMklevDungeonEndRecipe(),
        }],
        summaryLabel: 'MKLEV DUNGEON-END STAIRS',
        verifySegment: verifyMklevDungeonEndSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runMklevDungeonEndMatrix,
    'mklev dungeon-end stairs',
);
