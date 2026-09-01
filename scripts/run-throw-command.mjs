#!/usr/bin/env node

// Record and replay the `t` (throw) command against the patched C reference.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// dothrow.c dothrow() calls three functions, and the middle one is what makes
// `t` different from `f`: getobj("throw", throw_ok, ...) prints a prompt whose
// bracketed letters are exactly the objects throw_ok() answers GETOBJ_SUGGEST
// for. That prompt is the only screen this command has that `f` does not, so
// the four segments below are chosen for the classifications they print rather
// than for the missiles they land.
//
// What the four segments separate:
//
// - The Samurai starts with three weapons and gets `[bcd or ?*]`: the katana
//   in hand is downplayed by throw_ok():330-331, while the wakizashi passes
//   that same arm -- it is uswapwep, but u.twoweap is false -- and reaches the
//   WEAPON_CLASS arm at :336-337 with the yumi and the ya. Reversing those two
//   arms would print `[abcd or ?*]`, and nothing downstream would notice.
// - The Rogue's six daggers are one slot with quan > 1, so throw_obj():258-259
//   splits the stack instead of emptying the slot, and mkobj.c next_ident()
//   draws for each split. The Rogue's dagger bonus in multishot_class_bonus()
//   makes it a volley, so "You throw 2 daggers." splits twice in one command.
// - The Wizard carries nothing throw_ok() suggests -- the quarterstaff is in
//   hand and everything else falls through to :347 -- so getobj() prints the
//   ` [*]` form of the prompt, which no other ported command reaches. The
//   segment then answers it with a letter the prompt did not offer, which is
//   still accepted, and finishes with the self-throw refusal at :133-136.
// - CANCEL_CASE answers the prompt twice: with a letter no slot holds, which
//   prints "You don't have that object." and redraws the prompt, and then with
//   Escape, which prints "Never mind." and returns ECMD_CANCEL.
//
// Two branches `t` owns have no segment here.
//
// A single object that carries an owornmask reaches do_wear.c
// remove_worn_item() at throw_obj():262-263 -- see the deferral
// throw-a-single-worn-or-readied-object. That is why no segment throws the
// Valkyrie's spare dagger, the most ordinary `t` there is: u_init.c makes the
// second weapon of every two-weapon role the alternate weapon.
//
// Answering the prompt with '?' reaches invent.c display_pickinv() with the
// nonempty suggested-letter subset. The ordinary throw arm is now covered by
// its own slice; '*' remains the full-inventory path covered below, while
// other object prompts still refuse their menu branches.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SCR_IDENTIFY, SCR_MAGIC_MAPPING, YUMI } from '../js/objects.js';
import { GETOBJ_DOWNPLAY, GETOBJ_SUGGEST } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { throw_ok } from '../js/dothrow.js';
import { runFreshMatrix } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20000110090000';

// One wait ahead of the command settles the arrival turn, so a move wrongly
// spent by the command itself shifts every screen after it.
const WAIT = '.';
const THROW = 't';
const EAST = 'l';
const SELF = '.';
const ESCAPE = '\u001B'; // cmd.c NHKF_ESC
// A space dismisses the --More-- that the redrawn prompt raises over the
// "You don't have that object." still on the top line.
const MORE = ' ';

const ROLES = {
    samurai: {
        role: 'Samurai', race: 'human', gender: 'male', align: 'lawful',
    },
    rogue: { role: 'Rogue', race: 'human', gender: 'male', align: 'chaotic' },
    wizard: { role: 'Wizard', race: 'human', gender: 'male', align: 'neutral' },
    valkyrie: {
        role: 'Valkyrie', race: 'human', gender: 'female', align: 'neutral',
    },
};

// Seeds were chosen by scanning upward from 3140000 for a start with no
// monster anywhere on the hero's first screen and a run of at least five
// ordinary floor squares east of her, so that every missile lands on bare
// floor: a monster in the flight path reaches thitmonst(), which is out of
// this goal's scope. verifyThrowCommandSegment() below asserts what each seed
// produces rather than trusting the number.
export const THROW_CASES = [
    // `c` is the yumi, the Samurai's third weapon and so the only one u_init.c
    // leaves without an owornmask.
    { who: 'samurai', seed: 3140358, letter: 'c' },
    // `b` is the dagger stack.
    { who: 'rogue', seed: 3140183, letter: 'b' },
    // `j` is the scroll of identify and `k` the scroll of magic mapping; both
    // are ordinary unworn objects that throw_ok() downplays.
    { who: 'wizard', seed: 3140224, letter: 'j' },
];

export const CANCEL_CASE = { who: 'valkyrie', seed: 3140022 };

export const SAMURAI_MOVES = `${WAIT}${THROW}c${EAST}${WAIT}`;
export const ROGUE_MOVES = `${WAIT}${THROW}b${EAST}${WAIT}`;
// Two commands: the scroll of identify is thrown east, then the scroll of
// magic mapping is aimed at the hero herself and stays in the pack.
export const WIZARD_MOVES = `${WAIT}${THROW}j${EAST}${WAIT}`
    + `${THROW}k${SELF}${WAIT}`;
