#!/usr/bin/env node

// Run the checked-in matrix for the #eat object prompt through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The command is eat.c doeat() as far as its !is_edible() arm, which reaches
// eat.c floorfood() and invent.c getobj(). Each segment below chooses its
// keys and its role to reach one arm of getobj()'s answer handling or one
// shape of the suggested-letter set it advertises.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c cmdlist[] binds 'e' to doeat(); extcmdlist[] names the same handler
// 'eat', which the '#' prompt reaches. decl.c quitchars[] is " \r\n\033", and
// the recorder's terminal sets ICRNL, so Escape and space are the two cancels
// a recording can send: a recorded '\r' arrives as '\n', which is C('j') and
// therefore do_rush_south.
export const EAT_KEY = 'e';
export const EAT_BY_NAME = '#eat\n';
export const ESCAPE_KEY = '\x1b';
export const SPACE_KEY = ' ';
export const WAIT = '.';

function nethackrc({ name, role, race = 'human', gender = 'female',
    align = 'neutral', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

const PLAIN = 'pettype:none,!acoustics,!autopickup';
// A pet on the level, and the two status fields whose text a wrongly spent
// turn would move. getobj() sets disp.botl on every accepted letter, so the
// bottom line is redrawn on a command that takes no time.
const PET_AND_CLOCK = 'pettype:dog,!acoustics,!autopickup,time,showexp';
const DECORATED =
    'pettype:none,!acoustics,!autopickup,time,showscore,symset:DECgraphics,'
    + 'msg_window:reversed';

// Every segment opens and closes with a wait, so a refusal that wrongly spent
// or wrongly saved a turn shows up in the screen after it.
function segment(seed, moves, character = {}, options = PLAIN) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'EatPmt',
            role: 'Valkyrie',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// Every role below keeps a weapon or a tool in slot 'a', which eat_ok()
// answers GETOBJ_EXCLUDE_SELECTABLE for: getobj() still returns it and
// doeat() refuses it at !is_edible(). A Valkyrie carries one food ration and
// no gold, a Samurai carries no food at all, and a Tourist's u_init.c row asks
// for ten random comestibles, which merge into five to eight slots depending
// on the seed, alongside starting gold.
const SLOT_A = 'a';
const TOURIST = { role: 'Tourist', gender: 'male' };

export function loadEatPromptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // The recorded refusal: one suggested letter, an answer that names
            // a carried non-food, "You cannot eat that!" and no turn spent.
            segment(4410001, `${EAT_KEY}${SLOT_A}`),
            // getobj()'s quitchars arm, once for each cancel a recording can
            // send. flags.verbose is on by default, so both print Never_mind.
            segment(4410001, `${EAT_KEY}${ESCAPE_KEY}`),
            segment(4410001, `${EAT_KEY}${SPACE_KEY}`),
            // A digit with GETOBJ_ALLOWCNT clear: "No count allowed with this
            // command." leaves ttyDisplay->toplin at TOPLINE_NEED_MORE, so the
            // loop's next yn_function() opens --More-- before re-prompting.
            segment(4410001,
                `${EAT_KEY}5${SPACE_KEY}${SLOT_A}`),
            // A letter no inventory slot holds: "You don't have that object."
            // and the same re-prompt, cancelled the second time round.
            segment(4410001, `${EAT_KEY}z${SPACE_KEY}${ESCAPE_KEY}`),
            // The same command reached by name at the '#' prompt.
            segment(4410001, `${EAT_BY_NAME}${SLOT_A}`),
            // Two suggested letters, which is still below compactify()'s
            // `suggested > 5` gate; 'a' is the Priest's mace.
            segment(4410064, `${EAT_KEY}${SLOT_A}`,
                { role: 'Priest', gender: 'male' }),
            // One suggested letter that is not the first food slot the other
            // roles use, so a prompt built from a fixed letter rather than
            // from invent would show here; 'a' is the Healer's scalpel.
            segment(4410055, `${EAT_KEY}${SLOT_A}`,
                { role: 'Healer', gender: 'male' }),
            // Exactly five suggested letters, the largest set compactify()
            // leaves alone, followed by the '$' gold answer that eat_ok()
            // answers GETOBJ_EXCLUDE for.
            segment(4410105, `${EAT_KEY}$${WAIT}${EAT_KEY}${ESCAPE_KEY}`,
                TOURIST),
            // Six suggested letters, which compactify() rewrites as "b-g".
            segment(4410007,
                `${EAT_KEY}$${WAIT}${EAT_KEY}${SLOT_A}`, TOURIST),
        ],
    }, 'eat prompt recipe');
}

export function loadEatPromptOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // No comestible in the pack at all, so getobj() answers
            // "You don't have anything to eat." and never prompts.
            segment(4410042, EAT_KEY, { role: 'Samurai' }, DECORATED),
            // A pet on the level and a visible turn counter, twice over: the
            // refusal and the cancel must each leave the clock and the pet
            // where they were.
            segment(4410023,
                `${EAT_KEY}${SLOT_A}${WAIT}`
                + `${EAT_KEY}${ESCAPE_KEY}${WAIT}`,
                { role: 'Archeologist' }, PET_AND_CLOCK),
        ],
    }, 'eat prompt options recipe');
}

export async function runEatPromptMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'eat prompt',
            recipe: loadEatPromptRecipe(),
        }],
        summaryLabel: 'EAT PROMPT',
        chunkLimit: 5,
    });
    if (!ordinary.passed) return ordinary;
    return runFreshMatrix({
        entries: [{
            label: 'eat prompt (option variations)',
            recipe: loadEatPromptOptionsRecipe(),
        }],
        summaryLabel: 'EAT PROMPT (OPTION VARIATIONS)',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runEatPromptMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `eat prompt: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
