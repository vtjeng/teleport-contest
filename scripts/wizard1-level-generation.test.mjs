import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { HWALL } from '../js/const.js';
import { initRng } from '../js/rng.js';
import { WIZARD1_LEVEL_LOADERS, wizard1 } from '../js/wizard1_levels.js';

const LUA_SOURCE = readFileSync('nethack-c/upstream/dat/wizard1.lua', 'utf8');

function sourceMap() {
    const match = LUA_SOURCE.match(/map\s*=\s*\[\[([\s\S]*?)\]\]/u);
    assert.ok(match, 'wizard1.lua must contain a map literal');
    return match[1].split('\n').slice(1, -1).join('\n');
}

function testState() {
    const level = new GameMap();
    // mazegrid's initial '-' background makes selection.match('-') cover the
    // playable columns; the x=0 edge remains the off-limits stone boundary.
    for (let x = 1; x < 80; ++x) {
        for (let y = 0; y < 21; ++y) level.at(x, y).typ = HWALL;
    }
    return {
        level,
        u: { uz: { dnum: 1, dlevel: 41 } },
        dungeons: [{ depth_start: 1 }, { depth_start: 1 }],
    };
}

function recordingDes() {
    const calls = [];
    const des = {
        frame: { xstart: 1, ystart: 0 },
        random: {
            rn2(bound) {
                calls.push({ property: 'rn2', args: [bound] });
                // The source door chooses its second wall here; hell_tweaks'
                // four 100-sided draws then skip every optional branch.
                return bound === 3 ? 1 : 99;
            },
        },
    };
    const methods = [
        'level_init', 'level_flags', 'region', 'door', 'levregion',
        'teleport_region', 'mazewalk', 'ladder', 'non_diggable',
        'non_passwall', 'monster', 'object', 'trap', 'terrain',
    ];
    for (const property of methods) {
        des[property] = (...args) => {
            calls.push({ property, args });
            const specification = args[0];
            if (property === 'region'
                && typeof specification?.contents === 'function') {
                specification.contents();
            }
        };
    }
    des.map = (specification) => {
        calls.push({ property: 'map', args: [specification] });
        specification.contents();
        // center alignment in the 78x20 maze area places this 29x13 map at
        // (25,5), which is also the frame used by map-relative descriptors.
        return { xstart: 25, ystart: 5, xsize: 29, ysize: 13 };
    };
    return { calls, des };
}

test('Wizard1 loader is registered and preserves the source map', async () => {
    initRng(42); // Hell-tweak draws are skipped by the descriptor harness.
    assert.equal(typeof WIZARD1_LEVEL_LOADERS.wizard1, 'function');
    const { calls, des } = recordingDes();
    await wizard1(des, testState());

    const map = calls.find(({ property }) => property === 'map');
    assert.ok(map, 'wizard1 loader must call des.map');
    assert.equal(map.args[0].map, sourceMap());
    const rows = map.args[0].map.split('\n');
    assert.equal(rows.length, 13); // dat/wizard1.lua map rows.
    assert.ok(rows.every((row) => row.length === 29)); // map columns.
    assert.equal(map.args[0].halign, 'center');
    assert.equal(map.args[0].valign, 'center');
});

test('Wizard1 keeps map callback descriptors and hell tweaks in source order', async () => {
    initRng(42); // Hell-tweak draws are skipped by the descriptor harness.
    const { calls, des } = recordingDes();
    await wizard1(des, testState());

    const properties = calls
        .filter(({ property }) => property !== 'rn2')
        .map(({ property }) => property);
    assert.deepEqual(properties, [
        'level_init', 'level_flags', 'map',
        ...Array(3).fill('levregion'), 'teleport_region',
        'region', 'door', 'region', 'mazewalk', 'ladder',
        ...Array(4).fill('non_diggable'),
        ...Array(4).fill('non_passwall'),
        ...Array(3).fill('monster'), 'object', ...Array(16).fill('monster'),
        ...Array(8).fill('trap'), ...Array(8).fill('object'),
    ]);

    const regions = calls.filter(({ property }) => property === 'region');
    assert.deepEqual(regions.map(({ args }) => args[0]), [
        {
            region: [12, 1, 20, 9], lit: 0, type: 'morgue', filled: 2,
            contents: regions[0].args[0].contents,
        },
        { region: [1, 1, 10, 11], lit: 0, type: 'ordinary', arrival_room: true },
    ]);
    assert.deepEqual(calls.find(({ property }) => property === 'door').args, [
        { wall: 'west', state: 'secret' },
    ]);
    assert.deepEqual(calls.filter(({ property }) => property === 'levregion')
        .map(({ args }) => args[0]), [
        {
            type: 'stair-up', region: [1, 0, 79, 20], region_islev: 1,
            exclude: [0, 0, 28, 12],
        },
        {
            type: 'stair-down', region: [1, 0, 79, 20], region_islev: 1,
            exclude: [0, 0, 28, 12],
        },
        {
            type: 'branch', region: [1, 0, 79, 20], region_islev: 1,
            exclude: [0, 0, 28, 12],
        },
    ]);
    assert.deepEqual(calls.find(({ property }) => property === 'ladder').args,
        ['down', 6, 5]);
});
