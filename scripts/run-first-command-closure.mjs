#!/usr/bin/env node

// Run the checked-in broad first-command matrix through the strict fresh C
// differential. Recipes remain replay-input-only; every invocation records a
// new C result in an isolated temporary workspace.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    validateCleanRecipe,
} from './diff-fresh.mjs';
import {
    chunkRecipe,
    RECORDER_SEGMENT_LIMIT,
    runFreshMatrix,
    runMatrixCli,
} from './fresh-matrix.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

export {
    chunkRecipe,
    RECORDER_SEGMENT_LIMIT,
};

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

export function loadClosureRecipe(filename) {
    const path = join(FIXTURE_DIR, filename);
    const recipe = JSON.parse(readFileSync(path, 'utf8'));
    return validateCleanRecipe(recipe, path);
}

function segmentLabel(segment) {
    return /(?:^|[=,])name:([^,\n]+)/u.exec(segment.nethackrc)?.[1]
        ?? `seed ${segment.seed}`;
}

function assertFirstCommandBoundary(segment, replay) {
    const label = segmentLabel(segment);
    if (game.program_state?.in_moveloop !== 1) {
        throw new Error(`${label} stopped before entering moveloop`);
    }
    if (game.moves !== 1 || game.context?.move !== 0) {
        throw new Error(`${label} executed a gameplay turn before stopping`);
    }
    if (game._commandDispatchCount !== 0) {
        throw new Error(`${label} dispatched a command before stopping`);
    }
    const rows = game.nhDisplay.grid.map(
        (row) => row.map(({ ch }) => ch).join(''),
    );
    if (rows.some((row) => row.includes('--More--'))) {
        throw new Error(`${label} stopped at a --More-- prompt`);
    }
    if (game.context?.pendingCommand) {
        throw new Error(
            `${label} reached an unsupported gameplay command`,
        );
    }
    const expectedBoundaries = [...segment.moves].length + 1;
    if (replay.getCursors().length !== expectedBoundaries) {
        throw new Error(
            `${label} did not consume exactly its startup dismissal keys`,
        );
    }
}

export async function verifyFirstCommandBoundary(segment) {
    const replay = await runSegment(segment);
    assertFirstCommandBoundary(segment, replay);
}

export async function traceFirstCommandThemeroomSelections(segment) {
    const replay = await runSegment(segment, {
        traceThemeroomSelections: true,
    });
    assertFirstCommandBoundary(segment, replay);
    return replay.getThemeroomSelections();
}

export async function runFirstCommandClosureMatrix() {
    return runFreshMatrix({
        entries: FIRST_COMMAND_CLOSURE_FIXTURES.map((filename) => ({
            label: filename,
            recipe: loadClosureRecipe(filename),
        })),
        summaryLabel: 'FIRST-COMMAND CLOSURE',
        verifySegment: verifyFirstCommandBoundary,
    });
}

runMatrixCli(import.meta.url, runFirstCommandClosureMatrix, 'first-command closure');
