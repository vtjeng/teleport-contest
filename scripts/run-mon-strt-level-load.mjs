#!/usr/bin/env node
// The independent debug-loader recipes were fixed before C recording; no seed search.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { D_LOCKED, D_CLOSED, DOOR, DART_TRAP } from '../js/const.js';
import { game } from '../js/gstate.js';
import {
    PM_ABBOT, PM_EARTH_ELEMENTAL, PM_GRAND_MASTER, PM_XORN,
} from '../js/monsters.js';
import { FOOD_RATION, ROBE, TIN } from '../js/objects.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';

function linked(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyMonStrtSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary: error => { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    assert.equal(game.level.flags.is_maze_lev, true);
    assert.equal(game.level.flags.noteleport, true);
    assert.equal(game.level.flags.hardfloor, true);

    const monsters = linked(game.level.monlist, 'nmon');
    const leader = monsters.find(monster => monster.mnum === PM_GRAND_MASTER);
    assert.ok(leader); // Lua41–43 places the Grand Master and custom inventory.
    assert.equal(linked(leader.minvent, 'nobj').some(object =>
        object.otyp === ROBE && object.spe === 6), true);
    assert.equal(monsters.filter(monster => monster.mnum === PM_ABBOT).length, 8);
    assert.equal(monsters.filter(monster => monster.mnum === PM_EARTH_ELEMENTAL).length, 8);
    assert.equal(monsters.filter(monster => monster.mnum === PM_XORN).length, 4);

    const objects = linked(game.level.objlist, 'nobj');
    assert.equal(objects.some(object => object.otyp === TIN && object.quan === 2
        && object.spe === 1), true); // Lua91–92 is the accepted spinach tin descriptor.
    assert.equal(objects.some(object => object.otyp === FOOD_RATION && object.quan === 4), true);

    const lockedDoors = game.level.locations.flat().filter(location =>
        location.typ === DOOR && (location.doormask & D_LOCKED));
    const closedDoors = game.level.locations.flat().filter(location =>
        location.typ === DOOR && (location.doormask & D_CLOSED));
    assert.equal(lockedDoors.length, 4);
    assert.equal(closedDoors.length, 14);
    assert.equal(lockedDoors.length + closedDoors.length, 18);
    assert.ok(game.level.traps.filter(trap => trap.ttyp === DART_TRAP).length >= 2);
}

export function runMonStrtLevelLoadMatrix() {
    return runFreshMatrix({
        entries: ['male', 'female'].map(gender => {
            const path = new URL(
                `../recipes/Mon-strt.lua/mon-strt-direct-${gender}-independent.session.json`,
                import.meta.url,
            );
            return { label: `${gender} Monk quest start`,
                recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
        }),
        summaryLabel: 'MONK QUEST START', verifySegment: verifyMonStrtSegment,
        chunkLimit: 1,
    });
}
runMatrixCli(import.meta.url, runMonStrtLevelLoadMatrix, 'Monk quest start load');
