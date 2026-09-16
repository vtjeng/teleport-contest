#!/usr/bin/env node

// Fresh production witness for dothrow.c thitmonst()'s final nonweapon arm.
// The wizard creates a hostile soldier ant adjacent to the hero, then throws
// a scroll west. C's final tmiss() arm leaves the object in transit, so
// throwit() must continue through breaktest() and the ordinary floor tail.

import assert from 'node:assert/strict';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { SCR_MAGIC_MAPPING } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEGMENT = {
    seed: 551234,
    datetime: '20350917112233',
    nethackrc: [
        'OPTIONS=name:ThrowFresh,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,playmode:debug',
        '',
    ].join('\n'),
    moves: ' \x07soldier ant\nthh ',
};

export function loadDothrowThitmonstFreshRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [SEGMENT],
    }, 'dothrow thitmonst fresh recipe');
}

export async function verifyDothrowThitmonstFreshSegment(segment) {
    let boundary = null;
    await runSegment(segment, { onBoundary: (error) => { boundary = error; } });
    assert.equal(boundary, null);

    // The h slot is the scroll of magic mapping in this independently chosen
    // wizard setup. A successful source tail consumes it from inventory after
    // tmiss(), then places it on the floor at bhitpos.
    let stillCarried = false;
    for (let obj = game.invent; obj; obj = obj.nobj)
        stillCarried ||= obj.otyp === SCR_MAGIC_MAPPING;
    assert.equal(stillCarried, false);
    assert.equal(game.gt?.thrownobj ?? null, null);
}

export async function runDothrowThitmonstFreshMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'fresh thitmonst final miss',
            recipe: loadDothrowThitmonstFreshRecipe(),
        }],
        summaryLabel: 'DOTHROW THITMONST FRESH',
        verifySegment: verifyDothrowThitmonstFreshSegment,
    });
}

runMatrixCli(
    import.meta.url,
    runDothrowThitmonstFreshMatrix,
    'dothrow thitmonst fresh',
);
