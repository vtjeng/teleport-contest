#!/usr/bin/env node

// Record and replay options.c optfn_soundlib() from configuration parsing
// through sounds.c activate_chosen_soundlib() and #optionsfull.  The recorder
// build compiles only the built-in nosound interface, so every unknown or
// case-changed name silently selects that same interface.

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

export const STARTUP_SOUNDLIB_CASES = Object.freeze([
    Object.freeze({
        label: 'exact nosound selection reaches optionsfull',
        seed: 7331231,
        datetime: '20360422133100',
        nethackrc: startupRc('Soundexact', 'soundlib:nosound'),
        moves: OPEN_FULL_OPTIONS_MENU,
        errors: 0,
        optionsfull: true,
    }),
    Object.freeze({
        label: 'fallback, duplicates, and missing forms preserve nosound',
        seed: 7331245,
        datetime: '20360422134500',
        nethackrc: startupRc(
            'Soundfallback', 'soundlib:nosound',
            'soundlib:example,soundlib:NoSound',
            ...Array(4).fill('soundlib'),
            ...Array(4).fill('soundlib:'),
        ),
        moves: '\n',
        // Eighteen messages fill the raw terminal and push
        // config_error_done()'s unknowable absolute rc path above it.
        errors: 18,
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

export function loadStartupSoundlibRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SOUNDLIB_CASES.map(segmentFor),
    }, 'startup soundlib recipe');
}

function caseFor(segment) {
    return STARTUP_SOUNDLIB_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function soundlibState(state) {
    return [
        state.gc?.chosen_soundlib,
        state.ga?.active_soundlib,
    ];
}

function soundlibValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        ({ text }) => text.trim().startsWith('soundlib '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupSoundlibSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup soundlib case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (JSON.stringify(soundlibState(parsed)) !== JSON.stringify([0, 0]))
        throw new Error(`${entry.label} parsed into the wrong soundlib fields`);
    if (parsed.flags.soundlib !== undefined)
        throw new Error(`${entry.label} retained raw soundlib text`);
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
    if (JSON.stringify(soundlibState(game)) !== JSON.stringify([0, 0]))
        throw new Error(`${entry.label} activated the wrong soundlib`);
    if (entry.optionsfull && soundlibValue(game) !== 'nosound')
        throw new Error(`${entry.label} showed the wrong optionsfull value`);
}

export async function runStartupSoundlibMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup soundlib to activation and optionsfull',
            recipe: loadStartupSoundlibRecipe(),
        }],
        summaryLabel: 'STARTUP SOUNDLIB',
        verifySegment: verifyStartupSoundlibSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupSoundlibMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup soundlib: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
