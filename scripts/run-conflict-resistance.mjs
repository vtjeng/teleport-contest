#!/usr/bin/env node

// Run the checked-in Conflict-resistance case through a fresh C recording.
// The recipe reaches mon.c movemon_singlemon()'s final Conflict arm after a
// right-hand ring is wished up and worn, then lets the adjacent newt take
// three turns. The first two visible attempts resist and fall through to
// dochugw(); the next case boundary is deliberately outside this slice.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CONFLICT } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';
import { PM_NEWT } from '../js/monsters.js';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const CONFLICT_RESISTANCE_SEED = 9300001;
export const CONFLICT_RESISTANCE_DATETIME = '20330101090000';
export const CONFLICT_RESISTANCE_RC = [
    'OPTIONS=name:ConfFresh,role:Knight,race:human,gender:female,align:lawful',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,playmode:debug',
    '',
].join('\n');
export const CONFLICT_RESISTANCE_MOVES =
    ' \x17ring of conflict\nPir\x07newt\nm.m.m.';

export function loadConflictResistanceRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: CONFLICT_RESISTANCE_SEED,
            datetime: CONFLICT_RESISTANCE_DATETIME,
            nethackrc: CONFLICT_RESISTANCE_RC,
            moves: CONFLICT_RESISTANCE_MOVES,
        }],
    }, 'Conflict resistance recipe');
}

// The recipe's short walk is also replayed by the focused test. These state
// checks name the setup and the ordinary movement that follows the resisting
// fightm() call; the strict matrix below checks every screen, cursor, and
// random-number value against a newly recorded C run.
export async function verifyConflictResistanceSegment(recipeSegment) {
    await runSegment(recipeSegment);
    if ((game.u.uprops[CONFLICT]?.extrinsic ?? 0) === 0) {
        throw new Error('Conflict resistance case did not wear the ring');
    }
    const newt = game.level.monsters[game.u.ux - 1]?.[game.u.uy];
    if (newt?.data?.pmidx !== PM_NEWT) {
        throw new Error('Conflict resistance case did not retain its newt');
    }
}

export async function runConflictResistanceMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'Conflict resistance',
            recipe: loadConflictResistanceRecipe(),
        }],
        summaryLabel: 'CONFLICT RESISTANCE',
        verifySegment: verifyConflictResistanceSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runConflictResistanceMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `Conflict resistance: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
