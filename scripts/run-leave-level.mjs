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
// seed is otherwise arbitrary; a datetime is shared within a character because
// the date changes level generation, which would invalidate every path
// recorded against it.
//
// The arrival segments below end in a run of `s` keys before the `>`. Search
// costs a turn and moves nobody, which is how a monster beside the hero closes
// the last square onto her before she descends. Waiting is what makes those
// segments findable at all: over the 12,000 seeds scanned without it, 2 of the
// 2,347 descents carried a follower that was not tame.
//
// What no segment covers, and why. dog.c mon_arrive()'s selector has a third
// arm, rn2(5) for a peaceful follower, and no fresh case reaches it: over the
// 60,000 seeds scanned for this matrix every non-tame follower found was
// hostile, and a peaceful stalker beside the down staircase appeared in none
// of them. scripts/level-arrival.test.mjs pins that arm instead. Nor does any
// segment carry a hostile follower through the turn after the arrival:
// mnexto() puts it next to the hero, so it attacks her, and that is combat
// rather than descent. Seed 7902379 is that case, matching 6,745 of C's 6,755
// calls before stopping.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20330607081011';
const PRIEST_DATETIME = '20340215090807';
const PET_DATETIME = '20320718062030';
const SAMURAI_DATETIME = '20291112131415';

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

function descent({ seed, walk, datetime = DATETIME, ...character }) {
    return {
        seed,
        datetime,
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

// dog.c mon_arrive()'s With_you arm places whatever keepdogs() collected, and
// nothing there reads tameness except the bound of one rn2(): 10 for a pet,
// 5 for a peaceful monster, 2 for a hostile one. The two outcomes are the
// hero's own square through rloc_to(), which hands do.c u_collide_m() the
// job of deciding who moves off it, and the square beside her through
// mnexto(). These segments record both outcomes for a hostile follower and
// the first for a pet.
//
// A monster that is not tame follows because mondata.c levl_follower()
// answers TRUE for M2_STALK; every one the scan found was a zombie or another
// ordinary stalker standing beside the hero on the down staircase.
export function loadArrivingFollowerRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A hostile follower whose rn2(2) missed, so mnexto() puts it
            // beside the hero rather than on her square. It is the only
            // mnexto() segment here, because that placement leaves the
            // follower adjacent and it usually attacks on the next turn.
            descent({
                seed: 7905523, name: 'Shopper', role: 'Valkyrie',
                pettype: 'none', walk: 'hyyhhhhhhhkhhkhhhjbb',
            }),
            // The same disposition with rn2(2) == 0: the zombie takes the
            // hero's intended square, and u_collide_m() moves one of the two
            // off it. No recorded case reached that function before this
            // recipe.
            descent({
                seed: 7969455, name: 'Shopper', role: 'Valkyrie',
                pettype: 'none', walk: 'llkkkkhhhkhhyhhhbjjhhhssss',
            }),
            // A second role and datetime on the same collision, this time
            // arriving on a D:2 that carries a general store, so the shop's
            // stocking and the follower's placement draw from one stream.
            descent({
                seed: 7984984, name: 'Arrive', role: 'Priest',
                pettype: 'none', datetime: PRIEST_DATETIME,
                walk: 'khhjjjhjhhhhhhss',
            }),
            // The same character on a shopless D:2, walked far enough that a
            // port resting on one arrival position fails here.
            descent({
                seed: 8002297, name: 'Arrive', role: 'Priest',
                pettype: 'none', datetime: PRIEST_DATETIME,
                walk: 'llljjhhhhhjjhhhhjjbhhyhhhhhbssss',
            }),
            // A pet on the hero's square, which is the rn2(10) arm of the
            // same selector reaching the same collision. A cat rather than a
            // dog, on a fourth datetime and alignment.
            descent({
                seed: 8110945, name: 'Arrive', role: 'Valkyrie',
                align: 'lawful', pettype: 'cat', datetime: PET_DATETIME,
                walk: 'jnjjljjjjjjns',
            }),
            // The pet collision again for a fifth character, arriving on a
            // D:2 with a general store.
            descent({
                seed: 8131449, name: 'Descend', role: 'Samurai',
                gender: 'male', align: 'lawful', pettype: 'dog',
                datetime: SAMURAI_DATETIME, walk: 'lllllllllllnnjss',
            }),
        ],
    }, 'arriving follower recipe');
}

export async function runLeaveLevelMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'leave level', recipe: loadLeaveLevelRecipe() },
            {
                label: 'arriving follower',
                recipe: loadArrivingFollowerRecipe(),
            },
        ],
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
