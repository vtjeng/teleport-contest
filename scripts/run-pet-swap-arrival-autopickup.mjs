#!/usr/bin/env node

// Record and replay an ordinary safe-pet displacement onto a floor scroll.
// The natural seed and the startup selection path jointly supply the
// destination composition: choosing the female dwarf Valkyrie through the
// menu consumes pick_gend()'s source-ordered rn2(1), which an explicit gender
// option would skip and thereby change level generation. The last space
// dismisses the swap message's TTY --More-- prompt and exposes the inventory
// line produced by spoteffects(TRUE) -> pickup(1).

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const PET_SWAP_ARRIVAL_MOVES = 'FreshSwap\rnvd\r   nuK@,uu ';

function nethackrc() {
    return [
        'OPTIONS=symset:DECgraphics',
        'OPTIONS=runmode:walk',
        '',
    ].join('\n');
}

export function loadPetSwapArrivalRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Seed 14 creates the little dog standing over the scroll after
            // the six gameplay commands following startup. FreshSwap is a
            // newly chosen name, and the distinct fixed date records a new C
            // runtime while preserving the selection-dependent RNG sequence.
            seed: 14,
            datetime: '20320405060708',
            nethackrc: nethackrc(),
            moves: PET_SWAP_ARRIVAL_MOVES,
        }],
    }, 'pet-swap arrival autopickup recipe');
}

export async function runPetSwapArrivalMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'pet-swap arrival autopickup',
            recipe: loadPetSwapArrivalRecipe(),
        }],
        summaryLabel: 'PET-SWAP ARRIVAL AUTOPICKUP',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runPetSwapArrivalMatrix, 'pet-swap arrival autopickup');
