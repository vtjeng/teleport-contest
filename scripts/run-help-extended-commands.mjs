#!/usr/bin/env node

// Record and replay the default help menu through the initial extended-
// command list. The case dismisses all six menu pages and reaches the
// restored map through the next command boundary.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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

runMatrixCli(import.meta.url, runHelpExtendedCommandsMatrix, 'help extended commands');
