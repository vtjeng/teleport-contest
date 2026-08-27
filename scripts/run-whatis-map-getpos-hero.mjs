#!/usr/bin/env node

// Record and replay an ordinary hero farlook. The final wait crosses the next
// command boundary and proves that the whatis command did not consume a turn.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const WHATIS_SETUP = ' ';
export const WHATIS_COMMAND = '/';
export const WHATIS_MAP_CHOICE = '/';
export const MORE_KEYS = '   ';
export const TRADITIONAL_PICK = '.';
export const DECLINE_MORE_INFO = 'n';
export const ESCAPE_KEY = '\u001b';
export const NEXT_COMMAND = '.';
export const WHATIS_MOVES = WHATIS_SETUP + WHATIS_COMMAND
    + WHATIS_MAP_CHOICE + MORE_KEYS + TRADITIONAL_PICK
    + ` ${DECLINE_MORE_INFO}${ESCAPE_KEY}${NEXT_COMMAND}`;

function nethackrc(name, gender) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:${gender},align:neutral`,
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

export function loadWhatisMapHeroRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // This independent seed and fixed non-holiday date start a
                // male human Wizard on an ordinary visible D:1 square.
                seed: 42044,
                datetime: '20000203123456',
                nethackrc: nethackrc('Farley', 'male'),
                moves: WHATIS_MOVES,
            },
            {
                // The second independent seed changes the hero's gender and
                // name while retaining the source branch and input sequence.
                seed: 42045,
                datetime: '20000204134501',
                nethackrc: nethackrc('Ada', 'female'),
                moves: WHATIS_MOVES,
            },
        ],
    }, 'ordinary whatis hero-map recipe');
}

export async function runWhatisMapHeroMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'ordinary hero farlook',
            recipe: loadWhatisMapHeroRecipe(),
        }],
        summaryLabel: 'WHATIS MAP GETPOS HERO',
    });
    if (result.passed) assert.equal(result.totals.segments, 2);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runWhatisMapHeroMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`whatis map hero: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
