#!/usr/bin/env node
// Independently chosen roles, seeds and clocks cover the fixed glyph-range
// diagnostic twice per wizard game and ordinary-play command admission.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['ordinary', 'ranger', 'nonwizard'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-display-macros-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    assert.equal(screens.filter(s => s.includes('No display macro issues detected.')).length,
        name === 'nonwizard' ? 0 : 2, 'each wizard command traverses the complete compiled glyph range');
    assert.ok(!screens.at(-1).includes('No display macro issues detected.'),
        'source text dismissal restores the map');
    assert.equal(game.context.move, 0, 'ECMD_OK leaves no pending command turn');
    if (name === 'nonwizard') assert.ok(screens.some(s => s.includes('#wizdispmacros: unknown extended command.')),
        'ordinary play is excluded by the source wizard registry flag');
}
export async function runWizDisplayMacrosMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD DISPLAY MACROS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizDisplayMacrosMatrix, 'wizcmds.c display macros');
