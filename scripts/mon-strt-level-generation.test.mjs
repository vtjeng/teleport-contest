import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ROOM, STONE } from '../js/const.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { initRng, enableRngLog, getRngLog } from '../js/rng.js';
import { MON_STRT_LEVEL_MAP } from '../js/mon_strt_level_data.js';
import { compareSessionOutputs, runJsSession } from './diff-fresh.mjs';
import { extractMonStrtData, renderMonStrtData } from './generate-mon-strt-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/Mon-strt.lua', 'utf8');

test('generated Monk quest start map retains every source row and space', () => {
    const data = extractMonStrtData(source);
    assert.deepEqual(data, MON_STRT_LEVEL_MAP);
    assert.equal(renderMonStrtData(data), readFileSync('js/mon_strt_level_data.js', 'utf8'));
});

test('Mon-strt is registered as a whole Monk quest start program', () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Mon-strt'], 'function');
});

test('male and female C-first Monk quest start recordings match the production loader', async () => {
    for (const gender of ['male', 'female']) {
        const path = `recordings/Mon-strt.lua/mon-strt-direct-${gender}-independent.session.json`;
        const recording = JSON.parse(readFileSync(path, 'utf8'));
        const output = await runJsSession(recording, process.cwd());
        assert.equal(compareSessionOutputs(recording, output).passed, true, path);
    }
});

test('whole Monk quest start program preserves source descriptor and selection order', async () => {
    const calls = [];
    const frame = { xstart: 0, ystart: 0 };
    const state = { level: { at(x, y) {
        return { typ: x < 76 && y < 20 ? ROOM : STONE };
    } } };
    const des = new Proxy({ frame }, { get(target, method) {
        if (method === 'frame') return frame;
        return async (...args) => {
            calls.push({ method, args });
            if (method === 'monster' && typeof args[0]?.inventory === 'function')
                await args[0].inventory();
        };
    } });
    initRng(5109031);
    enableRngLog();
    await QUEST_LEVEL_LOADERS['Mon-strt'](des, state);

    assert.deepEqual(calls.map(call => call.method), [
        'level_init', 'level_flags', 'map', 'region', 'region',
        'replace_terrain', 'replace_terrain', 'terrain', 'levregion', 'stair',
        ...Array(18).fill('door'), 'altar', 'monster', 'object',
        ...Array(8).fill('monster'), 'non_diggable',
        ...Array(6).fill('trap'), ...Array(12).fill('monster'), 'object', 'object',
    ]);
    assert.deepEqual(calls.slice(0, 3).map(call => call.args), [
        [{ style: 'solidfill', fg: ' ' }],
        ['mazelevel', 'noteleport', 'hardfloor'],
        [MON_STRT_LEVEL_MAP],
    ]);
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(calls[3].args[1], 'lit');
    assert.deepEqual(calls[4].args[0], { region: [24, 6, 33, 13], lit: 1, type: 'temple' });
    assert.deepEqual(calls.slice(5, 7).map(call => call.args[0]), [
        { region: [0, 0, 10, 19], fromterrain: '.', toterrain: 'T', chance: 10 },
        { region: [65, 0, 75, 19], fromterrain: '.', toterrain: 'T', chance: 10 },
    ]);
    assert.deepEqual(calls[7].args, [{ x: 5, y: 4 }, '.']);
    assert.deepEqual(calls[8].args[0], { region: [5, 4, 5, 4], type: 'branch' });
    assert.deepEqual(calls[9].args, ['down', 52, 9]);

    const doorCalls = calls.slice(10, 28).map(call => call.args);
    assert.deepEqual(doorCalls, [
        ['locked', 18, 9], ['locked', 18, 10], ['closed', 34, 9], ['closed', 34, 10],
        ['closed', 40, 5], ['closed', 46, 5], ['closed', 52, 5], ['locked', 38, 7],
        ['closed', 42, 7], ['closed', 46, 7], ['closed', 52, 7], ['locked', 38, 12],
        ['closed', 44, 12], ['closed', 48, 12], ['closed', 52, 12], ['closed', 40, 14],
        ['closed', 46, 14], ['closed', 52, 14],
    ]);
    assert.deepEqual(calls[28].args[0], { x: 28, y: 9, align: 'noalign', type: 'altar' });
    assert.equal(calls[29].args[0].id, 'Grand Master');
    assert.deepEqual(calls[29].args[0].coord, { x: 28, y: 10 });
    assert.deepEqual(calls[30].args[0], { id: 'robe', spe: 6 });
    assert.deepEqual(calls[39].args[0].bounds(), { lx: 18, ly: 3, hx: 55, hy: 16 });

    const dartCalls = calls.slice(40, 42);
    assert.deepEqual(dartCalls.map(call => call.args[0]), ['dart', 'dart']);
    const randomTrapCalls = calls.slice(42, 46);
    assert.deepEqual(randomTrapCalls.map(call => call.args), [[], [], [], []]);
    assert.deepEqual(calls.slice(58).map(call => call.args[0]), [
        { id: 'tin', coord: [29, 9], quantity: 2, montype: 'spinach' },
        { id: 'food ration', coord: [46, 4], quantity: 4 },
    ]);

    // Source calls rndcoord(1) twice for darts, eight times for elementals,
    // and four times for xorns; each call removes its chosen square.
    assert.deepEqual(getRngLog().map(entry => entry.split('=')[0]),
        Array.from({ length: 14 }, (_, i) => `rn2(${1520 - i})`));
});
