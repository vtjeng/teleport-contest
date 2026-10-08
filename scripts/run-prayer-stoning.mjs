#!/usr/bin/env node
// Independent C-first prayer cure and no-stoning transition boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STONED, TIMEOUT } from '../js/const.js';
import { find_delayed_killer } from '../js/end.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['limber', 'limber-variation', 'limber-outside'];
function recipe(name) {
    const url = new URL(`../recipes/pray.c/prayer-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'the input identifies an independently chosen prayer route');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/pray.c/prayer-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    const limber = replay.getScreens().some(screen => screen.includes('You feel more limber.'));
    assert.equal(limber, name !== 'limber-outside',
        'pray.c:383 prints the cure only when in_trouble selects TROUBLE_STONED');
    assert.equal(game.u.uprops[STONED].intrinsic & TIMEOUT, 0,
        'make_stoned clears the timeout before subsequent elapsed turns');
    assert.equal(find_delayed_killer(STONED, game), null,
        'the cured condition leaves no delayed petrification killer');
    assert.ok(replay.getScreens().some(screen => screen.includes('finish your prayer.')),
        'the ordinary delayed prayer_done entry runs in every case');
}
export function runPrayerStoningMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'PRAYER PETRIFICATION CURE', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runPrayerStoningMatrix, 'prayer petrification cure');
