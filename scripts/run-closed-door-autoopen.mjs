#!/usr/bin/env node

// Run the checked-in matrix for a hero who walks into a closed door through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Each segment ends on a command prompt. The pull itself costs no game time:
// hack.c:1111 sets svc.context.move from a comparison that is always false at
// this call site, so the interesting boundary is the next prompt rather than
// the next turn. Seeds were chosen by generating levels and reading the door
// beside the hero, not by copying any recorded session.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const VALKYRIE_DATETIME = '20310203040506';
const HEALER_DATETIME = '20291124070000';

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

function valkyrie(name, options = 'pettype:none,!acoustics') {
    return nethackrc({ name, role: 'Valkyrie', options });
}

function healer(name) {
    return nethackrc({
        name,
        role: 'Healer',
        gender: 'male',
        options: 'pettype:none,!acoustics',
    });
}

export function loadClosedDoorAutoopenRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: one step west into a closed door in a vertical
            // wall. The first key opens it and spends no time; the second
            // walks onto the doorway the open door left behind.
            {
                seed: 9400016,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('Doorway'),
                moves: 'hh',
            },
            // The same arm at a door in a horizontal wall, entered from
            // above, so recalc_block_point() reopens a different sight line
            // and newsym() redraws a different cmap symbol.
            {
                seed: 9400020,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('Doorway'),
                moves: 'jj',
            },
            // A hero whose Strength is above 18 and therefore held in
            // acurr()'s 19..121 encoding. ACURRSTR folds it back to 19 before
            // the three attributes are averaged, so the raw value would set a
            // threshold one higher than C's.
            {
                seed: 9400264,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('StrongArm'),
                moves: 'lll',
            },
            // A diagonal walk into a closed door. test_move() reaches the
            // closed-door arm before its diagonal doorway rules, so autoopen
            // still fires; only the walk onto the resulting doorway is
            // refused, which is why this segment presses once.
            {
                seed: 9400080,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('Corner'),
                moves: 'y',
            },
            // The same diagonal arm with a failed roll first: the rnl(20)
            // miss, exercise(A_STR, TRUE)'s rn2(19), and "The door resists!",
            // then the pull that succeeds.
            {
                seed: 9400018,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('Corner'),
                moves: 'uu',
            },
            // A Healer, whose Strength, Dexterity and Constitution give a
            // much lower threshold than a Valkyrie's, on a different date.
            {
                seed: 9410040,
                datetime: HEALER_DATETIME,
                nethackrc: healer('DoorHeal'),
                moves: 'hhh',
            },
            // Two consecutive failures before the door opens, which is the
            // only case that exercises AEXE(A_STR) accumulating across turns
            // that spend no time.
            {
                seed: 9410443,
                datetime: HEALER_DATETIME,
                nethackrc: healer('DoorHeal'),
                moves: 'kkkk',
            },
            // With `time` on, the status line carries the turn counter, which
            // is the visible proof that opening the door costs no move.
            {
                seed: 9400016,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'TimeDoor',
                    'pettype:none,!acoustics,time',
                ),
                moves: 'hh',
            },
            // A pet beside the hero. No turn elapses while the door is being
            // pulled, so the kitten must stay where it is until the hero
            // actually steps.
            {
                seed: 9400016,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('PetDoor', 'pettype:dog,!acoustics'),
                moves: 'hh',
            },
            // accessiblemsg is what makes lock.c's set_msg_xy() observable:
            // the message becomes "(west): The door opens."
            {
                seed: 9400016,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'SpeakDoor',
                    'pettype:none,!acoustics,accessiblemsg',
                ),
                moves: 'hh',
            },
        ],
    }, 'closed door autoopen recipe');
}

export async function runClosedDoorAutoopenMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'closed door autoopen',
            recipe: loadClosedDoorAutoopenRecipe(),
        }],
        summaryLabel: 'CLOSED DOOR AUTOOPEN',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runClosedDoorAutoopenMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `closed door autoopen: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
