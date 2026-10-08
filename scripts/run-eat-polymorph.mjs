#!/usr/bin/env node

// Independent C-first evidence for eat.c:cpostfx's polymorph-food caller.
// Purple-worm delayed digestion remains a blocked animation recipe; this
// matrix claims only immediate tin/corpse entries and the Unchanging guard.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['tin', 'tin-genetic', 'corpse', 'unchanging'];
function recipe(name) {
    const path = new URL(`../recipes/eat.c/polymorph-food-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}
async function verifySegment(segment) {
    const name = CASES.find(name => {
        const entry = recipe(name).segments[0];
        return entry.seed === segment.seed && entry.moves === segment.moves;
    });
    assert.ok(name, 'each evidence segment belongs to its independent recipe');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/eat.c/polymorph-food-${name}.session.json`, import.meta.url), 'utf8'));
    assert.equal(compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    }).passed, true);
    assert.equal(game.unported.has('polyself.c polyself'), false);
    // Only polymon increments this conduct. Both tin seeds enter newman;
    // the corpse becomes a human mummy, and Unchanging skips the call.
    assert.equal(game.u.uconduct.polyselfs, name === 'corpse' ? 1 : 0);
    // C's svc.context.tin is NULL after early tin consumption, and was
    // NULL at the corpse entry. The port shares the same canonical context.
    assert.equal(game.context.tin.tin, null);
    const steps = recording.segments[0].steps;
    assert.ok(steps.some(step => step.screen.includes(name === 'unchanging'
        ? 'You feel momentarily different.' : name === 'tin-genetic'
            ? 'You undergo a freakish metamorphosis.'
            : 'You feel a change coming over you.')));
    if (name !== 'unchanging')
        assert.ok(steps.some(step => step.rng?.some(call =>
            call.includes('polyself(polyself.c:490)'))));
    if (name === 'tin-genetic')
        assert.ok(steps.some(step => step.screen.includes('You feel like a new man!')),
            'the role variation reaches successful newman and hunger refresh');
    if (name === 'corpse')
        assert.ok(steps.some(step => step.screen.includes('You finish eating the chameleon corpse.')),
            'the corpse completes through the occupation before cpostfx');
}
export function runEatPolymorphMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `polymorph food ${name}`, recipe: recipe(name) })),
        summaryLabel: 'POLYMORPH FOOD', chunkLimit: 1, verifySegment,
    });
}
runMatrixCli(import.meta.url, runEatPolymorphMatrix, 'polymorph food');
