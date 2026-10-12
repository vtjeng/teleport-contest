import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import {
    WIZ_GOAL_LEVEL_DOORS, WIZ_GOAL_LEVEL_MAP, WIZ_GOAL_LEVEL_MONSTERS,
    WIZ_GOAL_LEVEL_OBJECTS, WIZ_GOAL_RANDOM_TRAP_COUNT,
} from '../js/wiz_goal_level_data.js';
import { ThemeroomSelection } from '../js/themerooms.js';
import { extractWizGoalData, renderWizGoalData } from './generate-wiz-goal-level.mjs';

const lua = readFileSync('nethack-c/upstream/dat/Wiz-goal.lua', 'utf8');
const generated = readFileSync('js/wiz_goal_level_data.js', 'utf8');

test('generated Wizard goal data preserves source map and ordered descriptors', () => {
    const data = extractWizGoalData(lua);
    assert.deepEqual(data, {
        rows: WIZ_GOAL_LEVEL_MAP,
        doors: WIZ_GOAL_LEVEL_DOORS,
        objects: WIZ_GOAL_LEVEL_OBJECTS,
        monsters: WIZ_GOAL_LEVEL_MONSTERS,
        traps: WIZ_GOAL_RANDOM_TRAP_COUNT,
    });
    assert.equal(renderWizGoalData(data), generated);
    assert.equal(data.rows.length, 20); // Wiz-goal.lua:9-30.
    assert.ok(data.rows.every(row => row.length === 76));
    assert.equal(data.doors.length, 16); // Wiz-goal.lua:50-65.
    assert.equal(data.objects.length, 15); // Wiz-goal.lua:73-87.
    assert.equal(data.traps, 6); // Wiz-goal.lua:89-94.
    assert.equal(data.monsters.length, 36); // Wiz-goal.lua:96-132.
    assert.equal(data.monsters.filter(([spec]) => spec?.class === 'B').length, 11);
    assert.equal(data.monsters.filter(([spec]) => spec?.class === 'i').length, 8);
});

function capture(pending) {
    const calls = [];
    let objectCalls = 0;
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => {
                calls.push({ method, args });
                if (method === 'object' && ++objectCalls === 2) await pending;
            };
        },
    });
    return { calls, des };
}

function normalizeRegions(calls) {
    return calls.filter(call => call.method === 'region').map(({ args }) => {
        const [selection, kind] = args;
        return selection instanceof ThemeroomSelection
            ? ['area', selection.bounds(), kind]
            : ['region', selection];
    });
}

test('Wiz-goal registers and executes the full program in source order', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Wiz-goal'], 'function');
    let releaseObject;
    const pendingObject = new Promise(resolve => { releaseObject = resolve; });
    const { calls, des } = capture(pendingObject);
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Wiz-goal'](des).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));

    assert.equal(settled, false);
    assert.equal(calls.filter(call => call.method === 'object').length, 2);
    assert.equal(calls.filter(call => call.method === 'trap').length, 0);
    releaseObject();
    await loading;

    assert.deepEqual(calls.map(call => call.method), [
        'level_init', 'level_flags', 'map', ...Array(17).fill('region'),
        ...Array(16).fill('door'), 'stair', 'non_diggable', 'altar',
        ...Array(15).fill('object'), ...Array(6).fill('trap'),
        ...Array(36).fill('monster'),
    ]); // Whole Wiz-goal.lua:7-132, preserving descriptor order.
    assert.deepEqual(calls.slice(0, 3).map(call => call.args), [
        [{ style: 'solidfill', fg: ' ' }], ['mazelevel'], [WIZ_GOAL_LEVEL_MAP],
    ]);
    assert.deepEqual(normalizeRegions(calls), [
        ['region', { region: [13, 10, 18, 12], lit: 0, type: 'temple', filled: 2 }],
        ['area', { lx: 13, ly: 6, hx: 18, hy: 8 }, 'lit'],
        ['area', { lx: 20, ly: 4, hx: 30, hy: 14 }, 'unlit'],
        ['area', { lx: 32, ly: 6, hx: 33, hy: 7 }, 'unlit'],
        ['area', { lx: 35, ly: 6, hx: 36, hy: 7 }, 'unlit'],
        ['area', { lx: 38, ly: 6, hx: 39, hy: 7 }, 'unlit'],
        ['area', { lx: 41, ly: 6, hx: 42, hy: 7 }, 'unlit'],
        ['area', { lx: 44, ly: 6, hx: 45, hy: 7 }, 'unlit'],
        ['area', { lx: 47, ly: 6, hx: 48, hy: 7 }, 'unlit'],
        ['area', { lx: 32, ly: 9, hx: 48, hy: 9 }, 'unlit'],
        ['area', { lx: 32, ly: 11, hx: 33, hy: 12 }, 'unlit'],
        ['area', { lx: 35, ly: 11, hx: 36, hy: 12 }, 'unlit'],
        ['area', { lx: 38, ly: 11, hx: 39, hy: 12 }, 'unlit'],
        ['area', { lx: 41, ly: 11, hx: 42, hy: 12 }, 'unlit'],
        ['area', { lx: 44, ly: 11, hx: 45, hy: 12 }, 'unlit'],
        ['area', { lx: 47, ly: 11, hx: 48, hy: 12 }, 'unlit'],
        ['area', { lx: 50, ly: 4, hx: 60, hy: 14 }, 'lit'],
    ]);
    assert.deepEqual(calls.filter(call => call.method === 'door').map(call => call.args),
        WIZ_GOAL_LEVEL_DOORS.map(door => door));
    assert.deepEqual(calls.filter(call => call.method === 'stair')[0].args, ['up', 55, 5]);
    assert.deepEqual(calls.filter(call => call.method === 'non_diggable')[0].args[0].bounds(),
        { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.deepEqual(calls.filter(call => call.method === 'altar')[0].args, [
        { coord: [16, 11], aligned: 'noncoaligned', type: 'altar' },
    ]);
    assert.deepEqual(calls.filter(call => call.method === 'object').map(call => call.args),
        WIZ_GOAL_LEVEL_OBJECTS);
    assert.deepEqual(calls.filter(call => call.method === 'monster').map(call => call.args),
        WIZ_GOAL_LEVEL_MONSTERS);
});
