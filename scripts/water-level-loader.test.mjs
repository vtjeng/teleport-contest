import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { water, WATER_LEVEL_LOADERS } from '../js/water_levels.js';

const C_SOURCE = readFileSync('nethack-c/upstream/dat/water.lua', 'utf8');

function descriptorLog() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return (...args) => calls.push({ method, args });
        },
    });
    return { calls, des };
}

test('Water loader is registered under the special-level proto name', () => {
    assert.deepEqual(Object.keys(WATER_LEVEL_LOADERS), ['water']);
    assert.equal(WATER_LEVEL_LOADERS.water, water);
});

test('Water map matches the complete dat/water.lua map', async () => {
    const sourceMap = C_SOURCE.match(/des\.map\(\[\[([\s\S]*?)\]\]\)/u)?.[1]
        ?.trim();
    assert.ok(sourceMap, 'dat/water.lua must contain its fixed map');

    const { calls, des } = descriptorLog();
    await water(des);
    assert.equal(calls[3].method, 'map');
    const rows = calls[3].args[0];
    assert.deepEqual(rows.join('\n'), sourceMap);
    assert.equal(rows.length, 20);
    assert.ok(rows.every((row) => row.length === 76 && /^W+$/u.test(row)));
});

test('Water loader preserves source setup, regions, and monster order', async () => {
    const { calls, des } = descriptorLog();
    await water(des);

    assert.deepEqual(calls.slice(0, 6), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        {
            method: 'level_flags',
            args: ['mazelevel', 'noteleport', 'hardfloor', 'shortsighted'],
        },
        {
            method: 'message',
            args: ['You find yourself suspended in an air bubble surrounded by water.'],
        },
        { method: 'map', args: [calls[3].args[0]] },
        { method: 'teleport_region', args: [{ region: [0, 0, 25, 19] }] },
        {
            method: 'levregion',
            args: [{ type: 'portal', region: [51, 0, 75, 19], name: 'astral' }],
        },
    ]);

    const monsters = calls.slice(6).map(({ method, args }) => {
        assert.equal(method, 'monster');
        return args[0];
    });
    assert.equal(monsters.length, 60);
    assert.deepEqual(monsters.slice(0, 8), Array(8).fill('giant eel'));
    assert.deepEqual(monsters.slice(8, 16), Array(8).fill('electric eel'));
    assert.deepEqual(monsters.slice(16, 25), Array(9).fill('kraken'));
    assert.deepEqual(monsters.slice(25, 29), Array(4).fill('shark'));
    assert.deepEqual(monsters.slice(29, 33), Array(4).fill('piranha'));
    assert.deepEqual(monsters.slice(33, 37), Array(4).fill('jellyfish'));
    assert.deepEqual(monsters.slice(37, 41), Array(4).fill(';'));
    assert.deepEqual(monsters.slice(41), Array(19).fill({
        id: 'water elemental', peaceful: 0,
    }));
});
