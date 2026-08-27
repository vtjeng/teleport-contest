#!/usr/bin/env node

// Record and replay the default help menu through its standalone menu-control
// page. The case dismisses the text window and reaches the next command.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// `l` selects domenucontrols(); one space dismisses its single text page, and
// the final wait crosses the next command boundary without consuming RNG.
export const HELP_MENU_CONTROLS_MOVES = '?l .';

function nethackrc() {
    return [
        'OPTIONS=name:Katherine,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpMenuControlsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches menu-control help without
            // turn-dependent setup. The fixed date cannot alter its rows.
            seed: 319_427,
            datetime: '20430405060708',
            nethackrc: nethackrc(),
            moves: HELP_MENU_CONTROLS_MOVES,
        }],
    }, 'help menu-controls recipe');
}

export async function runHelpMenuControlsMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help standalone menu controls',
            recipe: loadHelpMenuControlsRecipe(),
        }],
        summaryLabel: 'HELP MENU CONTROLS',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runHelpMenuControlsMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`help menu controls: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
