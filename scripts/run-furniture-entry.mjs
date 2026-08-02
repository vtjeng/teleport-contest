#!/usr/bin/env node

// Run the checked-in matrix for entry into a square whose terrain satisfies
// rm.h:138 IS_FURNITURE() -- STAIRS through ALTAR -- through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The behavior is that neither the hero nor an ordinary monster meets a
// furniture-specific branch on the way in. hack.c test_move() (991-1160) has
// no arm for these seven types: rm.h:119 makes IS_OBSTRUCTED `typ < POOL` and
// IS_DOOR is false, so the obstacle chain never claims the square and control
// resumes below it, at hack.c:1153's diagonal bad_rock() test. What the
// hero does meet is the run stop at hack.c:2936-2941, lookaround()'s
// furniture arm at hack.c:4009-4019, and, when the square holds an object,
// invent.c look_here()'s dfeature line from dfeature_at() (4037-4097). A
// monster meets nothing: mon.c mfndpos() and teleport.c goodpos() admit any
// ACCESSIBLE square, and monmove.c postmov() has no furniture branch. Nor
// does the pet swap: every refusal arm of hack.c domove_swap_with_pet()
// (2098-2180) is about the pet or about the square the pet moves into.
//
// The matrix therefore spreads over the four things that do differ:
//   * the terrain -- fountain, sink, altar, stairs, and, for a monster, grave.
//     D:1 generates no throne and no ladder, and a grave carries mkgrave()'s
//     headstone engraving, which the hero-destination seam still refuses.
//   * svc.context.run, because hack.c:4009-4019 splits on it. Shift-direction
//     sets run to 1 (cmd.c do_run_west():1520) and takes lookaround()'s bcorr
//     arm, so the hero runs onto the square and stops there; Ctrl-direction
//     sets run to 3 (cmd.c do_rush_west():1463) and stops in front of it.
//   * whether the square holds an object, which is what selects look_here()'s
//     "There is a fountain here." line ahead of "You see here".
//   * whether the pet stands on the square, which routes the arrival through
//     domove_swap_with_pet() instead of the empty-square path.
//
// Seeds were found by generating levels with the port and reading which
// squares near the hero, and which squares a monster or the pet reached, were
// furniture; no recorded session was read. Each hero segment was then checked
// twice: it passes the differential now, and with the destination predicate
// its own seam reads narrowed back the port stops early at the recorded
// screen. Each monster segment was chosen the same way, from the 16 seeds in
// 5200000-5200299 whose search-only replay the narrowed predicate stopped
// short.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// Shift-direction and Ctrl-direction north, the two run prefixes cmd.c
// bind_keys() installs at 3465-3467 over the vi direction keys: highc('k')
// reaches move_funcs[][MV_RUN] and C('k') reaches move_funcs[][MV_RUSH].
export const RUN_NORTH = 'K';
export const RUSH_NORTH = '\x0b';

function nethackrc(extra = []) {
    return [
        'OPTIONS=name:Furn,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:dog,!acoustics',
        ...extra,
        '',
    ].join('\n');
}

function segment({ seed, moves, extra }) {
    return { seed, datetime: DATETIME, nethackrc: nethackrc(extra), moves };
}

// The hero searches after arriving, which spends turns without moving again.
// That gives the monsters turns of their own on a level the hero has just
// changed, and keeps the arrival itself the only hero move in the segment.
function arriveThenWait({ seed, moves, waits = 2, extra }) {
    return segment({ seed, moves: moves + 's'.repeat(waits), extra });
}

// A segment the hero spends entirely on the search command, so every recorded
// difference belongs to a monster.
function waiting({ seed, turns }) {
    return segment({ seed, moves: 's'.repeat(turns) });
}

