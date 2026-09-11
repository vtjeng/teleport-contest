import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { GameMap } from '../js/game.js';
import { HWALL } from '../js/const.js';
import { initRng } from '../js/rng.js';
import { WIZARD2_LEVEL_LOADERS, wizard2 } from '../js/wizard2_levels.js';

const LUA_SOURCE = readFileSync('nethack-c/upstream/dat/wizard2.lua', 'utf8');

function sourceMap() {
    const match = LUA_SOURCE.match(/map\s*=\s*\[\[([\s\S]*?)\]\]/u);
    assert.ok(match, 'wizard2.lua must contain a map literal');
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
        u: { uz: { dnum: 1, dlevel: 37 } },
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
        // Center alignment in the 78x20 maze area places this 29x13 map at
        // (25,5), which is also the frame used by map-relative descriptors.
        return { xstart: 25, ystart: 5, xsize: 29, ysize: 13 };
    };
    return { calls, des };
}

test('Wizard2 loader is registered and preserves the source map', async () => {
    initRng(42); // Hell-tweak draws are skipped by the descriptor harness.
    assert.equal(typeof WIZARD2_LEVEL_LOADERS.wizard2, 'function');
    const { calls, des } = recordingDes();
    await wizard2(des, testState());

    const map = calls.find(({ property }) => property === 'map');
    assert.ok(map, 'wizard2 loader must call des.map');
    assert.equal(map.args[0].map, sourceMap());
    const rows = map.args[0].map.split('\n');
    assert.equal(rows.length, 13); // dat/wizard2.lua map rows.
    assert.ok(rows.every((row) => row.length === 29)); // map columns.
    assert.equal(map.args[0].halign, 'center');
    assert.equal(map.args[0].valign, 'center');
});

test('Wizard2 keeps map callback descriptors and hell tweaks in source order', async () => {
    initRng(42); // Hell-tweak draws are skipped by the descriptor harness.
    const { calls, des } = recordingDes();
    await wizard2(des, testState());

    const properties = calls
        .filter(({ property }) => property !== 'rn2')
        .map(({ property }) => property);
    assert.deepEqual(properties, [
        'level_init', 'level_flags', 'map',
        ...Array(3).fill('levregion'), 'teleport_region',
        ...Array(2).fill('region'), ...Array(2).fill('door'), 'mazewalk',
        ...Array(2).fill('ladder'), 'non_diggable', 'non_passwall',
        ...Array(4).fill('trap'), ...Array(6).fill('object'),
    ]);

    assert.deepEqual(calls.filter(({ property }) => property === 'region')
        .map(({ args }) => args[0]), [
        {
            region: [1, 1, 26, 11], lit: 0, type: 'ordinary',
            arrival_room: true,
        },
        { region: [9, 3, 17, 9], lit: 0, type: 'zoo', filled: 1 },
    ]);
    assert.deepEqual(calls.filter(({ property }) => property === 'door')
        .map(({ args }) => args), [
        ['closed', 15, 2],
        ['closed', 11, 10],
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
    assert.deepEqual(calls.filter(({ property }) => property === 'ladder')
        .map(({ args }) => args), [
        ['up', 12, 1],
        ['down', 14, 11],
    ]);
});
