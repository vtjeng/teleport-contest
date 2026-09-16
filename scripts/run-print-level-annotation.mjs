#!/usr/bin/env node

// Run an independent C differential for dungeon.c
// get_annotation()/print_level_annotation(). The route names D:5 through the
// source #name menu, returns to D:1, then returns to D:5 so the arrival
// message is reached after goto_level() has assigned the remembered level.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { find_mapseen } from '../js/dungeon.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/dungeon.c/level-annotation-arrival-independent.session.json',
    import.meta.url,
);

export function loadPrintLevelAnnotationRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'independent print_level_annotation recipe',
    );
}

export async function verifyPrintLevelAnnotationSegment(segment) {
    await runSegment(segment);
    const mapseen = find_mapseen({ dnum: 0, dlevel: 5 }, game);
    assert.equal(mapseen?.custom, 'Upper landing');
    assert.match(
        game.nhDisplay?.toplines ?? '',
        /You remember this level as Upper landing\./u,
    );
    assert.equal(game.nhDisplay.inputQueueLength, 0);
}

export function runPrintLevelAnnotationMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'level annotation arrival',
            recipe: loadPrintLevelAnnotationRecipe(),
        }],
        summaryLabel: 'DUNGEON LEVEL ANNOTATION',
        verifySegment: verifyPrintLevelAnnotationSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runPrintLevelAnnotationMatrix,
    'level annotation arrival',
);
