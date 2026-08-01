#!/usr/bin/env node

// Run the checked-in matrix for do.c goto_level() through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The hero walks from the up staircase she starts on to the level's down
// staircase and presses `>`. What she sees next is not the new level: C prints
// "You descend the stairs.", and docrt()'s cls() flushes the message window
// before it clears the map, so the run stops at a `--More--` drawn over the
// level being left, with the status line still reading Dlvl:1. Each segment
// therefore ends with a space, which dismisses that prompt and lets the D:2
// map, its status line and the arrival tail through.
//
// Both halves matter, so every segment is compared strictly: the random-number
// stream of the whole of mklev() for D:2, the `--More--` screen, the D:2
// screen, and the cursor at each.
//
// Choosing the walks: the paths were found by breadth-first search over the
// generated map, then replayed through the port to confirm that the hero
// really reaches the staircase and that nothing unported interrupts her. Each
// seed is otherwise arbitrary; the fixed datetime is shared because the date
// changes level generation, which would invalidate every path.
//
// What no segment covers, and why. D:2 is deep enough for mklev.c
// makelevel()'s shop test to fire, so roughly half of the levels reachable
// here ask for a shop; js/mkroom.js mkshop() stops on the room it would
// choose, and the seeds below are ones whose D:2 has no eligible shop room.
// A monster standing on the arrival staircase, which is do.c u_collide_m()'s
// only caller, appeared in none of the fresh cases scanned for this matrix.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20330607081011';

// The key bound to the `down` command, extcmdlist[]'s 0x3E row.
export const DOWN_COMMAND = '>';
// win/tty/getline.c xwaitforspace() reads quitchars[], which starts with a
// space; this is the key that dismisses the arrival's `--More--`.
const DISMISS_MORE = ' ';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', pettype }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype},!acoustics,!autopickup`,
        '',
    ].join('\n');
}

function descent({ seed, walk, ...character }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(character),
        moves: `${walk}${DOWN_COMMAND}${DISMISS_MORE}`,
    };
}

export function loadLeaveLevelRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A Valkyrie with no pet: keepdogs() walks the level's monsters
            // and takes none of them, so this is the descent with the
            // smallest possible companion state.
            descent({
                seed: 6100895, name: 'Downward', role: 'Valkyrie',
                pettype: 'none', walk: 'jjnnjjbj',
            }),
            {
                // The control: the same walk without the descent. Nothing
                // about the arrival can reach it, which is what makes the
                // segment above attributable to goto_level() alone.
                seed: 6100895,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Downward', role: 'Valkyrie', pettype: 'none',
                }),
                moves: 'jjnnjjbj',
            },
            // Two more layouts for the same character, walked different ways,
            // so a port that had hardcoded one staircase position fails here.
            descent({
                seed: 7302011, name: 'Downward', role: 'Valkyrie',
                pettype: 'none', walk: 'hhhhhhhhhhhhbbb',
            }),
            descent({
                seed: 7302023, name: 'Downward', role: 'Valkyrie',
                pettype: 'none', walk: 'kukkukkkkkkkl',
            }),
            // A pet standing beside the hero on the staircase, which is the
            // arrival half of keepdogs(): losedogs() drains gm.mydogs and
            // mon_arrive() puts the dog back on the map beside her. A
            // different role, race, gender and alignment come with it.
            descent({
                seed: 7320020, name: 'Follower', role: 'Ranger', race: 'elf',
                gender: 'male', align: 'chaotic', pettype: 'dog',
                walk: 'llllllllukkkyhhhhkkkkk',
            }),
            descent({
                seed: 7320162, name: 'Follower', role: 'Ranger', race: 'elf',
                gender: 'male', align: 'chaotic', pettype: 'dog',
                walk: 'yyhhkyyhhhyyyhhhhhhhhykkkllllll',
            }),
            // A third role, gender and alignment, to keep the matrix from
            // resting on one starting inventory and one luck value.
            descent({
                seed: 6602369, name: 'Descend', role: 'Samurai',
                gender: 'male', align: 'lawful', pettype: 'none',
                walk: 'hhyhbhhy',
            }),
            // A fourth role, whose starting inventory and spell change what
            // the arrival's status line has to redraw.
            descent({
                seed: 7311006, name: 'Arrive', role: 'Priest',
                pettype: 'none', walk: 'llllllllukkklllu',
            }),
            descent({
                seed: 7311045, name: 'Arrive', role: 'Priest',
                pettype: 'none', walk: 'hhhhbhbjhhjjjjnnjjhhhb',
            }),
        ],
    }, 'leave level recipe');
}

export async function runLeaveLevelMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'leave level',
            recipe: loadLeaveLevelRecipe(),
        }],
        summaryLabel: 'LEAVE LEVEL',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runLeaveLevelMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`leave level: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
