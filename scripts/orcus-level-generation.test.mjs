import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { orcus } from '../js/orcus_levels.js';
import { initRng } from '../js/rng.js';

const LUA_SOURCE = readFileSync('nethack-c/upstream/dat/orcus.lua', 'utf8');

function sourceMap() {
    const match = LUA_SOURCE.match(/map\s*=\s*\[\[([\s\S]*?)\]\]/u);
    assert.ok(match, 'orcus.lua must contain a map literal');
    return match[1].split('\n').slice(1, -1).join('\n');
}

function recordingDes(randomValue = 99) {
    const calls = [];
    const des = {
        frame: { xstart: 1, ystart: 0 },
        random: { rn2(limit) {
            calls.push({ property: 'rn2', args: [limit] });
            return randomValue;
        } },
    };
    const methods = [
        'level_init', 'level_flags', 'region', 'stair', 'object', 'door',
        'altar', 'trap', 'monster', 'levregion', 'teleport_region',
        'mazewalk', 'terrain',
    ];
    for (const property of methods) {
        des[property] = (...args) => {
            calls.push({ property, args });
            if (property === 'map') return null;
        };
    }
    des.map = (spec) => {
        calls.push({ property: 'map', args: [spec] });
        spec.contents();
        return { xstart: 20, ystart: 2, xsize: 45, ysize: 17 };
    };
    return { calls, des };
}

function testState() {
    return {
        u: { uz: { dnum: 1, dlevel: 20 } },
        // A depth of 20 makes seed 1's first four hell-tweak rolls skip all
        // optional branches while leaving the level shape irrelevant here.
        dungeons: [{ depth_start: 1 }, { depth_start: 1 }],
        level: new GameMap(),
    };
}

// The source has one 45-column by 17-row map. Comparing the complete literal
// catches dropped punctuation, trailing dots, and row shifts in this maze.
test('orcus loader preserves the source map and map placement', async () => {
    initRng(1); // First hell-tweak roll is 45, so all four optional arms skip.
    const { calls, des } = recordingDes();
    await orcus(des, testState());

    const map = calls.find(({ property }) => property === 'map');
    assert.ok(map, 'orcus loader must call des.map');
    assert.equal(map.args[0].map, sourceMap());
    assert.equal(map.args[0].halign, 'right');
    assert.equal(map.args[0].valign, 'center');
    assert.equal(map.args[0].map.split('\n').length, 17); // source rows.
    assert.ok(map.args[0].map.split('\n').every((row) => row.length === 45));
});

// The map callback's fixed features and the outer exits must stay in source
// order because object, monster, trap, and hell-tweak calls consume RNG.
test('orcus loader keeps fixed descriptors and random populations ordered', async () => {
    initRng(1); // Keep this descriptor test independent of random hell tweaks.
    const { calls, des } = recordingDes();
    await orcus(des, testState());

    const properties = calls
        .filter(({ property }) => property !== 'rn2')
        .map(({ property }) => property);
    assert.deepEqual(properties, [
        'level_init', 'level_flags', 'map', 'mazewalk', 'region', 'stair',
        ...Array(24).fill('object'), ...Array(16).fill('door'), 'altar',
        'region', 'region', 'region', ...Array(8).fill('trap'),
        ...Array(11).fill('object'),
        ...Array(8).fill('monster'), ...Array(23).fill('monster'),
        ...Array(5).fill('monster'), 'levregion', 'levregion',
        'teleport_region',
    ]);

    const stair = calls.find(({ property }) => property === 'stair');
    assert.deepEqual(stair.args, ['down', 33, 15]);
    const regions = calls.filter(({ property }) => property === 'region');
    assert.equal(regions[0].args[0].absolute, false);
    assert.equal(regions[0].args[0].numpoints(), 44 * 17); // source area.
    assert.equal(regions[0].args[1], 'unlit');
    assert.deepEqual(regions.slice(1).map(({ args }) => args), [
        [{ region: [22, 12, 25, 16], lit: 0, type: 'morgue', filled: 1 }],
        [{ region: [32, 9, 37, 12], lit: 1, type: 'shop', filled: 1 }],
        [{ region: [12, 0, 15, 4], lit: 1, type: 'shop', filled: 1 }],
    ]);
});

// math.random(0, 1) maps to rn2(2), and both outcomes retain the source
// object's exact name. The test chooses each outcome without relying on the
// global game seed.
test('orcus compensation item follows its one random draw', async () => {
    for (const [randomValue, expected] of [[0, 'magic lamp'], [1, 'magic marker']]) {
        initRng(1); // Keep hell_tweaks outside its optional branches.
        const { calls, des } = recordingDes(randomValue);
        await orcus(des, testState());
        const namedObjects = calls.filter(({ property, args }) =>
            property === 'object' && args.length > 0);
        assert.equal(namedObjects.at(-1).args[0], expected);
        const markerDraw = calls.find(({ property, args }) =>
            property === 'rn2' && args[0] === 2);
        assert.ok(markerDraw, 'compensation item must draw rn2(2)');
    }
});
