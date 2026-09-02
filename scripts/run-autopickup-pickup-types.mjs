#!/usr/bin/env node

// Record and replay autopickup with pickup_types filtering against the
// patched C reference.
//
// C ref: pickup.c autopick_testobj():956-957.  When flags.pickup_types is
// non-empty, objects whose oclass is not in the list are excluded from
// autopickup and go to the remaining pile, which check_here() then describes
// with "You see here ...".
//
// Two cases exercise the two branches of the pickup_types check:
//
// - "exclude" sets pickup_types to $ (COIN_CLASS only).  The hero walks onto
//   a chest (TOOL_CLASS), which is not in the list.  autopick_testobj()
//   returns false, check_here() prints "You see here a chest.", and the
//   chest stays on the floor.
//
// - "include" sets pickup_types to ($ (TOOL_CLASS and COIN_CLASS).  The same
//   chest is now in the list.  autopick_testobj() returns true, pickup_object()
//   runs, and the top line shows the inventory letter.
//
// Seed 107 places the hero one step south of a naturally generated chest on
// dungeon level 1, so a single 'k' reaches it.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 107;
// A fixed Thursday morning with no calendar event.
const DATETIME = '20340417101500';
// Space dismisses the startup line; one k walks north onto the chest;
// the trailing rest detects a wrongly unspent turn.
const START = ' ';
const REST = '.';

function nethackrc(pickupTypes) {
    const pickupOpt = pickupTypes
        ? `autopickup,pickup_types:${pickupTypes}`
        : 'autopickup';
    return [
        'OPTIONS=name:PickTest,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics,${pickupOpt}`,
        '',
    ].join('\n');
}

// pickup_types excludes TOOL_CLASS: the chest stays on the floor.
function excludeSegment() {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc('$'),
        moves: START + 'k' + REST,
    };
}

// pickup_types includes TOOL_CLASS: the chest is picked up.
function includeSegment() {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc('($'),
        moves: START + 'k' + REST,
    };
}

export function loadAutopickupPickupTypesRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [excludeSegment(), includeSegment()],
    }, 'autopickup pickup_types recipe');
}

export async function runAutopickupPickupTypesMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'autopickup pickup_types filter',
            recipe: loadAutopickupPickupTypesRecipe(),
        }],
        summaryLabel: 'AUTOPICKUP PICKUP_TYPES',
    });
}

runMatrixCli(import.meta.url, runAutopickupPickupTypesMatrix, 'autopickup pickup_types');
