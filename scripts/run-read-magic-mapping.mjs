#!/usr/bin/env node

// Record and replay one ordinary uncursed scroll-of-magic-mapping read. The
// trailing wait crosses the next command boundary, so the differential checks
// the mapped display and the turn after the scroll has left inventory.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const MAP_READ_WAIT = '.';
export const MAP_READ_KEY = 'r';
export const MAP_READ_LETTER = 'j';
export const MAP_READ_MORE = ' ';

export function loadReadMagicMappingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // A scan of seeds 8127301-8127400 selected 8127307 because this
            // female Wizard starts with one uncursed magic-mapping scroll in
            // slot j. The fixed date has no NetHack calendar event.
            seed: 8127307,
            datetime: '20330405060708',
            nethackrc: [
                'OPTIONS=name:MapRead,role:Wizard,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics',
                '',
            ].join('\n'),
            // Space dismisses the disappearance message. The final wait
            // proves that reading consumed one turn and left reusable state.
            moves: `${MAP_READ_WAIT}${MAP_READ_KEY}${MAP_READ_LETTER}`
                + `${MAP_READ_MORE}${MAP_READ_WAIT}`,
        }],
    }, 'read magic-mapping recipe');
}

export async function runReadMagicMappingMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'ordinary uncursed magic-mapping scroll',
            recipe: loadReadMagicMappingRecipe(),
        }],
        summaryLabel: 'READ MAGIC MAPPING',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runReadMagicMappingMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`read magic mapping: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
