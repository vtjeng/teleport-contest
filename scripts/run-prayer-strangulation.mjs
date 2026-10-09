#!/usr/bin/env node
// Independent C-first prayer consumption and nonmatching-amulet boundary.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STRANGLED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { AMULET_OF_REFLECTION, AMULET_OF_STRANGULATION } from '../js/objects.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['consume', 'consume-cursed', 'outside-reflection'];
function recipe(name) {
    const url = new URL(`../recipes/pray.c/prayer-strangulation-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = names.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'the seed identifies an independently planned case');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/pray.c/prayer-strangulation-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    const vanishes = replay.getScreens().some(screen => screen.includes('Your amulet vanishes!'));
    const breathes = replay.getScreens().some(screen => screen.includes('You can breathe again.'));
    const expectedCure = name !== 'outside-reflection';
    assert.equal(vanishes, expectedCure, 'pray.c:390 announces only the matching worn amulet');
    assert.equal(breathes, expectedCure, 'the independent reflection case has no strangulation trouble');
    assert.equal(game.u.uprops[STRANGLED].intrinsic, 0,
        'the consumed-amulet route reaches the final source property clear');
    assert.equal(game.uamul?.otyp ?? null, expectedCure ? null : AMULET_OF_REFLECTION,
        'useup clears the consumed slot; the outside-limit amulet remains worn');
    for (let obj = game.invent; obj; obj = obj.nobj) {
        assert.notEqual(obj.otyp, AMULET_OF_STRANGULATION,
            'both consumed amulets are absent from the canonical inventory chain');
    }
    assert.ok(replay.getScreens().some(screen => screen.includes('finish your prayer.')),
        'all cases execute the delayed production prayer entry');
    assert.equal(game.unported.has('invent.c useup'), false,
        'the restored caller does not retain its obsolete gap');
}
export function runPrayerStrangulationMatrix() {
    return runFreshMatrix({
        entries: names.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'PRAYER STRANGULATION AMULET', chunkLimit: 1, verifySegment,
    });
}
runMatrixCli(import.meta.url, runPrayerStrangulationMatrix, 'prayer strangulation');
