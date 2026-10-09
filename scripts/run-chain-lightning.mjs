#!/usr/bin/env node
// Independent inputs were fixed before JS comparison. Seeds19234011–14
// distinguish forced roles/targets from a learned Wizard spell entry.
// The incidental-fox variation remains blocked on topl.c:update_topl
// immediate new-message painting and is excluded from the passing matrix.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SPE_CHAIN_LIGHTNING } from '../js/objects.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
export const CHAIN_LIGHTNING_CASES = [
    'forced-resistant', 'forced-vulnerable', 'learned-wizard',
];
export function loadChainLightningRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/spell.c/chain-lightning-${name}-independent.session.json`, import.meta.url,
    )));
}
export async function verifyChainLightningSegment(input) {
    const name = CHAIN_LIGHTNING_CASES.find(n => loadChainLightningRecipe(n).segments[0].seed === input.seed);
    const gold = JSON.parse(readFileSync(new URL(
        `../recordings/spell.c/chain-lightning-${name}-independent.session.json`, import.meta.url,
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
    assert.equal(game.tmp_at_stack.length, 0, 'beam temporary glyph frame is closed');
    assert.equal(game.context.forcefight, 0, 'source wakeup bracket restores forcefight');
    const frames = replay.getAnimationFramesByStep().flat();
    assert.ok(frames.length >= 4, 'initial wave plus source wave/final delays');
    if (name === 'learned-wizard') {
        assert.ok(game.svs.spl_book.some(book => book.sp_id === SPE_CHAIN_LIGHTNING));
        assert.ok(game.u.uen < game.u.uenmax, 'ordinary successful cast spends energy');
        assert.ok(replay.getScreens().some(screen => screen.includes('Choose which spell to cast')));
    } else {
        assert.ok(replay.getScreens().some(screen => screen.includes('Cast which spell?')));
    }
    if (name === 'forced-resistant') assert.ok(replay.getScreens().some(screen => screen.includes('resists.')));
    if (name === 'forced-vulnerable')
        assert.ok(replay.getScreens().some(screen => /You (shock|kill)/.test(screen)));
    return comparison;
}
export function runChainLightningMatrix() {
    return runFreshMatrix({
        entries: CHAIN_LIGHTNING_CASES.map(name => ({ label: name, recipe: loadChainLightningRecipe(name) })),
        verifySegment: verifyChainLightningSegment,
        summaryLabel: 'CHAIN LIGHTNING', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runChainLightningMatrix, 'chain lightning');
