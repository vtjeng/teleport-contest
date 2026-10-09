import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const source = readFileSync('nethack-c/upstream/dat/Cav-loca.lua', 'utf8');
const sourceMap = source.match(/des\.map\(\[\[\n([\s\S]*?)\n\]\]\)/u)[1].split('\n');

test('Cav-loca registry preserves the whole source descriptor sequence', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Cav-loca'], 'function');
    const calls = [];
    const des = new Proxy({}, { get: (_target, method) => async (...args) => calls.push({ method, args }) });
    await QUEST_LEVEL_LOADERS['Cav-loca'](des);
    // Lua7-92: initialization, full unlit and irregular lit regions, door,
    // two stairs, nondiggable selection, 15 objects, 6 traps, 27 monsters.
    assert.deepEqual(calls.map(c => c.method), ['level_init', 'level_flags', 'map',
        'region', 'region', 'door', 'stair', 'stair', 'non_diggable',
        ...Array(15).fill('object'), ...Array(6).fill('trap'),
        ...Array(27).fill('monster'), 'wallify']);
    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]);
    assert.deepEqual(calls[1].args, ['mazelevel', 'hardfloor']);
    assert.deepEqual(calls[2].args, [sourceMap]);
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(calls[3].args[1], 'unlit'); // Lua33 full-map lighting.
    assert.deepEqual(calls[4].args, [{ region: [52, 6, 73, 15], lit: 1, type: 'ordinary', irregular: 1 }]);
    assert.deepEqual(calls[5].args, ['locked', 28, 11]);
    assert.deepEqual(calls[6].args, ['up', 4, 3]);
    assert.deepEqual(calls[7].args, ['down', 73, 10]); // Lua36-40 positions.
    assert.deepEqual(calls[8].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.ok(calls.slice(9, 30).every(c => c.args.length === 0)); // Objects/traps without parameters.
    const monsters = calls.slice(30, 57).map(c => c.args[0]);
    assert.deepEqual(monsters[0], { id: 'bugbear', x: 2, y: 10, peaceful: 0 });
    assert.deepEqual(monsters[12], { id: 'bugbear', x: 34, y: 7, peaceful: 0 });
    assert.deepEqual(monsters[13], { id: 'bugbear', peaceful: 0 });
    assert.deepEqual(monsters[17], { class: 'h', peaceful: 0 });
    assert.deepEqual(monsters[18], { class: 'H', peaceful: 0 });
    assert.deepEqual(monsters[19], { id: 'hill giant', x: 3, y: 12, peaceful: 0 });
    assert.deepEqual(monsters[26], { class: 'H', peaceful: 0 }); // Source final class descriptor.
    assert.ok(monsters.every(m => m.peaceful === 0));
    assert.deepEqual(calls[57].args, []);
});

test('generated Cav-loca map and monster tables match current Lua source', async () => {
    const { extractCavLocaData, renderCavLocaData } = await import('./generate-cav-loca-level.mjs');
    const { CAV_LOCA_LEVEL_MAP, CAV_LOCA_MONSTERS } = await import('../js/cav_loca_level_data.js');
    const data = extractCavLocaData(source);
    assert.deepEqual(CAV_LOCA_LEVEL_MAP, sourceMap);
    assert.deepEqual(CAV_LOCA_MONSTERS, data.monsters);
    assert.equal(renderCavLocaData(data), readFileSync('js/cav_loca_level_data.js', 'utf8'));
    // Lua's fixed tables contain 20×76 map cells and 27 monster descriptors.
    assert.equal(data.map.length, 20);
    assert.ok(data.map.every(row => row.length === 76));
    assert.equal(data.monsters.length, 27);
});

test('Cav-loca awaits the irregular region before creating its locked door', async () => {
    const calls = [];
    let release;
    const pending = new Promise(resolve => { release = resolve; });
    const des = new Proxy({}, { get: (_target, method) => (...args) => {
        calls.push(method);
        if (method === 'region' && args[0].irregular) return pending;
    } });
    let settled = false;
    const loading = QUEST_LEVEL_LOADERS['Cav-loca'](des).then(() => { settled = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    assert.equal(calls.includes('door'), false); // Source door follows completed region.
    release();
    await loading;
    assert.equal(settled, true);
    assert.equal(calls.at(-1), 'wallify');
});
