#!/usr/bin/env node

// Re-record and strictly compare the positive-decimal level-teleport slice.
// Recipes contain replay inputs only; diff-fresh supplies all C and JavaScript
// output in an isolated temporary workspace.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310409121530';
const LEVELPORT_KEY = '\x16';

function nethackrc() {
    return [
        'OPTIONS=name:Arrival,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,playmode:debug',
        '',
    ].join('\n');
}

function teleport(seed, destination) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        // The opening wait paints an ordinary D:1 frame. The closing wait
        // proves the arrival position is live at the next input boundary.
        moves: `.${LEVELPORT_KEY}${destination}\n.`,
    };
}

export function loadLevelTeleportArrivalRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // D:2 also carries this seed's Mines branch, so ordinary arrival
            // remains correct when place_branch() ran during generation.
            teleport(7621004, 2),
            // D:5 exercises the depth-gated ordinary generation branches
            // which the earlier staircase-descent goal never reached.
            teleport(7621001, 5),
            // Just outside the changing-level boundary: schedule_goto() sets
            // a deferred destination equal to u.uz and deferred_goto() only
            // clears it, generating no replacement level.
            teleport(7621009, 1),
        ],
    }, 'level teleport arrival recipe');
}

export async function runLevelTeleportArrivalMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'level teleport arrival',
            recipe: loadLevelTeleportArrivalRecipe(),
        }],
        summaryLabel: 'LEVEL TELEPORT ARRIVAL',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runLevelTeleportArrivalMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `level teleport arrival: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
