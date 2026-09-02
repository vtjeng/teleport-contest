#!/usr/bin/env node

// Record and replay options.c optfn_windowborders() from configuration-file
// parsing through the iflags field jsmain.js installs on the running game and
// the first map/input boundary.  TTY does not advertise WC2_WINDOWBORDERS, so
// #optionsfull and window-border rendering deliberately do not consume it.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

const ACCEPTED_CASES = Array.from({ length: 5 }, (_, mode) => Object.freeze({
    label: `window border mode ${mode} reaches installed iflags`,
    seed: 7415201 + mode * 2,
    datetime: `20360813${String(901 + mode * 2).padStart(4, '0')}00`,
    nethackrc: startupRc(`Border${mode}`, `windowborders:${mode}tail`),
    moves: ' ',
    expected: mode,
    errors: 0,
}));

const AGGREGATE_ERROR_STATEMENTS = Object.freeze([
    'windowborders:3',
    'windowborders',
    'windowborders:3',
    'windowborders:',
    'windowborders:3',
    '!windowborders:4',
    'windowborders:-1',
    'windowborders:5',
    'windowborders:9223372036854775808',
    '!windowborders:4',
]);

const DUPLICATE_LINE = [
    'windowborders:1',
    ...Array(19).fill('windowborders:4'),
].join(',');

export const STARTUP_WINDOWBORDERS_CASES = Object.freeze([
    ...ACCEPTED_CASES,
    Object.freeze({
        label: 'garbage atoi prefix selects off',
        seed: 7415213,
        datetime: '20360813091300',
        nethackrc: startupRc('Bordergarbage', 'windowborders:zqxj'),
        moves: ' ',
        expected: 0,
        errors: 0,
    }),
    Object.freeze({
        label: 'bare negation installs off',
        seed: 7415217,
        datetime: '20360813091700',
        nethackrc: startupRc('Borderbare', '!windowborders'),
        moves: ' ',
        expected: 0,
        errors: 0,
    }),
    Object.freeze({
        label: 'empty-valued negation installs off',
        seed: 7415219,
        datetime: '20360813091900',
        nethackrc: startupRc('Borderempty', '!windowborders:'),
        moves: ' ',
        expected: 0,
        errors: 0,
    }),
    Object.freeze({
        label: 'missing, negated, range, and overflow errors preserve state',
        seed: 7415227,
        datetime: '20360813092700',
        nethackrc: startupRc(
            'Bordererrors',
            ...AGGREGATE_ERROR_STATEMENTS,
        ),
        moves: '\n',
        expected: 3,
        errors: 16,
    }),
    Object.freeze({
        label: 'signed-long overflow then int narrowing can select off',
        seed: 7415229,
        datetime: '20360813092900',
        nethackrc: startupRc(
            'Borderoverflow',
            'windowborders:-9223372036854775809tail',
        ),
        moves: ' ',
        expected: 0,
        errors: 0,
    }),
    Object.freeze({
        label: 'duplicates apply right to left and across later lines',
        seed: 7415233,
        datetime: '20360813093300',
        nethackrc: startupRc(
            'Borderduplicates',
            DUPLICATE_LINE,
            'windowborders:3',
        ),
        moves: '\n',
        expected: 3,
        errors: 20,
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

export function loadStartupWindowbordersRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_WINDOWBORDERS_CASES.map(segmentFor),
    }, 'startup windowborders recipe');
}

function caseFor(segment) {
    return STARTUP_WINDOWBORDERS_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function windowbordersValue(state) {
    return state.iflags?.wc2_windowborders;
}

export async function verifyStartupWindowbordersSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup windowborders case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (windowbordersValue(parsed) !== entry.expected
        || parsed.flags.windowborders !== undefined) {
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
    if (windowbordersValue(game) !== entry.expected) {
        throw new Error(`${entry.label} installed the wrong iflags field`);
    }
}

export async function runStartupWindowbordersMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup windowborders to iflags and diagnostics',
            recipe: loadStartupWindowbordersRecipe(),
        }],
        summaryLabel: 'STARTUP WINDOWBORDERS',
        verifySegment: verifyStartupWindowbordersSegment,
    });
}

runMatrixCli(import.meta.url, runStartupWindowbordersMatrix, 'startup windowborders');
