#!/usr/bin/env node

// Run the checked-in matrix for a hero who walks into a bear trap, through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The behavior is hack.c domove() -> spoteffects() (3312-3462) -> trap.c
// dotrap() (2995-3060) -> trapeffect_selector() (2936-2993) into the hero arm
// of trapeffect_bear_trap() (1489-1524), and then hack.c trapmove()'s
// TT_BEARTRAP arm (1565-1579) on each following step. What a recording can
// show is the order spoteffects() puts pickup(1) and dotrap() in, the trap
// line and the wounded-legs consequences on the status row, the Norep() line
// while the hero struggles, and the draws each arm spends: d(2,4) for the
// damage, rn1(4,4) for how long the trap holds, rn2(2) and rn1(10,10) for
// which leg and for how long, rn2(2) for the Dexterity exercise, and rn2(5)
// per orthogonal escape attempt.
//
// Every segment ends on a bear trap that the hero has not seen, because
// dotrap()'s escape branch at trap.c:3035-3044 needs trapname() and is
// refused ahead of the move. scripts/hero-bear-trap.test.mjs pins that
// refusal and its three siblings directly instead.
//
// Seeds were found by generating dungeon level one with the port over seed
// ranges 1..900 and keeping those whose level holds a BEAR_TRAP the hero can
// reach in a straight line of at most three plain room squares; none was
// copied from a recorded session. mklev.c mktrap_victim() leaves an object
// pile on most generated traps, which is why each walk-in is followed by a
// space: it dismisses look_here()'s window, and pickup(1) running before
// dotrap() is itself part of what these cases check.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

function nethackrc(role, align) {
    return [
        `OPTIONS=name:Prober,role:${role},race:human,gender:male,`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet standing on the trap square, or on the square the
        // hero leaves, reaches hack.c domove_swap_with_pet(), whose own trap
        // handling is a separate boundary and would decide these segments
        // instead of dotrap().
        'OPTIONS=pettype:none',
        '',
    ].join('\n');
}

function walk({ seed, role = 'Healer', align = 'neutral', moves }) {
    return { seed, datetime: DATETIME, nethackrc: nethackrc(role, align),
        moves };
}

export function loadHeroBearTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The heaviest case, and the one that shows every consequence of
            // set_wounded_legs() at once. A Knight carries enough that losing
            // WT_WOUNDEDLEG_REDUCT of carrying capacity crosses a threshold,
            // so encumber_msg() writes a second message; that pairs with the
            // trap line into a More prompt, which is why this segment needs
            // two spaces. The status row moves from Dx:9 to Dx:8, loses hit
            // points, and gains "Burdened", all on the same screen.
            walk({ seed: 405, role: 'Knight', align: 'lawful',
                moves: 'hh  yyyyyyyy' }),
            // The same arm with no encumbrance transition: a Healer carries
            // little, so encumber_msg() prints nothing, the trap line stands
            // alone with no More prompt, and one space is enough. Eight
            // diagonal steps always exhaust rn1(4, 4)'s four-to-seven turns,
            // so this segment also covers the wriggle_free: label.
            walk({ seed: 395, moves: 'j yyyyyyyy' }),
            // Orthogonal escape attempts instead of diagonal ones. Each one
            // draws the rn2(5) that the diagonal short-circuit in
            // `(u.dx && u.dy) || !rn2(5)` skips, and ten of them are not
            // enough here, so the hero is still held when the segment ends.
            // Ten is also the ceiling: rn1(10, 10) gives the wounded legs ten
            // to nineteen turns, and the expiry belongs to the recovery matrix
            // in scripts/run-wounded-legs.mjs rather than to this one.
            walk({ seed: 395, moves: 'j hhhhhhhhhh' }),
            // A diagonal walk onto the trap rather than an orthogonal one, so
            // that no single approach direction carries the arm.
            walk({ seed: 69, role: 'Knight', align: 'lawful',
                moves: 'n yyyyyyyy' }),
            // The same capture, struggling northeast into a closed door
            // instead of southwest into open floor. hack.c domove_core():2830
            // returns before test_move() at 2843, so C never opens the door,
            // never bumps into it and never says it is closed: the step is
            // spent in trapmove() exactly as the segment above spends it. Five
            // keys leave the hero held, so no free step follows to reach the
            // door for real.
            walk({ seed: 69, role: 'Knight', align: 'lawful',
                moves: 'n uuuuu' }),
            // Two more levels, each with its own trap position and object
            // pile, so neither the map nor the pile contents are load-bearing.
            walk({ seed: 263, role: 'Knight', align: 'lawful',
                moves: 'nn yyyyyyyy' }),
            walk({ seed: 42, role: 'Knight', align: 'lawful',
                moves: 'll yyyyyyyy' }),
        ],
    }, 'hero bear trap recipe');
}

export async function runHeroBearTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'hero bear trap',
            recipe: loadHeroBearTrapRecipe(),
        }],
        summaryLabel: 'HERO BEAR TRAP',
    });
}

runMatrixCli(import.meta.url, runHeroBearTrapMatrix, 'hero bear trap');
