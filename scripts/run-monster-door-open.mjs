#!/usr/bin/env node

// Run the checked-in matrix for a monster that opens the closed door it steps
// onto, through fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.
//
// The behavior is monmove.c postmov()'s `here->doormask == D_CLOSED &&
// can_open` arm (1576-1592) and the UnblockDoor macro above it (1526-1536).
// What a recording can show is the doorway glyph, the vision the open door
// lets through, the PRNG log, and the feedback line, so the matrix spreads
// over the three things that select that line: whether the hero can see the
// square, and the two option gates around it.
//
// `You see a door open.` has no segment. It needs a hero who sees the square
// while canspotmon() fails for the monster standing on it, which on this level
// means an invisible one; ROADMAP.md records why nothing behind the current
// boundary sets minvis on dungeon level one. scripts/monmove.test.mjs pins
// that arm against postmov() directly.
//
// Seeds were found by running the port over a seed range and reading which
// closed doors had become open by the end of each game, not by copying any
// recorded session. Each segment below was then checked twice: it passes the
// differential now, and with the closed-door destination admission removed the
// port stops early at the recorded screen.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc(pettype, extra) {
    return [
        'OPTIONS=name:Doorman,role:Valkyrie,race:human,gender:female,'
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype}`,
        ...(extra ? [extra] : []),
        '',
    ].join('\n');
}

// The hero searches for the whole segment. Standing still keeps the hero's own
// moves out of the recording and gives the monsters turns in which to reach a
// door.
function waiting({ seed, pettype = 'none', extra = null, turns }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc(pettype, extra),
        moves: 's'.repeat(turns),
    };
}

export function loadMonsterDoorOpenRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The plain case, and the one the development session that opened
            // this goal stops on: a monster the hero cannot see opens a door
            // and the hero hears it.
            waiting({ seed: 5100057, turns: 30 }),
            // Two closed doors opened in one game, in different rooms. Once a
            // door is open the map, the vision it lets through, and every
            // later monster's route all depend on the first opening, so this
            // is the case in which a wrong rebuild compounds.
            waiting({ seed: 5100225, turns: 30 }),
            // The hero stands beside the door and watches it open, which is
            // the `%s opens a door.` arm and the one a screen can show.
            waiting({ seed: 5100114, turns: 30 }),
            // The same arm seen from two squares away rather than from the
            // adjacent square, so the door glyph rather than the monster is
            // what the frame turns over.
            waiting({ seed: 5100232, turns: 30 }),
            // A pet in the same scan as the opener. The pet has no hands and
            // can never open a door itself, so what this covers is a monster
            // still to act after the map and the vision changed under it.
            waiting({ seed: 5200031, pettype: 'dog', turns: 30 }),
            // !acoustics. pline.c You_hear() (436-451) returns before
            // printing, which the arm's own !Deaf test does not do.
            waiting({
                seed: 5300009,
                extra: 'OPTIONS=!acoustics',
                turns: 30,
            }),
            // A permanently deaf hero. youprop.h:125 folds u.uroleplay.deaf
            // into Deaf, and this arm is where the port reads it.
            waiting({ seed: 5400143, extra: 'OPTIONS=deaf', turns: 30 }),
            // !verbose silences the whole switch at monmove.c:1583 while the
            // door still opens.
            waiting({ seed: 5500090, extra: 'OPTIONS=!verbose', turns: 30 }),
        ],
    }, 'monster door open recipe');
}

export async function runMonsterDoorOpenMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster door open',
            recipe: loadMonsterDoorOpenRecipe(),
        }],
        summaryLabel: 'MONSTER DOOR OPEN',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterDoorOpenMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`monster door open: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
