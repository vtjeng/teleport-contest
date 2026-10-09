#!/usr/bin/env node
// Seeds17091011/29, female/male human choices were fixed before C
// recording and JS comparison. No seed search or post-comparison input change.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_HIPPOCRATES, PM_ATTENDANT } from '../js/monsters.js';
import { SILVER_DAGGER } from '../js/objects.js';
import { ALTAR, AM_NEUTRAL, AM_MASK } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
function entries() {
    return ['human', 'male-human'].map(label => {
        const path = new URL(`../recipes/Hea-strt.lua/hea-strt-${label}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
async function verifyHeaStrt(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true); // Lua14 source flags.
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);
    let leader, attendants = 0;
    for (let m = game.level.monlist; m; m = m.nmon) {
        if (m.data.pmidx === PM_HIPPOCRATES) leader = m;
        if (m.data.pmidx === PM_ATTENDANT) ++attendants;
    }
    assert.ok(leader); // Lua62 Hippocrates named descriptor.
    assert.equal(attendants, 8); // Lua69-76 eight fixed attendants.
    const inventory = [];
    for (let o = leader.minvent; o; o = o.nobj) inventory.push(o);
    assert.equal(inventory.length, 1); // Custom inventory replaces species defaults.
    assert.equal(inventory[0].otyp, SILVER_DAGGER);
    assert.equal(inventory[0].spe, 5); // Lua63 custom weapon enchantment.
    let altars = 0;
    for (const column of game.level.locations) for (const loc of column)
        if (loc.typ === ALTAR) {
            ++altars;
            assert.equal(loc.flags & AM_MASK, AM_NEUTRAL);
        }
    assert.equal(altars, 1); // Lua48 one neutral ordinary altar, preserved through flips.
}
export function runHeaStrtMatrix() {
    return runFreshMatrix({ entries: entries(), chunkLimit: 1,
        summaryLabel: 'HEA STRT', verifySegment: verifyHeaStrt });
}
runMatrixCli(import.meta.url, runHeaStrtMatrix, 'Hea-strt generation');