// No trailing wait: seed 3140022 has a monster off the hero's first screen
// that moves on the turn after the settling wait, and a cancelled throw spends
// no turn, so the segment already ends on the frame that proves it.
export const CANCEL_MOVES = `${WAIT}${THROW}z${MORE}${ESCAPE}`;

const MOVES_BY_WHO = {
    samurai: SAMURAI_MOVES,
    rogue: ROGUE_MOVES,
    wizard: WIZARD_MOVES,
};

// pettype:none keeps the pet out of the flight path and out of the message
// window; !acoustics keeps dosounds() from adding a line between the commands;
// the three startup options skip the windows that would otherwise swallow the
// leading wait.
function nethackrc(who) {
    const { role, race, gender, align } = ROLES[who];
    return [
        `OPTIONS=name:Volley,role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        '',
    ].join('\n');
}

function segment({ seed, who, moves }) {
    return { seed, datetime: DATETIME, nethackrc: nethackrc(who), moves };
}

export function loadThrowCommandRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: THROW_CASES.map(
            (entry) => segment({ ...entry, moves: MOVES_BY_WHO[entry.who] }),
        ),
    });
}

export function loadThrowCancelRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segment({ ...CANCEL_CASE, moves: CANCEL_MOVES })],
    });
}

function slotAt(invlet) {
    for (let obj = game.invent; obj; obj = obj.nobj)
        if (obj.invlet === invlet) return obj;
    return null;
}

// The classification getobj() would print for every carried object, as
// `<invlet><S|D>` pairs. throw_ok() is the only thing between the inventory
// and the prompt, so this is the prompt in the form a test can compare.
function classified() {
    const marks = [];
    for (let obj = game.invent; obj; obj = obj.nobj) {
        const answer = throw_ok(obj, game);
        marks.push(`${obj.invlet}${answer === GETOBJ_SUGGEST ? 'S'
            : answer === GETOBJ_DOWNPLAY ? 'D' : '?'}`);
    }
    return marks.join(' ');
}

// Replay each segment up to the first `t` and confirm the inventory that
// decides which arms of throw_ok() the prompt shows, so a re-recording that
// quietly moved an object into another slot fails here rather than passing a
// differential against a case that no longer tests the classification.
const EXPECTED_START = {
    // dothrow.c:330-331 downplays the wielded katana. The wakizashi is
    // uswapwep with u.twoweap false, so it falls through to :336-337 with the
    // yumi and the ya.
    3140358: { classified: 'aD bS cS dS eD', letter: 'c', otyp: YUMI },
    // The dagger stack is one slot of six, which is what sends throw_obj()
    // into splitobj() rather than into the empty-the-slot arm.
    3140183: { classified: 'aD bS cD dD eD fD gD', letter: 'b', quan: 6 },
    // Nothing is suggested, which is the ` [*]` prompt.
    3140224: {
        classified: 'aD bD cD dD eD fD gD hD iD jD kD lD mD nD',
        letter: 'j', otyp: SCR_IDENTIFY, second: 'k',
        secondOtyp: SCR_MAGIC_MAPPING,
    },
    // The spear in hand is downplayed and the spare dagger is suggested, so
    // the prompt the cancelled command redraws is `[b or ?*]`.
    3140022: { classified: 'aD bS cD dD', letter: 'b' },
};

export async function verifyThrowCommandSegment(recipeSegment) {
    await runSegment({ ...recipeSegment, moves: WAIT });
    const expected = EXPECTED_START[recipeSegment.seed];
    if (!expected) throw new Error(`no expectation for ${recipeSegment.seed}`);
    if (classified() !== expected.classified) {
        throw new Error(`throw_ok() classifies ${classified()}, expected `
            + expected.classified);
    }
    const chosen = slotAt(expected.letter);
    if (!chosen) throw new Error(`no slot ${expected.letter}`);
    if (expected.otyp !== undefined && chosen.otyp !== expected.otyp)
        throw new Error(`slot ${expected.letter} holds otyp ${chosen.otyp}`);
    if (expected.quan !== undefined && chosen.quan !== expected.quan)
        throw new Error(`slot ${expected.letter} holds ${chosen.quan}`);
    if (expected.second !== undefined) {
        const second = slotAt(expected.second);
        if (!second || second.otyp !== expected.secondOtyp)
            throw new Error(`slot ${expected.second} is not the second scroll`);
    }
}

export async function runThrowCommandMatrix() {
    return runFreshMatrix({
        entries: [
            { label: 'throw', recipe: loadThrowCommandRecipe() },
            { label: 'throw cancelled', recipe: loadThrowCancelRecipe() },
        ],
        summaryLabel: 'THROW COMMAND',
        verifySegment: verifyThrowCommandSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runThrowCommandMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((exitCode) => {
        process.exitCode = exitCode;
    }).catch((error) => {
        process.stderr.write(`throw command: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
