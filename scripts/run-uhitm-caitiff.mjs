#!/usr/bin/env node

// Fresh production witness for uhitm.c check_caitiff() (331-347), reached
// through find_roll_to_hit()'s first-attack arm. The case is a new lawful
// Knight on an independently selected wizard-mode D:2 arrival; seed 9650044
// puts a hostile wood nymph asleep beside the arrival square, so the final
// `u` is an actual attack rather than a synthetic call or a copied holdout
// input.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/uhitm.c/knightly-caitiff-wood-nymph-fresh.session.json',
    import.meta.url,
);

export function loadUhitmCaitiffRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyUhitmCaitiffSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    // attrib.c adjalign() receives -1 after the message and updates the
    // lawful Knight's record; no other action in this one-segment recipe
    // changes alignment.
    assert.equal(
        game.u.ualign.record,
        9,
        'fresh Knight attack did not apply the C caitiff penalty',
    );
    assert.ok(
        replay.getScreens().length > 0,
        'fresh Knight attack did not reach a screen boundary',
    );
}

export async function runUhitmCaitiffMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'uhitm Knight caitiff',
            recipe: loadUhitmCaitiffRecipe(),
        }],
        summaryLabel: 'UHITM KNIGHT CAITIFF',
        chunkLimit: 1,
        verifySegment: verifyUhitmCaitiffSegment,
    });
}

runMatrixCli(import.meta.url, runUhitmCaitiffMatrix, 'uhitm Knight caitiff');
