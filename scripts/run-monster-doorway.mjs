#!/usr/bin/env node

// Run the checked-in matrix for a monster whose move ends on a doorway it
// leaves alone, through fresh C recordings. Every segment contains replay
// inputs only; runFreshMatrix() records new reference output in an isolated
// temporary workspace.
//
// The behavior is monmove.c postmov()'s door block (1520-1622). Four of that
// block's five arms test D_LOCKED or D_CLOSED, and the fifth, the magic-key
// disarm at monmove.c:1539, tests D_TRAPPED alone, so a monster standing on a
// doorless, broken or open doorway falls through all five: no doormask
// changes, nothing is printed, and the move ends with the two newsym() calls
// that any move makes.
// What a recording can therefore show is the glyph pair and the PRNG log, so
// the matrix spreads over who arrives (a starting pet of each species, and an
// untamed monster), and over whether the hero can see the square.
//
// D_BROKEN has no segment. Three hundred freshly generated dungeon level one
// maps hold 3655 D_NODOOR, 325 D_ISOPEN, 1211 D_CLOSED and 263 D_LOCKED
// doorways and not one D_BROKEN: a broken door is made by breaking a door, so
// no fresh case on this level can produce one. scripts/monmove.test.mjs pins
// that mask against postmov() directly.
//
// Seeds were found by running the port over a seed range and reading which
// monster stood on a doorway at the end of each turn, not by copying any
// recorded session. Each segment below was then checked twice: it passes the
// differential now, and with the destination admission narrowed back to
// D_NODOOR the port stops early at the recorded screen. A seed whose arrival
// the narrowed admission still allowed was dropped, because it would pass
// whether or not this behavior is present.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20310203040506';

function nethackrc(pettype) {
    return [
        'OPTIONS=name:Doorman,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype},!acoustics`,
        '',
    ].join('\n');
}

// The hero searches for the whole segment. Standing still keeps the hero's
// own moves out of the recording and gives the monsters turns in which to
// reach a doorway.
function waiting({ seed, pettype, turns }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(pettype),
        moves: 's'.repeat(turns),
    };
}

export function loadMonsterDoorwayRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // An unseen monster steps onto an open doorway on turn five, and
            // the little dog then steps onto a doorless one in the hero's
            // sight on turns seven and twenty. Narrowed, the port stopped
            // after five screens.
            waiting({ seed: 4410010, pettype: 'dog', turns: 20 }),
            // A kitten, which is faster than the hero and takes two moves in
            // some turns: it starts the game on an open doorway, leaves it and
            // returns. Narrowed, the port stopped after five screens.
            waiting({ seed: 4420780, pettype: 'cat', turns: 20 }),
            // A pony, the third starting pet, on the same footing. Narrowed,
            // the port stopped after seven screens.
            waiting({ seed: 4420334, pettype: 'horse', turns: 20 }),
            // An untamed monster arriving on an open doorway the hero can see,
            // which is the case a screen can show: newsym() paints the monster
            // onto a watched square. Narrowed, the port stopped after eight
            // screens.
            waiting({ seed: 4422769, pettype: 'dog', turns: 20 }),
            // The plainest case, and the one that stops earliest without this
            // behavior: an unseen monster reaches an open doorway on turn
            // four and nothing else in the game touches a doorway. Narrowed,
            // the port stopped after four screens.
            waiting({ seed: 4421730, pettype: 'dog', turns: 30 }),
            // A late arrival, on turn twelve, followed by a doorless one on
            // turn twenty-three: two arrivals in one game, the second onto a
            // level the first already moved a monster around. Narrowed, the
            // port stopped after twelve screens.
            waiting({ seed: 4423636, pettype: 'dog', turns: 30 }),
        ],
    }, 'monster doorway recipe');
}

export async function runMonsterDoorwayMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster doorway',
            recipe: loadMonsterDoorwayRecipe(),
        }],
        summaryLabel: 'MONSTER DOORWAY',
    });
}

runMatrixCli(import.meta.url, runMonsterDoorwayMatrix, 'monster doorway');
