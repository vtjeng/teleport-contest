#!/usr/bin/env node

// Record and replay options.c pfxfn_font() from configuration-file startup
// through its raw error wait and the first command-input boundary.  The valid
// cases also inspect the iflags fields wc_set_font_name() and the size arm own.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SEED = 7331201;
const DATETIME = '20040229141500';
const MALFORMED_REPEAT_COUNT = 6;
const DUPLICATE_SIZE_COUNT = 23;

const BASE_RC = Object.freeze([
    'OPTIONS=name:Fontwright,role:Healer,race:human,gender:male,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup',
]);

function nethackrc(optionLines) {
    return [...BASE_RC, ...optionLines, ''].join('\n');
}

function selectedFontFields(iflags) {
    return {
        wc_font_map: iflags.wc_font_map ?? null,
        wc_font_menu: iflags.wc_font_menu ?? null,
        wc_font_message: iflags.wc_font_message ?? null,
        wc_font_status: iflags.wc_font_status ?? null,
        wc_font_text: iflags.wc_font_text ?? null,
        wc_fontsiz_map: iflags.wc_fontsiz_map ?? 0,
        wc_fontsiz_menu: iflags.wc_fontsiz_menu ?? 0,
        wc_fontsiz_message: iflags.wc_fontsiz_message ?? 0,
        wc_fontsiz_status: iflags.wc_fontsiz_status ?? 0,
        wc_fontsiz_text: iflags.wc_fontsiz_text ?? 0,
    };
}

const DEFAULT_FONT_FIELDS = Object.freeze({
    wc_font_map: null,
    wc_font_menu: null,
    wc_font_message: null,
    wc_font_status: null,
    wc_font_text: null,
    wc_fontsiz_map: 0,
    wc_fontsiz_menu: 0,
    wc_fontsiz_message: 0,
    wc_fontsiz_status: 0,
    wc_fontsiz_text: 0,
});

const STARTUP_FONT_CASES = Object.freeze([
    Object.freeze({
        label: 'font names and atoi sizes',
        optionLines: Object.freeze([
            'OPTIONS=font_map:Map Face,font_menu:Menu Face,'
                + 'font_message:Message Face,font_status:Status Face,'
                + 'font_text:Text Face',
            'OPTIONS=font_size_map:17tail,font_size_menu:nonnumeric,'
                + 'font_size_message:2147483648,font_size_status:2,'
                + 'font_size_text:9223372036854775808',
        ]),
        expected: Object.freeze({
            wc_font_map: 'Map Face',
            wc_font_menu: 'Menu Face',
            wc_font_message: 'Message Face',
            wc_font_status: 'Status Face',
            wc_font_text: 'Text Face',
            wc_fontsiz_map: 17,
            wc_fontsiz_menu: 0,
            wc_fontsiz_message: -2147483648,
            wc_fontsiz_status: 2,
            wc_fontsiz_text: -1,
        }),
        errors: 0,
    }),
    Object.freeze({
        label: 'negated font name and size values',
        optionLines: Object.freeze([
            'OPTIONS=!font_map:after,!font_size_map:99',
        ]),
        expected: Object.freeze({
            ...DEFAULT_FONT_FIELDS,
            wc_font_map: 'after',
        }),
        errors: 0,
    }),
    Object.freeze({
        label: 'duplicate font size reports',
        optionLines: Object.freeze([
            `OPTIONS=${[
                'font_size_map:11',
                ...Array(DUPLICATE_SIZE_COUNT - 1)
                    .fill('font_size_map:12'),
            ].join(',')}`,
        ]),
        expected: Object.freeze({
            ...DEFAULT_FONT_FIELDS,
            wc_fontsiz_map: 11,
        }),
        errors: DUPLICATE_SIZE_COUNT - 1,
    }),
    Object.freeze({
        label: 'malformed font prefix reports',
        // Six echoed statements plus twelve diagnostics fill the 24-row raw
        // terminal before config_error_done() names the recorder's absolute
        // rc path.  The selected single-line witness is repeated unchanged.
        optionLines: Object.freeze(
            Array(MALFORMED_REPEAT_COUNT).fill('OPTIONS=fontbogus:value'),
        ),
        expected: DEFAULT_FONT_FIELDS,
        errors: MALFORMED_REPEAT_COUNT * 2,
    }),
]);

function segmentFor(entry) {
    return {
        seed: SEED,
        datetime: DATETIME,
        nethackrc: nethackrc(entry.optionLines),
        moves: `${entry.errors ? '\n' : ''}:`,
    };
}

export function loadStartupFontOptionsRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_FONT_CASES.map(segmentFor),
    }, 'startup font options recipe');
}

function caseFor(segment) {
    return STARTUP_FONT_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function assertFontFields(actual, expected, label) {
    const actualText = JSON.stringify(selectedFontFields(actual));
    const expectedText = JSON.stringify(expected);
    if (actualText !== expectedText) {
        throw new Error(`${label} stored ${actualText}, not ${expectedText}`);
    }
}

function rawRows(screen) {
    return JSON.parse(screen).map(
        (row) => row.map(({ ch }) => ch).join('').trimEnd(),
    );
}

function assertWaitCadence(replay, entry) {
    const screens = replay.getScreens();
    if (!screens[0]) return;
    const expectedCount = entry.errors ? 3 : 2;
    if (screens.length !== expectedCount) {
        throw new Error(
            `${entry.label} recorded ${screens.length} screens, not `
                + expectedCount,
        );
    }
    const expectedCursor = entry.errors ? [0, 27, 1] : [6, 9, 1];
    for (const cursor of replay.getCursors()) {
        if (JSON.stringify(cursor) !== JSON.stringify(expectedCursor)) {
            throw new Error(
                `${entry.label} recorded cursor ${JSON.stringify(cursor)}, not `
                    + JSON.stringify(expectedCursor),
            );
        }
    }
    if (!entry.errors) return;

    const rows = rawRows(screens[0]);
    if (entry.label === 'duplicate font size reports') {
        const echoed = 'OPTIONS=font_size_map:11,font_size_map:12,'
            + 'font_size_map:12,font_size_map:12,font';
        if (rows[1] !== echoed
            || rows.slice(2).some((row) => row
                !== ' * Line 4: compound option specified multiple times:'
                    + ' font_size_map.')) {
            throw new Error(`${entry.label} rendered the wrong wait frame`);
        }
    } else {
        for (let block = 0; block < MALFORMED_REPEAT_COUNT; ++block) {
            const row = 1 + block * 4;
            const line = 4 + block;
            const expected = [
                'OPTIONS=fontbogus:value',
                ` * Line ${line}: Unknown font parameter 'fontbogus:value'.`,
                ` * Line ${line}: bad option suffix variation 'fontbogus'.`,
            ];
            if (JSON.stringify(rows.slice(row, row + 3))
                !== JSON.stringify(expected)) {
                throw new Error(`${entry.label} rendered the wrong wait frame`);
            }
        }
    }
}

export async function verifyStartupFontOptionsSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup font-options case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    assertFontFields(parsed.iflags, entry.expected, `${entry.label} parse`);
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }

    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    assertFontFields(game.iflags, entry.expected, `${entry.label} startup`);
    assertWaitCadence(replay, entry);
}

export async function runStartupFontOptionsMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup font options parser',
            recipe: loadStartupFontOptionsRecipe(),
        }],
        summaryLabel: 'STARTUP FONT OPTIONS',
        verifySegment: verifyStartupFontOptionsSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupFontOptionsMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup font options: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
