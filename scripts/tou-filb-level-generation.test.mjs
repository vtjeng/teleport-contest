import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const LUA = readFileSync('nethack-c/upstream/dat/Tou-filb.lua', 'utf8');

test('Tou-filb preserves its initialization and population order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });

    await QUEST_LEVEL_LOADERS['Tou-filb'](des);

    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: ' ',
            smoothed: true, joined: true, walled: true }] },
    ]);

    // Tou-filb.lua lines 13-31 contain two stairs, eleven objects, then four traps.
    assert.deepEqual(calls.slice(3, 20), [
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
        ...Array.from({ length: 11 }, () => ({ method: 'object', args: [] })),
        ...Array.from({ length: 4 }, () => ({ method: 'trap', args: [] })),
    ]);

    // Lines 33-39 contain the hostile soldier, captains, class-H and class-C monsters, and spider.
    const monsters = [
        [{ id: 'soldier', peaceful: 0 }],
        ...Array.from({ length: 2 }, () => [{ id: 'captain', peaceful: 0 }]),
        ...Array.from({ length: 2 }, () => [{ class: 'H', peaceful: 0 }]),
        [{ class: 'C', peaceful: 0 }],
        ['s'],
    ];
    assert.equal((LUA.match(/^des\.monster\(/gm) ?? []).length, monsters.length);
    assert.deepEqual(calls.slice(20), monsters.map(args => ({ method: 'monster', args })));
});
