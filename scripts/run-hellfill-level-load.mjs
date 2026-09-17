#!/usr/bin/env node

// Replay independently chosen level-generation routes through the complete
// dat/hellfill.lua port.  Each recipe selects a different Hellfill generator
// in C so this runner verifies the production loader and its random stream.
// The seeds were selected independently from the bounded range 82001..82028;
// chunkLimit: 1 keeps each fresh recorder segment bounded.

import { readFileSync } from 'node:fs';

import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/hellfill.lua/generator-1-independent-82016.session.json', import.meta.url),
    new URL('../recipes/hellfill.lua/generator-2-independent-82003.session.json', import.meta.url),
    new URL('../recipes/hellfill.lua/generator-3-independent-82005.session.json', import.meta.url),
    new URL('../recipes/hellfill.lua/generator-4-independent-82001.session.json', import.meta.url),
    new URL('../recipes/hellfill.lua/generator-5-independent-82002.session.json', import.meta.url),
    new URL('../recipes/hellfill.lua/generator-6-independent-82028.session.json', import.meta.url),
    new URL('../recipes/hellfill.lua/generator-7-independent-82008.session.json', import.meta.url),
];

export function loadHellfillRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Hellfill generator recipe ${index + 1}`,
    ));
}

export function runHellfillLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadHellfillRecipes().map((recipe, index) => ({
            label: `Hellfill generator ${index + 1} independent`,
            recipe,
        })),
        summaryLabel: 'HELLFILL LEVEL LOAD',
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runHellfillLevelLoadMatrix,
    'Hellfill level load',
);
