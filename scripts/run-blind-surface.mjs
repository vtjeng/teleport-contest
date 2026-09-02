#!/usr/bin/env node

// Run the checked-in matrix for the terrain noun a blind hero feels underfoot,
// through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The consumer is invent.c look_here():4200-4211, whose blind arm calls
// dungeon.c surface() for the noun and then drops the dfeature line when
// dfeature_at() repeats it. Two commands reach look_here(): dolook() for ':',
// and pickup() through check_here() when a move lands on a square holding one
// object. OPTIONS=blind (optlist.h permablind, u_init.c:1027) is what selects
// the arm, so every segment but the control sets it.
//
// Seeds were chosen by generating levels and reading the terrain around the
// hero, not by copying any recorded session.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

// One seed carries five of surface()'s arms within nine steps of the hero's
// arrival square, so the matrix varies the walk rather than the seed.
const TERRAIN_SEED = 5100100;

function nethackrc({ name, blind = true }) {
    return [
        `OPTIONS=name:${name},role:Ranger,race:elf,gender:male,align:chaotic`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics${blind ? ',blind' : ''}`,
        '',
    ].join('\n');
}

function look(moves, { seed = TERRAIN_SEED, blind = true } = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ name: 'BlindFeel', blind }),
        moves,
    };
}

export function loadBlindSurfaceRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // On_stairs(): the hero arrives on the up staircase, so the very
            // first ':' of a blind game takes this arm. dfeature_at() answers
            // "staircase up out of the dungeon", which differs from "stairs",
            // so both lines print.
            look(':'),
            // IS_DOOR(): a doorway one step south. dfeature_at() also answers
            // "doorway", so invent.c:4210-4211 drops its line.
            look('j:'),
            // IS_FOUNTAIN(): four steps north. The dfeature line is dropped
            // here too, and for the same reason.
            look('kkkk:'),
            // IS_ROOM(): ordinary floor, and no feature line at all.
            look('h:'),
            // The final else: a corridor answers "ground", not "floor".
            look('jjjjjjjjj:'),
            // The other route into look_here(). This hero walks onto a
            // fountain holding gold, so pickup() reaches check_here() and
            // look_here() with one object rather than none.
            look('h', { seed: 5100896 }),
            // The control. Without OPTIONS=blind the same first command takes
            // look_here()'s sighted arm, which never asks surface() anything.
            look(':', { blind: false }),
        ],
    }, 'blind surface recipe');
}

export async function runBlindSurfaceMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'blind surface',
            recipe: loadBlindSurfaceRecipe(),
        }],
        summaryLabel: 'BLIND SURFACE',
    });
}

runMatrixCli(import.meta.url, runBlindSurfaceMatrix, 'blind surface');
