#!/usr/bin/env node

// Run the checked-in matrix for the explicit search command through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// Each segment ends on a command prompt, which is where detect.c dosearch()
// hands back to moveloop_core(). Seeds were chosen by generating levels and
// reading what sits beside the hero, not by copying any recorded session.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

export function loadExplicitSearchRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: eight ordinary adjacent squares. No square is an
            // SDOOR, an SCORR, or an unseen trap, so dosearch0()'s loop draws
            // nothing at all and the turn's only randomness is the monster
            // scan moveloop_core() already ran before this slice.
            {
                seed: 9300001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Searcher',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'sss.s',
            },
            // The same command reached by name. extcmdlist[]'s search row
            // carries no AUTOCOMPLETE flag, so the whole word has to be typed
            // and only tty_get_ext_cmd()'s ECM_EXACTMATCH lookup resolves it.
            {
                seed: 9300001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Searcher',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: '#search\n.',
            },
            // A pet beside the hero, which is mfind0()'s common arm: a spotted
            // monster that is neither mimicking nor hidden, redrawn with
            // newsym() and answered 0 so the search carries on.
            {
                seed: 9300003,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SearchPet',
                    role: 'Valkyrie',
                    options: 'pettype:dog,!acoustics',
                }),
                moves: 'ss.',
            },
            // A corridor square: the eight neighbours are corridor and solid
            // stone rather than room and wall, and the hero is off the
            // upstairs.
            {
                seed: 9300013,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SearchCorr',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'llsss.',
            },
            // An adjacent secret door found on the eighth search: seven
            // rnl(7 - fund) misses, then the hit that runs
            // cvt_sdoor_to_door(), recalc_block_point(), the Wisdom exercise,
            // nomul(0), feel_location() and the message. The trailing wait
            // shows the converted door persisting into the next turn.
            {
                seed: 9300540,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SearchDoor',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'ssssssss.',
            },
            // The same arm at a different miss count and on a different role,
            // whose starting weapon changes nothing about fund but does change
            // the status line the search turn repaints.
            {
                seed: 9300984,
                datetime: '20280917153000',
                nethackrc: nethackrc({
                    name: 'DoorRanger',
                    role: 'Ranger',
                    race: 'elf',
                    gender: 'male',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'ssssss.',
            },
            // The secret door found on the very first search, so the hit is
            // the first rnl() the command ever draws.
            {
                seed: 9301133,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'DoorFirst',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 's.',
            },
            // An adjacent unseen arrow trap: two rnl(8) misses, then
            // find_trap() through nomul(0), the Wisdom exercise and the
            // "You find an arrow trap." message.
            {
                seed: 9300209,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SearchTrap',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'ssss.',
            },
            // A trap door, whose glyph and article differ from the arrow
            // trap's and whose discovery still consumes no further randomness.
            {
                seed: 9300542,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'TrapDoor',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'ssss.',
            },
            // A rust trap found on the first search, under a Healer whose
            // Wisdom differs from a Valkyrie's, so exercise(A_WIS, TRUE) draws
            // against a different attribute.
            {
                seed: 9310035,
                datetime: '20291124070000',
                nethackrc: nethackrc({
                    name: 'TrapHealer',
                    role: 'Healer',
                    gender: 'male',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'ss.',
            },
            // do.c cmd_safety_prevention() with a hostile beside the hero.
            // cmdassist on is the branch that always appends the assist text
            // and leaves ga.already_found_flag at zero; no search takes place
            // and no turn passes.
            {
                seed: 9300002,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'SafeWait',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                moves: 'ssssss',
            },
            // The other branch of the same test. With cmdassist off,
            // ga.already_found_flag counts the prevented searches: the first
            // gets the assist text, the second does not, and the third repeats
            // the second, which Norep() suppresses.
            {
                seed: 9300223,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'FoundFlag',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics,!cmdassist',
                }),
                moves: 'ssss',
            },
            {
                seed: 9300161,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'FoundFlag',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics,!cmdassist',
                }),
                moves: 'sss',
            },
        ],
    }, 'explicit search recipe');
}

export async function runExplicitSearchMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'explicit search',
            recipe: loadExplicitSearchRecipe(),
        }],
        summaryLabel: 'EXPLICIT SEARCH',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runExplicitSearchMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `explicit search: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
