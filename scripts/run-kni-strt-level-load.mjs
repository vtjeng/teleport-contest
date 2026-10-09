#!/usr/bin/env node

// Verify Knight arrivals through the typed and C('v') wizard level-teleport
// routes. Each matrix entry records a fresh C comparison before the JS checks.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    COURT, D_CLOSED, D_LOCKED, DOOR, W_ARM, W_NONDIGGABLE,
} from '../js/const.js';
import { game } from '../js/gstate.js';
import { find_level } from '../js/dungeon.js';
import { PM_KING_ARTHUR, PM_WARHORSE } from '../js/monsters.js';
import { LONG_SWORD, PLATE_MAIL, SADDLE } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyKniStrtSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.deepEqual(game.u.uz, find_level('Kni-strt').dlevel);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);

    const rooms = game.level.rooms.slice(0, game.level.nroom);
    assert.equal(rooms.filter(room => room.rtype === COURT).length, 1);
    const monsters = linkedItems(game.level.monlist, 'nmon');
    const king = monsters.find(monster => monster.mnum === PM_KING_ARTHUR);
    assert.ok(king);
    const kingInventory = linkedItems(king.minvent, 'nobj');
    const excalibur = kingInventory.find(object => object.otyp === LONG_SWORD);
    const plate = kingInventory.find(object => object.otyp === PLATE_MAIL);
    assert.ok(excalibur);
    assert.equal(excalibur.oextra?.oname, 'Excalibur');
    assert.equal(excalibur.spe, 4);
    assert.equal(excalibur.blessed, true);
    assert.ok(plate);
    assert.equal(plate.spe, 4);
    assert.ok(plate.owornmask & W_ARM);

    const horses = monsters.filter(monster => monster.mnum === PM_WARHORSE);
    // Lua108's bound is 2 + nh.rn2(3), evaluated once per level load.
    assert.ok(horses.length >= 2 && horses.length <= 4);
    assert.ok(horses.every(monster => monster.mpeaceful));
    const saddles = horses.flatMap(horse => linkedItems(horse.minvent, 'nobj'))
        .filter(object => object.otyp === SADDLE);
    assert.ok(saddles.length <= horses.length);

    const stairs = linkedItems(game.stairs, 'next');
    assert.equal(stairs.filter(stair => !stair.up).length, 1);
    let closed = 0, locked = 0, protectedCell = false;
    for (let y = 0; y < 16; ++y) {
        for (let x = 0; x < 50; ++x) {
            const cell = game.level.at(x, y);
            if (cell.typ === DOOR && (cell.doormask & D_CLOSED)) ++closed;
            if (cell.typ === DOOR && (cell.doormask & D_LOCKED)) ++locked;
            protectedCell ||= Boolean(cell.wall_info & W_NONDIGGABLE);
        }
    }
    // The fifteen Lua door descriptors include locations that final map
    // construction can supersede; at least eight closed cells remain.
    assert.ok(closed >= 8 && closed <= 11);
    assert.equal(locked, 4);
    assert.ok(protectedCell);
}

export function runKniStrtLevelLoadMatrix() {
    const entries = ['knight-start-male-typed', 'knight-start-female-key'].map(label => {
        const path = new URL(`../recipes/Kni-strt.lua/${label}.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(
            JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
    return runFreshMatrix({ entries, chunkLimit: 1,
        summaryLabel: 'KNI-STRT LEVEL GENERATION', verifySegment: verifyKniStrtSegment });
}

runMatrixCli(import.meta.url, runKniStrtLevelLoadMatrix, 'Kni-strt level generation');
