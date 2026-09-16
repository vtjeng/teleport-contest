#!/usr/bin/env node

// Fresh production witness for uhitm.c mhitm_ad_blnd(): wizard.c
// wiz_genesis() creates a raven through the ordinary named-species path,
// the hero attacks it to start the real combat turn, and a rest turn reaches
// the raven's AD_BLND claw. The recipe deliberately uses a new seed, clock,
// character, and input sequence rather than the seed4500 holdout.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BLINDED, TIMEOUT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { heroIsBlind } from '../js/startup_a11y.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/uhitm.c/mhitm-ad-blnd-fresh.session.json',
    import.meta.url,
);

export function loadUhitmMhitmAdBlndRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyUhitmMhitmAdBlndSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    assert.equal(
        replay.getScreens().length,
        segment.moves.length + 1,
        'fresh raven-blinding segment reached its final key',
    );
    assert.equal(heroIsBlind(game), true, 'the raven reached AD_BLND');
    assert.ok(
        (game.u.uprops?.[BLINDED]?.intrinsic ?? 0) & TIMEOUT,
        'the fresh monster attack set temporary blindness',
    );
}

export async function runUhitmMhitmAdBlndMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'uhitm mhitm ad blnd',
            recipe: loadUhitmMhitmAdBlndRecipe(),
        }],
        summaryLabel: 'UHITM MHITM AD BLND',
        chunkLimit: 1,
        verifySegment: verifyUhitmMhitmAdBlndSegment,
    });
}

runMatrixCli(
    import.meta.url,
    runUhitmMhitmAdBlndMatrix,
    'uhitm mhitm ad blnd',
);
