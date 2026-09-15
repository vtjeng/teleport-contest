#!/usr/bin/env node

// Run the checked-in matrix for do.c goto_level()'s travel destination cache
// reset through a fresh C recording. The recipe uses seed 14 with an
// independently chosen wizard character and input route: `_` selects the
// downstairs staircase, then C-v level-teleports to D:2. The selected travel
// target belongs to the departing level and must be cleared at do.c:1607
// before the deferred goto_level() completes.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE = new URL(
    '../recipes/do.c/goto-level-travelcc-seed0014.session.json',
    import.meta.url,
);

export function loadDoGotoLevelTravelccRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyDoGotoLevelTravelccSegment(segment) {
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.u.uz.dlevel, 2,
        'the deferred level teleport reaches D:2');
    assert.deepEqual(game.iflags.travelcc, { x: 0, y: 0 },
        'goto_level clears the departing level travel target');
    return replay;
}

export function runDoGotoLevelTravelccMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'goto level travelcc reset',
            recipe: loadDoGotoLevelTravelccRecipe(),
        }],
        summaryLabel: 'GOTO LEVEL TRAVELCC RESET',
        verifySegment: verifyDoGotoLevelTravelccSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runDoGotoLevelTravelccMatrix,
    'goto level travelcc reset',
);
