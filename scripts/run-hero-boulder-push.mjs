#!/usr/bin/env node

// Run the checked-in matrix for a hero who pushes a boulder, through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The behavior is hack.c test_move()'s boulder block (1216-1252) into
// moverock() (335-345), moverock_core() (347-638) and dopush() (165-241), with
// movobj() (824-833) moving the rock. What a recording can show is the
// "With great effort you move the boulder." line and, more importantly, when
// it is absent: dopush() throttles the line through gb.bldrpush_oid and
// gb.bldrpushtime rather than through Norep(), so a second push of the same
// boulder says nothing until svm.moves has passed gb.bldrpushtime + 2. Every
// push spends exercise()'s rn2(19) either way, which is the draw each of these
// segments puts into the stream.
//
// Seeds were found by generating dungeon level one with the port over seeds
// 1..400 and keeping those whose level holds a boulder alone on its square,
// reachable from the hero's start over plain floor with clear ground behind
// it; none was copied from a recorded session. mklev.c dig_corridor() (2540)
// drops a boulder on about one new corridor square in fifty, which is why
// every one of these boulders sits in a corridor and every walk-in leaves a
// room to reach it.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';
const BLOCKED_PUSH_DATETIME = '20330405060708';
// js/command_bindings.js:227 derives each direction's rush key as
// `key & 0x1F`, so ctrl-L is `rusheast`. It is spelled here rather than
// inline because a literal control character in a move string is invisible.
export const RUSH_EAST = '\u000c';

function nethackrc() {
    return [
        'OPTIONS=name:Prober,role:Healer,race:human,gender:male,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet: a pet on the boulder's square or on the square the hero
        // leaves reaches hack.c domove_swap_with_pet() instead of
        // test_move(), and a pet wandering into the corridor ahead would put
        // moverock_core()'s monster-behind-the-boulder arm in the way of the
        // push these segments are about.
        'OPTIONS=pettype:none',
        '',
    ].join('\n');
}

function walk({ seed, moves, datetime = DATETIME }) {
    return { seed, datetime, nethackrc: nethackrc(), moves };
}

export function loadHeroBoulderPushRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // Seed 110 carries the throttle. Its boulder is six squares due
            // east of the hero along one corridor row, so the sixth 'l' is the
            // first push and everything after it varies only in how many turns
            // pass before the next one. 's' is the cheapest way to spend a
            // turn without moving the hero or the boulder.
            //
            // One push: the line prints, because gb.bldrpush_oid still holds
            // the previous boulder (zero, from decl.c:225).
            walk({ seed: 110, moves: 'llllll' }),
            // Two in a row: the second says nothing and still draws rn2(19).
            walk({ seed: 110, moves: 'lllllll' }),
            // One turn in between: svm.moves is gb.bldrpushtime + 2, which
            // hack.c:188's `>` rejects, so this is still silent.
            walk({ seed: 110, moves: 'llllllsl' }),
            // Two turns in between: svm.moves is gb.bldrpushtime + 3 and the
            // line comes back. This pair is the whole of the `+ 2L`.
            walk({ seed: 110, moves: 'llllllssl' }),
            // The run arm, test_move():1217-1223, which stops in front of a
            // boulder the hero can neither push past nor squeeze onto. It
            // needs svc.context.run >= 2, and the three movement rows differ:
            // cmd.c do_move_east() passes 0, do_run_east() 1 and
            // do_rush_east() 3 (1391-1548), and js/command_bindings.js:227
            // binds those to 'l', 'L' and ctrl-L in turn. Only ctrl-L reaches
            // the arm.
            //
            // From two squares away, so that the rush walks one square and
            // then stops rather than refusing where it stands.
            walk({ seed: 110, moves: `llll${RUSH_EAST}` }),
            // From the adjacent square, where the rush refuses at once and
            // spends no time; the 'l' after it pushes, which is what shows
            // that the refused key cost the hero nothing.
            walk({ seed: 110, moves: `lllll${RUSH_EAST}l` }),
            // The same approach under 'L', whose run value is 1. Below the
            // arm's threshold, so this one pushes the boulder mid-run.
            walk({ seed: 110, moves: 'llllL' }),
            // Four more levels, so that neither the map, the approach nor the
            // push direction is load-bearing. Seed 47 is pushed west, and then
            // the same boulder is pushed southeast from the other side, which
            // is the only diagonal push in the matrix.
            walk({ seed: 47, moves: 'lllnnnnhhh' }),
            walk({ seed: 47, moves: 'lllnnjnnn' }),
            walk({ seed: 153, moves: 'ukkhhhhhhh' }),
            walk({ seed: 74, moves: 'llllkulll' }),
            walk({ seed: 113, moves: 'llnjjbjbhhh' }),
            // A fresh failed-destination case: seed 41 puts a boulder at
            // <9,16>, five eastward steps from the hero's start. The sixth
            // key approaches from the south and finds stone at <9,15>.
            walk({
                seed: 41,
                datetime: BLOCKED_PUSH_DATETIME,
                moves: 'lllllk',
            }),
        ],
    }, 'hero boulder push recipe');
}

export async function runHeroBoulderPushMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'hero boulder push',
            recipe: loadHeroBoulderPushRecipe(),
        }],
        summaryLabel: 'HERO BOULDER PUSH',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runHeroBoulderPushMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`hero boulder push: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
