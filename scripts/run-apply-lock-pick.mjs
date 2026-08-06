#!/usr/bin/env node

// Run the checked-in matrix for a hero applying a lock pick to an adjacent
// door through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The command is apply.c doapply()'s LOCK_PICK/CREDIT_CARD/SKELETON_KEY arm,
// which calls lock.c pick_lock(obj, 0, 0, NULL). That reaches cmd.c
// get_adjacent_loc() for the direction and then the doormask switch on the
// square it names. Two arms of the switch are reachable on a freshly made
// level: D_ISOPEN, which mklev.c dosdoor() rolls directly and which
// doopen_indir() also leaves behind, and D_NODOOR, its commonest answer.
// D_BROKEN needs a door broken by a kick, which is not ported, so no segment
// here reaches it.
//
// Seeds were chosen by generating D:1 for seeds 5200001 through 5200250 with
// the port and reading the doors around the Rogue's upstairs, not by copying
// any recorded session. The scan looked for a door whose inside neighbour the
// hero can reach along a straight line of plain room floor at most four steps
// long, and kept the first seeds offering each wanted mask and orientation.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// u_init.c:133-141 gives every Rogue a=short sword, b=daggers, c=leather
// armor, d=potion of sickness, e=lock pick, f=sack, so `e` names the lock pick
// on every seed. cmd.c cmdlist[] binds 'a' to doapply() and the eight walking
// keys to the eight directions; decl.c quitchars[] holds the two keys a
// recording can send to cancel a prompt.
export const APPLY_KEY = 'a';
export const LOCK_PICK_SLOT = 'e';
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const WAIT = '.';

// The two keys that choose the command and the tool. Spelling them once keeps
// the walk in front of each segment readable.
const APPLY_PICK = `${APPLY_KEY}${LOCK_PICK_SLOT}`;

function nethackrc({ name, role = 'Rogue', race = 'human', gender = 'female',
    align = 'chaotic', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// `time` puts the turn counter on the status line, which is the field that
// separates pick_lock()'s two answers: PICKLOCK_LEARNED_SOMETHING spends the
// turn and PICKLOCK_DID_NOTHING does not. `showexp` is a second status field
// that must not move with it.
const PLAIN = 'pettype:none,!acoustics,!autopickup,time,showexp';
const DECORATED =
    'pettype:none,!acoustics,!autopickup,time,showexp,symset:DECgraphics,'
    + 'msg_window:reversed';

// Every segment opens and closes with a wait, so a command that wrongly spent
// or wrongly saved a turn shows up in the screen after it.
function segment(seed, moves, options = PLAIN) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ name: 'Picky', options }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

export function loadApplyLockPickRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // D_ISOPEN in a horizontal wall, reached by pointing north at a
            // door mklev.c dosdoor() rolled open when the level was made.
            segment(5200108, `l${APPLY_PICK}k`),
            // D_ISOPEN in a vertical wall, pointing east. The wall runs the
            // other way, so the door draws a different cmap symbol.
            segment(5200164, `ll${APPLY_PICK}l`),
            // D_NODOOR, pointing east: dosdoor()'s commonest answer, and the
            // switch arm above the live one.
            segment(5200001, `l${APPLY_PICK}l`),
            // D_NODOOR, pointing west, so the direction key that reaches the
            // arm is not the one the case above used.
            segment(5200013, `h${APPLY_PICK}h`),
            // A door that was D_CLOSED when the level was made: the walk into
            // it runs doopen_indir()'s roll and leaves D_ISOPEN behind, and
            // the apply then reads the mask that roll wrote.
            segment(5200006, `hhj${APPLY_PICK}j`),
            // The same sequence at another seed's door, because the roll can
            // resist and leave the mask alone.
            segment(5200022, `jjj${APPLY_PICK}j`),
            // Escape at the direction prompt: get_adjacent_loc() prints
            // "Never mind." and pick_lock() answers PICKLOCK_DID_NOTHING, so
            // the turn counter must not move.
            segment(5200001, `${APPLY_PICK}${ESCAPE_KEY}`),
            // Space, the other quitchar a recording can send, through the same
            // branch.
            segment(5200013, `${APPLY_PICK}${SPACE_KEY}`),
            // Two applies with no move between them. Unlike the stethoscope,
            // there is no free first use, so both spend a turn.
            segment(5200108, `l${APPLY_PICK}k${APPLY_PICK}k`),
            // The first case again under a different symbol set and message
            // window, which redraw the door and the message differently.
            segment(5200108, `l${APPLY_PICK}k`, DECORATED),
        ],
    }, 'apply lock pick recipe');
}

export async function runApplyLockPickMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'apply lock pick',
            recipe: loadApplyLockPickRecipe(),
        }],
        summaryLabel: 'APPLY LOCK PICK',
        chunkLimit: 5,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runApplyLockPickMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `apply lock pick: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
