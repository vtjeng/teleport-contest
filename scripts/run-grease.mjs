#!/usr/bin/env node
// Independent apply.c:use_grease charged and Glib slip caller witnesses.
import { readFileSync } from 'node:fs';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export async function runGreaseMatrix() {
    return runFreshMatrix({
        entries: [
            'grease-cursed-slip-independent',
            'grease-glib-slip-independent',
        ].map(name => ({ label: name, recipe: validateCleanRecipe(
            JSON.parse(readFileSync(new URL(
                `../recipes/apply.c/${name}.session.json`, import.meta.url),
            'utf8')), name,
        ) })),
        summaryLabel: 'APPLY.C GREASE SLIP',
        chunkLimit: 1, // Each private recorder segment retains a game lock.
    });
}

runMatrixCli(import.meta.url, runGreaseMatrix, 'apply.c grease slip');
