#!/usr/bin/env node

// Record the wizard-only help row through the production ? command. The
// source table keeps row 16's value while the TTY menu assigns selector p
// after the fifteen ordinary Unix-build rows. wizhelp is 51 lines, so its
// display_file() window needs three page dismissals.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const PAGE_DISMISSALS = 3;

function nethackrc(name, character) {
    return [
        'OPTIONS=name:' + name + ',' + character,
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        'OPTIONS=playmode:debug',
        '',
    ].join('\n');
}

const CASES = Object.freeze([
    {
        label: 'debug Wizard human help',
        seed: 991_001,
        datetime: '20410902030405',
        name: 'Aster',
        character: 'role:Wizard,race:human,gender:female,align:neutral',
    },
    {
        label: 'debug Valkyrie dwarf help variation',
        seed: 991_002,
        datetime: '20410903040506',
        name: 'Beryl',
        character: 'role:Valkyrie,race:dwarf,gender:female,align:lawful',
    },
]);

export function loadHelpWizardRecipe(entry = CASES[0]) {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: entry.seed,
            datetime: entry.datetime,
            nethackrc: nethackrc(entry.name, entry.character),
            moves: '?p' + ' '.repeat(PAGE_DISMISSALS),
        }],
    }, 'wizard help recipe ' + entry.label);
}

export function loadHelpWizardCases() {
    return CASES.map((entry) => ({
        entry,
        recipe: loadHelpWizardRecipe(entry),
    }));
}

export async function runHelpWizardMatrix() {
    const result = await runFreshMatrix({
        entries: loadHelpWizardCases().map(({ entry, recipe }) => ({
            label: entry.label,
            recipe,
        })),
        summaryLabel: 'WIZARD HELP',
    });
    if (result.passed) assert.equal(result.totals.segments, CASES.length);
    return result;
}

runMatrixCli(import.meta.url, runHelpWizardMatrix, 'wizard help');
