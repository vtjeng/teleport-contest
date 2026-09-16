#!/usr/bin/env node

// Record and replay an independent cross-dungeon branch route. The input-only
// recipe reaches do.c goto_level() with at_stairs=TRUE, so its pre-assignment
// recbranch_mapseen() call is observable in the D:4 overview entry.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { find_mapseen } from '../js/dungeon.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/dungeon.c/recbranch-mapseen-independent.session.json',
    import.meta.url,
);

export function loadRecbranchMapseenRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'independent recbranch_mapseen recipe',
    );
}

export async function verifyRecbranchMapseenSegment(segment) {
    await runSegment(segment);
    const source = find_mapseen({ dnum: 0, dlevel: 4 }, game);
    assert.ok(source, 'D:4 overview record exists after branch travel');
    assert.deepEqual(source.br?.end1, { dnum: 0, dlevel: 4 });
    assert.deepEqual(source.br?.end2, { dnum: 2, dlevel: 1 });
}

export function runRecbranchMapseenMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'independent recbranch_mapseen branch travel',
            recipe: loadRecbranchMapseenRecipe(),
        }],
        summaryLabel: 'DUNGEON RECbranch MAPSEEN',
        verifySegment: verifyRecbranchMapseenSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runRecbranchMapseenMatrix,
    'independent recbranch_mapseen branch travel',
);
