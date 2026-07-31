#!/usr/bin/env node

// Run the checked-in matrix for #ride's direction prompt through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// Each segment reaches one arm of cmd.c getdir() (3958-4098) by way of
// steed.c doride() (176-192). Only the arms that end without calling
// mount_steed() can appear here: the mount itself belongs to a later slice, so
// a segment answering the prompt with a real direction, with the self key, or
// with '<' or '>' would run past what the port implements. Those are covered by
// scripts/ride-direction.test.mjs, which asserts the boundary instead.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

// cmd.c extcmdlist[] binds '#' to doextcmd() and '.' to donull(); "ride" is
// the name of the row bound to doride().
export const EXTCMD_KEY = '#';
export const RIDE_COMMAND = `${EXTCMD_KEY}ride\n`;
const WAIT = '.';

// decl.c:96 quitchars[]. Only these two are usable in a recording: the
// recorder's terminal has ICRNL set, so a carriage return arrives at
// readchar() as a line feed, and a line feed is C('j'), the key
// reset_commands() binds to do_rush_south. Both therefore answer the prompt
// with a direction rather than cancelling it.
export const ESCAPE_KEY = '\x1B';
export const SPACE_KEY = ' ';
// Bound to #apply, so movecmd() finds no movement handler for it. Any key
// outside the movement set, the four getdir special keys and quitchars[]
// reaches the same arm.
export const STRANGE_KEY = 'a';
// Ctrl-@ on a Unix terminal. win/tty/wintty.c tty_nhgetch():4093-4094 maps it
// to Escape before readchar() sees it, so it cancels the prompt like the
// Escape segment above; the recorder's terminal passes the byte through
// untouched.
export const NUL_KEY = '\x00';

function nethackrc({ role, gender, align, options, bind = null }) {
    return [
        `OPTIONS=name:Rider,role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        ...(bind === null ? [] : [`BIND=${bind}`]),
        '',
    ].join('\n');
}

// Every segment opens with a wait, so the prompt is read against a level the
// hero has already spent a turn on rather than against the arrival screen.
function segment(seed, options, moves, character = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            role: 'Knight',
            gender: 'male',
            align: 'lawful',
            options,
            ...character,
        }),
        moves: `${WAIT}${moves}`,
    };
}

// One segment per gc.Cmd.spkeys[] getdir row: the BIND moves that special key
// onto 'a', which turns the keystroke that would have taken its arm into an
// ordinary invalid direction. Without these, nothing distinguishes reading the
// table from hardcoding '.', 's', '?' and '_'.
function rebound(spkeyName, displacedKey) {
    return {
        ...segment(7710001, NO_CMDASSIST, `${RIDE_COMMAND}${displacedKey}${WAIT}`),
        nethackrc: nethackrc({
            role: 'Knight',
            gender: 'male',
            align: 'lawful',
            options: NO_CMDASSIST,
            bind: `${STRANGE_KEY}:${spkeyName}`,
        }),
    };
}

const PLAIN = 'pettype:none,!acoustics';
// optlist.h:233 makes cmdassist opt_out and On, and help_dir()'s pline-only
// path is inside an `#if 0` block, so with the default an invalid direction
// key always opens an NHW_TEXT window. Turning it off is what leaves
// getdir()'s "What a strange direction!" reachable.
const NO_CMDASSIST = 'pettype:none,!acoustics,!cmdassist';
// A Knight starts beside a saddled pony, which is what puts a monster glyph
// next to the hero while the prompt is open.
const WITH_PONY = '!acoustics';

export function loadRideDirectionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the prompt itself ---
            // The segment stops on the open prompt, so its last recorded
            // screen and cursor are the ones tty_yn_function() painted.
            segment(7710001, PLAIN, RIDE_COMMAND),
            // The same prompt with a pet adjacent, so the map underneath it
            // carries a monster glyph the repaint has to preserve.
            segment(7710011, WITH_PONY, RIDE_COMMAND, { gender: 'female' }),

            // --- the two quitchars[] cancels ---
            // getdir() returns 0 without a message and doride() answers
            // ECMD_CANCEL, so the trailing wait proves no turn was spent.
            segment(7710001, PLAIN, `${RIDE_COMMAND}${ESCAPE_KEY}${WAIT}`),
            segment(7710001, PLAIN, `${RIDE_COMMAND}${SPACE_KEY}${WAIT}`),
            segment(7710011, WITH_PONY,
                `${RIDE_COMMAND}${ESCAPE_KEY}${WAIT}`, { gender: 'female' }),
            // The NUL byte the window port substitutes an Escape for, which
            // is the only way to reach that substitution from a keystroke.
            segment(7710001, PLAIN, `${RIDE_COMMAND}${NUL_KEY}${WAIT}`),

            // --- the invalid-direction message ---
            segment(7710001, NO_CMDASSIST,
                `${RIDE_COMMAND}${STRANGE_KEY}${WAIT}`),
            // A different seed, role and alignment, so the message is not
            // read off one level's layout.
            segment(7710021, NO_CMDASSIST,
                `${RIDE_COMMAND}${STRANGE_KEY}${WAIT}`,
                { role: 'Samurai', align: 'lawful' }),

            // --- the four gc.Cmd.spkeys[] getdir keys ---
            rebound('getdir.self', '.'),
            rebound('getdir.self2', 's'),
            rebound('getdir.help', '?'),
            rebound('getdir.mouse', '_'),
        ],
    }, 'ride direction recipe');
}

export async function runRideDirectionMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ride direction prompt',
            recipe: loadRideDirectionRecipe(),
        }],
        summaryLabel: 'RIDE DIRECTION PROMPT',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runRideDirectionMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`ride direction: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
