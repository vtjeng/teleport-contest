#!/usr/bin/env node

// Run the checked-in matrix for a hero displacing the starting pet from a
// doorway square through fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// What the matrix pins is an ordering inside hack.c domove_core(): it reaches
// domove_attackmon_at() (1955-1992) at 2798 and test_move() only at 2843. A
// hero standing on a doorway that still has its door may not step off it
// diagonally (hack.c:1208-1214), but uhitm.c do_attack() runs first and has no
// doorway test at all, so the step spends `foo = (Punished || !rn2(7) || ...)`
// at uhitm.c:474 before the terrain declines it. Both outcomes of that draw are
// here:
//
//   rn2(7) != 0  do_attack() falls through to uhitm.c:509 and returns FALSE,
//                test_move() refuses, and hack.c:2844-2847 answers with
//                `svc.context.move = 0; nomul(0)`. The draw is the only trace.
//   rn2(7) == 0  the pet refuses to swap: uhitm.c:497 makes it flee for rnd(6)
//                turns, :500 prints "You stop.  <pet> is in the way!" and :502
//                returns TRUE, ending the step at hack.c:2799. The turn elapses
//                and test_move() never runs.
//
// The doorless recipe is the negative half. hack.c doorless_door() masks off
// D_NODOOR and D_BROKEN, so a doorway with no door in it arms neither diagonal
// rule and the same diagonal completes the swap. Without it the matrix would
// pass against a port that refused every diagonal displacement.
//
// Seeds were found by a port-side scan, not by copying any recorded session.
// The scan replayed each seed with no keys, ran a breadth-first search over
// ROOM, CORR and doorless squares within six steps of the hero for a doorway
// with the wanted mask, walked to it (the last step orthogonal, since
// test_move() refuses a diagonal arrival at an intact doorway), waited up to
// two turns on it so the pet could come around, and kept the seed when the pet
// stood on one of the four diagonals with nothing else on either square. Its
// domain and yield:
//
//   Valkyrie/dog/20310203040506, seeds 9800000-9801499: 198 seeds had a
//     reachable intact doorway, 142 put the hero on one, 63 also put the pet
//     on a diagonal, of which 8 drew rn2(7) == 0.
//   Healer/cat/20291124070000, seeds 9810000-9811199: 136, 97, 45, of which 9
//     drew rn2(7) == 0.
//   Valkyrie/dog/20310203040506 with the mask set to D_NODOOR, seeds
//     9800000-9800599: 474, 363, 202.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const VALKYRIE_DATETIME = '20310203040506';
const HEALER_DATETIME = '20291124070000';

function nethackrc({ name, role, gender, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

function valkyrie(name, options = 'pettype:dog,!acoustics,mention_walls,time') {
    return nethackrc({ name, role: 'Valkyrie', gender: 'female', options });
}

function healer(name, options = 'pettype:cat,!acoustics,mention_walls,time') {
    return nethackrc({ name, role: 'Healer', gender: 'male', options });
}

// hack.c:2798 against hack.c:2843. Each segment walks the hero onto a doorway
// that still has its door and then presses the diagonal the pet is standing on.
export function loadPetDoorwayDisplacementRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case, with the message and the turn counter on. The
            // last key draws and then costs nothing: `time` puts that on
            // screen.
            {
                seed: 9800563,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('DogNortheast'),
                moves: 'hu',
            },
            // The same two keys with mention_walls off, so the refusal prints
            // nothing at all. Only the random-number log separates it from a
            // key that was never pressed.
            {
                seed: 9800563,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'DogSilent',
                    'pettype:dog,!acoustics,time',
                ),
                moves: 'hu',
            },
            // The other three diagonals, so the matrix is not pinned to one
            // direction or to one wall orientation.
            {
                seed: 9801231,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('DogSouthwest'),
                moves: 'ukb',
            },
            {
                seed: 9800091,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('DogSoutheast'),
                moves: 'yyhn',
            },
            // A search key in the middle, which is how the pet is given a turn
            // to walk onto the diagonal before the hero presses it.
            {
                seed: 9800956,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('DogNorthwest'),
                moves: 'lsy',
            },
            // The `!rn2(7)` outcome: the pet refuses, flees for rnd(6) turns,
            // and the turn is spent without the hero moving. test_move() is
            // never reached on this step.
            {
                seed: 9800378,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('DogRefuses'),
                moves: 'lllsb',
            },
            // A Healer with a cat on another date, whose different chargen
            // draws produce a different level from the same generator.
            {
                seed: 9811086,
                datetime: HEALER_DATETIME,
                nethackrc: healer('CatSouthwest'),
                moves: 'ulb',
            },
            // The refusing outcome on that second role and date.
            {
                seed: 9810188,
                datetime: HEALER_DATETIME,
                nethackrc: healer('CatRefuses'),
                moves: 'hhhu',
            },
        ],
    }, 'pet doorway displacement recipe');
}

// The negative half. hack.c doorless_door() masks off D_NODOOR and D_BROKEN
// together, so neither diagonal rule is armed at a doorway with no door and
// the same displacement completes: do_attack() declines, test_move() allows the
// step, and domove_swap_with_pet() puts the pet where the hero stood.
export function loadDoorlessPetDisplacementRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 9800177,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('SwapSoutheast'),
                moves: 'kn',
            },
            {
                seed: 9800243,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('SwapNorthwest'),
                moves: 'jy',
            },
        ],
    }, 'doorless pet displacement recipe');
}

export async function runPetDoorwayDisplacementMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet doorway displacement',
            recipe: loadPetDoorwayDisplacementRecipe(),
        }, {
            label: 'doorless pet displacement',
            recipe: loadDoorlessPetDisplacementRecipe(),
        }],
        summaryLabel: 'PET DOORWAY DISPLACEMENT',
    });
}

runMatrixCli(import.meta.url, runPetDoorwayDisplacementMatrix, 'pet doorway displacement');
