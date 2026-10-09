#!/usr/bin/env node
// Independent C-first seeds exercise Death's melee entry, debug recovery,
// polymorph loss, and the arch-lich spell entry. The wood-golem variation
// returns to human form before the owned touch; stone golem reaches it poly'd.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const cases = ['ranger', 'tourist-low-hp', 'wood-golem', 'stone-golem', 'spell-tourist'];
function recipe(name) {
    const url = new URL(`../recipes/mcastu.c/death-touch-${name}.session.json`, import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(url, 'utf8')), url.pathname);
}
async function verifySegment(segment) {
    const name = cases.find(name => recipe(name).segments[0].seed === segment.seed);
    assert.ok(name, 'each independent recipe identifies its source entry');
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/mcastu.c/death-touch-${name}.session.json`, import.meta.url), 'utf8'));
    const compared = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(compared.passed, true, JSON.stringify(compared));
    const steps = recording.segments[0].steps;
    if (name === 'spell-tourist') {
        assert.ok(steps.some(step => step.rng.some(draw => draw.includes('mcast_death_touch'))),
            'C mcast_spell reaches the death spell chance through castmu');
        assert.ok(replay.getScreens().some(screen => screen.includes('using the touch of death!')));
        assert.ok(replay.getScreens().some(screen => screen.includes("Lucky for you, it didn't work!")));
    } else {
        const touchStep = steps.findIndex(step => step.rng.some(draw => draw.includes('touch_of_death')));
        assert.ok(touchStep >= 0, 'Death melee calls the shared d(8,6) damage owner');
        assert.ok(replay.getScreens().some(screen => screen.includes('You feel drained...')));
        if (name === 'stone-golem') {
            assert.ok(steps.slice(touchStep).some(step => step.screen.includes('You return to human form!')),
                'C touch sets mh=0 before the form return');
            assert.equal(game.u.umonnum, game.u.umonster,
                'the canonical rehumanize call completes on live state');
        }
        assert.equal(game.killer.name, '',
            'a returning touch clears the killer after HP loss or debug recovery');
    }
    assert.equal(game.unported.has('mcastu.c touch_of_death'), false);
    assert.equal(game.unported.has('mcastu.c mcast_death_touch'), false);
}
export function runDeathTouchMatrix() {
    return runFreshMatrix({ entries: cases.map(name => ({ label: name, recipe: recipe(name) })),
        summaryLabel: 'MONSTER DEATH TOUCH', chunkLimit: 1, verifySegment });
}
runMatrixCli(import.meta.url, runDeathTouchMatrix, 'monster Death touch');
