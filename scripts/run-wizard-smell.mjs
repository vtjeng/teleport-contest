#!/usr/bin/env node

// C-first runtime routes for whole wizcmds.c:wiz_smell. Typed # dispatch
// covers recognized odor and an incapable form; a configured/count key
// selects empty floor and returns ECMD_CANCEL. C retains every pager/cursor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_PAPER_GOLEM } from '../js/monsters.js';
import { compareSessionOutputs, validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CASES = ['barbarian', 'bound-empty', 'golem'];

function loadRecipe(name) {
    const path = new URL(`../recipes/wizcmds.c/wizard-smell-${name}.session.json`,
        import.meta.url);
    return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
}

async function verifySegment(segment) {
    const name = CASES.find(name => segment.nethackrc.includes(`name:Smell${name},`));
    let boundary;
    const replay = await runSegment(segment, { onBoundary: error => { boundary = error; } });
    if (boundary) throw boundary;
    const recording = JSON.parse(readFileSync(new URL(
        `../recordings/wizcmds.c/wizard-smell-${name}.session.json`, import.meta.url,
    ), 'utf8'));
    const comparison = compareSessionOutputs(recording, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const screens = replay.getScreens();
    const cScreens = recording.segments[0].steps.map(step => step.screen);
    const reached = name === 'barbarian' ? 'You smell body odor.'
        : name === 'bound-empty' ? "You don't smell any monster there."
            : 'You are incapable of detecting odors in your present form.';
    assert.ok(screens.some(screen => screen.includes(reached)));
    assert.ok(cScreens.some(screen => screen.includes(reached)));
    if (name === 'golem') {
        assert.equal(game.youmonst.data, game.mons[PM_PAPER_GOLEM]);
        assert.ok(!screens.some(screen => screen.includes('Pick a monster to smell.')));
    }
    // All preceding setup commands are wizard commands or unknown spaces.
    // C initializes moves at one; neither smell's guard nor cancel adds time.
    assert.equal(game.moves, 1);
    assert.equal(game.multi, 0);
    assert.equal(Boolean(game.context.move), false);
}

export function runWizardSmellMatrix() {
    return runFreshMatrix({
        entries: CASES.map(name => ({ label: `wizard smell ${name}`, recipe: loadRecipe(name) })),
        summaryLabel: 'WIZARD SMELL', chunkLimit: 1, verifySegment,
    });
}

runMatrixCli(import.meta.url, runWizardSmellMatrix, 'wizard smell');
