#!/usr/bin/env node
// Seeds/roles/clocks were fixed before C recording. Ordinary vision and the
// blindfold variation exercise different canonical bit combinations; both
// repeat the command after a turn and dismiss its blocking text window.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { IN_SIGHT } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const CASES = ['ordinary', 'blind'];
function recipe(name) {
    const url = new URL('../recipes/wizcmds.c/wizard-vision-' + name + '.session.json', import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens();
    assert.equal(screens.filter(screen => screen.includes('Flags: 0x1 could see')).length, 2,
        'source text window was reached twice');
    assert.ok(!screens.at(-1).includes('Flags:'), 'dismissal restored the map');
    assert.equal(game.context.move, 0, 'ECMD_OK leaves no command turn pending');
    if (name === 'blind') {
        assert.ok(game.ublindf, 'source put-on command retains the blindfold');
        assert.ok(game.viz_array.every(row => row.every(bits => !(bits & IN_SIGHT))),
            'blind vision retains no IN_SIGHT bits');
        assert.ok(game.viz_array.some(row => row.some(bits => bits)),
            'COULD_SEE bits survive blindness');
    }
}
export async function runWizVisionMatrix() {
    return runFreshMatrix({ entries: CASES.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD VISION', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWizVisionMatrix, 'wizcmds.c wizard vision');
