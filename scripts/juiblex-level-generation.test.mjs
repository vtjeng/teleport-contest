import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { juiblex } from '../js/juiblex_levels.js';
import { initRng } from '../js/rng.js';

const LUA_SOURCE = readFileSync('nethack-c/upstream/dat/juiblex.lua', 'utf8');

function recordingDes() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, property) {
            return (...args) => calls.push({ property, args });
        },
    });
    return { calls, des };
}

function sourceMaps() {
    const auxiliary = [...LUA_SOURCE.matchAll(
        /map\s*=\s*\[\[([\s\S]*?)\]\]/gu,
    )].map(({ 1: map }) => map.split('\n').slice(1, -1).join('\n'));
    const lair = LUA_SOURCE.match(
        /des\.map\(\[\[([\s\S]*?)\]\]\);\n-- Random/u,
    );
    assert.ok(lair, 'juiblex.lua must contain the lair map literal');
    return [...auxiliary, lair[1].split('\n').slice(1, -1).join('\n')];
}

function mapArgument(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.join('\n');
    return value.map;
}

// The level has two five-by-eight auxiliary maps and one 18-by-51 lair map.
// Comparing all three literals catches dropped whitespace and row shifts.
test('juiblex loader preserves source maps and descriptor order', async () => {
    initRng(42); // Fixed seed only initializes selection:rndcoord in this stub.
    const { calls, des } = recordingDes();
    await juiblex(des);

    const mapCalls = calls.filter(({ property }) => property === 'map');
    assert.equal(mapCalls.length, 3);
    assert.deepEqual(
        mapCalls.map(({ args }) => mapArgument(args[0])),
        sourceMaps(),
    );
    assert.deepEqual(
        mapCalls.map(({ args }) => typeof args[0] === 'string'
            ? args[0] : Array.isArray(args[0])
                ? sourceMaps()[2]
                : [args[0].halign, args[0].valign]),
        [
            ['left', 'bottom'],
            ['right', 'top'],
            sourceMaps()[2],
        ],
    );

    // The source has seven fixed monsters before five fixed liquid/gem
    // objects, then 26 blobby/random monsters, seven random objects, and six
    // traps. Keeping these counts adjacent to the source-order assertion
    // catches accidental loop reordering.
    assert.deepEqual(calls.map(({ property }) => property), [
        'level_flags', 'level_init', 'map', 'object', 'map', 'object',
        'map', 'shuffle', 'region', 'levregion', 'levregion', 'levregion',
        'teleport_region', 'teleport_region', 'feature', 'monster',
        'monster', 'monster', 'monster', 'monster', 'monster', 'monster',
        'object', 'object', 'object', 'object', 'object',
        ...Array(26).fill('monster'),
        ...Array(7).fill('object'),
        ...Array(6).fill('trap'),
    ]);
});

// The random registers select four blob classes through one Fisher-Yates
// shuffle; the test pins its source shape without depending on one RNG seed.
test('juiblex loader shuffles the four source monster classes', async () => {
    initRng(42); // Fixed seed only initializes selection:rndcoord in this stub.
    const { calls, des } = recordingDes();
    await juiblex(des);

    const shuffle = calls.find(({ property }) => property === 'shuffle');
    assert.deepEqual(shuffle.args, [['j', 'b', 'P', 'F']]);
});
