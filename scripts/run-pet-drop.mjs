#!/usr/bin/env node

// Run the checked-in matrix for a pet putting a carried object back on the
// floor through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Each segment is a run of searches that ends on the command prompt of the
// turn the pet drops what it carries, which is where dogmove.c dog_invent()'s
// `droppables()` arm hands back to moveloop_core() through steal.c relobj()
// and mdrop_obj().
//
// Seeds were found by running the port over a seed range and reading which
// object dog_invent() dropped and on which turn, not by copying any recorded
// session. The deliberate spread is over the dropped object's class, the
// hero-to-pet distance that selects distant_name()'s near or far branch, which
// pet drops, and the two message options.
//
// `edog->apport` is not a variable here, and that is upstream's doing rather
// than this matrix's. dog.c:60 sets it to ACURR(A_CHA), but allmain.c
// newgame() calls makedog() at 813 and u_init_inventory_attrs() only at 815,
// so the attribute array is still zero and acurr()'s floor returns 3. A fresh
// recording of seed 8902029 with a Charisma-18 Tourist logs
// `rn2(3) @ dog_invent(dogmove.c:418)`, so C agrees. Every starting pet in
// every role therefore begins with apport 3, and the live gate is
// `!rn2(udist + 1)`, which is why the segments below vary the distance.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
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

function nethackrc({ role, race, gender, align, pet, options = '' }) {
    return [
        `OPTIONS=name:Dropper,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pet},!acoustics${options}`,
        '',
    ].join('\n');
}

// A segment is one seed, one character, one pet, and `searches` repeats of the
// search command, which spends a turn and leaves the hero where he is.
function segment({ seed, character, pet, searches, options }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ ...character, pet, options }),
        moves: 's'.repeat(searches),
    };
}

export function loadPetDropRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case, and the earliest drop found: the kitten lifts a
            // gold piece and puts it down on the very next turn, so one top
            // line carries both messages.
            segment({
                seed: 8900075, character: VALKYRIE, pet: 'cat', searches: 2,
            }),
            // A potion, whose unobserved appearance is display.h
            // obj_is_generic()'s own class, so the square's remembered glyph
            // is the generic one until the hero walks nearer.
            segment({
                seed: 8900073, character: VALKYRIE, pet: 'cat', searches: 5,
            }),
            // A tool, and the first drop that lands beside a pet which then
            // walks off the square, so the object's glyph appears through
            // m_move()'s newsym() rather than the drop's.
            segment({
                seed: 8900010, character: VALKYRIE, pet: 'cat', searches: 6,
            }),
            // A weapon, which reaches doname()'s erosion and enchantment
            // words, fifteen turns in rather than at the start of the level.
            segment({
                seed: 8900022, character: VALKYRIE, pet: 'cat', searches: 15,
            }),
            // Armor, whose doname() suffixes differ from a weapon's.
            segment({
                seed: 8900021, character: VALKYRIE, pet: 'cat', searches: 14,
            }),
            // A spellbook: the second of obj_is_generic()'s three classes.
            segment({
                seed: 8900062, character: VALKYRIE, pet: 'cat', searches: 19,
            }),
            // A wand, whose xname() names the appearance rather than the type.
            segment({
                seed: 8900064, character: VALKYRIE, pet: 'cat', searches: 17,
            }),
            // A scroll dropped at udist 4, outside distant_name()'s near
            // square, so C names it with gd.distantname raised and the label
            // is withheld from the discovery ledger.
            segment({
                seed: 8901011, character: VALKYRIE, pet: 'dog', searches: 9,
            }),
            // A gem: the third of obj_is_generic()'s classes, and the first
            // little dog in the matrix.
            segment({
                seed: 8901021, character: VALKYRIE, pet: 'dog', searches: 8,
            }),
            // A ring, the remaining class with its own xname() branch that a
            // starting pet can lift and put down.
            segment({
                seed: 8901084, character: VALKYRIE, pet: 'dog', searches: 11,
            }),
            // A stack rather than a single object: throwing stars, whose
            // quantity prefix and plural both have to survive the drop.
            segment({
                seed: 8902058, character: TOURIST, pet: 'dog', searches: 15,
            }),
            // A container. obj_extract_self() and place_object() carry its
            // cobj chain with it, and obj_no_longer_held() walks that chain.
            segment({
                seed: 8902066, character: TOURIST, pet: 'dog', searches: 12,
            }),
            // udist 16, far outside the near square, so distant_name() takes
            // its far branch on armor rather than on the scroll above.
            segment({
                seed: 8903037, character: PRIEST, pet: 'cat', searches: 20,
            }),
            // Food the pet chose to carry rather than eat, so dogfood()'s
            // classification and the drop arm meet on the same object.
            segment({
                seed: 8903049, character: PRIEST, pet: 'cat', searches: 6,
            }),
            // flags.verbose off. C still calls distant_name() for its side
            // effects and still extracts and places the object; only the line
            // disappears, because mdrop_obj()'s `verbosely` argument is
            // `is_pet && flags.verbose`.
            segment({
                seed: 8900075,
                character: VALKYRIE,
                pet: 'cat',
                searches: 2,
                options: ',!verbose',
            }),
            // accessiblemsg on, which is what makes mdrop_obj()'s pline_mon()
            // differ from a plain pline(): set_msg_xy() prefixes the line with
            // the dropping monster's square.
            segment({
                seed: 8900075,
                character: VALKYRIE,
                pet: 'cat',
                searches: 2,
                options: ',accessiblemsg',
            }),
        ],
    }, 'pet drop recipe');
}

export async function runPetDropMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet drop',
            recipe: loadPetDropRecipe(),
        }],
        summaryLabel: 'PET DROP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPetDropMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`pet drop: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
