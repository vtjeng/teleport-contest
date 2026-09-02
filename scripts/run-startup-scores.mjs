#!/usr/bin/env node

// Record and replay options.c optfn_scores() from configuration-file startup
// through its source-owned fields and #optionsfull get_val request. Error
// cases stop after config_error_done() so their raw diagnostic screens and
// cursors remain part of the differential.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { dosetMenuItems, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const OPEN_FULL_OPTIONS_MENU = ' mO      ';

function startupRc(name, ...scoreStatements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...scoreStatements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

export const STARTUP_SCORES_CASES = Object.freeze([
    Object.freeze({
        label: 'all three values reach optionsfull',
        seed: 7331065,
        datetime: '20360422113100',
        nethackrc: startupRc('Scoreall', 'scores:7 top/4 around/own'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: Object.freeze([7, 4, true]),
        shown: '7 top/4 around/own',
        errors: 0,
    }),
    Object.freeze({
        label: 'inner negations and none overwrite left to right',
        seed: 7331069,
        datetime: '20360422113500',
        nethackrc: startupRc(
            'Scoreneg',
            'scores:9top/8around/own none/5abracadabra/2troll',
        ),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: Object.freeze([2, 5, false]),
        shown: '2 top/5 around',
        errors: 0,
    }),
    Object.freeze({
        label: 'source letter suffix includes at sign',
        seed: 7331075,
        datetime: '20360422114100',
        nethackrc: startupRc('Scoreatsign', 'scores:2top@/own'),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: Object.freeze([2, 0, true]),
        shown: '2 top/own',
        errors: 0,
    }),
    Object.freeze({
        label: 'numeric counts narrow to signed int before assignment',
        seed: 7331077,
        datetime: '20360422114300',
        nethackrc: startupRc(
            'Scoreoverflow',
            'scores:2147483648top/4294967298around',
        ),
        moves: OPEN_FULL_OPTIONS_MENU,
        expected: Object.freeze([-2147483648, 2, false]),
        shown: '2 around',
        errors: 0,
    }),
    Object.freeze({
        label: 'missing values preserve the preceding line',
        seed: 7331071,
        datetime: '20360422113700',
        nethackrc: startupRc(
            'Scoremissing', 'scores:6top/own',
            ...Array(4).fill('scores'), ...Array(4).fill('scores:'),
        ),
        moves: '\n',
        expected: Object.freeze([6, 0, true]),
        // Eight duplicate missing values produce two reports apiece. That
        // fills the raw terminal and pushes config_error_done()'s absolute rc
        // path, which segment input cannot supply, above the visible window.
        errors: 16,
    }),
    Object.freeze({
        label: 'negative value reports after resetting state',
        seed: 7331067,
        datetime: '20360422113300',
        nethackrc: startupRc(
            'Scorenegative', ...Array(8).fill('scores:-2top'),
        ),
        moves: '\n',
        expected: Object.freeze([0, 0, false]),
        errors: 15,
    }),
    Object.freeze({
        label: 'unknown token retains preceding writes',
        seed: 7331073,
        datetime: '20360422113900',
        nethackrc: startupRc(
            'Scoreunknown', ...Array(8).fill('scores:4around/zqxj'),
        ),
        moves: '\n',
        expected: Object.freeze([0, 4, false]),
        errors: 15,
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

export function loadStartupScoresRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_SCORES_CASES.map(segmentFor),
    }, 'startup scores recipe');
}

function caseFor(segment) {
    return STARTUP_SCORES_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function scoreState(state) {
    return [state.flags.end_top, state.flags.end_around, state.flags.end_own];
}

function scoresValue(state) {
    const items = dosetMenuItems(state, {
        headingStyle: state.iflags.menu_headings,
        countBindKeys: () => 0,
    }, false);
    const item = items.find(
        ({ text }) => text.trim().startsWith('scores '),
    );
    return item?.text.slice(item.text.indexOf('[') + 1, -1) ?? null;
}

export async function verifyStartupScoresSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup scores case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    if (JSON.stringify(scoreState(parsed)) !== JSON.stringify(entry.expected))
        throw new Error(`${entry.label} parsed into the wrong score fields`);
    if (parsed.flags.scores !== undefined)
        throw new Error(`${entry.label} retained raw scores text`);
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
    if (JSON.stringify(scoreState(game)) !== JSON.stringify(entry.expected))
        throw new Error(`${entry.label} installed the wrong score fields`);
    if (entry.shown && scoresValue(game) !== entry.shown)
        throw new Error(`${entry.label} reached the wrong optionsfull value`);
}

export async function runStartupScoresMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup scores to optionsfull and config diagnostics',
            recipe: loadStartupScoresRecipe(),
        }],
        summaryLabel: 'STARTUP SCORES',
        verifySegment: verifyStartupScoresSegment,
    });
}

runMatrixCli(import.meta.url, runStartupScoresMatrix, 'startup scores');
