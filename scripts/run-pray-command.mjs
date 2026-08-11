#!/usr/bin/env node

// Record and replay the #pray command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Two matrices. The first declines the confirmation and covers the
// extended-command dispatch, the prompt text, all four ways win/tty/topl.c
// tty_yn_function() can end its read loop, and the answered prompt staying on
// the physical top line. The second accepts it and follows the prayer through
// its three immobile turns into prayer_done() and angrygods().
//
// The answer keys of the declining matrix, one per case:
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
// One of decl.c quitchars[], which is what getline.c xwaitforspace() accepts
// to dismiss a --More--.
const MORE = ' ';

// One role for every declining case. That branch never reaches can_pray(), so
// it never names a god and no alignment can change what it prints; the role
// only has to be one whose first turn the port already replays.
const NETHACKRC = [
    'OPTIONS=name:Orison,role:Valkyrie,race:human,gender:female,align:lawful',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics',
    '',
].join('\n');

// The accepting cases each name their own character, because the god the
// prayer angers and the size of pray.c:725's rn2(maxanger) both come from the
// role's alignment and its role.c initrecord.
function nethackrc(character, ...extra) {
    return [
        `OPTIONS=name:Orison,${character}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        ...extra,
        '',
    ].join('\n');
}

const VALKYRIE_LAWFUL = 'role:Valkyrie,race:human,gender:female,align:lawful';
const VALKYRIE_NEUTRAL = 'role:Valkyrie,race:human,gender:female,align:neutral';
const SAMURAI = 'role:Samurai,race:human,gender:male,align:lawful';
const NO_PET = 'OPTIONS=pettype:none,!acoustics';

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

// The accepting cases. Each one waits, prays, confirms, and then answers the
// --More-- that angrygods()'s line raises over the two the prayer has already
// put on the top line. The key after the last `y` is that answer, not a
// command: without it the recorder would stop on the prompt with the rnz(300)
// pray timer below it unspent.
//
// Every case has to land on rn2(maxanger) 0 or 1, the pair the port owns.
// Nothing in C forces that draw -- no wizard command reaches it and no starting
// state selects it -- so the seed is the only lever, and each was found by
// scanning 6120000 upward under the port until the first that lands there.
// The scan stops at the first hit per row; DEFERRED_ANGER_CASES below records
// what the seeds it skipped do instead.
//
// The rest of each row is chosen for what it moves in pray.c:712-723:
// u.ugangr through gods_upset(), Luck through change_luck(-3) and
// moveloop_preamble()'s calendar adjustments, and u.ualign.record through the
// role's initrecord.
export const ACCEPT_CASES = [
    {
        label: 'lawful Valkyrie, record 0',
        seed: 6120003,
        datetime: DATETIME,
        nethackrc: nethackrc(VALKYRIE_LAWFUL, NO_PET),
        moves: `${WAIT}${PRAY}y${MORE}`,
        // initrecord 0 is below STRIDENT, so pray.c:717 weighs the whole of
        // the three luck points prayer_done() has just taken: 3 * 1 + 3.
        maxanger: 6,
    },
    {
        label: 'lawful Samurai, record 10',
        seed: 6120001,
        datetime: DATETIME,
        nethackrc: nethackrc(SAMURAI, NO_PET),
        moves: `${WAIT}${PRAY}y${MORE}`,
        // initrecord 10 is at or above STRIDENT, so the same luck is worth a
        // third of itself: 3 * 1 + 1. The Samurai also exercises
        // align_gname()'s leading-underscore strip, role.c:423 spelling the
        // god "_Amaterasu Omikami".
        maxanger: 4,
    },
    {
        label: 'neutral Valkyrie',
        seed: 6120003,
        datetime: DATETIME,
        nethackrc: nethackrc(VALKYRIE_NEUTRAL, NO_PET),
        moves: `${WAIT}${PRAY}y${MORE}`,
        // Same arithmetic as the lawful Valkyrie; what differs is which of
        // role.c:503's three gods gp.p_aligntyp selects.
        maxanger: 6,
    },
    {
        label: 'full moon',
        seed: 6120003,
        // 3 March 2026 is a full moon, so moveloop_preamble() spends
        // change_luck(1) before the prayer takes three and Luck ends at -2.
        // -(-2)/3 truncates to 0, which no other row reaches.
        datetime: '20260303081500',
        nethackrc: nethackrc(VALKYRIE_LAWFUL, NO_PET),
        // The extra leading answer is for the --More-- the moon line raises
        // over the welcome message.
        moves: `${MORE}${WAIT}${PRAY}y${MORE}`,
        maxanger: 5,
    },
    {
        label: 'Friday the 13th',
        seed: 6120001,
        // change_luck(-1) at startup, so Luck ends at -4 and -(-4)/3 is 1.
        datetime: '20260213081500',
        nethackrc: nethackrc(SAMURAI, NO_PET),
        moves: `${MORE}${WAIT}${PRAY}y${MORE}`,
        maxanger: 4,
    },
    {
        label: 'two prayers in one game',
        seed: 6120007,
        datetime: DATETIME,
        nethackrc: nethackrc(VALKYRIE_LAWFUL, NO_PET),
        moves: `${WAIT}${PRAY}y${MORE}${PRAY}y${MORE}`,
        // The second prayer finds u.ugangr already 1 and Luck already -3, so
        // gods_upset() makes it 2 and change_luck(-3) makes Luck -6: the only
        // row where the anger term and the luck term have both moved, and the
        // only one that runs the whole chain twice in one game.
        maxanger: 12,
    },
    {
        label: 'a pet through the immobile turns',
        seed: 6120000,
        datetime: DATETIME,
        // The starting pet and runmode:walk together are what the other rows
        // leave out: the three turns nomul(-3) buys run dogmove.c dog_move()
        // and monmove.c m_move(), and runmode_delay_output() captures a frame
        // at the end of each one.
        nethackrc: nethackrc(SAMURAI, 'OPTIONS=runmode:walk,!acoustics'),
        moves: `${WAIT}${PRAY}y${MORE}`,
        maxanger: 4,
    },
];

// The cases just outside the ported limit: pray.c:731-778, where angrygods()
// stops instead of printing. These are recorded here rather than run, because
// the port cannot match them yet.
export const DEFERRED_ANGER_CASES = [
    {
        seed: 6120000,
        nethackrc: nethackrc(VALKYRIE_LAWFUL, NO_PET),
        arm: 'cases 4-6, gods_angry() and rndcurse()',
    },
    {
        seed: 6120000,
        nethackrc: nethackrc(SAMURAI, NO_PET),
        arm: 'cases 2-3, adjattrib(A_WIS, -1) and losexp()',
    },
];

export function loadPrayAcceptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: ACCEPT_CASES.map(
            ({ seed, datetime, nethackrc: rc, moves }) => ({
                seed, datetime, nethackrc: rc, moves,
            }),
        ),
    });
}

// The screens show the god's line, but not that the port arrived at it the way
// C does. These four are what separate "the prayer ran" from "something
// printed": the prayer must have been accepted, must have taken the p_type 0
// arm, must have run its three turns to completion rather than stopping part
// way, and must have angered the god exactly once per prayer.
export async function verifyPrayAcceptSegment(recipeSegment) {
    const prayers = recipeSegment.moves.split(PRAY).length - 1;
    await runSegment(recipeSegment);
    if (game.u.uconduct.gnostic !== prayers) {
        throw new Error(
            `an accepted prayer did not break atheism `
            + `(gnostic=${game.u.uconduct.gnostic}, prayers=${prayers})`,
        );
    }
    if (game.gp?.p_type !== 0) {
        throw new Error(`prayer took p_type ${game.gp?.p_type}, not 0`);
    }
    // unmul() clears all three; a prayer that stopped part way leaves them.
    if (game.multi !== 0 || game.nomovemsg !== null || game.afternmv !== null) {
        throw new Error('the prayer did not run to unmul()');
    }
    if (game.u.ugangr !== prayers) {
        throw new Error(
            `gods_upset() left u.ugangr at ${game.u.ugangr}, not ${prayers}`,
        );
    }
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

export async function runPrayAcceptMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'pray accepted', recipe: loadPrayAcceptRecipe() },
        ],
        summaryLabel: 'PRAY ACCEPTED',
        verifySegment: verifyPrayAcceptSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const declined = await runPrayCommandMatrix();
    if (!declined.passed) return 1;
    const accepted = await runPrayAcceptMatrix();
    return accepted.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`pray command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
