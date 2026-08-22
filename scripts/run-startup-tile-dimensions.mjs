#!/usr/bin/env node

// Record and replay options.c optfn_tile_height() and optfn_tile_width()
// from configuration-file parsing through the fields jsmain.js installs on
// the running game.  TTY advertises neither window capability, so
// #optionsfull deliberately hides both rows.

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

const REJECTED_TILE_DIMENSIONS = Object.freeze([
    'tile_height',
    'tile_height',
    'tile_width:',
    'tile_width:',
    '!tile_height:12',
    '!tile_height:12',
    '!tile_width:12',
    '!tile_width:12',
]);

export const STARTUP_TILE_DIMENSION_CASES = Object.freeze([
    Object.freeze({
        label: 'signed tile dimensions reach installed iflags',
        seed: 7331217,
        datetime: '20360423122500',
        nethackrc: startupRc(
            'Tilesigned',
            'tile_height:-17tail,tile_width:+23suffix',
        ),
        moves: ' ',
        expected: Object.freeze([-17, 23]),
        errors: 0,
    }),
    Object.freeze({
        label: 'empty-valued negations reset tile dimensions',
        seed: 7331221,
        datetime: '20360423122900',
        nethackrc: startupRc(
            'Tilereset',
            '!tile_height:,!tile_width=',
        ),
        moves: ' ',
        expected: Object.freeze([0, 0]),
        errors: 0,
    }),
    Object.freeze({
        label: 'rejected tile dimensions preserve preceding settings',
        seed: 7331223,
        datetime: '20360423123100',
        nethackrc: startupRc(
            'Tileerrors',
            'tile_height:17,tile_width:19',
            ...REJECTED_TILE_DIMENSIONS,
        ),
        moves: '\n',
        expected: Object.freeze([17, 19]),
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

export function loadStartupTileDimensionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_TILE_DIMENSION_CASES.map(segmentFor),
    }, 'startup tile dimensions recipe');
}

function caseFor(segment) {
    return STARTUP_TILE_DIMENSION_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function tileDimensions(state) {
    return [
        state.iflags?.wc_tile_height,
        state.iflags?.wc_tile_width,
    ];
}

function sameDimensions(actual, expected) {
    return actual[0] === expected[0] && actual[1] === expected[1];
}

export async function verifyStartupTileDimensionsSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup tile-dimension case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (!sameDimensions(tileDimensions(parsed), entry.expected)
        || parsed.flags.tile_height !== undefined
        || parsed.flags.tile_width !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong iflags fields`);
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
    if (!sameDimensions(tileDimensions(game), entry.expected)) {
        throw new Error(`${entry.label} installed the wrong iflags fields`);
    }
}

export async function runStartupTileDimensionsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup tile dimensions to iflags and diagnostics',
            recipe: loadStartupTileDimensionsRecipe(),
        }],
        summaryLabel: 'STARTUP TILE DIMENSIONS',
        verifySegment: verifyStartupTileDimensionsSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupTileDimensionsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup tile dimensions: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
