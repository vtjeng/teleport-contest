#!/usr/bin/env node

// Run the checked-in first-complete-turn matrix through fresh C recordings.
// The recorder retains one live game lock per segment, so reuse the established
// ten-segment chunk boundary from the first-command closure runner.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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

runMatrixCli(import.meta.url, runFirstCompleteTurnMatrix, 'first complete turn');
