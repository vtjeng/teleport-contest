#!/usr/bin/env node

// Run the checked-in matrix for ctrl-direction rushes through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// scripts/run-room-runs.mjs and scripts/run-corridor-runs.mjs both drive
// svc.context.run == 1. cmd.c binds the ctrl-direction keys to do_rush_<dir>
// (1461-1512), which calls set_move_cmd(dir, 3), so this matrix drives
// svc.context.run == 3. Three arms of hack.c lookaround() answer differently
// at 3 than at 1, and no run reaches any of them:
//
//   * its monster arm (3933) stops for any adjacent monster mon_visible()
//     shows and is_safemon() does not vouch for, not only one directly in
//     front, so a rush also stops for a hostile beside it;
//   * its closed-door arm (3967) stops in front of an orthogonally adjacent
//     closed door instead of counting that square as a corridor; and
//   * its trailing else (4010) stops beside a staircase, fountain, sink,
//     grave or open doorway instead of counting that square as a corridor.
//
// Its trap arm (3950) passes msg = TRUE only at run > 1, which changes
// nothing while flags.mention_walls is off. It answers TRUE only for a trap
// the hero has already seen, and no trap on a freshly generated D:1 is seen
// unless a themed room asks for one, so these segments exercise the call and
// not its TRUE result.
//
// A rush reads no input, so one ctrl keystroke is one recorded step whose
// screen is where the rush stopped, and the per-turn refreshes land in
// animation_frames.
//
// Every character is human. A race with infravision makes C draw a monster
// the hero cannot see, which `js/display.js newsym()` does not do; that
// mismatch is recorded in ROADMAP.md and belongs to the infravision work.
//
// Each case names the stop it was chosen for in its `arm` field and describes
// it in a comment. The square counts in those comments come from replaying
// the case with lookaround() instrumented; the recorder is the authority on
// what the rush actually does.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c reaches the rush commands through the control byte of each direction
// key, which command_bindings.js registers at `key & 0x1F`.
export function ctrl(key) {
    return String.fromCharCode(key.charCodeAt(0) & 0x1f);
}

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        ...(options ? [`OPTIONS=${options}`] : []),
        '',
    ].join('\n');
}

// Rushes from a room square, where lookaround() skips its bcorr label and the
// three arms above are the only reasons it can stop.
const ROOM_ARMS = [
    {
        // Three squares north, then a hostile beside the hero rather than in
        // front of it. A run ignores that monster; a rush stops for it.
        seed: 6200126,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' ', rush: 'k',
        arm: 'monster-side',
    },
    {
        // The same arm reached diagonally, so u.dx and u.dy are both
        // non-zero when lookaround() reads them.
        seed: 6200173,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' ', rush: 'y',
        arm: 'monster-side',
    },
    {
        // The same arm to the southwest, two squares in.
        seed: 6200134,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' ', rush: 'b',
        arm: 'monster-side',
    },
    {
        // A hostile directly in front after three squares east. This is the
        // half of the monster arm a run reaches too, so the rush must stop
        // in the same place a run would.
        seed: 6200013,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' ', rush: 'l',
        arm: 'monster-front',
    },
    {
        // The starting pet keeps pace beside the hero for three of the four
        // squares. is_safemon() vouches for it every time, so the monster arm
        // passes over it, and the rush ends on the closed-door arm instead.
        seed: 6200202,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' ', rush: 'h',
        arm: 'door',
    },
    {
        // Eleven squares west to a closed door orthogonally adjacent to the
        // square the hero stops on. A run would count it as a corridor.
        seed: 6200031,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        walk: ' ', rush: 'h',
        arm: 'door',
    },
    {
        // The closed-door arm again, four squares in, with the door below
        // the hero rather than in front of it.
        seed: 6200014,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' ', rush: 'h',
        arm: 'door',
    },
    {
        // Nine squares west, stopping beside an open doorway: the trailing
        // else, which a run sends to bcorr instead.
        seed: 6200024,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        walk: ' ', rush: 'h',
        arm: 'terrain',
    },
    {
        // The trailing else for a fountain.
        seed: 6200035,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        walk: ' ', rush: 'l',
        arm: 'terrain',
    },
    {
        // The same level rushed southeast, where the trailing else stops for
        // a sink that is orthogonally, not diagonally, adjacent.
        seed: 6200035,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        walk: ' ', rush: 'n',
        arm: 'terrain',
    },
    {
        // The trailing else for a grave, after a single diagonal square.
        seed: 6200082,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' ', rush: 'y',
        arm: 'terrain',
    },
    {
        // Six squares west to a sink, the longest of the trailing-else cases
        // inside a room.
        seed: 6200057,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' ', rush: 'h',
        arm: 'terrain',
    },
    {
        // A diagonal rush that ends beside a doorway with the pet alongside,
        // so both the monster arm's FALSE result and the trailing else run
        // on the same turn.
        seed: 6200205,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' ', rush: 'n',
        arm: 'terrain',
    },
];

