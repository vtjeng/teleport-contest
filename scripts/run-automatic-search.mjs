#!/usr/bin/env node

// Run the checked-in matrix for intrinsic automatic searching through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The consumer is allmain.c moveloop_core():342-344, `if (Searching &&
// !svl.level.flags.noautosearch && gm.multi >= 0) (void) dosearch0(1)`, which
// runs once per turn with rhack() off the stack. Only a role holding SEARCHING
// from experience level 1 -- Ranger and Archeologist, role.c ran_abil and
// arc_abil -- reaches it in a short game, so every segment picks one of those
// two and then spends turns rather than commands. Seeds were chosen by
// generating levels and reading what sits beside the hero, not by copying any
// recorded session.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral' }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

export function loadAutomaticSearchRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: eight ordinary adjacent squares. detect.c
            // dosearch0()'s loop finds no SDOOR, no SCORR and no unseen trap,
            // so the automatic search draws nothing at all and every one of
            // these ten turns costs only the monster scan around it.
            {
                seed: 7710001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'AutoSrch',
                    role: 'Ranger',
                    race: 'elf',
                    gender: 'male',
                    align: 'chaotic',
                }),
                moves: '..........',
            },
            // detect.c:2042-2051 reached without a command: an adjacent secret
            // door that plain waiting converts, through cvt_sdoor_to_door(),
            // recalc_block_point(), the Wisdom exercise, nomul(0),
            // feel_location() and "You find a hidden door." The trailing waits
            // show the converted door persisting into later turns.
            {
                seed: 9300984,
                datetime: '20280917153000',
                nethackrc: nethackrc({
                    name: 'DoorRanger',
                    role: 'Ranger',
                    race: 'elf',
                    gender: 'male',
                    align: 'chaotic',
                }),
                moves: '..................',
            },
            // detect.c:2079-2086, the trap block C does not gate on aflag: a
            // rust trap and a pit flank the hero, and both reach find_trap()
            // on separate turns, so the segment covers the arm twice at
            // different rnl(8) counts.
            {
                seed: 1144,
                datetime: DATETIME,
                nethackrc: nethackrc({ name: 'AutoSrch', role: 'Ranger' }),
                moves: '....................',
            },
            // The other role holding SEARCHING at experience level 1. A
            // falling rock trap and a squeaky board are found here, and the
            // hero's Wisdom differs from a Ranger's, so exercise(A_WIS, TRUE)
            // draws against a different attribute.
            {
                seed: 786,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Digger',
                    role: 'Archeologist',
                }),
                moves: '....................',
            },
            // A walking hero, so the 3x3 window dosearch0() scans is a
            // different set of squares on every turn rather than a fixed one.
            {
                seed: 7720037,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'AutoSrch',
                    role: 'Ranger',
                    race: 'elf',
                    gender: 'male',
                    align: 'chaotic',
                }),
                moves: 'llllhhhh',
            },
            // The control for allmain.c:342's `Searching` gate. A Valkyrie
            // holds no such intrinsic, so the same eighteen waits that convert
            // the Ranger's secret door two segments above leave this one
            // secret.
            {
                seed: 9300540,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SearchDoor',
                    role: 'Valkyrie',
                }),
                moves: '..................',
            },
        ],
    }, 'automatic search recipe');
}

export async function runAutomaticSearchMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'automatic search',
            recipe: loadAutomaticSearchRecipe(),
        }],
        summaryLabel: 'AUTOMATIC SEARCH',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runAutomaticSearchMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `automatic search: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
