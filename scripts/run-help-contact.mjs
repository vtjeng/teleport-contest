#!/usr/bin/env node

// Record and replay the default help menu through its development-team
// contact page. The case dismisses the text window and reaches the next command.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// `o` selects docontact(); one space dismisses its single text page, and the
// final wait crosses the next command boundary without consuming RNG.
export const HELP_CONTACT_MOVES = '?o .';

function nethackrc() {
    return [
        'OPTIONS=name:Ada,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpContactRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches contact help without
            // turn-dependent setup. The fixed date cannot alter its lines.
            seed: 864_209,
            datetime: '20450708091011',
            nethackrc: nethackrc(),
            moves: HELP_CONTACT_MOVES,
        }],
    }, 'help contact recipe');
}

export async function runHelpContactMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help development-team contact',
            recipe: loadHelpContactRecipe(),
        }],
        summaryLabel: 'HELP CONTACT',
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runHelpContactMatrix, 'help contact');
