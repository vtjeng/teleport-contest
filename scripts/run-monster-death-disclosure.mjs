#!/usr/bin/env node

// Record and replay a normal-mode monster death through the default end-game
// disclosure family. The recipe contains replay inputs only; runFreshMatrix()
// records a new C reference in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);

const MONSTER_DEATH_DISCLOSURE_CASE = Object.freeze({
    label: 'ordinary water-demon death with default disclosures',
    seed: 6,
    datetime: '20260503024327',
    nethackrc: 'OPTIONS=symset:DECgraphics\n',
    // Character selection, fountain water-demon setup, and the six default
    // disclosure answers are all replay inputs. The final spaces dismiss the
    // disclosure --More-- prompts and the tombstone/farewell messages.
    moves: 'Hextrum\rnwofaHextra\rn~abcrRHED\rwgf\r   nLlnLLllllOo$"!=/?'
        + '\r efef fe l p  K,lUUHyhllnbhhhyKKkuLkj@,k> kqyj <    y  y  y y y  ',
});

export function loadMonsterDeathDisclosureRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: MONSTER_DEATH_DISCLOSURE_CASE.seed,
            datetime: MONSTER_DEATH_DISCLOSURE_CASE.datetime,
            nethackrc: MONSTER_DEATH_DISCLOSURE_CASE.nethackrc,
            moves: MONSTER_DEATH_DISCLOSURE_CASE.moves,
        }],
    }, 'monster death disclosure recipe');
}

export async function verifyMonsterDeathDisclosureSegment(segment) {
    const replay = await runSegment(segment);
    assert.equal(game.program_state?.gameover, 1);
    assert.equal(game.killer?.name, 'water demon');
    assert.equal(game.u?.umortality, 1);
    assert.equal(replay.getScreens().length, 123);
}

export async function runMonsterDeathDisclosureMatrix() {
    return runFreshMatrix({
        entries: [{
            label: MONSTER_DEATH_DISCLOSURE_CASE.label,
            recipe: loadMonsterDeathDisclosureRecipe(),
        }],
        summaryLabel: 'MONSTER DEATH DISCLOSURE',
        verifySegment: verifyMonsterDeathDisclosureSegment,
        chunkLimit: 1,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterDeathDisclosureMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster death disclosure: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
