#!/usr/bin/env node

// Run the checked-in matrix for the level-teleport prompt through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// Each segment reaches one branch of wizcmds.c wiz_level_tele(), teleport.c
// level_tele()'s head, win/tty/getline.c hooked_tty_getlin(), or the cmd.c
// can_do_extcmd() call rhack() makes for the key a command is bound to. Two
// dispatch routes lead to the same handler, so the matrix carries both:
// C('v') through rhack(), and the typed name through doextcmd().
//
// Four segments end while getlin() is still reading, which costs one game lock
// apiece; the four others close with a wait. Every hero travels without a pet,
// because a pet's move on the closing wait reaches distfleeck()
// (monmove.c:538), which is unported and would stop a segment for a reason
// unrelated to the prompt. The matrix records one segment at a time for the
// same reason the wish matrix does.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20300214113000';

export const LEVELPORT_KEY = '\x16'; /* C('v'), the "wizlevelport" row's key */
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
            name: 'Lvlp', role, race, gender, align, options,
        }),
        moves: `${WAIT}${moves}`,
    };
}

export function loadWizardLevelTeleRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the two dispatch routes to one handler ---
            // C('v') through rhack(): cmd.c:1970's "wizlevelport" row carries
            // WIZMODECMD, so can_do_extcmd() admits it only in debug mode.
            // Nothing is typed, so the segment ends on the bare prompt.
            segment(5514001, LEVELPORT_KEY),
            // The same handler through doextcmd(), where extcmds_match()
            // rather than can_do_extcmd() is what admits a WIZMODECMD row.
            // The digits are echo alone: teleport.c:1248 needs lev_by_name(),
            // so nothing is submitted.
            segment(5514002, `${EXTCMD_KEY}wizlevelport${NEWLINE}12`,
                { role: 'Valkyrie', gender: 'female', align: 'lawful' }),

            // --- can_do_extcmd()'s WIZMODECMD refusal ---
            // The arm rhack() reaches and doextcmd() cannot: an ordinary game
            // pressing C('v') prints "Unavailable command 'wizlevelport'."
            // and spends no turn.
            segment(5514003, `${LEVELPORT_KEY}${WAIT}`, {
                role: 'Valkyrie',
                gender: 'female',
                align: 'lawful',
                options: ORDINARY_OPTIONS,
            }),
            // The other refusal, for contrast: extcmds_match() has already
            // dropped every WIZMODECMD row for an ordinary hero, so the typed
            // name is an unknown command rather than an unavailable one.
            segment(5514004, `${EXTCMD_KEY}wizlevelport${NEWLINE}${WAIT}`,
                { role: 'Archeologist', options: ORDINARY_OPTIONS }),

            // --- the Escape that cancels ---
            // teleport.c:1218-1219 returns for a buffer holding "\033", and
            // wizcmds.c:405 answers ECMD_OK, so no turn passes. The closing
            // wait is what shows that: it is the only move in the segment
            // that may spend one.
            //
            // Seed 5514005 is skipped: its closing wait reaches
            // wipe_engr_at() (engrave.c:280), an unported engraving path, so
            // the segment would stop for a reason unrelated to the prompt.
            segment(5514011, `${LEVELPORT_KEY}${ESCAPE_KEY}${WAIT}`),
            // Escape over a non-empty line never reaches that test.
            // getline.c:88 clears the buffer and repaints the prompt instead,
            // so cancelling a partly typed answer takes two Escapes.
            segment(5514006,
                `${LEVELPORT_KEY}25${ESCAPE_KEY}${ESCAPE_KEY}${WAIT}`,
                { role: 'Priest', gender: 'female' }),

            // --- the line getlin() echoes ---
            // The erase character, which walks the cursor back over the echo
            // and blanks the cells behind it. This prompt is 38 characters
            // where the wish prompt is 21, so the echo starts in a different
            // column and exercises the same code at a different offset.
            segment(5514007, `${LEVELPORT_KEY}123${ERASE_KEY}${ERASE_KEY}4`,
                { role: 'Rogue', align: 'chaotic' }),
            // The kill character, which erases the whole line in place. The
            // leading '-' is what a negative destination would open with;
            // teleport.c:1250's loop condition reads buf[1] after it, and no
            // ported path gets that far.
            segment(5514008, `${LEVELPORT_KEY}-7${KILL_KEY}2`,
                { role: 'Samurai', align: 'lawful' }),
        ],
    }, 'wizard level teleport recipe');
}

export async function runWizardLevelTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard level teleport',
            recipe: loadWizardLevelTeleRecipe(),
        }],
        summaryLabel: 'WIZARD LEVEL TELEPORT',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runWizardLevelTeleMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `wizard level teleport: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
