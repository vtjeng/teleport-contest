#!/usr/bin/env node

// Record and replay the startup pickup_types option through its first real
// reader, the Ctrl-X attributes window.  The configuration uses two distinct
// class symbols so order is visible in insight.c's autopickup line, then
// Escape dismisses that window and ':' supplies the following command-input
// boundary.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20340417101500';

export function loadStartupPickupTypesRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 8734019,
            datetime: DATETIME,
            nethackrc: [
                'OPTIONS=name:Typewright,role:Valkyrie,race:human,'
                    + 'gender:female,align:lawful',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=pettype:none,!acoustics,autopickup,'
                    + 'pickup_types:)%',
                '',
            ].join('\n'),
            moves: '\x18\x1b:',
        }],
    }, 'startup pickup_types recipe');
}

export async function runStartupPickupTypesMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup pickup_types to attributes',
            recipe: loadStartupPickupTypesRecipe(),
        }],
        summaryLabel: 'STARTUP PICKUP_TYPES',
    });
}

runMatrixCli(import.meta.url, runStartupPickupTypesMatrix, 'startup pickup_types');
