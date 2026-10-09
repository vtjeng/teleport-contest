#!/usr/bin/env node
// Independent seeds16991011/19, human/dwarf and neutral/lawful choices were
// fixed before C recording and JS comparison. No seed search.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { PM_BUGBEAR, PM_HILL_GIANT } from '../js/monsters.js';
import { D_LOCKED } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
function entries() {
    return ['human', 'dwarf'].map(label => {
        const path = new URL(`../recipes/Cav-loca.lua/cav-loca-${label}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
async function verifyCavLoca(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true); // Lua9 level flags.
    assert.equal(game.level.flags.hardfloor, true);
    assert.ok(game.level.rooms.some(room => room.irregular && room.rlit)); // Lua34 region.
    let bugbears = 0, giants = 0;
    for (let m = game.level.monlist; m; m = m.nmon) {
        if (m.data.pmidx === PM_BUGBEAR) ++bugbears;
        if (m.data.pmidx === PM_HILL_GIANT) ++giants;
        assert.equal(Boolean(m.mpeaceful), false); // Every source descriptor overrides peaceful=0.
    }
    // Lua66-82 fixes seventeen bugbears; Lua85-91 fixes seven hill giants.
    // Class descriptors can select further monsters of those species.
    assert.ok(bugbears >= 17);
    assert.ok(giants >= 7);
    let lockedDoors = 0;
    for (let x = 0; x < game.level.locations.length; ++x)
        for (let y = 0; y < game.level.locations[x].length; ++y)
            if (game.level.at(x, y).doormask & D_LOCKED) ++lockedDoors;
    assert.equal(lockedDoors, 1); // Lua36 one locked secret door, preserved through flips.
}
export function runCavLocaMatrix() {
    return runFreshMatrix({ entries: entries(), chunkLimit: 1,
        summaryLabel: 'CAV LOCA', verifySegment: verifyCavLoca });
}
runMatrixCli(import.meta.url, runCavLocaMatrix, 'Cav-loca generation');
