#!/usr/bin/env node

// Record and replay dothrow.c throw_gold() against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// throw_obj() hands the whole coin stack to throw_gold() whenever the chosen
// object is COIN_CLASS and is not the quiver, so this is the one arm `t` can
// reach that `f` cannot: dofire() always throws the quiver. throw_gold() is
// not a variant of throwit() -- it never splits, never runs a volley, and its
// tail differs -- so it needs its own matrix rather than another `t` segment
// in scripts/run-throw-command.mjs.
//
// What the seven ordinary segments separate, by the C line each one reaches:
//
// - `.t$.`  2661-2669. u.dx, u.dy and u.dz are all zero, so the throw is
//           refused, ECMD_CANCEL keeps the turn, and the gold stays in the
//           pack. This is the only segment whose last key spends no time.
// - `.t$<`  2682-2691 with uarmh false, then the shared tail at 2721-2730.
//           ceiling() names what the gold hit and the gold lands back on the
//           hero's own square.
// - `.t$>`  2682 with u.dz < 0 false, then 2723-2724. surface() answers
//           "stairs" rather than "floor", because the hero starts on the
//           upstairs.
// - `.ht$>` the same arm one square west, where surface() answers "floor".
//           The pair is what pins the message to surface() rather than to a
//           constant.
// - `.t$l`  2696-2718 with a clear line east: bhit() carries the gold until
//           the room wall stops it, ship_object() finds nowhere below, and it
//           lands two squares from the hero.
// - `.t$j`  2701-2704 through !ZAP_POS: the wall south of the hero is not a
//           square gold can enter, so bhit() never runs and the gold drops at
//           the hero's feet.
// - `.yyyt$k` the same 2701-2704 arm through its third conjunct instead. The
//           hero walks to the square below the room's closed door, and
//           closed_door() rejects a square that ZAP_POS() accepts.
//
// The eighth segment is separate because it needs wizard mode. No role starts
// with both gold and a helmet -- u_init.c gives gold to the Healer at 678-680
// and the Tourist at 754-756, and a helmet to the Knight alone at 94 -- so the
// uarmh arm at 2688-2690 is reached by wishing a helmet onto a Healer and
// wearing it. Wishing gold onto the Knight instead stops in the port, at
// mkobj.c next_ident() inside the wish itself.
//
// Three arms of throw_gold() have no segment here.
//
// A monster in the flight path reaches dokick.c ghitm() at 2712 -- see the
// deferral throw-gold-caught-by-a-monster, which drops pettype:none so the
// hero's own pet stands in the way.
//
// A count typed at the object prompt splits the stack, and answering the
// direction prompt with `.` then merges it back through unsplitobj() at
// 2665-2667. js/invent.js stops at the count itself, one prompt earlier and
// for every object prompt at once -- see the deferral
// throw-prompt-answered-with-a-count.
//
// Gold that lands on a shop floor reaches shk.c sellobj() at 2726-2727. No
// shop is reachable within a Dlvl 1 segment, and js/do.js already stops for
// the same shop on an ordinary drop.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COIN_CLASS } from '../js/objects.js';
import { GETOBJ_SUGGEST } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { throw_ok } from '../js/dothrow.js';
import { runFreshMatrix } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20000110090000';

// One wait ahead of the command settles the arrival turn, so a move wrongly
// spent by the command itself shifts every screen after it.
const WAIT = '.';
const THROW = 't';
const GOLD = '$'; // invent.c GOLD_SYM, the letter every coin stack answers to
const SELF = '.';
const UP = '<';
const DOWN = '>';
const EAST = 'l';
const SOUTH = 'j';
const NORTH = 'k';
const WEST = 'h';
const NORTHWEST = 'y';
// A space dismisses the --More-- between the two lines the helmet case prints.
const MORE = ' ';
const NEWLINE = '\n';
// cmd.c:2000 binds C('w') to the "wizwish" row.
const WIZWISH_KEY = String.fromCharCode(0x17);

// The seed was chosen by scanning upward from 6120000 for a Healer who starts
// on the upstairs of a room with a wall directly south, a run of clear floor
// east, and a closed door reachable in three diagonal steps -- the four
// squares the seven segments aim at. verifyThrowGoldSegment() below asserts
// what the seed produces rather than trusting the number.
const SEED = 6120001;

// Every segment throws the Healer's whole starting purse, which u_init.c rolls
// as rn1(1000, 1001) at 678-680. Wizard mode draws ahead of that roll, so the
// same seed funds the helmet game differently; both amounts are read off the
// recorded status line rather than predicted.
export const PURSE = { normal: 1911, debug: 1878 };

