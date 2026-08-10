#!/usr/bin/env node

// Record and replay `,` on a square holding exactly one object the hero is
// allowed to take, against the patched C reference.
//
// pickup.c pickup() (672-910) sends that square through query_objlist()
// (1046-1077), whose AUTOSELECT_SINGLE shortcut at 1072 answers before
// sortloot() and before any menu window, and then through pickup_object()
// (1803-1888). The rows below separate the branches those two functions
// take:
//
// - The dropped dagger is the shortest route to the whole chain: one object,
//   an inventory letter already spoken for, no merge.
// - The food rations drop as a pair. query_objlist() passes `last->quan` as
//   the count, so pickup.c:1876's `obj->quan != count` is false and
//   splitobj() never runs.
// - The reqmenu row presses `m,`. cmd.c:1799 gives the pickup row
//   CMD_M_PREFIX, so iflags.menu_requested is still set at pickup.c:759,
//   where it is the second disjunct of the menu-style test.
// - The menustyle:traditional row makes C take the old-style interface at
//   793-892 instead. For a single object with no count that arm reaches the
//   same pickup_object() with the same lcount, so the two agree keystroke for
//   keystroke. Nothing here parses menustyle, so this row is what shows the
//   port's menu arm costs it nothing.
// - The dropped purse is the COIN_CLASS arm of pickup_object():1874 with no
//   gold left in inventory to merge with.
// - The generated gold pile is walked onto while the purse is still carried,
//   so addinv() merges and prinv() prints the "(N in total)" form.
// - The two corpses are the CORPSE arm at pickup.c:1828.
//   u_safe_from_fatal_corpse(obj, st_all) answers TRUE by a different term in
//   each: the bare-handed Valkyrie reaches st_petrifies and passes because
//   touch_petrifies(lichen) is false, while the Monk starts in leather gloves
//   (u_init.c:102) and stops at st_gloves.
//
// A second object on the square falls past query_objlist():1072 into
// sortloot() and the menu, which the port refuses; that boundary is pinned by
// scripts/pickup-command.test.mjs rather than here, because C draws a menu
// there and no recording can match it.
//
// Seeds: the drop rows all reuse one arbitrary seed, because what the hero
// drops does not depend on the level. The gold-pile seed came from a
// port-side scan for a starting room whose gold pile sits one step from the
// hero. The two corpse seeds are the ones scripts/run-hostile-melee-kill.mjs
// already records as leaving a body; no recorded session was read.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed Thursday morning with no calendar event, so nothing competes with
// the pickup line for the top row.
const DROP_DATETIME = '20310203040506';
// The datetime scripts/run-hostile-melee-kill.mjs records its kills at, which
// is what fixes the two corpses below.
const KILL_DATETIME = '20260214031500';
// Space dismisses the startup line; the trailing rest lets a turn that the
// pickup wrongly failed to spend show up as a shifted PRNG log.
const START = ' ';
const REST = '.';
// cmd.c bind_keys() puts the reqmenu prefix on 'm'.
const MENU_PREFIX = 'm';

// One seed per level shape.
const DROP_SEED = 7712001;
const GOLD_PILE_SEED = 7712167;
const LICHEN_SEED = 7710044;
const GOBLIN_SEED = 9900243;

