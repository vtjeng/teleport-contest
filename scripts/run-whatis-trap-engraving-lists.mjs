#!/usr/bin/env node

// Record and replay nearby and all-map trap and engraving lists. The first
// case writes a fresh engraving in ordinary play; the second pins empty lists.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const TRAP_ENGRAVING_LIST_MOVES
    = ' hE- Elbereth\n /t /T /e /E .';
export const EMPTY_TRAP_LIST_MOVES = ' /t /T .';

function nethackrc(name, gender) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:${gender},align:neutral`,
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadWhatisTrapEngravingListRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // The west step moves from the starting staircase to an
                // ordinary room square before the hero writes Elbereth.
                seed: 42058,
                datetime: '20000213160708',
                nethackrc: nethackrc('Noether', 'male'),
                moves: TRAP_ENGRAVING_LIST_MOVES,
            },
            {
                // This independent map has no visible or remembered traps;
                // both trap choices reach their source no-result messages.
                seed: 42059,
                datetime: '20000214170809',
                nethackrc: nethackrc('Emmy', 'female'),
                moves: EMPTY_TRAP_LIST_MOVES,
            },
        ],
    }, 'whatis trap and engraving list recipe');
}

export async function runWhatisTrapEngravingListMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'whatis trap and engraving lists',
            recipe: loadWhatisTrapEngravingListRecipe(),
        }],
        summaryLabel: 'WHATIS TRAP ENGRAVING LISTS',
    });
    if (result.passed) assert.equal(result.totals.segments, 2);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runWhatisTrapEngravingListMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`whatis trap/engraving lists: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
