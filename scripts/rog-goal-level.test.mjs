import assert from 'node:assert/strict';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
test('Rog-goal registers the whole Rogue quest goal program', () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Rog-goal'], 'function');
});

import { readFileSync } from 'node:fs';
import { extractRogGoalData, renderRogGoalData } from './generate-rog-goal-level.mjs';
import { ROG_GOAL_LEVEL_MAP, ROG_GOAL_MONSTERS } from '../js/rog_goal_level_data.js';
const source = readFileSync('nethack-c/upstream/dat/Rog-goal.lua', 'utf8');
test('generated Rogue goal map and population preserve whole source descriptors', () => {
    const data = extractRogGoalData(source);
    assert.deepEqual(data, { map: ROG_GOAL_LEVEL_MAP, monsters: ROG_GOAL_MONSTERS });
    assert.equal(renderRogGoalData(data), readFileSync('js/rog_goal_level_data.js', 'utf8'));
});
function harness(pending) {
    const calls = [];
    const des = new Proxy({}, { get(target, method) {
        return async (...args) => {
            calls.push({ method, args });
            if (method === 'object' && args[0]?.montype === 'chameleon') await pending;
        };
    } });
    return { des, calls };
}
test('Rogue goal preserves complete descriptor sequence and stair coordinate frames', async () => {
    const { des, calls } = harness();
    await QUEST_LEVEL_LOADERS['Rog-goal'](des);
    assert.deepEqual(calls.map(c => c.method), [
        'level_init', 'level_flags', 'map', 'region', 'levregion', 'non_diggable', 'trap',
        ...Array(15).fill('object'), ...Array(11).fill('trap'), ...Array(39).fill('monster'),
    ]); // Lua5–110 entire program: fixed spiked pit, two exact/13random objects,11random traps,39monsters.
    assert.deepEqual(calls.slice(0, 3).map(c => c.args), [
        [{ style: 'solidfill', fg: ' ' }], ['mazelevel', 'noteleport'], [ROG_GOAL_LEVEL_MAP],
    ]);
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 20 });
    assert.equal(calls[3].args[1], 'lit');
    assert.deepEqual(calls[4].args, [{ region: [1, 0, 15, 20], region_islev: 1,
        exclude: [1, 18, 4, 20], type: 'stair-up' }]); // Lua36 absolute region and relative exclusion.
    assert.deepEqual(calls[5].args[0].bounds(), calls[3].args[0].bounds());
    assert.deepEqual(calls[6].args, ['spiked pit', 37, 7]); // Lua41 fixed gnome deterrent.
    assert.deepEqual(calls.slice(7, 9).map(c => c.args[0]), [
        { id: 'skeleton key', x: 38, y: 10, buc: 'blessed', spe: 0, name: 'The Master Key of Thievery' },
        { id: 'tin', x: 26, y: 12, montype: 'chameleon' },
    ]); // Lua44–45 canonical object names and named-species descriptor.
    assert.deepEqual(calls.filter(c => c.method === 'monster').map(c => c.args[0]), ROG_GOAL_MONSTERS);
    assert.ok(calls.filter(c => c.method === 'monster').every(c => c.args[0].peaceful === 0));
});
test('Rogue goal awaits chameleon tin before random objects and population', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const { des, calls } = harness(pending);
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Rog-goal'](des).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(calls.length, 9); // Lua45 tin after eight earlier descriptors.
    assert.equal(calls.at(-1).args[0].montype, 'chameleon');
    release();
    await loading;
    assert.equal(settled, true);
    assert.equal(calls.at(-1).args[0].id, 'shark'); // Source final descriptor; no extra wallify.
});
