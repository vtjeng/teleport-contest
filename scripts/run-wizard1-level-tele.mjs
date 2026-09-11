#!/usr/bin/env node

// Record and replay the bounded wizard level-teleport route to Wizard1.
// The recipe contains replay inputs only; runFreshMatrix() records its C
// reference output in an isolated temporary workspace.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { SPE_BOOK_OF_THE_DEAD } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { PM_HELL_HOUND, PM_WIZARD_OF_YENDOR } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATH = new URL(
    '../recipes/wizard1.lua/wizard1-level-teleport.session.json',
    import.meta.url,
);

export function loadWizard1LevelTeleRecipe() {
    return validateCleanRecipe(
        JSON.parse(readFileSync(RECIPE_PATH, 'utf8')),
        'wizard Wizard1 level teleport recipe',
    );
}

function monsters() {
    const result = [];
    for (let monster = game.level.monlist; monster; monster = monster.nmon)
        result.push(monster);
    return result;
}

export async function verifyWizard1Segment(segment) {
    await runSegment(segment);

    assert.deepEqual(game.u.uz, game.wiz1_level);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);

    const levelMonsters = monsters();
    assert.equal(
        levelMonsters.filter(({ data }) => data?.pmidx === PM_WIZARD_OF_YENDOR)
            .length,
        1,
    );
    assert.ok(
        levelMonsters.some(({ data }) => data?.pmidx === PM_HELL_HOUND),
    );

    const bookCount = [];
    for (let object = game.level.objlist; object; object = object.nobj) {
        if (object.otyp === SPE_BOOK_OF_THE_DEAD) bookCount.push(object);
    }
    assert.equal(bookCount.length, 1);

    // The level has an upstairs, downstairs, and source-defined down ladder;
    // the chain order is the reverse of descriptor creation in mkstairs().
    assert.equal(game.stairs?.up, false);
    assert.equal(game.stairs?.next?.up, true);
    assert.equal(game.stairs?.next?.next?.isladder, true);
    assert.equal(game.stairs?.next?.next?.up, false);
    assert.ok(game.level.traps.length >= 8);
}

export function runWizard1LevelTeleMatrix() {
    return runFreshMatrix({
        entries: [{
            label: 'wizard Wizard1 level teleport',
            recipe: loadWizard1LevelTeleRecipe(),
        }],
        summaryLabel: 'WIZARD1 LEVEL TELEPORT',
        verifySegment: verifyWizard1Segment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runWizard1LevelTeleMatrix,
    'wizard Wizard1 level teleport',
);
