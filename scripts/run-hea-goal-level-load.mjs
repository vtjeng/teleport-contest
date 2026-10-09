#!/usr/bin/env node
// Independent human and gnome Healers enter through typed and direct-key
// level teleportation. Inputs were fixed and recorded before JS comparison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { find_level } from '../js/dungeon.js';
import { COLNO, POOL, ROWNO, W_NONDIGGABLE } from '../js/const.js';
import { QUARTERSTAFF, WAN_LIGHTNING } from '../js/objects.js';
import { PM_CYCLOPS, PM_GIANT_EEL } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyHeaGoalSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    const goal = find_level('Hea-goal');
    assert.deepEqual(game.u.uz, goal.dlevel);
    assert.equal(game.level.flags.is_maze_lev, true);
    // Lua creates six random traps and one up staircase before monsters.
    assert.equal(game.level.traps.length, 6);
    const stairs = linkedItems(game.stairs, 'next');
    assert.equal(stairs.length, 1);
    assert.equal(stairs[0].up, true);
    const objects = linkedItems(game.level.objlist, 'nobj');
    const staff = objects.find(obj => obj.otyp === QUARTERSTAFF
        && obj.oextra?.oname === 'The Staff of Aesculapius');
    assert.ok(staff);
    assert.equal(staff.blessed, true);
    // Lua sets the named quarterstaff's enchantment to zero explicitly.
    assert.equal(staff.spe, 0);
    assert.ok(objects.some(obj => obj.otyp === WAN_LIGHTNING
        && obj.ox === staff.ox && obj.oy === staff.oy));
    const monsters = linkedItems(game.level.monlist, 'nmon');
    assert.equal(monsters.filter(mon => mon.mnum === PM_CYCLOPS).length, 1);
    assert.ok(monsters.filter(mon => mon.mnum === PM_GIANT_EEL).length >= 6);
    // Source has 32 monster descriptors; any generated group adds members.
    assert.ok(monsters.length >= 32);
    let litPool = false, protectedCell = false;
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const cell = game.level.at(x, y);
            litPool ||= cell.typ === POOL && Boolean(cell.lit);
            protectedCell ||= Boolean(cell.wall_info & W_NONDIGGABLE);
        }
    }
    assert.ok(litPool);
    assert.ok(protectedCell);
}

export function runHeaGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['human', 'gnome'].map(label => {
            const path = new URL(`../recipes/Hea-goal.lua/hea-goal-${label}-independent.session.json`,
                import.meta.url);
            return { label, recipe: validateCleanRecipe(
                JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
        }),
        summaryLabel: 'HEA-GOAL LEVEL LOAD',
        verifySegment: verifyHeaGoalSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runHeaGoalLevelLoadMatrix, 'Hea-goal level load');
