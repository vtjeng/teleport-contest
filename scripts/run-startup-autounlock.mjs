#!/usr/bin/env node

// Record and replay options.c optfn_autounlock() from startup parsing through
// numeric flags state, the #optionsfull value, and lock.c doopen_indir()'s
// no-action locked-door branches. Acting apply-key and kick branches remain at
// their named boundaries and do not appear in this matrix.

import { D_LOCKED } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { allopt } from '../js/optlist_data.js';
import { optionValue, parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const OPEN_FULL_OPTIONS_MENU = ' mO      ';
const LOCKED_DOOR_SEED = 9500074;
const LOCKED_DOOR_DATETIME = '20310203040506';
const AUTOUNLOCK_ROW = allopt.find(({ name }) => name === 'autounlock');

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Valkyrie,race:human,gender:female,align:lawful`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

function parserCase({ label, seed, datetime, statements = [], expected,
    value, errors = 0 }) {
    return Object.freeze({
        label,
        seed,
        datetime,
        nethackrc: startupRc(`Unlock${seed}`, ...statements),
        moves: `${errors ? '\n' : ''}${OPEN_FULL_OPTIONS_MENU}`,
        expected,
        value,
        errors,
        lockedDoor: false,
    });
}

function lockedDoorCase(label, statement, expected) {
    return Object.freeze({
        label,
        seed: LOCKED_DOOR_SEED,
        datetime: LOCKED_DOOR_DATETIME,
        nethackrc: startupRc(`Unlock${expected}`, statement),
        moves: 'k',
        expected,
        value: expected === 0 ? 'none'
            : expected === 1 ? 'untrap'
                : expected === 2 ? 'apply-key'
                    : expected === 8 ? 'force' : 'untrap + force',
        errors: 0,
        lockedDoor: true,
    });
}

export const STARTUP_AUTOUNLOCK_CASES = Object.freeze([
    parserCase({
        label: 'bare option restores apply-key',
        seed: 8842203,
        datetime: '20380817090300',
        statements: ['autounlock'],
        expected: 2,
        value: 'apply-key',
    }),
    parserCase({
        label: 'empty value restores apply-key',
        seed: 8842205,
        datetime: '20380817090500',
        statements: ['autounlock:'],
        expected: 2,
        value: 'apply-key',
    }),
    parserCase({
        label: 'bare negation selects none',
        seed: 8842207,
        datetime: '20380817090700',
        statements: ['!autounlock'],
        expected: 0,
        value: 'none',
    }),
    parserCase({
        label: 'space-separated abbreviations select every action',
        seed: 8842209,
        datetime: '20380817090900',
        statements: ['autounlock:u a k f'],
        expected: 15,
        value: 'untrap + apply-key + kick + force',
    }),
    parserCase({
        label: 'plus-separated fuzzy names select three actions',
        seed: 8842211,
        datetime: '20380817091100',
        statements: ['autounlock:untrap+apply key+force'],
        expected: 11,
        value: 'untrap + apply-key + force',
    }),
    parserCase({
        label: 'invalid lists and uppercase dispatch preserve force',
        seed: 8842213,
        datetime: '20380817091300',
        statements: [
            'autounlock:none,autounlock:force',
            'autounlock:force',
            'autounlock:all',
            'autounlock:UNTRAP',
            'autounlock:untrap+apply-key kick',
            'autounlock:none+force',
            '!autounlock:untrap',
            ...Array(9).fill('autounlock:all'),
            'autounlock:force',
        ],
        expected: 8,
        value: 'force',
        // Thirty-one reports scroll config_error_done()'s absolute rc path,
        // which runSegment cannot know, above the captured terminal.
        errors: 31,
    }),
    lockedDoorCase('none stops after the locked-door message',
        '!autounlock', 0),
    lockedDoorCase('door-inert untrap stops after the locked-door message',
        'autounlock:untrap', 1),
    lockedDoorCase('apply-key without a tool stops after the locked-door message',
        'autounlock:apply-key', 2),
    lockedDoorCase('door-inert force stops after the locked-door message',
        'autounlock:force', 8),
]);

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: entry.datetime,
        nethackrc: entry.nethackrc,
        moves: entry.moves,
    };
}

export function loadStartupAutounlockRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_AUTOUNLOCK_CASES.map(segmentFor),
    }, 'startup autounlock recipe');
}

function caseFor(segment) {
    return STARTUP_AUTOUNLOCK_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function verifyValue(state, entry, phase) {
    if (state.flags?.autounlock !== entry.expected) {
        throw new Error(`${entry.label} ${phase} the wrong numeric flags value`);
    }
    if (optionValue(state, AUTOUNLOCK_ROW, {}) !== entry.value) {
        throw new Error(`${entry.label} ${phase} the wrong optionsfull value`);
    }
}

export async function verifyStartupAutounlockSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup autounlock case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyValue(parsed, entry, 'parsed');
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
    verifyValue(game, entry, 'installed');
    if (entry.lockedDoor) {
        const door = game.level.at(game.u.ux, game.u.uy - 1);
        if (door.flags !== D_LOCKED) {
            throw new Error(`${entry.label} did not preserve the locked door`);
        }
        if (game.nhDisplay.topMessage !== 'This door is locked.') {
            throw new Error(`${entry.label} did not reach doopen_indir()`);
        }
    }
}

export async function runStartupAutounlockMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup autounlock to optionsfull and locked door',
            recipe: loadStartupAutounlockRecipe(),
        }],
        summaryLabel: 'STARTUP AUTOUNLOCK',
        verifySegment: verifyStartupAutounlockSegment,
        chunkLimit: 7,
    });
}

runMatrixCli(import.meta.url, runStartupAutounlockMatrix, 'startup autounlock');
