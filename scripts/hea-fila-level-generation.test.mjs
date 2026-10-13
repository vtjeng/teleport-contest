import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const LUA = readFileSync('nethack-c/upstream/dat/Hea-fila.lua', 'utf8');

test('Hea-fila loader preserves its initialization and population order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });

    await QUEST_LEVEL_LOADERS['Hea-fila'](des);

    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: 'P' }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: 'P',
            smoothed: false, joined: true, lit: 1, walled: false }] },
    ]);
    assert.deepEqual(calls.slice(3, 13), [
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
        ...Array.from({ length: 8 }, () => ({ method: 'object', args: [] })),
    ]);

    const monsters = [
        ['rabid rat'],
        [{ class: 'r', peaceful: 0 }],
        [{ class: 'r', peaceful: 0 }],
        ['giant eel'],
        ['giant eel'],
        ['electric eel'],
        ...Array.from({ length: 4 }, () => [{ class: 'D', peaceful: 0 }]),
        ...Array.from({ length: 3 }, () => [{ class: 'S', peaceful: 0 }]),
    ];
    assert.equal((LUA.match(/^des\.monster\(/gm) ?? []).length, monsters.length);
    assert.deepEqual(calls.slice(13), [
        ...monsters.map(args => ({ method: 'monster', args })),
        ...Array.from({ length: 4 }, () => ({ method: 'trap', args: [] })),
    ]);
});
