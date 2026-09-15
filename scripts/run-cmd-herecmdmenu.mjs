#!/usr/bin/env node

// Fresh differential matrix for cmd.c doherecmdmenu() after an Escape
// dismissal. The independent debug segment leaves the next command boundary
// visible, so charging a turn changes the following RNG and map frame.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const MOVES = '#herecmdmenu\u001b';

function nethackrc() {
    return [
        'OPTIONS=name:HereMenuProbe2,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,playmode:debug',
        '',
    ].join('\n');
}

export function loadHereCmdMenuRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Independent seed/date/name/role values keep the menu action
            // separate from the existing cmd.c menu recordings.
            seed: 7810808,
            datetime: '20321008091011',
            nethackrc: nethackrc(),
            moves: MOVES,
        }],
    }, 'herecmdmenu Escape recipe');
}

export async function runHereCmdMenuMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: '#herecmdmenu Escape dismissal',
            recipe: loadHereCmdMenuRecipe(),
        }],
        summaryLabel: 'HERECMDMENU ESCAPE',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runHereCmdMenuMatrix, 'herecmdmenu Escape');
