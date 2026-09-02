#!/usr/bin/env node

// Record and replay options.c optfn_menustyle() from the configuration-file
// parser through doset()'s value column.  Every segment opens the full options
// menu and walks all its pages, making flags.menu_style visible without
// entering pickup.c's separate traditional object-selection interface.

import {
    MENU_COMBINATION,
    MENU_FULL,
    MENU_PARTIAL,
    MENU_TRADITIONAL,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 8472103;
const DATETIME = '20350723104500';
const OPEN_FULL_OPTIONS_MENU = ' mO      ';
const ERROR_REPEAT_COUNT = 8;

function repeated(spelling) {
    return Array(ERROR_REPEAT_COUNT).fill(spelling);
}

// The repeated error cases deliberately push config_error_done()'s summary
// below the 24-row terminal. C names the recorder's absolute configuration
// path there, while runSegment() can know only ".nethackrc"; all handler
// reports and the menu state remain visible and compare strictly.
export const STARTUP_MENUSTYLE_CASES = Object.freeze([
    Object.freeze({
        label: 'traditional first character',
        spellings: ['menustyle:traditional-tail'],
        expected: MENU_TRADITIONAL,
    }),
    Object.freeze({
        label: 'combination first character',
        spellings: ['menustyle:Combination-tail'],
        expected: MENU_COMBINATION,
    }),
    Object.freeze({
        label: 'partial first character',
        spellings: ['menustyle:Partial-tail'],
        expected: MENU_PARTIAL,
    }),
    Object.freeze({
        label: 'unknown first character',
        spellings: repeated('menustyle:zqxj'),
        expected: MENU_FULL,
        reports: true,
    }),
    Object.freeze({
        label: 'missing full-name value',
        spellings: repeated('menustyle'),
        expected: MENU_FULL,
        reports: true,
    }),
    Object.freeze({
        label: 'empty full-name value',
        spellings: repeated('menustyle:'),
        expected: MENU_FULL,
        reports: true,
    }),
    Object.freeze({
        label: 'negated missing value',
        spellings: ['!menustyle'],
        expected: MENU_TRADITIONAL,
    }),
    Object.freeze({
        label: 'five-byte bare abbreviation',
        spellings: ['menus'],
        expected: MENU_FULL,
    }),
    Object.freeze({
        label: 'negated abbreviation with value',
        spellings: ['!menus:partial-tail'],
        expected: MENU_PARTIAL,
    }),
]);

function nethackrc(spellings) {
    return [
        'OPTIONS=name:Stylecheck,role:Ranger,race:human,gender:male,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:bold',
        ...spellings.map((spelling) => `OPTIONS=${spelling}`),
        '',
    ].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry.spellings),
        moves: (entry.reports ? '\n' : '') + OPEN_FULL_OPTIONS_MENU,
    };
}

export function loadStartupMenustyleRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MENUSTYLE_CASES.map(segmentFor),
    }, 'startup menustyle recipe');
}

function caseFor(segment) {
    const found = STARTUP_MENUSTYLE_CASES.find(
        (entry) => segmentFor(entry).nethackrc === segment.nethackrc
            && segmentFor(entry).moves === segment.moves,
    );
    if (!found) throw new Error('no startup menustyle case owns the segment');
    return found;
}

export async function verifyStartupMenustyleSegment(segment) {
    const entry = caseFor(segment);
    let boundary = null;
    await runSegment(
        { ...segment },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
    if (game.flags.menu_style !== entry.expected) {
        throw new Error(
            `${entry.label} stored ${game.flags.menu_style}, not `
            + `${entry.expected}`,
        );
    }
}

export async function runStartupMenustyleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup menustyle parser',
            recipe: loadStartupMenustyleRecipe(),
        }],
        summaryLabel: 'STARTUP MENUSTYLE',
        verifySegment: verifyStartupMenustyleSegment,
    });
}

runMatrixCli(import.meta.url, runStartupMenustyleMatrix, 'startup menustyle');
