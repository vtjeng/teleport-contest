#!/usr/bin/env node

// Record #rub's object-selection boundary against the patched C program, then
// replay the same inputs through the JavaScript port. The selected-object
// branches belong to later slices, so this case cancels the prompt.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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

export async function runRubCommandMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'rub object selection and cancellation',
            recipe: loadRubCommandRecipe(),
        }],
        summaryLabel: 'RUB COMMAND',
        // A debug segment can leave a save file, so the recorder must isolate
        // this case even if the matrix later gains another segment.
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
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
