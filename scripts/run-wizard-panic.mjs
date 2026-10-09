#!/usr/bin/env node
// Independent C-first typed/rebound panic inputs exercise the existing
// paranoid line reader. Native positive panic remains outside this matrix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const WIZARD_PANIC_CASES = [
    'typed-no', 'typed-default', 'bound-escape', 'bound-confirm',
];
export function loadWizardPanicRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/wizcmds.c/wizard-panic-${name}-independent.session.json`,
        import.meta.url,
    )));
}
export async function verifyWizardPanicSegment(input) {
    const name = WIZARD_PANIC_CASES.find(n => loadWizardPanicRecipe(n).segments[0].seed === input.seed);
    const gold = JSON.parse(readFileSync(new URL(
        `../recordings/wizcmds.c/wizard-panic-${name}-independent.session.json`,
        import.meta.url,
    )));
    let boundary;
    const replay = await runSegment({ ...input, recorderIsDst: gold.segments[0].recorderIsDst }, {
        onBoundary(error) { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    const comparison = compareSessionOutputs(gold, {
        rng: replay.getRngLog(), screens: replay.getScreens(),
        cursors: replay.getCursors(), animFrames: replay.getAnimationFramesByStep(),
    });
    assert.equal(comparison.passed, true, JSON.stringify(comparison));
    const screens = replay.getScreens();
    assert.ok(screens.some(screen => screen.includes(
        'Do you want to call panic() and end your game?',
    )));
    if (name === 'bound-confirm') {
        assert.ok(screens.some(screen => screen.includes(
            '"Yes" or "No": Do you want to call panic()',
        )));
    }
    // All four C recipes begin with one ordinary wait from turn1. Panic
    // returns ECMD_OK, so both the positive count and time flag are cleared.
    assert.equal(game.moves, 2);
    assert.equal(game.multi, 0);
    assert.equal(Boolean(game.context.move), false);
    assert.equal(Boolean(game.program_state.gameover), false);
    assert.ok(!game.unported.has('end.c panic'));
}
export function runWizardPanicMatrix() {
    return runFreshMatrix({
        entries: WIZARD_PANIC_CASES.map(name => ({
            label: name, recipe: loadWizardPanicRecipe(name),
        })),
        verifySegment: verifyWizardPanicSegment,
        summaryLabel: 'WIZARD PANIC', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runWizardPanicMatrix, 'wizard panic');
