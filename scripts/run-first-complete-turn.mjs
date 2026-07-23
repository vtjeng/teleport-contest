#!/usr/bin/env node

// Run the checked-in first-complete-turn matrix through fresh C recordings.
// The recorder retains one live game lock per segment, so reuse the established
// ten-segment chunk boundary from the first-command closure runner.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatReport,
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';
import { chunkRecipe } from './run-first-command-closure.mjs';

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
    const chunks = chunkRecipe(loadFirstCompleteTurnRecipe());
    const totals = { segments: 0, rng: 0, screens: 0, cursors: 0 };

    for (let index = 0; index < chunks.length; ++index) {
        const chunk = chunks[index];
        process.stdout.write(
            `[first complete turn ${index + 1}/${chunks.length}] `
            + `${chunk.segments.length} segments\n`,
        );
        const result = await runDifferential(chunk);
        if (!result.passed) {
            process.stdout.write(formatReport(result));
            return { passed: false, totals };
        }
        totals.segments += chunk.segments.length;
        totals.rng += result.lengths.rng.c;
        totals.screens += result.lengths.screens.c;
        totals.cursors += result.lengths.cursors.c;
    }

    process.stdout.write(
        `FIRST COMPLETE TURN: PASS — ${totals.segments} segments, `
        + `${totals.rng} PRNG calls, ${totals.screens} screens, `
        + `${totals.cursors} cursors\n`,
    );
    return { passed: true, totals };
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
