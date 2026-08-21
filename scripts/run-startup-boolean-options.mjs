#!/usr/bin/env node

// Record and replay options.c optfn_boolean() from configuration-file writes
// through the `O` and `#optionsfull` value columns.  The cases use generated
// addresses from all four live owners and the startup-only post-write arms.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 6742109;
const DATETIME = '20010314153000';
const SIMPLE_MENU = ' O  \x1b';
const FULL_MENU = ' mO       \x1b';

const BASE_RC = Object.freeze([
    'OPTIONS=name:Boolwright,role:Healer,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    // This matrix measures Boolean value cells.  Plain menu headings keep an
    // existing leading-space attribute discrepancy out of that measurement.
    'OPTIONS=pettype:none,!acoustics,menu_headings:none',
]);

export const STARTUP_BOOLEAN_CASES = Object.freeze([
    Object.freeze({
        label: 'simple-menu address writes',
        optionLines: Object.freeze([
            'OPTIONS=price_quotes,!autoopen,autopickup,!dropped_nopick,'
                + '!fireassist,pushweapon,showexp,time',
        ]),
        moves: SIMPLE_MENU,
        values: Object.freeze({
            'flags.autoopen': false,
            'flags.pickup': true,
            'flags.nopick_dropped': false,
            'flags.pushweapon': true,
            'flags.showexp': true,
            'flags.time': true,
            'iflags.fireassist': false,
            'iflags.pricequotes': true,
        }),
        absentFlags: Object.freeze([
            'autopickup', 'dropped_nopick', 'fireassist', 'price_quotes',
        ]),
    }),
    Object.freeze({
        label: 'optionsfull address writes',
        optionLines: Object.freeze([
            'OPTIONS=accessiblemsg,autodescribe,!fixinv,!mail,!travel,pauper',
        ]),
        moves: FULL_MENU,
        values: Object.freeze({
            'a11y.accessiblemsg': true,
            'flags.biff': false,
            'flags.invlet_constant': false,
            'flags.travelcmd': false,
            'iflags.autodescribe': true,
            'u.uroleplay.nudist': true,
            'u.uroleplay.pauper': true,
        }),
        absentFlags: Object.freeze([
            'accessiblemsg', 'autodescribe', 'fixinv', 'mail', 'travel',
        ]),
    }),
    Object.freeze({
        label: 'startup map and pet post-writes',
        optionLines: Object.freeze([
            'OPTIONS=petattr:none',
            'OPTIONS=hilite_pet,tiled_map',
        ]),
        moves: SIMPLE_MENU,
        values: Object.freeze({
            'iflags.wc_ascii_map': true,
            'iflags.wc_hilite_pet': true,
            'iflags.wc_tiled_map': false,
            'iflags.wc2_petattr': 1,
        }),
        absentFlags: Object.freeze(['hilite_pet', 'tiled_map']),
    }),
    Object.freeze({
        label: 'unsupported idle checkpoint',
        optionLines: Object.freeze(['OPTIONS=idlecheckpoint']),
        moves: FULL_MENU,
        values: Object.freeze({
            'iflags.idlecheckpoint': false,
        }),
        absentFlags: Object.freeze(['idlecheckpoint']),
    }),
]);

// The first matrix run kept the default inverse menu-heading style and hit
// QUALITY.json's existing "an indented inverse menu heading cannot match"
// judge-boundary deferral at row 5, column 2.  Preserve those original inputs
// here, while the passing matrix uses plain headings to isolate Boolean cells.
export const STARTUP_BOOLEAN_HEADING_CEILING_SEGMENT = Object.freeze({
    seed: SEED,
    datetime: DATETIME,
    nethackrc: [
        BASE_RC[0],
        BASE_RC[1],
        'OPTIONS=pettype:none,!acoustics',
        ...STARTUP_BOOLEAN_CASES[0].optionLines,
        '',
    ].join('\n'),
    moves: SIMPLE_MENU,
});

function nethackrc(entry) {
    return [...BASE_RC, ...entry.optionLines, ''].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        moves: entry.moves,
    };
}

export function loadStartupBooleanOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_BOOLEAN_CASES.map(segmentFor),
    }, 'startup boolean options recipe');
}

function caseFor(segment) {
    const entry = STARTUP_BOOLEAN_CASES.find((candidate) => {
        const expected = segmentFor(candidate);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
    if (!entry) throw new Error('no startup boolean-options case owns segment');
    return entry;
}

function valueAtPath(root, path) {
    return path.split('.').reduce((owner, field) => owner?.[field], root);
}

function assertValues(root, entry, phase) {
    for (const [path, expected] of Object.entries(entry.values)) {
        const actual = valueAtPath(root, path);
        if (actual !== expected) {
            throw new Error(
                `${entry.label} ${phase} stored ${path}=${actual}, not `
                    + `${expected}`,
            );
        }
    }
    for (const name of entry.absentFlags) {
        if (Object.hasOwn(root.flags, name)) {
            throw new Error(
                `${entry.label} ${phase} retained stale flags.${name}`,
            );
        }
    }
}

export async function verifyStartupBooleanOptionsSegment(segment) {
    const entry = caseFor(segment);
    const parsed = parseNethackrc(segment.nethackrc);
    // parseNethackrc() precedes initoptions_finish()'s tty map fallback, so
    // the map case is checked only after runSegment() installs and finishes
    // the options.  Every other case has its final value during the parse.
    if (entry.label !== 'startup map and pet post-writes') {
        assertValues({ ...parsed, u: { uroleplay: parsed.uroleplay } }, entry,
            'parse');
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    assertValues(game, entry, 'startup');
}

export async function runStartupBooleanOptionsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup boolean options to menus',
            recipe: loadStartupBooleanOptionsRecipe(),
        }],
        summaryLabel: 'STARTUP BOOLEAN OPTIONS',
        verifySegment: verifyStartupBooleanOptionsSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupBooleanOptionsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup boolean options: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
