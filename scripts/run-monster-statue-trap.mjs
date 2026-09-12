#!/usr/bin/env node

// Run the checked-in matrix for a monster that reaches a statue trap, through
// fresh C recordings. The monster waits on the level while the hero searches,
// so postmov() calls mintrap() when it walks onto the generated STATUE_TRAP.
// The selector's monster arm has no output, RNG, or trap-state change; the
// monster's mtrapseen bit records that mintrap() reached this entry point.
//
// Seed 8000535 was the first qualifying seed in the independent scan of
// 8000000-8000999 at this fixed clock. The scan ran one hundred search turns
// and kept games whose monster list had the STATUE_TRAP bit set in mtrapseen.

import assert from 'node:assert/strict';

import { STATUE_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

const STATUE_TRAP_BIT = 1 << (19 - 1);
const NETHACKRC = [
    'OPTIONS=name:StatueProbe,role:Valkyrie,race:human,gender:female,align:neutral',
    'OPTIONS=!legacy,!tutorial,!splash_screen',
    'OPTIONS=pettype:none,!acoustics,time',
    '',
].join('\n');

export function loadMonsterStatueTrapRecipe() {
    return validateCleanRecipe({
        version: 5,
        segments: [{
            seed: 8000535,
            datetime: '20310203040506',
            nethackrc: NETHACKRC,
            moves: 's'.repeat(100),
        }],
    }, 'monster statue trap recipe');
}

function* monstersOnLevel() {
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        yield monster;
}

export async function verifyMonsterStatueTrapSegment(segment) {
    let boundary = null;
    const replay = await runSegment(segment, {
        onBoundary: (error) => { boundary = error; },
    });
    assert.equal(boundary, null,
                 'the statue-trap route reaches its final search');
    assert.equal(replay.getScreens().length, segment.moves.length + 1,
                 'the route emits one opening screen and one per search');
    assert.ok(
        [...monstersOnLevel()].some((monster) =>
            (monster.mtrapseen & STATUE_TRAP_BIT) !== 0),
        'postmov() mintrap() records the statue-trap entry',
    );
    assert.ok(
        game.level.traps.some((trap) => trap.ttyp === STATUE_TRAP),
        'the no-op leaves the statue trap on the level',
    );
}

export async function runMonsterStatueTrapMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'monster statue trap',
            recipe: loadMonsterStatueTrapRecipe(),
        }],
        verifySegment: verifyMonsterStatueTrapSegment,
        chunkLimit: 1,
        summaryLabel: 'MONSTER STATUE TRAP',
    });
}

runMatrixCli(import.meta.url, runMonsterStatueTrapMatrix, 'monster statue trap');
