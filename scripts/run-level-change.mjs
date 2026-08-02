#!/usr/bin/env node

// Run the checked-in matrix for #levelchange through fresh C recordings. Every
// segment contains replay inputs only; runFreshMatrix() records new reference
// output in an isolated temporary workspace.
//
// Each segment reaches one branch of wizcmds.c wiz_level_change(), exper.c
// pluslvl(), attrib.c adjabil() or attrib.c newhp()/exper.c newpw(). The
// command exists only in debug mode, so set_playmode() renames every hero to
// "wizard" and every segment writes the same lock and level files; the matrix
// therefore records one segment at a time, as the extended-command prompt's
// debug recipe does.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

const ESCAPE_KEY = '\x1b';
const NEWLINE = '\n';
const WAIT = '.';
const LEVELCHANGE = '#levelchange';

function nethackrc({ name, role, race, gender, align, options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:${race},gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

// Every segment opens and closes with a wait, so a #levelchange that wrongly
// spent or wrongly saved a turn shows up in the screen after it.
function segment(seed, moves, {
    role = 'Wizard',
    race = 'human',
    gender = 'male',
    align = 'neutral',
    options = 'pettype:none,!acoustics,playmode:debug',
} = {}) {
    return {
        seed,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Levch', role, race, gender, align, options,
        }),
        moves: `${WAIT}${moves}${WAIT}`,
    };
}

// Raising from experience level 1 to `target` calls pluslvl() target-1 times,
// and each call but the first blocks on --More-- before it draws: pline()
// wraps the pending top line as soon as the next "You feel more experienced."
// no longer fits beside it. That costs target-2 dismissals. Each innate entry
// the raise crosses adds a You_feel() to the same chain, and `gains` counts
// the ones that print, so the keystrokes below are an upper bound on the
// prompts. The extra ones draw "Unknown command ' '." in both programs, so a
// chain that ended one message early or late still shows up as a screen
// mismatch at the position where the two sequences part.
function raise(target, gains = 0) {
    const dismissals = Math.max(target - 2, 0) + gains + 1;
    return `${LEVELCHANGE}${NEWLINE}${target}${NEWLINE}`
        + ' '.repeat(dismissals);
}

// An answer wiz_level_change() refuses draws one message and no --More--.
function refuse(answer) {
    return `${LEVELCHANGE}${NEWLINE}${answer}${NEWLINE}`;
}

