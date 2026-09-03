#!/usr/bin/env node

// Record and replay the default help menu through version information. The
// case dismisses both text pages and reaches the restored command boundary.
//
// Two lines of that text name the build host. version.c getversionstring()
// opens with the port name and mdlib.c runtime build text names the PRNG
// seed device, so the judge's Darwin recorder printed "MacOS NetHack Version"
// and "/dev/random", which the port prints (js/version.js, js/mdlib.js),
// while a Linux-built recorder prints "Unix NetHack Version" and
// "/dev/urandom". On a Linux host the matrix substitutes the judge's text
// before comparison; the rest of both pages stays strict.

import assert from 'node:assert/strict';

import { validateCleanRecipe } from './diff-fresh.mjs';
import {
    runDifferentialAcceptingHostStrings,
    runFreshMatrix,
    runMatrixCli,
} from './fresh-matrix.mjs';

const runDifferentialFn = runDifferentialAcceptingHostStrings([
    ['Unix NetHack Version', 'MacOS NetHack Version'],
    ['/dev/urandom', '/dev/random'],
]);

export const HELP_VERSION_MOVES = '?a  ';

function nethackrc() {
    return [
        'OPTIONS=name:Ada,role:Wizard,race:human,gender:female,align:neutral',
        'OPTIONS=!autopickup,!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,menu_headings:none,symset:DECgraphics',
        '',
    ].join('\n');
}

export function loadHelpVersionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            // This independent seed reaches version information without
            // turn-dependent setup. The fixed date cannot change build text.
            seed: 918_273,
            datetime: '20371117080910',
            nethackrc: nethackrc(),
            moves: HELP_VERSION_MOVES,
        }],
    }, 'help version-information recipe');
}

export async function runHelpVersionMatrix() {
    const result = await runFreshMatrix({
        entries: [{
            label: 'help version information',
            recipe: loadHelpVersionRecipe(),
        }],
        summaryLabel: 'HELP VERSION INFORMATION',
        runDifferentialFn,
    });
    if (result.passed) assert.equal(result.totals.segments, 1);
    return result;
}

runMatrixCli(import.meta.url, runHelpVersionMatrix, 'help version information');
