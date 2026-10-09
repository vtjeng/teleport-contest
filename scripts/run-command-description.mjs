#!/usr/bin/env node
// Independent C-first pager command descriptions and required cmd owner paths.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['known-prefix-movement', 'extended', 'help-menu', 'keyhelp', 'keyhelp-question', 'number-pad', 'altmeta'];
function recipe(name) {
    const path = new URL(`../recipes/pager.c/command-description-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const name = names.find(name => recipe(name).segments[0].seed === segment.seed);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/pager.c/command-description-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, { rng: replay.getRngLog(),
        screens: replay.getScreens(), cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep() });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    const screens = replay.getScreens();
    assert.equal(screens.filter(screen => screen.includes("Ask about '&' or '?' to get more info.")).length, 1,
        'pager.c once-only introduction is not repeated by later queries');
    if (name === 'known-prefix-movement') {
        assert.ok(screens.some(screen => screen.includes('move west (screen left) (#movewest).')));
        assert.ok(screens.some(screen => screen.includes('non-movement prefix: request menu')));
    }
    if (name.startsWith('keyhelp')) assert.ok(screens.some(screen => screen.includes('some keystrokes may be off-limits.')));
    if (name === 'altmeta') {
        assert.ok(screens.some(screen => screen.includes("No such command 'M-q', char code 241 (0361 or 0xf1).")));
        assert.ok(screens.some(screen => screen.includes('(For ESC, type it twice.)')));
        assert.ok(screens.some(screen => screen.includes('cancel current prompt or pending prefix.')));
    }
}
export function runCommandDescriptionMatrix() {
    return runFreshMatrix({ entries: names.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'COMMAND DESCRIPTION', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runCommandDescriptionMatrix, 'command description');
