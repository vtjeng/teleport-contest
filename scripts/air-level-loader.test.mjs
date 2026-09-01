import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { air } from '../js/air_levels.js';
import { AIR_LEVEL_MAP } from '../js/air_level_data.js';
import { def_char_to_monclass } from '../js/drawing.js';
import { selection_area } from '../js/themerooms.js';
import {
    extractAirMap,
    renderAirMap,
} from './generate-air-level.mjs';

const C_SOURCE = readFileSync('nethack-c/upstream/dat/air.lua', 'utf8');

function descriptorLog() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return (...args) => calls.push({ method, args });
        },
    });
    return { calls, des };
}

test('generated Air map is copied from dat/air.lua', () => {
    const sourceMap = extractAirMap(C_SOURCE);
    assert.deepEqual(AIR_LEVEL_MAP, sourceMap);
    assert.equal(
        renderAirMap(sourceMap),
        readFileSync('js/air_level_data.js', 'utf8'),
    );
});

test('Air loader preserves the Lua setup and monster descriptor order', async () => {
    const { calls, des } = descriptorLog();
    await air(des);

    assert.deepEqual(calls.slice(0, 5), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        {
            method: 'level_flags',
            args: ['mazelevel', 'noteleport', 'hardfloor', 'shortsighted', 'stormy'],
        },
        { method: 'message', args: ['What a strange feeling!'] },
        {
            method: 'message',
            args: ['You notice that there is no gravity here.'],
        },
        { method: 'map', args: [AIR_LEVEL_MAP] },
    ]);
    assert.deepEqual(calls.slice(5, 9), [
        {
            method: 'teleport_region',
            args: [{
                region: [1, 0, 24, 20], region_islev: 1,
                exclude: [25, 0, 79, 20], exclude_islev: 1, dir: 'up',
            }],
        },
        {
            method: 'teleport_region',
            args: [{
                region: [56, 0, 79, 20], region_islev: 1,
                exclude: [1, 0, 55, 20], exclude_islev: 1, dir: 'down',
            }],
        },
        {
            method: 'levregion',
            args: [{
                region: [57, 1, 78, 19], region_islev: 1,
                type: 'portal', name: 'fire',
            }],
        },
        { method: 'region', args: [selection_area(0, 0, 75, 19), 'lit'] },
    ]);
    assert.equal(calls[8].args[0].numpoints(), 76 * 20);
    assert.deepEqual(calls[8].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });

    const monsters = calls.slice(9).map(({ method, args }) => {
        assert.equal(method, 'monster');
        return args[0];
    });
    assert.equal(monsters.length, 50);
    assert.equal(monsters.filter(({ id }) => id != null).length, 40);
    assert.deepEqual(
        monsters.slice(18, 28).map(({ class: monsterClass }) => monsterClass),
        ['D', 'D', 'D', 'D', 'D', 'E', 'E', 'E', 'J', 'J']
            .map((letter) => def_char_to_monclass(letter)),
    );
});
