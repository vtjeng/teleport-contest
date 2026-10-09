#!/usr/bin/env node
// Independent options.c:optfn_fruit live feedback and silent route controls.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const entries = [
    // Full menu prints after mutation; simple and startup paths skip it.
    ['full-feedback', 'dragonberry', true],
    ['simple-silent', 'snowberry', false],
    // initoptions_finish singularizes the configured plural before insertion.
    ['startup-silent', 'moonberry', false],
];
function recipe(name) {
    const path = new URL(`../recipes/options.c/fruit-option-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const entry = entries.find(([name]) => recipe(name).segments[0].seed === segment.seed);
    assert.ok(entry);
    const [name, fruit, feedback] = entry;
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.svp.pl_fruit, fruit);
    assert.equal(replay.getScreens().some(screen => screen.includes('Fruit is now')), feedback);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/options.c/fruit-option-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
}
export function runFruitOptionFeedbackMatrix() {
    return runFreshMatrix({ entries: entries.map(([name]) => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'FRUIT OPTION FEEDBACK', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runFruitOptionFeedbackMatrix, 'fruit option feedback');
