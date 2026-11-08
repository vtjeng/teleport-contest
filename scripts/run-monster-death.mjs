#!/usr/bin/env node

// Record and replay the normal-mode, unpolymorphed lethal adjacent water
// demon attack from mhitu.c mattacku() -> hitmu() -> mdamageu(). The checked
// in recipe ends at the strict pre-endgame boundary. The port-side verifier
// appends one key to prove that the live replay reaches the ordinary disclosure
// entry and preserves the killer state.

import assert from 'node:assert/strict';

import { KILLED_BY_AN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegmentStrict as runSegment } from '../js/jsmain.js';
import { isTerminated } from '../js/rng.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const MORE = ' ';

export const MONSTER_DEATH_CASE = Object.freeze({
    label: 'a normal adjacent water demon kills the unpolymorphed hero',
    // The bounded development-side scan selected the first seed whose
    // fountain summons a water demon and whose two adjacent physical attacks
    // make the second attack lethal. The scan stopped after this complete
    // witness was replayed through the ordinary death entry.
    seed: 7710029,
    datetime: '20260831120000',
    role: 'Tourist',
    race: 'human',
    gender: 'male',
    align: 'neutral',
    // Five eastward steps reach the fountain; q/y drinks from it. The first
    // m. leaves ten hit points at two after the source's two physical damage
    // rolls, and the second m. reaches mdamageu()'s lethal arm.
    moves: 'lllllqym.m.',
    killer: 'water demon',
    format: KILLED_BY_AN,
});

function nethackrc() {
    return [
        `OPTIONS=name:Fresh,role:${MONSTER_DEATH_CASE.role},`
        + `race:${MONSTER_DEATH_CASE.race},gender:${MONSTER_DEATH_CASE.gender},`
        + `align:${MONSTER_DEATH_CASE.align}`,
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=pettype:none,!acoustics,time',
        '',
    ].join('\n');
}

export function loadMonsterDeathRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: MONSTER_DEATH_CASE.seed,
            datetime: MONSTER_DEATH_CASE.datetime,
            nethackrc: nethackrc(),
            moves: MONSTER_DEATH_CASE.moves,
        }],
    }, 'monster death recipe');
}

function caseFor(segment) {
    const expected = loadMonsterDeathRecipe().segments[0];
    if (segment.seed !== expected.seed
        || segment.datetime !== expected.datetime
        || segment.nethackrc !== expected.nethackrc
        || segment.moves !== expected.moves) {
        throw new Error('no case describes the monster death segment');
    }
    return MONSTER_DEATH_CASE;
}

// runFreshMatrix() uses the strict recipe above for the C/JS differential.
// This extra key is intentionally not part of that recipe: C spends it
// dismissing "You die..." and enters end.c disclosure, one source boundary
// beyond the recipe.
export async function verifyMonsterDeathSegment(segment) {
    const entry = caseFor(segment);
    await runSegment({
        ...segment,
        moves: `${segment.moves}${MORE}`,
    });

    // really_done() set gameover at entry and the replay ran out at its first
    // prompt, before nh_terminate() ended the segment.
    assert.equal(game.program_state?.gameover, 1);
    assert.equal(isTerminated(), false);
    assert.equal(game.u.uhp, 0, 'done_in_by() must leave HP at zero');
    assert.equal(game.u.umortality, 1,
                 'done() must increment mortality exactly once');
    assert.deepEqual(game.killer, {
        name: entry.killer,
        format: entry.format,
    });
}

export async function runMonsterDeathMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster death and live DIED propagation',
            recipe: loadMonsterDeathRecipe(),
        }],
        summaryLabel: 'MONSTER DEATH',
        verifySegment: verifyMonsterDeathSegment,
    });
}

runMatrixCli(import.meta.url, runMonsterDeathMatrix, 'monster death');
