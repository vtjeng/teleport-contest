#!/usr/bin/env node

// Record and replay cfgfiles.c cnf_line_MENUCOLOR() through coloratt.c's
// installed list, windows.c add_menu(), TTY menu attributes, the menucolors
// boolean, and the #optionsfull menu-color count.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    count_menucolors,
    MENU_COLOR_ATTRIBUTES,
} from '../js/coloratt.js';
import { COLOR_NAMES } from '../js/color_data.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import {
    ATR_BOLD,
    ATR_INVERSE,
    ATR_UNDERLINE,
    CLR_BLUE,
    CLR_BRIGHT_BLUE,
    CLR_CYAN,
    CLR_GREEN,
    CLR_ORANGE,
    CLR_RED,
    NO_COLOR,
} from '../js/terminal.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const OPTIONS_MENU = 'mO       \x1b';
const BASE_RC = Object.freeze([
    'OPTIONS=name:MenuColor,role:Healer,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
]);
const MENU_COLORS = allopt.find(({ optfn }) => optfn === 'o_menu_colors');

function rc(...lines) {
    return [...BASE_RC, ...lines, ''].join('\n');
}

function expectedRule(pattern, color, attr) {
    return Object.freeze({ pattern, color, attr });
}

function repeat(line) {
    return Array(8).fill(line);
}

const colorRows = COLOR_NAMES
    .filter(({ name }) => name !== null)
    .map(({ name, color }, index) => Object.freeze({
        statement: `MENUCOLOR="never-color-${index}"=${name}`,
        rule: expectedRule(`never-color-${index}`, color, 0),
    }));
const attributeRows = MENU_COLOR_ATTRIBUTES
    .filter(({ name }) => name !== null)
    .map(({ name, attr }, index) => Object.freeze({
        statement: `MENUCOLOR="never-attr-${index}"=green&${name}`,
        rule: expectedRule(`never-attr-${index}`, CLR_GREEN, attr),
    }));

