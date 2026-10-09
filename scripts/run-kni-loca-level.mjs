#!/usr/bin/env node
// The admitted v36 Knight quest case reaches natural makelevel loading; these
// independent male and female recipes exercise the wizard des-file caller.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import {
    ALTAR, AM_SHRINE, ANTI_MAGIC, COLNO, MAGIC_TRAP, POOL, ROOMOFFSET, ROWNO,
    TEMPLE,
} from '../js/const.js';
import { PM_OCHRE_JELLY, PM_QUASIT } from '../js/monsters.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyKniLocaSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    // #wizloaddes installs the named map on the wizard's current dungeon level;
    // ordinary quest arrival to Kni-loca is exercised by the admitted v36 case.
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(game.level.flags.has_temple, true);
    // Lua lines 25-34 create the full level light, two stairs, and shrine temple.
    const stairs = linkedItems(game.stairs, 'next');
    assert.equal(stairs.length, 2);
    assert.equal(stairs.filter(stair => stair.up).length, 1);
    assert.equal(stairs.filter(stair => !stair.up).length, 1);
    const templeIndex = game.level.rooms.findIndex(room => room.rtype === TEMPLE);
    assert.ok(templeIndex >= 0);
    const monsters = linkedItems(game.level.monlist, 'nmon');
    const priest = monsters.find(monster => monster.ispriest);
    assert.ok(priest);
    assert.equal(priest.mpeaceful, true);
    assert.equal(priest.mextra.epri.shroom, templeIndex + ROOMOFFSET);
    const altar = game.level.at(priest.mextra.epri.shrpos.x, priest.mextra.epri.shrpos.y);
    assert.equal(altar.typ, ALTAR);
    assert.ok(altar.flags & AM_SHRINE);
    // Lua lines 104-137 request 17 quasits, seven ochre jellies, and two classes.
    assert.ok(monsters.filter(monster => monster.mnum === PM_QUASIT).length >= 17);
    assert.ok(monsters.filter(monster => monster.mnum === PM_OCHRE_JELLY).length >= 7);
    assert.ok(monsters.length >= 27);
    // Lua lines 48-102 request fixed magic and random anti-magic traps. Their
    // accepted locations depend on the C descriptor's terrain checks and RNG.
    assert.ok(game.level.traps.some(trap => trap.ttyp === MAGIC_TRAP));
    assert.ok(game.level.traps.some(trap => trap.ttyp === ANTI_MAGIC));
    let pool = false;
    for (let x = 0; x < COLNO; ++x) {
        for (let y = 0; y < ROWNO; ++y)
            pool ||= game.level.at(x, y).typ === POOL;
    }
    assert.ok(pool);
}

export function runKniLocaLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['male', 'female'].map(gender => {
            const path = new URL(
                `../recipes/Kni-loca.lua/kni-loca-${gender}-independent.session.json`,
                import.meta.url,
            );
            return { label: gender, recipe: validateCleanRecipe(
                JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
        }),
        summaryLabel: 'KNI-LOCA LEVEL LOAD',
        verifySegment: verifyKniLocaSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runKniLocaLevelLoadMatrix, 'Kni-loca level load');
