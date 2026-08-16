#!/usr/bin/env node

// Run the checked-in matrix for a pet fight the hero cannot see, through fresh
// C recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// What the matrix pins is mhitm.c noises() (26-38) and the pline.c You_hear()
// (435-451) it prints through. mhitm.c mattackm():362-364 builds gv.vis from
// cansee() and canspotmon(); when both are false, hitmm() and missmm() swap
// their named line for this one. gf.far_noise and gn.noisetime then rate-limit
// it to one line per ten moves at each distance band, and decl.c:341 and :555
// start them at FALSE and 0.
//
// The three rows differ only in the rc, which is what makes them a matrix:
//
//   plain        the hero hears the line.
//   deaf         youprop.h:125 Deaf reads u.uroleplay.deaf, so noises()
//                returns before it writes either field.
//   !acoustics   noises() writes both fields and You_hear() returns without
//                printing, because flags.acoustics gates it there and nowhere
//                else.
//
// The two rc lines change the game as well as the line, because sounds.c
// dosounds() returns on the same two conditions and its draws disappear with
// it. That is why the quiet rows use a different seed from the loud one rather
// than the same game with an option added.
//
// The replay is spaces throughout, for the reason
// scripts/run-pet-melee-attack.mjs gives: `rest_on_space` binds <space> to
// #wait and `!safe_wait` drops the query that would otherwise refuse every
// wait beside a hostile.
//
// Seeds came from a C-side scan, not from any recorded session. The scan
// recorded Valkyrie seeds 7710001-7711000 at the datetime below with forty
// spaces each and kept the ones holding a step whose rng log has a draw at
// mhitm.c:441 and whose message line names no melee verb, which is what an
// unseen fight looks like. Its domain and yield:
//
//   Valkyrie/female/neutral, seeds 7710001-7711000, plain rc: 993 recorded,
//   11 with an unseen fight, 1 that the port replays in full.
//   The same seeds with either quiet rc: 393 recorded over 7710001-7710400,
//   6 with an unseen fight, 3 unambiguous, 1 that the port replays in full.
//
// The three rows together record 11795 PRNG calls, 123 screens and 123
// cursors.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const UNSEEN_PET_FIGHT_DATETIME = '20260401120000';

// A pet is the point of the matrix, so pettype is left at its default and the
// role decides the species: a Valkyrie gets whichever of the kitten and the
// little dog makemon.c pet_type()'s rn2(2) picks.
function rc(...extra) {
    return [
        'OPTIONS=name:FreshDiff,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=rest_on_space,!safe_wait',
        ...extra,
        '',
    ].join('\n');
}

export const UNSEEN_PET_FIGHT_RC = rc();
export const UNSEEN_PET_FIGHT_DEAF_RC = rc('OPTIONS=deaf');
export const UNSEEN_PET_FIGHT_QUIET_RC = rc('OPTIONS=!acoustics');

function waits(count) {
    return ' '.repeat(count);
}

export function loadUnseenPetFightRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The loud row. A little dog fights a kobold out of sight at step
            // 34, in the near band, and the ten-move rule has long since
            // opened, so C prints "You hear some noises.".
            { seed: 7710110, datetime: UNSEEN_PET_FIGHT_DATETIME,
                nethackrc: UNSEEN_PET_FIGHT_RC, moves: waits(40) },
            // The deaf row. Four unseen fights run at steps 30 to 33 and the
            // message line stays blank through all of them.
            { seed: 7710395, datetime: UNSEEN_PET_FIGHT_DATETIME,
                nethackrc: UNSEEN_PET_FIGHT_DEAF_RC, moves: waits(40) },
            // The !acoustics row. The same seed and the same four fights: the
            // two rc lines suppress the same dosounds() draws, so the games
            // run identically and only the gate that silences the line
            // differs.
            { seed: 7710395, datetime: UNSEEN_PET_FIGHT_DATETIME,
                nethackrc: UNSEEN_PET_FIGHT_QUIET_RC, moves: waits(40) },
        ],
    }, 'unseen pet fight recipe');
}

async function main() {
    await runFreshMatrix({
        entries: [{
            label: 'unseen pet fight',
            recipe: loadUnseenPetFightRecipe(),
        }],
        summaryLabel: 'unseen pet fight',
    });
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main().catch((error) => {
        process.stderr.write(`run-unseen-pet-fight: ${error.message}\n`);
        process.exitCode = 2;
    });
}
