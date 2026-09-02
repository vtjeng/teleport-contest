#!/usr/bin/env node

// Record and replay options.c optfn_mouse_support() from configuration
// parsing through the iflags field jsmain.js installs on the running game.
// TTY advertises no WC_MOUSE_SUPPORT capability, so #optionsfull and mouse
// event processing deliberately do not consume the configured mode.

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

const REJECTED_MOUSE_MODES = Object.freeze([
    'mouse_support:zqxj',
    'mouse_support:-1',
    'mouse_support:3',
    'mouse_support:+0',
    'mouse_support: 0',
    '!mouse_support:2',
    '!mou',
    'mouse_support:zqxj',
]);

const DUPLICATE_STATEMENTS = Object.freeze([
    'mouse_support:1,mouse_support:2',
    ...Array(15).fill('mouse_support:0'),
]);

export const STARTUP_MOUSE_SUPPORT_CASES = Object.freeze([
    Object.freeze({
        label: 'source modes and atoi suffixes reach installed iflags',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Mousemodes',
            'mouse_support:2junk',
        ),
        moves: ' ',
        expected: 2,
        errors: 0,
    }),
    Object.freeze({
        label: 'abbreviated empty compatibility installs on silently',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc('Mousecompat', 'mou:'),
        moves: ' ',
        expected: 1,
        errors: 0,
    }),
    Object.freeze({
        label: 'canonical empty value reports and still installs on',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Mouseempty',
            ...Array(16).fill('mouse_support:'),
        ),
        moves: '\n',
        expected: 1,
        errors: 31,
    }),
    Object.freeze({
        label: 'invalid modes and negations preserve the preceding mode',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Mouseerrors',
            'mouse_support:2',
            ...REJECTED_MOUSE_MODES,
        ),
        moves: '\n',
        expected: 2,
        errors: 16,
    }),
    Object.freeze({
        label: 'duplicates apply right to left and across later lines',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Mouseduplicates',
            ...DUPLICATE_STATEMENTS,
        ),
        moves: '\n',
        expected: 0,
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

export function loadStartupMouseSupportRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MOUSE_SUPPORT_CASES.map(segmentFor),
    }, 'startup mouse_support recipe');
}

function caseFor(segment) {
    return STARTUP_MOUSE_SUPPORT_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function mouseSupport(state) {
    return state.iflags?.wc_mouse_support;
}

export async function verifyStartupMouseSupportSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup mouse_support case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (mouseSupport(parsed) !== entry.expected
        || parsed.flags.mouse_support !== undefined) {
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
    if (mouseSupport(game) !== entry.expected
        || game.flags.mouse_support !== undefined) {
        throw new Error(`${entry.label} installed the wrong iflags field`);
    }
}

export async function runStartupMouseSupportMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup mouse support to iflags and diagnostics',
            recipe: loadStartupMouseSupportRecipe(),
        }],
        summaryLabel: 'STARTUP MOUSE SUPPORT',
        verifySegment: verifyStartupMouseSupportSegment,
    });
}

runMatrixCli(import.meta.url, runStartupMouseSupportMatrix, 'startup mouse support');
