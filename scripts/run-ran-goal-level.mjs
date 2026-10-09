#!/usr/bin/env node

// The admitted v36 quest case exercises natural Ran-goal arrival; independent
// male and female recipes exercise the wizard des-file entry point.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { PM_SCORPIUS } from '../js/monsters.js';
import { ART_LONGBOW_OF_DIANA } from '../js/artifacts.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyRanGoalSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    assert.equal(game.level.flags.is_maze_lev, true);
    // A direct wizard load starts on dungeon level 1, where mkstairs()
    // intentionally omits an up stair; the source call order is pinned below.
    assert.equal(game.level.traps.length, 6);

    const objects = linkedItems(game.level.objlist, 'nobj');
    const bow = objects.find(object => object.oartifact === ART_LONGBOW_OF_DIANA);
    assert.ok(bow);
    assert.equal(bow.blessed, true);
    assert.equal(bow.spe, 0);

    const monsters = linkedItems(game.level.monlist, 'nmon');
    assert.equal(monsters.length, 28);
    assert.ok(monsters.some(monster => monster.mnum === PM_SCORPIUS));
    assert.ok(monsters.every(monster => !monster.mpeaceful));
}

export function loadRanGoalRecipes() {
    return ['male', 'female'].map(gender => {
        const path = new URL(
            `../recipes/Ran-goal.lua/ran-goal-direct-${gender}-independent.session.json`,
            import.meta.url,
        );
        return validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname);
    });
}

export function runRanGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadRanGoalRecipes().map((recipe, index) => ({
            label: index === 0 ? 'male Ranger direct Ran-goal load'
                : 'female Ranger direct Ran-goal load',
            recipe,
        })),
        summaryLabel: 'RAN-GOAL DIRECT LEVEL LOAD',
        verifySegment: verifyRanGoalSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runRanGoalLevelLoadMatrix, 'Ran-goal direct level load');
