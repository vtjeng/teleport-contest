#!/usr/bin/env node

// Record and replay hilite_status configuration through options.c doset(),
// the live #optionsfull menu.  Each segment walks all seven pages, exposing
// optfn_hilite_status(get_val) in the compound section and
// optfn_o_status_hilites(get_val) in Other settings, then dismisses the menu
// normally with an empty commit.

import { isDeepStrictEqual } from 'node:util';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 5938147;
const DATETIME = '20370419111500';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';
const ERROR_REPEAT_COUNT = 12;

function conditionGroups(count, suffix = '') {
    return [
        'condition',
        ...Array.from({ length: count }, () => ['blind', 'red']).flat(),
    ].join('/') + suffix;
}

function afterAsciiErrors(statement) {
    return [
        ...Array(ERROR_REPEAT_COUNT)
            .fill('HILITE_STATUS=bogusfield/always/red'),
        statement,
    ];
}

function beforeAsciiErrors(statement) {
    return [
        statement,
        ...Array(ERROR_REPEAT_COUNT)
            .fill('HILITE_STATUS=bogusfield/always/red'),
    ];
}

export const STARTUP_STATUS_HILITE_CASES = Object.freeze([
    Object.freeze({
        label: 'field rules and coalesced conditions',
        optionLines: Object.freeze([
            'OPTIONS=hilite_status:hitpoints/<50%/red&bold '
                + 'hitpoints/<25%/orange title/always/blue',
            'OPTIONS=hilite_status:condition/blind+deaf/red&bold/'
                + 'conf/red&bold',
            'OPTIONS=hilite_status:condition/blind/normal&underline',
        ]),
        expectedCount: 5,
    }),
    Object.freeze({
        label: 'lowest condition color coalesces final styles',
        optionLines: Object.freeze([
            'OPTIONS=hilite_status:condition/blind/red',
            'OPTIONS=hilite_status:condition/blind/black',
            'OPTIONS=hilite_status:condition/conf/black',
        ]),
        expectedCount: 1,
    }),
    Object.freeze({
        label: 'cleared attribute-only conditions do not gather',
        optionLines: Object.freeze([
            'OPTIONS=hilite_status:condition/blind+deaf/bold',
            'OPTIONS=hilite_status:condition/blind+deaf/normal',
        ]),
        expectedCount: 0,
    }),
    Object.freeze({
        label: 'direct config statement field rule',
        optionLines: Object.freeze([
            'HILITE_STATUS=HITPOINTS/ALWAYS/RED TITLE/Z/BLUE',
        ]),
        expectedCount: 2,
        expectedStoredRules: 2,
    }),
    Object.freeze({
        label: 'empty direct statement enables highlighting',
        optionLines: Object.freeze(['HILITE_STATUS=']),
        expectedCount: 0,
        expectedStoredRules: 0,
    }),
    Object.freeze({
        label: 'direct title below the byte component limit',
        optionLines: Object.freeze([
            `HILITE_STATUS=title/${'é'.repeat(62)}/red`,
        ]),
        expectedCount: 1,
        expectedStoredRules: 1,
    }),
    Object.freeze({
        label: 'direct title at the final accepted byte length',
        optionLines: Object.freeze([
            `HILITE_STATUS=title/${'a'.repeat(125)}/red`,
        ]),
        expectedCount: 1,
        expectedStoredRules: 1,
    }),
    Object.freeze({
        label: 'long title text truncates before live matching',
        optionLines: Object.freeze([
            'OPTIONS=hilite_status:title/always/red',
            'OPTIONS=hilite_status:title/Stripling'
                + '-'.repeat(69) + '\t' + 'x/bright-green',
        ]),
        expectedCount: 2,
        expectedStoredRules: 2,
    }),
    Object.freeze({
        label: 'direct title at the byte component limit',
        optionLines: Object.freeze(afterAsciiErrors(
            `HILITE_STATUS=title/${'é'.repeat(63)}/red`,
        )),
        expectedCount: 0,
        expectedStoredRules: 0,
        expectedDelta: 0,
        reports: true,
    }),
    Object.freeze({
        label: 'direct ASCII title at the byte component limit',
        optionLines: Object.freeze(beforeAsciiErrors(
            `HILITE_STATUS=title/${'a'.repeat(126)}/red`,
        )),
        expectedCount: 0,
        expectedStoredRules: 0,
        expectedDelta: 0,
        reports: true,
    }),
    Object.freeze({
        label: 'nine direct condition groups stay inside the field array',
        optionLines: Object.freeze([
            `HILITE_STATUS=${conditionGroups(9)}`,
        ]),
        expectedCount: 1,
        expectedStoredRules: 9,
    }),
    Object.freeze({
        label: 'an early empty field keeps a later statement in range',
        optionLines: Object.freeze([
            `HILITE_STATUS=${conditionGroups(9, '// time/always/blue')}`,
        ]),
        expectedCount: 2,
        expectedStoredRules: 10,
    }),
    Object.freeze({
        label: 'ten direct condition groups stop at the field-array edge',
        optionLines: Object.freeze(afterAsciiErrors(
            `HILITE_STATUS=${conditionGroups(10)}`,
        )),
        expectedCount: 1,
        expectedStoredRules: 10,
        expectedDelta: 0,
        reports: true,
    }),
    Object.freeze({
        label: 'characteristics stops on its first out-of-range access',
        optionLines: Object.freeze(afterAsciiErrors(
            `HILITE_STATUS=${[
                'characteristics',
                ...Array.from(
                    { length: 10 }, () => ['always', 'red'],
                ).flat(),
            ].join('/')}`,
        )),
        expectedCount: 10,
        expectedStoredRules: 10,
        expectedDelta: 0,
        reports: true,
    }),
    Object.freeze({
        label: 'ordinary field stops on its out-of-range access',
        optionLines: Object.freeze(afterAsciiErrors(
            `HILITE_STATUS=${[
                'time',
                ...Array.from(
                    { length: 10 }, () => ['always', 'red'],
                ).flat(),
            ].join('/')}`,
        )),
        expectedCount: 10,
        expectedStoredRules: 10,
        expectedDelta: 0,
        reports: true,
    }),
    Object.freeze({
        label: 'condition alias owns its out-of-range diagnostic',
        optionLines: Object.freeze(afterAsciiErrors(
            `HILITE_STATUS=${conditionGroups(10).replace(
                /^condition/u, 'flags',
            )}`,
        )),
        expectedCount: 1,
        expectedStoredRules: 10,
        expectedDelta: 0,
        reports: true,
    }),
    Object.freeze({
        label: 'bytes beyond the direct field-array edge stay unread',
        optionLines: Object.freeze(afterAsciiErrors(
            `HILITE_STATUS=${conditionGroups(10, '/extra')}`,
        )),
        expectedCount: 1,
        expectedStoredRules: 10,
        expectedDelta: 0,
        reports: true,
    }),
]);

