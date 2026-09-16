#!/usr/bin/env node

// Record independent wizard quaffs through potion.c's production dispatch.
// Each recipe supplies only a replay input; runFreshMatrix() records a fresh
// C trace before comparing the JavaScript run, so the three BUC branches are
// checked with the same strict screens, cursors, RNG, and input exhaustion.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { POT_EXTRA_HEALING } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE_NAMES = Object.freeze([
    'extra-healing-blessed-independent.session.json',
    'extra-healing-uncursed-independent.session.json',
    'extra-healing-cursed-independent.session.json',
    'extra-healing-timed-blind-independent.session.json',
    'extra-healing-timed-blind-variation.session.json',
]);

export function loadExtraHealingRecipes() {
    return RECIPE_NAMES.map((name) => ({
        label: `extra healing ${name
            .replace(/\.session\.json$/u, '')
            .replace(/^extra-healing-/u, '')
            .replaceAll('-', ' ')}`,
        recipe: validateCleanRecipe(JSON.parse(readFileSync(new URL(
            `../recipes/potion.c/${name}`,
            import.meta.url,
        ), 'utf8')), `extra healing recipe ${name}`),
    }));
}

export async function verifyExtraHealingSegment(input) {
    let boundary;
    const result = await runSegment(input, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(result._inputExhausted, true);
    assert.ok(result.getScreens().length > 0);
    assert.equal(game.unported.has('potion.c peffect_extra_healing'), false);
    // The final state is the common production post-quaff state. The strict
    // differential below supplies the BUC-specific output and RNG evidence.
    assert.equal(game.u.uhp, game.u.uhpmax);
    for (let object = game.invent; object; object = object.nobj)
        assert.notEqual(object.otyp, POT_EXTRA_HEALING,
            'quaffing consumed the wished-for extra healing potion');
}

export async function runExtraHealingMatrix() {
    return runFreshMatrix({
        entries: loadExtraHealingRecipes(),
        summaryLabel: 'POTION EXTRA HEALING',
        verifySegment: verifyExtraHealingSegment,
        // Debug mode leaves recorder saves behind; isolate each recipe.
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runExtraHealingMatrix,
    'potion extra healing',
);
