import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    KNI_LOCA_FIXED_TRAPS, KNI_LOCA_LEVEL_MAP, KNI_LOCA_MONSTERS,
} from '../js/kni_loca_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { extractKniLocaData, renderKniLocaData } from './generate-kni-loca-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Kni-loca.lua', 'utf8');

test('Kni-loca generated fixed data matches the complete source tables', () => {
    const data = extractKniLocaData(LUA);
    assert.deepEqual(data, {
        map: KNI_LOCA_LEVEL_MAP,
        fixedTraps: KNI_LOCA_FIXED_TRAPS,
        monsters: KNI_LOCA_MONSTERS,
    });
    assert.equal(renderKniLocaData(data),
        readFileSync('js/kni_loca_level_data.js', 'utf8'));
    // Kni-loca.lua lines 10-22 define a 40-column by 12-row transparent map.
    assert.equal(data.map.length, 12);
    assert.ok(data.map.every(row => row.length === 40));
    // Kni-loca.lua lines 48-83 place 45 magic traps before seven random traps.
    assert.equal(data.fixedTraps.length, 45);
    assert.ok(data.fixedTraps.every(trap => trap.type === 'magic'));
    // Kni-loca.lua lines 103-137 define 27 ordered hostile descriptors.
    assert.equal(data.monsters.length, 27);
    assert.equal(data.monsters.filter(monster => monster.id === 'quasit').length, 17);
    assert.equal(data.monsters.filter(monster => monster.id === 'ochre jelly').length, 7);
});

test('Kni-loca loader preserves the Lua descriptor call order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    await QUEST_LEVEL_LOADERS['Kni-loca'](des);
    // Lua lines 7-22 initialize joined mines terrain before its transparent map.
    assert.deepEqual(calls.slice(0, 4), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'hardfloor'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: 'P',
            smoothed: false, joined: true, lit: 1, walled: false }] },
        { method: 'map', args: [KNI_LOCA_LEVEL_MAP] },
    ]);
    // Lua lines 25-34 create the lit filled=2 temple, stairs, and neutral shrine.
    assert.equal(calls[4].method, 'region');
    assert.deepEqual(calls[4].args[0].bounds(), { lx: 0, ly: 0, hx: 39, hy: 11 });
    assert.deepEqual(calls[5], { method: 'region', args: [{
        region: [9, 2, 27, 9], lit: 1, type: 'temple', filled: 2,
    }] });
    assert.deepEqual(calls.slice(6, 9), [
        { method: 'stair', args: ['up', 38, 0] },
        { method: 'stair', args: ['down', 18, 5] },
        { method: 'altar', args: [{ x: 17, y: 5, align: 'neutral', type: 'shrine' }] },
    ]);
    // Lua lines 36-137 place 15 random objects, 52 traps, and 27 monsters.
    assert.deepEqual(calls.slice(9, 24),
        Array.from({ length: 15 }, () => ({ method: 'object', args: [] })));
    assert.deepEqual(calls.slice(24, 69), KNI_LOCA_FIXED_TRAPS.map(({ type, x, y }) => ({
        method: 'trap', args: [type, x, y],
    })));
    assert.deepEqual(calls.slice(69, 76),
        Array.from({ length: 7 }, () => ({ method: 'trap', args: ['anti magic'] })));
    assert.deepEqual(calls.slice(76), KNI_LOCA_MONSTERS.map(monster => ({
        method: 'monster', args: [monster],
    })));
});
