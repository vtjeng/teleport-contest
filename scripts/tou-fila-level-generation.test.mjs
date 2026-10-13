import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const source = readFileSync('nethack-c/upstream/dat/Tou-fila.lua', 'utf8');

test('Tou-fila translates the complete source program in call order', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Tou-fila'], 'function');

    const calls = [];
    const des = Object.fromEntries([
        'level_init', 'level_flags', 'stair', 'object', 'trap', 'monster',
    ].map(property => [property, async (...args) => calls.push({ property, args })]));
    await QUEST_LEVEL_LOADERS['Tou-fila'](des);

    assert.deepEqual(calls.slice(0, 3), [
        { property: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { property: 'level_flags', args: ['mazelevel', 'noflip'] },
        { property: 'level_init', args: [{
            style: 'mines', fg: '.', bg: ' ',
            smoothed: true, joined: true, walled: true,
        }] },
    ]); // Tou-fila.lua:6-9 preserves both level_init calls and source defaults.
    assert.deepEqual(calls.slice(3, 5), [
        { property: 'stair', args: ['up'] },
        { property: 'stair', args: ['down'] },
    ]); // Tou-fila.lua:14-15.

    const objects = calls.filter(({ property }) => property === 'object');
    const traps = calls.filter(({ property }) => property === 'trap');
    const monsters = calls.filter(({ property }) => property === 'monster');
    assert.equal(objects.length, (source.match(/^des\.object\(\)$/gmu) ?? []).length);
    assert.equal(traps.length, (source.match(/^des\.trap\(\)$/gmu) ?? []).length);
    assert.deepEqual(monsters.map(({ args }) => args[0]), [
        ...Array.from({ length: 5 }, () => ({ id: 'soldier', peaceful: 0 })),
        { class: 'H', peaceful: 0 },
        { class: 'C', peaceful: 0 },
    ]); // Tou-fila.lua:21-29 preserves hostile named and class-based monsters.
    assert.equal(calls.length, 23);
});
