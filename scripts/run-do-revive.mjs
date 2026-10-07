#!/usr/bin/env node
// Independent do.c revival witnesses, including the two location variations
// and failed bag-of-holding callback. Every input comes from checked-in recipes.
import { readFileSync } from 'node:fs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const REVIVAL_CASES = [
    'b123-troll-inventory-timeout',
    'b123-troll-wielded-timeout',
    'b123-troll-floor-timeout',
    'b123-troll-sack-timeout',
    'b123-troll-floor-sack-timeout',
    'b123-troll-holding-failure',
    'b123-rider-tinning-floor',
    'b123-rider-eating-protected',
];

export function loadRevivalRecipes() {
    return REVIVAL_CASES.map(name => ({ name, recipe: validateCleanRecipe(
        JSON.parse(readFileSync(new URL(`../recipes/do.c/${name}.session.json`,
            import.meta.url), 'utf8')), name,
    ) }));
}

export async function runRevivalMatrix() {
    return runFreshMatrix({
        entries: loadRevivalRecipes().map(({ name, recipe }) => ({
            label: name, recipe,
        })),
        summaryLabel: 'DO.C REVIVAL',
        chunkLimit: 1, // Debug recorder segments retain their individual locks.
    });
}

runMatrixCli(import.meta.url, runRevivalMatrix, 'do.c revival');
