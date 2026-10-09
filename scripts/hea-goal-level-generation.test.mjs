import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { HEA_GOAL_LEVEL_MAP } from '../js/hea_goal_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { extractHeaGoalMap, renderHeaGoalMap } from './generate-hea-goal-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Hea-goal.lua', 'utf8');

test('Hea-goal generated map retains every upstream row', () => {
    const rows = extractHeaGoalMap(LUA);
    assert.deepEqual(HEA_GOAL_LEVEL_MAP, rows);
    assert.equal(renderHeaGoalMap(rows),
        readFileSync('js/hea_goal_level_data.js', 'utf8'));
    // Hea-goal.lua's map rectangle is x0..40, y0..11.
    assert.equal(rows.length, 12);
    assert.ok(rows.every(row => row.length === 41));
});

test('Hea-goal executes every source descriptor in order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    await QUEST_LEVEL_LOADERS['Hea-goal'](des);
    // These parameters are the two initializers and map in Lua6..27.
    assert.deepEqual(calls.slice(0, 4), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: 'P' }] },
        { method: 'level_flags', args: ['mazelevel'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: 'P',
            smoothed: false, joined: true, lit: 1, walled: false }] },
        { method: 'map', args: [HEA_GOAL_LEVEL_MAP] },
    ]);
    const [region, stair, walls] = calls.slice(4, 7);
    // Lua29..33 lights and protects the entire source map rectangle.
    assert.equal(region.method, 'region');
    assert.deepEqual(region.args[0].bounds(), { lx: 0, ly: 0, hx: 40, hy: 11 });
    assert.equal(region.args[1], 'lit');
    assert.deepEqual(stair, { method: 'stair', args: [{ dir: 'up', x: 39, y: 10 }] });
    assert.equal(walls.method, 'non_diggable');
    assert.deepEqual(walls.args[0].bounds(), { lx: 0, ly: 0, hx: 40, hy: 11 });

    // Preserve source strings: lspo_monster name lookup has gender RNG.
    const objects = [
        [{ id: 'quarterstaff', x: 20, y: 6, buc: 'blessed', spe: 0,
            name: 'The Staff of Aesculapius' }],
        ['wand of lightning', 20, 6],
        ...Array.from({ length: 14 }, () => []),
    ];
    const monsters = [
        [{ id: 'Cyclops', x: 20, y: 6, peaceful: 0 }],
        ...Array.from({ length: 3 }, () => ['rabid rat']),
        ...Array.from({ length: 2 }, () => [{ class: 'r', peaceful: 0 }]),
        ...Array.from({ length: 6 }, () => ['giant eel']),
        ...Array.from({ length: 2 }, () => ['electric eel']),
        ...Array.from({ length: 2 }, () => ['shark']),
        [{ class: ';', peaceful: 0 }],
        ...Array.from({ length: 5 }, () => [{ class: 'D', peaceful: 0 }]),
        ...Array.from({ length: 10 }, () => [{ class: 'S', peaceful: 0 }]),
    ];
    // Counts and order below match Lua35..89, including all random calls.
    assert.equal((LUA.match(/^des\.object\(/gm) ?? []).length, objects.length);
    assert.equal((LUA.match(/^des\.monster\(/gm) ?? []).length, monsters.length);
    assert.deepEqual(calls.slice(7), [
        ...objects.map(args => ({ method: 'object', args })),
        ...Array.from({ length: 6 }, () => ({ method: 'trap', args: [] })),
        ...monsters.map(args => ({ method: 'monster', args })),
    ]);
});