// Rushes that start on a doorway or a corridor square, where
// levl[u.ux][u.uy].typ != ROOM and bcorr counts corridor squares. The corner
// turn at hack.c:4030 lists run 3 beside run 1, so a rush turns corners; the
// widening stop at 4025 is run 2 only and must not fire.
const CORRIDOR_RUSHES = [
    {
        // The longest rush here: 22 squares with ten corner turns, ending
        // beside a doorway through the trailing else.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        walk: ' hh', rush: 'h',
        arm: 'terrain',
    },
    {
        // Twenty squares whose corrct reaches 3 and whose noturn is set on
        // three separate turns, ending on the closed-door arm.
        seed: 6100039,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' hh', rush: 'h',
        arm: 'door',
    },
    {
        // Fifteen squares mixing half turns (i0 == 1) and straight turns
        // (i0 == 2), ending beside a doorway.
        seed: 6100009,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' hh', rush: 'h',
        arm: 'terrain',
    },
    {
        // Nineteen squares starting from a corridor square rather than a
        // doorway, so the first lookaround() already has bcorr's counts
        // behind it.
        seed: 6100041,
        role: 'Healer', race: 'human', gender: 'male', align: 'neutral',
        walk: ' ll', rush: 'l',
        arm: 'terrain',
    },
    {
        // A corridor rush that ends on the closed-door arm after five corner
        // turns.
        seed: 6100047,
        role: 'Tourist', race: 'human', gender: 'female', align: 'neutral',
        walk: ' ll', rush: 'l',
        arm: 'door',
    },
    {
        // The doorway's only corridor neighbour is the square in front, so
        // corrct stays 0, no corner turn can fire, and the rush ends one
        // square later against the top edge of the map, which
        // domove_core() answers through move_out_of_bounds() rather than
        // test_move().
        seed: 6100003,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        walk: ' lk', rush: 'k',
        arm: 'edge',
    },
];

// Stops a run already reaches, re-checked at run 3 because domove_core()
// tests svc.context.run without looking at its value.
const SHARED_STOPS = [
    {
        // The rush's first square is a doorway, so domove_core()'s IS_DOOR
        // arm ends it after one step and lookaround() never runs.
        seed: 6100001,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' ', rush: 'j',
        arm: 'doorway',
    },
    {
        // Four squares west into a wall: test_move() fails and
        // domove_core() takes its zero-time refusal arm mid-rush.
        seed: 6200001,
        role: 'Barbarian', race: 'human', gender: 'male', align: 'chaotic',
        walk: ' ', rush: 'h',
        arm: 'stone',
    },
    {
        // Five squares east into a hostile: domove_core()'s "don't attack if
        // you're running" arm, which stops without spending the move.
        seed: 6200011,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        walk: ' ', rush: 'l',
        arm: 'monster-front',
    },
];

