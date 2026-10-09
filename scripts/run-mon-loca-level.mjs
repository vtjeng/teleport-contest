#!/usr/bin/env node
// Independent seeds17209103/11, clocks and male/female neutral human Monk
// inputs were fixed before C recording/comparison. No search or input tuning.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BURN } from '../js/const.js';
import { PM_EARTH_ELEMENTAL, PM_XORN } from '../js/monsters.js';
import { TIN } from '../js/objects.js';
import { game } from '../js/gstate.js';
import { runSegment } from '../js/jsmain.js';
import { validateCleanRecipe } from './diff-fresh.mjs';
import { runFreshMatrix, runMatrixCli } from './fresh-matrix.mjs';
function linked(head, next) {
    const items = [];
    for (let item = head; item; item = item[next]) items.push(item);
    return items;
}
export async function verifyMonLocaSegment(segment) {
    let boundary;
    await runSegment(segment, { onBoundary(error) { boundary = error; } });
    assert.equal(boundary, undefined);
    assert.equal(game.flags.female, /gender:female/u.test(segment.nethackrc));
    assert.equal(game.level.flags.is_maze_lev, true); // Lua8 only explicit flag.
    const monsters = linked(game.level.monlist, 'nmon');
    assert.equal(monsters.filter(m => m.mnum === PM_EARTH_ELEMENTAL).length, 14);
    assert.equal(monsters.filter(m => m.mnum === PM_XORN).length, 9); // Lua76–98.
    assert.equal(game.level.traps.length, 6); // Lua69–74 six random traps.
    assert.deepEqual(linked(game.stairs, 'next').map(s => s.up).sort(), [false, true]);
    const engraving = linked(game.head_engr, 'nxt_engr').find(e => e.engr_txt?.[0] === 'Elbereth');
    assert.ok(engraving); // Lua66 paired burnt protection inscription.
    assert.equal(engraving.engr_type, BURN);
    const tins = linked(game.level.objects[engraving.engr_x][engraving.engr_y], 'nexthere');
    const spinach = tins.find(o => o.otyp === TIN && o.blessed && o.spe === 1 && o.quan === 2);
    assert.ok(spinach); // Lua64–65 exact stack at the same selected coordinate.
    assert.equal(typeof spinach.corpsenm, 'number'); // Generated species retained; no token.
}
export function runMonLocaMatrix() {
    return runFreshMatrix({ entries: ['male', 'female'].map(gender => {
        const path = new URL(`../recipes/Mon-loca.lua/mon-loca-direct-${gender}-independent.session.json`, import.meta.url);
        return { label: `${gender} Monk quest locate`,
            recipe: validateCleanRecipe(JSON.parse(readFileSync(path, 'utf8')), path.pathname) };
    }), summaryLabel: 'MONK QUEST LOCATE', chunkLimit: 1,
    verifySegment: verifyMonLocaSegment });
}
runMatrixCli(import.meta.url, runMonLocaMatrix, 'Mon-loca generation');
