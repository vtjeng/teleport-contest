#!/usr/bin/env node

// Record and replay complete-name and carried-item encyclopedia lookups. Each
// case dismisses the data window and crosses the following command boundary.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const TYPED_FOUNTAIN_MOVES = ' /?fountain\n .';
export const CARRIED_QUARTERSTAFF_MOVES = ' /ia .';

function nethackrc(name, gender, extraOptions = []) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:${gender},align:neutral`,
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,symset:DECgraphics',
        ...extraOptions.map((option) => `OPTIONS=${option}`),
        '',
    ].join('\n');
}

export function loadWhatisTypedInventoryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // This independent seed reaches the complete-string arm;
                // "fountain" selects its fifteen-line exact-key entry.
                seed: 42051,
                datetime: '20000209183006',
                nethackrc: nethackrc('Thales', 'male'),
                moves: TYPED_FOUNTAIN_MOVES,
            },
            {
                // A female Wizard changes the generated pack while retaining
                // invlet 'a' for the broad '*staff' wildcard entry.
                seed: 42052,
                datetime: '20000210194107',
                nethackrc: nethackrc('Hypatia', 'female'),
                moves: CARRIED_QUARTERSTAFF_MOVES,
            },
            {
                // The same independent inventory path with a three-row
                // status window pins the vertical docorner repair boundary.
                seed: 42052,
                datetime: '20000210194107',
                nethackrc: nethackrc('Hypatia', 'female', ['statuslines:3']),
                moves: CARRIED_QUARTERSTAFF_MOVES,
            },
        ],
    }, 'whatis typed-name and carried-item recipe');
}

export async function runWhatisTypedInventoryMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'whatis typed-name and carried-item lookups',
            recipe: loadWhatisTypedInventoryRecipe(),
        }],
        summaryLabel: 'WHATIS TYPED INVENTORY LOOKUP',
    });
    if (result.passed) assert.equal(result.totals.segments, 3);
    return result;
}

runMatrixCli(import.meta.url, runWhatisTypedInventoryMatrix, 'whatis typed inventory');
