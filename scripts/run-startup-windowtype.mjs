#!/usr/bin/env node

// Record and replay options.c optfn_windowtype() through windows.c
// choose_windows() for the recorder's Unix TTY build. Configuration keeps the
// requested spelling in gc.chosen_windowtype while the sole active interface
// remains tty, including after a rejected name.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { allopt } from '../js/optlist_data.js';
import { runSegment } from '../js/jsmain.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

export const STARTUP_WINDOWTYPE_CASES = Object.freeze([
    Object.freeze({
        label: 'case-insensitive TTY reaches the running gc buffer',
        seed: 7331397,
        datetime: '20360425131100',
        nethackrc: startupRc('Windowtty', 'windowtype:TtY'),
        moves: ' ',
        expected: 'TtY',
        errors: 0,
    }),
    Object.freeze({
        label: 'unknown name reports the sole choice and retains active TTY',
        seed: 7331396,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowbad',
            ...Array(16).fill('windowtype:zqxj'),
        ),
        moves: '\n',
        expected: 'zqxj',
        errors: 31,
    }),
    Object.freeze({
        label: 'missing and empty values preserve the preceding choice',
        seed: 7331397,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowempty',
            'windowtype:TTY',
            ...Array(8).fill('windowtype'),
            ...Array(8).fill('windowtype:'),
        ),
        moves: '\n',
        expected: 'TTY',
        errors: 32,
    }),
    Object.freeze({
        label: 'negation and duplicates preserve source precedence',
        seed: 7331397,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Windowprecedence',
            'windowtype:TtY,windowtype:TTY',
            ...Array(8).fill('!windowtype:zqxj'),
            'windowtype:tty',
        ),
        moves: '\n',
        expected: 'tty',
        errors: 18,
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

export function loadStartupWindowtypeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_WINDOWTYPE_CASES.map(segmentFor),
    }, 'startup windowtype recipe');
}

function caseFor(segment) {
    return STARTUP_WINDOWTYPE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function chosenWindowtype(state) {
    return state.gc?.chosen_windowtype;
}

function activeWindowtype(state) {
    const option = allopt.find(({ name }) => name === 'windowtype');
    return optionValue(state, option, {});
}

export async function verifyStartupWindowtypeSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup windowtype case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (chosenWindowtype(parsed) !== entry.expected
        || activeWindowtype(parsed) !== 'tty'
        || parsed.flags.windowtype !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong window state`);
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
    if (chosenWindowtype(game) !== entry.expected
        || activeWindowtype(game) !== 'tty'
        || game.flags.windowtype !== undefined) {
        throw new Error(`${entry.label} installed the wrong window state`);
    }
}

export async function runStartupWindowtypeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup windowtype to config diagnostics',
            recipe: loadStartupWindowtypeRecipe(),
        }],
        summaryLabel: 'STARTUP WINDOWTYPE',
        verifySegment: verifyStartupWindowtypeSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupWindowtypeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup windowtype: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
