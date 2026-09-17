#!/usr/bin/env node

// Replay fresh production entries for end.c's life-saving amulet arm. Each
// debug recipe runs in its own recorder chunk because the reference leaves a
// debug save behind when a segment ends.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE_PATHS = [
    '../recipes/end.c/lifesaved-amulet-wizard-independent.session.json',
    '../recipes/end.c/lifesaved-amulet-tourist-variation.session.json',
    '../recipes/end.c/lifesaved-amulet-monster-independent.session.json',
];

function loadRecipe(path) {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

export function loadEndLifesavedRecipes() {
    return RECIPE_PATHS.map(loadRecipe);
}

export async function verifyEndLifesavedSegment(segment) {
    await runSegment(segment);
    assert.equal(game.uamul, null, 'the life-saving amulet is consumed');
    assert.ok(game.gamelog.some((entry) => (
        entry.text.startsWith('averted death (')
    )), 'done() records the life-saving event');
    // The monster witness continues into a second lethal attack after the
    // first reprieve. Its final debug death query leaves negative HP, while
    // the event above proves the monster-damage arm ran. The direct-damage
    // witnesses end immediately after the reprieve and must restore HP.
    if (!segment.moves.includes('\u0007minotaur')) {
        assert.ok(game.u.uhp > 0, 'the amulet reprieve restores positive HP');
    }
}

export async function runEndLifesavedMatrix() {
    return runFreshMatrix({
        entries: loadEndLifesavedRecipes().map((recipe, index) => ({
            label: index === 0
                ? 'end.c life-saving Wizard'
                : index === 1
                    ? 'end.c life-saving Tourist variation'
                    : 'end.c life-saving monster damage',
            recipe,
        })),
        summaryLabel: 'END.C LIFE-SAVING',
        verifySegment: verifyEndLifesavedSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runEndLifesavedMatrix, 'end.c life-saving');
