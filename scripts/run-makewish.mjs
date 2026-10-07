#!/usr/bin/env node
// Seeds were chosen independently before recording, without a seed scan.
// Role gloves, corpse species, and flesh-golem form vary the source safety gate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { CORPSE } from '../js/objects.js';
import { PM_COCKATRICE, PM_NEWT } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const cases = [
    ['makewish-unsafe-cockatrice', true, PM_COCKATRICE],
    ['makewish-gloved-cockatrice', false, PM_COCKATRICE],
    ['makewish-harmless-newt', false, PM_NEWT],
    ['makewish-flesh-golem-cockatrice', true, PM_COCKATRICE],
].map(([id, floor, species]) => ({ id, floor, species,
    recipe: JSON.parse(readFileSync(new URL(
        '../recipes/zap.c/' + id + '.session.json', import.meta.url))),
}));

export async function verifyWishPlacement(segment) {
    const { floor, species } = cases.find(c => c.recipe.segments[0].seed === segment.seed);
    await runSegment(segment);
    // zap.c:6401-6422 marks only unsafe corpses; invent.c consumes that marker
    // before dropping them. Safe corpses enter the inventory nobj chain.
    let found;
    for (let obj = floor ? game.level.objects[game.u.ux][game.u.uy] : game.invent;
        obj; obj = floor ? obj.nexthere : obj.nobj) {
        if (obj.otyp === CORPSE && obj.corpsenm === species) found = obj;
    }
    assert.ok(found, 'wished corpse reaches the source-selected object chain');
    assert.equal(found.wishedfor ?? 0, 0, 'hold_another_object consumes the safety marker');
    assert.equal(game.u.uconduct.wishes, 1); // Each recipe makes exactly one wish.
}

export async function runMakewishMatrix() {
    return runFreshMatrix({
        entries: cases.map(c => ({ label: c.id, recipe: c.recipe })),
        summaryLabel: 'MAKEWISH',
        verifySegment: verifyWishPlacement,
        chunkLimit: 1, // Debug termination saves; each case needs a fresh install.
    });
}
runMatrixCli(import.meta.url, runMakewishMatrix, 'makewish');
