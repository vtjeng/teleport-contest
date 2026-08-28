#!/usr/bin/env node

// Run the checked-in matrix for mthrowu.c m_throw()/thitu()/drop_throw()'s
// ordinary quantity-one hit settlement.
//
// A bounded scan covered seeds 9200001-9200100 at 20260827130000, with a
// speed-boots wish, goblin genesis, and up to seven eastward steps. Seed
// 9200038 produced an ordinary orcish-dagger hit; reducing its input showed
// that three eastward steps are the shortest prefix that reaches settlement.

import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { OBJ_FLOOR } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ORCISH_DAGGER } from '../js/objects.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix } from './fresh-matrix.mjs';
const SCRIPT_PATH = fileURLToPath(import.meta.url);
export const GENESIS_KEY = '\u0007';

function nethackrc() {
    return [
        'OPTIONS=name:RangedSettlement,role:Valkyrie,race:human,'
        + 'gender:female,align:neutral',
        'OPTIONS=!legacy,!tutorial,!splash_screen',
        'OPTIONS=playmode:debug',
        'OPTIONS=pettype:none,rest_on_space,!safe_wait',
        '',
    ].join('\n');
}

export function loadMonsterRangedSettlementRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 9200038,
            datetime: '20260827130000',
            nethackrc: nethackrc(),
            moves: ` #wizwish\nspeed boots\nWe${GENESIS_KEY}goblin\n`
                + 'lll',
        }],
    }, 'monster ranged settlement recipe');
}

function firstRow() {
    return game.nhDisplay.grid[0].map((cell) => cell.ch).join('').trimEnd();
}

function heroFloorPile() {
    const pile = [];
    for (let object = game.level.objects[game.u.ux][game.u.uy];
        object;
        object = object.nexthere) {
        pile.push(object);
    }
    return pile;
}

export async function verifyMonsterRangedSettlementSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    if (boundary) throw boundary;
    if (replay.getScreens().length !== segment.moves.length + 1)
        throw new Error('monster ranged settlement stopped before the hit');
    assert.equal(
        firstRow(),
        'The goblin throws an orcish dagger!  '
        + 'You are hit by an orcish dagger.',
    );

    const daggers = heroFloorPile().filter(
        (object) => object.otyp === ORCISH_DAGGER,
    );
    assert.equal(daggers.length, 1);
    assert.equal(daggers[0].where, OBJ_FLOOR);
    assert.equal(daggers[0].ox, game.u.ux);
    assert.equal(daggers[0].oy, game.u.uy);
    assert.deepEqual(game.m_shot, { s: false, o: 0, n: 0, i: 0 });
    assert.equal(game.gt.thrownobj, null);
}

export async function runMonsterRangedSettlementMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'ordinary monster missile hit settlement',
            recipe: loadMonsterRangedSettlementRecipe(),
        }],
        summaryLabel: 'MONSTER RANGED SETTLEMENT',
        verifySegment: verifyMonsterRangedSettlementSegment,
    });
}

async function main(argv) {
    if (argv.length) throw new Error('arguments are not accepted');
    const result = await runMonsterRangedSettlementMatrix();
    return result.passed ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === SCRIPT_PATH) {
    main(process.argv.slice(2)).then((status) => {
        process.exitCode = status;
    }).catch((error) => {
        process.stderr.write(
            `monster ranged settlement: ${error.message || error}\n`,
        );
        process.exitCode = 2;
    });
}
