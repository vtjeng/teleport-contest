#!/usr/bin/env node

// Record and replay the four monster/object list choices. The case dismisses
// each text window and crosses the following command boundary.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const MONSTER_OBJECT_LIST_MOVES = ' /m /M /o /O .';

function nethackrc() {
    return [
        'OPTIONS=name:Euclid,role:Wizard,race:human,gender:male,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=!acoustics,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadWhatisMonsterObjectListRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // This independent seed shows the hero, a hostile jackal,
                // the tame kitten, and a live chest on the starting map.
                seed: 42057,
                datetime: '20000212160708',
                nethackrc: nethackrc(),
                moves: MONSTER_OBJECT_LIST_MOVES,
            },
            {
                // This independent seed has no shown floor objects, pinning
                // both the nearby and all-map no-results messages.
                seed: 42056,
                datetime: '20000212160708',
                nethackrc: nethackrc(),
                moves: MONSTER_OBJECT_LIST_MOVES,
            },
        ],
    }, 'whatis monster and object list recipe');
}

export async function runWhatisMonsterObjectListMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'whatis monster and object lists',
            recipe: loadWhatisMonsterObjectListRecipe(),
        }],
        summaryLabel: 'WHATIS MONSTER OBJECT LISTS',
    });
    if (result.passed) assert.equal(result.totals.segments, 2);
    return result;
}

runMatrixCli(import.meta.url, runWhatisMonsterObjectListMatrix, 'whatis monster/object lists');
