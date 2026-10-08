#!/usr/bin/env node
// eat.c:cpostfx -> hack.c:unmul -> eatmdone. The seed was chosen before
// comparing JS. Varying small/large mimic meat changes C's disguise duration
// from 20 to 40 turns while keeping the blindfold setup fixed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { M_AP_NOTHING, M_AP_OBJECT } from '../js/const.js';
import { eatmdone } from '../js/eat.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { GOLD_PIECE } from '../js/objects.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPES = [
    'recipes/eat.c/mimic-tin-blind.session.json',
    'recipes/eat.c/mimic-large-tin-blind.session.json',
];
async function verifyRestoration(segment) {
    let boundary;
    // The 64th input acknowledges the consumption message. C next displays
    // the temptation More page with the disguise and callback still active.
    await runSegment({ ...segment, moves: segment.moves.slice(0, 64) }, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.equal(game.youmonst.m_ap_type, M_AP_OBJECT);
    assert.equal(game.youmonst.mappearance, GOLD_PIECE);
    assert.equal(game.afternmv, eatmdone);
    assert.ok(game.eatmbuf);
    assert.equal(game.nomovemsg, game.eatmbuf);
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, undefined);
    assert.ok(replay.getScreens().some((screen) =>
        screen.includes('You now prefer mimicking a human again.')),
    'the production unmul callback must execute, not just a completed input sequence');
    assert.equal(game.eatmbuf, null);
    assert.equal(game.nomovemsg, null);
    assert.equal(game.afternmv, null);
    assert.equal(game.multi, 0);
    assert.equal(game.youmonst.m_ap_type, M_AP_NOTHING);
    assert.equal(game.youmonst.mappearance, GOLD_PIECE,
        'eatmdone clears the type, preserving C mappearance');
}
export async function runMimicRestorationMatrix() {
    return runFreshMatrix({
        entries: RECIPES.map((path) => ({
            label: path,
            recipe: JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url))),
        })),
        verifySegment: verifyRestoration,
        summaryLabel: 'MIMIC RESTORATION',
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runMimicRestorationMatrix, 'mimic restoration');
