#!/usr/bin/env node
// Independent C-first display.c unmap_object engraving-memory routes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { engraving_to_glyph } from '../js/display.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = ['dust', 'dust-variation'];
function recipe(name) {
    const url = new URL(`../recipes/display.c/unmap-engraving-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'the segment has an independent source recipe');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/display.c/unmap-engraving-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    const engraving = game.head_engr;
    assert.ok(engraving, 'production engrave creates the target before forcefight');
    assert.equal(Boolean(engraving.erevealed), true, 'visible unmap_object reveals the engraving');
    const remembered = game.level.at(engraving.engr_x, engraving.engr_y).remembered_glyph;
    assert.equal(remembered.glyph, engraving_to_glyph(engraving, game),
        'empty forcefight preserves engraving memory rather than dark-room stone');
    assert.ok(replay.getScreens().some(screen => screen.includes('You attack thin air.')),
        'production forcefight passes map-memory restoration into the source message');
}
export function runEngravedForceFightMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'ENGRAVED FORCEFIGHT', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runEngravedForceFightMatrix, 'engraved forcefight');
