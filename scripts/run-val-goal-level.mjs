#!/usr/bin/env node

// The admitted v36 quest case exercises natural Val-goal arrival; independent
// male and female recipes exercise the wizard des-file entry point.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { ART_ORB_OF_FATE } from '../js/artifacts.js';
import { PM_FIRE_GIANT, PM_LORD_SURTUR } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyValGoalSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, true);
    assert.equal(game.level.flags.is_maze_lev, true);
    const objects = linkedItems(game.level.objlist, 'nobj');
    const orb = objects.find(object => object.oartifact === ART_ORB_OF_FATE);
    assert.ok(orb);
    assert.equal(orb.blessed, true);
    assert.equal(orb.spe, 5);
    const monsters = linkedItems(game.level.monlist, 'nmon');
    assert.ok(monsters.some(monster => monster.mnum === PM_LORD_SURTUR));
    assert.ok(monsters.some(monster => monster.mnum === PM_FIRE_GIANT && !monster.mpeaceful));
    assert.equal(game.level.traps.length, 9);
}

export function loadValGoalRecipes() {
    return ['human', 'dwarf'].map(race => {
        const recipePath = new URL(
            `../recipes/Val-goal.lua/val-goal-direct-${race}-independent.session.json`,
            import.meta.url,
        );
        return validateCleanRecipe(JSON.parse(readFileSync(recipePath, 'utf8')), recipePath.pathname);
    });
}

export function runValGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadValGoalRecipes().map((recipe, index) => ({
            label: index === 0 ? 'human Valkyrie direct Val-goal load'
                : 'dwarf Valkyrie direct Val-goal load',
            recipe,
        })),
        summaryLabel: 'VAL-GOAL DIRECT LEVEL LOAD',
        verifySegment: verifyValGoalSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(import.meta.url, runValGoalLevelLoadMatrix, 'Val-goal direct level load');
