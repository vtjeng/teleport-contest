#!/usr/bin/env node

// Record #rub's cancellation and unwielded-lamp continuation against the
// patched C program, then replay the same inputs through the JavaScript port.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CQ_CANNED, W_WEP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { MAGIC_LAMP } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

export const START = '  n.';
export const WIZWISH_KEY = '\x17'; /* C('w'), cmd.c's wizwish binding */
export const EXTCMD_KEY = '#';
export const NEWLINE = '\n';
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';

export function loadRubCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // The development witness establishes that this startup envelope
            // reaches the running game in both programs. The behavior inputs
            // are independently shorter: wait, create one eligible lamp,
            // invoke #rub, and cancel. A trailing wait would enter an
            // unrelated unported monster-movement branch on this level.
            seed: 108,
            datetime: '20000110090000',
            nethackrc: [
                'OPTIONS=name:wizard,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=playmode:debug',
                '',
            ].join('\n'),
            moves: `${START}${WIZWISH_KEY}magic lamp${NEWLINE}`
                + `${EXTCMD_KEY}rub${NEWLINE}${ESCAPE_KEY}`,
        }],
    }, 'rub command recipe');
}

export function loadRubLampSmokeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Seed 731 and this 2004 winter timestamp are independent of the
            // seed-108 development witness. Wizard mode creates the lamp
            // directly because dungeon generation is outside this behavior;
            // the distinct seed still exercises the intervening monster
            // turn's PRNG sequence before the queued dorub runs again.
            seed: 731,
            datetime: '20040203040506',
            nethackrc: [
                'OPTIONS=name:rubber,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=playmode:debug',
                '',
            ].join('\n'),
            // u_init.c assigns the wished-for lamp inventory letter `o` for
            // this starting Wizard. Selecting it makes dorub wield and queue
            // the second invocation. At apply.c:1817 this seed draws
            // rn2(3) == 2, then rn2(2) == 1 for the sighted smoke message.
            moves: `${START}${WIZWISH_KEY}magic lamp${NEWLINE}`
                + `${EXTCMD_KEY}rub${NEWLINE}o`,
        }],
    }, 'rub lamp smoke recipe');
}

export function loadRubLampNothingRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // The bounded seed scan 732-750 selected seed 743 independently
            // of the seed-108 development witness and seed-731 smoke case.
            // The direct Wizard setup keeps dungeon generation outside this
            // behavior. C draws rn2(3) == 2, then rn2(2) == 0 at dorub().
            seed: 743,
            datetime: '20040203040506',
            nethackrc: [
                'OPTIONS=name:rubber,role:Wizard,race:human,gender:male,align:neutral',
                'OPTIONS=playmode:debug',
                '',
            ].join('\n'),
            // This Wizard also receives the wished-for lamp at inventory
            // letter `o`, so the same input reaches the retained-lamp branch.
            moves: `${START}${WIZWISH_KEY}magic lamp${NEWLINE}`
                + `${EXTCMD_KEY}rub${NEWLINE}o`,
        }],
    }, 'rub lamp nothing recipe');
}

async function verifyRubLampNonrelease(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    const expected = new Map([
        // The fixed values come from the two source-selected rn2(2) outcomes.
        [731, 'You now wield a lamp.  You see a puff of smoke.'],
        [743, 'You now wield a lamp.  Nothing happens.'],
    ]).get(segment.seed);
    assert.ok(expected, `unexpected rub non-release seed ${segment.seed}`);
    assert.equal(game.nhDisplay.toplines, expected);
    assert.equal(game.uwep?.otyp, MAGIC_LAMP);
    assert.equal(game.uwep?.spe, 1);
    assert.equal(game.uwep?.owornmask & W_WEP, W_WEP);
    assert.equal(game.unweapon, true);
    assert.equal(game.command_queue[CQ_CANNED].length, 0);
    return replay;
}

export async function runRubCommandMatrix() {
    const cancellation = await runFreshMatrix({
        entries: [{
            label: 'rub object selection and cancellation',
            recipe: loadRubCommandRecipe(),
        }],
        summaryLabel: 'RUB COMMAND CANCELLATION',
        // A debug segment can leave a save file, so the recorder must isolate
        // this case even if the matrix later gains another segment.
        chunkLimit: 1,
    });
    if (!cancellation.passed) return cancellation;
    assert.equal(cancellation.totals.segments, 1);

    const nonrelease = await runFreshMatrix({
        entries: [
            {
                label: 'rub charged magic lamp: smoke',
                recipe: loadRubLampSmokeRecipe(),
            },
            {
                label: 'rub charged magic lamp: nothing happens',
                recipe: loadRubLampNothingRecipe(),
            },
        ],
        summaryLabel: 'RUB MAGIC LAMP NON-RELEASE',
        verifySegment: verifyRubLampNonrelease,
        // Each debug segment can leave a save file. Record it in an isolated
        // install so the following case cannot restore that game.
        chunkLimit: 1,
    });
    if (!nonrelease.passed) return nonrelease;
    return {
        passed: true,
        totals: {
            segments: cancellation.totals.segments + nonrelease.totals.segments,
            rng: cancellation.totals.rng + nonrelease.totals.rng,
            screens: cancellation.totals.screens + nonrelease.totals.screens,
            cursors: cancellation.totals.cursors + nonrelease.totals.cursors,
            animFrames: cancellation.totals.animFrames
                + nonrelease.totals.animFrames,
        },
    };
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runRubCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`rub command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
