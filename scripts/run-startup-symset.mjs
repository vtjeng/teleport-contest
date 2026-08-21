#!/usr/bin/env node

// Record and replay options.c optfn_symset(do_set), files.c read_sym_file(),
// and symbols.c clear_symsetentry()/switch_symbols() from startup parsing
// through the first map and #optionsfull.  The ordering cases preserve C's
// right-to-left OPTIONS recursion and its failure quirk: cleanup does not undo
// an earlier valid byte table or SYMBOLS override.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { H_DEC, H_UNK, PRIMARYSET } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems } from '../js/options.js';
import { cmap_symbol, S_vwall } from '../js/symbols.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 5319071;
const DATETIME = '20390914121500';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';
const ERROR_REPEAT_COUNT = 12;
const INVALID = 'NoSuchSymbols';

function repeated(line) {
    return Object.freeze(Array(ERROR_REPEAT_COUNT).fill(line));
}

export const STARTUP_SYMSET_CASES = Object.freeze([
    Object.freeze({
        label: 'bundled primary set',
        optionLines: Object.freeze(['OPTIONS=symset:DECgraphics']),
        expectedName: 'DECgraphics',
        expectedHandling: H_DEC,
        expectedWall: Object.freeze({ ch: 'x', dec: true }),
        expectedMenu: 'DECgraphics, active, handler=DEC',
    }),
    Object.freeze({
        label: 'default symbols alias',
        optionLines: Object.freeze(['OPTIONS=symset:Default-symbols']),
        expectedName: null,
        expectedHandling: H_UNK,
        expectedWall: Object.freeze({ ch: '|', dec: false }),
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'invalid selection keeps default map',
        optionLines: repeated(`OPTIONS=symset:${INVALID}`),
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedWall: Object.freeze({ ch: '|', dec: false }),
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'invalid selection before valid selection',
        // parseoptions() evaluates the right-hand value first.
        optionLines: repeated(
            `OPTIONS=symset:DECgraphics,symset:${INVALID}`,
        ),
        reports: true,
        expectedName: 'DECgraphics',
        expectedHandling: H_DEC,
        expectedWall: Object.freeze({ ch: 'x', dec: true }),
        expectedMenu: 'DECgraphics, active, handler=DEC',
    }),
    Object.freeze({
        label: 'invalid selection after valid selection',
        // The failed left-hand value clears metadata but keeps DEC's bytes.
        optionLines: repeated(
            `OPTIONS=symset:${INVALID},symset:DECgraphics`,
        ),
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedWall: Object.freeze({ ch: 'x', dec: true }),
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'SYMBOLS override before invalid selection',
        optionLines: Object.freeze([
            'SYMBOLS=S_vwall:!',
            ...repeated(`OPTIONS=symset:${INVALID}`),
        ]),
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedWall: Object.freeze({ ch: '!', dec: false }),
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'SYMBOLS override after invalid selection',
        optionLines: Object.freeze([
            ...repeated(`OPTIONS=symset:${INVALID}`),
            'SYMBOLS=S_vwall:!',
        ]),
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedWall: Object.freeze({ ch: '!', dec: false }),
        expectedMenu: 'default',
    }),
]);

function nethackrc(entry) {
    return [
        'OPTIONS=name:Symcheck,role:Healer,race:human,gender:male,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:none',
        ...entry.optionLines,
        '',
    ].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        moves: `${entry.reports ? '\n' : ''}`
            + OPEN_AND_DISMISS_FULL_OPTIONS,
    };
}

export function loadStartupSymsetRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SYMSET_CASES.map(segmentFor),
    }, 'startup symset recipe');
}

function caseFor(segment) {
    return STARTUP_SYMSET_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function symsetMenuValue(items) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith('symset '),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

export async function verifyStartupSymsetSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup symset case owns segment');
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;

    const selected = game.gs.symset[PRIMARYSET];
    if (selected.name !== entry.expectedName
        || selected.handling !== entry.expectedHandling) {
        throw new Error(
            `${entry.label} kept ${selected.name}/${selected.handling}, not `
                + `${entry.expectedName}/${entry.expectedHandling}`,
        );
    }
    const wall = cmap_symbol(S_vwall, game);
    if (JSON.stringify(wall) !== JSON.stringify(entry.expectedWall)) {
        throw new Error(
            `${entry.label} rendered ${JSON.stringify(wall)}, not `
                + JSON.stringify(entry.expectedWall),
        );
    }
    const items = dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const menuValue = symsetMenuValue(items);
    if (menuValue !== entry.expectedMenu) {
        throw new Error(
            `${entry.label} reported ${menuValue}, not ${entry.expectedMenu}`,
        );
    }
}

export async function runStartupSymsetMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup primary symset to map and optionsfull',
            recipe: loadStartupSymsetRecipe(),
        }],
        summaryLabel: 'STARTUP SYMSET',
        verifySegment: verifyStartupSymsetSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupSymsetMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup symset: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
