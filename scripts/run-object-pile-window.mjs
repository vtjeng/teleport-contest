#!/usr/bin/env node

// Record and replay ordinary two-to-four-object floor-pile windows against
// the patched C reference. Each segment walks only through object-free ROOM
// or CORR squares with autopickup disabled, reaches a natural generated pile,
// dismisses the `--More--` prompt with Space, and supplies a trailing rest so
// the repaired next command prompt is captured before that command is read.
//
// The source transaction is pickup.c pickup()'s !flags.pickup arm through
// check_here(FALSE), invent.c look_here()'s otmp->nexthere arm, and the tty
// NHW_MENU-with-data route through tty_putstr(), tty_display_nhwindow(),
// process_text_window(), dmore(), and tty_dismiss_nhwindow(). The pinned
// H2344_BROKEN offset is
// min(min(82, ttyDisplay->cols / 2), cols - maxcol - 1).
//
// Seeds were selected by generating new JS D:1 levels in 6200000-6202999 and
// 6230000-6231999, then breadth-first searching orthogonal object-free paths
// to ROOM/CORR piles while rejecting monsters, traps, engravings, boulders,
// and nonordinary terrain. No recorded session supplied a seed or route.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20330809101112';

function nethackrc(name) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,`
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        '',
    ].join('\n');
}

export function loadObjectPileWindowRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 6200242,
                datetime: DATETIME,
                nethackrc: nethackrc('PileFresh2'),
                // One step north reaches two objects. Space dismisses the
                // window; the trailing rest captures its repaired successor.
                moves: 'k .',
            },
            {
                seed: 6231371,
                datetime: DATETIME,
                nethackrc: nethackrc('PileFresh3'),
                // Five object-free steps reach three objects, exercising one
                // more tty_putstr()/process_text_window() row.
                moves: 'llkkk .',
            },
        ],
    }, 'object pile window recipe');
}

export async function runObjectPileWindowMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'object pile window',
            recipe: loadObjectPileWindowRecipe(),
        }],
        summaryLabel: 'OBJECT PILE WINDOW',
    });
}

runMatrixCli(import.meta.url, runObjectPileWindowMatrix, 'object pile window');
