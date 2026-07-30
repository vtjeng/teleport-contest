#!/usr/bin/env node

// Run the checked-in matrix for a pet lifting an object off the floor through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Each segment is a run of searches that ends on the command prompt of the
// turn the pet picks something up, which is where dogmove.c dog_invent()'s
// carry arm hands back to moveloop_core(). One turn further and the port stops:
// check_gear_next_turn() sets I_SPECIAL, and a monster reassessing its gear is
// not ported.
//
// Seeds were found by running the port over a seed range and reading which
// object dog_invent() selected, not by copying any recorded session. The
// deliberate spread is over the object's class, whether can_carry() forces a
// stack split, whether the pet is inside distant_name()'s near square, and
// which pet fetches.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc({ pet, options = '' }) {
    return [
        'OPTIONS=name:Fetcher,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pet},!acoustics${options}`,
        '',
    ].join('\n');
}

// A segment is one seed, one pet, and `searches` repeats of the search command.
function segment({ seed, pet, searches, options }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ pet, options }),
        moves: 's'.repeat(searches),
    };
}

export function loadPetPickupRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: a kitten beside the hero takes one coin from a
            // gold pile. can_carry() caps a nohands pet at one item, so
            // carryamt != obj->quan and the stack splits before the pickup.
            segment({ seed: 8800005, pet: 'cat', searches: 2 }),
            // A whole stack instead, so otmp stays obj and splitobj() never
            // runs. A scroll also puts doname() on its unidentified-appearance
            // branch, where the pet's find names the label.
            segment({ seed: 8800176, pet: 'cat', searches: 2 }),
            // The same class eight turns in, so the pickup is not the first
            // thing the monster scan does with this level.
            segment({ seed: 8800163, pet: 'cat', searches: 8 }),
            // distu 13, past distant_name()'s neardist of 6, on a square the
            // hero can see. C names it with gd.distantname raised, so the
            // scroll's label is withheld and no discovery is recorded.
            segment({ seed: 8800285, pet: 'cat', searches: 4 }),
            // The same distant branch at distu 17 and on armor, whose
            // doname() suffixes differ from a scroll's.
            segment({ seed: 8800177, pet: 'cat', searches: 4 }),
            // A weapon, which reaches doname()'s erosion and enchantment
            // words, carried by a pet with no AT_WEAP attack.
            segment({ seed: 8800314, pet: 'cat', searches: 7 }),
            // A gem, whose xname() branch appends neither "stone" nor "gem"
            // for glass.
            segment({ seed: 8800390, pet: 'cat', searches: 3 }),
            // A split that is not gold: a shuriken stack, so the split arm is
            // exercised on an object whose weight and article both differ.
            segment({ seed: 8800025, pet: 'dog', searches: 6 }),
            // A tool, and the first little dog in the matrix. dogfood()
            // classifies for a carnivore rather than a cat here.
            segment({ seed: 8800240, pet: 'dog', searches: 2 }),
            // Coins named from outside the near square: the quantity prefix
            // still prints, but nothing is discovered.
            segment({ seed: 8800090, pet: 'dog', searches: 3 }),
            // An amulet, the one remaining class with its own xname() branch
            // that a starting pet can lift.
            segment({ seed: 8800346, pet: 'dog', searches: 5 }),
            // flags.verbose off. C still calls distant_name() for its side
            // effects and still extracts, redraws and carries; only the line
            // disappears.
            segment({
                seed: 8800005,
                pet: 'cat',
                searches: 2,
                options: ',!verbose',
            }),
            // accessiblemsg on, which is what makes dog_invent()'s pline_xy()
            // differ from a plain pline(): set_msg_xy() prefixes the line with
            // the pet's square.
            segment({
                seed: 8800005,
                pet: 'cat',
                searches: 2,
                options: ',accessiblemsg',
            }),
        ],
    }, 'pet pickup recipe');
}

export async function runPetPickupMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet pickup',
            recipe: loadPetPickupRecipe(),
        }],
        summaryLabel: 'PET PICKUP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPetPickupMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`pet pickup: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
