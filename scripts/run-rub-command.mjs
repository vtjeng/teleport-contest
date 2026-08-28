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
import {
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';
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

export function loadRubLampWieldRecipe() {
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
            // the second invocation; the JavaScript port then stops before
            // the already-wielded lamp's first rn2(3).
            moves: `${START}${WIZWISH_KEY}magic lamp${NEWLINE}`
                + `${EXTCMD_KEY}rub${NEWLINE}o`,
        }],
    }, 'rub lamp wield recipe');
}

async function verifyRubLampWieldBoundary(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (!boundary?.message.includes('dorub() with an already-wielded lamp')) {
        throw boundary ?? new Error('rub lamp continuation reached no boundary');
    }
    // The game starts at move 1. apply.c:1812's ECMD_TIME spends exactly one
    // turn before the canned dorub reaches the refusal, so the counter is 2.
    assert.equal(game.moves, 2);
    assert.equal(game.uwep?.otyp, MAGIC_LAMP);
    assert.equal(game.uwep?.owornmask & W_WEP, W_WEP);
    assert.equal(game.unweapon, true);
    assert.equal(game.command_queue[CQ_CANNED].length, 0);
    return replay;
}

function verifyRubLampWieldDifferential(result) {
    assert.equal(result.passed, false);
    assert.equal(result.error, null);
    assert.equal(result.segmentMismatch, null);
    assert.equal(result.animMismatch, null);

    // C's first unmatched operation is apply.c:1817's first random lamp
    // effect. A missing JS entry proves that every prior random call matched.
    assert.equal(result.rngMismatch?.cCaller, 'dorub(apply.c:1817)');
    assert.match(result.rngMismatch?.cEntry ?? '', /^rn2\(3\)=\d+$/u);
    assert.equal(result.rngMismatch?.jsEntry, undefined);
    assert.equal(result.rngMismatch?.index, result.lengths.rng.js);

    // The port stops during C's final input boundary. `js-missing` at the JS
    // lengths proves that every complete screen and cursor before it matched.
    assert.equal(result.screenMismatch?.kind, 'js-missing');
    assert.equal(result.screenMismatch?.index, result.lengths.screens.js);
    assert.equal(result.cursorMismatch?.jsCursor, undefined);
    assert.equal(result.cursorMismatch?.index, result.lengths.cursors.js);
    assert.equal(result.rngMismatch?.location?.key, 'o');
    assert.equal(result.screenMismatch?.location?.key, 'o');
    assert.equal(result.cursorMismatch?.location?.key, 'o');
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

    const wieldRecipe = loadRubLampWieldRecipe();
    const replay = await verifyRubLampWieldBoundary(wieldRecipe.segments[0]);
    process.stdout.write('[rub unwielded lamp prefix 1/1] 1 segments\n');
    const wield = await runDifferential(wieldRecipe);
    verifyRubLampWieldDifferential(wield);
    process.stdout.write(
        `RUB LAMP WIELD PREFIX: PASS: ${replay.getRngLog().length} PRNG calls, `
        + `${replay.getScreens().length} screens, `
        + `${replay.getCursors().length} cursors before apply.c:1817\n`,
    );
    return {
        passed: true,
        totals: {
            segments: 2,
            rng: cancellation.totals.rng + replay.getRngLog().length,
            screens: cancellation.totals.screens + replay.getScreens().length,
            cursors: cancellation.totals.cursors + replay.getCursors().length,
            animFrames: cancellation.totals.animFrames,
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
