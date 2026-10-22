import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {game} from '../js/gstate.js';
import {runSegment} from '../js/jsmain.js';
import {zap_over_floor} from '../js/zap.js';
import {compareSessionOutputs, runJsSession} from './diff-fresh.mjs';

const recipe = JSON.parse(readFileSync(new URL(
    '../recipes/zap.c/cold-underwater-redraw.session.json', import.meta.url)));

test('cold resurfacing redraws and acknowledges the freeze message like live C', async () => {
    const recording = JSON.parse(readFileSync(new URL(
        '../recordings/zap.c/cold-underwater-redraw.session.json', import.meta.url)));
    assert.ok(recording.segments[0].steps.some(step =>
        step.screen.includes('The water freezes.--More--')));
    const replay = await runJsSession(recording, process.cwd());
    assert.equal(compareSessionOutputs(recording, replay).passed, true);
    assert.equal(Boolean(game.u.uinwater), false);
    assert.equal(game.unported.has('display.c docrt'), false);
});

test('cold resurfacing completes an injected redraw before scheduling vision recalculation', async () => {
    const segment = recipe.segments[0];
    let boundary;
    await runSegment({...segment, moves: segment.moves.slice(0, segment.moves.indexOf('zp>'))}, {
        onBoundary: error => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(Boolean(game.u.uinwater), true);
    game.vision_full_recalc = 0;
    let completed = false;
    await zap_over_floor(game.u.ux, game.u.uy, 2, {value: false}, true, 0,
        game, undefined, {
            norepMessage: async () => {},
            docrt: async state => {
                assert.equal(Boolean(state.u.uinwater), false);
                await Promise.resolve();
                assert.equal(state.vision_full_recalc, 0);
                completed = true;
            },
        });
    assert.equal(completed, true);
    assert.equal(game.vision_full_recalc, true);
});
