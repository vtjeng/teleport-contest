#!/usr/bin/env node

// Record and replay the normal-mode, unpolymorphed lethal adjacent water
// demon attack from mhitu.c mattacku() -> hitmu() -> mdamageu(). The checked
// in recipe ends at the strict pre-endgame boundary. The port-side verifier
// appends one key to prove that the live replay reaches the ordinary disclosure
// entry and preserves the killer state.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { KILLED_BY_AN } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
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

export function loadMonsterDeathPlanningRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: MONSTER_DEATH_CASE.seed,
            datetime: MONSTER_DEATH_CASE.datetime,
            nethackrc: nethackrc(),
            moves: MONSTER_DEATH_CASE.moves,
        }],
    }, 'monster death planning recipe');
}

function caseFor(segment) {
    const expected = loadMonsterDeathPlanningRecipe().segments[0];
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
// beyond the original planning slice.
export async function verifyMonsterDeathPlanningSegment(segment) {
    const entry = caseFor(segment);
    await runSegment({
        ...segment,
        moves: `${segment.moves}${MORE}`,
    });

    assert.equal(game.program_state?.gameover, 1);
    assert.equal(game.program_state?.in_really_done, true);
    assert.equal(game.u.uhp, 0, 'done_in_by() must leave HP at zero');
    assert.equal(game.u.umortality, 1,
                 'done() must increment mortality exactly once');
    assert.deepEqual(game.killer, {
        name: entry.killer,
        format: entry.format,
    });
}

export async function runMonsterDeathPlanningMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster death planning and live DIED propagation',
            recipe: loadMonsterDeathPlanningRecipe(),
        }],
        summaryLabel: 'MONSTER DEATH PLANNING',
        verifySegment: verifyMonsterDeathPlanningSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterDeathPlanningMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster death planning: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
