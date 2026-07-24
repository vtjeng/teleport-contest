#!/usr/bin/env node

// Run the checked-in first-complete-turn matrix through fresh C recordings.
// The recorder retains one live game lock per segment, so reuse the established
// ten-segment chunk boundary from the first-command closure runner.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);

export const FIRST_COMPLETE_TURN_FIXTURE = join(
    SCRIPT_DIR,
    'fixtures',
    'first-complete-turn.session.json',
);

export function loadFirstCompleteTurnRecipe() {
    const recipe = JSON.parse(
        readFileSync(FIRST_COMPLETE_TURN_FIXTURE, 'utf8'),
    );
    return validateCleanRecipe(recipe, FIRST_COMPLETE_TURN_FIXTURE);
}

export async function runFirstCompleteTurnMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'first complete turn',
            recipe: loadFirstCompleteTurnRecipe(),
        }],
        summaryLabel: 'FIRST COMPLETE TURN',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runFirstCompleteTurnMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `first complete turn: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
