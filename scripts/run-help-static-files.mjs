#!/usr/bin/env node

// Record and replay every static file reachable from the default help menu.
// Each case dismisses all of its file's pages and reaches the restored map.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function nethackrc(name) {
    return [
        `OPTIONS=name:${name},role:Wizard,race:human,gender:female,align:neutral`,
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export const HELP_STATIC_CASES = Object.freeze([
    // tty text windows show 23 file lines per page. These dismissal counts
    // are ceil(source line count / 23) for the seven pinned files.
    { target: 'b', filename: 'help', dismissals: 10, seed: 812_301, datetime: '20380102030405', name: 'Beatrice' },
    { target: 'c', filename: 'hh', dismissals: 7, seed: 812_302, datetime: '20380203040506', name: 'Cecilia' },
    { target: 'd', filename: 'history', dismissals: 18, seed: 812_303, datetime: '20380304050607', name: 'Dorothy' },
    { target: 'h', filename: 'opthelp', dismissals: 18, seed: 812_304, datetime: '20380405060708', name: 'Hypatia' },
    { target: 'i', filename: 'optmenu', dismissals: 2, seed: 812_305, datetime: '20380506070809', name: 'Irene' },
    { target: 'm', filename: 'usagehlp', dismissals: 7, seed: 812_306, datetime: '20380607080910', name: 'Maria' },
    { target: 'n', filename: 'license', dismissals: 5, seed: 812_307, datetime: '20380708091011', name: 'Noether' },
].map((entry) => Object.freeze({
    ...entry,
    moves: `?${entry.target}${' '.repeat(entry.dismissals)}`,
})));

export function loadHelpStaticRecipe(entry) {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // Static file display is seed-, clock-, and character-independent.
            // Distinct arbitrary values ensure the matrix does not inherit a
            // development recording's setup while covering every wrapper.
            seed: entry.seed,
            datetime: entry.datetime,
            nethackrc: nethackrc(entry.name),
            moves: entry.moves,
        }],
    }, `help static-file ${entry.filename} recipe`);
}

export async function runHelpStaticMatrix() {
    const result = await runFreshMatrix({
        entries: HELP_STATIC_CASES.map((entry) => ({
            label: `help static file ${entry.filename}`,
            recipe: loadHelpStaticRecipe(entry),
        })),
        summaryLabel: 'HELP STATIC FILES',
    });
    if (result.passed)
        assert.equal(result.totals.segments, HELP_STATIC_CASES.length);
    return result;
}

runMatrixCli(import.meta.url, runHelpStaticMatrix, 'help static files');
