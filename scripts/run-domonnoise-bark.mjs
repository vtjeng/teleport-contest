#!/usr/bin/env node

// Run the reusable ordinary-monster chat case through a fresh C recording.
// The recipe contains replay inputs only; runFreshMatrix() records the
// reference output in an isolated temporary workspace.
//
// The entry point is sounds.c dochat() -> domonnoise() MS_BARK. The Priest
// role and seed are independent of the exposed holdout case, and the leading
// space dismisses the Priest startup message before #chat is typed.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { MS_BARK } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LITTLE_DOG } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadDomonnoiseBarkRecipe() {
    return JSON.parse(readFileSync(
        new URL('../recipes/sounds.c/domonnoise-bark.session.json', import.meta.url),
        'utf8',
    ));
}

function findPet(state) {
    for (let mon = state.level?.monlist; mon; mon = mon.nmon)
        if (mon.mtame) return mon;
    return null;
}

export async function verifyDomonnoiseBarkSegment(segment) {
    await runSegment(segment);
    const pet = findPet(game);
    assert.ok(pet, 'the recipe must start with a pet');
    assert.equal(pet.data, game.mons[PM_LITTLE_DOG]);
    assert.equal(pet.data.msound, MS_BARK);
    assert.equal(game._ttyToplines, 'The little dog barks.');
}

export async function runDomonnoiseBarkMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'domonnoise MS_BARK',
            recipe: loadDomonnoiseBarkRecipe(),
        }],
        summaryLabel: 'DOMONNOISE MS_BARK',
        verifySegment: verifyDomonnoiseBarkSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runDomonnoiseBarkMatrix, 'domonnoise bark');
