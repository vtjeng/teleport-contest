#!/usr/bin/env node

// Run the checked-in matrix for a monster that falls into a pit, through fresh
// C recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The behavior is trap.c mintrap() (3732-3840), reached from monmove.c
// postmov():1509, through trapeffect_selector() (2936) into the monster arm of
// trapeffect_pit() (1966-2008), which ends in thitm() (6710-6773) and mon.c
// monkilled() (3376-3418). What a recording can show is the fall line the arm
// writes, the kill line monkilled() adds to it, the trap glyph seetrap()
// exposes, the corpse and the vacated square the death leaves on the map, and
// the draws the arm spends: the rnd(6) that hurts the victim and, behind it,
// corpse_chance() and mkobj.c mksobj()'s corpse initialization.
//
// The matrix spreads over the three things that change what a recording sees:
// whether the hero can watch the victim, which selects both seetrap() and the
// two lines; which species falls, because Monnam() and monkilled()'s
// nonliving() both read it; and whether the victim reaches the trap through
// dogmove.c dog_move() or monmove.c m_move(), which are separate paths into
// the same postmov() call.
//
// The hero searches for the whole segment. Standing still keeps the hero's own
// moves out of the recording, gives the monsters turns in which to find a pit,
// and fixes what the hero can see, which is what selects the arm.
//
// Seeds were found by running the port over seed ranges and keeping those
// whose dungeon level one holds a PIT that some monster later fell into, read
// from the trap's `tseen` bit and from the corpse left on its square; none was
// copied from a recorded session. Each segment's move count is the smallest
// round number past the fall it was chosen for.
//
// Three branches of the arm have no segment here, and scripts/monster-pit.test
// .mjs pins all three against mintrap() directly. Sokoban's "is dragged" verb
// needs a Sokoban level, which no ordinary descent in this port reaches yet.
// FORCETRAP's "doesn't fall into the pit" line needs trap.c openfallingtrap(),
// which nothing ported calls. The clinger that walks over a pit needs a
// monster that is neither is_flyer() nor is_floater() but is M1_CLING, and
// 40,000 scanned seeds produced 464 pit falls and not one of them: the
// piercers and mimics that answer M1_CLING sit still.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc(pettype) {
    return [
        'OPTIONS=name:Prober,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype}`,
        '',
    ].join('\n');
}

function waiting({ seed, pettype = 'none', turns }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(pettype),
        moves: 's'.repeat(turns),
    };
}

export function loadMonsterPitRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The in-sight kill, which is the arm's common case: both lines
            // on one top line, the pit revealed under the victim, and the
            // corpse roll behind them. Four species, so that neither Monnam()
            // nor the corpse divisor is carried by one record.
            waiting({ seed: 6228974, turns: 15 }), // a lichen, on turn 3
            waiting({ seed: 6209768, turns: 35 }), // a grid bug, on turn 25
            waiting({ seed: 6217129, turns: 35 }), // a kobold, on turn 25
            waiting({ seed: 6225078, turns: 50 }), // a sewer rat, on turn 40
            waiting({ seed: 6229214, turns: 60 }), // a fox, on turn 52
            // The out-of-sight arm. `in_sight` withholds both lines and
            // seetrap(), so the pit stays off the map and only the draws and
            // the corpse show that it fired.
            waiting({ seed: 6402469, turns: 15 }), // on turn 5
            waiting({ seed: 6402174, turns: 35 }), // on turn 25
            waiting({ seed: 6404579, turns: 45 }), // on turn 34
            // Two monsters fall into the same unseen pit in this one, the
            // first on turn 5 and the second past turn 45, which is why it
            // runs longer than its siblings.
            waiting({ seed: 6401331, turns: 100 }),
            // A pet reaches the same postmov() call through dog_move() rather
            // than m_move(), and the pet that dies is the hero's own, which
            // is the case seed0015 records.
            waiting({ seed: 6316388, pettype: 'dog', turns: 20 }),
            waiting({ seed: 6305341, pettype: 'dog', turns: 30 }),
            waiting({ seed: 6312649, pettype: 'dog', turns: 40 }),
            // A kobold zombie, whose death monkilled() reports as `is
            // destroyed!` because nonliving() answers TRUE for it.
            waiting({ seed: 6301625, pettype: 'dog', turns: 85 }),
        ],
    }, 'monster pit recipe');
}

export async function runMonsterPitMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster pit',
            recipe: loadMonsterPitRecipe(),
        }],
        summaryLabel: 'MONSTER PIT',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterPitMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`monster pit: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
