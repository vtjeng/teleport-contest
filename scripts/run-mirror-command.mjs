#!/usr/bin/env node

// Independent C-first evidence for apply.c use_mirror()'s reflected-Medusa
// killed() caller and the getdir cancellation immediately outside that path.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_MEDUSA } from '../js/monsters.js';
import { STATUE } from '../js/objects.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['medusa', 'medusa-variation', 'cancel'];

function recipe(name) {
    const path = new URL(`../recipes/apply.c/mirror-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

async function verifySegment(segment) {
    const name = CASES.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'the matrix segment has a committed independent recipe');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/apply.c/mirror-${name}.session.json`, import.meta.url), 'utf8'));
    const result = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(Boolean(game.gs.stoned), false, 'xkilled resets the shared stoned flag');
    assert.ok(!game.unported.has('mon.c killed'), 'use_mirror reaches the canonical death owner');
    const livingMedusa = game.level.monsters.flat().find(mon =>
        mon?.data === game.mons[PM_MEDUSA] && mon.mhp > 0);
    const statues = game.level.objects.flat().flatMap(head => {
        const pile = [];
        for (let obj = head; obj; obj = obj.nexthere) pile.push(obj);
        return pile;
    }).filter(obj => obj.otyp === STATUE && obj.corpsenm === PM_MEDUSA);
    if (name === 'cancel') {
        assert.ok(livingMedusa, 'canceled getdir leaves the selected monster alive');
        assert.equal(statues.length, 0, 'no stone-kill was attempted');
        assert.equal(game.u.uconduct.killer, 0, 'canceling grants no kill credit');
        assert.equal(game.moves, 1, 'the canceled apply command spends no turn');
        return;
    }
    assert.equal(livingMedusa, undefined, 'the killed monster leaves the map');
    assert.equal(statues.length, 1, 'monstone creates one Medusa statue');
    assert.equal(game.u.uconduct.killer, 1, 'killed credits the hero once');
    assert.equal(game.u.ulevel, 2, 'Medusa experience raises the starting hero one level');
    assert.ok(game.u.uexp > 0);
    for (const message of ['Medusa is turned to stone!', 'You kill Medusa!']) {
        assert.ok(replay.getScreens().some(screen => screen.includes(message)));
        assert.ok(recording.segments[0].steps.some(step => step.screen.includes(message)));
    }
}

export function runMirrorCommandMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `mirror ${name}`, recipe: recipe(name) })),
        summaryLabel: 'MIRROR COMMAND', chunkLimit: 1, verifySegment,
    });
}

runMatrixCli(import.meta.url, runMirrorCommandMatrix, 'mirror command');
