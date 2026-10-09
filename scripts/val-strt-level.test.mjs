import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { VAL_STRT_LEVEL_MAP } from '../js/val_strt_level_data.js';
import {
    extractValStrtData, renderValStrtData,
} from './generate-val-strt-level.mjs';

const source = readFileSync('nethack-c/upstream/dat/Val-strt.lua', 'utf8');

test('Val-strt generated map preserves all 20 source rows', () => {
    const data = extractValStrtData(source);
    assert.deepEqual(VAL_STRT_LEVEL_MAP, data.rows);
    assert.equal(readFileSync('js/val_strt_level_data.js', 'utf8'),
        renderValStrtData(data));
    assert.equal(data.rows.length, 20);
    assert.ok(data.rows.every(row => row.length === 76));
});

test('Val-strt loader runs every source descriptor and selection operation in order', async () => {
    assert.match(source, /des\.level_flags\("mazelevel", "noteleport", "hardfloor", "icedpools"\)/u);
    assert.match(source, /for i = 1,13 do\s+pools:set\(\)/u);
    assert.match(source, /selection\.grow\(selection\.set\(selection\.new\(\)\), "random"\)/u);
    assert.match(source, /des\.monster\(\{ id = "fire giant", x=10, y=16, peaceful = 0 \}\)/u);

    const calls = [];
    const des = new Proxy({}, { get: (_, name) => async (...args) => {
        calls.push({ name, args });
        if (name === 'monster' && args[0]?.inventory)
            await args[0].inventory();
    } });
    let selectionPoint = 0;
    const directionDraws = [];
    const lua = {
        random: { rn2(limit) {
            directionDraws.push(limit);
            return 0;
        } },
        selection: { set(selection) {
            const x = 4 + selectionPoint % 70;
            const y = 1 + selectionPoint % 18;
            ++selectionPoint;
            selection.set(x, y);
            return selection;
        } },
    };

    const loader = QUEST_LEVEL_LOADERS['Val-strt'];
    assert.equal(typeof loader, 'function');
    await loader(des, {}, lua);

    assert.equal(selectionPoint, 16);
    assert.deepEqual(directionDraws, [4]);
    assert.deepEqual(calls.map(call => call.name), [
        'level_flags', 'level_init', 'terrain', 'terrain', 'map', 'region',
        'levregion', 'stair', 'feature', 'door', 'door',
        'monster', 'object', 'object', 'object',
        ...Array(8).fill('monster'), 'non_diggable',
        ...Array(6).fill('trap'), ...Array(12).fill('monster'),
    ]);
    assert.deepEqual(calls[0].args, ['mazelevel', 'noteleport', 'hardfloor', 'icedpools']);
    assert.deepEqual(calls[1].args, [{ style: 'solidfill', fg: 'I' }]);
    assert.equal(calls[2].args[1], 'P');
    assert.equal(calls[3].args[1], 'L');
    assert.deepEqual(calls[4].args, [VAL_STRT_LEVEL_MAP]);
    assert.deepEqual(calls[6].args, [{ region: [66, 17, 66, 17], type: 'branch' }]);
    assert.deepEqual(calls[7].args, ['down', 18, 1]);
    assert.deepEqual(calls[8].args, ['fountain', 53, 2]);
    assert.deepEqual(calls.slice(9, 11).map(call => call.args), [
        ['locked', 26, 10], ['locked', 43, 10],
    ]);
    assert.deepEqual(calls[11].args[0], {
        id: 'Norn', coord: [35, 10], inventory: calls[11].args[0].inventory,
    });
    assert.deepEqual(calls.slice(12, 15).map(call => call.args[0]), [
        { id: 'banded mail', spe: 5 }, { id: 'long sword', spe: 4 }, 'chest',
    ]);
    assert.deepEqual(calls.at(-2).args, [{ id: 'fire giant', x: 18, y: 1, peaceful: 0 }]);
    assert.deepEqual(calls.at(-1).args, [{ id: 'fire giant', x: 10, y: 16, peaceful: 0 }]);
});
