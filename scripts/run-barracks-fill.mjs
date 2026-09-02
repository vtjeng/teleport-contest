#!/usr/bin/env node

// Record and replay a fresh BARRACKS special-room case against the patched C
// program. The recipe contains replay inputs only; runFreshMatrix() records a
// new C reference in an isolated temporary workspace.
//
// This route reaches mklev.c's depth-15 BARRACKS dispatch and then stops at
// the first screen after mkroom.c fill_special_room() calls fill_zoo(). The
// character setup is part of the replay input, not an expected-output fixture.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310715091422';

const NETHACKRC = [
    'OPTIONS=name:BarracksFresh,role:Wizard,race:human,gender:male,align:neutral,playmode:debug,suppress_alert:3.4.3,symset:DECgraphics',
    'OPTIONS=!autopickup',
    '',
].join('\n');

const MOVES = '   n#levelchange\n20\n'
    + '                   '
    + '\x17blessed +3 gray dragon scale mail\n'
    + '\x17blessed +3 speed boots\n'
    + '\x17blessed amulet of life saving\n'
    + 'TaW oPp Pq  '
    + '\x1615\n';

export function loadBarracksFillRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 315,
            datetime: DATETIME,
            nethackrc: NETHACKRC,
            moves: MOVES,
        }],
    }, 'BARRACKS fill recipe');
}

export async function runBarracksFillMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'BARRACKS fill',
            recipe: loadBarracksFillRecipe(),
        }],
        summaryLabel: 'BARRACKS FILL',
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runBarracksFillMatrix, 'BARRACKS fill');
