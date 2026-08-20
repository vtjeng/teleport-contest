#!/usr/bin/env node

// Record and replay options.c optfn_disclose() from startup parsing through
// the seventh #optionsfull page.  The menu reads optfn_disclose(get_val), so
// it proves that the parser and the displayed value share flags.end_disclose.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 4210041;
const DATETIME = '20281114073500';
const OPEN_FULL_OPTIONS_MENU = ' mO      ';

export const STARTUP_DISCLOSE_SEGMENT = Object.freeze({
    seed: SEED,
    datetime: DATETIME,
    nethackrc: [
        'OPTIONS=name:Optster,role:Valkyrie,race:human,gender:female,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        'OPTIONS=disclose:yi ya yv yg yc yo',
        '',
    ].join('\n'),
    moves: OPEN_FULL_OPTIONS_MENU,
});

export function loadStartupDiscloseRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [STARTUP_DISCLOSE_SEGMENT],
    }, 'startup disclose recipe');
}

function discloseValue(items) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith('disclose '),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

export async function verifyStartupDiscloseSegment(segment) {
    if (segment !== STARTUP_DISCLOSE_SEGMENT
        && (segment.nethackrc !== STARTUP_DISCLOSE_SEGMENT.nethackrc
            || segment.moves !== STARTUP_DISCLOSE_SEGMENT.moves)) {
        throw new Error('no startup disclose case owns segment');
    }
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.flags.end_disclose.join('') !== 'yyyyyy') {
        throw new Error(
            `disclose stored ${game.flags.end_disclose.join('')}, not yyyyyy`,
        );
    }
    if (game.flags.disclose !== undefined)
        throw new Error('disclose retained raw option text');
    const items = dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    if (discloseValue(items) !== 'yi ya yv yg yc yo') {
        throw new Error('disclose reached the wrong optionsfull value');
    }
}

export async function runStartupDiscloseMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup disclose to optionsfull',
            recipe: loadStartupDiscloseRecipe(),
        }],
        summaryLabel: 'STARTUP DISCLOSE',
        verifySegment: verifyStartupDiscloseSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupDiscloseMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup disclose: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
