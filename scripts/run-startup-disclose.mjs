#!/usr/bin/env node

// Record and replay options.c optfn_disclose() from startup parsing through
// the seventh #optionsfull page.  The menu reads optfn_disclose(get_val), so
// it proves that the parser and the displayed value share flags.end_disclose.

import { game } from '../js/gstate.js';
import { decodeUtf8ByteString } from '../js/hacklib.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

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

export const STARTUP_DISCLOSE_NONASCII_SEGMENT = Object.freeze({
    seed: SEED,
    datetime: DATETIME,
    nethackrc: [
        'OPTIONS=name:Optster,role:Valkyrie,race:human,gender:female,'
            + 'align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        '\uFEFFZORKMID=x',
        ...Array(8).fill('OPTIONS=disclose:é'),
        '',
    ].join('\n'),
    // Eight reports fill the raw terminal, hiding the absolute rc path that
    // segment input cannot supply. Return dismisses config_error_done().
    moves: '\n ',
});

export const STARTUP_DISCLOSE_CASES = Object.freeze([
    Object.freeze({
        label: 'settings reach optionsfull',
        segment: STARTUP_DISCLOSE_SEGMENT,
        expected: 'yyyyyy',
        errors: 0,
        menu: 'yi ya yv yg yc yo',
    }),
    Object.freeze({
        label: 'BOM echo and non-ASCII input preserve recorder bytes',
        segment: STARTUP_DISCLOSE_NONASCII_SEGMENT,
        expected: 'nnnnnn',
        // The first line reports the invalid byte; each repeated CompOpt also
        // reports its duplicate before reaching the same invalid byte.
        errors: 16,
        invalidByte: decodeUtf8ByteString([0xC3]),
    }),
]);

export function loadStartupDiscloseRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_DISCLOSE_CASES.map(({ segment }) => segment),
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
    const entry = STARTUP_DISCLOSE_CASES.find(({ segment: expected }) => (
        segment === expected
        || (segment.nethackrc === expected.nethackrc
            && segment.moves === expected.moves)
    ));
    if (!entry) throw new Error('no startup disclose case owns segment');
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.flags.end_disclose.join('') !== entry.expected) {
        throw new Error(
            `disclose stored ${game.flags.end_disclose.join('')}, not `
                + entry.expected,
        );
    }
    if (game.flags.disclose !== undefined)
        throw new Error('disclose retained raw option text');
    const parsed = parseNethackrc(segment.nethackrc);
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }
    if (entry.invalidByte) {
        const message = `Unknown disclose parameter '${entry.invalidByte}'`;
        if (!parsed.configErrorFrame.output.some((line) => line.includes(message)))
            throw new Error(`${entry.label} reported the wrong invalid byte`);
        if (replay.getScreens()[0]) {
            const rows = JSON.parse(replay.getScreens()[0]).map(
                (row) => row.map(({ ch }) => ch).join('').trimEnd(),
            );
            const echoed = 'OPTIONS=disclose:é';
            const invalid = '\uFFFD';
            const expectedRows = [
                '',
                '\uFEFFZORKMID=x',
                ' * Line 4: Unknown config statement.',
                '',
                echoed,
                ` * Line 5: Unknown disclose parameter '${invalid}'.`,
            ];
            for (let line = 6; line <= 9; ++line) {
                expectedRows.push(
                    '',
                    echoed,
                    ` * Line ${line}: compound option specified multiple times:`
                        + ' disclose.',
                    ` * Line ${line}: Unknown disclose parameter '${invalid}'.`,
                );
            }
            expectedRows.push('', echoed);
            if (JSON.stringify(rows) !== JSON.stringify(expectedRows)) {
                throw new Error(`${entry.label} rendered the wrong error frame`);
            }
            if (JSON.stringify(replay.getCursors()[0]) !== '[0,37,1]') {
                throw new Error(`${entry.label} waited at the wrong raw cursor`);
            }
        }
        return;
    }
    const items = dosetMenuItems(game, {
        headingStyle: game.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    if (discloseValue(items) !== entry.menu) {
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

runMatrixCli(import.meta.url, runStartupDiscloseMatrix, 'startup disclose');
