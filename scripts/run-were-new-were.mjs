#!/usr/bin/env node

// Fresh differential for were.c new_were() (95-138). The debug genesis
// command creates a human-form wererat, and the forced no-op gives ordinary
// upkeep its daytime rn2(50) transformation check. The generated monster's
// carried inventory is empty in this route; scripts/mon.test.mjs separately
// pins the source rule that unworn inventory does not block the transformation.
//
// Seed 7710052 was selected by a port-side scan over 7710000-7710199 with
// these exact inputs; it was not copied from the fixed holdout session. Five
// seeds reached the animal form, and this one is kept as the independent
// recording case.

import assert from 'node:assert/strict';

import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_WERERAT } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const RECIPE = {
    seed: 7710052,
    datetime: '20270318143000',
    nethackrc: [
        'OPTIONS=name:WereProbe,role:Wizard,race:human,gender:male,align:neutral,playmode:debug',
        'OPTIONS=!legacy,!tutorial,!splash_screen,!autopickup,pettype:none,!acoustics',
        '',
    ].join('\n'),
    moves: '.\x07human wererat\nm.',
};

export function loadWereNewWereRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [RECIPE],
    }, 'were.c new_were recipe');
}

export async function verifyWereNewWereSegment(segment) {
    await runSegment(segment);
    let wererat = null;
    for (let monster = game.level?.monlist; monster; monster = monster.nmon) {
        if (monster.data?.pmidx === PM_WERERAT) {
            wererat = monster;
            break;
        }
    }
    assert.ok(wererat, 'new_were did not produce a wererat animal form');
    assert.equal(game.nhDisplay.toplines, 'The wererat changes into a rat.');
}

export async function runWereNewWereMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'were.c new_were human wererat',
            recipe: loadWereNewWereRecipe(),
        }],
        summaryLabel: 'WERE.C NEW_WERE',
        verifySegment: verifyWereNewWereSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWereNewWereMatrix, 'were.c new_were');
