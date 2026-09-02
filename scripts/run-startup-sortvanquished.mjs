#!/usr/bin/env node

// Record and replay options.c optfn_sortvanquished() from configuration-file
// parsing through flags.vanq_sortmode and the live #optionsfull value.  Every
// ordinary case gets a separate segment because the options menu owns the tty
// while recording stops.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const OPEN_FULL_OPTIONS_MENU = ' mO      ';
const VANQORDERS = Object.freeze([
    Object.freeze(['t', 'traditional: by monster level']),
    Object.freeze(['d', 'by monster difficulty rating']),
    Object.freeze(['a', 'alphabetically, unique monsters separate']),
    Object.freeze(['A', 'alphabetically, unique monsters intermixed']),
    Object.freeze(['C', 'by monster class, high to low level in class']),
    Object.freeze(['c', 'by monster class, low to high level in class']),
    Object.freeze(['n', 'by count, high to low']),
    Object.freeze(['z', 'by count, low to high']),
]);

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

const LETTER_CASES = VANQORDERS.map(([letter], index) => Object.freeze({
    label: `letter ${letter} selects vanquished mode ${index}`,
    seed: 8294101 + index * 2,
    datetime: `20370518${String(901 + index * 2).padStart(4, '0')}00`,
    nethackrc: startupRc(`Vanqletter${index}`, `sortvanquished:${letter}tail`),
    moves: OPEN_FULL_OPTIONS_MENU,
    expected: index,
    errors: 0,
}));

const NUMERIC_CASES = VANQORDERS.map(([,], index) => Object.freeze({
    label: `numeric alias ${index} selects vanquished mode ${index}`,
    seed: 8294201 + index * 2,
    datetime: `20370518${String(1101 + index * 2).padStart(4, '0')}00`,
    nethackrc: startupRc(`Vanqnumeric${index}`, `sortvanquished:${index}suffix`),
    moves: OPEN_FULL_OPTIONS_MENU,
    expected: index,
    errors: 0,
}));

export const STARTUP_SORTVANQUISHED_CASES = Object.freeze([
    ...LETTER_CASES,
    ...NUMERIC_CASES,
    Object.freeze({
        label: 'diagnostics preserve or reset state before later precedence',
        seed: 8294301,
        datetime: '20370518130100',
        nethackrc: startupRc(
            'Vanqerrors',
            'sortvanquished:n',
            'sortvanquished',
            'sortvanquished:',
            'sortvanquished:qxj',
            'sortvanquished:T',
            '!sortvanquished',
            '!sortvanquished:',
            '!sortvanquished:bogus',
            '!sortvanquished:Aignored',
            'sortvanquished:a',
            'sortvanquished:C',
        ),
        moves: `\n${OPEN_FULL_OPTIONS_MENU}`,
        expected: 4,
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

export function loadStartupSortvanquishedRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SORTVANQUISHED_CASES.map(segmentFor),
    }, 'startup sortvanquished recipe');
}

function caseFor(segment) {
    return STARTUP_SORTVANQUISHED_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function sortvanquishedValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        ({ text }) => text.trim().startsWith('sortvanquished '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupSortvanquishedSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup sortvanquished case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.flags.vanq_sortmode !== entry.expected
        || parsed.flags.sortvanquished !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong flags field`);
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
    if (game.flags.vanq_sortmode !== entry.expected)
        throw new Error(`${entry.label} installed the wrong vanquished mode`);
    const [letter, description] = VANQORDERS[entry.expected];
    const expectedValue = `${letter}: ${description}`;
    if (sortvanquishedValue(game) !== expectedValue) {
        throw new Error(`${entry.label} showed the wrong optionsfull value`);
    }
}

export async function runStartupSortvanquishedMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup sortvanquished to optionsfull',
            recipe: loadStartupSortvanquishedRecipe(),
        }],
        summaryLabel: 'STARTUP SORTVANQUISHED',
        verifySegment: verifyStartupSortvanquishedSegment,
    });
}

runMatrixCli(import.meta.url, runStartupSortvanquishedMatrix, 'startup sortvanquished');
