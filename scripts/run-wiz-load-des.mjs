#!/usr/bin/env node
// Independent C-first seeds 16691011/13/17/19 were chosen before comparison.
// Filename and role variations cover wizcmds.c:wiz_load_splua dispatch and
// its NULL-state reset/finalize calls, without whole special-loader credit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ROOM, COLNO, ROWNO } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function entries() {
    return ['explicit', 'extensionless', 'cancel', 'normal'].map(label => {
        const path = new URL('../recipes/wizcmds.c/wiz-load-des-' + label + '.session.json', import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
async function verifyLoad(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.iflags.lua_testing === true, false);
    assert.equal(game.in_mklev, false);
    // Both source big-room programs set mazelevel and paint a broad room.
    // Cancellation and nonwizard rejection keep the ordinary initial level.
    const loaded = /bigrm-[12]/u.test(segment.moves);
    assert.equal(!!game.level.flags.is_maze_lev, loaded);
    if (loaded) {
        let floors = 0;
        for (let x = 0; x < COLNO; ++x)
            for (let y = 0; y < ROWNO; ++y)
                if (game.level.at(x, y).typ === ROOM) ++floors;
        // Source literals have over 1,000 room squares; optional terrain
        // overlays retain at least 300, exceeding an ordinary D:1 room.
        assert.ok(floors > 300);
    }
}
export function runWizLoadDesMatrix() {
    return runFreshMatrix({ entries: entries(), summaryLabel: 'WIZARD SPECIAL LUA LOAD',
        chunkLimit: 1, verifySegment: verifyLoad });
}
runMatrixCli(import.meta.url, runWizLoadDesMatrix, 'wizard special Lua load');
