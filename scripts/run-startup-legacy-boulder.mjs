#!/usr/bin/env node

// Record and replay cfgfiles.c cnf_line_BOULDER()/get_uchars() from startup
// through the tutorial boulder and options.c optfn_boulder(get_val).

import { SYM_BOULDER } from '../js/const.js';
import { object_glyph_info } from '../js/display.js';
import { game } from '../js/gstate.js';
import { decodeUtf8ByteString } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { sobj_at } from '../js/obj.js';
import { BOULDER } from '../js/objects.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { misc_symbol, SYM_OFF_X } from '../js/symbols.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SEED = 713029;
const DATETIME = '20171031184500';
const OPEN_AND_DISMISS_FULL_OPTIONS = 'mO       \x1b';

const BASE_RC = Object.freeze([
    'OPTIONS=name:Oldboulder,role:Healer,race:human,gender:male,'
        + 'align:neutral',
    'OPTIONS=tutorial,!legacy,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,!autopickup,menu_headings:bold',
]);

export const LEGACY_BOULDER_CASES = Object.freeze([
    Object.freeze({
        label: 'decimal narrows and whitespace ends the first value',
        optionLines: Object.freeze(['BOULDER=4294967344\t999x']),
        primary: 0x30,
        rogue: 0,
        active: '0',
        menu: '0',
        waits: 0,
    }),
    Object.freeze({
        label: 'zero leaves an earlier direct value unchanged',
        optionLines: Object.freeze(['BOULDER=48', 'BOULDER=0']),
        primary: 0x30,
        rogue: 0,
        active: '0',
        menu: '0',
        waits: 0,
    }),
    Object.freeze({
        label: 'empty direct value leaves S_boulder unchanged',
        optionLines: Object.freeze(['OPTIONS=S_boulder:?', 'BOULDER=']),
        primary: 0x3F,
        rogue: 0,
        active: '?',
        menu: '?',
        waits: 0,
    }),
    Object.freeze({
        label: 'direct prefix follows S_boulder',
        optionLines: Object.freeze(['OPTIONS=S_boulder:?', 'BOU=48']),
        primary: 0x30,
        rogue: 0,
        active: '0',
        menu: '0',
        waits: 0,
    }),
    Object.freeze({
        label: 'S_boulder follows direct statement',
        optionLines: Object.freeze(['BOULDER=48', 'OPTIONS=S_boulder:?']),
        primary: 0x3F,
        rogue: 0,
        active: '?',
        menu: '?',
        waits: 0,
    }),
    Object.freeze({
        label: 'compound boulder follows direct statement',
        optionLines: Object.freeze(['BOULDER=48', 'OPTIONS=boulder:6']),
        primary: 0x36,
        rogue: 0x36,
        active: '6',
        menu: '6',
        waits: 0,
    }),
    Object.freeze({
        label: 'direct statement follows compound boulder',
        optionLines: Object.freeze(['OPTIONS=boulder:6', 'BOULDER=48']),
        primary: 0x30,
        rogue: 0x36,
        active: '0',
        menu: '0',
        waits: 0,
    }),
    Object.freeze({
        label: 'malformed suffix leaves earlier direct value unchanged',
        optionLines: Object.freeze(['BOULDER=48', 'BOULDER=48x']),
        primary: 0x30,
        rogue: 0,
        active: '0',
        menu: '0',
        waits: 1,
    }),
    Object.freeze({
        label: 'backslash syntax leaves S_boulder unchanged',
        optionLines: Object.freeze([
            'OPTIONS=S_boulder:?', String.raw`BOULDER=\48`,
        ]),
        primary: 0x3F,
        rogue: 0,
        active: '?',
        menu: '?',
        waits: 1,
    }),
    Object.freeze({
        label: 'high byte remains one optionsfull column',
        optionLines: Object.freeze(['BOULDER=233']),
        primary: 0xE9,
        rogue: 0,
        active: 'i',
        menu: decodeUtf8ByteString([0xE9]),
        waits: 0,
    }),
    Object.freeze({
        label: 'ordinary errors surround the immediate raw wait',
        optionLines: Object.freeze([
            'OPTIONS=zqxj',
            'BOULDER=?',
            ...Array(8).fill('OPTIONS=quux'),
        ]),
        primary: 0,
        rogue: 0,
        active: '`',
        menu: '`',
        waits: 1,
        configErrors: 9,
        mixedWaits: true,
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
        // Each get_uchars() syntax error waits before rcfile() resumes. Four
        // spaces then advance the tutorial text to its map before #optionsfull.
        moves: '\n'.repeat(entry.waits + (entry.configErrors ? 1 : 0)) + '    '
            + OPEN_AND_DISMISS_FULL_OPTIONS,
    };
}

export function loadLegacyBoulderRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: LEGACY_BOULDER_CASES.map(segmentFor),
    }, 'legacy boulder statement recipe');
}

