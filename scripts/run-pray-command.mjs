#!/usr/bin/env node

// Record and replay the #pray command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Every segment here declines the confirmation. That is not a preference for
// the quiet branch: pray.c dopray() answers ECMD_OK the moment
// paranoid_query() says no, and every path that says yes runs on into
// prayer_done(), which this slice leaves unported. So the declining branch is
// the whole of what a differential can compare today, and it is worth
// comparing -- it covers the extended-command dispatch, the prompt text, all
// four ways win/tty/topl.c tty_yn_function() can end its read loop, and the
// answered prompt staying on the physical top line.
//
// The answer keys, one per case:
//
// - 'n', the plain refusal, which the loop accepts because it is in `resp`.
// - <esc>, which topl.c:463-470 turns into 'q' or 'n' or the default; "yn"
//   holds no 'q', so it becomes 'n'.
// - ' ', one of decl.c quitchars[], which topl.c:471-473 turns into the
//   default the prompt displayed.
// - 'z' then 'n': 'z' is in neither `resp` nor quitchars[], so topl.c:475-477
//   rings the bell, zeroes the answer and reads again. The bell writes no
//   cell, so the two screens on either side of it have to be identical.
// - 'N', which topl.c:433 folds to 'n' through lowc(); "yn" holds no
//   uppercase letter, so preserve_case is FALSE.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PARANOID_PRAY } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed clock with no calendar event, so nothing competes for the top line.
const DATETIME = '20260214081500';
const WAIT = '.';
// cmd.c extcmdlist[] binds '#' to doextcmd(); "pray" names row 0xF0.
const PRAY = '#pray\n';
const ESC = '\x1B';

// One role for every case. The declining branch never reaches can_pray(), so
// it never names a god and no alignment can change what it prints; the role
// only has to be one whose first turn the port already replays.
const NETHACKRC = [
    'OPTIONS=name:Orison,role:Valkyrie,race:human,gender:female,align:lawful',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

// Two seeds, so a level layout that happened to hide a divergence in one
// cannot hide it in the whole matrix.
export const DECLINE_CASES = [
    { seed: 4410001, answer: 'n',
      arm: 'topl.c:475 the answer is in resp, so the loop ends' },
    { seed: 4410002, answer: ESC,
      arm: 'topl.c:463-470 <esc> resolves to n' },
    { seed: 4410001, answer: ' ',
      arm: 'topl.c:471-473 quitchars[] resolves to the default' },
    { seed: 4410002, answer: 'zn',
      arm: 'topl.c:475-477 an answer outside resp rings and rereads' },
    { seed: 4410001, answer: 'N',
      arm: 'topl.c:433 lowc() folds the answer' },
];

// Every segment waits, prays, declines, then waits twice more. dopray()
// answers ECMD_OK for a declined prayer, so rhack() spends no move; a move
// wrongly spent would shift both trailing waits into screens the differential
// compares.
function segment({ seed, answer }) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: NETHACKRC,
        moves: `${WAIT}${PRAY}${answer}${WAIT}${WAIT}`,
    };
}

export function loadPrayDeclineRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: DECLINE_CASES.map((entry) => segment(entry)),
    });
}

// The screens show that the prompt appeared and that the game carried on.
// They cannot show that the port declined for C's reason rather than by
// falling out of dopray() somewhere else, so check the two pieces of state
// that separate those: the confirmation must have been asked at all, and
// dopray() must have returned before u.uconduct.gnostic++.
export async function verifyPrayDeclineSegment(recipeSegment) {
    await runSegment(recipeSegment);
    if ((game.flags.paranoia_bits & PARANOID_PRAY) === 0) {
        throw new Error(
            'ParanoidPray is off, so dopray() asked no confirmation',
        );
    }
    if (game.u.uconduct.gnostic !== 0) {
        throw new Error(
            `a declined prayer broke atheism (gnostic=${game.u.uconduct.gnostic})`,
        );
    }
    if (game.gp?.p_type !== undefined) {
        throw new Error('a declined prayer reached can_pray()');
    }
}

export async function runPrayCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'pray declined', recipe: loadPrayDeclineRecipe() },
        ],
        summaryLabel: 'PRAY COMMAND',
        verifySegment: verifyPrayDeclineSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runPrayCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`pray command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
