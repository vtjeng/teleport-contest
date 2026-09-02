#!/usr/bin/env node

// Run the checked-in matrix for steed.c mount_steed()'s success path and
// steed.c dismount_steed() through fresh C recordings. Every segment contains
// replay inputs only; runFreshMatrix() records new reference output in an
// isolated temporary workspace.
//
// Each segment types `#ride` twice. The first answers getdir() with a
// direction whose square holds the saddled starting pony and whose impairment
// roll passes, so mount_steed() reaches steed.c:358; the second finds
// u.usteed set and takes doride()'s first arm into
// dismount_steed(DISMOUNT_BYCHOICE).
//
// The success arm itself spends no random numbers -- maybewakesteed() draws
// only for a frozen steed and steed_vs_stealth() draws nothing -- but the two
// commands are not free. Each charges a turn, so the steed collects a
// mcalcmove() ration of its own and u_calc_moveamt() takes a second one
// through mcalcmove(u.usteed, TRUE); and landing_spot() draws rn2(viable) to
// break a tie between equally distant landing squares. The recorded PRNG log
// is what pins all three.
//
// Only a Knight can reach a saddled steed: dog.c makedog():263-268 saddles a
// starting pet solely when `pettype == PM_PONY`, and role.c:209 gives that
// petnum to the Knight alone.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

// The recorder's terminal has ICRNL set, so the '\n' that terminates the
// command name is what a recorded carriage return becomes.
export const RIDE_COMMAND = '#ride\n';
const WAIT = '.';

function nethackrc({ gender, options }) {
    return [
        `OPTIONS=name:Rider,role:Knight,race:human,gender:${gender},`
        + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens with a wait, so the ride is attempted against a level
// the hero has already spent a turn on rather than against the arrival screen.
function segment(seed, direction, { gender = 'male', options = PLAIN,
                                    after = WAIT } = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ gender, options }),
        moves: `${WAIT}${RIDE_COMMAND}${direction}${RIDE_COMMAND}${after}`,
    };
}

const PLAIN = '!acoustics';
// flags.time puts the turn counter on the status line, which is how a segment
// shows that each of the two rides costs the hero exactly one turn.
const WITH_TIME = '!acoustics,time';

export function loadRideDismountRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the four orthogonal directions ---
            // A ride south and back off again, then a wait, so the screen
            // after the dismount is recorded twice: once with the unnamed-
            // steed line on it and once with the map redrawn under it.
            segment(7730201, 'j'),
            segment(7730220, 'h'),
            segment(7730252, 'k'),
            // The dismount followed by a step rather than a wait, which is
            // what shows the hero really is back on the map at the landing
            // spot teleds() moved him to.
            segment(7730101, 'l', { after: 'l' }),

            // --- the four diagonals ---
            // A diagonal mount is the one route through mount_steed()'s
            // test_move(TEST_MOVE) call that exercises the two diagonal
            // doorway rules, and landing_spot() then calls test_move() again
            // for each of the eight squares around the steed.
            segment(7730205, 'b'),
            segment(7730219, 'u'),
            // The steed stands in a doorway here, so the hero mounts onto a
            // DOOR square and dismounts off one.
            segment(7730209, 'n'),
            segment(7730302, 'n', { gender: 'female' }),

            // --- the option that shows the turn accounting ---
            segment(7730213, 'l', { options: WITH_TIME }),
        ],
    }, 'ride dismount recipe');
}

export async function runRideDismountMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ride dismount',
            recipe: loadRideDismountRecipe(),
        }],
        summaryLabel: 'RIDE DISMOUNT',
    });
}

runMatrixCli(import.meta.url, runRideDismountMatrix, 'ride dismount');
