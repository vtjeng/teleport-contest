#!/usr/bin/env node

// Run the checked-in matrix for the wish prompt through fresh C recordings.
// Every segment contains replay inputs only; runFreshMatrix() records new
// reference output in an isolated temporary workspace.
//
// Each segment reaches one branch of wizcmds.c wiz_wish(), zap.c makewish()'s
// head, or the cmd.c can_do_extcmd() call rhack() makes for the key a command
// is bound to. Two dispatch routes lead to the same handler, so the matrix
// carries both: C('w') through rhack(), and the typed name through
// doextcmd().
//
// A wish that is submitted runs readobjnam(), which is not ported, so no
// segment presses Return at the prompt. Every debug segment therefore ends
// while getlin() is still reading, which costs one game lock per segment; the
// matrix records one segment at a time for the same reason the #levelchange
// matrix does.

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
const WAIT = '.';

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
