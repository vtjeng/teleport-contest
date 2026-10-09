#!/usr/bin/env node
// Seeds16891011/19 and their role/race/alignment variations were chosen before
// JS comparison. C-only command correction retained in recipe comments.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ART_SCEPTRE_OF_MIGHT } from '../js/artifacts.js';
import { PM_CHROMATIC_DRAGON, PM_SHRIEKER } from '../js/monsters.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function entries() {
    return ['human', 'dwarf'].map(label => {
        const path = new URL(`../recipes/Cav-goal.lua/cav-goal-${label}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
async function verifyCavGoal(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true); // Cav-goal.lua8.
    let dragonCount = 0, shriekerCount = 0, sceptreCount = 0;
    for (let m = game.level.monlist; m; m = m.nmon) {
        if (m.data.pmidx === PM_CHROMATIC_DRAGON) {
            ++dragonCount;
            assert.equal(Boolean(m.msleeping), true); // Lua55 explicitly asleep.
        }
        if (m.data.pmidx === PM_SHRIEKER) ++shriekerCount;
    }
    for (let o = game.level.objlist; o; o = o.nobj) {
        if (o.oartifact === ART_SCEPTRE_OF_MIGHT) {
            ++sceptreCount;
            assert.equal(o.blessed, true);
            assert.equal(o.spe, 0); // Lua39 explicit enchantment.
        }
    }
    assert.equal(dragonCount, 1); // Lua55 one nemesis.
    assert.equal(shriekerCount, 3); // Lua56-58 three fixed inhabitants.
    assert.equal(sceptreCount, 1); // Lua39 the single quest artifact.
}
export function runCavGoalMatrix() {
    return runFreshMatrix({ entries: entries(), chunkLimit: 1,
        summaryLabel: 'CAV GOAL', verifySegment: verifyCavGoal });
}
runMatrixCli(import.meta.url, runCavGoalMatrix, 'Cav-goal generation');
