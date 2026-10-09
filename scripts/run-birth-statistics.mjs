#!/usr/bin/env node
// Seeds, clocks and roles were chosen before C/JS comparison. C-only probes
// established the wished scroll's slot o and both identification pagers;
// Knight uses its default pony because C rejects pettype:pony.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeScreen, renderCell } from '../frozen/screen-decode.mjs';
import { G_GENOD } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LICHEN, PM_PONY } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['startup', 'genocide', 'ordinary'];
function recipe(name) {
    const url = new URL(`../recipes/insight.c/wizard-birth-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const screens = replay.getScreens().map(screen => decodeScreen(screen)
        .map(row => row.map(renderCell).join('')).join('\n'));
    const windows = screens.filter(screen => screen.startsWith('died born'));
    assert.equal(game.context.move, 0, 'the diagnostic or excluded command uses no turn');
    if (name === 'ordinary') {
        assert.equal(game.wizard, false);
        assert.equal(windows.length, 0, 'WIZMODECMD excludes the source owner');
        assert.ok(screens.some(screen => screen.includes('#wizborn: unknown extended command.')));
        return;
    }
    assert.equal(windows.length, 2, 'C records both diagnostic invocations and dismissals');
    assert.equal(windows[0], windows[1], 'the intervening wait leaves these source vitals unchanged');
    assert.ok(!screens.at(-1).includes('died born'), 'the text owner restored the ordinary map');
    assert.ok(windows.every(screen => screen.includes('--More--')), 'tty NHW_TEXT waits for dismissal');
    if (name === 'startup') {
        assert.equal(game.svm.mvitals[PM_PONY].born, 1, 'Knight default makedog creates one pony');
        assert.ok(windows[0].includes('   0    1   pony'));
    } else {
        const vital = game.svm.mvitals[PM_LICHEN];
        assert.ok(vital.mvflags & G_GENOD, 'the real scroll dispatcher genocided lichen');
        assert.equal(vital.born, 2, 'C recorded one natural and one independently created lichen');
        assert.equal(vital.died, 2, 'the genocide sweep removed both live lichens');
        assert.ok(windows[0].includes('   2    2 G lichen'));
    }
}
export async function runBirthStatisticsMatrix() {
    return runFreshMatrix({ entries: CASES.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'WIZARD BIRTH STATISTICS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runBirthStatisticsMatrix, 'insight.c birth statistics');
