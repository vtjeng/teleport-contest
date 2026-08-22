#!/usr/bin/env node

// Record and replay options.c optfn_menuinvertmode() from configuration-file
// startup through windows.c menuitem_invert_test() and TTY bulk inversion.
// Both cases select the SKIPINVERT "all classes" row, invert the whole class
// menu, and commit.  Mode 0 clears that row and keeps every ordinary class;
// mode 2 preserves it, so choose_classes_menu() reduces the result to "all".

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const BULK_INVERT_CLASS_MENU = ' OoA@\r\x1b\x1b';

export const STARTUP_MENUINVERTMODE_CASES = Object.freeze([
    Object.freeze({
        label: 'mode 0 inverts the skip entry off',
        seed: 7331049,
        datetime: '20360422111700',
        mode: 0,
        character: 'name:Modezero,role:Priest,race:human,gender:female,'
            + 'align:neutral',
        allClasses: true,
    }),
    Object.freeze({
        label: 'mode 2 leaves the skip entry selected',
        seed: 7331051,
        datetime: '20360422111900',
        mode: 2,
        character: 'name:Modetwo,role:Ranger,race:human,gender:male,'
            + 'align:neutral',
        allClasses: false,
    }),
    Object.freeze({
        label: 'wrapped mode 0 inverts the skip entry off',
        seed: 7331053,
        datetime: '20360422112100',
        mode: 0,
        optionValue: '4294967296',
        character: 'name:Modewrapzero,role:Priest,race:human,gender:female,'
            + 'align:neutral',
        allClasses: true,
    }),
    Object.freeze({
        label: 'wrapped mode 2 leaves the skip entry selected',
        seed: 7331055,
        datetime: '20360422112300',
        mode: 2,
        optionValue: '4294967298',
        character: 'name:Modewraptwo,role:Ranger,race:human,gender:male,'
            + 'align:neutral',
        allClasses: false,
    }),
]);

function nethackrc(entry) {
    return [
        `OPTIONS=${entry.character}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:bold',
        `OPTIONS=menuinvertmode:${entry.optionValue ?? entry.mode}`,
        '',
    ].join('\n');
}

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: nethackrc(entry),
        moves: BULK_INVERT_CLASS_MENU,
    };
}

export function loadStartupMenuinvertmodeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MENUINVERTMODE_CASES.map(segmentFor),
    }, 'startup menuinvertmode recipe');
}

function caseFor(segment) {
    return STARTUP_MENUINVERTMODE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function optionsFullValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith('menuinvertmode '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupMenuinvertmodeSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup menuinvertmode case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.iflags.menuinvertmode !== entry.mode
        || parsed.flags.menuinvertmode !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong owner`);
    }
    if (parsed.configErrorFrame.num_errors !== 0) {
        throw new Error(`${entry.label} produced a configuration error`);
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.iflags.menuinvertmode !== entry.mode) {
        throw new Error(
            `${entry.label} installed mode ${game.iflags.menuinvertmode}`,
        );
    }
    const expectedTypes = entry.allClasses ? game.flags.inv_order : [];
    if (JSON.stringify(game.flags.pickup_types)
        !== JSON.stringify(expectedTypes)) {
        throw new Error(`${entry.label} committed the wrong class selection`);
    }
    if (optionsFullValue(game) !== `${entry.mode}`) {
        throw new Error(`${entry.label} rendered the wrong optionsfull value`);
    }
    if (game.moves !== 1) {
        throw new Error(`${entry.label} spent a turn in the options menus`);
    }
}

export async function runStartupMenuinvertmodeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup menuinvertmode to TTY bulk selection',
            recipe: loadStartupMenuinvertmodeRecipe(),
        }],
        summaryLabel: 'STARTUP MENUINVERTMODE',
        verifySegment: verifyStartupMenuinvertmodeSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupMenuinvertmodeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup menuinvertmode: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
