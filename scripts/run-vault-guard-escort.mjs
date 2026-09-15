#!/usr/bin/env node

// Replay the independent vault.c gd_move_cleanup() witness through a fresh C
// recording and the production monster-turn caller.  The route enters a
// vault, drops its gold, follows the peaceful guard out, and reaches the
// source's final disappearance message through monmove.c:m_move().

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/vault.c/guard-cleanup-fresh-sage.session.json',
    import.meta.url,
);

export function loadVaultGuardEscortRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyVaultGuardEscortSegment(segment) {
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.match(
        game.nhDisplay?.toplines ?? '',
        /Suddenly, the guard disappears\./,
        'gd_move_cleanup reaches its awaited disappearance message',
    );
    return replay;
}

export function runVaultGuardEscortMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'vault guard cleanup',
            recipe: loadVaultGuardEscortRecipe(),
        }],
        summaryLabel: 'VAULT GUARD CLEANUP',
        verifySegment: verifyVaultGuardEscortSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runVaultGuardEscortMatrix,
    'vault guard cleanup',
);
