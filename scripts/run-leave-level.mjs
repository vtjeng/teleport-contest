#!/usr/bin/env node

// Run the checked-in matrix for do.c goto_level()'s opening phase through fresh
// C recordings. Every segment contains replay inputs only; runDifferential()
// records new reference output in an isolated temporary workspace.
//
// The hero walks from the up staircase she starts on to the level's down
// staircase and presses '>'. C then leaves the level, builds D:2 and draws it;
// this port stops at goto_level()'s destination choice, one step short, so a
// whole-segment match is impossible. The matrix asserts a prefix instead:
// every random-number value, screen and cursor the port produced has to equal
// C's, and the port's output has to end exactly at the '>' keystroke.
//
// That shape is deliberate and temporary. Slice 3 of the descent goal builds
// and draws D:2, at which point every segment below becomes a strict match and
// this runner should be reduced to runFreshMatrix() like its siblings.
//
// Choosing the walks: the paths were found by breadth-first search over the
// generated map, then replayed through the port to confirm nothing unported
// interrupts them. Each seed is otherwise arbitrary; the fixed datetime is
// shared because the date changes level generation, which would invalidate
// every path, and changes nothing in goto_level()'s opening phase.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    formatReport,
    runDifferential,
    validateCleanRecipe,
} from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20330607081011';

// The key bound to the `down` command, extcmdlist[]'s 0x3E row.
export const DOWN_COMMAND = '>';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', pettype }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=pettype:${pettype},!acoustics,!autopickup`,
        '',
    ].join('\n');
}

export function loadLeaveLevelRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                // A Valkyrie with no pet: keepdogs() walks the level's
                // monsters and takes none of them, so this is goto_level()'s
                // opening with the smallest possible companion state.
                seed: 6100772,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Downward', role: 'Valkyrie', pettype: 'none',
                }),
                moves: `hhybbhhj${DOWN_COMMAND}`,
            },
            {
                // The control: the same walk without the final '>'. It must
                // match strictly, which is what makes the one missing screen
                // in the segment above attributable to the descent alone.
                seed: 6100772,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Downward', role: 'Valkyrie', pettype: 'none',
                }),
                moves: 'hhybbhhj',
            },
            {
                // A second layout, walked in the opposite direction, so a port
                // that had hardcoded one staircase position would fail here.
                seed: 6100895,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Downward', role: 'Valkyrie', pettype: 'none',
                }),
                moves: `jjnnjjbj${DOWN_COMMAND}`,
            },
            {
                // A pet standing beside the hero on the staircase, which is
                // keepdogs()'s follow arm: the dog leaves this level's monster
                // chain for gm.mydogs. A different role, race, gender and
                // alignment come with it.
                seed: 6303983,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Follower', role: 'Ranger', race: 'elf',
                    gender: 'male', align: 'chaotic', pettype: 'dog',
                }),
                moves: `yykkkuukk${DOWN_COMMAND}`,
            },
            {
                // A third role, gender and alignment, to keep the matrix from
                // resting on one starting inventory and one luck value.
                seed: 6602369,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Descend', role: 'Samurai', gender: 'male',
                    align: 'lawful', pettype: 'none',
                }),
                moves: `hhyhbhhy${DOWN_COMMAND}`,
            },
        ],
    }, 'leave level recipe');
}

// A mismatch that is only the output the port never produced, at exactly the
// index where the port stopped. Anything else -- a differing value, a shorter
// C log, an extra JavaScript entry -- is a real failure.
export function isTruncationOnly(mismatch, missingKey, lengths) {
    if (!mismatch) return lengths.js === lengths.c;
    return mismatch.index === lengths.js
        && lengths.js < lengths.c
        && mismatch[missingKey] === undefined;
}

export function classifySegment(segment, result) {
    if (result.error) return `JavaScript error: ${result.error}`;
    if (result.segmentMismatch) return 'segment count mismatch';
    if (result.animMismatch) return 'animation frame mismatch';
    if (!segment.moves.endsWith(DOWN_COMMAND)) {
        return result.passed ? null : 'control segment did not match';
    }
    if (!isTruncationOnly(result.rngMismatch, 'jsEntry', result.lengths.rng))
        return 'random-number values differ before the descent';
    if (result.screenMismatch
        && !(result.screenMismatch.kind === 'js-missing'
            && result.screenMismatch.index === result.lengths.screens.js))
        return 'screens differ before the descent';
    if (!isTruncationOnly(result.cursorMismatch, 'jsCursor',
        result.lengths.cursors))
        return 'cursors differ before the descent';
    // C draws exactly one screen this port does not: D:2, which slice 3 owns.
    const missingScreens = result.lengths.screens.c
        - result.lengths.screens.js;
    if (missingScreens !== 1)
        return `the port is ${missingScreens} screens short, expected 1`;
    return null;
}

export async function runLeaveLevelMatrix({
    runDifferentialFn = runDifferential,
    write = (text) => process.stdout.write(text),
} = {}) {
    const recipe = loadLeaveLevelRecipe();
    const totals = { segments: 0, rng: 0, screens: 0, cursors: 0 };
    for (let index = 0; index < recipe.segments.length; ++index) {
        const segment = recipe.segments[index];
        write(`[leave level ${index + 1}/${recipe.segments.length}] `
            + `seed ${segment.seed} "${segment.moves}"\n`);
        const result = await runDifferentialFn({
            version: recipe.version,
            segments: [segment],
        });
        const failure = classifySegment(segment, result);
        if (failure) {
            write(`${failure}\n`);
            write(formatReport(result));
            return { passed: false, totals, failure: { index, result } };
        }
        totals.segments += 1;
        totals.rng += result.lengths.rng.js;
        totals.screens += result.lengths.screens.js;
        totals.cursors += result.lengths.cursors.js;
    }
    write(`LEAVE LEVEL: PASS: ${totals.segments} segments, `
        + `${totals.rng} PRNG calls, ${totals.screens} screens, `
        + `${totals.cursors} cursors matched through the descent\n`);
    return { passed: true, totals };
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runLeaveLevelMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`leave level: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
