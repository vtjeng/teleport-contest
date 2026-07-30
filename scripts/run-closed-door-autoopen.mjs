#!/usr/bin/env node

// Run the checked-in matrix for a hero who walks into a closed door through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Each segment ends on a command prompt. The pull itself costs no game time:
// hack.c:1111 sets svc.context.move from a comparison that is always false at
// this call site, so the interesting boundary is the next prompt rather than
// the next turn. The third recipe is the exception, and deliberately so: the
// bump at hack.c:1122 sets svc.context.move to TRUE by hand and a turn does
// elapse. Seeds were chosen by generating levels and reading the door beside
// the hero, not by copying any recorded session.

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

function healer(name, options = 'pettype:none,!acoustics') {
    return nethackrc({
        name,
        role: 'Healer',
        gender: 'male',
        options,
    });
}

// cmd.c binds each run to the control byte of its direction key, which
// js/command_bindings.js registers at `key & 0x1F`.
function ctrl(key) {
    return String.fromCharCode(key.charCodeAt(0) & 0x1f);
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

// The same walk against a door whose mask is D_LOCKED, which reaches
// doopen_indir()'s `!(doormask & D_CLOSED)` message switch instead of its
// rnl(20) roll. The hero carries no skeleton key, lock pick or credit card, so
// autokey(TRUE) is empty and the autounlock tail below the message does
// nothing. Nothing about the door changes, so the boundary is the next command
// prompt and repeated keys repeat the same line.
export function loadLockedDoorRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: one step north into a locked door in a
            // horizontal wall, then a second key that finds it locked again.
            {
                seed: 9500074,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('LockDoor'),
                moves: 'kk',
            },
            // A locked door in a vertical wall, entered from the west, so
            // newsym() refreshes a different cmap symbol.
            {
                seed: 9500483,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('LockDoor'),
                moves: 'll',
            },
            // Two ordinary steps and then the pull. The steps spend a move
            // each and the pull spends none, which separates the two costs
            // inside one segment.
            {
                seed: 9500040,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('LockWalk'),
                moves: 'lll',
            },
            // A diagonal walk into a locked door. test_move() reaches the
            // closed-door arm before its diagonal doorway rules, so the
            // message is the same one an orthogonal walk gets.
            {
                seed: 9500257,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('LockCorner'),
                moves: 'y',
            },
            // With `time` on, the status line carries the turn counter, which
            // is the visible proof that the refused pull costs no move.
            {
                seed: 9500074,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'LockTime',
                    'pettype:none,!acoustics,time',
                ),
                moves: 'kk',
            },
            // accessiblemsg is what makes set_msg_xy() observable: the line
            // becomes "(north): This door is locked."
            {
                seed: 9500074,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'LockSpeak',
                    'pettype:none,!acoustics,accessiblemsg',
                ),
                moves: 'kk',
            },
            // A pet beside the hero. No turn elapses while the door refuses,
            // so the kitten must stay where it is.
            {
                seed: 9500074,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('LockPet', 'pettype:dog,!acoustics'),
                moves: 'kk',
            },
            // A Healer on a different date, walking three squares south into
            // a locked door.
            {
                seed: 9610156,
                datetime: HEALER_DATETIME,
                nethackrc: healer('LockHeal'),
                moves: 'jjj',
            },
            // A Healer's diagonal walk, southwest, at a door in the opposite
            // corner arrangement from the Valkyrie's northwest case.
            {
                seed: 9610313,
                datetime: HEALER_DATETIME,
                nethackrc: healer('LockHeal'),
                moves: 'bb',
            },
        ],
    }, 'locked door recipe');
}

