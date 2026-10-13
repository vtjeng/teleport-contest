import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const LUA = readFileSync('nethack-c/upstream/dat/Cav-filb.lua', 'utf8');

test('Cav-filb loader preserves initialization and trap-before-monster order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });

    await QUEST_LEVEL_LOADERS['Cav-filb'](des);

    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: ' ',
            smoothed: true, joined: true, walled: true }] },
    ]);
    assert.deepEqual(calls.slice(3, 21), [
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
        ...Array.from({ length: 12 }, () => ({ method: 'object', args: [] })),
        ...Array.from({ length: 4 }, () => ({ method: 'trap', args: [] })),
    ]);

    const monsters = [
        ...Array.from({ length: 4 }, () => [{ id: 'bugbear', peaceful: 0 }]),
        ...Array.from({ length: 2 }, () => [{ class: 'h', peaceful: 0 }]),
        ...Array.from({ length: 2 }, () => [{ id: 'hill giant', peaceful: 0 }]),
    ];
    assert.equal((LUA.match(/^des\.monster\(/gm) ?? []).length, monsters.length);
    assert.deepEqual(calls.slice(21), monsters.map(args => ({ method: 'monster', args })));
});
