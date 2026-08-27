#!/usr/bin/env node

// Record and replay the default help menu through its full current key-list
// page. The case dismisses all three text pages and reaches the restored map.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// The initial space dismisses the new-game welcome. `j` selects dokeylist(),
// whose 152 lines occupy seven 23-line TTY pages; the final wait crosses the
// next command boundary without consuming RNG.
export const HELP_KEY_BINDINGS_MOVES = ` ?j${' '.repeat(7)}.`;

function nethackrc() {
    return [
        'OPTIONS=name:Ada,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpKeyBindingsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches the default key list without
            // turn-dependent setup. The non-full-moon date avoids an extra
            // startup message and cannot alter the displayed bindings.
            seed: 736_491,
            datetime: '20420206070809',
            nethackrc: nethackrc(),
            moves: HELP_KEY_BINDINGS_MOVES,
        }],
    }, 'help key-bindings recipe');
}

export async function runHelpKeyBindingsMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help full current key bindings',
            recipe: loadHelpKeyBindingsRecipe(),
        }],
        summaryLabel: 'HELP KEY BINDINGS',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpKeyBindingsMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help key bindings: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
