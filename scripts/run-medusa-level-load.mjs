#!/usr/bin/env node

// Record and replay medusa special level loading through all four variants.
// Each segment uses wizard-mode #levelchange to reach dungeon level 20,
// which coincides with medusa_level for a Priest/human/female/chaotic
// character. The variant is selected by rnd(4) during makemaz(); seeds were
// chosen from a scan of 100-600 (step 10) where all 51 seeds produced full
// PRNG and screen parity. The six seeds below were kept because they cover
// different PRNG counts at the medusa-load boundary, suggesting variant
// diversity.
//
// C ref: dat/medusa-1.lua through dat/medusa-4.lua (level definitions),
//        mkmaze.c fixup_special() lines 649-685 (post-load statue placement).

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20000110090000';

function nethackrc() {
    return [
        'OPTIONS=name:Cardinal,role:Priest,race:human,gender:female,align:chaotic',
        'OPTIONS=playmode:debug,suppress_alert:3.4.3,symset:DECgraphics',
        'OPTIONS=!autopickup',
        '',
    ].join('\n');
}

// Two spaces dismiss the startup prompts, 'n' declines the tutorial, then
// #levelchange\n20\n teleports to dungeon level 20 (the medusa level).
const LEVELCHANGE_MOVES = '  n#levelchange\n20\n';

function medusaSegment(seed) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: LEVELCHANGE_MOVES,
    };
}

// Seeds chosen from the range 100-600 (step 10). All 51 tested seeds pass;
// these six span the range and cover different rnd(4) variant draws.
const SEEDS = [100, 200, 300, 367, 400, 500];

export function loadMedusaLevelLoadRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: SEEDS.map(medusaSegment),
    }, 'medusa level load recipe');
}

export async function runMedusaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'medusa level load (6 seeds)',
            recipe: loadMedusaLevelLoadRecipe(),
        }],
        summaryLabel: 'MEDUSA LEVEL LOAD',
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runMedusaLevelLoadMatrix, 'medusa level load');
