import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
    EARTH_LEVEL_MAP,
    EARTH_MONSTERS,
} from '../js/earth_level_data.js';
import { EARTH_LEVEL_LOADERS } from '../js/earth_levels.js';
import {
    extractEarthMap,
    extractEarthMonsters,
    renderEarthData,
} from './generate-earth-level.mjs';

const EARTH_SOURCE = new URL(
    '../nethack-c/upstream/dat/earth.lua', import.meta.url,
);

test('generated Earth map and monster descriptors match dat/earth.lua', async () => {
    const source = await readFile(EARTH_SOURCE, 'utf8');
    const rows = extractEarthMap(source);
    const monsters = extractEarthMonsters(source);

    assert.deepEqual(EARTH_LEVEL_MAP, rows);
    assert.deepEqual(EARTH_MONSTERS, monsters);
    assert.equal(rows.length, 20);
    assert(rows.every((row) => row.length === 76));
    assert.equal(monsters.length, 62);
    assert.equal(
        renderEarthData(rows, monsters),
        await readFile(new URL('../js/earth_level_data.js', import.meta.url), 'utf8'),
    );
});

test('earth loader preserves Lua API order and descriptor call forms', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => {
                calls.push({ method, args });
            };
        },
    });

    await EARTH_LEVEL_LOADERS.earth(des);

    assert.deepEqual(calls.slice(0, 9), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        {
            method: 'level_flags',
            args: ['mazelevel', 'noteleport', 'hardfloor', 'shortsighted'],
        },
        { method: 'message', args: ['Well done, mortal!'] },
        { method: 'message', args: ['But now thou must face the final Test...'] },
        { method: 'message', args: ['Prove thyself worthy or perish!'] },
        { method: 'map', args: [EARTH_LEVEL_MAP] },
        {
            method: 'replace_terrain',
            args: [{
                region: [0, 0, 75, 19],
                fromterrain: ' ',
                toterrain: '.',
                lit: 0,
                chance: 5,
            }],
        },
        { method: 'teleport_region', args: [{ region: [69, 16, 69, 16] }] },
        {
            method: 'levregion',
            args: [{
                region: [0, 0, 75, 19],
                exclude: [65, 13, 75, 19],
                type: 'portal',
                name: 'air',
            }],
        },
    ]);

    const monsterCalls = calls.slice(9, 9 + EARTH_MONSTERS.length);
    assert.equal(monsterCalls.length, 62);
    for (const [index, monster] of EARTH_MONSTERS.entries()) {
        const expectedArgs = monster.form === 'named-at-coordinate'
            ? [monster.id, monster.x, monster.y]
            : [{
                id: monster.id,
                x: monster.x,
                y: monster.y,
                peaceful: monster.peaceful,
            }];
        assert.deepEqual(monsterCalls[index], {
            method: 'monster',
            args: expectedArgs,
        });
    }
    assert.deepEqual(calls.at(-1), { method: 'object', args: ['boulder'] });
    assert.equal(calls.length, 9 + 62 + 1);
});
