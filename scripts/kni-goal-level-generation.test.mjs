import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { KNI_GOAL_LEVEL_MAP } from '../js/kni_goal_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { MIRROR } from '../js/objects.js';
import { PM_IXOTH, PM_OCHRE_JELLY, PM_QUASIT } from '../js/monsters.js';
import {
    extractKniGoalMap,
    renderKniGoalMap,
} from './generate-kni-goal-level.mjs';

const C_SOURCE = readFileSync('nethack-c/upstream/dat/Kni-goal.lua', 'utf8');

function descriptorLog() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => calls.push({ method, args });
        },
    });
    return { calls, des };
}

test('generated Kni-goal map is copied from dat/Kni-goal.lua', () => {
    const sourceMap = extractKniGoalMap(C_SOURCE);
    assert.deepEqual(KNI_GOAL_LEVEL_MAP, sourceMap);
    assert.equal(
        renderKniGoalMap(sourceMap),
        readFileSync('js/kni_goal_level_data.js', 'utf8'),
    );
    assert.equal(sourceMap.length, 20);
    assert.ok(sourceMap.every((row) => row.length === 76));
});

test('Kni-goal loader preserves source descriptor order and counts', async () => {
    const { calls, des } = descriptorLog();
    await QUEST_LEVEL_LOADERS['Kni-goal'](des);

    assert.deepEqual(calls.slice(0, 3).map(({ method, args }) => ({ method, args })), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel'] },
        { method: 'map', args: [KNI_GOAL_LEVEL_MAP] },
    ]);
    assert.equal(calls[3].method, 'region');
    assert.equal(calls[3].args[1], 'lit');
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 14, hy: 19 });
    assert.equal(calls[4].method, 'region');
    assert.equal(calls[4].args[1], 'unlit');
    assert.deepEqual(calls[4].args[0].bounds(), { lx: 15, ly: 0, hx: 75, hy: 19 });
    assert.deepEqual(calls[5], {
        method: 'stair', args: [{ dir: 'up', coord: [3, 8] }],
    });
    assert.equal(calls[6].method, 'non_diggable');
    assert.deepEqual(calls[6].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });

    const objects = calls.filter(({ method }) => method === 'object');
    assert.equal(objects.length, 22);
    assert.deepEqual(objects[0].args, [{
        id: MIRROR, x: 50, y: 6,
        buc: 'blessed', spe: 0, name: 'The Magic Mirror of Merlin',
    }]);
    assert.deepEqual(objects.slice(1, 16).map(({ args }) => args[0]),
        Array.from({ length: 15 }, (_unused, index) => ({
            x: 33 + Math.floor(index / 5), y: 1 + (index % 5),
        })));
    assert.ok(objects.slice(16).every(({ args }) => args.length === 0));

    const traps = calls.filter(({ method }) => method === 'trap');
    assert.equal(traps.length, 8);
    assert.deepEqual(traps.slice(0, 3).map(({ args }) => args), [
        [{ type: 'spiked pit', x: 13, y: 7 }],
        [{ type: 'spiked pit', x: 12, y: 8 }],
        [{ type: 'spiked pit', x: 12, y: 9 }],
    ]);
    assert.ok(traps.slice(3).every(({ args }) => args.length === 0));

    const monsters = calls.filter(({ method }) => method === 'monster');
    assert.equal(monsters.length, 28);
    assert.deepEqual(monsters[0].args, [{ id: PM_IXOTH, x: 50, y: 6, peaceful: 0 }]);
    assert.ok(monsters.slice(1, 17).every(({ args }) =>
        args.length === 1 && args[0].id === PM_QUASIT && args[0].peaceful === 0));
    assert.deepEqual(monsters.slice(17, 19).map(({ args }) => args), [
        [{ class: 'i', peaceful: 0 }],
        [{ class: 'i', peaceful: 0 }],
    ]);
    assert.ok(monsters.slice(19, 27).every(({ args }) =>
        args.length === 1 && args[0].id === PM_OCHRE_JELLY && args[0].peaceful === 0));
    assert.deepEqual(monsters[27].args, [{ class: 'j', peaceful: 0 }]);
});
