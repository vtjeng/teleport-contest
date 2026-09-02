#!/usr/bin/env node

// Record and replay options.c optfn_align_message() and
// optfn_align_status() from startup configuration through the iflags fields
// jsmain.js installs.  TTY advertises neither WC_ALIGN_* capability, so these
// configuration values deliberately have no layout or #optionsfull consumer.

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

export const STARTUP_WINDOW_ALIGNMENT_CASES = Object.freeze([
    Object.freeze({
        label: 'left and top tokens accept case and suffixes',
        seed: 8450119,
        datetime: '20410217142600',
        nethackrc: startupRc(
            'Alignlefttop',
            'align_message:LeFt-tail,align_status:TOPsuffix',
        ),
        moves: ' ',
        expected: Object.freeze([1, 3]),
        errors: 0,
    }),
    Object.freeze({
        label: 'right and bottom tokens accept case and suffixes',
        seed: 8450119,
        datetime: '20410217142600',
        nethackrc: startupRc(
            'Alignrightbottom',
            'align_message:RiGhTtail,align_status:BoTtOm-tail',
        ),
        moves: ' ',
        expected: Object.freeze([2, 4]),
        errors: 0,
    }),
    Object.freeze({
        label: 'duplicates apply leftmost on one line and later across lines',
        seed: 8450119,
        datetime: '20410217142600',
        nethackrc: startupRc(
            'Alignduplicates',
            'align_message:left,align_message:bottom,'
                + 'align_status:top,align_status:right',
            'align_message:right',
            'align_status:bottom',
            'align_message:right',
            'align_status:bottom',
            'align_message:right',
            'align_status:bottom',
            'align_message:right',
            'align_status:bottom',
            'align_message:right',
            'align_status:bottom',
            'align_message:right',
            'align_status:bottom',
            'align_message:right',
            'align_status:bottom',
        ),
        moves: '\n',
        expected: Object.freeze([2, 4]),
        // Enough duplicate diagnostics keep config_error_done()'s unknowable
        // absolute rc path below the 24-row terminal; the focused tests pin
        // the shorter four-error ordering directly.
        errors: 16,
    }),
    Object.freeze({
        label: 'missing invalid and negated values preserve installed state',
        seed: 8450119,
        datetime: '20410217142600',
        nethackrc: startupRc(
            'Alignerrors',
            'align_message:bottom,align_status:left',
            'align_message',
            'align_status:',
            'align_message:lef',
            'align_status: top',
            '!align_message',
            '!align_status:bottom',
            'align_message:bottom',
            'align_status:left',
            'align_message:bottom',
            'align_status:left',
        ),
        moves: '\n',
        expected: Object.freeze([4, 1]),
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

export function loadStartupWindowAlignmentRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_WINDOW_ALIGNMENT_CASES.map(segmentFor),
    }, 'startup window-alignment recipe');
}

function caseFor(segment) {
    return STARTUP_WINDOW_ALIGNMENT_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function alignments(state) {
    return [
        state.iflags?.wc_align_message,
        state.iflags?.wc_align_status,
    ];
}

function sameAlignments(actual, expected) {
    return actual[0] === expected[0] && actual[1] === expected[1];
}

export async function verifyStartupWindowAlignmentSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup window-alignment case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (!sameAlignments(alignments(parsed), entry.expected)
        || parsed.flags.align_message !== undefined
        || parsed.flags.align_status !== undefined) {
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
    if (!sameAlignments(alignments(game), entry.expected)
        || game.flags.align_message !== undefined
        || game.flags.align_status !== undefined) {
        throw new Error(`${entry.label} installed the wrong iflags fields`);
    }
}

export async function runStartupWindowAlignmentMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup window alignments to iflags and diagnostics',
            recipe: loadStartupWindowAlignmentRecipe(),
        }],
        summaryLabel: 'STARTUP WINDOW ALIGNMENTS',
        verifySegment: verifyStartupWindowAlignmentSegment,
    });
}

runMatrixCli(import.meta.url, runStartupWindowAlignmentMatrix, 'startup window alignments');
