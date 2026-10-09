#!/usr/bin/env node
// Independent C-first quest arrival and direct des loading exercise the
// complete Cav-strt.lua program with neutral human and lawful dwarf shrines.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { ALTAR, PIT, TEMPLE } from '../js/const.js';
import { CLUB, LEATHER_ARMOR } from '../js/objects.js';
import { PM_BUGBEAR, PM_NEANDERTHAL, PM_SHAMAN_KARNOV } from '../js/monsters.js';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
import { validateCleanRecipe } from './diff-fresh.mjs';

function linkedItems(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}

export async function verifyCavStrtSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.level.flags.is_maze_lev, true); // Source15.
    assert.equal(game.level.flags.hardfloor, true);
    assert.equal(game.level.flags.noteleport, true);
    const rooms = game.level.rooms.slice(0, game.level.nroom);
    assert.equal(rooms.length, 7); // Source40–47: one temple and six ordinary rooms.
    assert.equal(rooms.filter(room => room.rtype === TEMPLE).length, 1);
    assert.ok(rooms.every(room => room.irregular));
    const monsters = linkedItems(game.level.monlist, 'nmon');
    assert.equal(monsters.filter(m => m.mnum === PM_NEANDERTHAL).length, 8); // Source64–71.
    assert.equal(monsters.filter(m => m.mnum === PM_BUGBEAR).length, 12); // Source82–93.
    const leader = monsters.filter(m => m.mnum === PM_SHAMAN_KARNOV);
    assert.equal(leader.length, 1); // Source57 creates one leader.
    const inventory = linkedItems(leader[0].minvent, 'nobj');
    assert.equal(inventory.length, 2); // Source58–59 replace default inventory.
    assert.deepEqual(inventory.map(o => [o.otyp, o.spe]).sort((a, b) => a[0] - b[0]),
        [[CLUB, 5], [LEATHER_ARMOR, 5]].sort((a, b) => a[0] - b[0]));
    assert.equal(monsters.filter(m => m.ispriest).length, 1); // Source55 shrine.
    let altars = 0;
    for (let y = 0; y < 21; ++y) // C playable board dimensions.
        for (let x = 0; x < 80; ++x)
            if (game.level.at(x, y).typ === ALTAR) ++altars;
    assert.equal(altars, 1); // Source55 has one coaligned altar.
    assert.ok(game.level.traps.length >= 6); // Source75–80; arrival can add a portal.
    assert.ok(game.level.traps.filter(t => t.ttyp === PIT).length >= 2); // Two explicit pits.
    assert.equal(linkedItems(game.stairs, 'next').filter(s => !s.up).length, 1); // Source49.
}

export function runCavStrtMatrix() {
    const entries = ['human-arrival', 'dwarf-des'].map(label => {
        const path = new URL(`../recipes/Cav-strt.lua/start-${label}-independent.session.json`, import.meta.url);
        return { label, recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    });
    return runFreshMatrix({ entries, chunkLimit: 1,
        summaryLabel: 'CAV-STRT LEVEL GENERATION', verifySegment: verifyCavStrtSegment });
}
runMatrixCli(import.meta.url, runCavStrtMatrix, 'Cav-strt level generation');
