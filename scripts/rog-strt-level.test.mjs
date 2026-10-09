import assert from 'node:assert/strict';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

test('Rog-strt has a production quest loader for the whole Lua program', () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Rog-strt'], 'function');
});

import { readFileSync } from 'node:fs';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';
import { selection_floodfill } from '../js/quest_levels.js';
import { extractRogStrtData, renderRogStrtData } from './generate-rog-strt-level.mjs';
import {
    ROG_STRT_LEVEL_MAP, ROG_STRT_DOORS, ROG_STRT_GUARDS,
    ROG_STRT_EXIT_MONSTERS,
} from '../js/rog_strt_level_data.js';

const source = readFileSync('nethack-c/upstream/dat/Rog-strt.lua', 'utf8');
function harness(pending) {
    const calls = [];
    // The 76x21 Lua fragment has origin0 for this source-only harness.
    const frame = { xstart: 0, ystart: 0 };
    const state = { level: { at(x, y) {
        const typ = ROG_STRT_LEVEL_MAP[y]?.[x];
        return typ == null ? undefined : { typ };
    } } };
    const des = new Proxy({ frame }, { get(target, method) {
        if (method === 'frame') return frame;
        return async (...args) => {
            calls.push({ method, args });
            // Reverse the four exits to pin consumption of the mutated table.
            // Real nhlib.lua shuffle has separate runtime recording coverage.
            if (method === 'shuffle') args[0].reverse();
            if (method === 'object' && args[0]?.id === 'silver dagger') await pending;
            if (typeof args[0]?.inventory === 'function') await args[0].inventory();
        };
    } });
    return { des, state, calls };
}

test('generated Rogue start tables preserve every fixed Lua descriptor', () => {
    const data = extractRogStrtData(source);
    assert.deepEqual(data, { map: ROG_STRT_LEVEL_MAP, doors: ROG_STRT_DOORS,
        guards: ROG_STRT_GUARDS, exits: ROG_STRT_EXIT_MONSTERS });
    assert.equal(renderRogStrtData(data), readFileSync('js/rog_strt_level_data.js', 'utf8'));
    // Lua92–93 deliberately issues the same closed-door descriptor twice.
    assert.equal(data.doors.filter(([s, x, y]) => s === 'closed' && x === 23 && y === 14).length, 2);
});

