#!/usr/bin/env node

// Record and replay options.c optfn_crash_urlmax() from configuration-file
// startup through gc.crash_urlmax and its #optionsfull get_val request.  The
// error case repeats a rejected value until config_error_done()'s unknowable
// absolute rc path scrolls above the compared terminal window.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const OPEN_FULL_OPTIONS_MENU = ' mO      ';

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

export const STARTUP_CRASH_URLMAX_CASES = Object.freeze([
    Object.freeze({
        label: 'valid URL limit reaches optionsfull',
        seed: 7331097,
        datetime: '20360422120300',
        nethackrc: startupRc('Crashurlmax', 'crash_urlmax:84'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: 84,
        errors: 0,
        optionsfull: true,
    }),
    Object.freeze({
        label: 'rejected URL limits preserve the preceding valid value',
        seed: 7331099,
        datetime: '20360422120500',
        nethackrc: startupRc(
            'Crashurlbad',
            'crash_urlmax:84',
            ...Array(8).fill('crash_urlmax:74'),
        ),
        moves: '\n',
        expected: 84,
        errors: 16,
        optionsfull: false,
    }),
    Object.freeze({
        label: 'overflowed URL limits narrow before rejection',
        seed: 7331101,
        datetime: '20360422120700',
        nethackrc: startupRc(
            'Crashurloverflow',
            'crash_urlmax:84',
            ...Array(8).fill('crash_urlmax:2147483648'),
        ),
        moves: '\n',
        expected: 84,
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

export function loadStartupCrashUrlmaxRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_CRASH_URLMAX_CASES.map(segmentFor),
    }, 'startup crash_urlmax recipe');
}

function caseFor(segment) {
    return STARTUP_CRASH_URLMAX_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function optionsFullValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        ({ text }) => text.trim().startsWith('crash_urlmax '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupCrashUrlmaxSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup crash_urlmax case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.gc.crash_urlmax !== entry.expected
        || parsed.flags.crash_urlmax !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong owner`);
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
    if (game.gc.crash_urlmax !== entry.expected)
        throw new Error(`${entry.label} installed the wrong gc field`);
    if (game.gc.crash_email !== null || game.gc.crash_name !== null)
        throw new Error(`${entry.label} disturbed the crash identities`);
    if (game.gc.currentgraphics !== 0)
        throw new Error(`${entry.label} disturbed the active symbol set`);
    if (entry.optionsfull
        && optionsFullValue(game) !== `${entry.expected}`) {
        throw new Error(`${entry.label} showed the wrong optionsfull value`);
    }
}

export async function runStartupCrashUrlmaxMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup crash_urlmax to optionsfull and diagnostics',
            recipe: loadStartupCrashUrlmaxRecipe(),
        }],
        summaryLabel: 'STARTUP CRASH URLMAX',
        verifySegment: verifyStartupCrashUrlmaxSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupCrashUrlmaxMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup crash_urlmax: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
