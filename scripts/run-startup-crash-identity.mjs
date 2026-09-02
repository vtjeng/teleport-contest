#!/usr/bin/env node

// Record and replay options.c optfn_crash_email() and optfn_crash_name() from
// configuration-file startup through their gc fields and #optionsfull get_val
// requests.  The error case repeats missing values so config_error_done()'s
// unknowable absolute rc path scrolls above the compared terminal window.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const OPEN_FULL_OPTIONS_MENU = ' mO      ';

function startupRc(name, ...identityStatements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...identityStatements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

const EMAIL = 'selector@example.invalid';
const REPORTER = 'Source Reader';

export const STARTUP_CRASH_IDENTITY_CASES = Object.freeze([
    Object.freeze({
        label: 'both report identities reach optionsfull',
        seed: 7331087,
        datetime: '20360422115300',
        nethackrc: startupRc(
            'Crashidentity',
            `crash_email:${EMAIL}`,
            `crash_name:${REPORTER}`,
        ),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: Object.freeze([EMAIL, REPORTER]),
        errors: 0,
        optionsfull: true,
    }),
    Object.freeze({
        label: 'missing identities preserve prior state and report',
        seed: 7331083,
        datetime: '20360422114900',
        nethackrc: startupRc(
            'Crashmissing',
            `crash_email:${EMAIL}`,
            `crash_name:${REPORTER}`,
            ...Array(4).fill('crash_email'),
            ...Array(4).fill('crash_name:'),
        ),
        moves: '\n',
        expected: Object.freeze([EMAIL, REPORTER]),
        errors: 16,
        optionsfull: false,
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

export function loadStartupCrashIdentityRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_CRASH_IDENTITY_CASES.map(segmentFor),
    }, 'startup crash identity recipe');
}

function caseFor(segment) {
    return STARTUP_CRASH_IDENTITY_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function identity(state) {
    return [state.gc?.crash_email ?? null, state.gc?.crash_name ?? null];
}

function optionsFullValue(state, name) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        ({ text }) => text.trim().startsWith(`${name} `),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupCrashIdentitySegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup crash identity case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (JSON.stringify(identity(parsed)) !== JSON.stringify(entry.expected)) {
        throw new Error(`${entry.label} parsed into the wrong gc fields`);
    }
    if (parsed.flags.crash_email !== undefined
        || parsed.flags.crash_name !== undefined) {
        throw new Error(`${entry.label} retained raw crash identity text`);
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
    if (JSON.stringify(identity(game)) !== JSON.stringify(entry.expected))
        throw new Error(`${entry.label} installed the wrong gc fields`);
    if (entry.optionsfull) {
        if (optionsFullValue(game, 'crash_email') !== entry.expected[0])
            throw new Error(`${entry.label} showed the wrong crash_email`);
        if (optionsFullValue(game, 'crash_name') !== entry.expected[1])
            throw new Error(`${entry.label} showed the wrong crash_name`);
    }
}

export async function runStartupCrashIdentityMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup crash identities to optionsfull and diagnostics',
            recipe: loadStartupCrashIdentityRecipe(),
        }],
        summaryLabel: 'STARTUP CRASH IDENTITY',
        verifySegment: verifyStartupCrashIdentitySegment,
    });
}

runMatrixCli(import.meta.url, runStartupCrashIdentityMatrix, 'startup crash identity');
