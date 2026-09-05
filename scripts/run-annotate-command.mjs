#!/usr/bin/env node

// Record and replay dungeon.c donamelevel() / query_annotation() paths.
// The #annotate extended command prompts the player to name the current
// dungeon level. Five cases cover every branch in query_annotation():
//
// 1. New annotation: text typed and accepted (lev==NULL, no existing custom).
// 2. ESC abort: no annotation stored.
// 3. Empty input (Enter only): no annotation stored.
// 4. Replace annotation: set "First", then replace with "Second".
// 5. Clear annotation with all-spaces: set "Hello", then clear with "   ".
//
// Seeds chosen independently; no natural-seed scan needed because #annotate
// makes no RNG calls and the command works in any game.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const HEALER_RC = [
    'OPTIONS=role:Healer,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!autopickup,symset:DECgraphics',
    '',
].join('\n');

function makeRecipe(seed, name, moves) {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed,
            datetime: '20260724120000',
            nethackrc: `OPTIONS=name:${name}\n${HEALER_RC}`,
            moves,
        }],
    }, `#annotate recipe: ${name}`);
}

export async function runAnnotateMatrix() {
    const result = await runFreshMatrix({
        entries: [
            {
                label: 'new annotation on current level',
                recipe: makeRecipe(990001, 'AnnotNew',
                    '#annotate\nTest\n'),
            },
            {
                label: 'ESC aborts without setting annotation',
                recipe: makeRecipe(990002, 'AnnotESC',
                    '#annotate\n\x1b'),
            },
            {
                label: 'empty input aborts without setting annotation',
                recipe: makeRecipe(990004, 'AnnotEmpty',
                    '#annotate\n\r'),
            },
            {
                label: 'replace an existing annotation',
                recipe: makeRecipe(990003, 'AnnotRep',
                    '#annotate\nFirst\n#annotate\nSecond\n'),
            },
            {
                label: 'all-spaces input clears existing annotation',
                recipe: makeRecipe(990005, 'AnnotSpc',
                    '#annotate\nHello\n#annotate\n   \n'),
            },
        ],
        summaryLabel: 'ANNOTATE COMMAND',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 5);
    return result;
}

runMatrixCli(import.meta.url, runAnnotateMatrix, 'annotate command');
