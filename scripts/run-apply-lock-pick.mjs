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

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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
// options.c optlist.h `blind` is the roleplay conduct that starts the hero
// blind and keeps her that way, which is the only way a recording can reach
// the Blind half of lock.c:589-592 on the first turn of a game.
const BLIND = `${PLAIN},blind`;

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

            // lock.c:578-593, the arm for a square that holds no door. Its
            // return value is the whole point: PICKLOCK_LEARNED_SOMETHING
            // spends the turn and PICKLOCK_DID_NOTHING does not, and `time`
            // puts that difference on the status line.
            //
            // A wall the hero already sees from inside a lit room. Nothing
            // about it is news, so no turn is spent. Seed 5200108 puts the
            // Rogue's upstairs in the top-left corner of her room, so the
            // wall is one step north with no walk at all.
            segment(5200108, `${APPLY_PICK}k`),
            // Plain lit room floor. display.c:894-897 moves map memory from
            // S_room to S_darkroom for any lit room square while 'dark_room'
            // and colour are on, so this one costs a turn even though nothing
            // visible changes.
            segment(5200108, `l${APPLY_PICK}j`),
            // The same square under DECgraphics, where S_room draws the DEC
            // middle dot. options.c initoptions_finish():7347 has already
            // pointed S_darkroom at the S_room byte, so the redraw must not
            // change the symbol.
            segment(5200108, `l${APPLY_PICK}j`, DECORATED),
            // Room floor holding an object, which is _map_location()'s first
            // arm rather than its background arm: the object has to survive
            // being felt, and nothing changes, so no turn is spent.
            segment(5200108, `jj${APPLY_PICK}l`),
            // A blind hero, who is told she feels rather than sees, and who
            // does learn the square because she remembered nothing there.
            segment(5200108, `${APPLY_PICK}l`, BLIND),
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

runMatrixCli(import.meta.url, runApplyLockPickMatrix, 'apply lock pick');
