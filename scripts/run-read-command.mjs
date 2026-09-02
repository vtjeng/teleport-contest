#!/usr/bin/env node

// Record the `r` command's invalid-letter retry and cancellation against the
// patched C program, then replay the same inputs through the JavaScript port.
// This slice ends before a selected object changes state or produces an
// effect, so the matrix selects no object.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed clock with no NetHack calendar event, so only the command changes
// the top line between the two waits.
const DATETIME = '20310203040506';

// cmd.c extcmdlist[] binds `r` to doread(). decl.c quitchars[] contains Escape.
// A letter outside the Wizard's starting inventory reaches getobj()'s retry;
// Space dismisses its --More-- prompt before Escape cancels the second query.
export const READ_KEY = 'r';
export const INVALID_LETTER = 'z';
export const SPACE_KEY = ' ';
export const ESCAPE_KEY = '\x1b';
export const WAIT = '.';

export function loadReadCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Seed 6911001 gives this Wizard a starting pack ending before z.
            // The visible clock and pet make an accidental turn observable.
            seed: 6911001,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:ReadCmd,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:dog,!acoustics,!autopickup,time,showexp',
                '',
            ].join('\n'),
            moves: `${WAIT}${READ_KEY}${INVALID_LETTER}`
                + `${SPACE_KEY}${ESCAPE_KEY}${WAIT}`,
        }],
    }, 'read command recipe');
}

export async function runReadCommandMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'read command invalid retry and cancel',
            recipe: loadReadCommandRecipe(),
        }],
        summaryLabel: 'READ COMMAND',
        chunkLimit: 1,
    });
    if (result.passed) {
        assert.equal(result.totals.segments, 1);
    }
    return result;
}

runMatrixCli(import.meta.url, runReadCommandMatrix, 'read command');
