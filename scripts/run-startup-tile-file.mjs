#!/usr/bin/env node

// Record and replay options.c optfn_tile_file() from startup configuration
// through the iflags pointer jsmain.js installs on the running game.  Unix
// TTY advertises no WC_TILE_FILE, so tile loading and rendering are outside
// this matrix.

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

export const STARTUP_TILE_FILE_CASES = Object.freeze([
    Object.freeze({
        label: 'nonempty value reaches installed iflags exactly',
        seed: 7331393,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Tilevalue', 'TiLe_FiLe:survey-tiles.xpm',
        ),
        moves: ' ',
        expected: 'survey-tiles.xpm',
        errors: 0,
    }),
    Object.freeze({
        label: 'empty value silently preserves the null default',
        seed: 7331393,
        datetime: '20360425131100',
        nethackrc: startupRc('Tileempty', 'tile_file:'),
        moves: ' ',
        expected: null,
        errors: 0,
    }),
    Object.freeze({
        label: 'missing and empty values preserve a prior file',
        seed: 7331393,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Tilepreserve',
            'tile_file:prior.xpm',
            ...Array(16).fill('tile_file:'),
        ),
        moves: '\n',
        expected: 'prior.xpm',
        errors: 16,
    }),
    Object.freeze({
        label: 'duplicates apply right to left and then by later line',
        seed: 7331393,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Tileduplicates',
            'tile_file:left.xpm,tile_file:right.xpm',
            ...Array(15).fill('tile_file:later.xpm'),
        ),
        moves: '\n',
        expected: 'later.xpm',
        errors: 16,
    }),
    Object.freeze({
        label: 'generic negation rejection preserves a prior file',
        seed: 7331393,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Tilenegation',
            'tile_file:prior.xpm',
            ...Array(8).fill('!tile_file:ignored.xpm'),
        ),
        moves: '\n',
        expected: 'prior.xpm',
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

export function loadStartupTileFileRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_TILE_FILE_CASES.map(segmentFor),
    }, 'startup tile_file recipe');
}

function caseFor(segment) {
    return STARTUP_TILE_FILE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function tileFile(state) {
    return state.iflags?.wc_tile_file ?? null;
}

export async function verifyStartupTileFileSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup tile_file case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (tileFile(parsed) !== entry.expected
        || parsed.flags.tile_file !== undefined) {
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
    if (tileFile(game) !== entry.expected
        || game.flags.tile_file !== undefined) {
        throw new Error(`${entry.label} installed the wrong iflags field`);
    }
}

export async function runStartupTileFileMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup tile file to iflags and diagnostics',
            recipe: loadStartupTileFileRecipe(),
        }],
        summaryLabel: 'STARTUP TILE FILE',
        verifySegment: verifyStartupTileFileSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupTileFileMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup tile file: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
