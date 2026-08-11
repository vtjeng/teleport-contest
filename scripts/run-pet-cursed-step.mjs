#!/usr/bin/env node

// Run the checked-in matrix for a pet stepping onto a pile whose top item the
// hero remembers, through fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// Each segment is a run of searches, which spend a turn without moving the
// hero, and ends on the command prompt of the turn dogmove.c dog_move() prints
// its `%s %s reluctantly %s %s.` line at 1307-1311 through pline.c
// pline_mon().
//
// Seeds were found by recording fresh C walks over a seed range with the
// patched reference program and reading which of them printed that line and on
// which turn, not by copying any recorded session. dog_move() makes the step
// rare on purpose: its 1237-1239 arm skips a candidate square holding a cursed
// object unless `rn2(13 * uncursedcnt)` comes up zero, so roughly one seed in
// a thousand prints the line inside forty turns.
//
// The spread is over the four things the line is assembled from: which pet
// walks (`noit_Monnam()`), the class of the top item (`distant_name(o,
// doname)`), whether that item's appearance is already known, and how far the
// pet is from the hero when it steps, which is what selects distant_name()'s
// near or far branch.
//
// Two branches of dog_move()'s selection have no segment here.
//
//   - `something`, which C uses when the hero remembers no object at the
//     square. glyph_is_object() answers FALSE only where the hero has never
//     seen the pile, and display.h canseemon() needs cansee() or infravision
//     to hold at that same square in that same moment. The two can only meet
//     in an unlit room, and mkmap.c litstate_rnd() leaves a D:1 room unlit
//     with probability 1/77 -- `rnd(1 + depth) < 11 && rn2(77)`, whose first
//     term is always true at depth 1. Multiplied by the roughly 1/1000 rate
//     at which a seed prints this line inside forty turns, and by the need
//     for an infravision race and an infravisible pet, that is out of reach
//     of a scan. scripts/dogmove.test.mjs pins the branch instead, and
//     `npm run quality -- deferrals` carries the missing C case.
//   - `"over"`, which needs is_flyer() or is_floater(). The three starting
//     pets are a kitten, a little dog and a pony, and none of them is either.
//
// The matrix keeps `!autopickup` so that the hero leaves the level's objects
// where mklev put them, which is what gives the pet something to be reluctant
// about.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20000110090000';

const VALKYRIE = {
    role: 'Valkyrie', race: 'human', gender: 'female', align: 'neutral',
};

function nethackrc({ role, race, gender, align }) {
    return [
        `OPTIONS=name:CurseScan,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=!autopickup',
        '',
    ].join('\n');
}

// One seed, one character, and `searches` repeats of the search command. The
// count runs one turn past the reluctant step, so the segment also compares
// the screen the game draws after the line.
function segment({ seed, character = VALKYRIE, searches }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(character),
        moves: 's'.repeat(searches),
    };
}

export function loadPetCursedStepRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The earliest step found, and the shortest case: the little dog
            // walks onto a scroll on the fourth turn. The line names "a
            // scroll" with no label, so the scroll is not dknown and its
            // remembered glyph is display.h obj_is_generic()'s class glyph.
            // The dog is three squares north of the hero, which is dist2 9
            // against distant_name()'s neardist of 6, so this is its far
            // branch: gd.distantname is raised and objnam.c xname_flags():627
            // makes neither the dknown write nor the discoveries entry.
            segment({ seed: 5407, searches: 4 }),
            // A kitten rather than a dog, and a weapon rather than a scroll,
            // whose doname() suffixes differ. The kitten steps onto the
            // square immediately east of the hero, so this is distant_name()'s
            // near branch and doname() runs with gd.distantname clear.
            segment({ seed: 2209, searches: 12 }),
            // A potion whose appearance the hero already knows, so doname()
            // names that appearance and obj_is_generic() answers FALSE. Also
            // the near branch, from the square immediately west.
            segment({ seed: 2351, searches: 28 }),
            // The longest run in the matrix, and the far branch again at
            // dist2 26: thirty-three turns of pet movement have to agree call
            // for call before the line is reached at all.
            segment({ seed: 4333, searches: 33 }),
        ],
    }, 'pet cursed step recipe');
}

export async function runPetCursedStepMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet cursed step',
            recipe: loadPetCursedStepRecipe(),
        }],
        summaryLabel: 'PET CURSED STEP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPetCursedStepMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`pet cursed step: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
