#!/usr/bin/env node

// Record and replay the `f` (fire) command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// One shape of segment covers dothrow.c dofire()'s two reachable arms in
// order. u_init.c gives every launcher-carrying role its launcher in the
// secondary slot, never the primary one, so the first `f` always takes the
// swap-and-retry arm at dothrow.c:566-570: it queues [doswapweapon, dofire]
// and returns without spending time, doswapweapon() then costs a turn of its
// own, and the queued dofire() shoots on the turn after that. The second `f`
// in the same segment finds the launcher already wielded and takes
// dothrow.c:564-565 straight to throw_obj().
//
// What the five segments separate:
//
// - FIRE_CASES' three shooting roles pick different arms of
//   dothrow.c multishot_class_bonus() (37-83) and of throw_obj()'s racial
//   block (194-212). A human Ranger gets the Ranger's +1 for non-dagger
//   ammunition and no racial bonus; an elven Ranger adds the elven bow and
//   arrow +1 at :198; a Caveman gets the Cave Dweller's +1 for sling skill
//   and fires GEM_CLASS ammunition rather than WEAPON_CLASS.
// - Each segment fires twice, and throw_obj():233 draws rnd() for every
//   volley, so the pair separates a volley of one missile from a volley of
//   more than one. A volley of one prints no count line at all, because
//   :243's `multishot > 1 || shotlimit > 0` is what produces it.
// - CANCEL_CASE answers the direction prompt with Escape and then with `.`,
//   which are throw_obj()'s two no-time returns: getdir() answering 0 at
//   :95-99, and the self-throw refusal at :132-136.
//
// The Caveman segment is the shape development session
// seed1150-caveman-explore-move reaches at its step 34, recorded from a
// different seed so that the matrix and the session cannot share an accident.
//
// LIQUID_CASE covers dothrow.c throwit():1794-1802, the sound a missile makes
// when it lands in water or lava. C reads the landing square, not the flight,
// so this segment walks to a corridor two squares from a moat and then shoots
// along the corridor: the volley passes nothing wet and C says nothing. Aiming
// the same shot south instead puts the arrow in the moat, which is the case
// this segment cannot carry, because C goes on into trap.c water_damage() --
// see the deferral throw-into-water-or-lava-refuses-too-widely.
//
// Two branches the `f` command owns have no segment here, because C carries
// them straight into code this port has not reached. An empty quiver prints
// "You have no ammunition readied." and then falls into doquiver_core() at
// :551, and a missile that reaches a monster reaches thitmonst(). Both are
// recorded as deferrals instead.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ammo_and_launcher, is_ammo } from '../js/obj.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20000110090000';

// One wait ahead of the command settles the arrival turn, so a move wrongly
// spent by the command itself shifts every screen after it.
const WAIT = '.';
const FIRE = 'f';
// The two --More-- prompts doswapweapon() produces: prinv() for the weapon
// that comes into the hand (wield.c:226) and prinv() for the one that leaves
// it (wield.c:492).
const SWAP_MORE = '  ';
const EAST = 'l';
const WEST = 'h';
const SOUTHWEST = 'b';
const ESCAPE = '\u001B'; // cmd.c NHKF_ESC
const SELF = '.';

const ROLES = {
    ranger: { role: 'Ranger', race: 'human', gender: 'male', align: 'neutral' },
    elfranger: {
        role: 'Ranger', race: 'elf', gender: 'male', align: 'chaotic',
    },
    caveman: {
        role: 'Caveman', race: 'human', gender: 'male', align: 'neutral',
    },
};

// Seeds were chosen by recording each role's start until the first `f` landed
// its missiles on ordinary floor with no monster in the flight path. The
// matrix asserts what each seed produces rather than trusting the number.
export const FIRE_CASES = [
    { who: 'ranger', seed: 7810001, ammo: 'arrow' },
    { who: 'caveman', seed: 7810002, ammo: 'flint stone' },
    { who: 'elfranger', seed: 7810003, ammo: 'elven arrow' },
];

