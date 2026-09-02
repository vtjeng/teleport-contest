#!/usr/bin/env node

// Record and replay options.c optfn_scroll_amount() and
// optfn_scroll_margin() from configuration-file parsing through the fields
// jsmain.js installs on the running game.  TTY does not advertise either
// window capability, so #optionsfull deliberately hides both rows.

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

const REJECTED_SCROLL_VALUES = Object.freeze([
    'scroll_amount',
    'scroll_amount',
    'scroll_margin:',
    'scroll_margin:',
    '!scroll_amount:12',
    '!scroll_amount:12',
    '!scroll_margin:12',
    '!scroll_margin:12',
]);

export const STARTUP_SCROLL_OPTIONS_CASES = Object.freeze([
    Object.freeze({
        label: 'signed scroll values reach installed iflags',
        seed: 7331103,
        datetime: '20360422121100',
        nethackrc: startupRc(
            'Scrollsigned',
            'scroll_amount:-17,scroll_margin:+23tail',
        ),
        moves: ' ',
        expected: Object.freeze([-17, 23]),
        errors: 0,
    }),
    Object.freeze({
        label: 'negated scroll values install source fallbacks',
        seed: 7331107,
        datetime: '20360422121500',
        nethackrc: startupRc(
            'Scrollfallback',
            '!scroll_amount,!scroll_margin:',
        ),
        moves: ' ',
        expected: Object.freeze([1, 5]),
        errors: 0,
    }),
    Object.freeze({
        label: 'rejected scroll values preserve preceding settings',
        seed: 7331109,
        datetime: '20360422121700',
        nethackrc: startupRc(
            'Scrollerrors',
            'scroll_amount:17,scroll_margin:19',
            ...REJECTED_SCROLL_VALUES,
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

export function loadStartupScrollOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SCROLL_OPTIONS_CASES.map(segmentFor),
    }, 'startup scroll options recipe');
}

function caseFor(segment) {
    return STARTUP_SCROLL_OPTIONS_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function scrollValues(state) {
    return [
        state.iflags?.wc_scroll_amount,
        state.iflags?.wc_scroll_margin,
    ];
}

function sameValues(actual, expected) {
    return actual[0] === expected[0] && actual[1] === expected[1];
}

export async function verifyStartupScrollOptionsSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup scroll-option case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (!sameValues(scrollValues(parsed), entry.expected)
        || parsed.flags.scroll_amount !== undefined
        || parsed.flags.scroll_margin !== undefined) {
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
    if (!sameValues(scrollValues(game), entry.expected))
        throw new Error(`${entry.label} installed the wrong iflags fields`);
}

export async function runStartupScrollOptionsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup scroll options to iflags and diagnostics',
            recipe: loadStartupScrollOptionsRecipe(),
        }],
        summaryLabel: 'STARTUP SCROLL OPTIONS',
        verifySegment: verifyStartupScrollOptionsSegment,
    });
}

runMatrixCli(import.meta.url, runStartupScrollOptionsMatrix, 'startup scroll options');
