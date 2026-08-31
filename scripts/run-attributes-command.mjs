#!/usr/bin/env node

// Record and replay the `^X` attributes window against the patched C
// reference. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// insight.c doattributes():2014-2015 adds MAGICENLIGHTENMENT when `discover`
// is set, which is what OPTIONS=playmode:explore turns on, and that is the
// only thing separating the two windows this matrix compares. The explore rows
// therefore carry a second page holding attributes_enlightenment()'s
// "Attributes:" section and enlightenment():428-447's reminder block; the
// normal-mode row carries neither, and is here so a port that ignored the mode
// bit and always emitted them would fail.
//
// The three attributes_enlightenment() lines the port covers are chosen for
// what varies between rows:
//
// - the piousness() line at insight.c:1509. Every role whose role.c initrecord
//   is 10 also holds an XL1 intrinsic that stops the window -- Archeologist
//   and Ranger HSearching, Barbarian and Healer HPoison_resistance, Monk five
//   at once, Rogue HStealth, Samurai HFast, Knight Jumping -- and every
//   non-human race holds HInfravision, so a recorded case can only reach the
//   record-0 wording. scripts/insight.test.mjs pins the other two arms.
// - the magic-cancellation line at insight.c:1800. The Caveman's leather
//   armor has objects.c a_can 1, so mhitu.c magic_negation() answers 1 and the
//   line reads "warded"; the Tourist wears only a Hawaiian shirt, whose a_can
//   is 0, so the line is absent. Factors 2 and 3 need armor no role starts in.
// - the can_pray() line at insight.c:1949. u_init.c fixes u.ublesscnt at 300,
//   above every threshold pray.c:2151-2154 tests, so a recorded case can only
//   reach the "not" wording.
//
// enlightenment():435-446 chooses between three bones lines, and the first two
// are reachable: OPTIONS=!bones takes the "disabled loading" arm and the
// default takes "haven't encountered". The third needs u.uroleplay.numbones
// above zero, which only a loaded bones file produces.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { magic_negation } from '../js/mhitu.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
// A fixed clock with no calendar event, so no --More-- competes for the keys
// below and every row's first screen is the plain welcome message.
const DATETIME = '20000110090000';
const ESC = '\x1B';
// cmd.c binds ^X to doattributes().
const ATTRIBUTES = '\x18';
// getline.c xwaitforspace() takes a space to turn a menu page.
const PAGE = ' ';

function nethackrc(character, ...extra) {
    return [
        `OPTIONS=name:Enlight,${character},!legacy,!tutorial,!splash_screen`,
        ...extra,
        '',
    ].join('\n');
}

const CAVEMAN = 'role:Caveman,race:human,gender:male,align:neutral';
const CAVEWOMAN = 'role:Caveman,race:human,gender:female,align:neutral';
const TOURIST = 'role:Tourist,race:human,gender:male,align:neutral';
const EXPLORE = 'OPTIONS=playmode:explore';

// Four ordinary seeds plus one authorized debug seed, so a level layout that
// happened to hide a divergence in one cannot hide it in the whole matrix.
export const ATTRIBUTE_CASES = [
    {
        label: 'explore Caveman, magic cancellation 1',
        seed: 8151001,
        nethackrc: nethackrc(CAVEMAN, EXPLORE),
        discover: true,
        // objects.c gives leather armor a_can 1, so mc_types[1], "warded".
        mc: 1,
        bones: true,
    },
    {
        label: 'explore Tourist, magic cancellation 0',
        seed: 8151002,
        nethackrc: nethackrc(TOURIST, EXPLORE),
        discover: true,
        // A Hawaiian shirt has a_can 0 and the Tourist wears nothing else, so
        // insight.c:1800's `> 0` fails and the section skips the line.
        mc: 0,
        bones: true,
    },
    {
        label: 'explore Caveman, bones loading disabled',
        seed: 8151004,
        nethackrc: nethackrc(CAVEWOMAN, EXPLORE, 'OPTIONS=!bones'),
        discover: true,
        mc: 1,
        bones: false,
    },
    {
        label: 'normal Caveman, no magic half at all',
        seed: 8151005,
        nethackrc: nethackrc(CAVEMAN),
        discover: false,
        mc: 1,
        bones: true,
    },
    {
        label: 'debug Wizard, numeric enlightenment details',
        seed: 2601,
        nethackrc: nethackrc(
            'role:Wizard,race:human,gender:male,align:neutral',
            'OPTIONS=playmode:debug,showexp,time,color,lit_corridor',
            'BIND=v:inventory',
        ),
        discover: false,
        wizard: true,
        // The Wizard starts with a cloak of magic resistance, whose armor
        // category gives magic_negation() factor 1, "warded".
        mc: 1,
        bones: true,
    },
];

