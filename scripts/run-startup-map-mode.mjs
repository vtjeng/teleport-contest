#!/usr/bin/env node

// Record and replay options.c optfn_map_mode() from startup configuration
// through the iflags field jsmain.js installs. TTY advertises no WC_MAP_MODE,
// so the configured mode deliberately has no renderer or #optionsfull effect.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
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

const REJECTED_MAP_MODES = Object.freeze([
    'map_mode:zqxj',
    'map_mode',
    'map_mode:',
    '!map_mode',
    '!map_mode:tiles',
    'map_mode:tiles-tail',
    'map_mode:ascii4x',
    'map_mode: tiles',
]);

export const STARTUP_MAP_MODE_CASES = Object.freeze([
    Object.freeze({
        label: 'exact tiles mode reaches installed iflags',
        seed: 7331392,
        datetime: '20360425131100',
        nethackrc: startupRc('Maptiles', 'map_mode:TiLeS'),
        moves: ' ',
        expected: 0,
        errors: 0,
    }),
    Object.freeze({
        label: 'ASCII mode accepts case-insensitive trailing bytes',
        seed: 7331392,
        datetime: '20360425131100',
        nethackrc: startupRc('Mapascii', 'map_mode:AsCiI16x12-tail'),
        moves: ' ',
        expected: 7,
        errors: 0,
    }),
    Object.freeze({
        label: 'fit alias accepts trailing bytes',
        seed: 7331392,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Mapfit', 'map_mode:ascii_fit_to_screen-tail',
        ),
        moves: ' ',
        expected: 10,
        errors: 0,
    }),
    Object.freeze({
        label: 'tile fit mode keeps its distinct source value',
        seed: 7331392,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Maptilefit', 'map_mode:tiles_fit_to_screen-tail',
        ),
        moves: ' ',
        expected: 11,
        errors: 0,
    }),
    Object.freeze({
        label: 'missing invalid and negated values preserve installed state',
        seed: 7331392,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Maperrors',
            'map_mode:ascii12x16',
            ...REJECTED_MAP_MODES,
        ),
        moves: '\n',
        expected: 8,
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

export function loadStartupMapModeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MAP_MODE_CASES.map(segmentFor),
    }, 'startup map_mode recipe');
}

function caseFor(segment) {
    return STARTUP_MAP_MODE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function mapMode(state) {
    return state.iflags?.wc_map_mode;
}

export async function verifyStartupMapModeSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup map_mode case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (mapMode(parsed) !== entry.expected
        || parsed.flags.map_mode !== undefined) {
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
    if (mapMode(game) !== entry.expected
        || game.flags.map_mode !== undefined) {
        throw new Error(`${entry.label} installed the wrong iflags field`);
    }
}

export async function runStartupMapModeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup map mode to iflags and diagnostics',
            recipe: loadStartupMapModeRecipe(),
        }],
        summaryLabel: 'STARTUP MAP MODE',
        verifySegment: verifyStartupMapModeSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupMapModeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup map mode: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
