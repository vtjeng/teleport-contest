#!/usr/bin/env node

// Record and replay the default help menu through its ordinary inventory-key
// description. The case crosses the following command boundary.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// Space dismisses the first-use explanation before `i` answers the prompt;
// the final wait reaches the restored map without spending RNG.
export const HELP_WHATDOES_MOVES = '?f i.';

function nethackrc() {
    return [
        'OPTIONS=name:Emmy,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpWhatdoesRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches the ordinary key lookup without
            // turn-dependent setup. The fixed date cannot change its text.
            seed: 642_871,
            datetime: '20390809070605',
            nethackrc: nethackrc(),
            moves: HELP_WHATDOES_MOVES,
        }],
    }, 'help whatdoes recipe');
}

export async function runHelpWhatdoesMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help whatdoes ordinary inventory key',
            recipe: loadHelpWhatdoesRecipe(),
        }],
        summaryLabel: 'HELP WHATDOES',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpWhatdoesMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help whatdoes: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
