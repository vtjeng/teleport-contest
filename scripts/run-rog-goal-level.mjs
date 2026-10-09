#!/usr/bin/env node
// Seeds17409107/13, clocks and male/female human Rogue inputs were fixed
// independently before C recording/comparison; explicit and extensionless
// registered names exercise the two filename forms. No seed search.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ART_MASTER_KEY_OF_THIEVERY } from '../js/artifacts.js';
import { PM_CHAMELEON, PM_MASTER_ASSASSIN, PM_SHARK } from '../js/monsters.js';
import { SKELETON_KEY, TIN } from '../js/objects.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
function linked(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}
export async function verifyRogGoalSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true); // Lua7 two explicit flags.
    const monsters = linked(game.level.monlist, 'nmon');
    assert.equal(monsters.length, 39); // Lua72–110 complete fixed/random population.
    assert.equal(monsters.filter(m => m.mnum === PM_MASTER_ASSASSIN).length, 1);
    assert.equal(monsters.filter(m => m.mnum === PM_SHARK).length, 4);
    assert.equal(game.level.traps.length, 12); // Lua41fixed spiked pit plus11random traps.
    const stairs = linked(game.stairs, 'next');
    assert.equal(stairs.length, 1);
    assert.equal(stairs[0].up, true); // Lua36 no down staircase.
    const objects = linked(game.level.objlist, 'nobj');
    const artifact = objects.find(o => o.oartifact === ART_MASTER_KEY_OF_THIEVERY);
    assert.ok(artifact);
    assert.equal(artifact.otyp, SKELETON_KEY);
    assert.equal(artifact.spe, 0);
    assert.equal(artifact.blessed, true); // Lua44 exact named artifact descriptor.
    const tin = objects.find(o => o.otyp === TIN && o.corpsenm === PM_CHAMELEON);
    assert.ok(tin); // Lua45 must reach canonical named-species parsing.
    assert.equal(tin.spe, 0); // lspo_object source resets tin's generated spinach spe.
}
export function runRogGoalMatrix() {
    return runFreshMatrix({ entries: ['male', 'female'].map(gender => {
        const path = new URL(`../recipes/Rog-goal.lua/rog-goal-direct-${gender}-independent.session.json`, import.meta.url);
        return { label: `${gender} Rogue quest goal`,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    }), summaryLabel: 'ROGUE QUEST GOAL', chunkLimit: 1,
    verifySegment: verifyRogGoalSegment });
}
runMatrixCli(import.meta.url, runRogGoalMatrix, 'Rog-goal generation');
