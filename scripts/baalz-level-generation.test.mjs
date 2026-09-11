import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { baalz } from '../js/baalz_levels.js';
import { initRng } from '../js/rng.js';

const LUA_SOURCE = readFileSync('nethack-c/upstream/dat/baalz.lua', 'utf8');

function recordingDes() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, property) {
            return (...args) => calls.push({ property, args });
        },
    });
    return { calls, des };
}

function sourceMap() {
    const match = LUA_SOURCE.match(/map\s*=\s*\[\[([\s\S]*?)\]\]/u);
    assert.ok(match, 'baalz.lua must contain a map literal');
    return match[1].split('\n').slice(1, -1).join('\n');
}

// The source map has 13 rows of 49 columns, including trailing spaces that
// keep its right edge aligned when sp_lev.c places the map fragment.
test('baalz loader preserves the source map and descriptor order', async () => {
    initRng(42); // The recording descriptor does not consume this RNG.
    const { calls, des } = recordingDes();
    await baalz(des);

    const mapCall = calls.find(({ property }) => property === 'map');
    assert.ok(mapCall, 'baalz loader must call des.map');
    assert.equal(mapCall.args[0].map, sourceMap());
    const rows = mapCall.args[0].map.split('\n');
    assert.equal(rows.length, 13); // dat/baalz.lua map rows.
    assert.ok(rows.every((row) => row.length === 49)); // map columns.

    assert.deepEqual(calls.map(({ property }) => property), [
        'level_init', 'level_flags', 'map', 'levregion', 'levregion',
        'teleport_region', 'non_diggable', 'mazewalk', 'stair', 'door',
        'monster',
        ...Array(10).fill('object'),
        ...Array(7).fill('trap'),
        ...Array(7).fill('monster'),
    ]);
});
test('baalz loader passes source coordinates and level flags', async () => {
    initRng(42); // Fixed seed only initializes the loader test harness.
    const { calls, des } = recordingDes();
    await baalz(des);

    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ', lit: 0 }]);
    assert.deepEqual(calls[1].args, ['mazelevel', 'corrmaze']);
    assert.deepEqual(calls[3].args, [{
        region: [1, 0, 15, 20],
        region_islev: 1,
        exclude: [15, 1, 70, 16],
        exclude_islev: 1,
        type: 'stair-up',
    }]);
    assert.deepEqual(calls[4].args, [{
        region: [1, 0, 15, 20],
        region_islev: 1,
        exclude: [15, 1, 70, 16],
        exclude_islev: 1,
        type: 'branch',
    }]);
    assert.deepEqual(calls[5].args, [{
        region: [1, 0, 15, 20],
        region_islev: 1,
        exclude: [15, 1, 70, 16],
        exclude_islev: 1,
    }]);
    assert.deepEqual(calls[7].args, [0, 6, 'west']);
    assert.deepEqual(calls[8].args, ['down', 44, 6]);
    assert.deepEqual(calls[9].args, ['locked', 0, 6]);
    assert.deepEqual(calls[10].args, ['Baalzebub', 35, 6]);

    const selection = calls[6].args[0];
    assert.equal(selection.absolute, false);
    assert.deepEqual(selection.bounds(), { lx: 0, ly: 0, hx: 47, hy: 12 });
    assert.equal(selection.numpoints(), 624); // 48 columns by 13 rows.
});

test('baalz loader keeps fixed monster, object, and trap calls in source order', async () => {
    initRng(42); // Fixed seed only initializes the loader test harness.
    const { calls, des } = recordingDes();
    await baalz(des);

    const objects = calls.filter(({ property }) => property === 'object');
    assert.deepEqual(objects.map(({ args }) => args), [
        ['['], ['['], [')'], [')'], ['*'], ['!'], ['!'], ['?'], ['?'], ['?'],
    ]);
    const traps = calls.filter(({ property }) => property === 'trap');
    assert.deepEqual(traps.map(({ args }) => args), [
        ['spiked pit'], ['fire'], ['sleep gas'], ['anti magic'], ['fire'],
        ['magic'], ['magic'],
    ]);
    const monsters = calls.filter(({ property }) => property === 'monster');
    assert.deepEqual(monsters.map(({ args }) => args), [
        ['Baalzebub', 35, 6],
        ['ghost', 37, 7],
        ['horned devil', 32, 5],
        ['barbed devil', 38, 7],
        ['L'], ['V'], ['V'], ['V'],
    ]);
});
