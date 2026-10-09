#!/usr/bin/env node
// Independent C-first inputs pin apply.c:use_candle's consumed y_n byte.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BURN_OBJECT, LS_OBJECT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { CANDELABRUM_OF_INVOCATION, WAX_CANDLE, TALLOW_CANDLE } from '../js/objects.js';
import { compareSessionOutputs } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const CANDLE_ATTACHMENT_CASES = [
    'explicit-no-wax', 'default-space-tallow',
    'escape-single-wax', 'positive-yes-wax',
];
export function loadCandleAttachmentRecipe(name) {
    return JSON.parse(readFileSync(new URL(
        `../recipes/apply.c/candle-attachment-${name}-independent.session.json`,
        import.meta.url,
    )));
}
export async function verifyCandleAttachmentSegment(input) {
    const name = CANDLE_ATTACHMENT_CASES.find(n =>
        loadCandleAttachmentRecipe(n).segments[0].seed === input.seed);
    assert.ok(name, 'the matrix verifier receives a declared C-first case');
    const gold = JSON.parse(readFileSync(new URL(
        `../recordings/apply.c/candle-attachment-${name}-independent.session.json`,
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
    assert.ok(screens.some(screen => screen.includes('Attach your')));
    const inventory = [];
    for (let obj = game.invent; obj; obj = obj.nobj) inventory.push(obj);
    const candelabrum = inventory.find(obj => obj.otyp === CANDELABRUM_OF_INVOCATION);
    const candles = inventory.filter(obj => [WAX_CANDLE, TALLOW_CANDLE].includes(obj.otyp));
    assert.ok(candelabrum);
    const timers = [];
    for (let timer = game.gt.timer_base; timer; timer = timer.next) timers.push(timer);
    const lights = [];
    for (let light = game.gl.light_base; light; light = light.next) lights.push(light);
    assert.equal(Boolean(candelabrum.lamplit), false);
    if (name === 'positive-yes-wax') {
        // The positive variation wishes and attaches two unlit wax candles;
        // apply.c consumes their stack without starting a burn timer/light.
        assert.equal(candelabrum.spe, 2);
        assert.equal(candles.length, 0);
        assert.ok(!timers.some(timer => timer.func_index === BURN_OBJECT));
        assert.equal(lights.length, 0);
        assert.ok(screens.some(screen => screen.includes('You attach 2 candles')));
    } else {
        // apply.c's no branch returns through use_lamp, before attachment.
        assert.equal(candelabrum.spe, 0);
        assert.equal(candles.length, 1);
        const candle = candles[0];
        // C wishes produce stacks of 3 wax, 5 tallow, and 2 wax respectively;
        // the last wish requests one but readobjnam keeps its generated pair.
        const quantities = { 'explicit-no-wax': 3, 'default-space-tallow': 5, 'escape-single-wax': 2 };
        assert.equal(candle.quan, quantities[name]);
        assert.equal(Boolean(candle.lamplit), true);
        assert.ok(timers.some(timer => timer.func_index === BURN_OBJECT && timer.arg === candle));
        assert.ok(lights.some(light => light.type === LS_OBJECT && light.id === candle));
        assert.ok(!lights.some(light => light.id === candelabrum));
        assert.ok(screens.some(screen => screen.includes("Your candles' flames burn brightly!")));
    }
    return comparison;
}
export function runCandleAttachmentMatrix() {
    return runFreshMatrix({
        entries: CANDLE_ATTACHMENT_CASES.map(name => ({
            label: name, recipe: loadCandleAttachmentRecipe(name),
        })),
        verifySegment: verifyCandleAttachmentSegment,
        summaryLabel: 'CANDLE ATTACHMENT', chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runCandleAttachmentMatrix, 'candle attachment');
