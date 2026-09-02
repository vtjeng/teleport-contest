#!/usr/bin/env node

// Run the checked-in matrix for a hero whose wounded legs heal, through fresh
// C recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The behavior is timeout.c nh_timeout()'s per-property countdown (669-671)
// reaching its WOUNDED_LEGS case at 774, which calls do.c heal_legs(0)
// (2448-2486) and then stop_occupation(). What a recording can show is the
// turn the count runs out on, the line heal_legs() writes there, the
// encumbrance line encumber_msg() adds behind it when the restored carrying
// capacity lifts a load, and the status row losing "Burdened" and taking its
// point of Dexterity back on the same screen.
//
// EVERY SEGMENT WAITS WITH '.' RATHER THAN 's', and the difference is not
// cosmetic. detect.c dosearch0() reports what it finds, and once two of those
// reports pair into a --More-- js/tty_message.js:78 xwaitforspace() eats every
// following byte outside " \r\n\033": the remaining keys spend no turn, the
// countdown stops where it stood, and the recording ends without ever reaching
// the expiry. do.c donull() is silent, so each key is one turn. The spaces
// that do appear are all in the walk-in, where look_here()'s window and the
// trap line need dismissing; the two Knights below need two because their load
// crosses a threshold as the wound lands, which pairs encumber_msg()'s line
// with the trap line into a --More--.
//
// A held hero never works free by waiting: hack.c trapmove() is the only
// writer that counts u.utrap down and only a movement key reaches it. That is
// why four of these five segments still sit in the trap when the legs heal,
// and why the fifth spends eight diagonal steps working loose first -- the
// recovery is timeout.c's alone and owes nothing to the trap that caused it.
//
// The seeds are the two the hero-bear-trap matrix already walks into a bear
// trap on (42 and 395) plus two found by running the port over seeds 1 to 1500
// with a fixed clock and a Knight, keeping those whose dungeon level one holds
// a BEAR_TRAP reachable in a straight line of at most three plain room
// squares, whose wounded leg then crosses an encumbrance threshold, and who
// can wait out the whole rn1(10, 10) countdown without meeting a monster.
// Sixteen of the 1500 had a reachable trap and two of those were burdened;
// none was copied from a recorded session. Each wait count is the countdown
// the port reads back from its own rn1(10, 10), plus three turns so that the
// recording carries on past the recovery rather than ending on it.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

function nethackrc(role, align) {
    return [
        `OPTIONS=name:Mender,role:${role},race:human,gender:male,`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet on the trap square or on the square the hero leaves
        // reaches hack.c domove_swap_with_pet(), and a pet following the hero
        // gives the wait turns a second mover the recovery does not need.
        'OPTIONS=pettype:none',
        '',
    ].join('\n');
}

function wait({ seed, role = 'Knight', align = 'lawful', walkIn, turns }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(role, align),
        moves: `${walkIn}${'.'.repeat(turns)}`,
    };
}

export function loadWoundedLegsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Both halves of the line, which is the case this matrix exists
            // for: a Knight heavy enough that one wounded leg costs him
            // WT_WOUNDEDLEG_REDUCT of carrying capacity and the "Burdened"
            // that comes with it. heal_legs() gives the capacity back, so its
            // own line and encumber_msg()'s share one screen. He is also slow
            // while burdened, so a single key can spend two turns and the nine
            // waits before the recovery cover a countdown of twelve.
            wait({ seed: 1418, walkIn: 'b  ', turns: 12 }),
            // The same transition on another level, from another approach
            // direction and over a longer countdown, so neither the map nor
            // the count is load-bearing for the encumbrance half.
            wait({ seed: 1475, walkIn: 'lll  ', turns: 15 }),
            // A Knight the wound does not burden. encumber_msg() finds no
            // change to report, so heal_legs()'s line stands alone -- the
            // difference from the two above is one segment's whole point.
            wait({ seed: 42, walkIn: 'll ', turns: 16 }),
            // Another role, so the body_part(LEG) the line names is not
            // carried by one character's anatomy alone.
            wait({ seed: 395, role: 'Healer', align: 'neutral',
                walkIn: 'j ', turns: 14 }),
            // The recovery with the trap already behind it. Eight diagonal
            // steps always exhaust rn1(4, 4)'s four to seven turns, so this
            // hero is standing free when the legs heal, and the wound outlives
            // the trap by three more turns.
            wait({ seed: 395, role: 'Healer', align: 'neutral',
                walkIn: 'j yyyyyyyy', turns: 6 }),
        ],
    }, 'wounded legs recipe');
}

export async function runWoundedLegsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wounded legs',
            recipe: loadWoundedLegsRecipe(),
        }],
        summaryLabel: 'WOUNDED LEGS',
    });
}

runMatrixCli(import.meta.url, runWoundedLegsMatrix, 'wounded legs');
