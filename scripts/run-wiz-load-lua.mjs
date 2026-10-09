#!/usr/bin/env node
// Independent C-first seeds16792011/13/17/19/23 were chosen before comparison.
// Filename/cancellation/role/mode variations exercise wizcmds.c:wiz_load_lua
// and its bounded nhlib.lua side effects, without whole Lua VM credit.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function entries() {
    return ['explicit', 'extensionless', 'cancel', 'empty', 'normal'].map(label => {
        const path = new URL('../recipes/wizcmds.c/wiz-load-lua-' + label + '.session.json', import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
}
async function verifyLoad(segment) {
    let boundary;
    const result = await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(!!game.iflags.in_lua, false);
    assert.equal(game.in_mklev, false);
    assert.equal(!!game.iflags.lua_testing, false);
    // Every startup has an earlier nhlib initialization. After C's last
    // moveloop_preamble rnd(30), only this command can call either shuffle.
    const log = result.getRngLog();
    const start = log.findLastIndex(draw => draw.startsWith('rnd(30)=')) + 1;
    const commandDraws = log.slice(start);
    const loaded = /\nnhlib(?:\.lua)?\n/u.test(segment.moves);
    assert.deepEqual(commandDraws.map(draw => draw.split('=')[0]),
        loaded ? ['rn2(3)', 'rn2(2)', 'rn2(3)', 'rn2(2)'] : []);
    // C returns ECMD_OK/CANCEL rather than ECMD_TIME for all command arms.
    assert.equal(game.moves, 1);
}
export function runWizLoadLuaMatrix() {
    return runFreshMatrix({ entries: entries(), summaryLabel: 'WIZARD LUA LIBRARY LOAD',
        chunkLimit: 1, verifySegment: verifyLoad });
}
runMatrixCli(import.meta.url, runWizLoadLuaMatrix, 'wizard Lua library load');
