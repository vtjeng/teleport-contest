#!/usr/bin/env node

// Record and replay an ordinary safe-pet displacement onto a floor scroll.
// The natural seed and the startup selection path jointly supply the
// destination composition: choosing the female dwarf Valkyrie through the
// menu consumes pick_gend()'s source-ordered rn2(1), which an explicit gender
// option would skip and thereby change level generation. The last space
// dismisses the swap message's TTY --More-- prompt and exposes the inventory
// line produced by spoteffects(TRUE) -> pickup(1).

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

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

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runPetSwapArrivalMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `pet-swap arrival autopickup: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
