#!/usr/bin/env node

// Record and replay options.c optfn_boulder()/escapes(), drawing.c
// def_char_to_monclass(), and symbols.c get_othersym() from startup parsing
// through #optionsfull and the fixed boulder on the first tutorial map.

import { SYM_BOULDER } from '../js/const.js';
import { object_glyph_info } from '../js/display.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { sobj_at } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
import { dosetMenuItems } from '../js/options.js';
import { misc_symbol, SYM_OFF_X } from '../js/symbols.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 825701;
const DATETIME = '20040229141500';
const ERROR_REPEAT_COUNT = 12;
const OPEN_AND_DISMISS_FULL_OPTIONS = 'mO       \x1b';

const BASE_RC = Object.freeze([
    'OPTIONS=name:Boulderbyte,role:Healer,race:human,gender:male,'
        + 'align:neutral',
    'OPTIONS=tutorial,!legacy,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:bold',
]);

function repeated(line) {
    return Object.freeze(Array(ERROR_REPEAT_COUNT).fill(line));
}

export const STARTUP_BOULDER_CASES = Object.freeze([
    Object.freeze({
        label: 'literal accepted byte',
        optionLines: Object.freeze(['OPTIONS=boulder:0']),
        primary: 0x30,
        rogue: 0x30,
        active: '0',
        menu: '0',
        errors: 0,
    }),
    Object.freeze({
        label: 'S_boulder follows escaped boulder',
        // The comma suffix runs first: boulder writes both tables, then the
        // left-hand S_boulder changes only the primary one. Later symset
        // selection preserves both override tables.
        optionLines: Object.freeze([
            String.raw`OPTIONS=S_boulder:?,boulder:\x30`,
            'OPTIONS=symset:DECgraphics,roguesymset:RogueIBM',
        ]),
        primary: 0x3F,
        rogue: 0x30,
        active: '?',
        menu: '?',
        errors: 0,
    }),
    Object.freeze({
        label: 'boulder follows S_boulder',
        // Reversing the same comma pair leaves boulder as the last source
        // operation and therefore writes '0' to both tables.
        optionLines: Object.freeze([
            'OPTIONS=boulder:0,S_boulder:?',
        ]),
        primary: 0x30,
        rogue: 0x30,
        active: '0',
        menu: '0',
        errors: 0,
    }),
    Object.freeze({
        label: 'monster-class collision',
        optionLines: repeated('OPTIONS=boulder:a'),
        primary: 0,
        rogue: 0,
        active: '`',
        menu: '`',
        errors: ERROR_REPEAT_COUNT * 2 - 1,
    }),
    Object.freeze({
        label: 'warning collision',
        optionLines: repeated('OPTIONS=boulder:1'),
        primary: 0,
        rogue: 0,
        active: '`',
        menu: '`',
        errors: ERROR_REPEAT_COUNT * 2 - 1,
    }),
    Object.freeze({
        label: 'decoded NUL keeps earlier accepted byte',
        // Executable C rejects ^@ despite optfn_boulder's stale reset comment.
        optionLines: Object.freeze([
            'OPTIONS=boulder:0',
            ...repeated('OPTIONS=boulder:^@'),
        ]),
        primary: 0x30,
        rogue: 0x30,
        active: '0',
        menu: '0',
        errors: ERROR_REPEAT_COUNT * 2,
    }),
    Object.freeze({
        label: 'signed meta byte',
        // The pinned x86-64 C build promotes the 0xB0 char as negative, so
        // the `< ' '` arm rejects it as a control character.
        optionLines: repeated(String.raw`OPTIONS=boulder:\M0`),
        primary: 0,
        rogue: 0,
        active: '`',
        menu: '`',
        errors: ERROR_REPEAT_COUNT * 2 - 1,
    }),
    Object.freeze({
        label: 'mandatory value',
        optionLines: repeated('OPTIONS=boulder'),
        primary: 0,
        rogue: 0,
        active: '`',
        menu: '`',
        errors: ERROR_REPEAT_COUNT * 2 - 1,
    }),
]);

function nethackrc(entry) {
    return [...BASE_RC, ...entry.optionLines, ''].join('\n');
}

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry),
        // A configuration error stops at tty_wait_synch() first. Four spaces
        // advance the tutorial's startup text to its map before #optionsfull.
        moves: `${entry.errors ? '\n' : ''}    `
            + OPEN_AND_DISMISS_FULL_OPTIONS,
    };
}

export function loadStartupBoulderRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_BOULDER_CASES.map(segmentFor),
    }, 'startup boulder symbol recipe');
}

function caseFor(segment) {
    return STARTUP_BOULDER_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function boulderMenuValue(items) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith('boulder '),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

export async function verifyStartupBoulderSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup boulder case owns segment');
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;

    const absolute = SYM_OFF_X + SYM_BOULDER;
    const actual = {
        primary: game.go.ov_primary_syms[absolute],
        rogue: game.go.ov_rogue_syms[absolute],
        active: misc_symbol(SYM_BOULDER, game).ch,
    };
    const expected = {
        primary: entry.primary,
        rogue: entry.rogue,
        active: entry.active,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            `${entry.label} stored ${JSON.stringify(actual)}, not `
                + JSON.stringify(expected),
        );
    }

    // The 75x17 map is centered at (3,3), so dat/tut-1.lua's relative
    // boulder coordinate (25,12) lands at absolute map square (28,15).
    const tutorialBoulder = sobj_at(BOULDER, 28, 15, game);
    if (!tutorialBoulder) {
        throw new Error(`${entry.label} did not reach the tutorial boulder`);
    }
    if (object_glyph_info(tutorialBoulder, game).ch !== entry.active) {
        throw new Error(`${entry.label} did not render its active byte`);
    }
    const menu = boulderMenuValue(dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false));
    if (menu !== entry.menu) {
        throw new Error(
            `${entry.label} reported ${menu}, not ${entry.menu}`,
        );
    }
}

export async function runStartupBoulderMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup boulder symbol to tutorial map',
            recipe: loadStartupBoulderRecipe(),
        }],
        summaryLabel: 'STARTUP BOULDER SYMBOL',
        verifySegment: verifyStartupBoulderSegment,
    });
}

runMatrixCli(import.meta.url, runStartupBoulderMatrix, 'startup boulder symbol');
