#!/usr/bin/env node

// Run the checked-in second-complete-turn matrix through fresh C recordings.
// Recipe segments contain replay inputs only; each run records new reference
// output in an isolated temporary workspace.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    validateCleanRecipe,
} from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);

export const SECOND_COMPLETE_TURN_FIXTURE = join(
    SCRIPT_DIR,
    'fixtures',
    'second-complete-turn.session.json',
);

export function loadSecondCompleteTurnRecipe() {
    const recipe = JSON.parse(
        readFileSync(SECOND_COMPLETE_TURN_FIXTURE, 'utf8'),
    );
    return validateCleanRecipe(recipe, SECOND_COMPLETE_TURN_FIXTURE);
}

export async function runSecondCompleteTurnMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'second complete turn',
            recipe: loadSecondCompleteTurnRecipe(),
        }],
        summaryLabel: 'SECOND COMPLETE TURN',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runSecondCompleteTurnMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `second complete turn: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
