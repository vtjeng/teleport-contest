#!/usr/bin/env node

// Run the checked-in matrix for commands that consume no game time through
// fresh C recordings. Every segment contains replay inputs only;
// runFreshMatrix() records new reference output in an isolated temporary
// workspace.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20310203040506';

function nethackrc({ name, role, gender = 'female', align = 'neutral',
    options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},`
        + `align:${align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

export function loadNoTimeCommandsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Five bytes with no binding, each answered by rhack()'s
                // bad-command path, separated by waits so a wrongly elapsed
                // turn would show in the next screen.
                moves: "..% ..'~]..",
            },
            {
                seed: 8810004,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Ranger',
                    options: 'pettype:dog,!acoustics',
                }),
                // The same path with a pet on the level and a walk between the
                // unbound bytes: the pet must not move on a no-time command.
                moves: '.M.}l ~..{',
            },
            {
                seed: 8810011,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics,number_pad:1',
                }),
                // With number_pad on, `2` is a movement command rather than a
                // count digit, so the unbound set follows the option.
                moves: '.%.2%~.',
            },
            // The look command, `:`, whose look_here() branches also take no
            // game time for a sighted hero.
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // The hero starts on the upstairs, so this looks at a terrain
                // feature: dfeature_at() through stairs_description().
                moves: '..:..',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // One step west reaches a bare floor square, where look_here()
                // has no feature to name and answers "You see no objects
                // here."; the step back looks at the staircase again.
                moves: 'h:l:',
            },
            {
                seed: 990003,
                datetime: '20300102030405',
                nethackrc: nethackrc({
                    name: 'DoorFind',
                    role: 'Healer',
                    gender: 'male',
                    options: 'pettype:none,!acoustics',
                }),
                // A doorless doorway, the other dfeature_at() branch this
                // milestone reaches, looked at twice so the repeated message
                // is covered too.
                moves: 'h::',
            },
            {
                seed: 51001,
                datetime: '20320405060708',
                nethackrc: nethackrc({
                    name: 'BObj',
                    role: 'Healer',
                    options: '!autopickup,pettype:none,!acoustics',
                }),
                // A square holding exactly one object, which look_here()
                // describes after the engraving read.
                moves: 'l:',
            },
            // The inventory display, which also consumes no game time. Role
            // decides the starting pack, so each of these formats a different
            // set of doname() suffixes.
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Worn armor and a wielded long sword, dismissed with Escape.
                moves: 'i\u001b.',
            },
            {
                seed: 8820002,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'InvRanger',
                    role: 'Ranger',
                    gender: 'male',
                    options: 'pettype:none,!acoustics',
                }),
                // A Ranger carries quivered arrows and an alternate weapon,
                // which are the other two owornmask phrases.
                moves: 'i\u001b.',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // Two menus in a row, then a look, so a redrawn menu and the
                // restored map are both compared.
                moves: 'i\u001bi\u001b:',
            },
            {
                seed: 8830001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'InvRogue',
                    role: 'Rogue',
                    align: 'chaotic',
                    options: 'pettype:none,!acoustics',
                }),
                // A Rogue's empty sack exercises the "empty" prefix, and the
                // Space dismissal is the other way out of a one-page menu.
                moves: 'i .',
            },
            {
                seed: 8840001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'InvTourist',
                    role: 'Tourist',
                    options: 'pettype:none,!acoustics',
                }),
                // This Tourist carries a tin, which names its contents
                // through eat.c tin_details().
                moves: 'i\u001b.',
            },
            {
                seed: 8810001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'Unbound',
                    role: 'Valkyrie',
                    options: 'pettype:none,!acoustics',
                }),
                // A Valkyrie carries no spellbook, so `+` reaches
                // dovspell()'s empty answer and consumes no time.
                moves: '.+.',
            },
        ],
    }, 'no-time commands recipe');
}

export async function runNoTimeCommandsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'no-time commands',
            recipe: loadNoTimeCommandsRecipe(),
        }],
        summaryLabel: 'NO-TIME COMMANDS',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runNoTimeCommandsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `no-time commands: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
