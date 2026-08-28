#!/usr/bin/env node

// Record an already-known healing spellbook refresh refusal against the
// patched C program, then replay the same inputs through the JavaScript port.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
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

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runReadKnownHealingMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `read known healing: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
