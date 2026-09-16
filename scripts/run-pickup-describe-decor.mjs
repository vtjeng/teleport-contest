#!/usr/bin/env node

// Fresh production recordings for pickup.c describe_decor().  Each segment
// starts at the generated upstairs, walks through ordinary terrain, and
// arrives on a generated doorway.  C suppresses the doorway feature noun but
// still remembers DOOR in iflags.prev_decor; the verifier checks that source
// state after the same production movement path.

import { DOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

export function loadPickupDescribeDecorRecipes() {
    return validateCleanRecipe({
        version: 5,
        segments: [
            {
                seed: 7744221,
                datetime: '20380412080910',
                nethackrc: 'OPTIONS=name:A15DoorA,role:Rogue,race:human,gender:female,align:chaotic\n'
                    + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,mention_decor,!autopickup\n',
                moves: ' lkl',
            },
            {
                seed: 7744222,
                datetime: '20390523060711',
                nethackrc: 'OPTIONS=name:A15DoorB,role:Valkyrie,race:human,gender:female,align:lawful\n'
                    + 'OPTIONS=!legacy,!tutorial,!splash_screen,pettype:none,!acoustics,mention_decor\n',
                moves: '  jj',
            },
        ],
    }, 'pickup describe_decor doorway recipe');
}

function storageProbe() {
    const values = new Map();
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        get length() { return values.size; },
        key(index) { return [...values.keys()][index] ?? null; },
    };
}

export async function verifyPickupDescribeDecorSegment(segment) {
    let boundary = null;
    const replay = await runSegment(
        { ...segment, storage: storageProbe() },
        { onBoundary: (error) => { boundary = error; } },
    );
    if (boundary) throw boundary;
    const { u } = game;
    const location = game.level.at(u.ux, u.uy);
    if (location?.typ !== DOOR || game.iflags.prev_decor !== DOOR) {
        throw new Error('production route did not remember the doorway terrain');
    }
    if (game._ttyMessageStopped || game.nhDisplay.inputQueueLength !== 0) {
        throw new Error('doorway route left a message or input boundary');
    }
    if (game.context.run !== 0 || game.multi !== 0 || replay.getRngLog().length < 1) {
        throw new Error('doorway route did not finish as an ordinary move');
    }
}

export async function runPickupDescribeDecorMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'pickup describe_decor doorway',
            recipe: loadPickupDescribeDecorRecipes(),
        }],
        summaryLabel: 'PICKUP DESCRIBE_DECOR DOORWAY',
        verifySegment: verifyPickupDescribeDecorSegment,
    });
}

runMatrixCli(import.meta.url, runPickupDescribeDecorMatrix,
    'pickup describe_decor doorway');
