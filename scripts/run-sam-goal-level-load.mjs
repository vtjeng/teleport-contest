#!/usr/bin/env node
// Independent C-first direct loader variations supplement natural quest arrival.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { COLNO, D_CLOSED, DOOR, ROWNO, W_NONDIGGABLE } from '../js/const.js';
import { game } from '../js/gstate.js';
import { PM_ASHIKAGA_TAKAUJI, PM_STALKER, PM_WOLF } from '../js/monsters.js';
import { TSURUGI } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linked(head, next) {
    const objects = [];
    for (let object = head; object; object = object[next]) objects.push(object);
    return objects;
}
export async function verifySamGoalLevel(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.nhDisplay.inputQueueLength, 0);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true);
    const stairs = linked(game.stairs, 'next');
    assert.equal(stairs.length, 1); // Lua43 creates only the up stair.
    assert.equal(stairs[0].up, true);
    // trap.c:maketrap reuses an existing cell, so the six random
    // placements can replace a prior trap rather than adding nine cells.
    assert.ok(game.level.traps.length >= 3 && game.level.traps.length <= 9);
    const objects = linked(game.level.objlist, 'nobj');
    const sword = objects.find(object => object.otyp === TSURUGI
        && object.oextra?.oname === 'The Tsurugi of Muramasa');
    assert.ok(sword);
    assert.equal(sword.blessed, true);
    assert.equal(sword.spe, 0);
    const monsters = linked(game.level.monlist, 'nmon');
    const nemesis = monsters.find(monster => monster.mnum === PM_ASHIKAGA_TAKAUJI);
    assert.ok(nemesis);
    assert.deepEqual([sword.ox, sword.oy], [nemesis.mx, nemesis.my]);
    assert.equal(monsters.filter(monster => monster.mnum === PM_WOLF).length, 4);
    assert.equal(monsters.filter(monster => monster.mnum === PM_STALKER).length, 9);
    let closed = 0, protectedCell = false;
    for (let x = 1; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const cell = game.level.at(x, y);
            if (cell.typ === DOOR && (cell.doormask & D_CLOSED)) ++closed;
            protectedCell ||= Boolean(cell.wall_info & W_NONDIGGABLE);
        }
    }
    assert.equal(closed, 4); // Lua38–41's four closed doors survive map flips.
    assert.ok(protectedCell);
}
export function runSamGoalLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['male', 'female', 'natural'].map(label => ({ label, recipe: JSON.parse(readFileSync(
            new URL(`../recipes/Sam-goal.lua/sam-goal-${label}-independent.session.json`, import.meta.url),
        )) })),
        summaryLabel: 'SAM-GOAL LEVEL LOAD', verifySegment: verifySamGoalLevel,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runSamGoalLevelLoadMatrix, 'Sam-goal level load');
