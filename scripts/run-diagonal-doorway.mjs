#!/usr/bin/env node

// Run the checked-in matrix for hack.c test_move()'s two diagonal doorway
// rules through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Both rules refuse the step and spend no time: test_move() returns FALSE and
// domove_core():2843-2849 answers that with `svc.context.move = 0; nomul(0)`
// because svc.context.door_opened is clear. What a recording shows is
// therefore the unchanged hero glyph and, with `time` set, the unchanged turn
// counter -- plus one message line each, since flags.mention_walls gates both.
// The entry rule (hack.c:1139-1150) adds Underwater to that gate and calls
// feel_location() for a blind hero; the exit rule (hack.c:1208-1214) does
// neither.
//
// Seeds were chosen by generating levels and reading the doorway masks around
// the hero, not by copying any recorded session. The recorded sessions are not
// consulted for inputs anywhere in this file.

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

function valkyrie(name, options = 'pettype:none,!acoustics') {
    return nethackrc({ name, role: 'Valkyrie', gender: 'female', options });
}

function healer(name, options = 'pettype:none,!acoustics') {
    return nethackrc({ name, role: 'Healer', gender: 'male', options });
}

// hack.c:1139-1150. A doorway whose mask fails doorless_door() refuses a
// diagonal arrival, whichever of the four diagonals it lies on.
export function loadDiagonalDoorwayEntryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case, with mention_walls off: the refusal is silent,
            // the hero does not move, and no turn elapses. Nothing but the
            // cursor distinguishes it from a key that was never pressed, which
            // is exactly what C does here.
            {
                seed: 9700037,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('OpenDoorway'),
                moves: 'b',
            },
            // The same step with the message turned on and `time` set, so the
            // turn counter is on screen to show that the refusal costs
            // nothing.
            {
                seed: 9700037,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'WallSpeak',
                    'pettype:none,!acoustics,mention_walls,time',
                ),
                moves: 'b',
            },
            // The opposite diagonal at a doorway in the other wall
            // orientation, so the rule is not pinned to one direction.
            {
                seed: 9700599,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'NorthEast',
                    'pettype:none,!acoustics,mention_walls',
                ),
                moves: 'u',
            },
            // A blind hero. hack.c:1144 feels the destination before the
            // message gate, and mention_walls is off here, so the square the
            // hero maps by touch is the whole observable difference.
            {
                seed: 9700121,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'FeelDoorway',
                    'pettype:none,!acoustics,blind',
                ),
                moves: 'y',
            },
            // The mask the hero made himself. The first key pulls a closed
            // door open diagonally -- test_move()'s closed-door arm at
            // hack.c:1075 runs before testdiag -- and the second key finds the
            // D_ISOPEN it left and is refused.
            {
                seed: 9400080,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'OpenedIt',
                    'pettype:none,!acoustics,mention_walls',
                ),
                moves: 'yy',
            },
            // A Healer on another date, whose different chargen draws produce
            // a different level from the same generator.
            {
                seed: 9710372,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'HealEntry',
                    'pettype:none,!acoustics,mention_walls',
                ),
                moves: 'b',
            },
        ],
    }, 'diagonal doorway entry recipe');
}

// hack.c:1208-1214, the mirror rule read off `ust = &levl[ux][uy]`. It looks
// at the square the hero is leaving, so the destination is irrelevant: every
// diagonal off an intact doorway is refused.
export function loadDiagonalDoorwayExitRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: one step onto an open doorway, then a diagonal
            // off it, with mention_walls off. The first key spends a turn and
            // the second spends none.
            {
                seed: 9700036,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('LeaveDoorway'),
                moves: 'hy',
            },
            // The same pair with the message and the turn counter on.
            {
                seed: 9700036,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'LeaveSpeak',
                    'pettype:none,!acoustics,mention_walls,time',
                ),
                moves: 'hy',
            },
            // A doorway entered from the north and left to the southeast, so
            // neither the arrival direction nor the departure direction is
            // fixed across the matrix.
            {
                seed: 9700234,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'SouthEast',
                    'pettype:none,!acoustics,mention_walls',
                ),
                moves: 'kn',
            },
            // The hero opens the door, steps onto the doorway it leaves, and
            // is then refused the diagonal. Three keys, of which only the
            // middle one spends a turn.
            {
                seed: 9400016,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'OpenThenLeave',
                    'pettype:none,!acoustics,mention_walls',
                ),
                moves: 'hhu',
            },
            // A pet beside the hero. The refused diagonal spends no time, so
            // the kitten must not move between the second key and the prompt.
            {
                seed: 9700563,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'PetWatches',
                    'pettype:dog,!acoustics,mention_walls',
                ),
                moves: 'lu',
            },
            // A Healer on another date, leaving a doorway to the northeast.
            {
                seed: 9710212,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'HealExit',
                    'pettype:none,!acoustics,mention_walls',
                ),
                moves: 'lu',
            },
        ],
    }, 'diagonal doorway exit recipe');
}

// The negative half of the same predicate. hack.c doorless_door() masks off
// D_NODOOR and D_BROKEN together, so a doorway with no door in it arms neither
// rule and both diagonals go through. Without these segments the matrix would
// pass just as well against a port that refused every diagonal at a doorway.
export function loadDoorlessDoorwayRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A diagonal onto a D_NODOOR doorway and then a diagonal off it,
            // both admitted, both spending a turn.
            {
                seed: 9600003,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'Doorless',
                    'pettype:none,!acoustics,mention_walls,time',
                ),
                moves: 'nu',
            },
            // The same exit reached orthogonally, at a doorway in a wall of
            // the other orientation.
            {
                seed: 9600004,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'DoorlessExit',
                    'pettype:none,!acoustics,mention_walls,time',
                ),
                moves: 'hn',
            },
        ],
    }, 'doorless doorway recipe');
}

export async function runDiagonalDoorwayMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'diagonal doorway entry',
            recipe: loadDiagonalDoorwayEntryRecipe(),
        }, {
            label: 'diagonal doorway exit',
            recipe: loadDiagonalDoorwayExitRecipe(),
        }, {
            label: 'doorless doorway',
            recipe: loadDoorlessDoorwayRecipe(),
        }],
        summaryLabel: 'DIAGONAL DOORWAY',
    });
}

runMatrixCli(import.meta.url, runDiagonalDoorwayMatrix, 'diagonal doorway');