export const STARTUP_MENUCOLOR_CASES = Object.freeze([
    Object.freeze({
        label: 'survey catch-all inventory witness',
        seed: 6201103,
        datetime: '20370115091700',
        nethackrc: [
            'OPTIONS=name:MenuProbe,role:Healer,race:human,gender:male,'
                + 'align:neutral',
            'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics',
            'MENUCOLOR=".*"=red',
            '',
        ].join('\n'),
        moves: 'i ',
        expected: Object.freeze([expectedRule('.*', CLR_RED, 0)]),
        enabled: true,
        errors: 0,
        inventory: Object.freeze({
            fragment: 'gold pieces', color: CLR_RED, attr: 0,
        }),
    }),
    Object.freeze({
        label: 'newest matching pattern supplies color and underline',
        seed: 6201109,
        datetime: '20370115092300',
        nethackrc: rc(
            'MENUCOLOR=".*"=green&bold',
            'MENUCOLOR="scalpel"=blue&underline',
            'MENUCOLOR="never"=red&inverse',
        ),
        moves: 'i ',
        expected: Object.freeze([
            expectedRule('never', CLR_RED, 7),
            expectedRule('scalpel', CLR_BLUE, 4),
            expectedRule('.*', CLR_GREEN, 1),
        ]),
        enabled: true,
        errors: 0,
        inventory: Object.freeze({
            fragment: 'scalpel', color: CLR_BLUE, attr: ATR_UNDERLINE,
        }),
    }),
    Object.freeze({
        label: 'nonmatch falls through to older aliases',
        seed: 6201113,
        datetime: '20370115092700',
        nethackrc: rc(
            'MENUCOLOR=".*"=light_blue&reverse',
            'MENUCOLOR="never"=bright_red&normal',
        ),
        moves: 'i ',
        expected: Object.freeze([
            expectedRule('never', CLR_ORANGE, 0),
            expectedRule('.*', CLR_BRIGHT_BLUE, 7),
        ]),
        enabled: true,
        errors: 0,
        inventory: Object.freeze({
            fragment: 'gold pieces',
            color: CLR_BRIGHT_BLUE,
            attr: ATR_INVERSE,
        }),
    }),
    Object.freeze({
        label: 'later boolean disables retained patterns',
        seed: 6201117,
        datetime: '20370115093100',
        nethackrc: rc(
            'MENUCOLOR=".*"=green&bold',
            'OPTIONS=!menucolors',
        ),
        moves: `i ${OPTIONS_MENU}`,
        expected: Object.freeze([expectedRule('.*', CLR_GREEN, 1)]),
        enabled: false,
        errors: 0,
        inventory: Object.freeze({
            fragment: 'gold pieces', color: NO_COLOR, attr: 0,
        }),
    }),
    Object.freeze({
        label: 'later pattern forces a disabled boolean on',
        seed: 6201121,
        datetime: '20370115093500',
        nethackrc: rc(
            'OPTIONS=!menucolors',
            'MENUCOLOR=".*"=cyan&bold',
        ),
        moves: 'i ',
        expected: Object.freeze([expectedRule('.*', CLR_CYAN, 1)]),
        enabled: true,
        errors: 0,
        inventory: Object.freeze({
            fragment: 'gold pieces', color: CLR_CYAN, attr: ATR_BOLD,
        }),
    }),
    Object.freeze({
        label: 'all source color and attribute names reach optionsfull',
        seed: 6201127,
        datetime: '20370115094100',
        nethackrc: rc(
            ...colorRows.map(({ statement }) => statement),
            ...attributeRows.map(({ statement }) => statement),
            'MENUCOLOR=".*"=green&bold',
            'OPTIONS=!menucolors',
        ),
        moves: `i ${OPTIONS_MENU}`,
        expected: Object.freeze([
            expectedRule('.*', CLR_GREEN, 1),
            ...attributeRows.map(({ rule }) => rule).reverse(),
            ...colorRows.map(({ rule }) => rule).reverse(),
        ]),
        enabled: false,
        errors: 0,
        inventory: Object.freeze({
            fragment: 'gold pieces', color: NO_COLOR, attr: 0,
        }),
    }),
    Object.freeze({
        label: 'each parser diagnostic continues to one valid rule',
        seed: 6201131,
        datetime: '20370115094500',
        nethackrc: rc(
            ...repeat('MENUCOLOR=scalpel'),
            ...repeat('MENUCOLOR="scalpel"=zebra'),
            ...repeat('MENUCOLOR="scalpel"=red&sparkle'),
            ...repeat('MENUCOLOR="["=red'),
            'MENUCOLOR=".*"=cyan&reverse',
            'OPTIONS=!menucolors',
        ),
        moves: `\ni ${OPTIONS_MENU}`,
        expected: Object.freeze([expectedRule('.*', CLR_CYAN, 7)]),
        enabled: false,
        errors: 32,
        inventory: Object.freeze({
            fragment: 'gold pieces', color: NO_COLOR, attr: 0,
        }),
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

export function loadStartupMenucolorRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_MENUCOLOR_CASES.map(segmentFor),
    }, 'startup MENUCOLOR recipe');
}

function caseFor(segment) {
    return STARTUP_MENUCOLOR_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function list(state) {
    const result = [];
    for (let rule = state.gm?.menu_colorings; rule; rule = rule.next) {
        result.push({
            pattern: rule.origstr,
            color: rule.color,
            attr: rule.attr,
        });
    }
    return result;
}

function verifyState(state, entry, phase) {
    if (JSON.stringify(list(state)) !== JSON.stringify(entry.expected)) {
        throw new Error(`${entry.label} ${phase} the wrong MENUCOLOR list`);
    }
    if (state.iflags?.use_menu_color !== entry.enabled) {
        throw new Error(`${entry.label} ${phase} the wrong menucolors flag`);
    }
    if (count_menucolors(state) !== entry.expected.length) {
        throw new Error(`${entry.label} ${phase} the wrong list count`);
    }
    const expectedCount = `(${entry.expected.length} currently set)`;
    if (optionValue(state, MENU_COLORS, {}) !== expectedCount) {
        throw new Error(`${entry.label} ${phase} the wrong optionsfull count`);
    }
}

function inventoryRow(fragment) {
    return game.nhDisplay.grid.find((row) => (
        row.map(({ ch }) => ch).join('').includes(fragment)
    ));
}

function verifyInventory(entry) {
    const row = inventoryRow(entry.inventory.fragment);
    if (!row) throw new Error(`${entry.label} rendered no inventory target`);
    const first = row.findIndex(({ ch }) => ch !== ' ');
    if (first < 0) throw new Error(`${entry.label} rendered an empty target`);
    for (let offset = 0; offset < 4; ++offset) {
        const cell = row[first + offset];
        if (cell.color !== NO_COLOR || cell.attr !== 0) {
            throw new Error(`${entry.label} styled its selector prefix`);
        }
    }
    const description = row[first + 4];
    if (description.color !== entry.inventory.color
        || description.attr !== entry.inventory.attr) {
        throw new Error(`${entry.label} rendered the wrong entry style`);
    }

    const heading = inventoryRow('Weapons');
    const headingStart = heading?.findIndex(({ ch }) => ch !== ' ') ?? -1;
    const headingCell = headingStart >= 0 ? heading[headingStart] : null;
    if (!headingCell
        || headingCell.color !== NO_COLOR
        || headingCell.attr !== ATR_INVERSE) {
        throw new Error(`${entry.label} recolored a skipped heading`);
    }
}

export async function verifyStartupMenucolorSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup MENUCOLOR case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyState(parsed, entry, 'parsed');
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }
    if (parsed.unportedConfigStatements.includes('menucolor')) {
        throw new Error(`${entry.label} left cnf_line_MENUCOLOR unported`);
    }

    const throughInventory = segment.moves.indexOf('i') + 1;
    let boundary = null;
    await runSegment({
        ...segment,
        moves: segment.moves.slice(0, throughInventory),
    }, { onBoundary: (error) => { boundary = error; } });
    if (boundary) throw boundary;
    verifyState(game, entry, 'installed');
    verifyInventory(entry);

    boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    verifyState(game, entry, 'replayed');
}

export async function runStartupMenucolorMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup MENUCOLOR to menu attributes and optionsfull',
            recipe: loadStartupMenucolorRecipe(),
        }],
        summaryLabel: 'STARTUP MENUCOLOR',
        verifySegment: verifyStartupMenucolorSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupMenucolorMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(`startup MENUCOLOR: ${error.message || error}\n`);
        process.exitCode = 2;
    });
}
