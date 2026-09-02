#!/usr/bin/env node

// Run the checked-in matrix for a pet that keeps the object it carries,
// through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// scripts/run-pet-drop.mjs ends each of its segments on the turn the pet puts
// its object down. This matrix ends on the turns before that one: every
// segment stops at a command prompt with the pet still holding what it picked
// up, and the turn before it ends the same way, so each segment carries at
// least two consecutive carrying prompts.
//
// Three upstream arms decide those turns, and the segments below were chosen
// to cover each of them:
//
//   - dogmove.c dog_invent():418-419. `if (!rn2(udist + 1) || !rn2(apport))`
//     guards `if (rn2(10) < apport)`, and the object stays in the pack when
//     either gate misses. Missing the first gate draws the second; missing
//     both skips rn2(10) altogether, so the two failures differ in the PRNG
//     log rather than on the screen. `apport` is untouched on every such turn.
//   - dogmove.c dog_goal():551. `!dog_has_minvent` withholds the APPORT goal
//     from a pet that already carries something, which also withholds the
//     `edog->apport > rn2(8)` draw two lines below it.
//   - dogmove.c dog_goal():576. `(dog_has_minvent && rn2(edog->apport))`
//     is the last disjunct of the close-following test, so a carrying pet
//     more than one square from the hero draws rn2(apport) that an
//     empty-handed one does not, and mostly closes the distance.
//
// Seeds were found by running the port over a seed range and reading which
// object dog_invent() lifted, on which turn it put it down, and which of the
// three arms above each intervening turn reached. No value here comes from a
// recorded session.
//
// As in scripts/run-pet-drop.mjs, `edog->apport` is 3 for every starting pet
// in every role, because allmain.c newgame() calls makedog() at 813 and
// u_init_inventory_attrs() only at 815, so dog.c:60's ACURR(A_CHA) reads an
// attribute array that init_attr() has not filled and acurr() floors the
// result at 3. The live variable is therefore the hero-to-pet distance in
// `!rn2(udist + 1)`, which the segments below spread from 1 to 20.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

const VALKYRIE = {
    role: 'Valkyrie', race: 'human', gender: 'female', align: 'neutral',
};
const TOURIST = {
    role: 'Tourist', race: 'human', gender: 'male', align: 'neutral',
};
const PRIEST = {
    role: 'Priest', race: 'human', gender: 'female', align: 'neutral',
};
const SAMURAI = {
    role: 'Samurai', race: 'human', gender: 'male', align: 'lawful',
};

function nethackrc({ role, race, gender, align, pet, options = '' }) {
    return [
        `OPTIONS=name:Carrier,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pet},!acoustics${options}`,
        '',
    ].join('\n');
}

// A segment is one seed, one character, one pet, and `searches` repeats of the
// search command, which spends a turn and leaves the hero where he is. The
// count stops the segment one turn short of the drop, so the pet is still
// carrying at the last two prompts.
function segment({ seed, character, pet, searches, options }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ ...character, pet, options }),
        moves: 's'.repeat(searches),
    };
}

export function loadPetCarryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The smallest case: the kitten lifts a flail on the
            // second-to-last turn, so the drop gate runs exactly once and
            // misses on both draws, leaving rn2(10) undrawn. It closes from
            // udist 9 to udist 4, reaching dog_goal():576 twice.
            segment({
                seed: 8910007, character: VALKYRIE, pet: 'cat', searches: 15,
            }),
            // The widest separation in the matrix, udist 20 then 10. A large
            // `udist + 1` makes the first gate miss almost every turn, so the
            // second gate is drawn on seven of them, and 576's rn2(apport)
            // keeps steering the kitten back towards the hero.
            segment({
                seed: 8910071, character: VALKYRIE, pet: 'cat', searches: 9,
            }),
            // The one segment whose pet has already dropped something once,
            // so `apport` is 2 rather than 3 and both apport-bounded draws
            // change bound. It also has the matrix's densest 551 suppression
            // for a kitten: 21 objects passed over because it carries gold.
            segment({
                seed: 8910112, character: VALKYRIE, pet: 'cat', searches: 21,
            }),
            // A spellbook, and neither dog_goal() arm: nothing in range to
            // suppress at 551 and the pet never leaves the hero's side, so
            // 576's `udist > 1` never holds. The drop gate alone decides.
            segment({
                seed: 8910069, character: VALKYRIE, pet: 'cat', searches: 6,
            }),
            // The first little dog, closing from udist 5, with both dog_goal()
            // arms live in the same segment.
            segment({
                seed: 8911058, character: SAMURAI, pet: 'dog', searches: 17,
            }),
            // Food the pet chose to carry rather than eat, and still holds 25
            // turns in. dog_invent()'s `droppables()` arm precedes the eat and
            // pickup arms, so a carrying pet never reaches dogfood() for the
            // square it stands on however edible that square is.
            segment({
                seed: 8911044, character: SAMURAI, pet: 'dog', searches: 25,
            }),
            // A long sword, and the second segment in which rn2(10) is never
            // reached. The object class differs from the flail above and so
            // does the role, which fixes a different starting inventory.
            segment({
                seed: 8911091, character: SAMURAI, pet: 'dog', searches: 11,
            }),
            // The mirror of the two segments above: `!rn2(udist + 1)` succeeds
            // on every carrying turn, so the second gate is never drawn and
            // rn2(10) decides alone.
            segment({
                seed: 8911105, character: SAMURAI, pet: 'dog', searches: 6,
            }),
            // The densest 551 suppression in the matrix, 28 objects passed
            // over, on the role whose own inventory is largest.
            segment({
                seed: 8912003, character: TOURIST, pet: 'dog', searches: 22,
            }),
            // Blank paper: an unidentified scroll, whose remembered glyph is
            // display.h obj_is_generic()'s, carried past nothing at all, so
            // 551 never fires while 576 does.
            segment({
                seed: 8912115, character: TOURIST, pet: 'dog', searches: 17,
            }),
            // The densest drop gate in the matrix: a kitten is faster than
            // the hero, so mon.c mcalcmove() gives it a second move on some
            // turns and dog_invent() runs 19 times across 17 prompts.
            segment({
                seed: 8913001, character: PRIEST, pet: 'cat', searches: 17,
            }),
            // A banana, and the matrix's longest run of turns that pass the
            // first gate and then miss `rn2(10) < apport`: thirteen rn2(10)
            // draws that change nothing.
            segment({
                seed: 8913080, character: PRIEST, pet: 'cat', searches: 20,
            }),
            // Thirteen second-gate draws, the most of any segment, from a pet
            // that never drops across 25 turns.
            segment({
                seed: 8913082, character: PRIEST, pet: 'cat', searches: 25,
            }),
            // The shortest segment: a potion picked up and still held five
            // turns into the level, with a single rn2(10) between.
            segment({
                seed: 8913022, character: PRIEST, pet: 'cat', searches: 4,
            }),
        ],
    }, 'pet carry recipe');
}

export async function runPetCarryMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet carry',
            recipe: loadPetCarryRecipe(),
        }],
        summaryLabel: 'PET CARRY',
    });
}

runMatrixCli(import.meta.url, runPetCarryMatrix, 'pet carry');
