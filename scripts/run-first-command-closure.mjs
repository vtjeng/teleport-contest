#!/usr/bin/env node

// Run the checked-in broad first-command matrix through the strict fresh C
// differential. Recipes remain replay-input-only; every invocation records a
// new C result in an isolated temporary workspace.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatReport,
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = dirname(SCRIPT_PATH);
const FIXTURE_DIR = join(SCRIPT_DIR, 'fixtures');

export const FIRST_COMMAND_CLOSURE_FIXTURES = Object.freeze([
    'first-command-closure-roles.session.json',
    'first-command-closure-themes-1.session.json',
    'first-command-closure-themes-2.session.json',
    'first-command-closure-themes-3.session.json',
    'first-command-closure-themes-4.session.json',
]);

// Recorder runs stopped at the first command retain one live game lock per
// segment. The installed recorder accepts ten such segments before rejecting
// another, so run larger clean recipes in independent groups without changing
// their replay inputs.
export const RECORDER_SEGMENT_LIMIT = 10;

export function chunkRecipe(recipe, limit = RECORDER_SEGMENT_LIMIT) {
    validateCleanRecipe(recipe, 'first-command closure recipe');
    if (!Number.isInteger(limit) || limit < 1) {
        throw new Error('closure chunk limit must be a positive integer');
    }
    const chunks = [];
    for (let start = 0; start < recipe.segments.length; start += limit) {
        chunks.push({
            version: recipe.version,
            segments: recipe.segments.slice(start, start + limit),
        });
    }
    return chunks;
}

export function loadClosureRecipe(filename) {
    const path = join(FIXTURE_DIR, filename);
    const recipe = JSON.parse(readFileSync(path, 'utf8'));
    return validateCleanRecipe(recipe, path);
}

function segmentLabel(segment) {
    return /(?:^|[=,])name:([^,\n]+)/u.exec(segment.nethackrc)?.[1]
        ?? `seed ${segment.seed}`;
}

export async function verifyFirstCommandBoundary(segment) {
    const replay = await runSegment(segment);
    const label = segmentLabel(segment);
    if (game.program_state?.in_moveloop !== 1) {
        throw new Error(`${label} stopped before entering moveloop`);
    }
    if (game.moves !== 1 || game.context?.move !== 0) {
        throw new Error(`${label} executed a gameplay turn before stopping`);
    }
    const rows = game.nhDisplay.grid.map(
        (row) => row.map(({ ch }) => ch).join(''),
    );
    if (rows.some((row) => row.includes('--More--'))) {
        throw new Error(`${label} stopped at a --More-- prompt`);
    }
    const expectedBoundaries = [...segment.moves].length + 1;
    if (replay.getCursors().length !== expectedBoundaries) {
        throw new Error(
            `${label} did not consume exactly its startup dismissal keys`,
        );
    }
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const totals = { segments: 0, rng: 0, screens: 0, cursors: 0 };

    for (const filename of FIRST_COMMAND_CLOSURE_FIXTURES) {
        const recipe = loadClosureRecipe(filename);
        const chunks = chunkRecipe(recipe);
        for (let index = 0; index < chunks.length; ++index) {
            const chunk = chunks[index];
            for (const segment of chunk.segments) {
                await verifyFirstCommandBoundary(segment);
            }
            process.stdout.write(
                `[${filename} ${index + 1}/${chunks.length}] `
                + `${chunk.segments.length} segments\n`,
            );
            const result = await runDifferential(chunk);
            if (!result.passed) {
                process.stdout.write(formatReport(result));
                return 1;
            }
            totals.segments += chunk.segments.length;
            totals.rng += result.lengths.rng.c;
            totals.screens += result.lengths.screens.c;
            totals.cursors += result.lengths.cursors.c;
        }
    }

    process.stdout.write(
        `FIRST-COMMAND CLOSURE: PASS — ${totals.segments} segments, `
        + `${totals.rng} PRNG calls, ${totals.screens} screens, `
        + `${totals.cursors} cursors\n`,
    );
    return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `first-command closure: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
