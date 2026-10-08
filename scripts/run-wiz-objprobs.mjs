#!/usr/bin/env node
// Newly chosen C-first seeds and clocks cover complete table paging, repeated
// invocation, a different role/depth and the ordinary-play wizard admission.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { OBJ_NAME, TOPAZ } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['ordinary', 'deep', 'nonwizard'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-objprobs-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(n => recipe(n).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    assert.equal(screens.filter(s => s.includes('%): arrow')).length, name === 'nonwizard' ? 0 : 2,
        'two command entries start at the source FIRST_OBJECT');
    assert.equal(screens.filter(s => s.includes('%): splash of acid venom')).length,
        name === 'nonwizard' ? 0 : 2, 'both tables reach the final named source object');
    assert.ok(!screens.at(-1).includes('%):'), 'final dismissal restores the map');
    assert.equal(game.context.move, 0, 'source ECMD_OK leaves no pending command turn');
    if (name === 'nonwizard') {
        assert.ok(screens.some(s => s.includes('#wizobjprobs: unknown extended command.')),
            'source WIZMODECMD admission excludes ordinary play');
    } else {
        assert.equal(game.u.uz.dlevel, name === 'deep' ? 5 : 1,
            'source variation prints the live table after a level change');
        assert.ok(screens.some(s => s.includes(String(game.objects[TOPAZ].oc_prob).padStart(4)
            + ' / 1000') && s.includes('%): ' + OBJ_NAME(game.objects[TOPAZ], game))),
        'table uses initialized canonical object probability/name state');
    }
}
export async function runWizObjprobsMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD OBJECT PROBABILITIES', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizObjprobsMatrix, 'wizcmds.c object probabilities');
