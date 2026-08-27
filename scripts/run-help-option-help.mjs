#!/usr/bin/env node

// Record and replay the default help menu through its generated option-help
// page. The case dismisses every text page and reaches the restored map.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// option_help() emits 114 lines in this build. TTY displays 23 lines per page,
// so five spaces dismiss its five pages after `g` selects the help-menu target.
export const HELP_OPTION_MOVES = `?g${' '.repeat(5)}`;

function nethackrc() {
    return [
        'OPTIONS=name:Grace,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpOptionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches dynamic option help without
            // turn-dependent setup. The fixed date cannot alter option text.
            seed: 481_517,
            datetime: '20410203040506',
            nethackrc: nethackrc(),
            moves: HELP_OPTION_MOVES,
        }],
    }, 'help option-help recipe');
}

export async function runHelpOptionMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help generated option page',
            recipe: loadHelpOptionRecipe(),
        }],
        summaryLabel: 'HELP OPTION PAGE',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpOptionMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help option page: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
