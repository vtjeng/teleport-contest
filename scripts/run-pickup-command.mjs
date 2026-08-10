#!/usr/bin/env node

// Record and replay the `,` command against the patched C reference.
//
// hack.c pickup_checks() (3788-3871) decides what `,` does with the square
// the hero stands on, and for a square holding nothing its whole answer is
// the terrain switch at 3826-3843: one pline() for each of throne, sink,
// grave, fountain, open door and altar, one for STAIRS, and a fall-through
// that prints "There is nothing here to pick up." Which arm a keystroke
// selects is fixed by the level the seed generates, so a seed plus a walk
// selects an arm here the way a letter selects an object for `d`:
//
// - STAIRS_CASE presses `,` before moving at all. u_init.c puts the hero on
//   the upstairs of D:1, so the stairs arm needs no walk.
// - ROOM_CASE steps once onto ordinary room floor and reaches the
//   fall-through, the arm every corridor and room square in the game takes.
// - DOORWAY_CASE steps onto a doorway with no door. IS_DOOR() is true there
//   and D_ISOPEN is not set, so it reaches the same fall-through by the
//   longer route -- the other side of the open-door arm's second conjunct.
// - OPEN_DOOR_CASE steps onto a doorway whose door stands open and reaches
//   "It won't come off the hinges."
// - FOUNTAIN_CASE, SINK_CASE and ALTAR_CASE each walk onto the furniture
//   named. The altar also pins the open-door arm's first conjunct: rm.h:214
//   and :215 alias doormask and altarmask onto one field, and this altar's
//   A_NEUTRAL mask is 2, the value of D_ISOPEN, so an arm that tested the
//   mask without IS_DOOR() would call it a door.
// - MENU_PREFIX_CASE presses `m,` on the stairs. cmd.c:1799 gives the pickup
//   row CMD_M_PREFIX, so rhack() passes the prefix through with
//   iflags.menu_requested set, and pickup_checks() answers before anything
//   reads it.
// - EXTENDED_CASE types `#pickup` instead. rhack() dispatches the bound key
//   itself and reaches doextcmd() only by this route, so the two arms of the
//   port that call dopickup() need a segment each.
//
// Two arms of the switch are out of reach and are pinned by the port-level
// tests in scripts/pickup-command.test.mjs instead. mklev.c generates no
// throne on D:1, and a grave carries mkgrave()'s headstone engraving, which
// the hero-destination seam still refuses.
//
// Seeds were found by generating D:1 with the port and reading the terrain of
// the squares a short straight walk from the hero's start reaches; no
// recorded session was read.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed Thursday morning with no calendar event, so nothing competes with
// pickup_checks()'s own line for the top row.
const DATETIME = '20310203040506';
// Space dismisses the startup line; the trailing rest spends the turn that
// `,` did not, so a `,` that wrongly took one shows up as a shifted PRNG log.
const START = ' ';
const REST = '.';
// cmd.c bind_keys() puts the reqmenu prefix on 'm'.
const MENU_PREFIX = 'm';

// rm.h terrain types, repeated here rather than imported so that a case
// declares the arm it means in the source's own vocabulary.
const DOOR = 23;
const ROOM = 25;
const STAIRS = 26;
const FOUNTAIN = 28;
const SINK = 30;
const ALTAR = 32;

// One seed per level shape. Each was chosen for the terrain a straight walk
// from the hero's start reaches, and for nothing else.
const FOUNTAIN_SEED = 7710047;
const DOORWAY_SEED = 7710001;
const OPEN_DOOR_SEED = 7710284;
const SINK_SEED = 7710214;
const ALTAR_SEED = 7710205;

function nethackrc() {
    return [
        'OPTIONS=name:Pick,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        // No pet, so no monster shares the hero's turns; no autopickup, so
        // arriving on a square never lifts anything before `,` asks.
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        '',
    ].join('\n');
}

export const PICKUP_CASES = [
    {
        label: 'the upstairs the hero starts on',
        seed: FOUNTAIN_SEED,
        walk: '',
        typ: STAIRS,
        message: 'The stairs are solidly affixed.',
    },
    {
        label: 'ordinary room floor',
        seed: FOUNTAIN_SEED,
        walk: 'k',
        typ: ROOM,
        message: 'There is nothing here to pick up.',
    },
    {
        label: 'a doorway with no door',
        seed: DOORWAY_SEED,
        walk: 'l',
        typ: DOOR,
        message: 'There is nothing here to pick up.',
    },
    {
        label: 'a doorway whose door stands open',
        seed: OPEN_DOOR_SEED,
        walk: 'hh',
        typ: DOOR,
        message: "It won't come off the hinges.",
    },
    {
        label: 'a fountain',
        seed: FOUNTAIN_SEED,
        walk: 'kkk',
        typ: FOUNTAIN,
        message: 'You could drink the water...',
    },
    {
        label: 'a sink',
        seed: SINK_SEED,
        walk: 'h',
        typ: SINK,
        message: 'The plumbing connects it to the floor.',
    },
    {
        label: 'an altar',
        seed: ALTAR_SEED,
        walk: 'hh',
        typ: ALTAR,
        message: 'Moving the altar would be a very bad idea.',
    },
    {
        label: 'the upstairs under the reqmenu prefix',
        seed: FOUNTAIN_SEED,
        walk: '',
        command: `${MENU_PREFIX},`,
        typ: STAIRS,
        message: 'The stairs are solidly affixed.',
    },
    {
        label: 'the upstairs through the extended-command prompt',
        seed: FOUNTAIN_SEED,
        walk: '',
        command: '#pickup\n',
        typ: STAIRS,
        message: 'The stairs are solidly affixed.',
    },
];

// The keystrokes up to and including the command, which is where the message
// the case names is on the top row.
function keysThroughPickup(entry) {
    return START + entry.walk + (entry.command ?? ',');
}

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: nethackrc(),
        moves: keysThroughPickup(entry) + REST,
    };
}

export function loadPickupCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: PICKUP_CASES.map(segmentFor),
    }, 'pickup command recipe');
}

function caseForSegment(segment) {
    const found = PICKUP_CASES.find(
        (entry) => segmentFor(entry).moves === segment.moves
            && entry.seed === segment.seed,
    );
    if (!found) {
        throw new Error(
            `no pickup case for moves ${JSON.stringify(segment.moves)}`,
        );
    }
    return found;
}

export async function verifyPickupCommandSegment(segment) {
    const entry = caseForSegment(segment);
    let boundary = null;
    await runSegment(
        { ...segment, moves: keysThroughPickup(entry) },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;

    const { u, level } = game;
    const typ = level.at(u.ux, u.uy)?.typ;
    if (typ !== entry.typ) {
        throw new Error(
            `${entry.label}: the hero stands on terrain ${typ}, not `
            + `${entry.typ}`,
        );
    }
    if (level.objects[u.ux]?.[u.uy]) {
        throw new Error(`${entry.label}: the square holds an object`);
    }
    // gt.toplines, which pline.c writes whether or not the row was repainted.
    const toplines = game._ttyToplines ?? '';
    if (toplines !== entry.message) {
        throw new Error(
            `${entry.label}: top line is ${JSON.stringify(toplines)}, not `
            + `${JSON.stringify(entry.message)}`,
        );
    }
    if (game.context.move) {
        throw new Error(`${entry.label}: the refusal spent a turn`);
    }
}

export async function runPickupCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'pickup command', recipe: loadPickupCommandRecipe() },
        ],
        summaryLabel: 'PICKUP COMMAND',
        verifySegment: verifyPickupCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPickupCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`pickup command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
