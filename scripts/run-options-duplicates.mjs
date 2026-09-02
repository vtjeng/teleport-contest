#!/usr/bin/env node

// Record and replay duplicate configuration options through the startup
// boundary. The matrix covers the allopt[] type label, alias suffix, counters
// shared across lines, a rejected first occurrence, a dupeok row, and the
// optfn_playmode() branch that consumes parseoptions()'s duplicate result.

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 8734019;
const DATETIME = '20340417101500';
const REPEATED_COUNT = 22;

function repeatedOptions(left, right) {
    return `OPTIONS=${[...Array(REPEATED_COUNT).fill(left), right].join(',')}`;
}

function baseRc(extra, { includeRole = true } = {}) {
    const character = [
        'name:Counterpoint',
        ...(includeRole ? ['role:Valkyrie'] : []),
        'race:human',
        'gender:female',
        'align:lawful',
    ];
    return [
        `OPTIONS=${character.join(',')}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics',
        ...extra,
        '',
    ].join('\n');
}

export function loadOptionsDuplicateRecipe() {
    const cases = [
        {
            // Twenty-two duplicate reports fill the raw screen before
            // config_error_done() prints the absolute source path that the JS
            // segment API cannot know. This keeps the differential strict
            // without adding errors from an unrelated parser branch.
            rc: baseRc([
                repeatedOptions('autopickup', '!autopickup'),
            ]),
            moves: '\n:',
        },
        {
            rc: baseRc([
                'OPTIONS=pickup_types:%',
                `OPTIONS=${Array(REPEATED_COUNT)
                    .fill('pickup_types:)').join(',')}`,
            ]),
            moves: '\n\x18\x1b:',
        },
        {
            rc: baseRc([
                repeatedOptions('color', '!colour'),
            ]),
            moves: '\n:',
        },
        {
            rc: baseRc([
                'OPTIONS=!sortloot:none',
                `OPTIONS=${Array(REPEATED_COUNT)
                    .fill('sortloot:full').join(',')}`,
            ]),
            moves: '\n:',
        },
        {
            rc: baseRc(['OPTIONS=role:Valkyrie,role:Healer'], {
                includeRole: false,
            }),
            moves: ':',
        },
        {
            rc: baseRc([
                repeatedOptions('playmode:debug', 'playmode:normal'),
            ]),
            moves: '\n:',
        },
    ];
    return validateCleanRecipe({
        version: 5,
        segments: cases.map(({ rc, moves }) => ({
            seed: SEED,
            datetime: DATETIME,
            nethackrc: rc,
            moves,
        })),
    }, 'options duplicate recipe');
}

export async function runOptionsDuplicateMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'parseoptions general duplicate detection',
            recipe: loadOptionsDuplicateRecipe(),
        }],
        summaryLabel: 'OPTIONS DUPLICATES',
    });
}

runMatrixCli(import.meta.url, runOptionsDuplicateMatrix, 'options duplicates');
