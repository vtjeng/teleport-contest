#!/usr/bin/env node

// Run a fresh differential for the ascending '<' command. The recipe replays
// seed0007-rogue-snake-swamp through step 69: the hero descends to D:2, walks
// around, then types '<' on D:2's up staircase and dismisses the --More--
// prompt after "You climb up the stairs." returns to D:1.
//
// The recorded evidence is a strict comparison against a fresh C recording:
// PRNG calls (including the 3 rnd(10) calls from getlev's hide_monst check
// at restore.c:1219), complete screens, and cursor positions.
//
// The recipe's moves are the first 69 bytes of the original session's input.
// Step 68 types '<', step 69 types ' ' to dismiss the --More--. The segment
// ends at the D:1 map after the ascent.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// The moves are taken directly from session seed0007-rogue-snake-swamp
// (seed 7, datetime 20260503025436, nethackrc "OPTIONS=symset:DECgraphics").
// Characters 0-68 inclusive (69 bytes); the penultimate byte is '<' (the up
// command at step 68), and the last byte is ' ' (dismiss --More-- at step 69).
const ASCEND_MOVES = 'Septor\rynr"moy   nmO g ijpu afp  n      $"fh=/\rHYh yhhhhh> jNhyHull< ';

export function loadAscendRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 7,
            datetime: '20260503025436',
            nethackrc: 'OPTIONS=symset:DECgraphics',
            moves: ASCEND_MOVES,
        }],
    });
}

if (process.argv[1] === SCRIPT_PATH || process.argv[1] === resolve(SCRIPT_PATH)) {
    runFreshMatrix({
        summaryLabel: 'ascend level',
        entries: [
            { label: 'ascend level', recipe: loadAscendRecipe() },
        ],
    });
}
