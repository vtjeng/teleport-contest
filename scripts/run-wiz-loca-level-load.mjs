#!/usr/bin/env node

// Independent Wizard recipes enter Wiz-loca through the level-teleport menu
// with DECgraphics and default symbols. The recipes document their seed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Is_special } from '../js/dungeon.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

async function verifyWizLocaSegment(segment) {
    await runSegment(segment);
    assert.equal(Is_special(game.u.uz)?.proto, 'Wiz-loca');
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.hardfloor, true);
    // Wiz-loca.lua declares five irregular rooms and 27 monsters: twelve
    // bats, seven imps, seven vampire bats, then one more imp.
    assert.equal(game.level.nroom, 5);
    let monsters = 0;
    for (let mon = game.level.monlist; mon; mon = mon.nmon) ++monsters;
    assert.equal(monsters, 27);
    // Both source stairs remain after map reflection and post-processing.
    const stairs = [];
    for (let stair = game.stairs; stair; stair = stair.next) stairs.push(stair);
    assert.equal(stairs.length, 2);
    assert.deepEqual(stairs.map(({ up }) => Boolean(up)).sort(), [false, true]);
}

function runWizLocaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['', '-variation'].map((suffix) => ({
            label: suffix ? 'default-symbol Wizard locate level' : 'DECgraphics Wizard locate level',
            recipe: JSON.parse(readFileSync(new URL(
                `../recipes/Wiz-loca.lua/wizard-locate${suffix}.session.json`,
                import.meta.url,
            ), 'utf8')),
        })),
        summaryLabel: 'WIZ-LOCA LEVEL LOAD',
        verifySegment: verifyWizLocaSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runWizLocaLevelLoadMatrix, 'Wiz-loca level load');
