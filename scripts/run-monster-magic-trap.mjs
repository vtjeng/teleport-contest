#!/usr/bin/env node

// Run fresh C recordings for trap.c's monster magic-trap and anti-magic arms.
// The first segment takes the ordinary rn2(21) nonzero branch; the second takes
// zero, then reaches trapeffect_fire_trap(), thitm(), and burnarmor().
//
// The seeds were selected by scanning 6,203,000-6,213,000 with the fixed
// clock and this character, first keeping generated MAGIC_TRAPs and then
// replaying twenty searches. Seed 6,200,285 reached the nonzero arm on turn
// three. Seeds 6,207,530, 6,209,247, and 6,210,045 reached the zero arm; the
// shortest of those, 6,207,530, reached it on turn four and is used here.
//
// The anti-magic segment was selected independently by scanning 6,200,000-
// 6,200,199 with the same clock and a separate character, replaying thirty
// search turns, and keeping a monster whose mtrapseen records ANTI_MAGIC.
// Seed 6,200,021 is the first such seed that completes without another
// boundary.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';
const NETHACKRC = [
    'OPTIONS=name:TrapMage,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

export function loadMonsterMagicTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            { seed: 6200285, datetime: DATETIME, nethackrc: NETHACKRC,
                moves: 'sss' },
            { seed: 6207530, datetime: DATETIME, nethackrc: NETHACKRC,
                moves: 'ssss' },
        ],
    }, 'monster magic trap recipe');
}

export function loadMonsterAntiMagicTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 6200021,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:AntiProbe,role:Valkyrie,race:human,gender:female,align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,time',
                '',
            ].join('\n'),
            moves: 's'.repeat(30),
        }],
    }, 'monster anti-magic trap recipe');
}

export async function runMonsterMagicTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster magic trap',
            recipe: loadMonsterMagicTrapRecipe(),
        }, {
            label: 'monster anti-magic trap',
            recipe: loadMonsterAntiMagicTrapRecipe(),
        }],
        summaryLabel: 'MONSTER MAGIC AND ANTI-MAGIC TRAPS',
        chunkLimit: 2,
    });
}

runMatrixCli(import.meta.url, runMonsterMagicTrapMatrix, 'monster magic trap');
