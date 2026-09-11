import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';

const C_SOURCE = readFileSync('nethack-c/upstream/dat/tower3.lua', 'utf8');

function cMapRows() {
    const match = C_SOURCE.match(/map = \[\[([\s\S]*?)\]\]/u);
    assert.ok(match, 'tower3.lua must contain a map literal');
    return match[1].split('\n').slice(1, -1);
}

function recordingDes() {
    const calls = [];
    const des = new Proxy({}, {
        get(_target, property) {
            return (...args) => calls.push({ property, args });
        },
    });
    return { calls, des };
}

// The source map is 19 columns by 13 rows, including its leading and trailing
// spaces. The whitespace matters because sp_lev.c places every map character.
test('tower3 loader preserves the source map and call order', () => {
    const { calls, des } = recordingDes();
    QUEST_LEVEL_LOADERS.tower3(des);

    const mapCall = calls.find(({ property }) => property === 'map');
    assert.ok(mapCall, 'tower3 loader must call des.map');
    const rows = mapCall.args[0].map.split('\n');
    assert.deepEqual(rows, cMapRows());
    assert.equal(rows.length, 13); // dat/tower3.lua map rows.
    assert.ok(rows.every((row) => row.length === 19)); // map columns.

    assert.deepEqual(
        calls.map(({ property }) => property),
        [
            'level_init', 'level_flags', 'map', 'levregion', 'ladder',
            'door', 'monster', 'monster', 'monster', 'monster', 'monster',
            'monster', 'monster', 'monster', 'monster', 'object', 'trap',
            'object', 'trap', 'object', 'trap', 'object', 'trap',
            'non_diggable',
        ],
    );
});

test('tower3 loader supplies its fixed descriptors', () => {
    const { calls, des } = recordingDes();
    QUEST_LEVEL_LOADERS.tower3(des);

    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]);
    assert.deepEqual(calls[1].args,
                     ['mazelevel', 'noteleport', 'hardfloor', 'solidify']);
    assert.deepEqual(calls[3].args,
                     [{ type: 'branch', region: [2, 5, 2, 5] }]);
    assert.deepEqual(calls[4].args, [{ dir: 'up', coord: [5, 7] }]);
    assert.deepEqual(calls[5].args,
                     [{ state: 'locked', coord: [14, 5] }]);

    const monsterCalls = calls.filter(({ property }) => property === 'monster');
    assert.deepEqual(monsterCalls.slice(0, 3).map(({ args }) => args), [
        ['D', 13, 5],
        [{ x: 12, y: 4 }],
        [{ x: 12, y: 6 }],
    ]);
    assert.equal(monsterCalls.length, 9); // one dragon, two coordinates, six random.
    assert.deepEqual(
        calls.filter(({ property }) => property === 'object')
            .map(({ args }) => args),
        [
            ['long sword', [3, 3]],
            ['lock pick', [5, 1]],
            ['elven cloak', [9, 1]],
            ['blindfold', [13, 1]],
        ],
    );
    assert.equal(calls.filter(({ property }) => property === 'trap').length, 4);
    assert.equal(calls.filter(({ property }) => property === 'non_diggable').length, 1);
});
