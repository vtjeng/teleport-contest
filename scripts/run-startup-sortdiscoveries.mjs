#!/usr/bin/env node

// Record and replay options.c optfn_sortdiscoveries() from configuration-file
// startup through o_init.c dodiscovered(), the real `\`/known command.  The
// passing matrix selects only discovery order; the checked-in deferred recipe
// preserves the first sorted-output case at the next behavior boundary.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 6382175;
const DATETIME = '20360819091500';
const KNOWN_AND_CLOSE = '\\ .';
const ERROR_REPEAT_COUNT = 22;

function repeated(spelling) {
    return Array(ERROR_REPEAT_COUNT).fill(`OPTIONS=${spelling}`);
}

// Reporting cases fill the 24-row terminal before config_error_done() names
// the recorder's absolute configuration path.  One Enter dismisses the error
// report, after which `\` opens the discoveries window and Space closes it.
export const STARTUP_SORTDISCOVERIES_CASES = Object.freeze([
    Object.freeze({
        label: 'numeric discovery order',
        optionLines: Object.freeze(['OPTIONS=sortdiscoveries:0-tail']),
        expected: 'o',
    }),
    Object.freeze({
        label: 'letter discovery order',
        optionLines: Object.freeze(['OPTIONS=sortdiscoveries:Order-tail']),
        expected: 'o',
    }),
    Object.freeze({
        label: 'negated value resets prior selection',
        optionLines: Object.freeze([
            'OPTIONS=sortdiscoveries:3',
            ...repeated('!sortdiscoveries:zqxj'),
        ]),
        expected: 'o',
        reports: true,
    }),
    Object.freeze({
        label: 'negated missing value reports then resets',
        optionLines: Object.freeze([
            'OPTIONS=sortdiscoveries:3',
            ...repeated('!sortdiscoveries'),
        ]),
        expected: 'o',
        reports: true,
    }),
    Object.freeze({
        label: 'unknown parameter reports and startup continues',
        optionLines: Object.freeze(repeated('sortdiscoveries:zqxj')),
        expected: 'o',
        reports: true,
    }),
]);

// This one case sits immediately outside the slice: parsing reaches `s`, and
// the known command stops at o_init.c disco_output_sorted().  Keeping replay
// inputs here makes the next slice reproducible without admitting expected
// failure into the passing fresh matrix.
export const SORTED_DISCOVERIES_DEFERRED_CASE = Object.freeze({
    label: 'sortloot discovery order',
    optionLines: Object.freeze(['OPTIONS=sortdiscoveries:1-tail']),
    expected: 's',
});

function nethackrc(entry) {
    return [
        'OPTIONS=name:DiscoSort,role:Healer,race:human,gender:female,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...entry.optionLines,
        '',
    ].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        moves: `${entry.reports ? '\n' : ''}${KNOWN_AND_CLOSE}`,
    };
}

export function loadStartupSortdiscoveriesRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SORTDISCOVERIES_CASES.map(segmentFor),
    }, 'startup sortdiscoveries recipe');
}

export function loadSortedDiscoveriesDeferredRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [segmentFor(SORTED_DISCOVERIES_DEFERRED_CASE)],
    }, 'sorted discoveries deferred recipe');
}

function caseFor(segment) {
    const found = STARTUP_SORTDISCOVERIES_CASES.find(
        (entry) => segmentFor(entry).nethackrc === segment.nethackrc
            && segmentFor(entry).moves === segment.moves,
    );
    if (!found) throw new Error('no startup sortdiscoveries case owns segment');
    return found;
}

function visibleRows() {
    return game.nhDisplay.grid.map(
        (row) => row.map(({ ch }) => ch).join('').trim(),
    );
}

export async function verifyStartupSortdiscoveriesSegment(segment) {
    const entry = caseFor(segment);
    const throughKnown = segment.moves.indexOf('\\') + 1;
    let boundary = null;
    await runSegment({
        ...segment,
        moves: segment.moves.slice(0, throughKnown),
    }, { onBoundary: (error) => { boundary = error; } });
    if (boundary) throw boundary;
    if (game.flags.discosort !== entry.expected) {
        throw new Error(
            `${entry.label} stored ${game.flags.discosort}, not `
                + `${entry.expected}`,
        );
    }
    const heading = 'Discoveries, by order of discovery within each class';
    if (!visibleRows().includes(heading)) {
        throw new Error(`${entry.label} did not render the known heading`);
    }
}

export async function runStartupSortdiscoveriesMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup sortdiscoveries to known',
            recipe: loadStartupSortdiscoveriesRecipe(),
        }],
        summaryLabel: 'STARTUP SORTDISCOVERIES',
        verifySegment: verifyStartupSortdiscoveriesSegment,
    });
}

runMatrixCli(import.meta.url, runStartupSortdiscoveriesMatrix, 'startup sortdiscoveries');
