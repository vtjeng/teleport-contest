#!/usr/bin/env node

// Record and replay options.c optfn_msghistory() through the live
// tty_create_nhwindow(NHW_MESSAGE) clamp and the #optionsfull value column.
// Every case pages through the full menu and dismisses it without a pick.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 7152039;
const DATETIME = '20381107142000';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';
const ERROR_REPEAT_COUNT = 12;

function repeated(spelling) {
    return Array(ERROR_REPEAT_COUNT).fill(`OPTIONS=${spelling}`);
}

export const STARTUP_MSGHISTORY_CASES = Object.freeze([
    Object.freeze({
        label: 'in-range value',
        optionLines: Object.freeze(['OPTIONS=msghistory:37']),
        parsed: 37,
        normalized: 37,
    }),
    Object.freeze({
        label: 'lower clamp',
        optionLines: Object.freeze(['OPTIONS=msghistory:19']),
        parsed: 19,
        normalized: 20,
    }),
    Object.freeze({
        label: 'upper clamp',
        optionLines: Object.freeze(['OPTIONS=msghistory:129']),
        parsed: 129,
        normalized: 128,
    }),
    Object.freeze({
        label: 'negative atoi wraps to unsigned',
        optionLines: Object.freeze(['OPTIONS=msghistory:-1']),
        parsed: 0xFFFFFFFF,
        normalized: 128,
    }),
    Object.freeze({
        label: 'negation stores zero',
        optionLines: Object.freeze(['OPTIONS=!msghistory']),
        parsed: 0,
        normalized: 20,
    }),
    Object.freeze({
        label: 'missing value preserves prior state',
        optionLines: Object.freeze([
            'OPTIONS=msghistory:41',
            ...repeated('msghistory'),
        ]),
        parsed: 41,
        normalized: 41,
        reports: true,
    }),
    Object.freeze({
        label: 'value with negation preserves prior state',
        optionLines: Object.freeze([
            'OPTIONS=msghistory:41',
            ...repeated('!msghistory:12'),
        ]),
        parsed: 41,
        normalized: 41,
        reports: true,
    }),
    Object.freeze({
        label: 'nonnumeric atoi is zero',
        optionLines: Object.freeze(['OPTIONS=msghistory:nonnumeric']),
        parsed: 0,
        normalized: 20,
    }),
]);

function nethackrc(entry) {
    return [
        'OPTIONS=name:MessageRows,role:Valkyrie,race:human,gender:female,'
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
        moves: `${entry.reports ? '\n' : ''}`
            + OPEN_AND_DISMISS_FULL_OPTIONS,
    };
}

export function loadStartupMsghistoryRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MSGHISTORY_CASES.map(segmentFor),
    }, 'startup msghistory recipe');
}

function caseFor(segment) {
    const found = STARTUP_MSGHISTORY_CASES.find(
        (entry) => segmentFor(entry).nethackrc === segment.nethackrc
            && segmentFor(entry).moves === segment.moves,
    );
    if (!found) throw new Error('no startup msghistory case owns segment');
    return found;
}

function valueOf(items, name) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith(`${name} `),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

export async function verifyStartupMsghistorySegment(segment) {
    const entry = caseFor(segment);
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.iflags.msg_history !== entry.normalized) {
        throw new Error(
            `${entry.label} normalized to ${game.iflags.msg_history}, not `
                + `${entry.normalized}`,
        );
    }
    if (game.flags.msghistory !== undefined) {
        throw new Error(`${entry.label} retained raw msghistory text`);
    }
    const items = dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    if (valueOf(items, 'msghistory') !== `${entry.normalized}`) {
        throw new Error(`${entry.label} reached the wrong menu value`);
    }
}

export async function runStartupMsghistoryMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup msghistory to optionsfull',
            recipe: loadStartupMsghistoryRecipe(),
        }],
        summaryLabel: 'STARTUP MSGHISTORY',
        verifySegment: verifyStartupMsghistorySegment,
    });
}

runMatrixCli(import.meta.url, runStartupMsghistoryMatrix, 'startup msghistory');
