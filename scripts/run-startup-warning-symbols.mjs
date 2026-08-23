#!/usr/bin/env node

// Record and replay options.c optfn_warnings()/warning_opts() and cfgfiles.c
// cnf_line_WARNINGS()/get_uchars() from configuration-file parsing through
// the gw.warnsyms state jsmain.js installs and the first map/input boundary.
// Warning lookups, custom glyph rendering, and interactive editing are later
// consumers outside this startup-parser slice.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

const BASE_RC = Object.freeze([
    'OPTIONS=name:Warnsymbols,role:Healer,race:human,gender:male,'
        + 'align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup',
]);

const AGGREGATE_DIAGNOSTICS = Object.freeze(Array.from(
    { length: 4 },
    () => ['warnings', 'warnings:', '!warnings', '!warnings:ABC'],
).flat());

function rc(...lines) {
    return [...BASE_RC, ...lines, ''].join('\n');
}

export const STARTUP_WARNING_SYMBOL_CASES = Object.freeze([
    Object.freeze({
        label: 'default warning bytes reach gw',
        seed: 7526201,
        datetime: '20370114120100',
        nethackrc: rc(),
        moves: ' ',
        expected: Object.freeze([48, 49, 50, 51, 52, 53]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'short compound value changes only its prefix',
        seed: 7526203,
        datetime: '20370114120300',
        nethackrc: rc('OPTIONS=warnings:ABC'),
        moves: ' ',
        expected: Object.freeze([65, 66, 67, 51, 52, 53]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'compound escapes stop at an embedded NUL',
        seed: 7526205,
        datetime: '20370114120500',
        nethackrc: rc(String.raw`OPTIONS=warnings:A\66\0XYZ`),
        moves: ' ',
        expected: Object.freeze([65, 66, 50, 51, 52, 53]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'compound strings use source UTF-8 bytes and ignore a tail',
        seed: 7526207,
        datetime: '20370114120700',
        nethackrc: rc('OPTIONS=warnings:éABCDtail'),
        moves: ' ',
        expected: Object.freeze([0xC3, 0xA9, 65, 66, 67, 68]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'direct decimals assign zero selectively and narrow bytes',
        seed: 7526209,
        datetime: '20370114120900',
        nethackrc: rc('WARNINGS=65 0 67 4294967552 69 4294967366'),
        moves: ' ',
        expected: Object.freeze([65, 49, 67, 51, 69, 70]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'short direct values install their initialized prefix',
        seed: 7526211,
        datetime: '20370114121100',
        nethackrc: rc('WARNINGS=65'),
        moves: ' ',
        expectedPrefix: Object.freeze([65]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'a later short direct value installs its initialized prefix',
        seed: 7526213,
        datetime: '20370114121300',
        nethackrc: rc(
            'WARNINGS=65 66 67 68 69 70',
            'WARNINGS=71',
        ),
        moves: ' ',
        expectedPrefix: Object.freeze([71]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'a direct list stops after six values before a bad tail',
        seed: 7526215,
        datetime: '20370114121500',
        nethackrc: rc('WARNINGS=65 66 67 68 69 70 x'),
        moves: ' ',
        expected: Object.freeze([65, 66, 67, 68, 69, 70]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'compound syntax after direct syntax overwrites its prefix',
        seed: 7526217,
        datetime: '20370114121700',
        nethackrc: rc(
            'WARNINGS=65 66 67 68 69 70',
            'OPTIONS=warnings:xy',
        ),
        moves: ' ',
        expected: Object.freeze([120, 121, 67, 68, 69, 70]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'direct syntax after compound syntax installs its prefix',
        seed: 7526219,
        datetime: '20370114121900',
        nethackrc: rc(
            'OPTIONS=warnings:ABCDEF',
            'WARNINGS=71',
        ),
        moves: ' ',
        expectedPrefix: Object.freeze([71]),
        errors: 0,
        waits: 0,
    }),
    Object.freeze({
        label: 'raw syntax wait stays ordered among accumulated diagnostics',
        seed: 7526221,
        datetime: '20370114122100',
        nethackrc: rc(
            ...AGGREGATE_DIAGNOSTICS.slice(0, 8).map(
                (value) => `OPTIONS=${value}`,
            ),
            'WARNINGS=65 66x',
            ...AGGREGATE_DIAGNOSTICS.slice(8).map(
                (value) => `OPTIONS=${value}`,
            ),
        ),
        // One Enter answers get_uchars()'s immediate wait and one answers the
        // final config_error_done() wait. Thirty-one reports move the
        // recorder's unknowable absolute rc path above the visible screen.
        moves: '\n\n ',
        expectedPrefix: Object.freeze([65]),
        errors: 31,
        waits: 1,
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

export function loadStartupWarningSymbolsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_WARNING_SYMBOL_CASES.map(segmentFor),
    }, 'startup warning symbols recipe');
}

function caseFor(segment) {
    return STARTUP_WARNING_SYMBOL_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function warningSymbols(state) {
    return state.gw?.warnsyms;
}

function hasExpectedWarningSymbols(state, entry) {
    const actual = warningSymbols(state);
    if (entry.expected) {
        return JSON.stringify(actual) === JSON.stringify(entry.expected);
    }
    return entry.expectedPrefix.every(
        (byte, index) => actual?.[index] === byte,
    );
}

export async function verifyStartupWarningSymbolsSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup warning-symbol case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (!hasExpectedWarningSymbols(parsed, entry)) {
        throw new Error(`${entry.label} parsed the wrong gw.warnsyms bytes`);
    }
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }
    const waits = parsed.startupEvents.filter(({ wait }) => wait).length;
    if (waits !== entry.waits) {
        throw new Error(`${entry.label} queued ${waits} raw waits`);
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (!hasExpectedWarningSymbols(game, entry)) {
        throw new Error(`${entry.label} installed the wrong gw.warnsyms bytes`);
    }
}

export async function runStartupWarningSymbolsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup warning symbols to gw and diagnostics',
            recipe: loadStartupWarningSymbolsRecipe(),
        }],
        summaryLabel: 'STARTUP WARNING SYMBOLS',
        verifySegment: verifyStartupWarningSymbolsSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupWarningSymbolsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup warning symbols: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
