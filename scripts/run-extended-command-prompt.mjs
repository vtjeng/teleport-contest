#!/usr/bin/env node

// Run the checked-in matrix for the extended-command prompt through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// The prompt paints a recorded screen for every keystroke, so each segment
// below chooses its keys to reach one branch of win/tty/getline.c
// hooked_tty_getlin(), cmd.c extcmds_match(), or cmd.c doextcmd().

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// The bytes hooked_tty_getlin() treats specially. Recorder patch 006 pins
// erase to DEL and kill to ^U; '\b' reaches the same erase arm through the
// explicit `c == '\b'` test, and both '\n' and '\r' end the line.
export const ESCAPE_KEY = '';
export const ERASE_KEY = '';
export const BACKSPACE_KEY = '';
export const KILL_KEY = '';
export const RETURN_KEY = '\r';
export const NEWLINE_KEY = '\n';
// cmd.c extcmdlist[] binds '#' to doextcmd() and '.' to donull().
export const EXTCMD_KEY = '#';
const WAIT = '.';

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

// Every segment opens and closes with a wait, so a prompt that wrongly spent
// or wrongly saved a turn shows up in the screen after it.
function segment(seed, options, moves, character = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Extcmd',
            role: 'Valkyrie',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

const PLAIN = 'pettype:none,!acoustics';
// A menu heading whose text starts at a space cannot round-trip through the
// scorer's screen decoder, which ROADMAP.md records as a fixed ceiling. These
// segments open menus, so they select the unindented heading style instead.
const PLAIN_MENUS = 'pettype:none,!acoustics,menu_headings:none';
const DEBUG = 'pettype:none,!acoustics,playmode:debug';

export function loadExtendedCommandPromptRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the two cancels, neither of which takes game time ---
            // Escape on an empty buffer stores "\033" and breaks out, so
            // tty_get_ext_cmd() answers -1 without a message.
            segment(8810001, PLAIN, `${EXTCMD_KEY}${ESCAPE_KEY}`),
            // Return on an empty buffer leaves buf[0] == '\0', which reaches
            // the same -1 without a message.
            segment(8810001, PLAIN, `${EXTCMD_KEY}${NEWLINE_KEY}`),

            // --- the unknown-command answer ---
            segment(8810001, PLAIN, `${EXTCMD_KEY}xyzzy${NEWLINE_KEY}`),
            // A prefix of a real command still needs an exact match, because
            // tty_get_ext_cmd() passes ECM_EXACTMATCH.
            segment(8810001, PLAIN, `${EXTCMD_KEY}wai${NEWLINE_KEY}`),

            // --- dispatch, with and without ECMD_TIME ---
            // donull() returns ECMD_TIME, so rhack() skips reset_cmd_vars()
            // and puts context.move back to TRUE.
            segment(8810001, PLAIN, `${EXTCMD_KEY}wait${NEWLINE_KEY}`),
            // '\r' ends the line through the same arm as '\n'.
            segment(8810001, PLAIN, `${EXTCMD_KEY}wait${RETURN_KEY}`),
            // strcmpi() folds case, so the typed name need not match case.
            segment(8810001, PLAIN, `${EXTCMD_KEY}WAIT${NEWLINE_KEY}`),
            // mungspaces() collapses the runs and drops the trailing one
            // before the exact match.
            segment(8810001, PLAIN, `${EXTCMD_KEY}  wait ${NEWLINE_KEY}`),
            // dolook() returns ECMD_OK for a sighted hero: a message, no turn.
            segment(8810001, PLAIN, `${EXTCMD_KEY}look${NEWLINE_KEY}`),
            segment(8810021, PLAIN, `${EXTCMD_KEY}look${NEWLINE_KEY}`,
                { role: 'Archeologist' }),
            // The three menu commands the prompt can also name.
            segment(8810001, PLAIN_MENUS,
                `${EXTCMD_KEY}attributes${NEWLINE_KEY}${ESCAPE_KEY}`),
            segment(8810031, PLAIN_MENUS,
                `${EXTCMD_KEY}attributes${NEWLINE_KEY}${ESCAPE_KEY}`,
                { role: 'Samurai' }),
            segment(8810001, PLAIN_MENUS,
                `${EXTCMD_KEY}inventory${NEWLINE_KEY}${ESCAPE_KEY}`),
            segment(8810011, PLAIN_MENUS,
                `${EXTCMD_KEY}known${NEWLINE_KEY}${ESCAPE_KEY}`,
                { role: 'Healer' }),
            segment(8810011, PLAIN_MENUS,
                `${EXTCMD_KEY}showspells${NEWLINE_KEY}${ESCAPE_KEY}`,
                { role: 'Wizard' }),
            // '#' names itself, so '##' opens a second prompt and the command
            // typed there dispatches through the recursive doextcmd().
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}${EXTCMD_KEY}wait${NEWLINE_KEY}`),

            // --- NEWAUTOCOMP completion ---
            // 'n' identifies #name alone, so the hook writes "ame" ahead of an
            // unmoved cursor. Escape then restarts the prompt, and the second
            // Escape leaves it.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}n${ESCAPE_KEY}${ESCAPE_KEY}`),
            // Every further keystroke expands again, so the painted text never
            // changes while the cursor walks along it.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}name${ESCAPE_KEY}${ESCAPE_KEY}`),
            // 'nx' matches nothing, so the arm that erases the rest of the
            // prior guess blanks the "ame" the expansion had painted.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}nx${ESCAPE_KEY}${ESCAPE_KEY}`),
            // Narrowing without ever reaching one match: 'c', 'ch' and 'cha'
            // leave three, two and one candidate.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}cha${ESCAPE_KEY}${ESCAPE_KEY}`),
            // Escape over typed text restarts the prompt, after which the
            // buffer accepts a complete command again.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}na${ESCAPE_KEY}wait${NEWLINE_KEY}`),

            // --- erase and kill ---
            // DEL steps back one character and blanks the expansion beyond it.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}na${ERASE_KEY}${ERASE_KEY}${ESCAPE_KEY}`),
            // '\b' reaches the same arm through its own test.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}na${BACKSPACE_KEY}${ESCAPE_KEY}`),
            // Erasing the only typed character leaves an empty buffer, so the
            // following Escape cancels rather than restarting.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}w${ERASE_KEY}${ESCAPE_KEY}`),
            // ^U blanks from the insertion point to the end of the expansion,
            // then walks back to the start of the buffer.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}na${KILL_KEY}${ESCAPE_KEY}`),
            // ^U mid-word, then a different command typed into the emptied
            // buffer.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}wai${KILL_KEY}look${NEWLINE_KEY}`),
            // Both editing keys at an empty buffer ring the bell and write no
            // cell.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}${ERASE_KEY}${KILL_KEY}${ESCAPE_KEY}`),

            // --- the wizard gate in extcmds_match() ---
            // Outside debug mode 'l' identifies #loot alone and expands. The
            // debug recipe below types the same keystroke for the other arm.
            segment(8810001, PLAIN, `${EXTCMD_KEY}l${ESCAPE_KEY}${ESCAPE_KEY}`),

            // --- input length, options, and a pet on the level ---
            // 75 characters, which the printable arm accepts up to COLNO.
            segment(8810001, PLAIN,
                `${EXTCMD_KEY}abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuv`
                + `wxyzabcdefghijklmnopqrstu${NEWLINE_KEY}`),
            // number_pad moves the count key, which parse() consults before
            // the command byte.
            segment(8810011, 'pettype:none,!acoustics,number_pad:1',
                `${EXTCMD_KEY}wait${NEWLINE_KEY}`, { role: 'Healer' }),
            // A pet must not take its turn while the prompt is open, and must
            // take one when #wait finally spends the hero's.
            segment(8810004, 'pettype:dog,!acoustics',
                `${EXTCMD_KEY}wait${NEWLINE_KEY}`, { role: 'Ranger' }),
        ],
    }, 'extended-command prompt recipe');
}