export function loadFurnitureEntryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // A four-step walk north onto a bare fountain, the commonest
            // furniture square on D:1. Narrowed, the port stopped after four
            // screens of seven.
            arriveThenWait({ seed: 5100100, moves: 'kkkk' }),
            // One step north onto a bare sink, the terrain that stops both
            // seed0013 development sessions. Narrowed, the port stopped after
            // one screen of four.
            arriveThenWait({ seed: 5100274, moves: 'k' }),
            // One step north onto a bare altar outside a temple. dfeature_at()
            // needs a_gname() for an altar, but pickup.c pickup() returns
            // before look_here() on an object-free square, so nothing asks for
            // the name. Narrowed, the port stopped after one screen of four.
            arriveThenWait({ seed: 5100001, moves: 'k' }),
            // One step west onto a fountain holding a gold piece, with
            // autopickup off so that pickup() takes its `!flags.pickup` arm
            // into check_here() and look_here() prints the fountain line above
            // "You see here". Narrowed, the port stopped after one screen of
            // four.
            arriveThenWait({
                seed: 5100896,
                moves: 'h',
                extra: ['OPTIONS=!autopickup'],
            }),
            // Shift-run north three squares onto a fountain: run == 1, so
            // lookaround() sends the furniture square to bcorr and the run
            // carries on into it, and hack.c:2936-2941 ends the run there.
            // Narrowed, the port stopped after one screen of four.
            arriveThenWait({ seed: 5100064, moves: RUN_NORTH }),
            // The same seed and the same direction with Ctrl-rush: run == 3,
            // so lookaround() stops the hero on the square before the
            // fountain and never enters it. This segment passes with the
            // predicate narrowed too; it is here to pin the other side of the
            // split that the segment above rides.
            arriveThenWait({ seed: 5100064, moves: RUSH_NORTH }),
            // Ctrl-rush north onto a sink one square away. The first step of a
            // run happens before allmain.c moveloop_core():516 calls
            // lookaround() at all, so run == 3 enters this square where it
            // stopped in front of the one above. Narrowed, the port stopped
            // after one screen of four.
            arriveThenWait({ seed: 5100274, moves: RUSH_NORTH }),
            // A pet steps onto a fountain in the hero's sight on turn one, so
            // the `{` under it is redrawn on a watched square. Narrowed, the
            // port stopped after five screens of twenty-one.
            waiting({ seed: 5200270, turns: 20 }),
            // An untamed monster reaches a grave in sight on turn eight and
            // stays there. Narrowed, the port stopped after four screens.
            waiting({ seed: 5200051, turns: 20 }),
            // Two arrivals in one game: a pet onto an altar in sight, and an
            // untamed monster onto a fountain the hero cannot see, so the
            // difference is in the PRNG log alone. Narrowed, the port stopped
            // after two screens.
            waiting({ seed: 5200140, turns: 20 }),
            // An unseen monster onto a sink on turn two, the plainest monster
            // case and the earliest stop in the group. Narrowed, the port
            // stopped after two screens.
            waiting({ seed: 5200295, turns: 20 }),

            // The hero swaps places with the starting pet standing on the
            // furniture. hack.c domove_swap_with_pet() (2098-2180) never reads
            // the square the hero moves onto, so the swap itself is the same
            // as on a room square; what these segments add is the arrival,
            // which is why each is a furniture terrain and a run mode rather
            // than a pet state. Every one of the five was checked twice: it
            // passes the differential now, and with the pet-swap destination
            // predicate narrowed back to ROOM, CORR and a doorless doorway the
            // port stops at the recorded screen given below.
            //
            // One step east into the pet on a fountain, which it already
            // occupies at the first prompt. Narrowed: one screen of four.
            arriveThenWait({ seed: 5200270, moves: 'l' }),
            // Four searches, then one step north into the pet on a sink -- the
            // terrain both seed0013 sessions need. Narrowed: five of eight.
            arriveThenWait({ seed: 5300240, moves: 'ssssk' }),
            // Shift-run north into the pet on a fountain. The run's first step
            // happens before allmain.c moveloop_core() calls lookaround(), so
            // the hero swaps into the square, and hack.c:2936-2941 then ends
            // the run because tmpr is the fountain. Narrowed: three of six.
            arriveThenWait({ seed: 5300310, moves: `ss${RUN_NORTH}` }),
            // The same seed and direction with Ctrl-rush. hack.c:2936-2941
            // reads only `run < 8`, so run == 3 arrives and stops where
            // run == 1 does; C recorded the same 2,741 calls and six screens
            // for both, and the pair pins that the port does not split there
            // either. It differs from the unoccupied-fountain rush above,
            // which lookaround() stops one square short. Narrowed: three of
            // six.
            arriveThenWait({ seed: 5300310, moves: `ss${RUSH_NORTH}` }),
            // One step west off the up-staircase and one step back east onto
            // it, by which point the pet has followed onto the square the hero
            // left. This is the only swap segment whose *source* square is an
            // ordinary room rather than furniture, so it is the one that
            // exercises goodpos(u.ux0, u.uy0, mtmp, 0) over a room; it is also
            // the shape seed2600-wizard-custom-binds stops on, a kitten on
            // STAIRS. Narrowed: two of five.
            arriveThenWait({ seed: 5300090, moves: 'hl' }),
        ],
    }, 'furniture entry recipe');
}

export async function runFurnitureEntryMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'furniture entry',
            recipe: loadFurnitureEntryRecipe(),
        }],
        summaryLabel: 'FURNITURE ENTRY',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runFurnitureEntryMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`furniture entry: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
