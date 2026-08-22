#!/usr/bin/env node

// Record and replay options.c optfn_menu_objsyms() from startup through
// invent.c display_pickinv(), TTY process_menu_window(), and #optionsfull.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 921337;
const DATETIME = '20330415113000';
const OPEN_INVENTORY = 'i';
const DISMISS_INVENTORY = '\x1b';
const OPEN_AND_DISMISS_FULL_OPTIONS = 'mO       \x1b';
const ERROR_REPEAT_COUNT = 12;

const BASE_RC = Object.freeze([
    'OPTIONS=name:Menuobject,role:Healer,race:human,gender:female,'
        + 'align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:bold',
]);

function repeated(line) {
    return Object.freeze(Array(ERROR_REPEAT_COUNT).fill(line));
}

export const MENU_OBJSYMS_CASES = Object.freeze([
    Object.freeze({
        label: 'unknown text falls back to none',
        optionLines: Object.freeze(['OPTIONS=menu_objsyms:zqxj']),
        mode: 0,
        menu: 'none',
        errors: 0,
    }),
    Object.freeze({
        label: 'bare canonical selects headers',
        optionLines: Object.freeze(['OPTIONS=menu_objsyms']),
        mode: 1,
        menu: 'headers',
        errors: 0,
    }),
    Object.freeze({
        label: 'bare alias selects entries',
        optionLines: Object.freeze(['OPTIONS=use_menu_glyphs']),
        mode: 2,
        menu: 'entries',
        errors: 0,
    }),
    Object.freeze({
        label: 'numeric prefix selects both',
        optionLines: Object.freeze(['OPTIONS=menu_objsyms:3tail']),
        mode: 3,
        menu: 'both',
        errors: 0,
    }),
    Object.freeze({
        label: 'canonical abbreviation selects conditional',
        optionLines: Object.freeze(['OPTIONS=menu_objsyms:cond']),
        mode: 4,
        menu: 'conditional',
        errors: 0,
    }),
    Object.freeze({
        label: 'compatibility text selects one-or-other',
        optionLines: Object.freeze([
            'OPTIONS=menu_objsyms:one-or-the-other',
        ]),
        mode: 5,
        menu: 'one-or-other',
        errors: 0,
    }),
    Object.freeze({
        label: 'empty value selects headers',
        optionLines: Object.freeze(['OPTIONS=menu_objsyms:']),
        mode: 1,
        menu: 'headers',
        errors: 0,
    }),
    Object.freeze({
        label: 'negated alias ignores its value',
        optionLines: Object.freeze(['OPTIONS=!use_menu_glyphs:both']),
        mode: 0,
        menu: 'none',
        errors: 0,
    }),
    Object.freeze({
        label: 'alias value accepts a canonical abbreviation',
        optionLines: Object.freeze(['OPTIONS=use_menu_glyphs:ENTR']),
        mode: 2,
        menu: 'entries',
        errors: 0,
    }),
    Object.freeze({
        label: 'illegal numeric values keep the prior mode',
        optionLines: Object.freeze([
            'OPTIONS=menu_objsyms:both',
            ...repeated('OPTIONS=menu_objsyms:6'),
        ]),
        mode: 3,
        menu: 'both',
        // Each invalid line reports a duplicate and its illegal parameter.
        errors: ERROR_REPEAT_COUNT * 2,
    }),
    Object.freeze({
        label: 'high-bit primary weapon symbol reaches inventory ttychar',
        optionLines: Object.freeze([
            'OPTIONS=menu_objsyms:entries',
            String.raw`SYMBOLS=S_weapon:\xF8`,
        ]),
        mode: 2,
        menu: 'entries',
        errors: 0,
        markerSelector: 'a',
        marker: '\uFFFD',
        markerColor: 6,
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
        // Repeated diagnostics move config_error_done()'s absolute path below
        // the terminal. Return dismisses that window before ordinary input.
        moves: `${entry.errors ? '\n' : ''} ${OPEN_INVENTORY}`
            + DISMISS_INVENTORY + OPEN_AND_DISMISS_FULL_OPTIONS,
    };
}

export function loadMenuObjsymsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: MENU_OBJSYMS_CASES.map(segmentFor),
    }, 'menu object symbols inventory recipe');
}

function caseFor(segment) {
    return MENU_OBJSYMS_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function optionMenuValue(items, name) {
    const item = items.find(
        (candidate) => candidate.text.trim().startsWith(`${name} `),
    );
    if (!item) return null;
    return item.text.slice(item.text.indexOf('[') + 1, -1);
}

function inventoryEntryCell(selector = null) {
    for (const row of game.nhDisplay.grid) {
        const first = row.findIndex(({ ch }) => ch !== ' ');
        if (first < 0) continue;
        const text = row.slice(first).map(({ ch }) => ch).join('');
        if (/^[A-Za-z$#] . /u.test(text)
            && (selector === null || text[0] === selector)) {
            return row[first + 2];
        }
    }
    return null;
}

function hasWeaponHeadingSymbol() {
    return game.nhDisplay.grid.some((row) => (
        row.map(({ ch }) => ch).join('').trim() === "Weapons  (')')"
    ));
}

export async function verifyMenuObjsymsSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no menu object symbols case owns segment');

    const throughInventory = segment.moves.indexOf(OPEN_INVENTORY) + 1;
    let boundary = null;
    await runSegment({
        ...segment,
        moves: segment.moves.slice(0, throughInventory),
    }, { onBoundary: (error) => { boundary = error; } });
    if (boundary) throw boundary;

    const parsed = parseNethackrc(segment.nethackrc);
    const expectedFlags = [
        entry.mode,
        (entry.mode & 1) !== 0,
        (entry.mode & (2 | 4)) !== 0,
    ];
    const actualFlags = [
        game.iflags.menuobjsyms,
        game.iflags.menu_head_objsym,
        game.iflags.use_menu_glyphs,
    ];
    if (JSON.stringify(actualFlags) !== JSON.stringify(expectedFlags)) {
        throw new Error(
            `${entry.label} stored ${JSON.stringify(actualFlags)}, not `
                + JSON.stringify(expectedFlags),
        );
    }
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }

    const headingSymbol = hasWeaponHeadingSymbol();
    if (headingSymbol !== ((entry.mode & 1) !== 0)) {
        throw new Error(`${entry.label} rendered the wrong weapon heading`);
    }
    const marker = inventoryEntryCell(entry.markerSelector ?? null);
    if (!marker) throw new Error(`${entry.label} rendered no inventory entry`);
    // Sorted ordinary inventory always has headers. Modes 4 and 5 therefore
    // suppress entry glyphs even though use_menu_glyphs is true.
    const entryGlyph = entry.mode === 2 || entry.mode === 3;
    const expectedMarker = entry.marker ?? (entryGlyph ? '$' : '-');
    const expectedColor = entry.markerColor ?? (entryGlyph ? 11 : 8);
    if (marker.ch !== expectedMarker
        || marker.color !== expectedColor || marker.attr !== 0) {
        throw new Error(
            `${entry.label} rendered entry marker `
                + JSON.stringify(marker),
        );
    }

    boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    const menu = optionMenuValue(dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false), 'menu_objsyms');
    if (menu !== entry.menu) {
        throw new Error(
            `${entry.label} reported ${menu}, not ${entry.menu}`,
        );
    }
}

export async function runMenuObjsymsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup menu object symbols to inventory',
            recipe: loadMenuObjsymsRecipe(),
        }],
        summaryLabel: 'MENU OBJECT SYMBOLS INVENTORY',
        verifySegment: verifyMenuObjsymsSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMenuObjsymsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `menu object symbols inventory: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
