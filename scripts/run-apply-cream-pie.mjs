#!/usr/bin/env node

// Record and replay one ordinary cream-pie application against the patched C
// program. The recipe contains replay inputs only; runFreshMatrix() records a
// new C reference in an isolated temporary workspace.
//
// The command is apply.c doapply()'s CREAM_PIE arm. It reaches
// use_cream_pie(), mondata.c can_blnd(), and potion.c make_blinded() before
// deleting the carried pie. The trailing space dismisses the second message,
// and the wait exposes the command result and blindness on the next screen.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

// A fixed Thursday morning avoids calendar startup messages. The seed is an
// arbitrary fresh value; wizard wishing creates the pie directly, so level
// generation does not select the behavior under test.
const DATETIME = '20330203111213';
const SEED = 6200828;

// wizcmds.c binds control-W to #wizwish. u_init.c gives a debug-mode Rogue
// seven carried objects, so the wished-for pie receives inventory letter h.
export const WISH_KEY = '\x17';
export const PIE_SLOT = 'h';
export const WISH_ONLY = `${WISH_KEY}cream pie\n`;

const NETHACKRC = [
    'OPTIONS=name:Creamer,role:Rogue,race:human,gender:female,align:chaotic',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=playmode:debug,pettype:none,!acoustics,!autopickup,time,showexp',
    '',
].join('\n');

export function loadApplyCreamPieRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: SEED,
            datetime: DATETIME,
            nethackrc: NETHACKRC,
            moves: `${WISH_ONLY}a${PIE_SLOT} .`,
        }],
    }, 'apply cream pie recipe');
}

export async function runApplyCreamPieMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'apply cream pie',
            recipe: loadApplyCreamPieRecipe(),
        }],
        summaryLabel: 'APPLY CREAM PIE',
        // A debug game leaves a save behind when the recorder exits, so this
        // one-segment recipe must run alone in its install chunk.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runApplyCreamPieMatrix, 'apply cream pie');
