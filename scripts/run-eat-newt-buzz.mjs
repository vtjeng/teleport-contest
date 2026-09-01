#!/usr/bin/env node

// Record and replay completion of a PM_NEWT corpse meal against the patched C
// reference. The recipe contains replay inputs only; runFreshMatrix() records
// the reference output in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

// The seed, fixed clock, and character/options are independent fresh inputs.
// Debug genesis creates a newt beside the hero; h kills it, the second h steps
// onto its corpse, and e/y starts and confirms the meal.
const EAT_NEWT_BUZZ_CASE = Object.freeze({
    label: 'PM_NEWT eating completion',
    seed: 9130088,
    datetime: '20310203040506',
    nethackrc: 'OPTIONS=name:NewtTest,role:Valkyrie,race:human,gender:female,align:neutral\n'
        + 'OPTIONS=!legacy,!tutorial,!splash_screen\n'
        + 'OPTIONS=playmode:debug,pettype:none,!autopickup,!acoustics,time\n',
    moves: '\x07newt\nhhey',
});

export function loadEatNewtBuzzRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: EAT_NEWT_BUZZ_CASE.seed,
            datetime: EAT_NEWT_BUZZ_CASE.datetime,
            nethackrc: EAT_NEWT_BUZZ_CASE.nethackrc,
            moves: EAT_NEWT_BUZZ_CASE.moves,
        }],
    }, 'PM_NEWT eating completion recipe');
}

export async function verifyEatNewtBuzzSegment(segment) {
    const replay = await runSegment(segment);
    assert.equal(game.u.uen, 3);
    assert.equal(game.u.uenmax, 3);
    assert.equal(game.u.uenpeak, 3);
    assert.equal(
        game.nhDisplay.toplines,
        'This newt corpse is stringy.  You finish eating the newt corpse.',
    );
    assert.equal(replay.getScreens().length, segment.moves.length + 1);
    assert.equal(replay.getCursors().length, segment.moves.length + 1);
    assert.deepEqual(replay.getRngLog().slice(-3), [
        'rn2(3)=1',
        'rnd(3)=3',
        'rn2(3)=0',
    ]);
}

export async function runEatNewtBuzzMatrix() {
    return runFreshMatrix({
        entries: [{
            label: EAT_NEWT_BUZZ_CASE.label,
            recipe: loadEatNewtBuzzRecipe(),
        }],
        summaryLabel: 'PM_NEWT EATING COMPLETION',
        verifySegment: verifyEatNewtBuzzSegment,
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runEatNewtBuzzMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `PM_NEWT eating completion: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
