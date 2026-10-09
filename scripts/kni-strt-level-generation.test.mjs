import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { KNI_STRT_LEVEL_MAP } from '../js/kni_strt_level_data.js';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { initRng } from '../js/rng.js';
import { extractKniStrtMap, renderKniStrtMap } from './generate-kni-strt-level.mjs';

const LUA = readFileSync('nethack-c/upstream/dat/Kni-strt.lua', 'utf8');

test('generated Kni-strt map retains every authoritative row', () => {
    const rows = extractKniStrtMap(LUA);
    assert.deepEqual(KNI_STRT_LEVEL_MAP, rows);
    assert.equal(renderKniStrtMap(rows),
        readFileSync('js/kni_strt_level_data.js', 'utf8'));
    // Kni-strt.lua's map spans x0..49 and y0..15.
    assert.equal(rows.length, 16);
    assert.ok(rows.every(row => row.length === 50));
});

test('Kni-strt loader preserves descriptor order and custom inventory', async () => {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, method) {
            return async (...args) => {
                calls.push({ method, args });
                const inventory = method === 'monster' && args[0]?.inventory;
                if (typeof inventory === 'function') await inventory();
            };
        },
    });
    // Initialize the game RNG before Lua's 2 + rn2(3) warhorse count.
    initRng(20261009);
    await QUEST_LEVEL_LOADERS['Kni-strt'](des);

    assert.deepEqual(calls.slice(0, 4), [
        { method: 'level_init', args: [{ style: 'solidfill', fg: '.' }] },
        { method: 'level_flags', args: ['mazelevel', 'noteleport', 'hardfloor'] },
        { method: 'level_init', args: [{ style: 'mines', fg: '.', bg: '.',
            smoothed: false, joined: false, lit: 1, walled: false }] },
        { method: 'map', args: [KNI_STRT_LEVEL_MAP] },
    ]);
    assert.deepEqual(calls[4].args[0].bounds(), { lx: 0, ly: 0, hx: 49, hy: 15 });
    assert.equal(calls[4].args[1], 'lit');
    assert.deepEqual(calls[5].args[0].bounds(), { lx: 4, ly: 4, hx: 45, hy: 11 });
    assert.equal(calls[5].args[1], 'unlit');
    assert.deepEqual(calls[6], { method: 'region', args: [{ region: [6, 6, 22, 9],
        lit: 1, type: 'throne', filled: 2 }] });
    assert.deepEqual(calls[7].args[0].bounds(), { lx: 27, ly: 6, hx: 43, hy: 9 });
    assert.deepEqual(calls[8], { method: 'levregion', args: [{
        region: [20, 14, 20, 14], type: 'branch',
    }] });
    assert.deepEqual(calls[9], { method: 'stair', args: ['down', 40, 7] });

    const doors = calls.filter(({ method }) => method === 'door');
    // Lua38..52 declares fifteen doors in this exact order.
    assert.deepEqual(doors.map(({ args }) => args), [
        ['locked', 24, 3], ['locked', 25, 3], ['closed', 23, 4],
        ['closed', 26, 4], ['locked', 24, 5], ['locked', 25, 5],
        ['closed', 23, 7], ['closed', 26, 7], ['closed', 23, 8],
        ['closed', 26, 8], ['closed', 36, 8], ['closed', 4, 3],
        ['closed', 45, 3], ['closed', 4, 12], ['closed', 45, 12],
    ]);

    const kingIndex = calls.findIndex(({ method, args }) =>
        method === 'monster' && args[0]?.id === 'King Arthur');
    assert.ok(kingIndex >= 0);
    assert.deepEqual(calls[kingIndex].args[0].coord, [9, 7]);
    assert.deepEqual(calls.slice(kingIndex + 1, kingIndex + 3), [
        { method: 'object', args: [{ id: 'long sword', spe: 4,
            buc: 'blessed', name: 'Excalibur' }] },
        { method: 'object', args: [{ id: 'plate mail', spe: 4 }] },
    ]);
    assert.ok(calls.some(({ method, args }) => method === 'object'
        && args[0] === 'chest' && args[1] === 9 && args[2] === 7));

    const traps = calls.filter(({ method }) => method === 'trap');
    // Lua67..72 has two fixed sleep-gas traps followed by four random traps.
    assert.deepEqual(traps.slice(0, 2).map(({ args }) => args), [
        ['sleep gas', 24, 4], ['sleep gas', 25, 4],
    ]);
    assert.equal(traps.length, 6);
    assert.ok(traps.slice(2).every(({ args }) => args.length === 0));

    const monsters = calls.filter(({ method }) => method === 'monster');
    const quasits = monsters.filter(({ args }) => args[0]?.id === 'quasit');
    // Lua75..87 places twelve hostile quasits at every even x from14 to36.
    assert.deepEqual(quasits.map(({ args }) => [args[0].x, args[0].y,
        args[0].peaceful]), Array.from({ length: 12 }, (_unused, index) => [
        14 + index * 2, 0, 0,
    ]));
    const horses = monsters.filter(({ args }) => args[0]?.id === 'warhorse');
    // Lua108 permits two through four horses; the loop bound consumes one draw.
    assert.ok(horses.length >= 2 && horses.length <= 4);
    assert.ok(horses.every(({ args }) => args[0].peaceful === 1
        && typeof args[0].inventory === 'function'));
    const saddles = calls.filter(({ method, args }) => method === 'object'
        && args[0] === 'saddle');
    assert.ok(saddles.length <= horses.length);
});

test('Kni-strt map extractor rejects a changed rectangle', () => {
    assert.throws(() => extractKniStrtMap('des.map([[\n..\n]])'), {
        name: 'SyntaxError',
        message: 'Kni-strt.lua map is not 16 rows of 50 columns',
    });
});