// Each segment dismisses the welcome message, opens the window, turns to its
// second page and closes it. doattributes() answers ECMD_OK, so no move is
// spent and the closing <esc> lands back on the same map screen every row
// started from.
export const MOVES = `${ESC}${ATTRIBUTES}${PAGE}${ESC}`;

export function loadAttributesRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: ATTRIBUTE_CASES.map(({ seed, nethackrc: rc }) => ({
            seed, datetime: DATETIME, nethackrc: rc, moves: MOVES,
        })),
    });
}

const CASE_BY_SEED = new Map(
    ATTRIBUTE_CASES.map((entry) => [entry.seed, entry]),
);

// The screens show that a window appeared, not that the port chose its
// contents the way C does. These pieces of state are what separate them:
// the mode bit doattributes() reads, the magic-cancellation factor the
// "warded" line reports, the bones flag the reminder block branches on, and
// whether can_pray() ran at all and answered from the "too soon" arm.
export async function verifyAttributesSegment(recipeSegment) {
    const expected = CASE_BY_SEED.get(recipeSegment.seed);
    if (!expected)
        throw new Error(`no attributes case for seed ${recipeSegment.seed}`);
    await runSegment(recipeSegment);

    if (game.discover !== expected.discover) {
        throw new Error(`${expected.label}: discover is ${game.discover},`
            + ` not ${expected.discover}`);
    }
    if (game.wizard !== Boolean(expected.wizard)) {
        throw new Error(`${expected.label}: wizard is ${game.wizard},`
            + ` not ${Boolean(expected.wizard)}`);
    }
    const armpro = magic_negation(game.youmonst, game);
    if (armpro !== expected.mc) {
        throw new Error(`${expected.label}: magic_negation() answered`
            + ` ${armpro}, not ${expected.mc}`);
    }
    if (game.flags.bones !== expected.bones) {
        throw new Error(`${expected.label}: flags.bones is`
            + ` ${game.flags.bones}, not ${expected.bones}`);
    }
    // u_init.c:382 sets u.ublesscnt to 300 and allmain.c spends one per turn;
    // these rows take no turn, so every pray.c:2151-2154 threshold holds and
    // gp.p_type is 0, "too soon". A row that had drifted below 200 would still
    // print "not safely pray" while reaching it a different way.
    if (game.u.ublesscnt !== 300) {
        throw new Error(`${expected.label}: u.ublesscnt is`
            + ` ${game.u.ublesscnt}, not 300`);
    }
    const p_type = game.gp?.p_type;
    const expected_p_type = expected.discover || expected.wizard ? 0 : undefined;
    if (p_type !== expected_p_type) {
        throw new Error(`${expected.label}: gp.p_type is ${p_type},`
            + ` not ${expected_p_type}`);
    }
}

export async function runAttributesCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'attributes window', recipe: loadAttributesRecipe() },
        ],
        summaryLabel: 'ATTRIBUTES COMMAND',
        verifySegment: verifyAttributesSegment,
        // record-session leaves a debug save behind when it stops at the
        // command boundary; isolate that segment from the ordinary cases.
        chunkLimit: 1,
    });
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    runAttributesCommandMatrix().then((result) => {
        process.exitCode = result.passed ? 0 : 1;
    }).catch((error) => {
        process.stderr.write(
            `attributes command: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
