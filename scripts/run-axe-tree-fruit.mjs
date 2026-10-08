#!/usr/bin/env node

// Independent C-first axe occupation variations for dig.c:dig480–481.
// The selected v28 case covers fruit creation; both independent routes take
// the no-fruit arm, with ordinary effort and one-callback effort variants.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ROOM } from '../js/const.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// Each C recipe chooses its race before comparison. The human setup finishes
// three trees; the ordinary orc setup finishes one longer occupation.
const CASES = [['human', 3], ['orc', 1]];

function loadRecipe(race) {
    const path = new URL(`../recipes/dig.c/axe-tree-${race}.session.json`,
        import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

async function verifySegment(segment) {
    const [race, trees] = CASES.find(([race]) =>
        segment.nethackrc.includes(`race:${race},`));
    let boundary;
    const replay = await runSegment(segment, {
        onBoundary(error) { boundary = error; },
    });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/dig.c/axe-tree-${race}.session.json`, import.meta.url,
    ), 'utf8'));
    const comparison = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const cRng = recording.segments[0].steps.flatMap(step => step.rng);
    const fruitGates = cRng.filter(line => /rn2\(5\).*dig\(dig.c:480\)/u.test(line));
    assert.equal(fruitGates.length, trees);
    assert.ok(fruitGates.every(line => !line.startsWith('rn2(5)=0')));
    assert.ok(!cRng.some(line => line.includes('rnd_treefruit_at(')));
    // The hero chops west from the east square. Source clears the former
    // tree flags before either fruit result, then finishes the occupation.
    const floor = game.level.at(game.u.ux - 1, game.u.uy);
    assert.equal(floor.typ, ROOM);
    assert.equal(floor.flags, 0);
    assert.equal(game.go.occupation, null);
    assert.equal(game.context.digging.level.dlevel, -1);
    assert.ok(replay.getScreens().some(screen => screen.includes('You cut down the tree.')));
}

export function runAxeTreeFruitMatrix() {
    return runFreshMatrix({
        entries: CASES.map(([race]) => ({ label: `axe tree ${race}`, recipe: loadRecipe(race) })),
        summaryLabel: 'AXE TREE', chunkLimit: 1, verifySegment,
    });
}

runMatrixCli(import.meta.url, runAxeTreeFruitMatrix, 'axe tree');
