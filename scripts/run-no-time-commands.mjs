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

function nethackrc({ name, role, gender = 'female', options }) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:${gender},`
        + 'align:neutral',
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
