#!/usr/bin/env node

// Record and replay options.c optfn_roguesymset(do_set), files.c
// read_sym_file(), and symbols.c clear_symsetentry() from startup parsing
// through configuration diagnostics and #optionsfull. The ordering cases pin
// the source quirk where a failed replacement clears metadata without
// restoring Rogue bytes loaded by an earlier success.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { H_DEC, H_IBM, H_UNK, ROGUESET } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { S_vwall } from '../js/symbols.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 8653107;
const DATETIME = '20410423173500';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';
const ERROR_REPEAT_COUNT = 12;

function repeated(line) {
    return Object.freeze(Array(ERROR_REPEAT_COUNT).fill(line));
}

function startupRc(name, optionLines) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:none',
        ...optionLines,
        '',
    ].join('\n');
}

export const STARTUP_ROGUESYMSET_CASES = Object.freeze([
    Object.freeze({
        label: 'missing value is silent',
        optionLines: Object.freeze(['OPTIONS=roguesymset']),
        errors: 0,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedNoColor: 1,
        expectedPrimary: 0,
        expectedRogue: 0,
        expectedExplicitly: false,
        expectedSymsetChanged: false,
        expectedWall: 0x7C,
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'empty value is silent',
        optionLines: Object.freeze(['OPTIONS=roguesymset:']),
        errors: 0,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedNoColor: 1,
        expectedPrimary: 0,
        expectedRogue: 0,
        expectedExplicitly: false,
        expectedSymsetChanged: false,
        expectedWall: 0x7C,
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'RogueIBM selection reaches optionsfull',
        optionLines: Object.freeze(['OPTIONS=roguesymset:RogueIBM']),
        errors: 0,
        expectedName: 'RogueIBM',
        expectedHandling: H_IBM,
        expectedNoColor: 1,
        expectedPrimary: 0,
        expectedRogue: 1,
        expectedExplicitly: true,
        expectedSymsetChanged: true,
        expectedWall: 0xBA,
        expectedMenu: 'RogueIBM',
    }),
    Object.freeze({
        label: 'primary restriction does not reject config selection',
        optionLines: Object.freeze(['OPTIONS=roguesymset:DECgraphics']),
        errors: 0,
        expectedName: 'DECgraphics',
        expectedHandling: H_DEC,
        expectedNoColor: 1,
        expectedPrimary: 1,
        expectedRogue: 0,
        expectedExplicitly: true,
        expectedSymsetChanged: true,
        expectedWall: 0xF8,
        expectedMenu: 'DECgraphics',
    }),
    Object.freeze({
        label: 'invalid zqxj reports and resumes startup',
        optionLines: repeated('OPTIONS=roguesymset:zqxj'),
        errors: 23,
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedNoColor: 0,
        expectedPrimary: 0,
        expectedRogue: 0,
        expectedExplicitly: false,
        expectedSymsetChanged: false,
        expectedWall: 0x7C,
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'invalid suffix clears before valid left selection',
        optionLines: repeated(
            'OPTIONS=roguesymset:RogueIBM,roguesymset:zqxj',
        ),
        errors: 35,
        reports: true,
        expectedName: 'RogueIBM',
        expectedHandling: H_IBM,
        expectedNoColor: 1,
        expectedPrimary: 0,
        expectedRogue: 1,
        expectedExplicitly: true,
        expectedSymsetChanged: true,
        expectedWall: 0xBA,
        expectedMenu: 'RogueIBM',
    }),
    Object.freeze({
        label: 'invalid left replacement clears metadata but keeps bytes',
        optionLines: repeated(
            'OPTIONS=roguesymset:zqxj,roguesymset:RogueIBM',
        ),
        errors: 35,
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedNoColor: 0,
        expectedPrimary: 0,
        expectedRogue: 0,
        expectedExplicitly: false,
        expectedSymsetChanged: true,
        expectedWall: 0xBA,
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'fuzzy Default symbols selects the default set',
        optionLines: Object.freeze([
            'OPTIONS=roguesymset:Default---symbols',
        ]),
        errors: 0,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedNoColor: 0,
        expectedPrimary: 0,
        expectedRogue: 0,
        expectedExplicitly: true,
        expectedSymsetChanged: true,
        expectedWall: 0x7C,
        expectedMenu: 'default',
    }),
    Object.freeze({
        label: 'decorated bare default is rejected',
        optionLines: repeated('OPTIONS=roguesymset:d-e-f-a-u-l-t'),
        errors: 23,
        reports: true,
        expectedName: null,
        expectedHandling: H_UNK,
        expectedNoColor: 0,
        expectedPrimary: 0,
        expectedRogue: 0,
        expectedExplicitly: false,
        expectedSymsetChanged: false,
        expectedWall: 0x7C,
        expectedMenu: 'default',
    }),
]);

function segmentFor(entry, index) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: startupRc(`Roguesym${index + 1}`, entry.optionLines),
        moves: `${entry.reports ? '\n' : ''}`
            + OPEN_AND_DISMISS_FULL_OPTIONS,
    };
}

export function loadStartupRoguesymsetRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_ROGUESYMSET_CASES.map(segmentFor),
    }, 'startup roguesymset recipe');
}

function caseFor(segment) {
    return STARTUP_ROGUESYMSET_CASES.find((entry, index) => {
        const expected = segmentFor(entry, index);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function roguesymsetMenuValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith('roguesymset '),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

function assertState(label, state, entry) {
    const selected = state.gs.symset[ROGUESET];
    const actual = [
        selected.name,
        selected.handling,
        selected.nocolor,
        selected.primary,
        selected.rogue,
        selected.explicitly,
        state.gr.rogue_syms[S_vwall],
        roguesymsetMenuValue(state),
        state.go.opt_symset_changed,
    ];
    const expected = [
        entry.expectedName,
        entry.expectedHandling,
        entry.expectedNoColor,
        entry.expectedPrimary,
        entry.expectedRogue,
        entry.expectedExplicitly,
        entry.expectedWall,
        entry.expectedMenu,
        entry.expectedSymsetChanged,
    ];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `${label} installed ${JSON.stringify(actual)}, not `
                + JSON.stringify(expected),
        );
    }
}

export async function verifyStartupRoguesymsetSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup roguesymset case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }
    if (entry.expectedName === null && parsed.roguesymset !== undefined) {
        throw new Error(`${entry.label} left a parsed roguesymset value`);
    }
    for (const flag of [
        'opt_need_redraw', 'opt_need_glyph_reset', 'opt_symset_changed',
    ]) {
        if (parsed.go[flag] !== entry.expectedSymsetChanged) {
            throw new Error(
                `${entry.label} left parsed ${flag}=${parsed.go[flag]}`,
            );
        }
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    assertState(entry.label, game, entry);
}

export async function runStartupRoguesymsetMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup rogue symset to diagnostics and optionsfull',
            recipe: loadStartupRoguesymsetRecipe(),
        }],
        summaryLabel: 'STARTUP ROGUESYMSET',
        verifySegment: verifyStartupRoguesymsetSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupRoguesymsetMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup roguesymset: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
