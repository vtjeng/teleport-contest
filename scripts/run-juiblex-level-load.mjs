#!/usr/bin/env node

// Record and replay the bounded wizard level-teleport route to Juiblex.
// The recipe contains replay inputs only; runFreshMatrix() records its C
// reference output in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    M_AP_FURNITURE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import {
    PM_GIANT_MIMIC,
    PM_JUIBLEX,
    PM_LEMURE,
} from '../js/monsters.js';
import { S_fountain } from '../js/symbols.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/juiblex.lua/juiblex-level-teleport.session.json',
    import.meta.url,
);

export function loadJuiblexLevelTeleRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'wizard Juiblex level teleport recipe',
    );
}

function monsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

export async function verifyJuiblexLevelTeleSegment(segment) {
    await runSegment(segment);

    assert.deepEqual(game.u.uz, game.juiblex_level);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.shortsighted, true);
    assert.equal(game.level.flags.has_swamp, true);
    assert.equal(game.level.flags.nfountains, 1);
    assert.equal(game.level.traps.length, 6);

    const levelMonsters = monsters();
    assert.equal(
        levelMonsters.filter(({ data }) => data?.pmidx === PM_JUIBLEX).length,
        1,
    );
    assert.equal(
        levelMonsters.filter(({ data }) => data?.pmidx === PM_LEMURE).length,
        3,
    );
    const fountainMimics = levelMonsters.filter(
        ({ data, m_ap_type, mappearance }) =>
            data?.pmidx === PM_GIANT_MIMIC
            && m_ap_type === M_AP_FURNITURE
            && mappearance === S_fountain,
    );
    assert.equal(fountainMimics.length, 3);
}

export function runJuiblexLevelTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard Juiblex level teleport',
            recipe: loadJuiblexLevelTeleRecipe(),
        }],
        summaryLabel: 'WIZARD JUIBLEX LEVEL TELEPORT',
        verifySegment: verifyJuiblexLevelTeleSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runJuiblexLevelTeleMatrix,
    'wizard Juiblex level teleport',
);
