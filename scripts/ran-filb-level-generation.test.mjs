import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const LUA = readFileSync('nethack-c/upstream/dat/Ran-filb.lua', 'utf8');

test('Ran-filb preserves its initialization and population order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });

    await QUEST_LEVEL_LOADERS['Ran-filb'](des);

    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'noflip'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: ' ',
            smoothed: true, joined: true, walled: true }] },
    ]);

    // Ran-filb.lua lines 13-31 contain two stairs, eleven objects, then four traps.
    assert.deepEqual(calls.slice(3, 20), [
        { method: 'stair', args: ['up'] },
        { method: 'stair', args: ['down'] },
        ...Array.from({ length: 11 }, () => ({ method: 'object', args: [] })),
        ...Array.from({ length: 4 }, () => ({ method: 'trap', args: [] })),
    ]);

    // Lines 33-39 contain four hostile mountain centaurs, one hostile C-class monster,
    // and two hostile scorpions, all in that order.
    const monsters = [
        ...Array.from({ length: 4 }, () => [{ id: 'mountain centaur', peaceful: 0 }]),
        [{ class: 'C', peaceful: 0 }],
        ...Array.from({ length: 2 }, () => [{ id: 'scorpion', peaceful: 0 }]),
    ];
    assert.equal((LUA.match(/^des\.monster\(/gm) ?? []).length, monsters.length);
    assert.deepEqual(calls.slice(20), monsters.map(args => ({ method: 'monster', args })));
});
