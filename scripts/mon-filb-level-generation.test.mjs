import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const LUA = readFileSync('nethack-c/upstream/dat/Mon-filb.lua', 'utf8');

test('Mon-filb preserves all room contents and corridor order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => {
                calls.push({ method, args });
                await args[0]?.contents?.();
            };
        },
    });

    await QUEST_LEVEL_LOADERS['Mon-filb'](des);

    assert.equal((LUA.match(/^des\.room\(/gm) ?? []).length, 6);
    assert.equal((LUA.match(/^des\.random_corridors\(/gm) ?? []).length, 1);
    assert.deepEqual(calls.map(({ method, args }) => method === 'room'
        ? [method, args[0].type] : [method, ...args]), [
        ['room', 'ordinary'],
        ['stair', 'up'],
        ['object'],
        ['monster', { class: 'X', peaceful: 0 }],
        ['room', 'ordinary'],
        ['object'],
        ['object'],
        ['monster', { class: 'X', peaceful: 0 }],
        ['room', 'ordinary'],
        ['object'],
        ['trap'],
        ['object'],
        ['monster', { class: 'E', peaceful: 0 }],
        ['room', 'ordinary'],
        ['stair', 'down'],
        ['object'],
        ['trap'],
        ['monster', { class: 'E', peaceful: 0 }],
        ['monster', 'earth elemental'],
        ['room', 'ordinary'],
        ['object'],
        ['object'],
        ['trap'],
        ['monster', { class: 'X', peaceful: 0 }],
        ['room', 'ordinary'],
        ['object'],
        ['trap'],
        ['monster', 'earth elemental'],
        ['random_corridors'],
    ]);
});
