import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { QUEST_LEVEL_LOADERS } from '../js/quest_levels.js';
import { CAV_STRT_LEVEL_MAP } from '../js/cav_strt_level_data.js';
import { extractCavStrtMap, renderCavStrtMap } from './generate-cav-strt-level.mjs';

const SOURCE = readFileSync('nethack-c/upstream/dat/Cav-strt.lua', 'utf8');

function descriptors() {
    const calls = [];
    const des = {};
    for (const property of ['level_init', 'level_flags', 'map', 'region',
        'stair', 'levregion', 'door', 'altar', 'monster', 'object',
        'non_diggable', 'trap', 'wallify']) {
        des[property] = async (...args) => {
            calls.push({ property, args });
            // lspo_monster executes inventory before the following descriptor.
            if (typeof args[0]?.inventory === 'function') await args[0].inventory();
        };
    }
    return { des, calls };
}

test('Cav-strt generated map preserves every source row and space', () => {
    const rows = extractCavStrtMap(SOURCE);
    assert.deepEqual(CAV_STRT_LEVEL_MAP, rows);
    assert.equal(rows.length, 20); // Cav-strt.lua18–36 and the first blank row.
    assert.ok(rows.every(row => row.length === 76)); // Source map width, including spaces.
    assert.equal(rows[0], ' '.repeat(76)); // Source starts with a full stone row.
    assert.equal(rows.at(-1), ' '.repeat(76)); // Source ends with a full stone row.
    assert.equal(readFileSync('js/cav_strt_level_data.js', 'utf8'), renderCavStrtMap(rows));
    assert.throws(() => extractCavStrtMap('des.map(".")'), /no des.map block/u);
});

test('Cav-strt loader keeps every descriptor and inventory callback in source order', async () => {
    assert.equal(typeof QUEST_LEVEL_LOADERS['Cav-strt'], 'function');
    const { des, calls } = descriptors();
    await QUEST_LEVEL_LOADERS['Cav-strt'](des);
    assert.deepEqual(calls.map(c => c.property), [
        'level_init', 'level_flags', 'map', ...Array(8).fill('region'),
        'stair', 'levregion', 'door', 'altar', 'monster',
        ...Array(3).fill('object'), ...Array(8).fill('monster'),
        'non_diggable', ...Array(6).fill('trap'), ...Array(12).fill('monster'), 'wallify',
    ]); // Source13–94: inventory's two objects precede the floor chest and guards.
    assert.deepEqual(calls[0].args, [{ style: 'solidfill', fg: ' ' }]);
    assert.deepEqual(calls[1].args, ['mazelevel', 'noteleport', 'hardfloor']);
    assert.deepEqual(calls[2].args[0], CAV_STRT_LEVEL_MAP);
    const regions = calls.filter(c => c.property === 'region');
    assert.deepEqual(regions[0].args[0].bounds(), { lx: 0, ly: 0, hx: 75, hy: 19 });
    assert.equal(regions[0].args[1], 'unlit'); // Source39 starts with all-map darkness.
    assert.deepEqual(regions.slice(1).map(c => c.args[0]), [
        { region: [13, 1, 40, 5], lit: 1, type: 'temple', filled: 1, irregular: 1 },
        ...[[2, 1, 8, 3], [1, 11, 6, 14], [13, 8, 18, 10],
            [5, 17, 14, 18], [17, 16, 23, 18], [35, 16, 44, 18]]
            .map(region => ({ region, lit: 1, type: 'ordinary', irregular: 1 })),
    ]); // Source40–47 preserves the seven separate flood-filled regions.
    assert.deepEqual(calls.find(c => c.property === 'stair').args, ['down', 2, 3]);
    assert.deepEqual(calls.find(c => c.property === 'levregion').args,
        [{ region: [71, 9, 71, 9], type: 'branch' }]); // Source51 branch arrival point.
    assert.deepEqual(calls.find(c => c.property === 'door').args, ['locked', 19, 6]);
    assert.deepEqual(calls.find(c => c.property === 'altar').args,
        [{ x: 36, y: 2, align: 'coaligned', type: 'shrine' }]); // Source55 priest creation.
    const monsters = calls.filter(c => c.property === 'monster');
    assert.deepEqual(monsters[0].args[0], { id: 'Shaman Karnov', coord: [35, 2],
        inventory: monsters[0].args[0].inventory });
    assert.deepEqual(calls.filter(c => c.property === 'object').map(c => c.args), [
        [{ id: 'leather armor', spe: 5 }], [{ id: 'club', spe: 5 }], ['chest', 34, 2],
    ]); // Source58–62 equips +5 armor/club before the separate floor chest.
    assert.deepEqual(monsters.slice(1, 9).map(c => c.args),
        [[20, 3], [20, 2], [20, 1], [21, 3], [21, 2], [21, 1], [22, 1], [26, 9]]
            .map(([x, y]) => ['neanderthal', x, y])); // Source64–71 audience guards.
    assert.deepEqual(monsters.slice(9).map(c => c.args[0]),
        [[47, 2], [48, 3], [49, 4], [67, 3], [69, 4], [51, 13],
            [53, 14], [55, 15], [63, 10], [65, 9], [67, 10], [69, 11]]
            .map(([x, y]) => ({ id: 'bugbear', x, y, peaceful: 0 }))); // Source82–93.
    assert.deepEqual(calls.find(c => c.property === 'non_diggable').args[0].bounds(),
        { lx: 0, ly: 0, hx: 75, hy: 19 }); // Source73 protects the entire cave map.
    assert.deepEqual(calls.filter(c => c.property === 'trap').map(c => c.args),
        [['pit', 47, 11], ['pit', 57, 10], [], [], [], []]); // Source75–80.
    assert.deepEqual(calls.at(-1), { property: 'wallify', args: [] }); // Source94, last.
});