function caseFor(segment) {
    return LEGACY_BOULDER_CASES.find((entry) => {
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

function firstRawLine(replay) {
    const first = replay.getScreens()[0];
    if (!first) return null;
    return JSON.parse(first)[0].map(({ ch }) => ch).join('').trimEnd();
}

function rawRows(screen) {
    return JSON.parse(screen).map(
        (row) => row.map(({ ch }) => ch).join('').trimEnd(),
    );
}

function verifyMixedWaitFrames(replay, entry) {
    if (!replay.getScreens()[0]) return;
    const expectedFirst = [
        '',
        'OPTIONS=zqxj',
        " * Line 4: Unknown option 'zqxj'.",
        'Syntax error in BOULDER',
        ...Array(20).fill(''),
    ];
    const expectedSecond = [
        '',
        'OPTIONS=zqxj',
        " * Line 4: Unknown option 'zqxj'.",
        'Syntax error in BOULDER',
        '',
        'OPTIONS=quux',
        " * Line 6: Unknown option 'quux'.",
        '',
        'OPTIONS=quux',
        " * Line 7: Unknown option 'quux'.",
        '',
        'OPTIONS=quux',
        " * Line 8: Unknown option 'quux'.",
        '',
        'OPTIONS=quux',
        " * Line 9: Unknown option 'quux'.",
        '',
        'OPTIONS=quux',
        " * Line 10: Unknown option 'quux'.",
        '',
        'OPTIONS=quux',
        " * Line 11: Unknown option 'quux'.",
        '',
        'OPTIONS=quux',
    ];
    const actual = replay.getScreens().slice(0, 2).map(rawRows);
    if (JSON.stringify(actual)
        !== JSON.stringify([expectedFirst, expectedSecond])) {
        throw new Error(`${entry.label} rendered the wrong two wait frames`);
    }
    const cursors = replay.getCursors().slice(0, 2);
    if (JSON.stringify(cursors) !== JSON.stringify([
        [0, 4, 1], [0, 31, 1],
    ])) {
        throw new Error(
            `${entry.label} recorded wait cursors ${JSON.stringify(cursors)}`,
        );
    }
}

export async function verifyLegacyBoulderSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no legacy boulder case owns segment');
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;

    const parsed = parseNethackrc(segment.nethackrc);
    const expectedErrors = entry.configErrors ?? 0;
    if (parsed.configErrorFrame.num_errors !== expectedErrors) {
        throw new Error(
            `${entry.label} produced ${parsed.configErrorFrame.num_errors}`
                + ` configuration errors, not ${expectedErrors}`,
        );
    }
    const waits = parsed.startupEvents.filter(({ wait }) => wait).length;
    if (waits !== entry.waits) {
        throw new Error(`${entry.label} waited ${waits} times, not ${entry.waits}`);
    }
    // The repository's judge-owned terminal stub cannot serialize locally;
    // focused tests install the serializer and the differential workspace has
    // the judge implementation. In either environment with frames, pin the
    // raw output and immediate-wait cursor here.
    if (entry.waits && !entry.mixedWaits && replay.getScreens()[0]) {
        if (firstRawLine(replay) !== 'Syntax error in BOULDER') {
            throw new Error(`${entry.label} did not raw-print its syntax error`);
        }
        if (JSON.stringify(replay.getCursors()[0]) !== '[0,1,1]') {
            throw new Error(`${entry.label} waited at the wrong raw cursor`);
        }
    }
    if (entry.mixedWaits) verifyMixedWaitFrames(replay, entry);

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
        throw new Error(`${entry.label} rendered the wrong tutorial symbol`);
    }
    const menu = boulderMenuValue(dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false));
    if (menu !== entry.menu) {
        throw new Error(`${entry.label} reported ${menu}, not ${entry.menu}`);
    }
}

export async function runLegacyBoulderMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'legacy boulder statement to tutorial map and options',
            recipe: loadLegacyBoulderRecipe(),
        }],
        summaryLabel: 'LEGACY BOULDER STATEMENT',
        verifySegment: verifyLegacyBoulderSegment,
    });
}

runMatrixCli(import.meta.url, runLegacyBoulderMatrix, 'legacy boulder statement');
