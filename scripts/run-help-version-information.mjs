#!/usr/bin/env node

// Record and replay the default help menu through version information. The
// case dismisses both text pages and reaches the restored command boundary.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const HELP_VERSION_MOVES = '?a  ';

function nethackrc() {
    return [
        'OPTIONS=name:Ada,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpVersionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches version information without
            // turn-dependent setup. The fixed date cannot change build text.
            seed: 918_273,
            datetime: '20371117080910',
            nethackrc: nethackrc(),
            moves: HELP_VERSION_MOVES,
        }],
    }, 'help version-information recipe');
}

export async function runHelpVersionMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help version information',
            recipe: loadHelpVersionRecipe(),
        }],
        summaryLabel: 'HELP VERSION INFORMATION',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpVersionMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help version information: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
