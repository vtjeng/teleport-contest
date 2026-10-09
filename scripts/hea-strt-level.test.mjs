import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
const source = readFileSync('nethack-c/upstream/dat/Hea-strt.lua', 'utf8');
const sourceMap = source.match(/des\.map\(\[\[\n([\s\S]*?)\n\]\]\)/u)[1].split('\n');

test('Hea-strt registry preserves the whole source descriptor sequence', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Hea-strt'], 'function');
    const calls = [];
    const des = new Proxy({}, { get: (_target, method) => async (...args) => {
        calls.push({ method, args });
        if (typeof args[0]?.inventory === 'function') await args[0].inventory();
    } });
    await QUEST_LEVEL_LOADERS['Hea-strt'](des);
    // Lua12-109: map/flags, pool replacement, branch/altar, twelve doors,
    // leader with one custom object, chest, eight attendants, six traps,
    // ten rats, eel/shark/class ';', and five each hostile D/S descriptors.
    assert.deepEqual(calls.map(c => c.method), ['level_init', 'level_flags', 'map',
        'replace_terrain', 'region', 'stair', 'levregion', 'altar',
        ...Array(12).fill('door'), 'monster', 'object', 'object',
        ...Array(8).fill('monster'), 'non_diggable', ...Array(6).fill('trap'),
        ...Array(23).fill('monster')]);
    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]);
    assert.deepEqual(calls[1].args, ['mazelevel', 'noteleport', 'hardfloor']);
    assert.deepEqual(calls[2].args, [sourceMap]);
    assert.deepEqual(calls[3].args, [{ region: [1, 1, 74, 18], fromterrain: 'P', toterrain: '.', chance: 10 }]);
    assert.deepEqual(calls[4].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(calls[4].args[1], 'lit'); // Lua41 whole-map light.
    assert.deepEqual(calls[5].args, ['down', 37, 9]);
    assert.deepEqual(calls[6].args, [{ region: [4, 12, 4, 12], type: 'branch' }]);
    assert.deepEqual(calls[7].args, [{ x: 32, y: 9, align: 'neutral', type: 'altar' }]);
    const doors = [...source.matchAll(/des\.door\("([^"]+)",([0-9]+),([0-9]+)\)/gu)]
        .map(([, type, x, y]) => [type, Number(x), Number(y)]);
    assert.deepEqual(calls.slice(8, 20).map(c => c.args), doors);
    assert.equal(calls[20].args[0].id, 'Hippocrates');
    assert.deepEqual(calls[20].args[0].coord, [37, 10]);
    assert.deepEqual(calls[21].args, [{ id: 'silver dagger', spe: 5 }]);
    assert.deepEqual(calls[22].args, ['chest', 37, 10]); // Lua inventory precedes chest.
    const attendants = [...source.matchAll(/des\.monster\("attendant",\s*([0-9]+),\s*([0-9]+)\)/gu)]
        .map(([, x, y]) => ['attendant', Number(x), Number(y)]);
    assert.deepEqual(calls.slice(23, 31).map(c => c.args), attendants);
    assert.deepEqual(calls[31].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.ok(calls.slice(32, 38).every(c => c.args.length === 0));
    assert.deepEqual(calls.slice(38, 48).map(c => c.args), Array(10).fill(['rabid rat']));
    assert.deepEqual(calls.slice(48, 51).map(c => c.args), [['giant eel'], ['shark'], [';']]);
    assert.deepEqual(calls.slice(51, 56).map(c => c.args), Array(5).fill([{ class: 'D', peaceful: 0 }]));
    assert.deepEqual(calls.slice(56).map(c => c.args), Array(5).fill([{ class: 'S', peaceful: 0 }]));
});

test('generated Hea-strt fixed tables match current Lua source', async () => {
    const { extractHeaStrtData, renderHeaStrtData } = await import('./generate-hea-strt-level.mjs');
    const { HEA_STRT_LEVEL_MAP, HEA_STRT_DOORS, HEA_STRT_ATTENDANTS } = await import('../js/hea_strt_level_data.js');
    const data = extractHeaStrtData(source);
    assert.deepEqual(HEA_STRT_LEVEL_MAP, sourceMap);
    assert.deepEqual(HEA_STRT_DOORS, data.doors);
    assert.deepEqual(HEA_STRT_ATTENDANTS, data.attendants);
    assert.equal(renderHeaStrtData(data), readFileSync('js/hea_strt_level_data.js', 'utf8'));
});

test('Hea-strt awaits custom leader inventory before chest and attendants', async () => {
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const calls = [];
    const des = new Proxy({}, { get: (_target, method) => async (...args) => {
        calls.push({ method, args });
        if (args[0]?.id === 'silver dagger') await pending;
        if (typeof args[0]?.inventory === 'function') await args[0].inventory();
    } });
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Hea-strt'](des).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(calls.at(-1).args[0].id, 'silver dagger');
    assert.equal(calls.some(c => c.args[0] === 'chest'), false);
    release();
    await loading;
    assert.equal(settled, true);
    assert.equal(calls.at(-1).args[0].class, 'S'); // Lua final descriptor; no invented wallify.
});
