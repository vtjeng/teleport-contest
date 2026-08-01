#!/usr/bin/env node

// Run the checked-in matrix for do.c dodown()'s refusal arm through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.
//
// dodown() answers a hero who cannot descend with "You can't go down here."
// and no elapsed turn. The segments below cover the square with no stairway
// at all, the square carrying an *up* staircase, which is what the `!stway->up`
// test at do.c:1147 separates from a descent, and the option and companion
// states that change which of dodown()'s guards are live.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20330607081011';

// The key bound to the `down` command, extcmdlist[]'s 0x3E row.
export const DOWN_COMMAND = '>';

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

function valkyrie(moves) {
    return {
        seed: 4470311,
        datetime: DATETIME,
        nethackrc: nethackrc({
            name: 'Descend',
            role: 'Valkyrie',
            options: 'pettype:none,!acoustics',
        }),
        moves,
    };
}

export function loadDescendRefusalRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            // One step west leaves the up staircase for an ordinary room
            // square, where stairway_at() answers null and both stairs_down
            // and ladder_down stay FALSE. The two waits afterwards would show
            // a turn the refusal wrongly spent.
            valkyrie('h>..'),
            // The same '>' pressed on the square the hero starts on, which
            // carries the up staircase. stairway_at() answers that stairway
            // and `!stway->up` is FALSE, so this reaches the same refusal by
            // the other route; a port that read the flag backwards would
            // descend here and match on the segment above.
            valkyrie('>..'),
            // The control for the first segment: the same keystrokes without
            // the '>'. do.c:1129-1240 reaches the refusal through no rn2(),
            // rnd() or rnl() call, so both segments record the same number of
            // random-number calls and differ only by one screen.
            valkyrie('h..'),
            // Two refusals in a row. You_cant() goes through pline() rather
            // than Norep(), so the second press repaints the same line
            // instead of suppressing it.
            valkyrie('h>>.'),
            {
                // A pet on the map and a different level, role, race, gender
                // and alignment. The pet's own turn follows the refusal, so a
                // wrongly spent turn moves it.
                seed: 9152207,
                datetime: '20291112131415',
                nethackrc: nethackrc({
                    name: 'Downward',
                    role: 'Ranger',
                    race: 'elf',
                    gender: 'male',
                    align: 'chaotic',
                    options: 'pettype:dog,!acoustics,!autopickup',
                }),
                moves: `l${DOWN_COMMAND}.`,
            },
            {
                // autodig on, which arms do.c:1231's automatic-digging test.
                // An Archeologist carries the only starting pick-axe
                // (u_init.c:48) but wields the bullwhip listed before it
                // (u_init.c:44), so is_pick(uwep) is FALSE and the refusal
                // still prints. This is the segment that fails if the port
                // reads the option but not the wielded weapon.
                seed: 4470311,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Digger',
                    role: 'Archeologist',
                    options: 'pettype:none,!acoustics,autodig',
                }),
                moves: `h${DOWN_COMMAND}..`,
            },
            {
                // number_pad on, where '4' is the movement command and '>'
                // keeps its binding. `s` rather than `.` waits here, because
                // number_pad rebinds the period.
                seed: 3390808,
                datetime: '20340708091011',
                nethackrc: nethackrc({
                    name: 'NumDown',
                    role: 'Healer',
                    gender: 'male',
                    options: 'pettype:none,!acoustics,number_pad:1',
                }),
                moves: `4${DOWN_COMMAND}s`,
            },
            // The other route to the same handler: extcmdlist[]'s "down" row
            // is reachable from the '#' prompt as well as from the key bound
            // to it, and cmd.c doextcmd() dispatches the same ef_funct.
            valkyrie('h#down\n..'),
        ],
    }, 'descend refusal recipe');
}

export async function runDescendRefusalMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'descend refusal',
            recipe: loadDescendRefusalRecipe(),
        }],
        summaryLabel: 'DESCEND REFUSAL',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runDescendRefusalMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `descend refusal: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
