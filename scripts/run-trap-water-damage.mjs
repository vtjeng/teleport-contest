#!/usr/bin/env node

// Record and replay an independent fountain dip that reaches trap.c
// water_damage() through fountain.c dipfountain(). The first Valkyrie item is
// a spear; dipping it into the nearby fountain takes water_damage()'s default
// erosion arm and proves the production caller, not just the exported helper.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { FOUNTAIN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = new URL(
    '../recipes/trap.c/water-damage-fountain-seed7710023.session.json',
    import.meta.url,
);

export function loadTrapWaterDamageRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE, 'utf8')),
        RECIPE.pathname,
    );
}

export async function verifyTrapWaterDamageSegment(segment) {
    let boundary;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.level.at(game.u.ux, game.u.uy).typ, FOUNTAIN,
        'the route ends on the fountain used by dipfountain()');
    const spear = game.invent;
    assert.equal(spear?.invlet, 'a',
        'the first inventory object is the dipped spear');
    assert.equal(spear?.oeroded, 1,
        'water_damage() reaches the default rust erosion arm');
    assert.equal(game._ttyToplines, 'Your spear rusts!',
        'dipfountain() reaches water_damage() in production');
}

export function runTrapWaterDamageMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'trap water damage fountain dip',
            recipe: loadTrapWaterDamageRecipe(),
        }],
        summaryLabel: 'TRAP WATER DAMAGE',
        verifySegment: verifyTrapWaterDamageSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runTrapWaterDamageMatrix,
    'trap water damage',
);
