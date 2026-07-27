#!/usr/bin/env node

// Run the checked-in repeated-simple-command matrix through fresh C
// recordings. Every segment contains replay inputs only; runFreshMatrix()
// records new reference output in an isolated temporary workspace.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DATETIME = '20300102030405';

function nethackrc({
    name,
    role,
    options,
}) {
    return [
        `OPTIONS=name:${name},role:${role},race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        `OPTIONS=${options}`,
        '',
    ].join('\n');
}

export function loadRepeatedSimpleCommandsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 42510,
                datetime: '20310203040506',
                nethackrc: nethackrc({
                    name: 'RuntimeFind',
                    role: 'Healer',
                    options: 'pettype:none,!acoustics',
                }),
                moves: '.'.repeat(250),
            },
            {
                seed: 31001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'WallWestA',
                    role: 'Healer',
                    options: 'pettype:none,mention_walls',
                }),
                moves: 'h'.repeat(12),
            },
            {
                seed: 31001,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'WallWestB',
                    role: 'Healer',
                    options: 'pettype:none,!mention_walls',
                }),
                moves: 'h'.repeat(4),
            },
            {
                seed: 31006,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'PetSafe',
                    role: 'Tourist',
                    options: 'mention_walls,safe_pet',
                }),
                moves: 'l',
            },
            {
                seed: 31009,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'PetRefuse',
                    role: 'Tourist',
                    options: 'mention_walls,safe_pet',
                }),
                // Refusal consumes the hero action; the waits prove its timed
                // fleeing-pet state remains inside the supported continuation.
                moves: 'y....',
            },
            {
                seed: 32003,
                datetime: DATETIME,
                nethackrc: nethackrc({
                    name: 'ObjectFind',
                    role: 'Tourist',
                    options: 'mention_walls,!autopickup',
                }),
                moves: 'h',
            },
        ],
    }, 'repeated simple commands recipe');
}

export async function runRepeatedSimpleCommandsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'repeated simple commands',
            recipe: loadRepeatedSimpleCommandsRecipe(),
        }],
        summaryLabel: 'REPEATED SIMPLE COMMANDS',
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runRepeatedSimpleCommandsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `repeated simple commands: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
