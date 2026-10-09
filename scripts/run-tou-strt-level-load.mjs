#!/usr/bin/env node
// C-first Tourist start witnesses cover natural male/female arrival.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { COLNO, ROWNO, W_NONDIGGABLE } from '../js/const.js';
import { PM_TWOFLOWER, PM_GUIDE, PM_KRAKEN } from '../js/monsters.js';
import { LOW_BOOTS, HAWAIIAN_SHIRT, CHEST } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
function linked(head, next) {
    const list = [];
    for (let item = head; item; item = item[next]) list.push(item);
    return list;
}
export async function verifyTouStrtLevel(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);
    const monsters = linked(game.level.monlist, 'nmon');
    const leader = monsters.find(mon => mon.mnum === PM_TWOFLOWER);
    assert.ok(leader); // Lua98's custom inventory leader.
    const inventory = linked(leader.minvent, 'nobj');
    assert.deepEqual(inventory.map(obj => obj.otyp).sort((a, b) => a - b),
        [LOW_BOOTS, HAWAIIAN_SHIRT].sort((a, b) => a - b)); // Lua99–100 replaces default inventory.
    for (const obj of inventory) {
        assert.equal(obj.spe, 3); // Both source objects are +3.
        assert.equal(obj.ocarry, leader);
        assert.ok(obj.owornmask); // spo_end_moninvent -> m_dowear(TRUE).
    }
    assert.equal(monsters.filter(mon => mon.mnum === PM_GUIDE).length, 11); // Lua105–115.
    assert.equal(monsters.filter(mon => mon.mnum === PM_KRAKEN).length, 2); // Lua123–124.
    const stairs = linked(game.stairs, 'next');
    assert.equal(stairs.filter(stair => !stair.up).length, 1); // Lua49's down stair; LR_BRANCH can add a separate up stair on direct loads.
    assert.ok(linked(game.level.objlist, 'nobj').some(obj => obj.otyp === CHEST
        && obj.ox === leader.mx && obj.oy === leader.my)); // Lua103 shares the leader's square after flips.
    let protectedWall = false;
    for (let x = 1; x < COLNO; ++x) for (let y = 0; y < ROWNO; ++y)
        protectedWall ||= Boolean(game.level.at(x, y).wall_info & W_NONDIGGABLE);
    assert.ok(protectedWall); // Lua53 protects the entire source map.
}
export function runTouStrtLevelLoadMatrix() {
    return runFreshMatrix({ entries: ['male-arrival', 'female-arrival', 'direct'].map(label => ({
        label, recipe: JSON.parse(readFileSync(new URL(
            `../recipes/Tou-strt.lua/tou-strt-${label}-independent.session.json`, import.meta.url))),
    })), summaryLabel: 'TOU-STRT LEVEL LOAD', verifySegment: verifyTouStrtLevel, chunkLimit: 1 });
}
runMatrixCli(import.meta.url, runTouStrtLevelLoadMatrix, 'Tou-strt level load');
