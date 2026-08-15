#!/usr/bin/env node

// Record and replay the pickup_burden option against the patched C reference.
//
// options.c optfn_pickup_burden() reads one byte -- lowc(*op) -- and maps it
// to an encumbrance level from include/hack.h. Two observers of that level
// are recorded here.
//
// The first five segments open the full options menu and page through it, so
// the value column prints optfn_pickup_burden()'s get_val arm, which spells
// the stored level back through options.c burdentype[]. Those five are what
// pin the mapping itself: two of them show that the switch's single byte
// disagrees with the name a player would copy out of that same table, because
// "strained" starts with the letter of "stressed" and "overloaded" with the
// letter of "overtaxed".
//
// The last two segments spend the level instead of printing it. Each wishes
// for a heavy iron ball, which invent.c hold_another_object() weighs against
// max(near_capacity(), flags.pickup_burden): under 'u' the 480-weight ball
// passes the limit and drop_it puts it on the floor, and under 's' -- the
// value initoptions_init() would have left anyway -- the same ball is held.
// A Healer is the hero because her starting kit plus the ball reaches
// SLT_ENCUMBER, which is the one encumbrance that sits between those two
// limits; on a stronger hero the ball is held under either.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// 'm' is #reqmenu and 'O' is #options, which together reach doset() rather
// than the simple menu. Six spaces walk pages 2 through 7; a seventh would
// commit the empty selection, which this matrix has no reason to do.
const OPEN_FULL_OPTIONS_MENU = 'mO      ';
const WIZWISH_KEY = '\x17'; /* C('w'), the "wizwish" row's key */
const WAIT = '.';

// The menu family's seed and clock, chosen independently of every other
// matrix. Nothing the menu prints depends on either.
const MENU_SEED = 7350219;
const MENU_DATETIME = '20310518104500';

// The wish family's own seed and clock. These two do read the map, because
// the dropped ball lands on it.
const WISH_SEED = 5810337;
const WISH_DATETIME = '20300922141500';

function nethackrc({ name, role, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:female,`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        `OPTIONS=pickup_burden:${options}`,
        '',
    ].join('\n');
}

// Each menu segment names one spelling and the burdentype[] name the value
// column has to print for it.
export const MENU_SPELLINGS = Object.freeze([
    // The two spellings where the name in burdentype[] and the level the
    // switch selects for it disagree.
    ['overloaded', 'overtaxed'],
    ['strained', 'stressed'],
    // The two levels no burdentype[] name can reach, each with the only
    // spelling that does reach it.
    ['l', 'overloaded'],
    ['n', 'strained'],
    // The second letter of the overtaxed arm, which no name begins with.
    ['t', 'overtaxed'],
]);

export function loadPickupBurdenRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            ...MENU_SPELLINGS.map(([spelling]) => ({
                seed: MENU_SEED,
                datetime: MENU_DATETIME,
                nethackrc: nethackrc({
                    name: 'Burdy', role: 'Ranger', options: spelling,
                }),
                // This hero's arrival needs no --More--, so the menu opens on
                // the first key.
                moves: OPEN_FULL_OPTIONS_MENU,
            })),
            // The wish opens with a wait, so the prompt paints over a screen
            // an ordinary turn produced, and closes with one, so the letter
            // or "Oops!" line paints over a screen the reply settled.
            ...['u', 's'].map((spelling) => ({
                seed: WISH_SEED,
                datetime: WISH_DATETIME,
                nethackrc: nethackrc({
                    name: 'Ballard',
                    role: 'Healer',
                    options: `${spelling}\nOPTIONS=playmode:debug`,
                }),
                moves: `${WAIT}${WIZWISH_KEY}heavy iron ball\n${WAIT}`,
            })),
        ],
    }, 'pickup burden recipe');
}

export async function runPickupBurdenMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pickup burden',
            recipe: loadPickupBurdenRecipe(),
        }],
        summaryLabel: 'PICKUP BURDEN',
        // Two segments run in debug mode, and the recorder leaves a save
        // behind for each, so no chunk may hold more than one segment.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPickupBurdenMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`pickup burden: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