// set_playmode() renames a debug-mode hero to "wizard", so every debug segment
// writes the same lock and level files. record-session.mjs clears those only
// before the first segment of a recording, which makes a second debug segment
// in the same recording collide with the first one's leftovers and exit. These
// segments therefore live in their own recipe, recorded one segment at a time.
export function loadExtendedCommandPromptDebugRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // In debug mode #levelchange and #lightsources join #loot, so the
            // keystroke that expands in ordinary play leaves the buffer alone.
            segment(8810001, DEBUG, `${EXTCMD_KEY}l${ESCAPE_KEY}${ESCAPE_KEY}`),
            // 'lev' narrows to #levelchange, which only debug mode can match.
            segment(8810001, DEBUG,
                `${EXTCMD_KEY}lev${ESCAPE_KEY}${ESCAPE_KEY}`),
            // Dispatch and the unknown-command answer both have to survive the
            // larger match set debug mode admits.
            segment(8810001, DEBUG, `${EXTCMD_KEY}wait${NEWLINE_KEY}`),
            segment(8810001, DEBUG, `${EXTCMD_KEY}qqq${NEWLINE_KEY}`),
        ],
    }, 'extended-command prompt debug recipe');
}

export async function runExtendedCommandPromptMatrix() {
    const ordinary = await runFreshMatrix({
        entries: [{
            label: 'extended-command prompt',
            recipe: loadExtendedCommandPromptRecipe(),
        }],
        summaryLabel: 'EXTENDED-COMMAND PROMPT',
    });
    if (!ordinary.passed) return ordinary;
    return runFreshMatrix({
        entries: [{
            label: 'extended-command prompt (debug mode)',
            recipe: loadExtendedCommandPromptDebugRecipe(),
        }],
        summaryLabel: 'EXTENDED-COMMAND PROMPT (DEBUG MODE)',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runExtendedCommandPromptMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `extended-command prompt: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