export function loadLevelChangeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // --- the load-bearing raise ---
            // A Wizard's first innate entry is at experience level 15, so
            // thirteen gains cross none of them. urole.xlev is 12, so newhp()
            // and newpw() switch from their lofix/lornd pair to hifix/hirnd
            // partway up, which changes the per-gain draw count from three to
            // one. xlev_to_rank() moves 0 -> 4, so record_achievement() runs
            // four times.
            segment(8820001, raise(14)),

            // --- a second role, with different hpadv, enadv and xlev ---
            // A Knight's only innate entry is at level 7, and enermod()
            // multiplies its energy by 3/2.
            segment(8820002, raise(6), { role: 'Knight', align: 'lawful' }),
            // A Barbarian takes enermod()'s 3/4 arm; bar_abil's next entry is
            // at level 7.
            segment(8820003, raise(6), { role: 'Barbarian' }),
            // A Samurai's next entry after level 1 is at 15, so fourteen
            // levels cross the xlev switch without one.
            segment(8820004, raise(14), { role: 'Samurai', align: 'lawful' }),

            // --- the race half of adjabil()'s traversal ---
            // elf_abil holds the only race entry above level 1, sleep
            // resistance at 4, so a raise to 3 walks the role table and then
            // the race table without reaching it.
            segment(8820105, raise(3),
                { role: 'Wizard', race: 'elf', align: 'chaotic' }),
            // orc_abil holds two level-1 entries, so the crossover to
            // FROMRACE has more than one entry to apply.
            segment(8820006, raise(9),
                { role: 'Rogue', race: 'orc', align: 'chaotic' }),

            // --- wiz_level_change()'s own arms ---
            // newlevel == u.ulevel at level 1.
            segment(8820007, refuse('1'), { role: 'Healer' }),
            // newlevel < u.ulevel with u.ulevel == 1: the early return that
            // lowers nothing.
            segment(8820007, refuse('0'), { role: 'Healer' }),
            // The same arm reached from a negative answer.
            segment(8820007, refuse('-4'), { role: 'Healer' }),
            // newlevel == u.ulevel above level 1, reached by raising first.
            segment(8820008, `${raise(5)}${refuse('5')}`),

            // --- the sscanf() and mungspaces() parse ---
            // An empty line and an Escape both leave ret at 0.
            segment(8820007, refuse(''), { role: 'Healer' }),
            segment(8820007, `${LEVELCHANGE}${NEWLINE}${ESCAPE_KEY}`,
                { role: 'Healer' }),
            // No digits at all: sscanf() converts nothing.
            segment(8820007, refuse('abc'), { role: 'Healer' }),
            // A trailing byte after the integer: sscanf() converts two fields,
            // so the command refuses a buffer it could otherwise read.
            segment(8820007, refuse('12x'), { role: 'Healer' }),
            // mungspaces() collapses the runs and drops the outer ones before
            // sscanf() sees the buffer, so this still converts exactly one
            // field.
            segment(8820009, `${LEVELCHANGE}${NEWLINE}  7  ${NEWLINE}`
                + `${' '.repeat(6)}`, { role: 'Priest', gender: 'female' }),

            // --- the status line ---
            // showexp puts u.uexp on the status line, which pluslvl() assigns
            // rather than accumulates: it ends equal to newuexp() of the level
            // just left.
            segment(8820010, raise(3), {
                role: 'Tourist',
                options: 'pettype:none,!acoustics,playmode:debug,showexp',
            }),

            // --- the turn the command must not spend ---
            // With a pet on the level, a #levelchange that returned ECMD_TIME
            // would let the little dog move before the closing wait.
            segment(8820011, raise(4), {
                role: 'Priest',
                gender: 'female',
                options: 'pettype:dog,!acoustics,playmode:debug',
            }),

            // --- the innate abilities a raise grants ---
            // arc_abil[] { 5, &HStealth, "stealthy", "" }: one gain, whose
            // property postadjabil() redraws nothing for.
            segment(8820012, raise(6, 1), {
                role: 'Archeologist', gender: 'female',
            }),
            // wiz_abil[] { 15, &HWarning, "sensitive" } and
            // { 17, &HTeleport_control, "controlled" }: two gains in one
            // command, the first of them a postadjabil() redraw.
            segment(8820013, raise(18, 2)),
            // ran_abil[] { 15, &HSee_invisible, "", "" } is the only entry
            // above level 1 with an empty gainstr, so the intrinsic and
            // see_monsters() are the whole of the gain and nothing prints.
            // The pet gives see_monsters() a live monster to redraw.
            segment(8820014, raise(16), {
                role: 'Ranger',
                align: 'chaotic',
                options: 'pettype:dog,!acoustics,playmode:debug',
            }),
            // elf_abil[] { 4, &HSleep_resistance, "awake", "tired" } is the
            // only entry above level 1 that adjabil() reaches with the mask
            // flipped to FROMRACE.
            segment(8820015, raise(5, 1), {
                role: 'Priest', race: 'elf', gender: 'female',
                align: 'chaotic',
            }),
            // mon_abil[] crosses five entries between levels 3 and 11, the
            // densest message chain the tables hold, and its level-7 warning
            // gain redraws a level that has a pet on it.
            segment(8820016, raise(12, 5), {
                role: 'Monk',
                align: 'lawful',
                options: 'pettype:dog,!acoustics,playmode:debug',
            }),

            // --- the MAXULEV ceiling ---
            // C clamps a target above MAXULEV to 30 and raises the hero
            // there, so the answer 31 leaves experience level 30 and not 31.
            // From there wiz_level_change()'s `u.ulevel >= MAXULEV` arm is the
            // only reachable answer to a second raise.
            segment(8810008, `${raise(31, 2)}${refuse('40')}`),
        ],
    }, 'level-change recipe');
}

export async function runLevelChangeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: '#levelchange',
            recipe: loadLevelChangeRecipe(),
        }],
        summaryLabel: 'LEVEL CHANGE',
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runLevelChangeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`level change: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
