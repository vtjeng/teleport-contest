#!/usr/bin/env node

// Replay independent Archeologist routes into Arc-loca. Each route opens the
// wizard level menu and chooses Arc-loca, so the verifier observes the
// complete Lua loader's generated level on arrival.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { game } from '../js/gstate.js';
import { ALTAR, TEMPLE, W_NONDIGGABLE } from '../js/const.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

const RECIPE_PATHS = [
    new URL('../recipes/Arc-loca.lua/arc-loca-level-teleport.session.json', import.meta.url),
    new URL('../recipes/Arc-loca.lua/arc-loca-level-teleport-variation.session.json', import.meta.url),
];

export function loadArcLocaRecipes() {
    return RECIPE_PATHS.map((path, index) => validateCleanRecipe(
        JSON.parse(readFileSync(path, 'utf8')),
        `Arc-loca recipe ${index + 1}`,
    ));
}

function linkedCount(head, next) {
    let count = 0;
    for (let item = head; item; item = item[next]) ++count;
    return count;
}

function altarCount() {
    // Arc-loca.lua has 20 source rows of 76 cells; the game board retains its
    // 80x21 playable bounds for descriptor placement and cleanup.
    let count = 0;
    for (let y = 0; y < 21; ++y)
        for (let x = 0; x < 80; ++x)
            if (game.level.at(x, y).typ === ALTAR) ++count;
    return count;
}

function engravingEntries() {
    const entries = [];
    for (let engraving = game.head_engr;
         engraving;
         engraving = engraving.nxt_engr)
        entries.push(engraving);
    return entries;
}

function nonDiggableCount() {
    let count = 0;
    for (let y = 0; y < 21; ++y)
        for (let x = 0; x < 80; ++x)
            if ((game.level.at(x, y).wall_info & W_NONDIGGABLE) !== 0)
                ++count;
    return count;
}

export async function verifyArcLocaSegment(segment) {
    await runSegment(segment);

    // Both recipes enter the locate level: quest dungeon 3, depth 3 in their
    // initialized topology. Arc-loca.lua fixes three temples, 23 traps,
    // 27 monsters, 15 explicit objects, four engravings, three altars and two
    // stairs (one up). Other level generation may add floor objects. nhlib's
    // alignment table has the three alignments used by the unattended altars.
    assert.equal(game.u.uz.dnum, 3);
    assert.equal(game.u.uz.dlevel, 3);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(
        game.level.rooms.filter(({ rtype }) => rtype === TEMPLE).length,
        3,
    );
    assert.equal(game.level.traps.length, 23);
    assert.equal(linkedCount(game.level.monlist, 'nmon'), 27);
    assert.ok(linkedCount(game.level.objlist, 'nobj') >= 15);
    assert.equal(engravingEntries().length, 4);
    assert.ok(engravingEntries().every(({ engr_txt }) =>
        engr_txt.includes('X marks the spot.')));
    assert.equal(altarCount(), 3);
    assert.ok(nonDiggableCount() > 0);
    assert.equal(linkedCount(game.stairs, 'next'), 2);
    assert.equal(
        Number(game.stairs?.up) + Number(game.stairs?.next?.up),
        1,
    );
    assert.equal(game.specialLevelAlign.length, 3);
}

export function runArcLocaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: loadArcLocaRecipes().map((recipe, index) => ({
            label: index === 0
                ? 'Arc-loca level load'
                : 'Arc-loca level load variation',
            recipe,
        })),
        summaryLabel: 'ARC-LOCA LEVEL LOAD',
        verifySegment: verifyArcLocaSegment,
        chunkLimit: 1,
    });
}

runMatrixCli(
    import.meta.url,
    runArcLocaLevelLoadMatrix,
    'Arc-loca level load',
);
