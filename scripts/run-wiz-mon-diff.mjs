#!/usr/bin/env node
// Independently chosen C-first roles, seeds and clocks exercise complete
// difficulty reports twice and ordinary-play command admission.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { mstrength } from '../js/mondata.js';
import { NEUTRAL } from '../js/const.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['ordinary', 'ranger', 'nonwizard'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-mon-diff-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    const reports = screens.filter(s => s.includes('Review of monster difficulty ratings'));
    assert.equal(reports.length, name === 'nonwizard' ? 0 : 2, 'two complete wizard report entries');
    assert.ok(!screens.at(-1).includes('Review of monster difficulty ratings'), 'final dismissal restores the map');
    assert.equal(game.context.move, 0, 'source ECMD_OK leaves no pending command turn');
    if (name === 'nonwizard') {
        assert.ok(screens.some(s => s.includes('#wizmondiff: unknown extended command.')),
            'ordinary play fails source wizard command admission');
    } else {
        const mismatches = game.mons.filter(s => s.mlet && s.difficulty !== mstrength(s));
        assert.deepEqual(mismatches.map(s => s.pmnames[NEUTRAL]), ['cleric', 'wizard'],
            'current source catalog has exactly these two hardcoded formula discrepancies');
        assert.ok(reports.every(s => s.includes('calculated: 13, hardcoded: 12 (-1)')),
            'source neutral names and signed difference are visible');
    }
}
export async function runWizMonDiffMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD MONSTER DIFFICULTY', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizMonDiffMatrix, 'wizcmds.c monster difficulty');
