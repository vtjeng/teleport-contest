#!/usr/bin/env node

// Record and replay options.c pfxfn_cond_() from the configuration-error
// dismissal through the #optionsfull condition count. The right-to-left
// OPTIONS recursion reports cond before cond_bogus, then keeps starting.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 9042713;
const DATETIME = '20411103112600';
const OPEN_AND_DISMISS_FULL_OPTIONS = ' mO       \x1b';
const ERROR_REPEAT_COUNT = 8;
const CONDITION_OPTIONS = 'cond_barehanded,cond_bogus,cond';

const EXPECTED_CONDITION_ERRORS = Object.freeze(Array.from(
    { length: ERROR_REPEAT_COUNT },
    (_unused, repeatIndex) => [
        `\nOPTIONS=${CONDITION_OPTIONS}`,
        ` * Line ${repeatIndex + 4}: Unknown condition option cond (2).`,
        ` * Line ${repeatIndex + 4}: Unknown condition option cond_bogus (1).`,
        ` * Line ${repeatIndex + 4}: bad option suffix variation 'cond_bogus'.`,
    ],
).flat());

export const STARTUP_COND_OPTIONS_SEGMENT = Object.freeze({
    seed: SEED,
    datetime: DATETIME,
    nethackrc: [
        'OPTIONS=name:CondCount,role:Valkyrie,race:human,gender:female,'
            + 'align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...Array(ERROR_REPEAT_COUNT).fill(`OPTIONS=${CONDITION_OPTIONS}`),
        '',
    ].join('\n'),
    // The repeated reports fill the terminal before config_error_done() names
    // the recorder's absolute configuration path, which the segment API does
    // not receive. Enter dismisses that report before startup continues.
    moves: `\n${OPEN_AND_DISMISS_FULL_OPTIONS}`,
});

export function loadStartupCondOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [STARTUP_COND_OPTIONS_SEGMENT],
    }, 'startup condition options recipe');
}

function conditionCountValue(items) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith(
            'status condition fields ',
        ),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupCondOptionsSegment(segment) {
    if (segment !== STARTUP_COND_OPTIONS_SEGMENT
        && (segment.nethackrc !== STARTUP_COND_OPTIONS_SEGMENT.nethackrc
            || segment.moves !== STARTUP_COND_OPTIONS_SEGMENT.moves)) {
        throw new Error('no startup condition-options case owns segment');
    }
    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.iflags.status_conditions.barehanded !== true) {
        throw new Error('cond_barehanded did not set the condition owner');
    }
    if (parsed.configErrorFrame.output.join('\n')
        !== EXPECTED_CONDITION_ERRORS.join('\n')) {
        throw new Error('condition option errors lost their source order');
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.iflags.status_conditions.barehanded !== true) {
        throw new Error('startup did not retain cond_barehanded');
    }
    const items = dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    if (conditionCountValue(items) !== '(17 currently set)') {
        throw new Error('optionsfull did not report 17 condition fields');
    }
}

export async function runStartupCondOptionsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup condition options to optionsfull',
            recipe: loadStartupCondOptionsRecipe(),
        }],
        summaryLabel: 'STARTUP CONDITION OPTIONS',
        verifySegment: verifyStartupCondOptionsSegment,
    });
}

runMatrixCli(import.meta.url, runStartupCondOptionsMatrix, 'startup condition options');
