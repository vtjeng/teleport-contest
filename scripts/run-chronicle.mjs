#!/usr/bin/env node

// Record and replay an independent #chronicle command. The input reaches
// insight.c do_gamelog/show_gamelog after startup, while the seed/date and
// character differ from the fixed seed0106 continuation.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const CHRONICLE_RECIPE = validateCleanRecipe({
    version: 5,
    segments: [{
        seed: 812345,
        datetime: '20360110090000',
        nethackrc: [
            'OPTIONS=name:ChronicleProbe,role:Priest,race:human,gender:female,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,!autopickup',
            'OPTIONS=pettype:none,!acoustics,symset:DECgraphics',
            '',
        ].join('\n'),
        moves: ' #chronicle\n  ',
        comment: 'Independent direct command reaches insight.c do_gamelog/show_gamelog with the startup chronicle entry.',
    }, {
        seed: 812346,
        datetime: '20360111090000',
        nethackrc: [
            'OPTIONS=name:ChronicleVariation,role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,!autopickup',
            'OPTIONS=pettype:none,!acoustics,symset:DECgraphics',
            '',
        ].join('\n'),
        moves: ' #chronicle\n  ',
        comment: 'Cheap role and seed variation reaches the same Chronicle entry with a different startup identity.',
    }],
}, 'chronicle recipe');

export async function runChronicleMatrix() {
    const result = await runFreshMatrix({
        entries: [{ label: 'direct chronicle command', recipe: CHRONICLE_RECIPE }],
        summaryLabel: 'CHRONICLE COMMAND',
        chunkLimit: 1,
    });
    return result;
}

runMatrixCli(import.meta.url, runChronicleMatrix, 'chronicle command');
