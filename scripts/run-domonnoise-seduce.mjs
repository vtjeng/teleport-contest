#!/usr/bin/env node

// Run the checked-in matrix for sounds.c domonnoise()'s ordinary MS_SEDUCE
// branch through fresh C recordings. The wizard-mode start makes the target
// nymph directly, so the recipe does not depend on an accidental fountain
// encounter or on a pet's later monster-combat turn.

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { MS_SEDUCE } from '../js/const.js';
import { S_NYMPH } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const SETUP_MOVES = '.#wizgenesis\nwater nymph\n';

export function loadDomonnoiseSeduceRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 7710002,
            datetime: '20270401090000',
            nethackrc: [
                'OPTIONS=name:SeduceTest,role:Wizard,race:human,gender:female,'
                + 'align:neutral',
                'OPTIONS=!legacy,!tutorial,!splash_screen',
                'OPTIONS=playmode:debug,pettype:none,!acoustics',
                '',
            ].join('\n'),
            moves: `${SETUP_MOVES}#chat\nu`,
        }],
    }, 'domonnoise seduce recipe');
}

// The seed was selected from 7710000-7710049 because 7710002 creates the
// requested awake female nymph adjacent to the female hero, with no pet.
// Verify those live setup facts before recording the C reference.
export async function verifyDomonnoiseSeduceSegment(segment) {
    await runSegment({ ...segment, moves: SETUP_MOVES });
    const nymphs = [];
    for (let monster = game.level.monlist; monster;
        monster = monster.nmon) {
        if (monster.data?.msound === MS_SEDUCE
            && monster.data?.mlet === S_NYMPH) nymphs.push(monster);
    }
    if (nymphs.length !== 1)
        throw new Error('seed did not create exactly one water nymph');
    const [nymph] = nymphs;
    if (nymph.msleeping || nymph.mpeaceful || nymph.mtame
        || !nymph.female)
        throw new Error('seed did not create the expected hostile female nymph');
    if (nymph.mx !== game.u.ux + 1 || nymph.my !== game.u.uy - 1)
        throw new Error('seed did not place the nymph at the chat target');
}

export async function runDomonnoiseSeduceMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'domonnoise seduce',
            recipe: loadDomonnoiseSeduceRecipe(),
        }],
        summaryLabel: 'DOMONNOISE SEDUCE',
        verifySegment: verifyDomonnoiseSeduceSegment,
    });
}

runMatrixCli(
    import.meta.url,
    runDomonnoiseSeduceMatrix,
    'domonnoise seduce',
);