// runmode_delay_output() counts its nh_delay_output() calls the same way for
// every non-zero svc.context.run, and the recorder captures one animation
// frame per call.
const CADENCES = [
    {
        // runmode:walk delays after every step instead of every seventh.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        options: 'runmode:walk',
        walk: ' hh', rush: 'h',
        arm: 'terrain',
    },
    {
        // runmode:crawl adds four more nh_delay_output() calls per delay.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        options: 'runmode:crawl',
        walk: ' hh', rush: 'h',
        arm: 'terrain',
    },
    {
        // runmode:teleport suppresses every intermediate frame.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        options: 'runmode:teleport',
        walk: ' hh', rush: 'h',
        arm: 'terrain',
    },
    {
        // flags.time changes what runmode_delay_output() writes to
        // disp.time_botl and what moveloop_core() suppresses while rushing.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        options: 'time',
        walk: ' hh', rush: 'h',
        arm: 'terrain',
    },
    {
        // flags.time with a delay after every step, on a rush inside a room.
        seed: 6200031,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        options: 'time,runmode:walk',
        walk: ' ', rush: 'h',
        arm: 'door',
    },
];

// What the next command sees after a rush: cmd.c's DOMOVE_RUSH arm sets
// gm.multi and zeroes u.last_str_turn, and every stop above runs nomul(0),
// so neither may survive the keystroke.
const SEQUENCES = [
    {
        // A second rush out of the square the first stopped on. It steps onto
        // the doorway the trailing else stopped beside and ends there on
        // domove_core()'s IS_DOOR arm.
        seed: 6100020,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        walk: ' hh', rush: 'h', after: ctrl('h'),
        arm: 'doorway',
    },
    {
        // A walk after a rush, in a direction the rush did not use.
        seed: 6200024,
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'lawful',
        walk: ' ', rush: 'h', after: 'j',
        arm: null,
    },
    {
        // A walk out of the square the closed-door arm stopped the rush on.
        seed: 6200031,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        walk: ' ', rush: 'h', after: 'j',
        arm: null,
    },
];

// Every case, in the order loadRushRunsRecipe() emits its segments, so a test
// can read the `arm` each case was chosen for beside the segment it produces.
// `arm` names the stop the last rush of the segment must reach:
//   monster-front  a monster on the square the rush was moving onto
//   monster-side   a monster beside the hero that is not on that square
//   door           a closed door orthogonally adjacent to the hero
//   terrain        an adjacent square that is neither room, corridor nor rock
//   stone          rock or wall on the square the rush was moving onto
//   edge           the square the rush was moving onto is off the map
//   doorway        the hero standing on a doorway
//   null           the segment ends on a later command instead of the rush
// hack.c lookaround()'s closed-door arm (3967-3972) prints "You stop in front
// of the door." under flags.mention_walls. It is the only line lookaround()
// prints that this port owns, and nothing else can reach it: the arm needs
// svc.context.run != 1, which excludes both run matrices by construction, and
// every other rush here leaves the option off. These two repeat an existing
// `arm: 'door'` seed with the option turned on rather than hunting for a new
// one, so the only difference from the case above is the message.
const MENTION_WALLS_DOORS = [
    {
        // Seed 6200031 from ROOM_ARMS: eleven squares west from a room square
        // to a closed door orthogonally adjacent to the stopping square.
        seed: 6200031,
        role: 'Wizard', race: 'human', gender: 'female', align: 'chaotic',
        options: 'mention_walls',
        walk: ' ', rush: 'h',
        arm: 'door',
    },
    {
        // Seed 6100047 from CORRIDOR_RUSHES: the same arm reached from a
        // corridor square after five corner turns, so the message prints with
        // bcorr's counts behind it rather than from inside a room.
        seed: 6100047,
        role: 'Tourist', race: 'human', gender: 'female', align: 'neutral',
        options: 'mention_walls',
        walk: ' ll', rush: 'l',
        arm: 'door',
    },
];

export const RUSH_CASES = Object.freeze([
    ...ROOM_ARMS,
    ...CORRIDOR_RUSHES,
    ...SHARED_STOPS,
    ...CADENCES,
    ...SEQUENCES,
    ...MENTION_WALLS_DOORS,
]);

function segment(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc({ name: 'RushRun', ...entry }),
        moves: entry.walk + ctrl(entry.rush) + (entry.after ?? ''),
    };
}

export function loadRushRunsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: RUSH_CASES.map(segment),
    });
}

async function main() {
    const result = await runFreshMatrix({
        entries: [{ label: 'rush runs', recipe: loadRushRunsRecipe() }],
        summaryLabel: 'RUSH RUNS',
    });
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main().then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`run-rush-runs: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
