#!/usr/bin/env node

// Record and replay one short bare-fingertip engraving. The trailing wait
// crosses the next command boundary after the one-action occupation finishes.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const ENGRAVE_SETUP = ' h';
export const ENGRAVE_KEY = 'E';
export const FINGERTIP_KEY = '-';
export const ENGRAVE_TEXT = 'Elbereth';
export const ENTER_KEY = '\r';
export const ENGRAVE_WAIT = '.';

export function loadEngraveFingertipDustRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed and fixed non-holiday date put a female
            // Wizard on an ordinary accessible D:1 room square. The opening
            // wait settles startup; no inventory object is needed because '-'
            // selects the hands sentinel.
            seed: 42043,
            datetime: '20000202123456',
            nethackrc: [
                'OPTIONS=name:Dusty,role:Wizard,race:human,gender:female,align:neutral',
                'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics',
                '',
            ].join('\n'),
            // Space clears the welcome line and the west step leaves the
            // staircase for the adjacent ordinary room floor. Elbereth has
            // eight non-space bytes, within engrave()'s rate-10 first action.
            // The final wait verifies the normal turn tail.
            moves: `${ENGRAVE_SETUP}${ENGRAVE_KEY}${FINGERTIP_KEY}`
                + ` ${ENGRAVE_TEXT}${ENTER_KEY}${ENGRAVE_WAIT}`,
        }],
    }, 'bare-fingertip dust engraving recipe');
}

export async function runEngraveFingertipDustMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'one-action bare-fingertip dust engraving',
            recipe: loadEngraveFingertipDustRecipe(),
        }],
        summaryLabel: 'ENGRAVE FINGERTIP DUST',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runEngraveFingertipDustMatrix, 'engrave fingertip dust');
