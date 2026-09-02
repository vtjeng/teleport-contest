#!/usr/bin/env node

// Record an already-known healing spellbook refresh refusal against the
// patched C program, then replay the same inputs through the JavaScript port.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// This ordinary weekday clock avoids NetHack's date-dependent events.
const DATETIME = '20320405060708';

export const HEALING_READ_WAIT = '.';
export const HEALING_READ_COMMAND = 'r';
export const HEALING_BOOK_LETTER = 'g';
export const HEALING_MESSAGE_MORE = ' ';
export const HEALING_REFRESH_DECLINE = '\x1b';

export function loadReadKnownHealingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Seed 802700 gives an ordinary human Priestess the fixed Priest
            // starting pack. Healing is inventory letter g and is already at
            // full retention through initialspell().
            seed: 802700,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:ReadFresh,role:Priest,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=!autopickup,time,showexp',
                '',
            ].join('\n'),
            // Space dismisses the knowledge message. Escape selects the
            // refresh question's default no answer; the final wait makes an
            // accidental read turn or delayed occupation observable.
            moves: `${HEALING_READ_WAIT}${HEALING_READ_COMMAND}`
                + `${HEALING_BOOK_LETTER}${HEALING_MESSAGE_MORE}`
                + `${HEALING_REFRESH_DECLINE}${HEALING_READ_WAIT}`,
        }],
    }, 'known healing spellbook decline recipe');
}

export async function runReadKnownHealingMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'decline refreshing a known healing spell',
            recipe: loadReadKnownHealingRecipe(),
        }],
        summaryLabel: 'READ KNOWN HEALING',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runReadKnownHealingMatrix, 'read known healing');
