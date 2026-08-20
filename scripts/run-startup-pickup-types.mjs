#!/usr/bin/env node

// Record and replay the startup pickup_types option through its first real
// reader, the Ctrl-X attributes window.  The configuration uses two distinct
// class symbols so order is visible in insight.c's autopickup line, then
// Escape dismisses that window and ':' supplies the following command-input
// boundary.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20340417101500';

export function loadStartupPickupTypesRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 8734019,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:Typewright,role:Valkyrie,race:human,'
                    + 'gender:female,align:lawful',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,autopickup,'
                    + 'pickup_types:)%',
                '',
            ].join('\n'),
            moves: '\x18\x1b:',
        }],
    }, 'startup pickup_types recipe');
}

export async function runStartupPickupTypesMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup pickup_types to attributes',
            recipe: loadStartupPickupTypesRecipe(),
        }],
        summaryLabel: 'STARTUP PICKUP_TYPES',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupPickupTypesMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup pickup_types: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
