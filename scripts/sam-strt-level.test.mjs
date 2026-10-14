import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import {
    SAM_STRT_LEVEL_CHEST, SAM_STRT_LEVEL_DOORS, SAM_STRT_LEVEL_GUARDS,
    SAM_STRT_LEVEL_MAP, SAM_STRT_LEVEL_SATO, SAM_STRT_LEVEL_SATO_INVENTORY,
    SAM_STRT_LEVEL_SIEGE, SAM_STRT_LEVEL_TRAP_COUNT,
} from '../js/sam_strt_level_data.js';
import { extractSamStrtData, renderSamStrtData } from './generate-sam-strt-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/Sam-strt.lua', 'utf8');
test('Sam-strt generated map and fixed descriptors preserve source data', () => {
    const data = extractSamStrtData(source);
    assert.deepEqual(data, {
        rows: SAM_STRT_LEVEL_MAP, doors: SAM_STRT_LEVEL_DOORS,
        sato: SAM_STRT_LEVEL_SATO, inventory: SAM_STRT_LEVEL_SATO_INVENTORY,
        chest: SAM_STRT_LEVEL_CHEST, guards: SAM_STRT_LEVEL_GUARDS,
        siege: SAM_STRT_LEVEL_SIEGE, traps: SAM_STRT_LEVEL_TRAP_COUNT,
    });
    assert.equal(readFileSync('js/sam_strt_level_data.js', 'utf8'), renderSamStrtData(data));
    assert.equal(data.rows.length, 20); // Sam-strt.lua map lines 18–37 give the full level height.
    assert.ok(data.rows.every(row => row.length === 76)); // The map's rightmost column is part of every row.
    assert.equal(data.doors.length, 10); // Sam-strt.lua door descriptors at lines 29–38.
    assert.equal(data.guards.length, 8); // The audience chamber has four guards on each side.
    assert.equal(data.siege.length, 13); // Nine ninjas, three wolves, then the random stalker.
    assert.equal(data.traps, 6); // Sam-strt.lua makes six traps without fixed types or coordinates.
});

test('Sam-strt awaits every descriptor and Lord Sato inventory in source order', async () => {
    const calls = [];
    const events = [];
    const des = new Proxy({}, { get: (_, name) => async (...args) => {
        calls.push({ name, args });
        const label = name === 'object' && args[0] === SAM_STRT_LEVEL_CHEST[0]
            ? 'object:chest' : name;
        events.push(`${label}:start`);
        await Promise.resolve(); // Each descriptor settles asynchronously before its completion event.
        if (name === 'monster' && typeof args[0]?.inventory === 'function')
            await args[0].inventory();
        events.push(`${label}:end`);
    } });

    assert.equal(typeof QUEST_LEVEL_LOADERS['Sam-strt'], 'function');
    await QUEST_LEVEL_LOADERS['Sam-strt'](des);
    assert.deepEqual(calls.map(call => call.name), [
        'level_init', 'level_flags', 'map', 'region', 'region', 'levregion', 'stair',
        ...Array(10).fill('door'), 'monster', 'object', 'object', 'object',
        ...Array(8).fill('monster'), 'non_diggable', ...Array(6).fill('trap'),
        ...Array(13).fill('monster'),
    ]); // Lua 17–97, with Lord Sato's callback objects before his chest.
    assert.deepEqual(calls.slice(0, 3).map(call => call.args), [
        [{ style: 'solidfill', fg: ' ' }], // Lua 17 initializes the complete map to spaces.
        ['mazelevel', 'noteleport', 'hardfloor'], // Lua 19 sets all three source level flags.
        [SAM_STRT_LEVEL_MAP], // Lua 21 installs the generated 76-by-20 map.
    ]);
    assert.deepEqual(calls[3].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(calls[3].args[1], 'lit'); // Lua 39 lights the complete 76-by-20 level.
    assert.deepEqual(calls.slice(4, 7).map(call => call.args), [
        [{ region: [18, 3, 26, 7], lit: 1, type: 'throne', filled: 2 }], // Lua 41 defines the throne region.
        [{ region: [62, 12, 70, 17], type: 'branch' }], // Lua 43 defines the branch arrival.
        ['down', 29, 4], // Lua 45 places the quest-home exit stair.
    ]);
    assert.deepEqual(calls.slice(7, 17).map(call => call.args), SAM_STRT_LEVEL_DOORS);
    const satoCall = calls[17];
    assert.deepEqual({ id: satoCall.args[0].id, coord: satoCall.args[0].coord },
        { id: 'Lord Sato', coord: [20, 4] }); // Lua 39 makes Lord Sato at the throne-room entrance.
    assert.deepEqual(calls.slice(18, 20).map(call => call.args),
        SAM_STRT_LEVEL_SATO_INVENTORY.map(object => [{ ...object }]));
    assert.deepEqual(calls[20].args, SAM_STRT_LEVEL_CHEST); // Lua 48 places Sato's chest after his inventory.
    assert.deepEqual(calls.slice(21, 29).map(call => call.args), SAM_STRT_LEVEL_GUARDS);
    assert.deepEqual(calls[29].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 }); // Lua 59 protects the full map.
    assert.ok(calls.slice(30, 36).every(call => call.args.length === 0)); // Lua 61–66 creates six random traps.
    assert.deepEqual(calls.slice(36).map(call => call.args),
        SAM_STRT_LEVEL_SIEGE.map(monster => Array.isArray(monster) ? monster : [{ ...monster }]));
    const satoEnd = events.indexOf('monster:end');
    assert.ok(events.indexOf('object:end') < satoEnd);
    const chestStart = events.indexOf('object:chest:start');
    assert.ok(satoEnd < chestStart); // The awaited inventory callback finishes before the floor chest.
});
