#!/usr/bin/env node

// Record and replay the two development witness paths through the bounded
// pickup.c query_objlist() full-menu branch. Each input ends immediately after
// the menu choice, so the differential includes the menu screens, display-RNG
// calls, selected counts, pickup_object() loop, and resulting inventory.
//
// These are replay-only recipes: they contain no recorded C answers. The
// recorder makes a new reference session on every run. The inputs through the
// comma command are the independently named development witnesses; the
// appended menu keys are the choices that let this slice continue past their
// old stop points.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export const PICKUP_QUERY_CASES = [
    {
        label: 'seed 4 feeding pony witness',
        seed: 4,
        datetime: '20260414173108',
        nethackrc: 'OPTIONS=symset:DECgraphics\n',
        // The comma is the witness stop at step 240; c, d, Enter select its
        // two ordinary floor objects from the full PICK_ANY menu.
        moves: 'Tetra\ryy  nkkklLuujjllnnJj  bbbbbbbbbbbbbbbb kkkkkykkkkkyhhhhjjJhhhbhhhhHhhhyhhykKhhhh,hhHjjjbBHjjJbBhbbb,hhhhHKyh,bjjlllljjjjjjjjjjjlluulluulukukhhhyhhhhhyykkkkkkyhyullL9s9s9shhhhyHjbnNluuulluulllukuuulllllllllnJyyuuluululkkkklukjkky #l\ro,cd\r',
    },
    {
        label: 'seed 12 monk vault escort witness',
        seed: 12,
        datetime: '20260503045501',
        nethackrc: 'OPTIONS=symset:DECgraphics\n',
        // The comma is the witness stop at step 43; b, Enter selects the bag
        // while leaving the non-petrifying newt corpse on the floor.
        moves: 'Dodeco\rn[l"m/hmy   nH#l\rK  #l\r:\u001b\u001bnknlnLll ,b\r',
    },
];

export function loadPickupQueryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: PICKUP_QUERY_CASES.map(({ label, ...segment }) => segment),
    }, 'pickup query_objlist recipe');
}

export async function runPickupQueryMatrix() {
    return runFreshMatrix({
        entries: PICKUP_QUERY_CASES.map(({ label, ...segment }) => ({
            label,
            recipe: {
                version: 5,
                segments: [segment],
            },
        })),
        summaryLabel: 'PICKUP QUERY_OBJLIST',
    });
}

runMatrixCli(import.meta.url, runPickupQueryMatrix, 'pickup query_objlist');
