import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { SANCTUM_LEVEL_MAP } from '../js/sanctum_level_data.js';
import { sanctum } from '../js/sanctum_levels.js';
import { selection_area } from '../js/themerooms.js';
import {
    extractSanctumMap,
    renderSanctumMap,
} from './generate-sanctum-level.mjs';

const C_SOURCE = readFileSync(
    'nethack-c/upstream/dat/sanctum.lua', 'utf8',
);

function descriptorLog() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return (...args) => {
                if (method === 'region'
                    && typeof args[0]?.contents === 'function') {
                    const { contents, ...spec } = args[0];
                    calls.push({ method, args: [{ ...spec, contents: true }] });
                    contents();
                    return;
                }
                calls.push({ method, args });
            };
        },
    });
    return { calls, des };
}

test('generated Sanctum map is copied from dat/sanctum.lua', () => {
    const sourceMap = extractSanctumMap(C_SOURCE);
    assert.deepEqual(SANCTUM_LEVEL_MAP, sourceMap);
    assert.equal(
        renderSanctumMap(sourceMap),
        readFileSync('js/sanctum_level_data.js', 'utf8'),
    );
});

test('Sanctum loader preserves every Lua descriptor and its order', async () => {
    const { calls, des } = descriptorLog();
    await sanctum(des);

    assert.equal(calls.length, 91);
    assert.deepEqual(calls.slice(0, 14), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        {
            method: 'level_flags',
            args: ['mazelevel', 'noteleport', 'hardfloor', 'nommap'],
        },
        {
            method: 'non_passwall',
            args: [selection_area(39, 0, 41, 0)],
        },
        { method: 'map', args: [SANCTUM_LEVEL_MAP] },
        {
            method: 'region',
            args: [{
                region: [15, 7, 21, 10], lit: 1, type: 'temple',
                filled: 2, contents: true,
            }],
        },
        {
            method: 'door',
            args: [{ wall: 'random', state: 'secret' }],
        },
        {
            method: 'altar',
            args: [{ x: 18, y: 8, align: 'noalign', type: 'sanctum' }],
        },
        {
            method: 'region',
            args: [{
                region: [41, 6, 48, 11], lit: 0, type: 'morgue',
                filled: 1, irregular: 1,
            }],
        },
        {
            method: 'non_diggable',
            args: [selection_area(0, 0, 75, 19)],
        },
        {
            method: 'non_passwall',
            args: [selection_area(37, 0, 39, 19)],
        },
        { method: 'door', args: ['closed', 40, 6] },
        { method: 'door', args: ['locked', 62, 6] },
        { method: 'door', args: ['closed', 46, 12] },
        { method: 'door', args: ['closed', 53, 10] },
    ]);

    const fixedTraps = calls.slice(14, 48);
    assert.equal(fixedTraps.length, 34);
    assert.ok(fixedTraps.every(({ method, args }) =>
        method === 'trap' && args[0] === 'fire' && args.length === 3));
    assert.deepEqual(fixedTraps.slice(0, 11).map(({ args }) => args),
        Array.from({ length: 11 }, (_unused, index) =>
            ['fire', index + 13, 5]));
    assert.deepEqual(fixedTraps.slice(11, 22).map(({ args }) => args),
        Array.from({ length: 11 }, (_unused, index) =>
            ['fire', index + 13, 12]));
    assert.deepEqual(fixedTraps.slice(22, 28).map(({ args }) => args),
        Array.from({ length: 6 }, (_unused, index) =>
            ['fire', 13, index + 6]));
    assert.deepEqual(fixedTraps.slice(28).map(({ args }) => args),
        Array.from({ length: 6 }, (_unused, index) =>
            ['fire', 23, index + 6]));

    assert.deepEqual(calls.slice(48, 54), [
        { method: 'trap', args: ['spiked pit'] },
        { method: 'trap', args: ['fire'] },
        { method: 'trap', args: ['sleep gas'] },
        { method: 'trap', args: ['anti magic'] },
        { method: 'trap', args: ['fire'] },
        { method: 'trap', args: ['magic'] },
    ]);
    assert.deepEqual(calls.slice(54, 70).map(({ method, args }) => {
        assert.equal(method, 'object');
        return args[0];
    }), ['[', '[', '[', '[', ')', ')', '*', '!', '!', '!', '!',
        '?', '?', '?', '?', '?']);

    assert.deepEqual(calls.slice(70, 75), [
        {
            method: 'monster',
            args: [{ id: 'horned devil', x: 14, y: 12, peaceful: 0 }],
        },
        {
            method: 'monster',
            args: [{ id: 'barbed devil', x: 18, y: 8, peaceful: 0 }],
        },
        {
            method: 'monster',
            args: [{ id: 'erinys', x: 10, y: 4, peaceful: 0 }],
        },
        {
            method: 'monster',
            args: [{ id: 'marilith', x: 7, y: 9, peaceful: 0 }],
        },
        {
            method: 'monster',
            args: [{ id: 'nalfeshnee', x: 27, y: 8, peaceful: 0 }],
        },
    ]);
    assert.deepEqual(
        calls.slice(75, 84).map(({ method, args }) => {
            assert.equal(method, 'monster');
            return [args[0].id, args[0].x, args[0].y,
                args[0].align, args[0].peaceful];
        }),
        [
            ['aligned cleric', 20, 3, 'noalign', 0],
            ['aligned cleric', 15, 4, 'noalign', 0],
            ['aligned cleric', 11, 5, 'noalign', 0],
            ['aligned cleric', 11, 7, 'noalign', 0],
            ['aligned cleric', 11, 9, 'noalign', 0],
            ['aligned cleric', 11, 12, 'noalign', 0],
            ['aligned cleric', 15, 13, 'noalign', 0],
            ['aligned cleric', 17, 13, 'noalign', 0],
            ['aligned cleric', 21, 13, 'noalign', 0],
        ],
    );
    assert.deepEqual(calls.slice(84), [
        { method: 'monster', args: ['L'] },
        { method: 'monster', args: ['L'] },
        { method: 'monster', args: ['V'] },
        { method: 'monster', args: ['V'] },
        { method: 'monster', args: ['V'] },
        { method: 'stair', args: ['up', 63, 15] },
        {
            method: 'teleport_region',
            args: [{
                region: [54, 1, 79, 18], region_islev: 1, dir: 'down',
            }],
        },
    ]);
});
