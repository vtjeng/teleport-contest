#!/usr/bin/env node
// Independent were.c:you_unwere production entries and cheap food variation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NON_PM } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_WERERAT } from '../js/monsters.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = ['wolfsbane', 'wolfsbane-variation', 'water-purify', 'water-beast',
    'vapor', 'prayer', 'engineer', 'expiry'];
function recipe(name) {
    const url = new URL(`../recipes/were.c/unwere-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'the recipe identifies its independently chosen runtime entry');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/were.c/unwere-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    const screens = replay.getScreens().join('\n');
    assert.equal(game.unported?.has('were.c you_unwere') ?? false, false);
    if (['wolfsbane', 'wolfsbane-variation', 'water-purify', 'prayer'].includes(name)) {
        assert.match(screens, /You feel purified\./u);
        assert.equal(game.u.ulycn, NON_PM, 'you_unwere(true) cures infection');
    } else if (name === 'water-beast') {
        assert.match(screens, /Your affinity to wererats disappears!/u);
        assert.match(screens, /You return to human form!/u);
        assert.equal(game.u.ulycn, NON_PM, 'peffect_water clears infection after reversion');
    } else if (name === 'vapor') {
        assert.match(screens, /clear potion boils and explodes!/u);
        assert.match(screens, /You return to human form!/u);
        assert.equal(game.u.ulycn, PM_WERERAT, 'water vapor reverts without purifying');
        assert.notEqual(game.u.umonnum, PM_WERERAT);
    } else if (name === 'engineer') {
        assert.match(screens, /You feel a natural urge coming on\./u);
        assert.equal(game.u.umonnum, PM_WERERAT,
            'the nearby hostile blocks natural-urge reversion');
    } else {
        const cRng = recording.segments[0].steps.flatMap(step => step.rng ?? []);
        assert.ok(cRng.some(entry => /rn2\(200\)=\d+ @ you_unwere\(were.c:227\)/u.test(entry)),
            'C timed expiry reaches the retained-beast rn1(200,200) fallback');
        assert.equal(game.u.umonnum, PM_WERERAT);
        assert.ok(game.u.mtimedone > 0, 'the expired form clock is rearmed');
    }
}
export function runWereUnwereMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'LYCANTHROPY REMOVAL', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runWereUnwereMatrix, 'lycanthropy removal');
