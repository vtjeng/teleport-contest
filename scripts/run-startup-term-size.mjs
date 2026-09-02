#!/usr/bin/env node

// Record and replay options.c optfn_term_cols() and optfn_term_rows() from
// configuration parsing through the iflags fields jsmain.js installs on the
// running game.  TTY advertises no WC2_TERM_SIZE capability, so #optionsfull
// deliberately hides both configuration-only rows.

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

const REJECTED_TERM_SIZES = Object.freeze([
    'term_cols',
    'term_rows:',
    '!term_cols:12',
    '!term_rows',
    'term_cols:text',
    'term_rows:32767',
    'term_cols:9223372036854775808',
    'term_rows:-9223372036854775809',
]);

export const STARTUP_TERM_SIZE_CASES = Object.freeze([
    Object.freeze({
        label: 'decimal prefixes and termcolumns reach installed iflags',
        seed: 7331417,
        datetime: '20360426131700',
        nethackrc: startupRc(
            'Termprefix',
            'termcolumns:+23tail,term_rows: \t17suffix',
        ),
        moves: ' ',
        expected: Object.freeze([23, 17]),
        errors: 0,
    }),
    Object.freeze({
        label: 'portable integer bounds reach installed iflags',
        seed: 7331417,
        datetime: '20360426131700',
        nethackrc: startupRc(
            'Termbounds',
            'term_cols:1,term_rows:32766',
        ),
        moves: ' ',
        expected: Object.freeze([1, 32766]),
        errors: 0,
    }),
    Object.freeze({
        label: 'duplicates apply right to left and across later lines',
        seed: 7331417,
        datetime: '20360426131700',
        nethackrc: startupRc(
            'Termduplicates',
            'term_cols:11,term_rows:22,termcolumns:33',
            'term_rows:44,term_rows:45',
            'termcolumns:55,term_cols:56',
            'term_rows:66,term_rows:67',
            'termcolumns:77,term_cols:78',
            'term_rows:88,term_rows:89',
            'termcolumns:99,term_cols:100',
            'term_rows:111,term_rows:112',
            'termcolumns:123,term_cols:124',
        ),
        moves: '\n',
        expected: Object.freeze([123, 111]),
        errors: 17,
    }),
    Object.freeze({
        label: 'rejected sizes preserve the preceding dimensions',
        seed: 7331417,
        datetime: '20360426131700',
        nethackrc: startupRc(
            'Termerrors',
            'term_cols:17,term_rows:19',
            ...REJECTED_TERM_SIZES,
        ),
        moves: '\n',
        expected: Object.freeze([17, 19]),
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

export function loadStartupTermSizeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_TERM_SIZE_CASES.map(segmentFor),
    }, 'startup terminal-size recipe');
}

function caseFor(segment) {
    return STARTUP_TERM_SIZE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function termSize(state) {
    return [
        state.iflags?.wc2_term_cols,
        state.iflags?.wc2_term_rows,
    ];
}

function sameSize(actual, expected) {
    return actual[0] === expected[0] && actual[1] === expected[1];
}

export async function verifyStartupTermSizeSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup terminal-size case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (!sameSize(termSize(parsed), entry.expected)
        || parsed.flags.term_cols !== undefined
        || parsed.flags.term_rows !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong iflags fields`);
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
    if (!sameSize(termSize(game), entry.expected))
        throw new Error(`${entry.label} installed the wrong iflags fields`);
}

export async function runStartupTermSizeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup terminal size to iflags and diagnostics',
            recipe: loadStartupTermSizeRecipe(),
        }],
        summaryLabel: 'STARTUP TERMINAL SIZE',
        verifySegment: verifyStartupTermSizeSegment,
    });
}

runMatrixCli(import.meta.url, runStartupTermSizeMatrix, 'startup terminal size');
