import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { SAM_LOCA_LEVEL_MAP, SAM_LOCA_LEVEL_DOORS,
    SAM_LOCA_LEVEL_OBJECTS, SAM_LOCA_LEVEL_MONSTERS } from '../js/sam_loca_level_data.js';
import { extractSamLocaData, renderSamLocaData } from './generate-sam-loca-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/Sam-loca.lua', 'utf8');
test('Sam-loca generated tables preserve every source map and descriptor value', () => {
    const data = extractSamLocaData(source);
    assert.deepEqual(SAM_LOCA_LEVEL_MAP, data.rows);
    assert.deepEqual(SAM_LOCA_LEVEL_DOORS, data.doors);
    assert.deepEqual(SAM_LOCA_LEVEL_OBJECTS, data.objects);
    assert.deepEqual(SAM_LOCA_LEVEL_MONSTERS, data.monsters);
    assert.equal(readFileSync('js/sam_loca_level_data.js', 'utf8'), renderSamLocaData(data));
    assert.equal(data.rows.length, 20); // Lua11–30 full map height.
    assert.ok(data.rows.every(row => row.length === 76)); // Every source row, including floor perimeter.
    assert.equal(data.doors.filter(d => d[0] === 'locked').length, 16); // Lua35–50.
    assert.equal(data.doors.filter(d => d[0] === 'closed').length, 8); // Lua51–58.
    assert.deepEqual(data.objects.map(o => o[0]),
        [...Array(8).fill('*'), ...Array(8).fill('['), ...Array(8).fill(')'), ...Array(8).fill('(')]);
    // Lua65–99 retains four object classes and the source row order within each.
    assert.equal(data.monsters.filter(m => m[0]?.id === 'ninja').length, 8); // Lua108–123.
    assert.equal(data.monsters.filter(m => m[0] === 'wolf').length, 9); // Lua110–125.
    assert.equal(data.monsters.filter(m => m[0] === 'd').length, 1); // Lua124 class draw.
    assert.equal(data.monsters.filter(m => m[0] === 'stalker').length, 9); // Lua126–134.
    assert.equal(data.monsters.filter(m => m[0]?.id === 'samurai').length, 6); // Lua136–141.
});
test('Sam-loca awaits all whole-program descriptors in source order', async () => {
    const calls = [];
    const des = new Proxy({}, { get: (_, name) => async (...args) => {
        await Promise.resolve(); // Each pending descriptor finishes before its successor.
        calls.push({ name, args });
    } });
    assert.equal(typeof QUEST_LEVEL_LOADERS['Sam-loca'], 'function');
    await QUEST_LEVEL_LOADERS['Sam-loca'](des);
    assert.deepEqual(calls.map(c => c.name), ['level_init', 'level_flags', 'map', 'region',
        ...Array(24).fill('door'), 'stair', 'stair', 'non_diggable',
        ...Array(32).fill('object'), ...Array(6).fill('trap'), ...Array(33).fill('monster')]);
    // Lua6–141: doors precede stairs; objects precede traps; interleaved monsters remain ordered.
    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]); // Lua6.
    assert.deepEqual(calls[1].args, ['mazelevel', 'hardfloor']); // Lua8.
    assert.deepEqual(calls[2].args, [SAM_LOCA_LEVEL_MAP]); // Lua10 string map uses canonical rows.
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 }); // Lua33.
    assert.equal(calls[3].args[1], 'lit');
    assert.deepEqual(calls.filter(c => c.name === 'door').map(c => c.args), SAM_LOCA_LEVEL_DOORS);
    assert.deepEqual(calls.filter(c => c.name === 'stair').map(c => c.args),
        [['up', 10, 10], ['down', 25, 14]]); // Lua60–61 positional fixed coordinates.
    assert.deepEqual(calls.find(c => c.name === 'non_diggable').args[0].bounds(),
        { lx: 0, ly: 0, hx: 75, hy: 19 }); // Lua63.
    assert.deepEqual(calls.filter(c => c.name === 'object').map(c => c.args), SAM_LOCA_LEVEL_OBJECTS);
    assert.ok(calls.filter(c => c.name === 'trap').every(c => c.args.length === 0)); // Lua101–106 random traps.
    assert.deepEqual(calls.filter(c => c.name === 'monster').map(c => c.args), SAM_LOCA_LEVEL_MONSTERS);
});