// The same walk with hack.c:1097's autoopen test failing, which sends
// test_move() to the arm below the pull instead of into doopen_indir(). Two of
// that test's five terms are ported: `OPTIONS=!autoopen` clears flags.autoopen,
// and an uppercase or ctrl direction key sets svc.context.run. Neither touches
// the door, so a repeated key repeats the same result.
//
// Below the test, `x == ux || y == uy` splits orthogonal from diagonal and
// `ACURR(A_DEX) < 10` splits the two orthogonal outcomes. The bump is the
// expensive one: hack.c:1122 sets svc.context.move as well as
// svc.context.door_opened, so the hero pays a turn for walking into the door,
// while "That door is closed." and the silent diagonal cost nothing.
//
// Every Valkyrie here rolled Dexterity 10 or more and every Healer rolled 9 or
// less, which is why the two roles carry the two outcomes. Seeds were chosen by
// generating levels, reading the door beside the hero and reading acurr(A_DEX),
// not by copying any recorded session.
export function loadAutoopenSuppressedRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base case: `autoopen` off, one step west into a closed door,
            // then a second key that finds the door unchanged.
            {
                seed: 9700008,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutDoor',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'hh',
            },
            // Dexterity exactly 10, the value on the far side of
            // `ACURR(A_DEX) < 10`. Its Healer counterpart below rolled 9.
            {
                seed: 9700219,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutDoor',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'hh',
            },
            // A diagonal step at the same closed door. hack.c:1099 admits only
            // an orthogonal one, so this prints nothing at all.
            {
                seed: 9700038,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutCorner',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'uu',
            },
            // A locked door. Nothing on this arm reads the mask, so a hero who
            // would have been told "This door is locked." is told the door is
            // closed instead.
            {
                seed: 9700095,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutLock',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'll',
            },
            // `autoopen` left on and svc.context.run == 1 suppressing it, from
            // the uppercase direction key. moveloop_core() calls lookaround()
            // only while gm.multi > 0, so the first key of a rush reaches
            // domove() with the door already in front of the hero.
            {
                seed: 9700008,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('RushDoor'),
                moves: 'H',
            },
            // The same suppression at svc.context.run == 3, from the ctrl
            // direction key.
            {
                seed: 9700008,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie('RunDoor'),
                moves: ctrl('h'),
            },
            // With `time` on, the status line carries the turn counter, which
            // is where "That door is closed." costing nothing shows up.
            {
                seed: 9700008,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutTime',
                    'pettype:none,!acoustics,!autoopen,time',
                ),
                moves: 'hh',
            },
            // accessiblemsg is what would expose a set_msg_xy() prefix. Both
            // lines on this arm are plain pline() calls and pline.c vpline()
            // clears a11y.msg_loc after every message, so neither may gain one.
            {
                seed: 9700008,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutSpeak',
                    'pettype:none,!acoustics,!autoopen,accessiblemsg',
                ),
                moves: 'hh',
            },
            // A pet beside the hero. This hero keeps Dexterity 10, so no turn
            // elapses and the kitten must stay where it is.
            {
                seed: 9700008,
                datetime: VALKYRIE_DATETIME,
                nethackrc: valkyrie(
                    'ShutPet',
                    'pettype:dog,!acoustics,!autoopen',
                ),
                moves: 'hh',
            },
            // Dexterity 9, the value just inside `ACURR(A_DEX) < 10`: the same
            // walk bumps instead, and each bump spends a turn.
            {
                seed: 9710040,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpDoor',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'll',
            },
            // Dexterity 8 at a door in a horizontal wall, entered from above.
            {
                seed: 9710117,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpDoor',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'jj',
            },
            // Dexterity 8 diagonally. The bump arm is orthogonal-only, so a
            // clumsy hero gets the same silence a nimble one does.
            {
                seed: 9710018,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpCorner',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'nn',
            },
            // Dexterity 8 at a locked door, the bump counterpart of the
            // Valkyrie's locked segment above.
            {
                seed: 9710257,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpLock',
                    'pettype:none,!acoustics,!autoopen',
                ),
                moves: 'll',
            },
            // A rush that bumps. hack.c:1126 calls nomul(0) by hand here,
            // because svc.context.move has just been set to a move that never
            // happened, so the rush has to stop on this one key.
            {
                seed: 9710040,
                datetime: HEALER_DATETIME,
                nethackrc: healer('BumpRush'),
                moves: 'L',
            },
            // The same bump at svc.context.run == 3.
            {
                seed: 9710040,
                datetime: HEALER_DATETIME,
                nethackrc: healer('BumpRun'),
                moves: ctrl('l'),
            },
            // With `time` on, the turn counter advances on every bump, which
            // is the opposite of the Valkyrie's `time` segment above.
            {
                seed: 9710040,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpTime',
                    'pettype:none,!acoustics,!autoopen,time',
                ),
                moves: 'll',
            },
            // accessiblemsg against the other line on this arm.
            {
                seed: 9710040,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpSpeak',
                    'pettype:none,!acoustics,!autoopen,accessiblemsg',
                ),
                moves: 'll',
            },
            // A pet beside a hero who does bump, so the turn really elapses
            // and the kitten takes its move.
            {
                seed: 9710117,
                datetime: HEALER_DATETIME,
                nethackrc: healer(
                    'BumpPet',
                    'pettype:dog,!acoustics,!autoopen',
                ),
                moves: 'jj',
            },
        ],
    }, 'autoopen suppressed recipe');
}

export async function runClosedDoorAutoopenMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'closed door autoopen',
            recipe: loadClosedDoorAutoopenRecipe(),
        }, {
            label: 'locked door message',
            recipe: loadLockedDoorRecipe(),
        }, {
            label: 'autoopen suppressed',
            recipe: loadAutoopenSuppressedRecipe(),
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
