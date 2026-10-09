import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HEA_LOCA_LEVEL_MAP } from '../js/hea_loca_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { extractHeaLocaMap, renderHeaLocaMap } from './generate-hea-loca-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Hea-loca.lua', 'utf8');

test('Hea-loca generated map retains every upstream row', () => {
    const rows = extractHeaLocaMap(LUA);
    assert.deepEqual(HEA_LOCA_LEVEL_MAP, rows);
    assert.equal(renderHeaLocaMap(rows),
        readFileSync('js/hea_loca_level_data.js', 'utf8'));
    // Hea-loca.lua's map rectangle is x0..30, y0..9.
    assert.equal(rows.length, 10);
    assert.ok(rows.every(row => row.length === 31));
});

test('Hea-loca executes every temple and population descriptor in source order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    await QUEST_LEVEL_LOADERS['Hea-loca'](des);
    // Lua6..24 initializes the background before applying the fixed map.
    assert.deepEqual(calls.slice(0, 4), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'hardfloor'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: 'P',
            smoothed: true, joined: true, lit: 1, walled: false }] },
        { method: 'map', args: [HEA_LOCA_LEVEL_MAP] },
    ]);
    // Lua26 lights the whole map; Lua27 creates and fills the temple.
    assert.equal(calls[4].method, 'region');
    assert.deepEqual(calls[4].args[0].bounds(), { lx: 0, ly: 0, hx: 30, hy: 9 });
    assert.equal(calls[4].args[1], 'lit');
    assert.deepEqual(calls.slice(5, 12), [
        { method: 'region', args: [{ region: [12, 3, 20, 6], lit: 1,
            type: 'temple', filled: 1 }] },
        { method: 'door', args: ['closed', 9, 4] },
        { method: 'door', args: ['closed', 9, 5] },
        { method: 'door', args: ['locked', 11, 3] },
        { method: 'door', args: ['locked', 11, 6] },
        { method: 'stair', args: [{ dir: 'up', x: 4, y: 4 }] },
        { method: 'stair', args: [{ dir: 'down', x: 20, y: 6 }] },
    ]);
    // Lua37 protects the temple wall rectangle before Lua39's shrine.
    assert.equal(calls[12].method, 'non_diggable');
    assert.deepEqual(calls[12].args[0].bounds(), { lx: 11, ly: 2, hx: 21, hy: 7 });
    assert.deepEqual(calls[13], { method: 'altar',
        args: [{ x: 13, y: 5, align: 'chaos', type: 'shrine' }] });

    // Lua41..97 supplies 15 objects, six traps, and these 35 monsters.
    // Keep source names and class letters for the parser's gender RNG.
    const monsters = [
        ...Array.from({ length: 8 }, () => ['rabid rat']),
        [{ class: 'r', peaceful: 0 }],
        ...Array.from({ length: 5 }, () => ['giant eel']),
        ...Array.from({ length: 2 }, () => ['electric eel']),
        ['kraken'],
        ...Array.from({ length: 2 }, () => ['shark']),
        ...Array.from({ length: 2 }, () => [{ class: ';', peaceful: 0 }]),
        ...Array.from({ length: 5 }, () => [{ class: 'D', peaceful: 0 }]),
        ...Array.from({ length: 9 }, () => [{ class: 'S', peaceful: 0 }]),
    ];
    assert.equal((LUA.match(/^des\.monster\(/gm) ?? []).length, monsters.length);
    assert.deepEqual(calls.slice(14), [
        ...Array.from({ length: 15 }, () => ({ method: 'object', args: [] })),
        ...Array.from({ length: 6 }, () => ({ method: 'trap', args: [] })),
        ...monsters.map(args => ({ method: 'monster', args })),
    ]);
});
