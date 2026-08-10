#!/usr/bin/env node

// Run the checked-in matrix for a mounted hero's step through hack.c
// domove_core() against fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// scripts/run-ride-dismount.mjs covers getting on and off. This matrix covers
// what happens in between: the three places domove_core() reads or writes
// u.usteed. Its 2815-2818 gate asks stucksteed() whether the steed can move at
// all; 2879-2884 walks the steed's <mx,my> onto the hero's tentative square and
// calls steed.c exercise_steed(); and 2921-2926 puts both back when a pet
// declines the swap. Only the first two are reachable here, because
// js/hack.js domove_swap_with_pet() has no FALSE return yet.
//
// The counter exercise_steed() keeps, u.urideturns, is the whole of what a
// mounted step leaves behind below its hundredth call, so every segment is
// verified against the number of steps its keys spend rather than against a
// message. verifyMountedMoveSegment() below reads it out of the replayed game.
//
// Only a Knight can reach a saddled steed: dog.c makedog():263-268 saddles a
// starting pet solely when `pettype == PM_PONY`, and role.c:209 gives that
// petnum to the Knight alone.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';
import { RIDE_COMMAND } from './run-ride-dismount.mjs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';
// flags.time puts the turn counter on the status line, so a step that should
// have cost no time shows up as a wrong T: on the very next screen.
const OPTIONS = '!acoustics,time';

function nethackrc(gender) {
    return [
        `OPTIONS=name:Rider,role:Knight,race:human,gender:${gender},`
        + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${OPTIONS}`,
        '',
    ].join('\n');
}

// No segment may open with a wait. The turn a wait spends moves mount_steed()'s
// impairment roll onto a different draw, and on seed 8815 that draw slips: the
// hero never gets on, and every later key exercises walking on foot. The mount
// message each case asserts is what keeps that from passing unnoticed.
//
// `rideTurns` is the number of exercise_steed() calls the keys after the mount
// direction are expected to make, counted from the map the segment starts on.
// `stillMounted` says whether the segment ends before the closing #ride.
export const MOUNTED_MOVE_CASES = Object.freeze([
    {
        // 121 steps around a closed room, which is the one case that reaches
        // exercise_steed()'s `u.urideturns >= 100` arm and its
        // use_skill(P_RIDING, 1). The counter resets there, so 121 steps end
        // on 21.
        label: 'ordinary steps past the hundredth',
        seed: 8815,
        gender: 'female',
        moves: `j${'hhhhhlllll'.repeat(12)}${RIDE_COMMAND}`,
        rideTurns: 21,
        stillMounted: false,
    },
    {
        // Repeated rush keystrokes, each spending one turn. The label says
        // runs, and a shift key does start a rush, but on this map each one
        // stops after a single square -- so what this case pins is the rush
        // command reaching domove() while mounted, not a multi-turn run
        // accumulating several exercise_steed() calls. A case that crosses
        // several squares on one keystroke is not recorded yet.
        label: 'shift-runs east and west',
        seed: 8815,
        gender: 'male',
        moves: `${'HL'.repeat(10)}hl${RIDE_COMMAND}`,
        rideTurns: 22,
        stillMounted: false,
    },
    {
        // A step into the room's east wall. test_move() declines it above the
        // steed write, so the steed stays where it is and trains nothing --
        // which is what pins the write below test_move() rather than above it.
        label: 'a step the wall refuses',
        seed: 8815,
        gender: 'male',
        moves: 'l.',
        rideTurns: 0,
        stillMounted: true,
    },
    {
        // The four diagonals. NODIAG() spares a pony, and a diagonal step is
        // the one that reaches test_move()'s squeeze rules.
        label: 'the four diagonal steps',
        seed: 8815,
        gender: 'male',
        moves: 'bynu.',
        rideTurns: 4,
        stillMounted: true,
    },
    {
        // One step and then two swings at an adjacent kobold, a miss and a
        // kill. do_attack() returns before the steed write, so the two attacks
        // train nothing and only the step counts.
        label: 'melee from the saddle',
        seed: 6128,
        gender: 'female',
        moves: 'hhh..',
        rideTurns: 1,
        stillMounted: true,
    },
]);

// The direction that answers doride()'s getdir() with the saddled pony's
// square, read off the recorded arrival screen for each seed.
const MOUNT_DIRECTION = new Map([[8815, 'l'], [6128, 'n']]);

function segmentFor(mountedCase) {
    const direction = MOUNT_DIRECTION.get(mountedCase.seed);
    if (!direction) throw new Error(`no mount direction for ${mountedCase.seed}`);
    return {
        seed: mountedCase.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(mountedCase.gender),
        moves: `${RIDE_COMMAND}${direction}${mountedCase.moves}`,
    };
}

export function loadMountedMoveRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: MOUNTED_MOVE_CASES.map(segmentFor),
    }, 'mounted move recipe');
}

export function caseForSegment(segment) {
    const found = MOUNTED_MOVE_CASES.find(
        (mountedCase) => segmentFor(mountedCase).moves === segment.moves
            && segmentFor(mountedCase).seed === segment.seed,
    );
    if (!found) throw new Error(`no mounted-move case types ${segment.moves}`);
    return found;
}

export async function verifyMountedMoveSegment(segment) {
    const mountedCase = caseForSegment(segment);
    let boundary = null;
    await runSegment(
        { ...segment, storage: { get: () => undefined, set: () => {} } },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary)
        throw new Error(`${mountedCase.label} stopped: ${boundary.message}`);
    if (game.u.urideturns !== mountedCase.rideTurns) {
        throw new Error(
            `${mountedCase.label} trained ${game.u.urideturns} ride turns,`
            + ` not ${mountedCase.rideTurns}`,
        );
    }
    if (Boolean(game.u.usteed) !== mountedCase.stillMounted)
        throw new Error(`${mountedCase.label} ended on the wrong mount state`);
    // hack.c:2879-2884 and dungeon.c u_on_newpos() both put the steed on the
    // hero's square, so a still-mounted segment that ends anywhere else means
    // one of them stopped writing.
    if (mountedCase.stillMounted
        && (game.u.usteed.mx !== game.u.ux || game.u.usteed.my !== game.u.uy)) {
        throw new Error(`${mountedCase.label} left the steed behind`);
    }
}

export async function runMountedMoveMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'mounted move',
            recipe: loadMountedMoveRecipe(),
        }],
        summaryLabel: 'MOUNTED MOVE',
        verifySegment: verifyMountedMoveSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMountedMoveMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`mounted move: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
