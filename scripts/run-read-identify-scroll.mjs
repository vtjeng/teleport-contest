#!/usr/bin/env node

// Record and replay an unknown, ordinary identify scroll whose removal leaves
// a fully identified pack. The hero walks to a naturally generated scroll,
// picks it up, and reads it under normal game rules.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const IDENTIFY_WAIT = '.';
export const IDENTIFY_PATH = 'hhhhhhhh';
export const IDENTIFY_PICKUP_KEY = ',';
export const IDENTIFY_READ_KEY = 'r';
export const IDENTIFY_READ_LETTER = 'e';
export const IDENTIFY_MORE = ' ';

export function loadReadIdentifyScrollRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // The fixed scan of seeds 9000001-9000200 selected 9000182. Its
            // uncursed identify scroll lies eight open squares west of this
            // human Valkyrie's start. Her four starting objects in a-d are
            // fully identified, so the picked-up scroll in e is the only
            // unknown. The fixed date has no NetHack calendar event.
            seed: 9000182,
            datetime: '20360405060708',
            nethackrc: [
                'OPTIONS=name:NaturalId,role:Valkyrie,race:human,gender:female,align:lawful',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,!autopickup',
                '',
            ].join('\n'),
            // Comma picks up the scroll without relying on autopickup. Space
            // dismisses that inventory line before r opens getobj(). The next
            // two Spaces advance the three read messages, and the final wait
            // crosses the next command boundary after consumption.
            moves: `${IDENTIFY_PATH}${IDENTIFY_PICKUP_KEY}${IDENTIFY_MORE}`
                + IDENTIFY_READ_KEY
                + `${IDENTIFY_READ_LETTER}${IDENTIFY_MORE}${IDENTIFY_MORE}`
                + IDENTIFY_WAIT,
        }],
    }, 'read identify-scroll recipe');
}

export async function runReadIdentifyScrollMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'unknown identify scroll with no unidentified remainder',
            recipe: loadReadIdentifyScrollRecipe(),
        }],
        summaryLabel: 'READ IDENTIFY SCROLL',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runReadIdentifyScrollMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`read identify scroll: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
