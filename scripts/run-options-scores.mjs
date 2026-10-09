#!/usr/bin/env node
// Independent C-first options.c:optfn_scores startup/live/value request routes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { game } from '../js/gstate.js';
import { optionValue } from '../js/options.js';
import { allopt } from '../js/optlist_data.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const entries = [
    // Source t/a/o setters and separators, then menu GET_VAL.
    ['live-counts', [7, 4, true], '7 top/4 around/own'],
    // Startup config sets all parts; the live none token clears all of them.
    ['live-none', [0, 0, false], 'none'],
    // Inner no-/! and zero-own clear values written earlier in the same call.
    ['live-inner-negation', [0, 0, false], 'none'],
    // atoi narrows to int; only the positive around count is formatted.
    ['live-signed-counts', [-2147483648, 2, false], '2 around'],
    // letter() includes @; only initial letters choose the target field.
    ['live-letter-suffix', [2, 5, true], '2 top/5 around/own'],
];
function recipe(name) {
    const path = new URL(`../recipes/options.c/scores-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const entry = entries.find(([name]) => recipe(name).segments[0].seed === segment.seed);
    assert.ok(entry, 'every segment has an independently selected branch expectation');
    const [name, expected, shown] = entry;
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.deepEqual([game.flags.end_top, game.flags.end_around, game.flags.end_own], expected);
    assert.equal(optionValue(game, allopt.find(row => row.name === 'scores')), shown);
    assert.equal(game.unported?.has('cfgfiles.c config_erradd') ?? false, false);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/options.c/scores-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
}
export function runOptionsScoresMatrix() {
    return runFreshMatrix({ entries: entries.map(([name]) => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'SCORES OPTION REQUESTS', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runOptionsScoresMatrix, 'scores option requests');
