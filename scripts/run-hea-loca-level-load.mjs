#!/usr/bin/env node
// Independent human and gnome Healers enter through typed and direct-key
// teleportation. C-only startup-pager correction precedes JS comparison.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { find_level } from '../js/dungeon.js';
import {
    A_CHAOTIC, ALTAR, AM_SHRINE, COLNO, D_CLOSED, D_LOCKED, DOOR,
    POOL, ROOMOFFSET, ROWNO, SDOOR, TEMPLE, W_NONDIGGABLE,
} from '../js/const.js';
import { PM_GIANT_EEL, PM_KRAKEN } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyHeaLocaSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.deepEqual(game.u.uz, find_level('Hea-loca').dlevel);
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(game.level.flags.has_temple, true);
    // Lua has six random traps and one staircase in each direction.
    assert.equal(game.level.traps.length, 6);
    const stairs = linkedItems(game.stairs, 'next');
    assert.equal(stairs.length, 2);
    assert.equal(stairs.filter(stair => stair.up).length, 1);
    assert.equal(stairs.filter(stair => !stair.up).length, 1);
    const templeIndex = game.level.rooms.findIndex(room => room.rtype === TEMPLE);
    assert.ok(templeIndex >= 0);
    const monsters = linkedItems(game.level.monlist, 'nmon');
    const priest = monsters.find(mon => mon.ispriest);
    assert.ok(priest);
    const epri = priest.mextra.epri;
    // Source shrine is chaotic even though both Healers are neutral.
    assert.equal(epri.shralign, A_CHAOTIC);
    assert.equal(epri.shroom, templeIndex + ROOMOFFSET);
    assert.deepEqual(epri.shrlevel, game.u.uz);
    const altar = game.level.at(epri.shrpos.x, epri.shrpos.y);
    assert.equal(altar.typ, ALTAR);
    assert.ok(altar.flags & AM_SHRINE);
    assert.equal(priest.mpeaceful, true);
    assert.ok(monsters.filter(mon => mon.mnum === PM_GIANT_EEL).length >= 5);
    assert.ok(monsters.some(mon => mon.mnum === PM_KRAKEN));
    // Source supplies 35 descriptors plus the shrine priest; groups add members.
    assert.ok(monsters.length >= 36);
    let litPool = false, protectedCell = false, closed = 0, locked = 0;
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y) {
            const cell = game.level.at(x, y);
            litPool ||= cell.typ === POOL && Boolean(cell.lit);
            protectedCell ||= Boolean(cell.wall_info & W_NONDIGGABLE);
            if (cell.typ === DOOR && (cell.doormask & D_CLOSED)) ++closed;
            if (cell.typ === SDOOR && (cell.doormask & D_LOCKED)) ++locked;
        }
    }
    assert.ok(litPool);
    assert.ok(protectedCell);
    // Lua29..32 specifies two closed doors and two locked secret doors.
    assert.equal(closed, 2);
    assert.equal(locked, 2);
}

export function runHeaLocaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['human', 'gnome'].map(label => {
            const path = new URL(`../recipes/Hea-loca.lua/hea-loca-${label}-independent.session.json`,
                import.meta.url);
            return { label, recipe: validateCleanRecipe(
                JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
        }),
        summaryLabel: 'HEA-LOCA LEVEL LOAD',
        verifySegment: verifyHeaLocaSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runHeaLocaLevelLoadMatrix, 'Hea-loca level load');
