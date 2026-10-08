#!/usr/bin/env node
// Independent source cases. Seeds 1483001–1483064 were selected before JS
// comparison; the special-mover seed scan and input corrections are retained
// in recipe comments. No challenge or fixed-workload inputs are reused.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_LONG_WORM } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = ['piercer-fall', 'lurker-fall', 'mimic-discovery',
    'trapper-discovery', 'large-mimic-discovery', 'long-worm-tail',
    'engulfed-reattack', 'mounted-rat-redirect', 'pet-melee-conflict',
    'priest-temple-adjacent', 'shopkeeper-blind', 'pet-ranged-dog', 'piercer-hit'];
function load(root, name) {
    const owner = name === 'long-worm-tail' ? 'worm.c' : 'mhitu.c';
    return JSON.parse(readFileSync(new URL(
        `../${root}/${owner}/mattacku-${name}.session.json`, import.meta.url), 'utf8'));
}
async function verify(input, name) {
    const reference = load('recordings', name).segments[0];
    let boundary;
    const result = await runSegment({ ...input, recorderIsDst: reference.recorderIsDst },
        { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.equal(result.getScreens().length, reference.steps.length);
    if (name === 'engulfed-reattack') {
        assert.ok(game.u.uswallow, 'second attack enters the swallowed mover route');
        assert.ok(game.u.ustuck, 'swallowed target remains the engulfing monster');
    }
    if (name === 'mounted-rat-redirect')
        assert.ok(game.u.usteed, 'source mount setup reaches the steed redirection arm');
    if (name === 'long-worm-tail') {
        let worm;
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            if (mon.mnum === PM_LONG_WORM) worm = mon;
        assert.ok(worm?.wormno);
        const segments = game.level.worms[worm.wormno].segments;
        assert.ok(segments.length > 1, 'visible tail precedes the hidden head node');
        assert.deepEqual(segments.at(-1), { x: worm.mx, y: worm.my });
    }
    if (name === 'pet-ranged-dog') {
        let tame = false;
        for (let mon = game.level.monlist; mon; mon = mon.nmon)
            tame ||= mon.mtame > 0;
        assert.ok(tame, 'confused pet ranged selection retains pet ownership');
    }
}
export async function runMattackuMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name,
        recipe: validateCleanRecipe(load('recipes', name), name) })),
    summaryLabel: 'MONSTER HERO ATTACK', chunkLimit: 1,
    verifySegment: async input => {
        const name = cases.find(value => load('recipes', value).segments[0].seed === input.seed);
        assert.ok(name);
        await verify(input, name);
    } });
}
runMatrixCli(import.meta.url, runMattackuMatrix, 'monster hero attack');
