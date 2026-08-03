#!/usr/bin/env node

// Run the checked-in matrix for the wish prompt through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Each segment reaches one branch of wizcmds.c wiz_wish(), zap.c makewish(),
// objnam.c readobjnam(), or the cmd.c can_do_extcmd() call rhack() makes for
// the key a command is bound to. Two dispatch routes lead to the same handler,
// so the matrix carries both: C('w') through rhack(), and the typed name
// through doextcmd().
//
// The first eight segments end while getlin() is still reading, which costs
// one game lock apiece; the six after them submit a wish and close with a
// wait. The matrix records one segment at a time for the same reason the
// #levelchange matrix does.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20291105071500';

export const WIZWISH_KEY = '\x17'; /* C('w'), the "wizwish" row's key */
export const EXTCMD_KEY = '#';
export const ESCAPE_KEY = '\x1b';
export const ERASE_KEY = '\x7f'; /* the erase character gettty() seeds */
export const KILL_KEY = '\x15'; /* the kill character gettty() seeds */
const NEWLINE = '\n';
export const WAIT_KEY = '.';
const WAIT = WAIT_KEY;

const DEBUG_OPTIONS = 'pettype:none,!acoustics,playmode:debug';
const ORDINARY_OPTIONS = 'pettype:none,!acoustics';

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens with a wait, so the screen the prompt paints over is one
// an ordinary turn produced rather than the arrival screen. Only a segment
// whose command completes can close with one; see the file header.
function segment(seed, moves, {
    role = 'Wizard',
    race = 'human',
    gender = 'male',
    align = 'neutral',
    options = DEBUG_OPTIONS,
} = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Wshr', role, race, gender, align, options,
        }),
        moves: `${WAIT}${moves}`,
    };
}

export function loadWizardWishRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the two dispatch routes to one handler ---
            // C('w') through rhack(): cmd.c:2000's "wizwish" row carries
            // WIZMODECMD, so can_do_extcmd() admits it only in debug mode.
            // The typed text stops short of any name readobjnam() resolves,
            // so every keystroke is echo and nothing is submitted.
            segment(4471001, `${WIZWISH_KEY}mud boo`),
            // The same handler through doextcmd(), where extcmds_match()
            // rather than can_do_extcmd() is what admits a WIZMODECMD row.
            segment(4471002, `${EXTCMD_KEY}wizwish${NEWLINE}blessed sc`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),

            // --- can_do_extcmd()'s WIZMODECMD refusal ---
            // The arm rhack() reaches and doextcmd() cannot: an ordinary game
            // pressing C('w') prints "Unavailable command 'wizwish'." and
            // spends no turn, so the pet moves only on the closing wait.
            segment(4471003, `${WIZWISH_KEY}${WAIT}`, {
                role: 'Valkyrie',
                gender: 'female',
                align: 'lawful',
                options: 'pettype:dog,!acoustics',
            }),
            // The other refusal, for contrast: extcmds_match() has already
            // dropped every WIZMODECMD row for an ordinary hero, so the typed
            // name is an unknown command rather than an unavailable one.
            segment(4471004, `${EXTCMD_KEY}wizwish${NEWLINE}${WAIT}`,
                { role: 'Archeologist', options: ORDINARY_OPTIONS }),

            // --- the line getlin() reads for makewish() ---
            // Erasing back over the typed text, which walks the cursor back
            // and blanks the cells behind it.
            segment(4471005, `${WIZWISH_KEY}lamp${ERASE_KEY}${ERASE_KEY}n`,
                { role: 'Priest', gender: 'female' }),
            // Escape over a non-empty line. getline.c:88 clears the buffer and
            // repaints the prompt instead of returning, so this stays inside
            // the slice; an Escape over an empty line returns and grants a
            // random wish, which is a deferred case.
            segment(4471006, `${WIZWISH_KEY}scroll${ESCAPE_KEY}ri`,
                { role: 'Rogue', align: 'chaotic' }),
            // The kill character, which erases the whole line in place.
            segment(4471007, `${WIZWISH_KEY}two ru${KILL_KEY}gem`,
                { role: 'Samurai', align: 'lawful' }),
            // Interior space runs, which the echo prints one for one and
            // mungspaces() then collapses out of the buffer.
            segment(4471008, `${WIZWISH_KEY}  blessed   +2  cry`,
                { role: 'Barbarian', gender: 'female', align: 'chaotic' }),

            // --- the wish the Return submits ---
            // An exact objects[] name, which rnd_otyp_by_namedesc() resolves
            // to one entry and hold_another_object() then holds: the spine of
            // this behavior, and the case seed0108 records.
            segment(4471009, `${WIZWISH_KEY}magic lamp${NEWLINE}${WAIT}`),
            // A per-game shuffled description rather than a name. o_init.c
            // assigns it, so a port reading objects.c's static table passes
            // the case above and fails this one.
            segment(4471010, `${WIZWISH_KEY}mud boots${NEWLINE}${WAIT}`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),
            // wishymatch()'s " of " inversion (objnam.c:3256-3272), which
            // nothing else in the chain reaches.
            segment(4471011, `${WIZWISH_KEY}boots of speed${NEWLINE}${WAIT}`,
                { role: 'Rogue', align: 'chaotic' }),
            // An alternate spelling from spellings[], which returns before
            // readobjnam_postparse3() and so spends no lookup draw at all.
            segment(4471012, `${WIZWISH_KEY}lantern${NEWLINE}${WAIT}`,
                { role: 'Priest', gender: 'female' }),
            // Declining: readobjnam() answers its caller's sentinel at 4918
            // and makewish() returns without spending rn1(100, 50).
            segment(4471013, `${WIZWISH_KEY}nothing${NEWLINE}${WAIT}`,
                { role: 'Samurai', align: 'lawful' }),
            // Just outside the slice's stated limit: objects.h:929,931 give
            // both lamps the description "lamp", but readobjnam_postparse2()'s
            // o_ranges[] row catches the bare word first and calls
            // rnd_class() over the pair instead of matching a description.
            segment(4471014, `${WIZWISH_KEY}lamp${NEWLINE}${WAIT}`,
                { role: 'Archeologist' }),
        ],
    }, 'wizard wish recipe');
}

export async function runWizardWishMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard wish',
            recipe: loadWizardWishRecipe(),
        }],
        summaryLabel: 'WIZARD WISH',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runWizardWishMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`wizard wish: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