export const THROW_GOLD_CASES = [
    { label: 'self', moves: `${WAIT}${THROW}${GOLD}${SELF}` },
    { label: 'ceiling', moves: `${WAIT}${THROW}${GOLD}${UP}` },
    { label: 'stairs', moves: `${WAIT}${THROW}${GOLD}${DOWN}` },
    { label: 'floor', moves: `${WAIT}${WEST}${THROW}${GOLD}${DOWN}` },
    { label: 'flight', moves: `${WAIT}${THROW}${GOLD}${EAST}` },
    { label: 'wall', moves: `${WAIT}${THROW}${GOLD}${SOUTH}` },
    {
        label: 'closed door',
        moves: `${WAIT}${NORTHWEST.repeat(3)}${THROW}${GOLD}${NORTH}`,
    },
];

// A wish, the wear it needs, then the throw. `l` is the letter the wished
// helmet takes in the Healer's pack; verifyThrowGoldHelmSegment() asserts it.
// The trailing wait paints a screen over the second message, so a turn the
// command wrongly spent would show.
export const HELM_MOVES = `${WAIT}${WIZWISH_KEY}helmet${NEWLINE}Wl`
    + `${THROW}${GOLD}${UP}${MORE}${WAIT}`;

// pettype:none keeps the pet out of the flight path -- a monster there reaches
// ghitm(), which is out of scope -- and !acoustics keeps dosounds() from
// adding a line between the commands. The three startup options skip the
// windows that would otherwise swallow the leading wait.
function nethackrc({ role, gender, align, debug = false }) {
    return [
        `OPTIONS=name:Volley,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:none,!acoustics${debug ? ',playmode:debug' : ''}`,
        '',
    ].join('\n');
}

const HEALER = { role: 'Healer', gender: 'female', align: 'neutral' };

function segment(moves, options = HEALER) {
    return {
        seed: SEED, datetime: DATETIME, nethackrc: nethackrc(options), moves,
    };
}

export function loadThrowGoldRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: THROW_GOLD_CASES.map(({ moves }) => segment(moves)),
    }, 'throw gold recipe');
}

export function loadThrowGoldHelmRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segment(HELM_MOVES, { ...HEALER, debug: true })],
    }, 'throw gold helmet recipe');
}

function slotAt(invlet) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.invlet === invlet) return obj;
    return null;
}

// Replay each segment up to its settling wait and confirm the purse the whole
// matrix throws, so a re-recording that quietly changed the role or the seed
// fails here rather than passing a differential against a case that no longer
// reaches throw_gold().
export async function verifyThrowGoldSegment(recipeSegment) {
    await runSegment({ ...recipeSegment, moves: WAIT });
    const gold = slotAt(GOLD);
    if (!gold) throw new Error(`seed ${recipeSegment.seed} carries no gold`);
    if (gold.oclass !== COIN_CLASS)
        throw new Error(`slot $ holds oclass ${gold.oclass}`);
    const expected = PURSE[
        recipeSegment.nethackrc.includes('playmode:debug') ? 'debug' : 'normal'
    ];
    if (gold.quan !== expected)
        throw new Error(`slot $ holds ${gold.quan} gold, expected ${expected}`);
    // COIN_CLASS is throw_ok()'s own arm at dothrow.c:338-339, so the prompt
    // offers the purse rather than hiding it behind `?*`.
    if (throw_ok(gold, game) !== GETOBJ_SUGGEST)
        throw new Error('throw_ok() does not suggest the purse');
    // The quiver is what would send the coins to throwit() instead.
    if (game.uquiver === gold)
        throw new Error('the purse is quivered, so throw_obj() would not '
            + 'reach throw_gold()');
    // The helmet case wears what the wish puts in the first free slot, so a
    // starting pack that grew would aim its W at the wrong object.
    if (slotAt('l'))
        throw new Error('slot l is taken before the wish');
}

export async function runThrowGoldMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'throw gold', recipe: loadThrowGoldRecipe() },
            { label: 'throw gold helmet', recipe: loadThrowGoldHelmRecipe() },
        ],
        summaryLabel: 'THROW GOLD',
        verifySegment: verifyThrowGoldSegment,
        // One segment per recorder run. The helmet recipe is a debug game,
        // which scripts/record-session.mjs terminates with a save left behind,
        // and it clears the install directory only before a chunk's first
        // segment.
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runThrowGoldMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`throw gold: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
