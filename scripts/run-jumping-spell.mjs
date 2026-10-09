#!/usr/bin/env node
// Independent C-first routes cover forced landing, cancellation, in-place,
// ordinary learned casting and apply.c jump's magical spell fallback.
import { readFileSync } from 'node:fs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const JUMPING_SPELL_CASES = ['adjacent', 'cancel', 'in-place', 'learned-fallback'];
export function loadJumpingSpellRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/spell.c/jumping-${name}-independent.session.json`, import.meta.url,
    )));
}
export async function runJumpingSpellMatrix() {
    return runFreshMatrix({
        entries: JUMPING_SPELL_CASES.map(name => ({
            label: name, recipe: loadJumpingSpellRecipe(name),
        })),
        summaryLabel: 'JUMPING SPELL', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runJumpingSpellMatrix, 'jumping spell callers');
