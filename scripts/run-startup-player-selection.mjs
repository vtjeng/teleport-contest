#!/usr/bin/env node

// Record and replay options.c optfn_player_selection() from configuration
// parsing through the iflags field jsmain.js installs on the running game.
// TTY does not advertise WC_PLAYER_SELECTION, so #optionsfull hides this row
// and tty_player_selection() does not consult the configured field.

import { VIA_DIALOG, VIA_PROMPTS } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

// Eight rejected lines put config_error_done()'s absolute recorder path below
// the 24-row TTY screen.  A segment supplies rc text rather than that path, so
// js/cfgfiles.js cannot reproduce it; focused tests pin every message before
// this matrix compares the source-reachable diagnostics and next boundary.
const REJECTED_PLAYER_SELECTIONS = Object.freeze([
    'player_selection',
    'player_selection',
    'player_selection:',
    'player_selection:',
    'player_selection:zqxj',
    'player_selection:zqxj',
    'player_selection:promp',
    'player_selection:promp',
]);

export const STARTUP_PLAYER_SELECTION_CASES = Object.freeze([
    Object.freeze({
        label: 'mixed-case dialog prefix reaches installed iflags',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc('Playerdialog', 'player_selection:DiAlOgBox'),
        moves: ' ',
        expected: VIA_DIALOG,
        errors: 0,
    }),
    Object.freeze({
        label: 'mixed-case prompt prefix reaches installed iflags',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc('Playerprompt', 'player_selection:PrOmPtInG'),
        moves: ' ',
        expected: VIA_PROMPTS,
        errors: 0,
    }),
    Object.freeze({
        label: 'missing and invalid values preserve the preceding setting',
        seed: 7331391,
        datetime: '20360425131100',
        nethackrc: startupRc(
            'Playererrors',
            'player_selection:prompt',
            ...REJECTED_PLAYER_SELECTIONS,
        ),
        moves: '\n',
        expected: VIA_PROMPTS,
        errors: 16,
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

export function loadStartupPlayerSelectionRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_PLAYER_SELECTION_CASES.map(segmentFor),
    }, 'startup player_selection recipe');
}

function caseFor(segment) {
    return STARTUP_PLAYER_SELECTION_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function playerSelection(state) {
    return state.iflags?.wc_player_selection;
}

export async function verifyStartupPlayerSelectionSegment(segment) {
    const entry = caseFor(segment);
    if (!entry)
        throw new Error('no startup player_selection case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (playerSelection(parsed) !== entry.expected
        || parsed.flags.player_selection !== undefined) {
        throw new Error(`${entry.label} parsed into the wrong iflags field`);
    }
    if (parsed.configErrorFrame.num_errors !== entry.errors) {
        throw new Error(
            `${entry.label} reported ${parsed.configErrorFrame.num_errors}`
                + ` errors, not ${entry.errors}`,
        );
    }

    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (playerSelection(game) !== entry.expected)
        throw new Error(`${entry.label} installed the wrong iflags field`);
}

export async function runStartupPlayerSelectionMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup player_selection to iflags and diagnostics',
            recipe: loadStartupPlayerSelectionRecipe(),
        }],
        summaryLabel: 'STARTUP PLAYER SELECTION',
        verifySegment: verifyStartupPlayerSelectionSegment,
    });
}

runMatrixCli(import.meta.url, runStartupPlayerSelectionMatrix, 'startup player_selection');
