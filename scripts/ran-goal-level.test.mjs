import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    RAN_GOAL_DOORS, RAN_GOAL_LEVEL_MAP, RAN_GOAL_MONSTERS,
    RAN_GOAL_OBJECT_CALLS, RAN_GOAL_TRAP_COUNT,
} from '../js/ran_goal_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { extractRanGoalData, renderRanGoalData } from './generate-ran-goal-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Ran-goal.lua', 'utf8');

test('Ran-goal generated fixed data matches its complete source tables', () => {
    const data = extractRanGoalData(LUA);
    assert.deepEqual(data, {
        map: RAN_GOAL_LEVEL_MAP,
        objects: RAN_GOAL_OBJECT_CALLS,
        trapCount: RAN_GOAL_TRAP_COUNT,
        doors: RAN_GOAL_DOORS,
        monsters: RAN_GOAL_MONSTERS,
    });
    assert.equal(renderRanGoalData(data), readFileSync('js/ran_goal_level_data.js', 'utf8'));
    assert.equal(data.map.length, 20);
    assert.ok(data.map.every(row => row.length === 76));
    assert.equal(data.objects.length, 15);
    assert.deepEqual(data.objects[0], [{
        id: 'bow', x: 37, y: 10, buc: 'blessed', spe: 0, name: 'The Longbow of Diana',
    }]);
    assert.deepEqual(data.objects[1], ['chest', 37, 10]);
    assert.deepEqual(data.objects.slice(2, 10), [
        [{ coord: [36, 9] }], [{ coord: [36, 10] }], [{ coord: [36, 11] }],
        [{ coord: [37, 9] }], [{ coord: [37, 11] }], [{ coord: [38, 9] }],
        [{ coord: [38, 10] }], [{ coord: [38, 11] }],
    ]);
    assert.deepEqual(data.objects.slice(10), Array.from({ length: 5 }, () => []));
    assert.equal(data.trapCount, 6);
    assert.deepEqual(data.doors[0], { type: 'locked', x: 12, y: 8 });
    assert.equal(data.doors.length, 14);
    assert.equal(data.monsters.length, 28);
    assert.deepEqual(data.monsters[0], { id: 'Scorpius', x: 37, y: 10, peaceful: 0 });
    assert.deepEqual(data.monsters[1], { id: 'forest centaur', x: 36, y: 9, peaceful: 0 });
    assert.deepEqual(data.monsters.at(-1), { class: 's', peaceful: 0 });
    assert.ok(data.monsters.every(monster => monster.peaceful === 0));
});

test('Ran-goal production loader preserves all Lua top-level call order', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    await QUEST_LEVEL_LOADERS['Ran-goal'](des);

    assert.deepEqual(calls.slice(0, 5), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel'] },
        { method: 'map', args: [RAN_GOAL_LEVEL_MAP] },
        { method: 'region', args: [calls[3].args[0], 'lit'] },
        { method: 'stair', args: ['up', 19, 10] },
    ]);
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(calls[5].method, 'non_diggable');
    assert.deepEqual(calls[5].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.deepEqual(calls.slice(6, 21), RAN_GOAL_OBJECT_CALLS.map(args => ({
        method: 'object', args,
    })));
    assert.deepEqual(calls.slice(21, 27),
        Array.from({ length: 6 }, () => ({ method: 'trap', args: [] })));
    assert.deepEqual(calls.slice(27, 41), RAN_GOAL_DOORS.map(({ type, x, y }) => ({
        method: 'door', args: [type, x, y],
    })));
    assert.deepEqual(calls.slice(41, 69), RAN_GOAL_MONSTERS.map(monster => ({
        method: 'monster', args: [monster],
    })));
    assert.deepEqual(calls[69], { method: 'wallify', args: [] });
    assert.equal(calls.length, 70);
});
