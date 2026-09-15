#!/usr/bin/env node

// Fresh independent recordings for wield.c doquiver_core(). The two segments
// cover its #quiver entry and dothrow.c dofire() refill caller separately.

import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const DATETIME = '20000110090000';
const NETHACKRC = [
    'OPTIONS=name:QuiverProbe,role:Ranger,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

// Two startup dismissals and the new-game confirmation precede Q. `b` is the
// Ranger's singleton alternate bow; `y` confirms wield.c:632-650's prompt.
export const QUIVER_ALT_MOVES = '  nQby';
export const FIRE_REFILL_MOVES = '  nfdl';

export function loadWieldQuiverRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 7810101,
            datetime: DATETIME,
            nethackrc: NETHACKRC,
            moves: QUIVER_ALT_MOVES,
        }],
    });
}

export function loadWieldFireRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 7810102,
            datetime: '20000111090000',
            nethackrc: NETHACKRC.replace('QuiverProbe', 'QuiverFireProbe'),
            moves: FIRE_REFILL_MOVES,
        }],
    });
}

export async function runWieldQuiverMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wield quiver alternate weapon',
            recipe: loadWieldQuiverRecipe(),
        }, {
            label: 'dothrow fire quiver refill',
            recipe: loadWieldFireRecipe(),
        }],
        summaryLabel: 'wield doquiver_core fresh matrix',
    });
}

runMatrixCli(
    import.meta.url,
    runWieldQuiverMatrix,
    'wield quiver matrix',
);
