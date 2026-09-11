#!/usr/bin/env node

// Record and replay the bounded wizard level-teleport route to Asmodeus.
// The recipe contains replay inputs only; runFreshMatrix() records its C
// reference output in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { PM_ASMODEUS } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { LAVAPOOL } from '../js/const.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/asmodeus.lua/asmodeus-level-teleport.session.json',
    import.meta.url,
);

export function loadAsmodeusLevelTeleRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'wizard Asmodeus level teleport recipe',
    );
}

function monsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

export async function verifyAsmodeusSegment(segment) {
    await runSegment(segment);

    assert.deepEqual(game.u.uz, game.asmodeus_level);
    assert.equal(game.level.flags.is_maze_lev, true);

    const asmodeus = monsters().filter(
        (monster) => monster.data?.pmidx === PM_ASMODEUS,
    );
    assert.equal(asmodeus.length, 1);

    // The two source maps provide one up and one down stair in the finished
    // Gehennom level; hell_tweaks() also leaves lava in this independently
    // selected case.
    assert.equal(game.stairs?.up, true);
    assert.equal(game.stairs?.next?.up, false);
    assert.ok(game.level.traps.length >= 6);
    let lava = 0;
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y)
            if (game.level.at(x, y).typ === LAVAPOOL) ++lava;
    }
    assert.ok(lava > 0);
}

export async function runAsmodeusLevelTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard Asmodeus level teleport',
            recipe: loadAsmodeusLevelTeleRecipe(),
        }],
        summaryLabel: 'WIZARD ASMODEUS LEVEL TELEPORT',
        verifySegment: verifyAsmodeusSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runAsmodeusLevelTeleMatrix,
    'wizard Asmodeus level teleport',
);
