#!/usr/bin/env node

// Run the checked-in matrix for an untamed monster lifting an object off the
// floor through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// Each segment ends on the last command prompt the port reaches, which is
// either the end of the input or the boundary the port stops at next. The
// pickup itself is mon.c mpickstuff() at monmove.c postmov()'s object arm; the
// turn after it runs worn.c m_dowear(), which stops the port only for a
// monster that would really put something on.
//
// Every segment sets pettype:none. A starting pet cannot reach mpickstuff() --
// mon_would_take_item() answers false for a kitten, a little dog and a pony on
// every object -- so leaving the pet out isolates the untamed path and keeps a
// pet's own dogmove.c carry arm, which scripts/run-pet-pickup.mjs covers, from
// ending these games first.
//
// Seeds were found by running the port over a seed range and reading which
// object mpickstuff() selected and whether the hero could see the square, not
// by copying any recorded session. The deliberate spread is over the object's
// class, whether the stack is one item or many, whether the carrier already
// holds something for add_to_minv() to merge or prepend, whether the hero can
// see the pickup at all, and the two options that gate the printed line.
//
// A hero who stands still almost never sees an untamed pickup: 600 seeds run
// for 200 turns each produced 46 pickups and not one on a square the hero
// could see. Walking the hero between searches is what puts him in a room
// where a collector finds something, and the two visible seeds below were
// found that way, though both of them then reach the pickup while the hero
// only searches.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// Three steps in each of the four directions, each followed by three searches.
// Walking is what carries the hero into a room where an object and a collector
// meet; the searches give the monsters turns to get there.
const WALK = ('lllsss' + 'jjjsss' + 'hhhsss' + 'kkksss').repeat(6);

function nethackrc(options = '') {
    return [
        'OPTIONS=name:Hoarder,role:Barbarian,race:human,gender:male,'
        + 'align:chaotic',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics${options}`,
        '',
    ].join('\n');
}

function segment({ seed, moves, options }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(options),
        moves,
    };
}

// A segment that only searches, which leaves the hero on his starting square.
function waiting({ seed, turns, options }) {
    return segment({ seed, moves: 's'.repeat(turns), options });
}

// A segment that walks between searches, using the first `keys` of the pattern.
function walking({ seed, keys, options }) {
    return segment({ seed, moves: WALK.slice(0, keys), options });
}

export function loadMonsterPickupRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The base visible case: a goblin lifts a food ration on a square
            // the hero can see, so distant_name() names it and pline_mon()
            // prints "The goblin picks up a food ration."
            waiting({ seed: 8930340, turns: 5 }),
            // The same case with flags.verbose off. C still calls
            // distant_name() for its side effects and still extracts, redraws
            // and carries; only the line disappears.
            waiting({ seed: 8930340, turns: 5, options: ',!verbose' }),
            // The same case with accessiblemsg on, which is what makes
            // pline_mon() differ from a plain pline(): set_msg_xy() prefixes
            // the line with the monster's square.
            waiting({ seed: 8930340, turns: 5, options: ',accessiblemsg' }),
            // A visible potion taken by a monster carrying nothing, so
            // add_to_minv() makes the object the head of a new pack. A potion
            // also puts doname() on its unidentified-appearance branch.
            walking({ seed: 8931104, keys: 4 }),
            // Out of sight: cansee() is false, so mpickstuff() names nothing
            // and prints nothing, and the extract, the carry and the redraw
            // still happen. This is the ordinary case -- almost every untamed
            // pickup on a fresh level happens where the hero cannot see it.
            waiting({ seed: 8900083, turns: 12 }),
            // A weapon out of sight, followed by forty turns in which the
            // carrier keeps acting: check_gear_next_turn() set I_SPECIAL and
            // m_dowear() finds no slot to fill, so the port must not stop.
            waiting({ seed: 8900138, turns: 40 }),
            // A gem out of sight into a pack that already holds something.
            waiting({ seed: 8900162, turns: 40 }),
            // Two pickups in one game, a food ration and then a potion, so the
            // second runs against a level the first already changed.
            waiting({ seed: 8900137, turns: 20 }),
            // Just outside this slice: the monster lifts a suit of armor and
            // the turn after reaches m_dowear()'s wearing effect, which is not
            // ported. The segment ends on the last prompt before that stop.
            waiting({ seed: 8900275, turns: 16 }),
        ],
    }, 'monster pickup recipe');
}

export async function runMonsterPickupMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster pickup',
            recipe: loadMonsterPickupRecipe(),
        }],
        summaryLabel: 'MONSTER PICKUP',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterPickupMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`monster pickup: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
