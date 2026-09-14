#!/usr/bin/env node

// Record and replay the ordinary #wipe occupation against the patched C
// program. The recipe wishes for one cream pie, applies it, enters #wipe when
// the two cream-blindness counters are three, and waits once after the
// occupation returns to command input.

import { readFileSync } from 'node:fs';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE_DIR = new URL('../recipes/do.c/', import.meta.url);

function loadRecipe(filename, label) {
    return validateCleanRecipe(
        JSON.parse(readFileSync(new URL(filename, RECIPE_DIR), 'utf8')),
        label,
    );
}

export function loadWipeOccupationRecipe() {
    return loadRecipe('wipe-occupation.session.json', 'wipe occupation recipe');
}

export function loadWipeCleanFaceRecipe() {
    // This independent debug seed starts with no cream pie, so the shortest
    // input reaches dowipe()'s clean-face branch directly.
    return loadRecipe('wipe-clean-face.session.json', 'wipe clean-face recipe');
}

export async function runWipeOccupationMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ordinary wipe occupation',
            recipe: loadWipeOccupationRecipe(),
        }, {
            label: 'clean-face wipe command',
            recipe: loadWipeCleanFaceRecipe(),
        }],
        summaryLabel: 'WIPE OCCUPATION',
        // A debug game leaves a save behind when the recorder exits, so this
        // one-segment recipe must run alone in its install chunk.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWipeOccupationMatrix, 'wipe occupation');
