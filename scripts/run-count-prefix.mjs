#!/usr/bin/env node

// Run the checked-in matrix for the count prefix through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// The matrix covers cmd.c get_count() (5008-5089) and parse() (5094-5150) as
// they are reached from rhack()'s fresh-read path at 3653. Every segment ends
// on a command prompt with a count already committed, so each one exercises
// parse()'s closing clear_nhwindow(WIN_MESSAGE) as well as the count itself.
//
// One seed serves the whole matrix: nothing here depends on level generation,
// only on which byte parse() returns and what count it leaves behind. The
// leading space dismisses the startup message so that "Be careful!  New moon
// tonight." is already on row 0 when the count is typed, which is the case
// get_count()'s clear_nhwindow() and parse()'s can differ on.
//
// A count of 2 or more before a command row is deliberately absent: rhack()
// spends such a count on an occupation or a repeat, neither of which is
// ported, and js/cmd.js refuses it. QUALITY.json records those inputs as a
// deferred entry.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20260814101500';
// A quiet room with the hero on the down stairs, its east side walled. Chosen
// by generating the level and reading the map, not from any recorded session.
const SEED = 9310001;

function nethackrc(name) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,`
        + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

function segment(name, moves) {
    return { seed: SEED, datetime: DATETIME, nethackrc: nethackrc(name), moves };
}

export function loadCountPrefixRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The echo threshold and the two erase characters. get_count()
            // withholds "Count: N" until cnt passes 9 (5069), so the '1' paints
            // nothing and the '2' paints "Count: 12". '\b' and '\177', which
            // the source names STANDBY_erase_char, divide cnt by 10 in turn,
            // and the third erase reaches the `backspaced && !cnt && !showzero`
            // arm at 5074-5075 that prints "Count: " with no number. The 's'
            // then commits a count of 0, so the search runs exactly as a bare
            // one would.
            segment('CountEcho', ' 123\b\x7f\x7fs'),
            // The same threshold from the other side. cnt is 9 after the first
            // digit and still silent; 90 paints; erasing back to 9 paints
            // again, because `backspaced` holds the echo open below 10.
            segment('CountNine', ' 90\b\bs'),
            // Escape leaves get_count() without committing, and parse()'s
            // 5121-5125 arm clears the message window and zeroes both count
            // fields. rhack() then returns at its empty-key test, so no turn
            // passes and the following command is unaffected.
            segment('CountEsc', ' 12\x1bs'),
            // An erase at an empty count breaks out of the loop at 5055-5056
            // and becomes the command byte itself. '\b' is ^H, which the
            // default binding table names rush-west.
            segment('CountErase', ' 1\b\b'),
            // Counts of 0 and 1 before the searching row, which is one of the
            // two extcmdlist[] rows carrying occupation text. parse():5142-5144
            // leaves gm.multi 0 for both, so rhack():3728 installs nothing.
            segment('CountZero', ' 1s0s'),
            // The other occupation row, waiting, with a count of 1.
            segment('CountWait', ' 1.'),
            // A count before a byte cmdbind_get() finds no command for.
            // rhack():3828-3839 prints the unknown-command line and zeroes
            // gm.multi itself, so the count costs nothing.
            segment('CountPct', ' 12%'),
            // A prefix after a count. rhack() loops back to parse() for the
            // byte the prefix modifies, and that parse() zeroes
            // gc.command_count at 5104, so the leading 3 is discarded and the
            // move is an ordinary uncounted one.
            segment('CountPfx', ' 3mh'),
            // A count parsed by that second parse(). One repeat is owed at
            // most, so gm.multi is 0 and pickup() reads the 1 as its own
            // limit.
            segment('CountMOne', ' m1,'),
        ],
    }, 'count prefix recipe');
}

export async function runCountPrefixMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'count prefix',
            recipe: loadCountPrefixRecipe(),
        }],
        summaryLabel: 'COUNT PREFIX',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runCountPrefixMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`count prefix: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
