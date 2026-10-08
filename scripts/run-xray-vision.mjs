#!/usr/bin/env node
// Independent C-first vision.c:vision_recalc x-ray overlay witnesses.
// Normal and blind-from-birth P/R paths plus apply toggles reach the source
// artifact/worn callbacks, dirty-message flush, movement and removal redraws.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { on_level } from '../js/dungeon.js';
import { IN_SIGHT, SVALL } from '../js/const.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['eyes-wear-remove', 'eyes-born-blind', 'eyes-apply-toggle', 'eyes-rogue-level'];
function recipe(name) {
    const path = new URL(`../recipes/vision.c/${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => {
        const input = recipe(name).segments[0];
        return input.moves === segment.moves && input.nethackrc === segment.nethackrc;
    });
    assert.ok(name);
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/vision.c/${name}.session.json`, import.meta.url), 'utf8'));
    assert.equal(compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    }).passed, true);
    assert.equal(game.u.xray_range, -1, 'source artifact removal disables x-ray');
    assert.equal(game.ublindf, null);
    const steps = recording.segments[0].steps;
    assert.ok(steps.some(step => step.screen.includes('You are now wearing a pair of lenses')));
    assert.ok(steps.some(step => step.screen.includes('You were wearing a pair of lenses')));
    if (name === 'eyes-born-blind') {
        assert.ok(steps.some(step => step.screen.includes('For the first time in your life, you can see!')));
    }
    // Revisit the production prefix while Eyes remains worn. The C-selected
    // inventory letter and completed message pages are already in the recipe.
    const removeAt = name === 'eyes-apply-toggle'
        ? segment.moves.lastIndexOf('ak') : segment.moves.indexOf('R');
    await runSegment({ ...segment, moves: segment.moves.slice(0, removeAt) });
    assert.equal(game.u.xray_range, 3, 'artifact.c fixes the active radius at 3');
    assert.ok(game.ublindf);
    if (name === 'eyes-rogue-level') {
        assert.equal(on_level(game.u.uz, game.rogue_level), true,
            'the outside-limit input reaches the source Rogue guard');
        return;
    }
    let revealedBeyondLighting = false;
    for (let dy = -3; dy <= 3; ++dy)
        for (let dx = -3; dx <= 3; ++dx) {
            const x = game.u.ux + dx, y = game.u.uy + dy;
            const cell = game.level.at(x, y);
            if (cell && !cell.lit && Math.max(Math.abs(dx), Math.abs(dy)) > 1
                && (game.viz_array[y][x] & IN_SIGHT) && cell.seenv === SVALL)
                revealedBeyondLighting = true;
        }
    assert.equal(revealedBeyondLighting, true, 'the recorded route reaches x-ray beyond ordinary night vision');
}
export function runXrayVisionMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'XRAY VISION', chunkLimit: 1, verifySegment,
    });
}
runMatrixCli(import.meta.url, runXrayVisionMatrix, 'xray vision');
