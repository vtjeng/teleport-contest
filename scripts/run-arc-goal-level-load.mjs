#!/usr/bin/env node

// Replay independent Archeologist routes into Arc-goal. Each route opens the
// wizard level menu and chooses Arc-goal, so the verifier observes the whole
// Lua loader's generated level on arrival.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { ALTAR, TEMPLE, W_NONDIGGABLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/Arc-goal.lua/arc-goal-level-teleport.session.json', import.meta.url),
    new URL('../recipes/Arc-goal.lua/arc-goal-level-teleport-variation.session.json', import.meta.url),
];

export function loadArcGoalRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Arc-goal recipe ${index + 1}`,
    ));
}

function linkedCount(head, next) {
    let count = 0;
    for (let item = head; item; item = item[next]) ++count;
    return count;
}

function altarCount() {
    let count = 0;
    for (let y = 0; y < 21; ++y)
        for (let x = 0; x < 80; ++x)
            if (game.level.at(x, y).typ === ALTAR) ++count;
    return count;
}

function nonDiggableCount() {
    let count = 0;
    for (let y = 0; y < 21; ++y)
        for (let x = 0; x < 80; ++x)
            if ((game.level.at(x, y).wall_info & W_NONDIGGABLE) !== 0)
                ++count;
    return count;
}

export async function verifyArcGoalSegment(segment) {
    await runSegment(segment);

    // Both independent fixture seeds place the quest branch at dnum 3 and
    // Arc-goal at its sixth level; these are fixture outcomes, not port constants.
    assert.equal(game.u.uz.dnum, 3);
    assert.equal(game.u.uz.dlevel, 6);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(
        game.level.rooms.filter(({ rtype }) => rtype === TEMPLE).length,
        1,
    );
    // Arc-goal.lua requests seven traps, 28 monsters, 15 objects, one altar
    // and one stair. The object lower bound permits other generation effects.
    assert.equal(game.level.traps.length, 7);
    assert.equal(linkedCount(game.level.monlist, 'nmon'), 28);
    assert.ok(linkedCount(game.level.objlist, 'nobj') >= 15);
    assert.equal(altarCount(), 1);
    assert.ok(nonDiggableCount() > 0);
    assert.equal(linkedCount(game.stairs, 'next'), 1);
    assert.equal(game.specialLevelAlign.length, 3);
}

export function runArcGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadArcGoalRecipes().map((recipe, index) => ({
            label: index === 0
                ? 'Arc-goal level load'
                : 'Arc-goal level load variation',
            recipe,
        })),
        summaryLabel: 'ARC-GOAL LEVEL LOAD',
        verifySegment: verifyArcGoalSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runArcGoalLevelLoadMatrix,
    'Arc-goal level load',
);
