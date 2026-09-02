#!/usr/bin/env node

// Record and replay options.c optfn_paranoid_confirmation() through its live
// pray.c dopray() consumer.  One case clears PARANOID_CONFIRM while retaining
// PARANOID_PRAY, so prayer uses the ordinary single-key query.  The other
// clears both bits, so prayer begins without a query.

import {
    PARANOID_CONFIRM,
    PARANOID_PRAY,
    PARANOID_SWIM,
    PARANOID_TRAP,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const DATETIME = '20390704121500';
const WAIT = '.';
const PRAY = '#pray\n';

function nethackrc(...paranoiaLines) {
    return [
        'OPTIONS=name:Careful,role:Samurai,race:human,gender:male,align:lawful',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,!autopickup',
        ...paranoiaLines.map(
            (value) => `OPTIONS=paranoid_confirmation:${value}`,
        ),
        '',
    ].join('\n');
}

export const STARTUP_PARANOIA_CASES = Object.freeze([
    Object.freeze({
        label: 'clear Confirm and decline the single-key prayer query',
        seed: 6120001,
        nethackrc: nethackrc('Confirm pray', '-Confirm'),
        moves: `${WAIT}${PRAY}n${WAIT}${WAIT}`,
        bits: PARANOID_PRAY,
        prayers: 0,
    }),
    Object.freeze({
        label: 'clear Confirm and pray to skip the query',
        seed: 6120001,
        nethackrc: nethackrc('+Confirm', '-Confirm pray'),
        // The space dismisses angrygods()'s --More-- after the three-turn
        // prayer.  No confirmation answer appears between the newline and it.
        moves: `${WAIT}${PRAY} `,
        bits: PARANOID_SWIM | PARANOID_TRAP,
        prayers: 1,
    }),
]);

function segmentFor(entry) {
    return {
        seed: entry.seed,
        datetime: DATETIME,
        nethackrc: entry.nethackrc,
        moves: entry.moves,
    };
}

export function loadStartupParanoiaRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: STARTUP_PARANOIA_CASES.map(segmentFor),
    }, 'startup paranoid confirmation recipe');
}

function caseFor(segment) {
    const found = STARTUP_PARANOIA_CASES.find((entry) => (
        entry.nethackrc === segment.nethackrc && entry.moves === segment.moves
    ));
    if (!found) throw new Error('no startup paranoia case owns segment');
    return found;
}

export async function verifyStartupParanoiaSegment(segment) {
    const entry = caseFor(segment);
    let boundary = null;
    await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (game.flags.paranoia_bits !== entry.bits) {
        throw new Error(
            `${entry.label} left paranoia_bits=${game.flags.paranoia_bits}, `
                + `not ${entry.bits}`,
        );
    }
    if (game.flags.paranoid_confirmation !== undefined) {
        throw new Error(`${entry.label} retained raw option text`);
    }
    if (game.flags.paranoia_bits & PARANOID_CONFIRM) {
        throw new Error(`${entry.label} retained ParanoidConfirm`);
    }
    if (game.u.uconduct.gnostic !== entry.prayers) {
        throw new Error(
            `${entry.label} recorded ${game.u.uconduct.gnostic} prayers, `
                + `not ${entry.prayers}`,
        );
    }
    if (entry.prayers === 0) {
        if (game.gp?.p_type !== undefined) {
            throw new Error(`${entry.label} reached can_pray()`);
        }
    } else if (game.gp?.p_type !== 0 || game.u.ugangr !== entry.prayers
               || game.multi !== 0 || game.afternmv !== null) {
        throw new Error(`${entry.label} did not finish its prayer`);
    }
}

export async function runStartupParanoiaMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'startup paranoid confirmation to prayer',
            recipe: loadStartupParanoiaRecipe(),
        }],
        summaryLabel: 'STARTUP PARANOID CONFIRMATION',
        verifySegment: verifyStartupParanoiaSegment,
    });
}

runMatrixCli(import.meta.url, runStartupParanoiaMatrix, 'startup paranoid confirmation');
