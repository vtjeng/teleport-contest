import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { initRng } from '../js/rng.js';
import {
    VAL_GOAL_DRAWBRIDGES, VAL_GOAL_LEVEL_MAP, VAL_GOAL_MONSTERS,
    VAL_GOAL_OBJECT_CALLS, VAL_GOAL_TRAPS,
} from '../js/val_goal_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { extractValGoalData, renderValGoalData } from './generate-val-goal-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Val-goal.lua', 'utf8');

test('Val-goal generated tables preserve the complete source data', () => {
    const data = extractValGoalData(LUA);
    assert.deepEqual(data, {
        map: VAL_GOAL_LEVEL_MAP,
        objects: VAL_GOAL_OBJECT_CALLS,
        traps: VAL_GOAL_TRAPS,
        monsters: VAL_GOAL_MONSTERS,
        bridges: VAL_GOAL_DRAWBRIDGES,
    });
    assert.equal(renderValGoalData(data), readFileSync('js/val_goal_level_data.js', 'utf8'));
    assert.equal(data.map.length, 17);
    assert.ok(data.map.every(row => row.length === 35));
    assert.ok(data.map.some(row => row.includes('x')));
    assert.equal(data.objects.length, 15);
    assert.deepEqual(data.objects[0], [{
        id: 'crystal ball', x: 17, y: 8, buc: 'blessed', spe: 5, name: 'The Orb of Fate',
    }]);
    assert.deepEqual(data.objects.slice(1), Array.from({ length: 14 }, () => []));
    assert.deepEqual(data.traps, [
        ['board', 13, 8], ['board', 21, 8], ['fire'], ['fire'], ['fire'], ['fire'],
        ['board'], [], [],
    ]);
    assert.equal(data.monsters.length, 20);
    assert.deepEqual(data.monsters[0], ['Lord Surtur', 17, 8]);
    assert.deepEqual(data.monsters.at(-1), [{ class: 'H', peaceful: 0 }]);
    assert.deepEqual(data.bridges, [
        { x: 17, y: 2, dir: 'south', state: 'random' },
        { x: 17, y: 14, dir: 'north', state: 'open' },
        { x: 17, y: 14, dir: 'north', state: 'random' },
    ]);
});

test('Val-goal production loader preserves Lua top-level call order', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Val-goal'], 'function');
    initRng(19017);
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    await QUEST_LEVEL_LOADERS['Val-goal'](des);

    assert.deepEqual(calls.slice(0, 11).map(({ method }) => method), [
        'level_init', 'level_flags', 'level_init', 'map', 'region',
        'replace_terrain', 'stair', 'non_diggable', 'drawbridge', 'drawbridge', 'object',
    ]);
    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: 'L' }]);
    assert.deepEqual(calls[1].args, ['mazelevel', 'icedpools']);
    assert.deepEqual(calls[2].args, [{ style: 'mines', fg: '.', bg: 'L',
        smoothed: true, joined: true, lit: 1, walled: false }]);
    assert.deepEqual(calls[3].args, [VAL_GOAL_LEVEL_MAP]);
    assert.deepEqual(calls[4].args[0].bounds(), { lx: 0, ly: 0, hx: 34, hy: 16 });
    assert.deepEqual(calls[5].args, [{ region: [44, 9, 46, 11], fromterrain: 'L', toterrain: '.', chance: 50 }]);
    assert.deepEqual(calls[6].args, ['up', 45, 10]);
    assert.deepEqual(calls[7].args[0].bounds(), { lx: 0, ly: 0, hx: 34, hy: 16 });
    assert.deepEqual(calls[8].args, [VAL_GOAL_DRAWBRIDGES[0]]);
    assert.ok([VAL_GOAL_DRAWBRIDGES[1], VAL_GOAL_DRAWBRIDGES[2]]
        .some(bridge => JSON.stringify(calls[9].args) === JSON.stringify([bridge])));
    assert.deepEqual(calls.slice(10, 25), VAL_GOAL_OBJECT_CALLS.map(args => ({ method: 'object', args })));
    assert.deepEqual(calls.slice(25, 34), VAL_GOAL_TRAPS.map(args => ({ method: 'trap', args })));
    assert.deepEqual(calls.slice(34), VAL_GOAL_MONSTERS.map(args => ({ method: 'monster', args })));
    assert.equal(calls.length, 54);
});
