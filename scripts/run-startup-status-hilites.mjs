#!/usr/bin/env node

// Record and replay hilite_status configuration through options.c doset(),
// the live #optionsfull menu.  Each segment walks all seven pages, exposing
// optfn_hilite_status(get_val) in the compound section and
// optfn_o_status_hilites(get_val) in Other settings, then dismisses the menu
// normally with an empty commit.

import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 5938147;
const DATETIME = '20370419111500';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';

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
            'HILITE_STATUS=hitpoints/always/red',
        ]),
        expectedCount: 1,
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
        moves: OPEN_AND_DISMISS_FULL_OPTIONS,
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

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupStatusHiliteMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup status hilites: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