function nethackrc({ role, gender, align, extra = [] }) {
    return [
        `OPTIONS=name:Pick,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet, so no monster shares the hero's turns; no autopickup, so
        // arriving on a square never lifts anything before `,` asks.
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...extra,
        '',
    ].join('\n');
}

function valkyrie(extra) {
    return nethackrc({
        role: 'Valkyrie', gender: 'female', align: 'neutral', extra,
    });
}

function healer() {
    return nethackrc({ role: 'Healer', gender: 'female', align: 'neutral' });
}

function monk() {
    return nethackrc({ role: 'Monk', gender: 'female', align: 'neutral' });
}

export const PICKUP_ONE_OBJECT_CASES = [
    {
        label: 'a dropped dagger',
        seed: DROP_SEED,
        datetime: DROP_DATETIME,
        nethackrc: valkyrie(),
        setup: 'db',
        message: 'b - a +0 dagger.',
    },
    {
        label: 'a whole stack of food rations',
        seed: DROP_SEED,
        datetime: DROP_DATETIME,
        nethackrc: valkyrie(),
        setup: 'dd',
        message: 'd - 2 uncursed food rations.',
    },
    {
        label: 'a dropped dagger under the reqmenu prefix',
        seed: DROP_SEED,
        datetime: DROP_DATETIME,
        nethackrc: valkyrie(),
        setup: 'db',
        command: `${MENU_PREFIX},`,
        message: 'b - a +0 dagger.',
    },
    {
        label: 'a dropped dagger under menustyle:traditional',
        seed: DROP_SEED,
        datetime: DROP_DATETIME,
        nethackrc: valkyrie(['OPTIONS=menustyle:traditional']),
        setup: 'db',
        message: 'b - a +0 dagger.',
    },
    {
        label: 'the whole of a dropped purse',
        seed: DROP_SEED,
        datetime: DROP_DATETIME,
        nethackrc: healer(),
        setup: 'd$',
        message: '$ - 1600 gold pieces.',
    },
    {
        label: 'a generated gold pile merging with the purse',
        seed: GOLD_PILE_SEED,
        datetime: DROP_DATETIME,
        nethackrc: healer(),
        setup: 'l',
        message: '$ - 5 gold pieces (1691 in total).',
    },
    {
        label: 'a lichen corpse lifted bare-handed',
        seed: LICHEN_SEED,
        datetime: KILL_DATETIME,
        nethackrc: valkyrie(),
        setup: 'll',
        message: 'f - a lichen corpse.',
    },
    {
        label: 'a goblin corpse lifted through leather gloves',
        seed: GOBLIN_SEED,
        datetime: KILL_DATETIME,
        nethackrc: monk(),
        setup: 'bb',
        message: 'k - a goblin corpse.',
    },
];

// The keystrokes up to and including the command, which is where the message
// the case names is on the top row.
function keysThroughPickup(entry) {
    return START + entry.setup + (entry.command ?? ',');
}

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: entry.nethackrc,
        moves: keysThroughPickup(entry) + REST,
    };
}

export function loadPickupOneObjectRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: PICKUP_ONE_OBJECT_CASES.map(segmentFor),
    }, 'pickup one object recipe');
}

function caseForSegment(segment) {
    const found = PICKUP_ONE_OBJECT_CASES.find(
        (entry) => segmentFor(entry).moves === segment.moves
            && entry.seed === segment.seed
            && entry.nethackrc === segment.nethackrc,
    );
    if (!found) {
        throw new Error(
            `no pickup case for moves ${JSON.stringify(segment.moves)}`,
        );
    }
    return found;
}

async function play(segment, moves) {
    let boundary = null;
    await runSegment(
        { ...segment, moves },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
}

export async function verifyPickupOneObjectSegment(segment) {
    const entry = caseForSegment(segment);
    // The same keys without the command, so the turn the command spends is
    // measured against the turn count it would have left alone.
    await play(segment, START + entry.setup);
    const movesBeforePickup = game.moves;

    await play(segment, keysThroughPickup(entry));

    const { u, level } = game;
    if (level.objects[u.ux]?.[u.uy]) {
        throw new Error(`${entry.label}: the square still holds an object`);
    }
    // gt.toplines, which pline.c writes whether or not the row was repainted.
    const toplines = game._ttyToplines ?? '';
    if (toplines !== entry.message) {
        throw new Error(
            `${entry.label}: top line is ${JSON.stringify(toplines)}, not `
            + `${JSON.stringify(entry.message)}`,
        );
    }
    // The lifted object carries the letter its own message announced.
    const invlet = entry.message[0];
    let held = null;
    for (let object = game.invent; object; object = object.nobj) {
        if (object.invlet === invlet) held = object;
    }
    if (!held) {
        throw new Error(
            `${entry.label}: no inventory object holds letter ${invlet}`,
        );
    }
    // pickup() answered 1, so hack.c dopickup() returned ECMD_TIME and
    // allmain.c spent a turn where slice one's refusals spent none.
    if (game.moves !== movesBeforePickup + 1) {
        throw new Error(
            `${entry.label}: the pickup moved the turn counter from `
            + `${movesBeforePickup} to ${game.moves}`,
        );
    }
}

export async function runPickupOneObjectMatrix() {
    return runFreshMatrix({
        entries: [
            {
                label: 'pickup one object',
                recipe: loadPickupOneObjectRecipe(),
            },
        ],
        summaryLabel: 'PICKUP ONE OBJECT',
        verifySegment: verifyPickupOneObjectSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPickupOneObjectMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`pickup one object: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