export const CANCEL_CASE = { who: 'ranger', seed: 7810005 };

// The seed came from a scan of 7320000-7322999 for a D:1 the port generates
// with a liquid square a missile can land on. Nothing else puts water or lava
// under a thrown object at this depth: mklev.c makelevel():1371 reaches
// do_mkroom(SWAMP) at 1371-1372 only below depth 15, and wizard terrain wishes
// are unported.
// The scan walked each level from the hero's start and simulated zap.c bhit();
// 7320232 was the nearest hit, a Water-surrounded vault themeroom whose moat
// ring sits two squares south of a corridor six steps from where the hero
// arrives.
export const LIQUID_CASE = { who: 'ranger', seed: 7320232 };

// Four steps west and two southwest reach that corridor square. The shot then
// goes west, along the corridor and away from the moat.
const WALK_TO_MOAT_EDGE = `${WEST.repeat(4)}${SOUTHWEST.repeat(2)}`;

// pettype:none keeps the pet out of the flight path and out of the message
// window; !acoustics keeps dosounds() from adding a line between the swap and
// the shot; the three startup options skip the windows that would otherwise
// swallow the leading wait.
function nethackrc(who) {
    const { role, race, gender, align } = ROLES[who];
    return [
        `OPTIONS=name:Volley,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

export const FIRE_MOVES =
    `${WAIT}${FIRE}${SWAP_MORE}${EAST}${WAIT}${FIRE}${EAST}${WAIT}`;
export const CANCEL_MOVES =
    `${WAIT}${FIRE}${SWAP_MORE}${ESCAPE}${WAIT}${FIRE}${SELF}`;
// The Escape here is CANCEL_MOVES' first no-time return used as a tool: it
// leaves the bow wielded without spending an arrow, so the walk that follows
// starts from a full quiver and the only shot in the segment is the last one.
export const LIQUID_MOVES = `${WAIT}${FIRE}${SWAP_MORE}${ESCAPE}`
    + `${WALK_TO_MOAT_EDGE}${FIRE}${WEST}${WAIT}`;

function segment({ seed, who, moves }) {
    return { seed, datetime: DATETIME, nethackrc: nethackrc(who), moves };
}

export function loadFireCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: FIRE_CASES.map(
            (entry) => segment({ ...entry, moves: FIRE_MOVES }),
        ),
    });
}

export function loadFireCancelRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segment({ ...CANCEL_CASE, moves: CANCEL_MOVES })],
    });
}

export function loadFireBesideLiquidRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segment({ ...LIQUID_CASE, moves: LIQUID_MOVES })],
    });
}

// Replay each segment up to the first `f` and confirm the state that decides
// which arm of dofire() the command takes, so a re-recording that quietly
// moved the launcher into the primary slot fails here rather than passing a
// differential against a case that no longer tests the swap.
async function verifySwapAndRetryStart(recipeSegment) {
    await runSegment({ ...recipeSegment, moves: WAIT });
    if (!game.uquiver || !is_ammo(game.uquiver, game))
        throw new Error('the quiver holds no ammunition');
    if (ammo_and_launcher(game.uquiver, game.uwep, game))
        throw new Error('the launcher is already wielded');
    if (!ammo_and_launcher(game.uquiver, game.uswapwep, game))
        throw new Error('the secondary slot holds no matching launcher');
}

export async function verifyFireCommandSegment(recipeSegment) {
    await verifySwapAndRetryStart(recipeSegment);
}

export async function runFireCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'fire volleys', recipe: loadFireCommandRecipe() },
            { label: 'fire cancelled', recipe: loadFireCancelRecipe() },
            {
                label: 'fire beside liquid',
                recipe: loadFireBesideLiquidRecipe(),
            },
        ],
        summaryLabel: 'FIRE COMMAND',
        verifySegment: verifyFireCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runFireCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`fire command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
