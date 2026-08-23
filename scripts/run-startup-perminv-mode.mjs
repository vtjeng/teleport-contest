#!/usr/bin/env node

// Record and replay options.c optfn_perminv_mode() from startup configuration
// through the two coupled iflags fields.  Accepted rows reach the first
// command; rejected rows stop at the configuration diagnostic wait.  This
// recorder's tty build lacks TTY_PERM_INVENT, so tty_update_inventory() makes
// the first requested persistent-inventory refresh a source no-op.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    INVOPT_FULL,
    INVOPT_IN_USE,
    INVOPT_NONE,
    INVOPT_ON,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { parseNethackrc } from '../js/options.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

function startupRc(name, ...statements) {
    return [
        `OPTIONS=name:${name},role:Healer,race:human,gender:male,align:neutral`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...statements.map((statement) => `OPTIONS=${statement}`),
        '',
    ].join('\n');
}

export const STARTUP_PERMINV_MODE_CASES = Object.freeze([
    Object.freeze({
        label: 'none mode still couples the permanent inventory boolean on',
        seed: 7612301,
        datetime: '20370912090100',
        nethackrc: startupRc('Permnone', 'perminv_mode:none'),
        moves: ' ',
        mode: INVOPT_NONE,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'all mode reaches installed iflags',
        seed: 7612303,
        datetime: '20370912090300',
        nethackrc: startupRc('Permall', 'perminv_mode:all'),
        moves: ' ',
        mode: INVOPT_ON,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'full mode reaches installed iflags',
        seed: 7612307,
        datetime: '20370912090700',
        nethackrc: startupRc('Permfull', 'perminv_mode:full'),
        moves: ' ',
        mode: INVOPT_FULL,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'in-use mode reaches installed iflags',
        seed: 7612309,
        datetime: '20370912090900',
        nethackrc: startupRc('Perminuse', 'perminv_mode:in-use'),
        moves: ' ',
        mode: INVOPT_IN_USE,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'off alias reaches installed iflags',
        seed: 7612313,
        datetime: '20370912091300',
        nethackrc: startupRc('Permoff', 'perminv_mode:off'),
        moves: ' ',
        mode: INVOPT_NONE,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'on alias reaches installed iflags',
        seed: 7612317,
        datetime: '20370912091700',
        nethackrc: startupRc('Permon', 'perminv_mode:on'),
        moves: ' ',
        mode: INVOPT_ON,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'gold alias reaches installed iflags',
        seed: 7612319,
        datetime: '20370912091900',
        nethackrc: startupRc('Permgold', 'perminv_mode:gold'),
        moves: ' ',
        mode: INVOPT_FULL,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'inuse-only alias reaches installed iflags',
        seed: 7612323,
        datetime: '20370912092300',
        nethackrc: startupRc(
            'Permaliasuse', 'perminv_mode:inuse-only',
        ),
        moves: ' ',
        mode: INVOPT_IN_USE,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'one-byte prefix selects the first matching alias',
        seed: 7612329,
        datetime: '20370912092900',
        nethackrc: startupRc('Permprefix', 'perminv_mode:o'),
        moves: ' ',
        mode: INVOPT_NONE,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'first numeric byte selects a mode despite trailing bytes',
        seed: 7612331,
        datetime: '20370912093100',
        nethackrc: startupRc(
            'Permnumeric', 'perminv_mode:2trailing-bytes',
        ),
        moves: ' ',
        mode: INVOPT_FULL,
        enabled: true,
        errors: 0,
    }),
    Object.freeze({
        label: 'diagnostics and ordering preserve their visible source prefix',
        seed: 7612337,
        datetime: '20370912093700',
        nethackrc: startupRc(
            'Permerrors',
            'perminv_mode:full',
            'perminv_mode',
            'perminv_mode:zqxj',
            'perminv_mode:all',
            '!perminv_mode:full',
            'perminv_mode:on+grid',
            '!perminv_mode',
            'perminv_mode:all,perminv_mode:full',
            'perminv_mode:in-use',
            // The recorder path in config_error_done() is unknowable from a
            // replay input.  Later duplicate reports retain the established
            // fresh-differential boundary: tty fills before that summary,
            // while every diagnostic family above remains visible.
            ...Array(8).fill('perminv_mode:in-use'),
        ),
        moves: '\n',
        mode: INVOPT_IN_USE,
        enabled: true,
        errors: 21,
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

export function loadStartupPerminvModeRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_PERMINV_MODE_CASES.map(segmentFor),
    }, 'startup perminv_mode recipe');
}

function caseFor(segment) {
    return STARTUP_PERMINV_MODE_CASES.find((entry) => {
        const expected = segmentFor(entry);
        return expected.seed === segment.seed
            && expected.datetime === segment.datetime
            && expected.nethackrc === segment.nethackrc
            && expected.moves === segment.moves;
    });
}

function verifyFields(state, entry, phase) {
    if (state.iflags?.perminv_mode !== entry.mode
        || state.iflags?.perm_invent !== entry.enabled
        || state.flags?.perminv_mode !== undefined) {
        throw new Error(`${entry.label} has wrong ${phase} option state`);
    }
}

export async function verifyStartupPerminvModeSegment(segment) {
    const entry = caseFor(segment);
    if (!entry) throw new Error('no startup perminv_mode case owns segment');

    const parsed = parseNethackrc(segment.nethackrc);
    verifyFields(parsed, entry, 'parsed');
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
    verifyFields(game, entry, 'installed');
    if (!entry.errors && game.program_state?.in_moveloop !== 1) {
        throw new Error(`${entry.label} stopped before the first command`);
    }
}

export async function runStartupPerminvModeMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup perminv_mode to coupled iflags',
            recipe: loadStartupPerminvModeRecipe(),
        }],
        summaryLabel: 'STARTUP PERMINV MODE',
        verifySegment: verifyStartupPerminvModeSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runStartupPerminvModeMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `startup perminv_mode: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
