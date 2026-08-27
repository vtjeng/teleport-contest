#!/usr/bin/env node

// Record and replay the default help menu through its whatis target. The case
// cancels the nested whatis menu and crosses the following command boundary.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const HELP_MENU_WHATIS_MOVES = '?e\x1b.';

function nethackrc() {
    return [
        'OPTIONS=name:Hypatia,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpMenuShellRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches a normal, sighted Wizard's
            // default help menu without any turn or RNG-dependent setup. The
            // fixed date is arbitrary because neither menu reads the clock.
            seed: 73519,
            datetime: '20360203040506',
            nethackrc: nethackrc(),
            moves: HELP_MENU_WHATIS_MOVES,
        }],
    }, 'help menu shell recipe');
}

export async function runHelpMenuShellMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help menu shell and whatis target',
            recipe: loadHelpMenuShellRecipe(),
        }],
        summaryLabel: 'HELP MENU SHELL',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpMenuShellMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help menu shell: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
