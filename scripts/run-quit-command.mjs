#!/usr/bin/env node

// Record the #quit cancellation path against the patched C reference, then
// replay the same inputs through the JavaScript port.
//
// The leading and trailing waits make a wrongly spent quit visible in the
// next compared frame. The `n` answer exercises done2()'s cleanup arm, so the
// accepted path remains at the existing done(QUIT) boundary.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';
const WAIT = '.';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "quit" names end.c done2().
export const QUIT_COMMAND = '#quit\n';
// cmd.c paranoid_query() accepts `n` as the default cancellation answer.
export const NO = 'n';

export function loadQuitCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This seed is independent of the development session and has no
            // setup dependency: the case reaches #quit on the starting level.
            seed: 9141001,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:Quitter,role:Valkyrie,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics',
                '',
            ].join('\n'),
            // done2() asks "Really quit without saving?" after the extended
            // command line; `n` reaches its prompt cleanup and returns
            // ECMD_OK, while the final wait demonstrates that no quit turn
            // was charged.
            moves: `${WAIT}${QUIT_COMMAND}${NO}${WAIT}`,
        }],
    }, 'quit command recipe');
}

export async function runQuitCommandMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: '#quit cancellation',
            recipe: loadQuitCommandRecipe(),
        }],
        summaryLabel: 'QUIT COMMAND',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runQuitCommandMatrix, 'quit command');
