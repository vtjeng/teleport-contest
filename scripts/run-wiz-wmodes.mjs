#!/usr/bin/env node
// Independent C-first characters and clocks cover repeated wall-mode text
// windows and ordinary-play rejection of the wizard-only command.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['ordinary', 'ranger', 'nonwizard'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-wmodes-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens(), windows = screens.filter(s => s.includes('xxxxxxxx'));
    assert.equal(windows.length, name === 'nonwizard' ? 0 : 2,
        'C first records two text entries in wizard mode, zero otherwise');
    assert.ok(windows.every(s => s.includes('--More--')), 'blocking source text window');
    assert.ok(!screens.at(-1).includes('xxxxxxxx'), 'dismissal restores ordinary glyph rendering');
    assert.equal(game.context.move, 0, 'ECMD_OK leaves no pending command turn');
    if (name === 'nonwizard') assert.ok(screens.some(s => s.includes('#wmode: unknown extended command.')),
        'existing wizard admission precedes the source helper');
}
export async function runWizWmodesMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD WALL MODES', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizWmodesMatrix, 'wizcmds.c wizard wall modes');