test('Rogue start preserves whole source order, exits, inventory and street removal', async () => {
    // Fixed arbitrary seed makes source loop draws reproducible, without searching.
    initRng(175031);
    enableRngLog();
    const { des, state, calls } = harness();
    const streets = selection_floodfill(0, 12, state, des.frame);
    await QUEST_LEVEL_LOADERS['Rog-strt'](des, state);
    assert.deepEqual(calls.slice(0, 3), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: ' ' }] },
        { method: 'level_flags', args: ['mazelevel', 'noteleport', 'hardfloor', 'nommap'] },
        { method: 'map', args: [ROG_STRT_LEVEL_MAP] },
    ]);
    // Lua46–55 maps shuffled exits to stair, giant/large/small stair mimics.
    assert.deepEqual(calls[4], { method: 'stair', args: [{ dir: 'down', coord: [75, 5] }] });
    assert.deepEqual(calls.slice(5, 8).map(c => c.args[0]), [
        { id: 'giant mimic', coord: [25, 20], appear_as: 'ter:staircase down' },
        { id: 'large mimic', coord: [0, 12], appear_as: 'ter:staircase down' },
        { id: 'small mimic', coord: [33, 0], appear_as: 'ter:staircase down' },
    ]);
    assert.deepEqual(calls[8].args, [{ region: [19, 9, 19, 9], type: 'branch' }]);
    assert.deepEqual(calls.filter(c => c.method === 'door').map(c => c.args), ROG_STRT_DOORS);
    const objects = calls.filter(c => c.method === 'object');
    assert.deepEqual(objects.slice(0, 2).map(c => c.args), [
        [{ id: 'leather armor', spe: 5 }], [{ id: 'silver dagger', spe: 4 }],
    ]);
    const rolls = getRngLog().filter(s => s.startsWith('rn2(4)'));
    // nhlib.lua d(2,4), then Lua155/160 bounds each consume one rn2(4).
    assert.equal(rolls.length, 4);
    const values = rolls.map(s => Number(s.split('=')[1]));
    assert.deepEqual(objects[2].args, [{ id: 'dagger', spe: 2,
        quantity: 2 + values[0] + values[1], buc: 'not-cursed' }]);
    assert.deepEqual(objects[3].args, ['chest', 36, 11]);
    assert.deepEqual(calls.filter(c => c.method === 'monster' && c.args[0] === 'thug')
        .map(c => c.args.slice(1)), ROG_STRT_GUARDS);
    // Lua126–144: whole fragment nondiggable, then sixteen random traps.
    assert.deepEqual(calls.find(c => c.method === 'non_diggable').args[0].bounds(),
        { lx: 0, ly: 0, hx: 75, hy: 20 });
    assert.equal(calls.filter(c => c.method === 'trap').length, 16);
    const fixed = calls.filter(c => c.method === 'monster' && c.args[0]?.x != null);
    assert.deepEqual(fixed.map(c => c.args[0]), ROG_STRT_EXIT_MONSTERS);
    const wandering = calls.filter(c => c.method === 'monster'
        && ['water nymph', 'leprechaun', 'chameleon'].includes(c.args[0]?.id)
        && c.args[0]?.coord);
    const pairs = 4 + values[2], chameleons = 7 + values[3];
    assert.deepEqual(calls.map(c => c.method), [
        'level_init', 'level_flags', 'map', 'shuffle', 'stair',
        ...Array(3).fill('monster'), 'levregion', ...Array(46).fill('door'),
        'monster', ...Array(4).fill('object'), ...Array(9).fill('monster'),
        'non_diggable', ...Array(16).fill('trap'),
        ...Array(8 + pairs * 2 + chameleons).fill('monster'),
    ]); // The full Lua descriptor sequence, including nested leader objects.
    assert.equal(wandering.length, pairs * 2 + chameleons);
    assert.deepEqual(wandering.map(c => c.args[0].id), [
        ...Array.from({ length: pairs }, () => ['water nymph', 'leprechaun']).flat(),
        ...Array(chameleons).fill('chameleon'),
    ]);
    const coords = wandering.map(c => c.args[0].coord);
    assert.equal(new Set(coords.map(c => `${c.x},${c.y}`)).size, coords.length);
    assert.ok(coords.every(({ x, y }) => streets.get(x, y)));
    assert.ok(wandering.every(c => c.args[0].peaceful === 0));
    const points = streets.numpoints();
    assert.deepEqual(getRngLog().map(s => s.split('=')[0]), [
        'rn2(4)', 'rn2(4)', 'rn2(4)',
        ...Array.from({ length: pairs * 2 }, (_, i) => `rn2(${points - i})`),
        'rn2(4)',
        ...Array.from({ length: chameleons }, (_, i) => `rn2(${points - pairs * 2 - i})`),
    ]); // selvar.c selection_rndcoord counts each removal before the next draw.
    assert.equal(calls.at(-1).args[0].id, 'chameleon'); // No invented wallify/lighting.
});

test('Rogue start awaits leader inventory before chest and guard placement', async () => {
    initRng(175032); // Separate arbitrary seed; this test pins async order only.
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const { des, state, calls } = harness(pending);
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Rog-strt'](des, state).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(calls.at(-1).args[0].id, 'silver dagger');
    assert.equal(calls.some(c => c.args[0] === 'chest'), false);
    assert.equal(calls.some(c => c.args[0] === 'thug'), false);
    release();
    await loading;
    assert.equal(settled, true);
    assert.ok(calls.some(c => c.args[0] === 'chest'));
});
