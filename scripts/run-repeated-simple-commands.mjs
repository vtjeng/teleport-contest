#!/usr/bin/env node

// Run the checked-in repeated-simple-command matrix through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20300102030405';

function nethackrc({
    align = 'neutral',
    name,
    role,
    gender = 'male',
    options,
}) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

export function loadRepeatedSimpleCommandsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 42510,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'RuntimeFind',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                moves: '.'.repeat(250),
            },
            {
                seed: 50586,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'Move600',
                    role: 'Ranger',
                    options: 'pettype:none,!acoustics',
                }),
                // This independently selected quiet seed reaches the first
                // scheduled exerchk() boundary without leaving simple waits.
                moves: '.'.repeat(600),
            },
            {
                seed: 42,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'ArcLuck',
                    role: 'Archeologist',
                    options: 'pettype:none,!acoustics',
                }),
                // A worn starting fedora raises basal luck at move 600.
                moves: '.'.repeat(600),
            },
            {
                seed: 52284,
                datetime: '20320506070809',
                nethackrc: nethackrc({
                    name: 'HungerFind',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                // This independently selected quiet seed crosses both live
                // hunger messages and reaches the prompt after weakness.
                moves: '.'.repeat(851),
            },
            {
                seed: 31001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'WallWestA',
                    role: 'Healer',
                    options: 'pettype:none,mention_walls',
                }),
                moves: 'h'.repeat(12),
            },
            {
                seed: 31001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'WallWestB',
                    role: 'Healer',
                    options: 'pettype:none,!mention_walls',
                }),
                moves: 'h'.repeat(4),
            },
            {
                seed: 33003,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'WalkRepeat',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                // Each destination is an empty ROOM or CORR cell. The path
                // exercises twelve consecutive successful domove() calls.
                moves: 'hklllljhhjhh',
            },
            {
                seed: 31006,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'PetSafe',
                    role: 'Tourist',
                    options: 'mention_walls,safe_pet',
                }),
                moves: 'l',
            },
            {
                seed: 31009,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'PetRefuse',
                    role: 'Tourist',
                    options: 'mention_walls,safe_pet',
                }),
                // The first collision refuses, the second swaps while the pet
                // is still fleeing, and the waits reach timer expiry.
                moves: 'yy...',
            },
            {
                seed: 32003,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'ObjectFind',
                    role: 'Tourist',
                    options: 'mention_walls,!autopickup',
                }),
                moves: 'h',
            },
            {
                seed: 51001,
                datetime: '20320405060708',
                nethackrc: nethackrc({
                    name: 'BWall',
                    role: 'Healer',
                    gender: 'female',
                    options: 'blind,mention_walls,accessiblemsg,'
                        + '!autopickup,pettype:none,!acoustics',
                }),
                moves: 'h',
            },
            {
                seed: 51001,
                datetime: '20320405060708',
                nethackrc: nethackrc({
                    name: 'BObj',
                    role: 'Healer',
                    gender: 'female',
                    options: 'blind,!autopickup,pettype:none,!acoustics',
                }),
                // Blind look_here() pauses between the tactile preamble and
                // the item message; Space dismisses that in-command More.
                moves: 'l ',
            },
            ...[771001, 771003, 771004].map((seed) => ({
                seed,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: `Stair${seed}`,
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                // The hero starts on the upstairs, so stepping off and back
                // walks onto a STAIRS square. Each of these three fails
                // against the destination seam that admitted only ROOM and
                // CORR, and passes once STAIRS is admitted.
                moves: 'lh',
            })),
            {
                seed: 990003,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'DoorFind',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                // One step west onto a doorless doorway (D_NODOOR).
                moves: 'h',
            },
            {
                seed: 990002,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'DoorFind',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                // Four steps onto an open doorway (D_ISOPEN), the other mask
                // this slice admits.
                moves: 'ljjj',
            },
            // The monster side of the same terrain admission. The hero starts
            // on the upstairs, so a monster reaches a staircase only once the
            // hero steps off it or once it reaches the downstairs. Both fail
            // against the monster destination seam that admitted ROOM, CORR,
            // and a D_NODOOR doorway alone.
            {
                seed: 7730029,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'StairPet',
                    role: 'Ranger',
                    gender: 'female',
                    options: 'pettype:cat,!acoustics',
                }),
                // The hero walks two squares south and the kitten takes the
                // vacated upstairs, then 50 waits keep the pet moving.
                moves: `jj${'.'.repeat(50)}`,
            },
            {
                seed: 7710223,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'StairPet',
                    role: 'Valkyrie',
                    gender: 'female',
                    options: 'pettype:dog,!acoustics',
                }),
                // The hero waits on the upstairs throughout. An untamed
                // monster crosses the downstairs on the fifth wait, so this
                // case runs through m_move() rather than dog_move().
                moves: '.'.repeat(120),
            },
        ],
    }, 'repeated simple commands recipe');
}

export async function runRepeatedSimpleCommandsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'repeated simple commands',
            recipe: loadRepeatedSimpleCommandsRecipe(),
        }],
        summaryLabel: 'REPEATED SIMPLE COMMANDS',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runRepeatedSimpleCommandsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `repeated simple commands: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
