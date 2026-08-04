#!/usr/bin/env node

// Fresh C/JavaScript matrix for dogmove.c pet_ranged_attk(FALSE) selecting an
// ordinary nonadjacent target, reaching mhitm.c mattackm()'s distant physical
// miss, and then letting dog_move() finish the pet's movement. The three
// starting attack arrays differ at slot zero: dog and kitten bite, pony kicks.
//
// The dog and kitten seeds were chosen by scanning newly selected seed ranges
// with the port and retaining the first case where the fixed pet's mlstmv write
// proved that mattackm() ran. The pony seed was independently chosen by the
// slice selector. No recorded-session value selected any branch or input.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20260804120000';

function healerRc(pet) {
    return 'OPTIONS=name:PetFind,role:Healer,race:human,gender:female,'
        + `align:neutral,pettype:${pet},!legacy,!tutorial,!splash_screen`;
}

export function loadPetRangedTargetingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 2026084002,
                datetime: DATETIME,
                nethackrc: healerRc('dog'),
                moves: '.....',
            },
            {
                seed: 2026085001,
                datetime: DATETIME,
                nethackrc: healerRc('cat'),
                moves: '.....',
            },
            {
                seed: 2026072220,
                datetime: '20260725120000',
                nethackrc: 'OPTIONS=name:PonyWalkWait,role:Knight,race:human,'
                    + 'gender:male,align:lawful,!legacy,!tutorial,'
                    + '!splash_screen',
                moves: ' u.',
            },
        ],
    }, 'pet ranged targeting recipe');
}

export async function runPetRangedTargetingMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pet ranged targeting',
            recipe: loadPetRangedTargetingRecipe(),
        }],
        summaryLabel: 'PET RANGED TARGETING',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPetRangedTargetingMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`pet ranged targeting: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
