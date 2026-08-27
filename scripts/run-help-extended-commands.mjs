#!/usr/bin/env node

// Record and replay the default help menu through the initial extended-
// command list. The case dismisses all six menu pages and reaches the
// restored map through the next command boundary.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// The initial space dismisses the new-game welcome. `k` selects doextlist(),
// whose 138 menu lines occupy six 23-line TTY pages; the final wait crosses
// the next command boundary without consuming RNG.
export const HELP_EXTENDED_COMMANDS_MOVES = ` ?k${' '.repeat(6)}.`;

function nethackrc() {
    return [
        'OPTIONS=name:Grace,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpExtendedCommandsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches the normal-play list without
            // turn-dependent setup. The date is neither Friday the 13th nor
            // a full moon, so startup contributes no calendar-specific line.
            seed: 481_516,
            datetime: '20420304050607',
            nethackrc: nethackrc(),
            moves: HELP_EXTENDED_COMMANDS_MOVES,
        }],
    }, 'help extended-commands recipe');
}

export async function runHelpExtendedCommandsMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help default extended-command list',
            recipe: loadHelpExtendedCommandsRecipe(),
        }],
        summaryLabel: 'HELP EXTENDED COMMANDS',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpExtendedCommandsMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help extended commands: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
