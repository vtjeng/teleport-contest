#!/usr/bin/env node

// Record and replay version.c get_feature_notice_ver() and options.c
// optfn_suppress_alert() from startup parsing through flags.suppress_alert and
// the live #optionsfull value. Non-startup feature-alert messages and
// #saveoptions remain outside this matrix.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const OPEN_FULL_OPTIONS_MENU = ' mO      ';
const SUPPRESS_ALERT_ROW = allopt.find(
    ({ name }) => name === 'suppress_alert',
);

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

function parserCase({ label, seed, datetime, statements = [], expected,
    value, errors = 0 }) {
    return Object.freeze({
        label,
        seed,
        datetime,
        nethackrc: startupRc(`Alert${seed}`, ...statements),
        moves: `${errors ? '\n' : ''}${OPEN_FULL_OPTIONS_MENU}`,
        expected,
        value,
        errors,
    });
}

export const STARTUP_SUPPRESS_ALERT_CASES = Object.freeze([
    parserCase({
        label: 'zero default renders none',
        seed: 9713001,
        datetime: '20410710100100',
        expected: 0,
        value: '(none)',
    }),
    parserCase({
        label: 'ordinary older version reaches optionsfull',
        seed: 9712001,
        datetime: '20410709101300',
        statements: ['suppress_alert:3.7.0'],
        expected: 0x03070000,
        value: '3.7.0',
    }),
    parserCase({
        label: 'patch atoi accepts a numeric prefix and trailing fields',
        seed: 9713003,
        datetime: '20410710100300',
        statements: ['suppress_alert:3.7.1tail.ignored'],
        expected: 0x03070100,
        value: '3.7.1',
    }),
    parserCase({
        label: 'minor shift carry reaches the unmasked major getter',
        seed: 9713007,
        datetime: '20410710100700',
        statements: ['suppress_alert:0.256.0'],
        expected: 0x01000000,
        value: '1.0.0',
    }),
    parserCase({
        label: 'recorder int narrowing can select the current major',
        seed: 9713009,
        datetime: '20410710100900',
        statements: ['suppress_alert:4294967301.0.0'],
        expected: 0x05000000,
        value: '5.0.0',
    }),
    parserCase({
        label: 'malformed and zero values preserve a prior setting',
        seed: 9713011,
        datetime: '20410710101100',
        statements: [
            'suppress_alert:bad,suppress_alert:0.0.0,'
                + 'suppress_alert:3.7.0',
        ],
        expected: 0x03070000,
        value: '3.7.0',
    }),
    parserCase({
        label: 'leftmost comma duplicate wins',
        seed: 9713013,
        datetime: '20410710101300',
        statements: ['suppress_alert:3.6.1,suppress_alert:4.0.2'],
        expected: 0x03060100,
        value: '3.6.1',
    }),
    parserCase({
        label: 'future versions report and preserve prior state',
        seed: 9712013,
        datetime: '20410709113700',
        statements: [
            'suppress_alert:3.7.0',
            ...Array(8).fill('suppress_alert:5.0.1'),
            ...Array(8).fill('suppress_alert:3.7.-1'),
        ],
        expected: 0x03070000,
        value: '3.7.0',
        // Repeating both future forms fills the raw terminal before
        // config_error_done() names the recorder's absolute rc path, which a
        // text-only runSegment input cannot know.
        errors: 16,
    }),
    parserCase({
        label: 'patch atoi narrowing wraps before packing',
        seed: 9713019,
        datetime: '20410710101900',
        statements: ['suppress_alert:0.0.4294967297tail'],
        expected: 0x00000100,
        value: '0.0.1',
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

export function loadStartupSuppressAlertRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SUPPRESS_ALERT_CASES.map(segmentFor),
    }, 'startup suppress alert recipe');
}

function caseFor(segment) {
    return STARTUP_SUPPRESS_ALERT_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function verifyValue(state, entry, phase) {
    if (state.flags?.suppress_alert !== entry.expected) {
        throw new Error(
            `${entry.label} ${phase} the wrong packed flags value`,
        );
    }
    if (optionValue(state, SUPPRESS_ALERT_ROW, {}) !== entry.value) {
        throw new Error(`${entry.label} ${phase} the wrong optionsfull value`);
    }
}

export async function verifyStartupSuppressAlertSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup suppress-alert case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyValue(parsed, entry, 'parsed');
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
    verifyValue(game, entry, 'installed');
}

export async function runStartupSuppressAlertMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup suppress alert to optionsfull',
            recipe: loadStartupSuppressAlertRecipe(),
        }],
        summaryLabel: 'STARTUP SUPPRESS ALERT',
        verifySegment: verifyStartupSuppressAlertSegment,
        chunkLimit: 7,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupSuppressAlertMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup suppress alert: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
