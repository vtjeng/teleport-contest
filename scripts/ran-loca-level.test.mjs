import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    RAN_LOCA_LEVEL_MAP, RAN_LOCA_MONSTERS, RAN_LOCA_OBJECT_COUNT, RAN_LOCA_TRAPS,
} from '../js/ran_loca_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { extractRanLocaData, renderRanLocaData } from './generate-ran-loca-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Ran-loca.lua', 'utf8');

test('Ran-loca generated fixed data matches the ordered source descriptors', () => {
    const data = extractRanLocaData(LUA);
    assert.deepEqual(data, {
        map: RAN_LOCA_LEVEL_MAP,
        objectCount: RAN_LOCA_OBJECT_COUNT,
        traps: RAN_LOCA_TRAPS,
        monsters: RAN_LOCA_MONSTERS,
    });
    assert.equal(renderRanLocaData(data), readFileSync('js/ran_loca_level_data.js', 'utf8'));
    // Ran-loca.lua lines 9-29 provide a 55-column by 20-row fixed map.
    assert.equal(data.map.length, 20);
    assert.ok(data.map.every(row => row.length === 55));
    // Lua lines 35-46 make eight objects before typed random trap placement.
    assert.equal(data.objectCount, 8);
    assert.deepEqual(data.traps,
        ['spiked pit', 'spiked pit', 'teleport', 'teleport', 'arrow', 'arrow']);
    // Lua lines 47-78 retain source names, classes, coordinates and flags.
    assert.equal(data.monsters.length, 23);
    assert.deepEqual(data.monsters[0], {
        id: 'wumpus', x: 27, y: 18, peaceful: 0, asleep: 1,
    });
    assert.equal(data.monsters.filter(monster => monster.id === 'giant bat').length, 4);
    assert.equal(data.monsters.filter(monster => monster.id === 'forest centaur').length, 4);
    assert.equal(data.monsters.filter(monster => monster.id === 'mountain centaur').length, 8);
    assert.equal(data.monsters.filter(monster => monster.id === 'scorpion').length, 4);
    assert.equal(data.monsters.filter(monster => monster.class === 's').length, 2);
});

test('Ran-loca production loader preserves top-level Lua call order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    await QUEST_LEVEL_LOADERS['Ran-loca'](des);

    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'hardfloor'] },
        { method: 'map', args: [RAN_LOCA_LEVEL_MAP] },
    ]);
    assert.equal(calls[3].method, 'region');
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 54, hy: 19 });
    assert.deepEqual(calls[3].args[1], 'lit');
    assert.deepEqual(calls.slice(4, 7), [
        { method: 'stair', args: ['up', 25, 5] },
        { method: 'stair', args: ['down', 27, 18] },
        { method: 'non_diggable', args: [calls[6].args[0]] },
    ]);
    assert.deepEqual(calls[6].args[0].bounds(), { lx: 0, ly: 0, hx: 54, hy: 19 });
    assert.deepEqual(calls.slice(7, 15),
        Array.from({ length: 8 }, () => ({ method: 'object', args: [] })));
    assert.deepEqual(calls.slice(15, 21), RAN_LOCA_TRAPS.map(type => ({
        method: 'trap', args: [type],
    })));
    assert.deepEqual(calls.slice(21), RAN_LOCA_MONSTERS.map(monster => ({
        method: 'monster', args: [monster],
    })));
});
