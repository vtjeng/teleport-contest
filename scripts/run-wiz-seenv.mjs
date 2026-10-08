#!/usr/bin/env node
// Independent C-first seeds/roles/clocks cover seen-vector changes after a
// room step and retained vectors while blind. Both dismiss and repeat the
// blocking #wizseenv window; the C observations establish these two routes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const CASES = ['ordinary', 'blind'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-seenv-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    const windows = screens.filter(screen => screen.includes('@@'));
    assert.equal(windows.length, 2, 'C hero double-marker proves both command entries');
    assert.ok(windows.every(screen => screen.includes('--More--')),
        'source text windows block for dismissal');
    assert.ok(!screens.at(-1).includes('@@'), 'dismissal restored the ordinary map');
    assert.equal(game.context.move, 0, 'ECMD_OK leaves no command turn pending');
    if (name === 'blind') {
        assert.ok(game.ublindf, 'source put-on command retains the blindfold');
        assert.equal(windows[0], windows[1], 'blind wait retains the source seen vectors');
    } else {
        assert.notEqual(windows[0], windows[1], 'room step changes the source seen vectors');
    }
}
export async function runWizSeenvMatrix() {
    return runFreshMatrix({ entries: CASES.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD SEEN VECTORS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizSeenvMatrix, 'wizcmds.c wizard seen vectors');
