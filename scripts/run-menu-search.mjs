#!/usr/bin/env node
// Independent C-first TTY menu-search prompt flush and ordinary getlin exit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const cases = ['petrifying', 'telepathy', 'outside'];
function recipe(name) {
    const url = new URL(`../recipes/wintty.c/menu-search-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'the segment has an independently recorded source route');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/wintty.c/menu-search-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    assert.equal(game.nhDisplay.inread, 0, 'getlin restores the tty input-read counter');
    const screens = replay.getScreens();
    if (name === 'outside') {
        assert.ok(screens.some(screen => screen.includes('What do you want to call this dungeon level?')),
            'dungeon.c donamelevel enters ordinary windows.c getlin outside a menu');
    } else {
        const prompts = screens.filter(screen => screen.startsWith('Search for:'));
        assert.ok(prompts.length > 1, 'source MENU_SEARCH keeps its rows throughout typing');
        assert.ok(prompts.every(screen => screen.split('\n').slice(1).some(row => row.includes('['))),
            'PICK_ANY intrinsic choices remain below WIN_MESSAGE during the search');
    }
}
export function runMenuSearchMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'MENU SEARCH PROMPT', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runMenuSearchMatrix, 'menu-search prompt');
