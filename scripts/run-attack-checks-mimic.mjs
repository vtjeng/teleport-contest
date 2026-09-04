#!/usr/bin/env node

// Fresh differential matrix for uhitm.c attack_checks() mimic branch
// (lines 254-266). A wizard-mode game creates a mimic with ^G and walks
// east into it. The three entries vary the mimic species and therefore
// the object the mimic disguises as and the message that_is_a_mimic()
// produces.
//
// Seeds chosen by map layout: 9130009 starts the Valkyrie in a wide lit
// room with at least one open square east, so walking east after genesis
// always lands on the mimic's square.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20260214031500';
const GENESIS_KEY = '\x07';

function nethackrc() {
    return [
        'OPTIONS=name:MimicTest,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,playmode:debug',
        '',
    ].join('\n');
}

function segment(seed, species) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        // ^G creates the mimic, then 'l' walks east into its square.
        moves: `${GENESIS_KEY}${species}\nl`,
    };
}

export function loadAttackChecksMimicRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            segment(9130009, 'small mimic'),
            segment(9130009, 'large mimic'),
            segment(9130009, 'giant mimic'),
        ],
    }, 'attack_checks mimic recipe');
}

export async function runAttackChecksMimicMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'attack_checks mimic branches',
            recipe: loadAttackChecksMimicRecipe(),
        }],
        summaryLabel: 'ATTACK CHECKS MIMIC',
        // Each segment is a debug game; chunkLimit:1 prevents save
        // restoration across segments.
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runAttackChecksMimicMatrix, 'attack checks mimic');
