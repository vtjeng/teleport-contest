#!/usr/bin/env node

// Record and replay options.c optfn_whatis_filter() from configuration-file
// parsing through iflags.getloc_filter and #optionsfull. Each menu case gets a
// separate recipe because recording stops while the live menu owns the tty.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    GFILTER_AREA,
    GFILTER_NONE,
    GFILTER_VIEW,
} from '../js/const.js';
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

export const STARTUP_WHATIS_FILTER_CASES = Object.freeze([
    Object.freeze({
        label: 'none initial reaches optionsfull',
        seed: 7331271,
        datetime: '20360424125100',
        nethackrc: startupRc('Filternone', 'whatis_filter:nonsense'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: GFILTER_NONE,
        shown: 'none',
        errors: 0,
    }),
    Object.freeze({
        label: 'view initial reaches optionsfull',
        seed: 7331273,
        datetime: '20360424125300',
        nethackrc: startupRc('Filterview', 'whatis_filter:Verbose'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: GFILTER_VIEW,
        shown: 'view',
        errors: 0,
    }),
    Object.freeze({
        label: 'area initial reaches optionsfull',
        seed: 7331277,
        datetime: '20360424125700',
        nethackrc: startupRc('Filterarea', 'whatis_filter:aardvark'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: GFILTER_AREA,
        shown: 'area',
        errors: 0,
    }),
    Object.freeze({
        label: 'negation ignores its parameter before optionsfull',
        seed: 7331279,
        datetime: '20360424125900',
        nethackrc: startupRc('Filternegated', '!whatis_filter:bogus'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: GFILTER_NONE,
        shown: 'none',
        errors: 0,
    }),
    Object.freeze({
        label: 'invalid and missing values preserve the preceding filter',
        seed: 7331281,
        datetime: '20360424130100',
        nethackrc: startupRc(
            'Filtererrors',
            'whatis_filter:view',
            ...Array(4).fill('whatis_filter'),
            ...Array(4).fill('whatis_filter:zqxj'),
        ),
        // Sixteen reports fill the raw terminal and move the unknowable
        // absolute configuration path above the visible screen.
        moves: '\n',
        expected: GFILTER_VIEW,
        shown: null,
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

export function loadStartupWhatisFilterRecipes() {
    return STARTUP_WHATIS_FILTER_CASES.map((entry) => ({
        label: entry.label,
        recipe: validateCleanRecipe({
            version: 5,
            segments: [segmentFor(entry)],
        }, `startup whatis_filter: ${entry.label}`),
    }));
}

function caseFor(segment) {
    return STARTUP_WHATIS_FILTER_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function whatisFilterValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        ({ text }) => text.trim().startsWith('whatis_filter '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupWhatisFilterSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup whatis_filter case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.iflags.getloc_filter !== entry.expected
        || parsed.flags.whatis_filter !== undefined) {
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
    if (game.iflags.getloc_filter !== entry.expected)
        throw new Error(`${entry.label} installed the wrong filter`);
    if (entry.shown && whatisFilterValue(game) !== entry.shown)
        throw new Error(`${entry.label} showed the wrong optionsfull value`);
}

export async function runStartupWhatisFilterMatrix() {
    return runFreshMatrix({
        entries: loadStartupWhatisFilterRecipes(),
        summaryLabel: 'STARTUP WHATIS FILTER',
        verifySegment: verifyStartupWhatisFilterSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupWhatisFilterMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup whatis_filter: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
