#!/usr/bin/env node

// Record and replay cmd.c's ordinary keyboard travel target-selection path.
// The recipe stops when dotravel_target() reaches hack.c's unported
// findtravelpath() boundary, after C and JavaScript have matched the prompt,
// feature scan, cursor movement, and travel-state setup.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const TRAVEL = '_';
const DOWNSTAIRS = '>';
const ACCEPT = '.';

function nethackrc({ name, role, race, gender, align }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!tips,!autopickup',
        '',
    ].join('\n');
}

export function loadTravelAdmissionRecipe({ acceptTarget = false } = {}) {
    const targetSuffix = acceptTarget ? ACCEPT : '';
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // Independently selected ordinary-mode input. The walk ends
                // beside a known downstairs, so `>` exercises the
                // source-ordered scan and `.` accepts its result.
                seed: 10885,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'TOne',
                    role: 'Valkyrie',
                    race: 'human',
                    gender: 'female',
                    align: 'neutral',
                }),
                moves: `ljjjjhhjjl${TRAVEL}${DOWNSTAIRS}${targetSuffix}`,
            },
            {
                // A second role/race/alignment keeps this a matrix, not a
                // single-map witness; its short walk ends at another known
                // downstairs before the same target-selection keys.
                seed: 10463,
                datetime: '20280917153000',
                nethackrc: nethackrc({
                    name: 'RTwo',
                    role: 'Rogue',
                    race: 'human',
                    gender: 'male',
                    align: 'chaotic',
                }),
                moves: `hhjjjhhjjhhhkkk${TRAVEL}${DOWNSTAIRS}${targetSuffix}`,
            },
        ],
    }, 'ordinary travel target-selection recipe');
}

export async function runTravelAdmissionMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'ordinary travel target selection',
            recipe: loadTravelAdmissionRecipe(),
        }],
        summaryLabel: 'TRAVEL TARGET SELECTION',
        chunkLimit: 1,
    });
    if (result.passed) assert.equal(result.totals.segments, 2);
    return result;
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    return (await runTravelAdmissionMatrix()).passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `travel target selection: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
