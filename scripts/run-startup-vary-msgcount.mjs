#!/usr/bin/env node

// Record and replay options.c optfn_vary_msgcount() from configuration-file
// parsing through the iflags field jsmain.js installs on the running game.
// TTY does not advertise WC_VARY_MSGCOUNT, so #optionsfull deliberately hides
// this row.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

const REJECTED_VARY_MSGCOUNTS = Object.freeze([
    'vary_msgcount',
    'vary_msgcount',
    'vary_msgcount:',
    'vary_msgcount:',
    '!vary_msgcount',
    '!vary_msgcount',
    '!vary_msgcount:12',
    '!vary_msgcount:12',
]);

export const STARTUP_VARY_MSGCOUNT_CASES = Object.freeze([
    Object.freeze({
        label: 'signed vary_msgcount reaches installed iflags',
        seed: 7331261,
        datetime: '20360424124100',
        nethackrc: startupRc('Varysigned', 'vary_msgcount:-17tail'),
        moves: ' ',
        expected: -17,
        errors: 0,
    }),
    Object.freeze({
        label: 'rejected vary_msgcount forms preserve the preceding setting',
        seed: 7331267,
        datetime: '20360424124700',
        nethackrc: startupRc(
            'Varyerrors',
            'vary_msgcount:19',
            ...REJECTED_VARY_MSGCOUNTS,
        ),
        moves: '\n',
        expected: 19,
        errors: 16,
    }),
]);

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: entry.nethackrc,
        moves: entry.moves,
    };
}

export function loadStartupVaryMsgcountRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_VARY_MSGCOUNT_CASES.map(segmentFor),
    }, 'startup vary_msgcount recipe');
}

function caseFor(segment) {
    return STARTUP_VARY_MSGCOUNT_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function varyMsgcount(state) {
    return state.iflags?.wc_vary_msgcount;
}

export async function verifyStartupVaryMsgcountSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup vary_msgcount case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (varyMsgcount(parsed) !== entry.expected
        || parsed.flags.vary_msgcount !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong iflags field`);
    }
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (varyMsgcount(game) !== entry.expected)
        throw new Error(`${entry.label} installed the wrong iflags field`);
}

export async function runStartupVaryMsgcountMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup vary_msgcount to iflags and diagnostics',
            recipe: loadStartupVaryMsgcountRecipe(),
        }],
        summaryLabel: 'STARTUP VARY MSGCOUNT',
        verifySegment: verifyStartupVaryMsgcountSegment,
    });
}

runMatrixCli(import.meta.url, runStartupVaryMsgcountMatrix, 'startup vary_msgcount');
