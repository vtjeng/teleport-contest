#!/usr/bin/env node
// Independent C-first caller witnesses for dig.c:buried_ball_to_freedom().
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { OBJ_FLOOR, TT_BURIEDBALL } from '../js/const.js';
import { buried_ball } from '../js/dig.js';
import { game } from '../js/gstate.js';
import { NethackGame, runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const names = ['scroll', 'scroll-variation', 'bell', 'wallpass', 'unsolid', 'prayer'];
const entries = names.map(name => ({
    label: `buried-ball-freedom-${name}`,
    recipe: JSON.parse(readFileSync(new URL(
        `../recipes/dig.c/buried-ball-freedom-${name}.session.json`, import.meta.url))),
}));

async function verifyFreedom(segment) {
    let ball;
    let identity;
    let boundary;
    const install = NethackGame.prototype._installCaptureHook;
    NethackGame.prototype._installCaptureHook = function () {
        const result = install.call(this);
        const capture = game._preNhgetchHook;
        game._preNhgetchHook = async () => {
            await capture();
            if (!ball && game.u.utrap && game.u.utraptype === TT_BURIEDBALL) {
                ball = buried_ball({ x: game.u.ux, y: game.u.uy }, game);
                identity = ball?.o_id;
            }
        };
        return result;
    };
    try {
        await runSegment(segment, { onBoundary: error => { boundary = error; } });
    } finally {
        NethackGame.prototype._installCaptureHook = install;
    }
    assert.equal(boundary, undefined, 'the independent caller must finish');
    assert.ok(ball, 'the setup must reach source buried-ball attachment');
    assert.equal(game.u.utrap, 0, 'freedom resets the trap counter');
    assert.equal(game.uball, null, 'freedom does not restore punishment');
    assert.equal(game.uchain, null, 'the source unpunish/bury setup removes the chain');
    assert.equal(ball.where, OBJ_FLOOR, 'the same buried object returns to the floor');
    assert.equal(ball.o_id, identity, 'release preserves the C object identity');
    let inFloorChain = false;
    for (let obj = game.level.objlist; obj; obj = obj.nobj)
        inFloorChain ||= obj === ball;
    assert.ok(inFloorChain, 'release restores the level-wide floor index');
    let inPile = false;
    for (let obj = game.level.objects[ball.ox][ball.oy]; obj; obj = obj.nexthere)
        inPile ||= obj === ball;
    assert.ok(inPile, 'release restores the per-square floor index');
}

export function runBuriedBallFreedomMatrix() {
    return runFreshMatrix({
        entries,
        summaryLabel: 'buried ball freedom',
        verifySegment: verifyFreedom,
    });
}

runMatrixCli(import.meta.url, runBuriedBallFreedomMatrix, 'buried ball freedom');
