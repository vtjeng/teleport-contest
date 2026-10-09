#!/usr/bin/env node
// Independent C-first Knight/Ranger entries reach dat/wizard3.lua through
// named level teleport, with opposite arrival-door percent outcomes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { find_level } from '../js/dungeon.js';
import { BEEHIVE, MORGUE, MAGIC_PORTAL, SQKY_BOARD } from '../js/const.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function recipes() {
    return ['knight', 'ranger', 'middle-regression'].map(label => {
        const file = label === 'middle-regression' ? 'tower-middle-regression'
            : `tower-bottom-${label}-independent`;
        const path = new URL(`../recipes/wizard3.lua/${file}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(
            JSON.parse(readFileSync(path, 'utf8')), path.pathname,
        ) };
    });
}

async function verifyWizard3(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    if (segment.moves.includes('wizard2')) {
        // Existing Wizard2 is the neighboring source limit, not A188 credit.
        assert.deepEqual(game.u.uz, game.wiz2_level);
        assert.equal(game.level.flags.noteleport, true);
        assert.equal(game.level.flags.hardfloor, true);
        return;
    }
    assert.deepEqual(game.u.uz, game.wiz3_level);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(game.level.flags.has_morgue, true); // filled=2 sets flags only.
    assert.equal(game.level.flags.has_beehive, true); // filled=1 invokes fill_zoo.
    const rooms = game.level.rooms.slice(0, game.level.nroom);
    assert.equal(rooms.filter(room => room.rtype === MORGUE).length, 1);
    assert.equal(rooms.filter(room => room.rtype === BEEHIVE).length, 1);
    // Source74–77 places four squeaky boards around the tower ladder.
    assert.ok(game.level.traps.filter(trap => trap.ttyp === SQKY_BOARD).length >= 4);
    const portal = game.level.traps.find(trap => trap.ttyp === MAGIC_PORTAL);
    assert.ok(portal, 'wizard3.lua33 registers the fakewiz1 portal');
    assert.deepEqual(portal.dst, find_level('fakewiz1', game).dlevel);
    let ladderCount = 0;
    for (let stair = game.stairs; stair; stair = stair.next)
        if (stair.isladder && stair.up) ++ladderCount;
    assert.equal(ladderCount, 1); // Source46 places one up ladder.
}

export function runWizard3LevelTeleMatrix() {
    return runFreshMatrix({ entries: recipes(), chunkLimit: 1,
        summaryLabel: 'WIZARD3 LEVEL GENERATION', verifySegment: verifyWizard3 });
}
runMatrixCli(import.meta.url, runWizard3LevelTeleMatrix, 'wizard3 level generation');