function nethackrc(entry) {
    return [
        'OPTIONS=name:HiliteCount,role:Valkyrie,race:human,gender:female,'
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

export function loadStartupStatusHiliteRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_STATUS_HILITE_CASES.map(segmentFor),
    }, 'startup status highlight recipe');
}

function caseFor(segment) {
    const found = STARTUP_STATUS_HILITE_CASES.find(
        (entry) => segmentFor(entry).nethackrc === segment.nethackrc
            && segmentFor(entry).moves === segment.moves,
    );
    if (!found) throw new Error('no startup status highlight case owns segment');
    return found;
}

function valueOf(items, name) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith(`${name} `),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

export async function verifyStartupStatusHiliteSegment(segment) {
    const entry = caseFor(segment);
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;

    const configuredRules = structuredClone(game.iflags.status_hilites);
    const expectedDelta = entry.expectedDelta ?? 3;
    if (game.iflags.hilite_delta !== expectedDelta) {
        throw new Error(
            `${entry.label} stored hilite_delta ${game.iflags.hilite_delta}, `
                + `not ${expectedDelta}`,
        );
    }
    if (entry.expectedStoredRules !== undefined
        && configuredRules.length !== entry.expectedStoredRules) {
        throw new Error(
            `${entry.label} stored ${configuredRules.length} rule(s), not `
                + `${entry.expectedStoredRules}`,
        );
    }
    const helpers = {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    };
    for (let pass = 0; pass < 2; ++pass) {
        const items = dosetMenuItems(game, helpers, false);
        const expectedText = entry.expectedCount
            ? '(see "status highlight rules" below)' : '(none)';
        if (valueOf(items, 'hilite_status') !== expectedText) {
            throw new Error(`${entry.label} reported the wrong hilite_status`);
        }
        const expectedCount = `(${entry.expectedCount} currently set)`;
        if (valueOf(items, 'status highlight rules') !== expectedCount) {
            throw new Error(
                `${entry.label} did not report ${expectedCount}`,
            );
        }
    }
    if (!isDeepStrictEqual(game.iflags.status_hilites, configuredRules)) {
        throw new Error(`${entry.label} changed rules while counting them`);
    }
}

export async function runStartupStatusHiliteMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup status highlight counts',
            recipe: loadStartupStatusHiliteRecipe(),
        }],
        summaryLabel: 'STARTUP STATUS HILITES',
        verifySegment: verifyStartupStatusHiliteSegment,
    });
}

runMatrixCli(import.meta.url, runStartupStatusHiliteMatrix, 'startup status hilites');
