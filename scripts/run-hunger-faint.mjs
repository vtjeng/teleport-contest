#!/usr/bin/env node
// eat.c newuhs/unfaint witnesses. Seeds/roles/clocks were fixed before C-only
// preparation; no seed scan. A hunger ring accelerates ordinary depletion,
// and class genocide keeps initial attackers and corpse revivals from turning
// the wait into combat. The role variation changes starting attributes and
// equipment; its independent seed changes fainting and wakeup RNG. Each
// starvation gate reads that hero's Constitution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { NOT_HUNGRY } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
const CASES = ['lifesaving', 'valkyrie'];
function recipe(name) {
    const url = new URL(`../recipes/eat.c/hunger-faint-starvation-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name);
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/eat.c/hunger-faint-starvation-${name}.session.json`, import.meta.url), 'utf8'));
    const screens = recording.segments[0].steps.map(step => step.screen);
    assert.ok(screens.some(screen => screen.includes('You faint from lack of food.')));
    assert.ok(screens.some(screen => screen.includes('You regain consciousness.')));
    assert.ok(screens.some(screen => screen.includes('You die from starvation.')));
    assert.ok(screens.some(screen => screen.includes('You dream that you feel much better!')));
    assert.equal(game.uamul, null, 'source life saving consumed the worn amulet');
    assert.equal(game.u.umortality, 1, 'one starvation was survived');
    assert.equal(game.u.uhs, NOT_HUNGRY);
    assert.ok(game.u.uhunger > 0 && game.u.uhp > 0);
    assert.equal(game.multi, 0, 'live delayed action and recovery completed');
}
export async function runHungerFaintMatrix() {
    return runFreshMatrix({ entries: CASES.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'HUNGER FAINT', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runHungerFaintMatrix, 'eat.c hunger faint');
