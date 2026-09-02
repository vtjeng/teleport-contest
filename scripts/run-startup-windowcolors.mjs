#!/usr/bin/env node

// Record and replay options.c optfn_windowcolors()/wc_set_window_colors()
// through startup diagnostics and the iflags state jsmain.js installs.  TTY
// advertises no WC_WINDOWCOLORS capability, so rendering deliberately does not
// consume the four configured foreground/background pairs.

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

const EMPTY_COLORS = Object.freeze([
    Object.freeze({ fg: null, bg: null }),
    Object.freeze({ fg: null, bg: null }),
    Object.freeze({ fg: null, bg: null }),
    Object.freeze({ fg: null, bg: null }),
]);

export const STARTUP_WINDOWCOLORS_CASES = Object.freeze([
    Object.freeze({
        label: 'basic enhanced raw and default colors reach installed iflags',
        seed: 7331399,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowcolors',
            'windowcolors:MeNu RED/black MSG dark_grey/#12345'
                + ' sts unknown/def TxT transparent/#ff0000',
        ),
        moves: ' ',
        expected: Object.freeze([
            Object.freeze({ fg: 'red', bg: 'black' }),
            Object.freeze({ fg: 'dark-gray', bg: '#123405' }),
            Object.freeze({ fg: 'unknown', bg: 'def' }),
            Object.freeze({ fg: 'nocolor', bg: 'red' }),
        ]),
        counters: Object.freeze([1, 1, 1, 1]),
        setFlag: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'unknown windows continue and later groups keep replacing',
        seed: 7331399,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowunknown',
            ...Array(8).fill(
                'windowcolors:zqxj red/black text cyan/white',
            ),
        ),
        moves: '\n',
        expected: Object.freeze([
            EMPTY_COLORS[0], EMPTY_COLORS[1], EMPTY_COLORS[2],
            Object.freeze({ fg: 'cyan', bg: 'white' }),
        ]),
        counters: Object.freeze([0, 0, 0, 8]),
        setFlag: true,
        errors: 15,
    }),
    Object.freeze({
        label: 'malformed spaced tail preserves complete leading writes',
        seed: 7331399,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowpartial',
            ...Array(8).fill(
                'windowcolors:menu light blue/black message red/light blue',
            ),
        ),
        moves: '\n',
        expected: Object.freeze([
            Object.freeze({ fg: null, bg: 'black' }),
            Object.freeze({ fg: 'red', bg: 'light' }),
            EMPTY_COLORS[2], EMPTY_COLORS[3],
        ]),
        counters: Object.freeze([8, 8, 0, 0]),
        setFlag: false,
        errors: 22,
    }),
    Object.freeze({
        label: 'missing empty malformed and negated values preserve state',
        seed: 7331399,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowerrors',
            'windowcolors:menu blue/white',
            ...Array(4).fill('windowcolors'),
            ...Array(4).fill('windowcolors:'),
            ...Array(4).fill('windowcolors:text'),
            ...Array(4).fill('!windowcolors:status red/black'),
        ),
        moves: '\n',
        expected: Object.freeze([
            Object.freeze({ fg: 'blue', bg: 'white' }),
            EMPTY_COLORS[1], EMPTY_COLORS[2], EMPTY_COLORS[3],
        ]),
        counters: Object.freeze([1, 0, 0, 0]),
        setFlag: true,
        errors: 16,
    }),
    Object.freeze({
        label: 'per-window duplicates replace within and across statements',
        seed: 7331399,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowduplicates',
            'windowcolors:menu red/black menu blue/white',
            ...Array(15).fill('windowcolors:mnu green/brown'),
        ),
        moves: '\n',
        expected: Object.freeze([
            Object.freeze({ fg: 'green', bg: 'brown' }),
            EMPTY_COLORS[1], EMPTY_COLORS[2], EMPTY_COLORS[3],
        ]),
        counters: Object.freeze([17, 0, 0, 0]),
        setFlag: true,
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

export function loadStartupWindowcolorsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_WINDOWCOLORS_CASES.map(segmentFor),
    }, 'startup windowcolors recipe');
}

function caseFor(segment) {
    return STARTUP_WINDOWCOLORS_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function verifyState(state, entry) {
    if (JSON.stringify(state.iflags?.wcolors) !== JSON.stringify(entry.expected)
        || JSON.stringify(state.wcolors_opt) !== JSON.stringify(entry.counters)
        || state.options_set_window_colors_flag !== entry.setFlag
        || state.flags.windowcolors !== undefined) {
        throw new Error(`${entry.label} installed the wrong window color state`);
    }
}

export async function verifyStartupWindowcolorsSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup windowcolors case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyState(parsed, entry);
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
    verifyState(game, entry);
}

export async function runStartupWindowcolorsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup window colors to iflags and diagnostics',
            recipe: loadStartupWindowcolorsRecipe(),
        }],
        summaryLabel: 'STARTUP WINDOW COLORS',
        verifySegment: verifyStartupWindowcolorsSegment,
    });
}

runMatrixCli(import.meta.url, runStartupWindowcolorsMatrix, 'startup window colors');
