import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const source = readFileSync('nethack-c/upstream/dat/Cav-goal.lua', 'utf8');
const sourceMap = source.match(/des\.map\(\[\[\n([\s\S]*?)\n\]\]\)/u)[1].split('\n');

test('Cav-goal is registered and preserves the complete Lua descriptor sequence', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Cav-goal'], 'function');
    const calls = [];
    const des = new Proxy({}, { get: (_target, method) => async (...args) => calls.push({ method, args }) });
    await QUEST_LEVEL_LOADERS['Cav-goal'](des);
    // Cav-goal.lua6-59: three initialization descriptors, lit region, stair,
    // nondiggable region, fifteen objects, four monsters and final wallify.
    assert.deepEqual(calls.map(c => c.method), [
        'level_init', 'level_flags', 'map', 'region', 'stair', 'non_diggable',
        ...Array(15).fill('object'), ...Array(4).fill('monster'), 'wallify',
    ]);
    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]);
    assert.deepEqual(calls[1].args, ['mazelevel']);
    assert.deepEqual(calls[2].args, [sourceMap]);
    // Lua33/37 selections cover the complete 76 by 20 source map.
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(calls[3].args[1], 'lit');
    assert.deepEqual(calls[4].args, ['up']); // Lua35 chooses a random square.
    assert.deepEqual(calls[5].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.deepEqual(calls[6].args, [{ id: 'mace', x: 23, y: 10, buc: 'blessed', spe: 0, name: 'The Sceptre of Might' }]);
    assert.ok(calls.slice(7, 21).every(c => c.args.length === 0)); // Lua40-53: fourteen random objects.
    assert.deepEqual(calls.slice(21, 25).map(c => c.args), [
        [{ id: 'Chromatic Dragon', x: 23, y: 10, asleep: 1 }],
        ['shrieker', 26, 13], ['shrieker', 25, 8], ['shrieker', 45, 11],
    ]); // Lua55-58 source monster names, coordinates and sleep state.
    assert.deepEqual(calls[25].args, []);
});

test('Cav-goal generated map stays byte-identical to the Lua map', async () => {
    const { extractCavGoalMap, renderCavGoalMap } = await import('./generate-cav-goal-level.mjs');
    const { CAV_GOAL_LEVEL_MAP } = await import('../js/cav_goal_level_data.js');
    assert.deepEqual(CAV_GOAL_LEVEL_MAP, sourceMap);
    assert.equal(renderCavGoalMap(extractCavGoalMap(source)), readFileSync('js/cav_goal_level_data.js', 'utf8'));
    // Lua9-30 supplies twenty fixed rows, each seventy-six columns wide.
    assert.equal(sourceMap.length, 20);
    assert.ok(sourceMap.every(row => row.length === 76));
});

test('Cav-goal waits for named artifact creation before random objects and monsters', async () => {
    const calls = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const des = new Proxy({}, { get: (_target, method) => (...args) => {
        calls.push({ method, args });
        // Lua39's named artifact completes before Lua40's random object.
        if (method === 'object' && args.length) return pending;
    } });
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Cav-goal'](des).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(calls.filter(c => c.method === 'object').length, 1);
    assert.equal(calls.filter(c => c.method === 'monster').length, 0);
    release();
    await loading;
    assert.equal(settled, true);
    assert.equal(calls.filter(c => c.method === 'object').length, 15);
});
