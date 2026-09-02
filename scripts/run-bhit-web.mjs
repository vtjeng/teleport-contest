#!/usr/bin/env node

// Run the checked-in matrix for zap.c bhit()'s web arm through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The arm is zap.c:3928-3939. A thrown or kicked missile that reaches a web
// with no monster on it draws `!rn2(3)`; on 0 the missile stops there, the
// square's trap becomes seen, and "<Your> arrow gets stuck in a web!" is
// printed. On 1 or 2 the missile carries on as though the web were not there.
//
// Nothing in scripts/run-fire-command.mjs or scripts/run-throw-command.mjs
// reaches it: their flight paths are open floor. Webs are what a D:1 level can
// hold and a D:1 trap cannot -- mklev.c traptype_rnd():1976-1978 refuses WEB
// below level_difficulty() 7 -- so these come from themerms.lua's "Spider
// nest", whose des.trap("web") is not gated on depth. The same room's
// `spooders = nh.level_difficulty() > 8` is false on D:1, so every web here is
// bare and the missile reaches the arm instead of stopping at the giant spider
// standing on the web.
//
// The seed was chosen by generating D:1 for a Ranger and looking for a nest
// whose webs line up with a square the hero can walk to, not by copying any
// recorded session. Scanning upward from 7810001, 26 of the first 3,000 seeds
// put a nest on D:1 and 7811500 is the second whose webs are on a straight
// line from a reachable square. verifyBhitWebSegment() below asserts what the
// seed produces rather than trusting the number.
//
// Two segments, one keystroke apart:
//
// - `caught`   both arrows of the volley draw 0 at the first web, so both stop
//              on it and the second web is never reached.
// - `through`  one wait ahead of the shot moves the stream: the first arrow
//              still stops on the first web, and the second draws non-zero
//              there, flies through it and stops on the second.
//
// Between them the pair covers both answers of the draw, and the extra wait is
// the only difference in the inputs, so what moved the arrows is the draw.

import { WEB } from '../js/const.js';
import { ARROW } from '../js/objects.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { t_at } from '../js/trap.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20330607081011';

// See the header. verifyBhitWebSegment() asserts the layout this number gives.
export const SEED = 7811500;

// The hero's start, the square she shoots from, and the three webs on their
// shared row. The third is the control: no arrow reaches it, so it stays
// unseen while the two nearer ones are found.
export const START = Object.freeze({ x: 33, y: 4 });
export const FIRING_SPOT = Object.freeze({ x: 38, y: 4 });
export const WEBS = Object.freeze([
    Object.freeze({ x: 46, y: 4 }),
    Object.freeze({ x: 47, y: 4 }),
    Object.freeze({ x: 50, y: 4 }),
]);

const WAIT = '.';
const EAST = 'l';
const FIRE = 'f';
// dofire() finds the bow in the pack rather than the hand -- u_init.c wields
// the Ranger's dagger -- so the first `f` queues [doswapweapon, dofire] and
// spends a turn on the swap. Its two lines each raise a --More--, which these
// two spaces clear, and the queued dofire() then asks for the direction.
const SWAP_LINES = '  ';
// One space clears the --More-- the volley's own messages raise, and the
// closing wait paints a screen over them, so a turn the shot wrongly spent
// would show.
const SETTLE = ' .';
const WALK = EAST.repeat(5);

export const BHIT_WEB_CASES = [
    {
        label: 'caught',
        moves: `${WAIT}${WALK}${FIRE}${SWAP_LINES}${EAST}${SETTLE}`,
    },
    {
        label: 'through',
        moves: `${WAIT}${WALK}${WAIT}${FIRE}${SWAP_LINES}${EAST}${SETTLE}`,
    },
];

// pettype:none keeps the pet out of the firing line, where it would reach
// thitmonst() instead of the web; !acoustics keeps dosounds() from adding a
// line between the commands; !autopickup keeps the walk from pocketing
// anything and changing the volley. The three startup options skip the windows
// that would otherwise swallow the leading wait.
const NETHACKRC = [
    'OPTIONS=name:Fletch,role:Ranger,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup',
    '',
].join('\n');

export function loadBhitWebRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: BHIT_WEB_CASES.map(({ moves }) => ({
            seed: SEED, datetime: DATETIME, nethackrc: NETHACKRC, moves,
        })),
    }, 'bhit web recipe');
}

// Replay each segment as far as its settling wait and confirm the layout the
// matrix shoots across, so a re-recording that quietly changed the role or the
// seed fails here rather than passing a differential against a case that no
// longer reaches the web arm.
export async function verifyBhitWebSegment(recipeSegment) {
    await runSegment({ ...recipeSegment, moves: WAIT });
    if (game.u.ux !== START.x || game.u.uy !== START.y) {
        throw new Error(
            `seed ${recipeSegment.seed} starts at `
            + `${game.u.ux},${game.u.uy}, expected ${START.x},${START.y}`,
        );
    }
    if (game.uquiver?.otyp !== ARROW)
        throw new Error('the Ranger has no arrows quivered');
    for (const { x, y } of WEBS) {
        const trap = t_at(x, y, game);
        if (trap?.ttyp !== WEB)
            throw new Error(`no web at ${x},${y}`);
        if (trap.tseen)
            throw new Error(`the web at ${x},${y} is already seen`);
    }
}

export async function runBhitWebMatrix() {
    return runFreshMatrix({
        entries: [{ label: 'bhit web', recipe: loadBhitWebRecipe() }],
        summaryLabel: 'BHIT WEB',
        verifySegment: verifyBhitWebSegment,
    });
}

runMatrixCli(import.meta.url, runBhitWebMatrix, 'bhit web');
