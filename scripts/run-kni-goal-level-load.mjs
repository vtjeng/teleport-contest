#!/usr/bin/env node

// These independently selected wizard-mode routes choose Kni-goal from the
// level menu. The verifier checks the special-level identity and the
// source-defined population after the strict C/JS differential has matched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { W_NONDIGGABLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { find_level } from '../js/dungeon.js';
import { MIRROR } from '../js/objects.js';
import { PM_IXOTH, PM_OCHRE_JELLY, PM_QUASIT } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/Kni-goal.lua/kni-goal-level-teleport.session.json', import.meta.url),
    new URL('../recipes/Kni-goal.lua/kni-goal-level-teleport-variation.session.json', import.meta.url),
];

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

function nonDiggableCount() {
    let count = 0;
    for (let y = 0; y < 21; ++y)
        for (let x = 0; x < 80; ++x)
            if ((game.level.at(x, y).wall_info & W_NONDIGGABLE) !== 0) ++count;
    return count;
}

export async function verifyKniGoalSegment(segment) {
    await runSegment(segment);

    const goal = find_level('Kni-goal');
    assert.equal(game.u.uz.dnum, goal.dlevel.dnum);
    assert.equal(game.u.uz.dlevel, goal.dlevel.dlevel);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.traps.length, 8);
    assert.ok(nonDiggableCount() > 0);
    assert.equal(linkedItems(game.stairs, 'next').length, 1);

    const objects = linkedItems(game.level.objlist, 'nobj');
    assert.ok(objects.length >= 22);
    assert.ok(objects.some((object) => object.otyp === MIRROR
        && object.oextra?.oname === 'The Magic Mirror of Merlin'));

    const monsters = linkedItems(game.level.monlist, 'nmon');
    assert.ok(monsters.length >= 28);
    assert.equal(monsters.filter(({ mnum }) => mnum === PM_IXOTH).length, 1);
    assert.ok(monsters.filter(({ mnum }) => mnum === PM_QUASIT).length >= 16);
    assert.ok(monsters.filter(({ mnum }) => mnum === PM_OCHRE_JELLY).length >= 8);
    assert.ok(monsters.every(({ mpeaceful }) => !mpeaceful));
}

export function loadKniGoalRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Kni-goal recipe ${index + 1}`,
    ));
}

export function runKniGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadKniGoalRecipes().map((recipe, index) => ({
            label: index === 0 ? 'Kni-goal level load' : 'Kni-goal level load variation',
            recipe,
        })),
        summaryLabel: 'KNI-GOAL LEVEL LOAD',
        verifySegment: verifyKniGoalSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runKniGoalLevelLoadMatrix, 'Kni-goal level load');
