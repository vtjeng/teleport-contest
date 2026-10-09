#!/usr/bin/env node
// Seeds17509101/09 and male/female human Rogue inputs were fixed before C
// recording or JavaScript comparison. No seed search or post-comparison edits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { M_AP_FURNITURE } from '../js/const.js';
import { PM_MASTER_OF_THIEVES, PM_SMALL_MIMIC, PM_LARGE_MIMIC,
    PM_GIANT_MIMIC, PM_THUG } from '../js/monsters.js';
import { LEATHER_ARMOR, SILVER_DAGGER, DAGGER } from '../js/objects.js';
import { S_dnstair } from '../js/symbols.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linked(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}
export async function verifyRogStrtSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    // Lua13: all four flags, with no invented lighting or wallify call.
    for (const flag of ['is_maze_lev', 'noteleport', 'hardfloor', 'nommap'])
        assert.equal(game.level.flags[flag], true);
    // Lua51–54: one ordinary down stair, three furniture-disguised mimics.
    assert.equal(linked(game.stairs, 'next').filter(stair => !stair.up).length, 1);
    const monsters = linked(game.level.monlist, 'nmon');
    const mimics = monsters.filter(m => m.m_ap_type === M_AP_FURNITURE
        && m.mappearance === S_dnstair);
    assert.deepEqual(mimics.map(m => m.mnum).sort((a, b) => a - b),
        [PM_SMALL_MIMIC, PM_LARGE_MIMIC, PM_GIANT_MIMIC]);
    // Lua106–124: custom leader inventory and nine fixed thug guards.
    const leader = monsters.find(m => m.mnum === PM_MASTER_OF_THIEVES);
    assert.ok(leader);
    const inventory = linked(leader.minvent, 'nobj');
    assert.equal(inventory.length, 3);
    for (const [otyp, spe] of [[LEATHER_ARMOR, 5], [SILVER_DAGGER, 4], [DAGGER, 2]])
        assert.equal(inventory.find(o => o.otyp === otyp)?.spe, spe);
    const daggers = inventory.find(o => o.otyp === DAGGER);
    assert.ok(daggers.quan >= 2 && daggers.quan <= 8); // Lua d(2,4) inclusive range.
    assert.equal(daggers.cursed, false);
    assert.equal(monsters.filter(m => m.mnum === PM_THUG).length, 9);
    assert.equal(game.level.traps.length, 16); // Lua128–143 sixteen random traps.
}
export function runRogStrtMatrix() {
    return runFreshMatrix({ entries: ['male', 'female'].map(gender => {
        const path = new URL(`../recipes/Rog-strt.lua/rog-strt-direct-${gender}-independent.session.json`, import.meta.url);
        return { label: `${gender} Rogue quest start`,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    }), summaryLabel: 'ROGUE QUEST START', chunkLimit: 1,
    verifySegment: verifyRogStrtSegment });
}
runMatrixCli(import.meta.url, runRogStrtMatrix, 'Rog-strt generation');
