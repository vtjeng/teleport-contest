#!/usr/bin/env node

// Record and replay the bounded wizard level-teleport route to Orcus. The
// recipe contains replay inputs only; runFreshMatrix() records its C reference
// output in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { MAGIC_LAMP } from '../js/objects.js';
import { PM_ORCUS, PM_SHOPKEEPER } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/orcus.lua/orcus-level-teleport.session.json',
    import.meta.url,
);

export function loadOrcusLevelTeleRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'wizard Orcus level teleport recipe',
    );
}

function monsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

export async function verifyOrcusSegment(segment) {
    await runSegment(segment);

    assert.deepEqual(game.u.uz, game.orcus_level);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.shortsighted, true);
    assert.equal(game.level.flags.has_shop, true);
    assert.equal(game.level.flags.has_morgue, true);

    const levelMonsters = monsters();
    assert.equal(
        levelMonsters.filter(({ data }) => data?.pmidx === PM_ORCUS).length,
        1,
    );
    // shknam.c stock_room() removes both keepers on Orcus: it is a ghost town.
    assert.equal(
        levelMonsters.filter(
            ({ data }) => data?.pmidx === PM_SHOPKEEPER,
        ).length,
        0,
    );
    // The selected seed's rn2(2) result chooses the compensation lamp. Its
    // object ID is stable in objects.js and proves the branch ran on-level.
    let lamps = 0;
    for (let object = game.level.objlist; object; object = object.nobj)
        if (object.otyp === MAGIC_LAMP) ++lamps;
    assert.equal(lamps, 1);
    assert.equal(game.level.traps.length, 12);
}

export function runOrcusLevelTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard Orcus level teleport',
            recipe: loadOrcusLevelTeleRecipe(),
        }],
        summaryLabel: 'WIZARD ORCUS LEVEL TELEPORT',
        verifySegment: verifyOrcusSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runOrcusLevelTeleMatrix,
    'wizard Orcus level teleport',
);
